(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreRefiner) return;

  const DEFAULT_PROMPT = `You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited RP)

## Scope
You receive:
- [Lore]: partial character/world data (NOT exhaustive — may be missing characters, locations, or rules that exist in the RP system prompt you cannot see)
- [Summaries]: memory snapshots from the chat platform
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response to check

You do NOT have the RP system prompt. You cannot see character definitions, world rules, or narration instructions the RP AI operates under.

## Core Rule
Your ONLY evidence sources are [Lore] and [Summaries].
Absence of information is NOT evidence of error.
An error exists ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error

1. EXPLICIT FACTUAL CONTRADICTION
   [New Speech] states something that is the logical opposite of an explicit fact in [Lore] or [Summaries].
   - Lore: "A와 B는 자매" → Speech: "A와 B는 연인" → error
   - Lore: "C는 사망" → Speech: C acting alive → error
   - Lore has no entry for character D → Speech mentions D → NOT an error

2. PRESENCE / ABSENCE CONTRADICTION
   A character is present in [New Speech] who is explicitly stated as absent, dead, or otherwise unable to be there according to [Lore] or [Summaries]. Or vice versa: a character explicitly stated to be present is missing from a scene where [Lore] confirms they must be.
   - Lore: "C는 해외 출장 중" → Speech: C가 국내 카페에 등장 → error
   - No location data for C → C appears anywhere → NOT an error

3. NICKNAME / TITLE MISMATCH
   A character uses or is called a 호칭 that contradicts a 호칭 explicitly defined in [Lore] (especially relationship entries with nicknames fields).
   - Lore: A→B 호칭 "언니" → Speech: A calls B "누나" → error
   - No 호칭 defined for a pair → any 호칭 → NOT an error

4. STATE CONTRADICTION
   A character's physical/emotional state in [New Speech] contradicts their current_state in [Lore].
   - Lore: "A: 왼팔 부상" → Speech: A swings a sword with left arm → error
   - No state recorded → any state → NOT an error

5. PROMISE / ARC CONTRADICTION
   [New Speech] references a promise, contract, or relationship milestone whose status contradicts [Lore] or [Summaries].
   - Lore promise status: "pending" → Speech: "약속을 지켜줘서 고마워" → error
   - Lore relationship arc shows phase "hostile" as latest → Speech treats them as allies without transition → error
   - No promise/arc data → any reference → NOT an error

## What is NEVER an Error
- Characters, locations, items, abilities, or events NOT mentioned in [Lore] or [Summaries]. They may exist in the RP system prompt.
- Writing style, tone, vocabulary, sentence structure, narration voice.
- Markdown formatting, line breaks, decorative elements.
- Content that is new, unexpected, or creative but not contradicted by evidence.
- Emotional or narrative choices that differ from what you might expect.

## Truncation Repair

Token limits may cut [New Speech] short. Two cases:

A) SENTENCE TRUNCATION
   [New Speech] ends mid-word or mid-clause. Complete ONLY the final interrupted sentence using [Recent Context] as reference. Do not add new narrative content.

B) STATUS BLOCK TRUNCATION
   Some RPs use a fenced code block as a status display at the end of each turn.
   - If [Recent Context] contains a complete status block AND [New Speech] has a truncated or absent status block → restore it.
   - Template: use the MOST RECENT complete status block from [Recent Context].
   - Update only values that [New Speech] content logically changes (e.g., HP after damage). Keep all other values unchanged.
   - If NO status block exists anywhere in [Recent Context] → do nothing.

## Principle
Make the MINIMUM surgical fix. Preserve everything else byte-for-byte. If uncertain whether something is an error, it is NOT an error — PASS.

## Decision Process
For each potential issue:
1. Can I point to a SPECIFIC statement in [Lore] or [Summaries] that this contradicts?
2. YES → flag it.
3. NO (including "no data exists") → PASS.

## Output Format
Reason MUST be in Korean.

No issues and no truncation repair needed:
{passWord}

Issues or repairs found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

Rules for replacements:
- "from" must be an EXACT character-by-character substring of [New Speech].
- "to" is the minimal corrected version.
- Change only what is wrong. Do not rewrite surrounding text.
- Multiple fixes = multiple objects in the array.
- For truncation: "from" = incomplete fragment, "to" = completed version.

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`;

  let Core = null;
  let ConfigGetter = null;
  let LogCallback = null;
  let ToastCallback = null;
  let GetActivePacksCallback = null;

  const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
  const _PROCESSED_KEY = 'speech-refiner-processed';
  const processedFingerprints = new Set();
  try {
    const saved = _ls.getItem(_PROCESSED_KEY);
    if (saved) JSON.parse(saved).forEach(fp => processedFingerprints.add(fp));
  } catch (e) {}

  function saveProcessedFingerprints() {
    const arr = Array.from(processedFingerprints).slice(-30);
    try { _ls.setItem(_PROCESSED_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // DOM 헬퍼
  function stripMarkdown(text) {
    return text
      .replace(/```\w*\n?/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function findDeepestMatchingElement(searchPlainText) {
    const snippet = (searchPlainText.length > 20 ? searchPlainText.slice(-20) : searchPlainText).trim();
    if (!snippet || snippet.length < 5) return null;

    let best = null;
    let bestScore = Infinity;

    const all = document.querySelectorAll('div, p, article, section, span');
    for (const el of all) {
      const text = el.textContent;
      if (!text || !text.includes(snippet)) continue;
      if (el.tagName === 'BODY' || el.tagName === 'HTML') continue;
      if (el.id === '__next' || el.id === 'root') continue;

      const childCount = el.querySelectorAll('*').length;
      const score = text.length + childCount * 50;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  }

  function tryPatchReactFiber(element, originalText, newText) {
    try {
      const fiberKey = Object.keys(element).find(k =>
        k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      );
      if (!fiberKey) return;

      const matchSnippet = stripMarkdown(originalText).slice(0, 40);
      let fiber = element[fiberKey];
      let depth = 0;

      while (fiber && depth < 20) {
        for (const propSet of [fiber.memoizedProps, fiber.pendingProps]) {
          if (!propSet || typeof propSet !== 'object') continue;
          for (const key of Object.keys(propSet)) {
            const val = propSet[key];
            if (typeof val === 'string' && val.length > 30 &&
                (val.includes(matchSnippet) || val === originalText)) {
              propSet[key] = newText;
            }
          }
          if (propSet.dangerouslySetInnerHTML?.__html &&
              propSet.dangerouslySetInnerHTML.__html.includes(matchSnippet)) {
            propSet.dangerouslySetInnerHTML.__html = (typeof marked !== 'undefined')
              ? marked.parse(newText, { breaks: false, gfm: true })
              : newText;
          }
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (e) {}
  }

  function renderMarkdownHTML(mdText) {
    if (typeof marked !== 'undefined' && marked.parse) {
      return marked.parse(mdText, { breaks: false, gfm: true });
    }
    return mdText
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function triggerSWRRevalidation() {
    try {
      const origDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
                    || Object.getOwnPropertyDescriptor(document, 'visibilityState');

      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      setTimeout(() => {
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('online'));

        setTimeout(() => {
          try {
            if (origDesc) Object.defineProperty(Document.prototype, 'visibilityState', origDesc);
            else delete document.visibilityState;
          } catch (_) {}
        }, 200);
      }, 100);
    } catch (e) {}
  }

  function refreshMessageInDOM(originalText, newText) {
    const oldPlain = stripMarkdown(originalText);
    const newPlain = stripMarkdown(newText);
    const oldSnippet = (oldPlain.length > 30 ? oldPlain.slice(-30) : oldPlain).trim();
    const newSnippet = (newPlain.length > 30 ? newPlain.slice(-30) : newPlain).trim();
    const renderedHTML = renderMarkdownHTML(newText);
    let targetEl = null;

    function tryApply() {
      if (targetEl && document.contains(targetEl)) {
        const cur = (targetEl.textContent || '').trim();
        if (newSnippet && cur.includes(newSnippet) && (!oldSnippet || !cur.includes(oldSnippet))) return 'done';
        if (oldSnippet && cur.includes(oldSnippet)) {
          targetEl.innerHTML = renderedHTML;
          tryPatchReactFiber(targetEl, originalText, newText);
          return 'applied';
        }
      }
      targetEl = findDeepestMatchingElement(oldPlain);
      if (targetEl) {
        targetEl.innerHTML = renderedHTML;
        tryPatchReactFiber(targetEl, originalText, newText);
        return 'applied';
      }
      const checkEl = findDeepestMatchingElement(newPlain);
      if (checkEl) return 'done';
      return 'not_found';
    }

    const firstResult = tryApply();
    if (firstResult === 'done') return true;

    let pollCount = 0;
    const timer = setInterval(() => {
      pollCount++;
      if (pollCount >= 20) { clearInterval(timer); return; }
      if (tryApply() === 'done') clearInterval(timer);
    }, 500);

    triggerSWRRevalidation();
    return firstResult === 'applied';
  }

  // UI
  function showRefineConfirm(reason, refinedText, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.id = 'refiner-confirm-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;box-sizing:border-box;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:8px;width:100%;max-width:400px;padding:20px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;';

    const title = document.createElement('div');
    title.textContent = '✏️ AI 응답 교정 제안';
    title.style.cssText = 'font-size:16px;font-weight:bold;color:#4a9;margin-bottom:4px;';

    const reasonTitle = document.createElement('div');
    reasonTitle.textContent = '교정 이유:';
    reasonTitle.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;';
    const reasonText = document.createElement('div');
    reasonText.textContent = reason;
    reasonText.style.cssText = 'font-size:13px;color:#ccc;background:#222;padding:8px;border-radius:4px;';

    const refTitle = document.createElement('div');
    refTitle.textContent = '수정된 응답:';
    refTitle.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;margin-top:8px;';

    const refTa = document.createElement('textarea');
    refTa.value = refinedText;
    refTa.style.cssText = 'width:100%;height:100px;background:#0a0a0a;color:#fff;border:1px solid #444;border-radius:4px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:12px;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = '원본 유지';
    btnCancel.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#444;color:#ccc;cursor:pointer;font-weight:bold;';
    btnCancel.onclick = () => { document.body.removeChild(overlay); onCancel(); };

    const btnConfirm = document.createElement('button');
    btnConfirm.textContent = '교정본 변경';
    btnConfirm.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#285;color:#fff;cursor:pointer;font-weight:bold;';
    btnConfirm.onclick = () => { document.body.removeChild(overlay); onConfirm(refTa.value); };

    btnRow.appendChild(btnCancel); btnRow.appendChild(btnConfirm);
    box.appendChild(title); box.appendChild(reasonTitle); box.appendChild(reasonText);
    box.appendChild(refTitle); box.appendChild(refTa); box.appendChild(btnRow);
    overlay.appendChild(box); document.body.appendChild(overlay);
  }

  function renderLoreForRefiner(entries) {
    const L = {personality:'성격',attributes:'특성',abilities:'능력',current_state:'현재',last_interaction:'최근',current_status:'현재 상태',nicknames:'호칭',relations:'관계',background_or_history:'배경',maker:'약속자',target:'대상',condition:'발동 조건',status:'상태',resolution:'결과',parties:'관계자',ingredients:'재료',steps:'순서',tips:'참고',rules:'규칙',effects:'효과'};
    return entries.map(e => {
      const d = e.detail || {};
      let line = '[' + (e.type||'entity') + '] ' + e.name + ': ' + (e.summary||'');
      for (const [k, v] of Object.entries(d)) {
        if (v == null || v === '') continue;
        const lb = L[k] || k;
        if (Array.isArray(v)) {
          if (!v.length) continue;
          line += ' | ' + lb + ': ' + (typeof v[0]==='object' ? v.map(x=>Object.values(x).filter(Boolean).join(' / ')).join(' → ') : v.join(', '));
        } else if (typeof v === 'object') {
          const f = Object.entries(v).map(([a,b])=>a+': '+b).join(', ');
          if (f) line += ' | ' + lb + ': ' + f;
        } else line += ' | ' + lb + ': ' + String(v);
      }
      return line;
    }).join('\n');
  }

  function matchEntriesByTrigger(entries, recentMsgs, text) {
    const pool = [text.toLowerCase(), ...recentMsgs.map(m => (m.message || '').toLowerCase())].join(' ');
    return entries.filter(e => {
      if (!e.triggers || !e.triggers.length) return false;
      for (const t of e.triggers) {
        if (!t || t.length < 2) continue;
        if (t.split('&&').map(p => p.trim().toLowerCase()).every(p => pool.includes(p))) return true;
      }
      return false;
    });
  }

  // 메인 로직
  async function refineMessage(assistantText) {
    const config = ConfigGetter();
    if (!config.refinerEnabled) return;

    Core.showStatusBadge('응답 검수 중...');
    const chatRoomId = Core.getCurrentChatId();
    if (!chatRoomId) { Core.hideStatusBadge(); return; }
    const url = Core.getCurUrl();

    // 1. 로어
    let loreText = '활성화된 로어 없음.';
    let activeEntries = [];
    if (GetActivePacksCallback) {
      try {
        const activePacks = GetActivePacksCallback(url);
        if (activePacks.length > 0) {
          const db = Core.getDB();
          const entries = await db.entries.toArray();
          activeEntries = entries.filter(e => activePacks.includes(e.packName));
        }
      } catch (e) {}
    }

    if (activeEntries.length > 0) {
      const matchTurns = config.refinerMatchTurns || 5;
      const _tMsgs = await Core.fetchLogs(Math.max(4, matchTurns * 2));
      const autoPacks = config.autoPacks || ['자동추출'];
      const _fE = activeEntries.filter(x => !autoPacks.includes(x.packName));
      const _aE = activeEntries.filter(x => autoPacks.includes(x.packName));
      const _mF = matchEntriesByTrigger(_fE, _tMsgs, assistantText);
      const _mA = matchEntriesByTrigger(_aE, _tMsgs, assistantText);
      const _lE = config.refinerLoreMode === 'matchedOnly' ? [..._mF, ..._mA] : [..._mF, ..._aE];
      if (_lE.length > 0) loreText = renderLoreForRefiner(_lE);
      else loreText = '(키워드 매칭된 로어 없음)';
    }

    // 2. 메모리
    Core.showStatusBadge('메모리 수집 중...');
    let memoryText = '메모리 없음.';
    try {
      const mems = await Core.fetchAllMemories(chatRoomId);
      const parts = [];
      if (mems.goal?.length) parts.push(`[목표]:\n${mems.goal.join('\n')}`);
      if (mems.shortTerm?.length) parts.push(`[단기기억]:\n${mems.shortTerm.join('\n')}`);
      if (mems.longTerm?.length) parts.push(`[장기기억]:\n${mems.longTerm.join('\n')}`);
      if (mems.relationship?.length) parts.push(`[관계도]:\n${mems.relationship.join('\n')}`);
      if (parts.length > 0) memoryText = parts.join('\n\n');
    } catch (e) {}

    // 3. 컨텍스트
    let contextText = '최근 대화 내역 없음.';
    const turns = config.refinerContextTurns || 1;
    if (turns > 0) {
      const recentMsgs = await Core.fetchLogs(turns * 2);
      if (recentMsgs && recentMsgs.length > 0) {
        contextText = recentMsgs.map(m => `${m.role}: ${m.message}`).join('\n\n');
      }
    }

    // 4. 검수 요청
    Core.showStatusBadge('AI에게 검수 요청 중...');
    const passWord = config.refinerPassKeyword || 'PASS';
    const promptTpl = config.refinerCustomPrompt || DEFAULT_PROMPT;
    const prompt = promptTpl
      .replace('{lore}', loreText)
      .replace('{memory}', memoryText)
      .replace('{context}', contextText)
      .replace('{message}', assistantText)
      .replace('{passWord}', passWord);

    try {
      if (ToastCallback) ToastCallback('AI 응답 검수 중...', '#258');
      const apiOpts = {
        apiType: config.autoExtApiType || 'key',
        key: config.autoExtKey,
        vertexJson: config.autoExtVertexJson,
        vertexLocation: config.autoExtVertexLocation || 'global',
        vertexProjectId: config.autoExtVertexProjectId,
        model: config.autoExtModel === '_custom' ? config.autoExtCustomModel : (config.autoExtModel || 'gemini-3-flash-preview'),
        maxRetries: 1
      };
      
      // 추론 설정 매핑
      const sel = config.autoExtReasoning || 'medium';
      const is3x = apiOpts.model.includes('gemini-3');
      const isPro = apiOpts.model.includes('pro');
      let tConf = {};
      if (is3x) {
        if (sel === 'off' || sel === 'minimal') tConf = { thinkingLevel: isPro ? 'low' : 'minimal' };
        else if (sel === 'budget') tConf = { thinkingLevel: (config.autoExtBudget || 0) <= 2048 ? 'low' : 'medium' };
        else tConf = { thinkingLevel: sel };
      } else {
        if (sel === 'off') tConf = { thinkingBudget: 0 };
        else if (sel === 'minimal') tConf = { thinkingBudget: 512 };
        else if (sel === 'budget') tConf = { thinkingBudget: config.autoExtBudget || 0 };
        else { const map = { low: 1024, medium: 2048, high: 4096 }; tConf = { thinkingBudget: map[sel] || 2048 }; }
      }
      apiOpts.thinkingConfig = tConf;

      const response = await Core.callGeminiApi(prompt, apiOpts);
      if (!response.text) throw new Error(response.error || 'AI 응답 없음');
      const text = response.text.trim();

      const isPass = text.includes(passWord) && text.length < passWord.length + 10;
      if (isPass) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'PASS', isPass: true });
        Core.showStatusBadge('✅ 문제없음');
        setTimeout(Core.hideStatusBadge, 2000);
        if (ToastCallback) ToastCallback('문제없이 통과됨 ✅', '#4a9');
        return;
      }

      let parsed = null;
      try {
        const raw = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(raw);
      } catch (e) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Parsing Error: ' + text.slice(0, 50), isError: true });
        Core.hideStatusBadge();
        if (ToastCallback) ToastCallback('응답을 해석할 수 없어 원본 유지.', '#a55');
        return;
      }

      if (parsed && (parsed.replacements || parsed.refined_text)) {
        let correctedText = assistantText;
        const replacements = parsed.replacements || [];
        if (replacements.length > 0) {
          for (const r of replacements) {
            if (r.from && r.to !== undefined) {
              correctedText = correctedText.replace(r.from, r.to);
            }
          }
        } else if (parsed.refined_text) {
          correctedText = parsed.refined_text;
        }

        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Refined', isPass: false, refined: correctedText, reason: parsed.reason });
        Core.showStatusBadge('⚠️ 교정 제안 있음');
        setTimeout(Core.hideStatusBadge, 3000);

        const applyRefinement = async (newText) => {
          try {
            const _cid = Core.getCurrentChatId();
            if (!_cid) throw new Error('채팅방 ID 없음');
            const lastBot = await CrackUtil.chatRoom().findLastBotMessage(_cid);
            if (lastBot && !(lastBot instanceof Error)) {
              const token = CrackUtil.cookie().getAuthToken();
              const editUrl = `https://contents-api.wrtn.ai/character-chat/v3/chats/${_cid}/messages/${lastBot.id}`;
              const editResult = await Core.gmFetch(editUrl, {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: newText })
              });

              const newFp = lastBot.id || newText.slice(0, 40);
              processedFingerprints.add(newFp);
              saveProcessedFingerprints();
              lastAssistantMsgId = newFp;
              lastMsgLength = newText.length;

              if (editResult.ok) {
                const domUpdated = refreshMessageInDOM(assistantText, newText);
                if (ToastCallback) ToastCallback(`교정 반영 완료 — ${parsed.reason}`, '#285');
              } else {
                if (ToastCallback) ToastCallback('서버 수정 실패.', '#a55');
              }
            } else {
              if (ToastCallback) ToastCallback('대상 메시지 탐색 실패. 교정본은 로그에 저장됨.', '#a55');
            }
          } catch (e) {
            if (ToastCallback) ToastCallback('메시지 수정 오류.', '#a55');
          }
        };

        if (config.refinerAutoMode) {
          await applyRefinement(correctedText);
        } else {
          const existingPopup = document.querySelector('#refiner-confirm-overlay');
          if (existingPopup) {
            if (ToastCallback) ToastCallback('교정 제안이 로그에 저장됨.', '#258');
          } else {
            showRefineConfirm(parsed.reason, correctedText, applyRefinement, () => {});
          }
        }
      }
    } catch (e) {
      if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'System Error: ' + e.message, isError: true });
      Core.hideStatusBadge();
      if (ToastCallback) ToastCallback(`교정 실패: ${e.message}`, '#a55');
    }
  }

  // 큐 시스템
  const refineQueue = [];
  let workerBusy = false;
  let workerStartTime = 0;
  const WORKER_TIMEOUT = 90000;

  function enqueueRefine(text, msgId) {
    const fingerprint = msgId || text.slice(0, 40);
    if (processedFingerprints.has(fingerprint)) {
      Core.hideStatusBadge(); return;
    }
    if (refineQueue.some(item => item.fingerprint === fingerprint)) return;
    refineQueue.push({ text, fingerprint, enqueuedAt: Date.now() });
    processQueue();
  }

  async function processQueue() {
    if (refineQueue.length === 0) return;
    if (workerBusy) {
      if (Date.now() - workerStartTime > WORKER_TIMEOUT) {
        workerBusy = false; Core.hideStatusBadge();
      } else return;
    }
    workerBusy = true;
    workerStartTime = Date.now();

    const item = refineQueue.shift();
    try {
      await Promise.race([
        refineMessage(item.text),
        new Promise((_, rej) => setTimeout(() => rej(new Error('refineMessage 60초 타임아웃')), 60000))
      ]);
    } catch (e) {
      Core.hideStatusBadge();
    }

    processedFingerprints.add(item.fingerprint);
    saveProcessedFingerprints();
    workerBusy = false;

    if (refineQueue.length > 0) processQueue();
  }

  // 옵저버
  let lastAssistantMsgId = null;
  let lastMsgLength = 0;
  let idleCount = 0;
  let _needsWarmup = true;
  let _lastKnownUrl = '';
  let _chatObserver = null;
  let _pollingInterval = null;

  async function checkLatestMessage() {
    const config = ConfigGetter();
    if (!config.refinerEnabled) return;

    const currentUrl = Core.getCurUrl();
    if (currentUrl !== _lastKnownUrl) {
      _lastKnownUrl = currentUrl; lastAssistantMsgId = null; lastMsgLength = 0; idleCount = 0; _needsWarmup = true;
    }

    const chatId = Core.getCurrentChatId();
    if (!chatId) return;

    try {
      const lastLog = await CrackUtil.chatRoom().findLastMessageId(chatId, "assistant");
      if (!lastLog || lastLog instanceof Error) return;

      const msgId = lastLog.id || (lastLog.content ? lastLog.content.slice(0, 40) : '');
      const contentLen = lastLog.content ? lastLog.content.length : 0;

      if (_needsWarmup) {
        lastAssistantMsgId = msgId; lastMsgLength = contentLen; idleCount = 0; _needsWarmup = false; return;
      }

      if (msgId !== lastAssistantMsgId) {
        Core.showStatusBadge('AI 응답 수신 대기...');
        lastAssistantMsgId = msgId; lastMsgLength = contentLen; idleCount = 0;
      } else {
        if (contentLen === lastMsgLength && lastMsgLength > 0) {
          idleCount++;
          if (idleCount === 2) enqueueRefine(lastLog.content, msgId);
        } else {
          lastMsgLength = contentLen; idleCount = 0;
        }
      }
    } catch (e) {}
  }

  function setupObserver() {
    if (_chatObserver) _chatObserver.disconnect();
    if (_pollingInterval) clearInterval(_pollingInterval);

    _chatObserver = new MutationObserver(() => {
      const config = ConfigGetter();
      if (!config.refinerEnabled) return;
      if (window._refinerDebounceTimer) clearTimeout(window._refinerDebounceTimer);
      window._refinerDebounceTimer = setTimeout(() => { checkLatestMessage(); }, 800);
    });
    _chatObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    _pollingInterval = setInterval(() => {
      const config = ConfigGetter();
      if (config.refinerEnabled) checkLatestMessage();
    }, 3000);

    setInterval(() => {
      if (workerBusy && Date.now() - workerStartTime > WORKER_TIMEOUT) {
        workerBusy = false; Core.hideStatusBadge();
      }
      if (refineQueue.length > 0 && !workerBusy) processQueue();
    }, 2000);
  }

  _w.__LoreRefiner = {
    DEFAULT_PROMPT,
    init: function(coreInstance, configGetterFn, logCb, toastCb, getPacksCb) {
      Core = coreInstance;
      ConfigGetter = configGetterFn;
      LogCallback = logCb;
      ToastCallback = toastCb;
      GetActivePacksCallback = getPacksCb;
      setupObserver();
    },
    clearProcessed: function() {
      processedFingerprints.clear();
      _ls.removeItem(_PROCESSED_KEY);
    },
    setNeedsWarmup: function() {
      _needsWarmup = true;
    }
  };

})();
