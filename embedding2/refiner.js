(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreRefiner) return;

  const PROMPT_VERSION = 'v1.4.4-dynamic-honorific-fix';

  const TEMPLATES = {
    full: {
      name: "전체 검수 (모순 파악 + 끊김 복구)",
      desc: "로어 모순 파악과 코드블록/문장 끊김 복구를 동시에 수행합니다.",
      turnHint: 1,
      prompt: `You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION
6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뵙겠습니다", unfamiliarity.
7. CONTEXTUAL HONORIFIC MISMATCH:
   Flag only direct-address mismatch.
   The current/latest vocative must be explicitly established in [Lore], [Summaries], [Recent Context], or [Call] matrix.
   Do NOT flag an older vocative only because it appears as "←prev".
   Do NOT flag when recent context plausibly justifies the switch: anger, emotional distance, sarcasm, teasing, public/formal setting, disguise, identity reveal, memory reset, possession, roleplay-within-roleplay, deliberate relationship shift, or quoted old dialogue.
   Do NOT flag narration that merely mentions an old term without using it as direct address.
8. USER IMPERSONATION: AI narrated the user's character's actions, decisions, dialogue, or internal thoughts WITHOUT user's explicit prior input.
   Violation examples: "당신은 웃으며 대답했다" when user never said they laughed; "내심 설렘이 일었다" when user expressed no such feeling.
   Allowed: describing physical cues the AI's character OBSERVES in the user (e.g., "당신의 눈빛을 보며"), but NOT internal states the AI cannot know.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION (triple-backtick fenced code blocks \`\`\`...\`\`\` at the END of an assistant message, containing RP stats/HP/variables/scene info):
   Restore truncated/absent status blocks using [Recent Context]. Copy the most recent assistant-side code block verbatim (including the triple backticks). Only update numeric values if [New Speech] explicitly states them.

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`
    },
    repairOnly: {
      name: "단순 끊김 복구 (모순 체크 생략)",
      desc: "모순 체크를 생략하고 텍스트나 상태창의 끊김만 빠르게 복구합니다.",
      turnHint: 0,
      prompt: `You are an RP Text Repair AI.
RATE: PG-13 ~ NC-21

## Rule
Your ONLY job is to fix truncation in the [New Speech]. Do NOT check for factual logic or lore contradictions.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence using [Recent Context] as reference.
B) STATUS BLOCK TRUNCATION (triple-backtick code blocks \`\`\`...\`\`\` at the END of an assistant message):
   If [Recent Context] contains a complete status block and [New Speech] does not, restore it verbatim including the triple backticks.

## Output Format
Reason MUST be in Korean.
No truncation found:
{passWord}

Truncation fixed (no markdown code fences):
{"reason":"끊김 복구","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Recent Context]:
{context}

[New Speech]:
{message}`
    },
    logicOnly: {
      name: "로어 모순 검수 (끊김 복구 생략)",
      desc: "수집된 로어를 바탕으로 엄격하게 논리적 모순만 체크합니다.",
      turnHint: 1,
      prompt: `You are an RP Logic Checker.
RATE: PG-13 ~ NC-21

## Scope
Check [New Speech] against [Lore] and [Summaries] for direct logical or factual contradictions.
Do NOT fix truncated sentences or missing status blocks.

## Output Format
Reason MUST be in Korean.
No logical contradictions:
{passWord}

Contradictions found (no markdown code fences):
{"reason":"모순 설명","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`
    }
  };

  // 주제별 동적 프롬프트 빌더 — 각 검수 항목을 on/off로 선택
  const TOPICS = {
    factual:       { label: '1. 명시적 사실 모순',  desc: '[Lore]·[Summaries]와 정면 충돌',              group: 'logic' },
    presence:      { label: '2. 존재/부재 모순',    desc: '없어야 할 캐릭터가 등장하거나 반대',           group: 'logic' },
    nickname:      { label: '3. 호칭 불일치',       desc: '저장된 호칭·직함과 다른 부름',                 group: 'logic' },
    state:         { label: '4. 상태 모순',         desc: '사망/부상/실종 등 상태 모순',                  group: 'logic' },
    promise:       { label: '5. 약속 모순',         desc: '확정된 약속이나 서사 흐름 위반',               group: 'logic' },
    reunion:       { label: '6. 재회 위반',         desc: '이미 아는 사이가 처음 보는 것처럼 행동',       group: 'logic' },
    honorific:     { label: '7. 호칭 맥락 검사',    desc: '맥락 없는 직접 호칭 회귀만 검사',             group: 'logic' },
    impersonation: { label: '8. 유저 사칭',         desc: 'AI가 유저 캐릭터의 행동/생각을 서술',          group: 'logic' },
    truncSentence:    { label: 'A. 문장 끊김 복구', desc: '잘린 마지막 문장 완성',                        group: 'repair' },
    truncStatusBlock: { label: 'B. 상태창 복구',    desc: '코드블록 상태창 끊김/누락 복구',               group: 'repair' },
  };

  const _LOGIC_BLOCKS = {
    factual:       '1. EXPLICIT FACTUAL CONTRADICTION',
    presence:      '2. PRESENCE / ABSENCE CONTRADICTION',
    nickname:      '3. NICKNAME / TITLE MISMATCH',
    state:         '4. STATE CONTRADICTION',
    promise:       '5. PROMISE / ARC CONTRADICTION',
    reunion:       '6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뵙겠습니다", unfamiliarity.',
    honorific:     '7. CONTEXTUAL HONORIFIC MISMATCH:\n' +
                   '   Flag only direct-address mismatch.\n' +
                   '   The current/latest vocative must be explicitly established in [Lore], [Summaries], [Recent Context], or [Call] matrix.\n' +
                   '   Do NOT flag an older vocative only because it appears as "←prev".\n' +
                   '   Do NOT flag when recent context plausibly justifies the switch: anger, emotional distance, sarcasm, teasing, public/formal setting, disguise, identity reveal, memory reset, possession, roleplay-within-roleplay, deliberate relationship shift, or quoted old dialogue.\n' +
                   '   Do NOT flag narration that merely mentions an old term without using it as direct address.',
    impersonation: '8. USER IMPERSONATION: AI narrated the user\'s character\'s actions, decisions, dialogue, or internal thoughts WITHOUT user\'s explicit prior input.\n   Violation examples: "당신은 웃으며 대답했다" when user never said they laughed; "내심 설렘이 일었다" when user expressed no such feeling.\n   Allowed: describing physical cues the AI\'s character OBSERVES in the user (e.g., "당신의 눈빛을 보며"), but NOT internal states the AI cannot know.',
  };
  const _REPAIR_BLOCKS = {
    truncSentence:    'A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.',
    truncStatusBlock: 'B) STATUS BLOCK TRUNCATION (triple-backtick fenced code blocks ```...``` at the END of an assistant message, containing RP stats/HP/variables/scene info):\n   Restore truncated/absent status blocks using [Recent Context]. Copy the most recent assistant-side code block verbatim (including the triple backticks). Only update numeric values if [New Speech] explicitly states them.',
  };

  function buildDynamicPrompt(topics) {
    topics = topics || {};
    const logicKeys  = ['factual','presence','nickname','state','promise','reunion','honorific','impersonation'].filter(k => topics[k]);
    const repairKeys = ['truncSentence','truncStatusBlock'].filter(k => topics[k]);
    const hasLogic = logicKeys.length > 0;
    const hasRepair = repairKeys.length > 0;
    if (!hasLogic && !hasRepair) {
      return 'You are an RP Checker. All topics disabled — always output {passWord}.\n\n[New Speech]:\n{message}';
    }
    let p = 'You are an RP Continuity Checker.\nRATE: PG-13 ~ NC-21\n\n## Scope\nYou receive:\n- [Lore]: partial character/world data\n- [Summaries]: memory snapshots\n- [Recent Context]: last N turns of dialogue\n- [New Speech]: the latest AI-generated RP response\n\n## Rule\nFlag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].\n';
    if (hasLogic)  { p += '\n## What Counts as an Error\n'; logicKeys.forEach(k => { p += _LOGIC_BLOCKS[k] + '\n'; }); }
    if (hasRepair) { p += '\n## Truncation Repair\n';        repairKeys.forEach(k => { p += _REPAIR_BLOCKS[k] + '\n'; }); }
    p += '\n## Output Format\nReason MUST be in Korean.\nNo issues/repairs needed:\n{passWord}\n\nIssues found (no markdown code fences):\n{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}\n\n[Lore]:\n{lore}\n\n[Summaries]:\n{memory}\n\n[Recent Context]:\n{context}\n\n[New Speech]:\n{message}';
    return p;
  }

  const DEFAULT_PROMPT = TEMPLATES.full.prompt;

  let Core = null;
  let ConfigGetter = null;
  let LogCallback = null;
  let ToastCallback = null;
  let GetActivePacksCallback = null;

  function setRefinerStatus(msg, opts) {
    try {
      if (Core && Core.status && Core.status.set) Core.status.set('refiner', msg, opts || { busy: true });
      else if (Core && Core.showStatusBadge) Core.showStatusBadge(msg);
    } catch(e) {}
  }

  function clearRefinerStatus() {
    try {
      if (Core && Core.status && Core.status.clear) Core.status.clear('refiner');
      else if (Core && Core.hideStatusBadge) Core.hideStatusBadge();
    } catch(e) {}
  }

  const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
  const _PROCESSED_KEY = 'speech-refiner-processed';
  const processedFingerprints = new Set();
  try {
    const saved = _ls.getItem(_PROCESSED_KEY);
    if (saved) JSON.parse(saved).forEach(fp => processedFingerprints.add(fp));
  } catch (e) {}

  function saveProcessedFingerprints() {
    const arr = Array.from(processedFingerprints).slice(-100);
    try { _ls.setItem(_PROCESSED_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // DOM
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
    const escapeHtml = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const codeBlocks = [];
    let html = escapeHtml(mdText).replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, function(_, lang, code) {
      const token = '@@LORE_CODE_BLOCK_' + codeBlocks.length + '@@';
      const cls = lang ? ' class="language-' + lang + '"' : '';
      codeBlocks.push('<pre><code' + cls + '>' + code + '</code></pre>');
      return token;
    });
    html = html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    codeBlocks.forEach(function(block, i) {
      html = html.replace('@@LORE_CODE_BLOCK_' + i + '@@', block);
    });
    return html;
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

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isCorrectedTextVisible(oldPlain, newPlain) {
    const oldSnippet = (oldPlain.length > 30 ? oldPlain.slice(-30) : oldPlain).trim();
    const newSnippet = (newPlain.length > 30 ? newPlain.slice(-30) : newPlain).trim();
    if (!newSnippet) return false;
    const el = findDeepestMatchingElement(newPlain);
    if (!el) return false;
    const cur = (el.textContent || '').trim();
    return cur.includes(newSnippet) && (!oldSnippet || !cur.includes(oldSnippet));
  }

  async function waitForCorrectedText(oldPlain, newPlain, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isCorrectedTextVisible(oldPlain, newPlain)) return true;
      await sleep(500);
    }
    return false;
  }

  async function refreshMessageInDOM(originalText, newText) {
    const oldPlain = stripMarkdown(originalText);
    const newPlain = stripMarkdown(newText);

    triggerSWRRevalidation();
    if (await waitForCorrectedText(oldPlain, newPlain, 4500)) return true;

    const renderedHTML = renderMarkdownHTML(newText);
    const targetEl = findDeepestMatchingElement(oldPlain);
    if (targetEl) {
      targetEl.innerHTML = renderedHTML;
      tryPatchReactFiber(targetEl, originalText, newText);
      triggerSWRRevalidation();
      return true;
    }

    if (isCorrectedTextVisible(oldPlain, newPlain)) return true;
    return false;
  }

  // UI
  function showRefineConfirm(reason, refinedText, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.id = 'refiner-confirm-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;box-sizing:border-box;';

    const box = document.createElement('div');
    box.className = 'lore-modal';
    box.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:8px;width:min(900px,92vw);max-width:900px;max-height:85vh;overflow:auto;padding:20px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;';

    const title = document.createElement('div');
    title.textContent = 'AI 응답 교정 제안';
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
    refTa.className = 'lore-textarea';
    refTa.value = refinedText;
    refTa.style.cssText = 'width:100%;min-height:320px;height:min(52vh,520px);background:#0a0a0a;color:#fff;border:1px solid #444;border-radius:4px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5;';

    const btnRow = document.createElement('div');
    btnRow.className = 'lore-actions';
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:12px;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = '원본 유지';
    btnCancel.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#444;color:#ccc;cursor:pointer;font-weight:bold;';
    btnCancel.onclick = async () => {
      btnCancel.disabled = true;
      btnConfirm.disabled = true;
      try {
        await onCancel();
      } finally {
        if (overlay.parentNode) document.body.removeChild(overlay);
        setTimeout(() => processQueue(), 100);
      }
    };

    const btnConfirm = document.createElement('button');
    btnConfirm.textContent = '교정본 변경';
    btnConfirm.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#285;color:#fff;cursor:pointer;font-weight:bold;';
    btnConfirm.onclick = async () => {
      btnCancel.disabled = true;
      btnConfirm.disabled = true;
      const oldLabel = btnConfirm.textContent;
      btnConfirm.textContent = '적용 중';
      try {
        await onConfirm(refTa.value);
      } finally {
        btnConfirm.textContent = oldLabel;
        if (overlay.parentNode) document.body.removeChild(overlay);
        setTimeout(() => processQueue(), 100);
      }
    };

    btnRow.appendChild(btnCancel); btnRow.appendChild(btnConfirm);
    box.appendChild(title); box.appendChild(reasonTitle); box.appendChild(reasonText);
    box.appendChild(refTitle); box.appendChild(refTa); box.appendChild(btnRow);
    overlay.appendChild(box); document.body.appendChild(overlay);
  }

  function renderLoreForRefiner(entries) {
    const L = {personality:'성격',attributes:'특성',abilities:'능력',current_state:'현재',last_interaction:'최근',current_status:'현재 상태',nicknames:'호칭',relations:'관계',background_or_history:'배경',maker:'약속자',target:'대상',condition:'발동 조건',status:'상태',resolution:'결과',parties:'관계자',ingredients:'재료',steps:'순서',tips:'참고',rules:'규칙',effects:'효과'};
    return entries.map(e => {
      if (e.inject?.full) {
        let line = `[${e.type}] ${e.name}: ${e.inject.full}`;
        if (e.state) line += ` (${e.state})`;
        if (e.call) {
          const c = Object.entries(e.call).map(([k,v])=>`${k}:${v}`).join(', ');
          line += ` | 호칭: ${c}`;
        }
        if (e.cond) line += ` | 조건: ${e.cond}`;
        return line;
      }
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
  async function refineMessage(assistantText, force = false) {
    const config = ConfigGetter();
    if (!config.refinerEnabled && !force) return { done: false, retry: false, reason: 'disabled' };

    setRefinerStatus('에리가 문장 훑는 중', { busy: true });
    const chatRoomId = Core.getCurrentChatId();
    if (!chatRoomId) { clearRefinerStatus(); return { done: false, retry: true, reason: 'no_chat_room' }; }
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
      
      let _lE = [];
      if (config.refinerLoreMode === 'semantic' && config.embeddingEnabled) {
        const apiOpts = {
          apiType: config.autoExtApiType || 'key', key: config.autoExtKey, vertexJson: config.autoExtVertexJson,
          vertexLocation: config.autoExtVertexLocation || 'global', vertexProjectId: config.autoExtVertexProjectId,
          firebaseScript: config.autoExtFirebaseScript, firebaseEmbedKey: config.autoExtFirebaseEmbedKey,
          model: config.embeddingModel || 'gemini-embedding-001'
        };
        const searchConfig = { scanRange: matchTurns, strictMatch: true, similarityMatch: true, embeddingEnabled: true, embeddingWeight: 0.5 };
        try {
          const searchResult = await Core.hybridSearch(assistantText, _tMsgs, activeEntries, searchConfig, apiOpts);
          _lE = searchResult.scored.slice(0, 10).map(s => s.entry);
        } catch (e) {
          console.warn('[Refiner] Semantic search failed, falling back to trigger match.');
        }
      }

      if (_lE.length === 0) {
        const autoPacks = config.autoPacks || ['자동추출'];
        const _fE = activeEntries.filter(x => !autoPacks.includes(x.packName));
        const _aE = activeEntries.filter(x => autoPacks.includes(x.packName));
        const _mF = matchEntriesByTrigger(_fE, _tMsgs, assistantText);
        const _mA = matchEntriesByTrigger(_aE, _tMsgs, assistantText);
        _lE = config.refinerLoreMode === 'matchedOnly' ? [..._mF, ..._mA] : [..._mF, ..._aE];
      }
      
      if (_lE.length > 0) loreText = renderLoreForRefiner(_lE);
      else loreText = '(키워드 매칭된 로어 없음)';
    }

    // 2. 메모리
    setRefinerStatus('에리가 기억 꺼내는 중', { busy: true });
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
    // user 턴 OOC 제거
    function stripInjectedOOC(msg, role) {
      if (!msg || role !== 'user') return msg;
      return msg
        .replace(/\*\*OOC:[\s\S]*?\*\*/g, '')
        .replace(/\[System:[\s\S]*?\[\/System\]/g, '')
        .replace(/\(Narrator's note:[\s\S]*?\(End note\)/g, '')
        .replace(/\/\*\*[\s\S]*?\*\*\//g, '')
        .replace(/Remember these established facts[\s\S]*?(?=\n\n|$)/g, '')
        .trim();
    }
    // turns=N → 2N+1 메시지 (New Speech 중복 제거)
    let contextText = '최근 대화 내역 없음.';
    const turns = config.refinerContextTurns !== undefined ? config.refinerContextTurns : 1;
    if (turns > 0) {
      const allMsgs = await Core.fetchLogs(turns * 2 + 2);
      if (allMsgs && allMsgs.length > 0) {
        let ctxMsgs = allMsgs.slice();
        const last = ctxMsgs[ctxMsgs.length - 1];
        if (last && last.role === 'assistant' && assistantText) {
          const a = (last.message || '').slice(0, 100);
          const b = assistantText.slice(0, 100);
          if (a === b) ctxMsgs = ctxMsgs.slice(0, -1);
        }
        ctxMsgs = ctxMsgs.slice(-(turns * 2 + 1));
        if (ctxMsgs.length > 0) {
          contextText = ctxMsgs.map(m => `${m.role}: ${stripInjectedOOC(m.message, m.role)}`).join('\n\n');
        }
      }
    }

    // 4. 검수 요청
    setRefinerStatus('에리가 잼민이에게 묻는 중', { busy: true });
    const passWord = config.refinerPassKeyword || 'PASS';
    const promptTpl = config.refinerCustomPrompt || DEFAULT_PROMPT;
    const prompt = promptTpl
      .replace('{lore}', loreText)
      .replace('{memory}', memoryText)
      .replace('{context}', contextText)
      .replace('{message}', assistantText)
      .replace('{passWord}', passWord);

    try {
      if (ToastCallback) ToastCallback('에리가 응답 검수 중', '#258');
      const apiOpts = {
        apiType: config.autoExtApiType || 'key',
        key: config.autoExtKey,
        vertexJson: config.autoExtVertexJson,
        vertexLocation: config.autoExtVertexLocation || 'global',
        vertexProjectId: config.autoExtVertexProjectId,
        firebaseScript: config.autoExtFirebaseScript,
        firebaseEmbedKey: config.autoExtFirebaseEmbedKey,
        model: (config.refinerModel === '_custom' ? config.refinerCustomModel : config.refinerModel)
             || (config.autoExtModel === '_custom' ? config.autoExtCustomModel : (config.autoExtModel || 'gemini-3-flash-preview')),
        maxRetries: 1
      };
      
      // 추론 최소화 (3.x: thinkingLevel, 2.x: 생략)
      const is3x = apiOpts.model.includes('gemini-3') || apiOpts.model.includes('gemini-2.0-flash-thinking');
      if (is3x) {
        const isPro = apiOpts.model.includes('pro');
        apiOpts.thinkingConfig = isPro ? { thinkingLevel: 'low' } : { thinkingLevel: 'minimal' };
      }

      const response = await Core.callGeminiApi(prompt, apiOpts);
      if (!response.text) throw new Error(response.error || 'AI 응답 없음');
      const text = response.text.trim();

      const isPass = text.includes(passWord) && text.length < passWord.length + 10;
      if (isPass) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'PASS', isPass: true });
        setRefinerStatus('에리: 이상 없음', { busy: false, tone: 'done', ttl: 2000 });
        if (ToastCallback) ToastCallback('에리: 통과', '#4a9');
        return { done: true, retry: false, status: 'pass' };
      }

      let parsed = null;
      try {
        const raw = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(raw);
      } catch (e) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Parsing Error: ' + text.slice(0, 50), isError: true });
        clearRefinerStatus();
        if (ToastCallback) ToastCallback('에리: 응답 해석 실패, 원본 유지', '#a55');
        return { done: false, retry: true, reason: 'parse_error' };
      }

        if (parsed && !parsed.replacements && !parsed.refined_text) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: '응답 구조 불명', isError: true, reason: parsed.reason || '(이유 없음)' });
        clearRefinerStatus();
        if (ToastCallback) ToastCallback('에리: 응답 구조 불명', '#a55');
        return { done: false, retry: true, reason: 'unknown_response_shape' };
      }

      if (parsed && (parsed.replacements || parsed.refined_text)) {
        let correctedText = assistantText;
        const replacements = parsed.replacements || [];
        if (replacements.length > 0) {
          for (const r of replacements) {
            if (r.from && r.to !== undefined) correctedText = correctedText.replace(r.from, r.to);
          }
        } else if (parsed.refined_text) {
          correctedText = parsed.refined_text;
        }

        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Refined', isPass: false, refined: correctedText, reason: parsed.reason });
        setRefinerStatus('에리가 뭔가 발견', { busy: false, tone: 'warn', ttl: 3000 });

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

              if (editResult.ok) {
                const newFp = lastBot.id || newText.slice(0, 40);
                processedFingerprints.add(newFp);
                saveProcessedFingerprints();
                lastAssistantMsgId = newFp;
                lastMsgLength = newText.length;

                const domUpdated = await refreshMessageInDOM(assistantText, newText);
                setTimeout(triggerSWRRevalidation, 6000);
                if (ToastCallback) ToastCallback(domUpdated ? `에리가 고침 — ${parsed.reason}` : `에리가 고침(새로고침 시 반영) — ${parsed.reason}`, '#285');
                console.log('[Refiner] PATCH 성공. id=', lastBot.id, 'status=', editResult.status, 'domUpdated=', domUpdated);
                return true;
              } else {
                let errText = '';
                try { errText = editResult.text ? await editResult.text() : ''; } catch(ex) {}
                console.error('[Refiner] PATCH 실패. status=', editResult.status, 'body=', errText.slice(0, 300));
                if (ToastCallback) ToastCallback(`에리: 서버 수정 실패 (${editResult.status})`, '#a55');
                return false;
              }
            } else {
              if (ToastCallback) ToastCallback('에리: 대상 메시지 못 찾음, 로그에 보관', '#a55');
              return false;
            }
          } catch (e) {
            if (ToastCallback) ToastCallback('에리: 수정 중 오류', '#a55');
            return false;
          }
        };

        if (config.refinerAutoMode) {
          const applied = await applyRefinement(correctedText);
          return { done: applied, retry: !applied, status: applied ? 'refined' : 'apply_failed' };
        }

        const existingPopup = document.querySelector('#refiner-confirm-overlay');
        if (existingPopup) {
          if (ToastCallback) ToastCallback('에리: 제안을 로그에 보관함', '#258');
          return { done: false, retry: true, status: 'popup_busy' };
        }

        const manualFingerprint = lastAssistantMsgId || assistantText.slice(0, 40);
        showRefineConfirm(
          parsed.reason,
          correctedText,
          async (newText) => {
            const applied = await applyRefinement(newText);
            if (applied) {
              processedFingerprints.add(manualFingerprint);
              saveProcessedFingerprints();
              markRefineState(manualFingerprint, 'done', { status: 'manual_confirmed' });
            } else {
              markRefineState(manualFingerprint, 'failed', {
                reason: 'apply_failed',
                retryAt: Date.now() + RETRY_COOLDOWN
              });
            }
          },
          async () => {
            processedFingerprints.add(manualFingerprint);
            saveProcessedFingerprints();
            markRefineState(manualFingerprint, 'done', { status: 'manual_cancelled' });
          }
        );
        return { done: false, retry: false, status: 'manual_pending' };
      }
      return { done: true, retry: false, status: 'checked' };
    } catch (e) {
      if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'System Error: ' + e.message, isError: true });
      clearRefinerStatus();
      if (ToastCallback) ToastCallback(`에리: 교정 실패 — ${e.message}`, '#a55');
      return { done: false, retry: true, reason: e.message || 'system_error' };
    }
  }

  // 큐 시스템
  const refineQueue = [];
  const refineStates = new Map();
  let workerBusy = false;
  let workerStartTime = 0;
  const WORKER_TIMEOUT = 90000;
  const RETRY_COOLDOWN = 30000;
  const MAX_RETRY = 2;

  function getRefineState(fingerprint) {
    return refineStates.get(fingerprint) || null;
  }

  function markRefineState(fingerprint, state, extra) {
    refineStates.set(fingerprint, Object.assign({ state, updatedAt: Date.now() }, extra || {}));
    if (refineStates.size > 200) {
      const rows = Array.from(refineStates.entries()).sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
      rows.slice(0, 50).forEach(([key]) => refineStates.delete(key));
    }
  }

  function enqueueRefine(text, msgId) {
    const fingerprint = msgId || text.slice(0, 40);
    if (processedFingerprints.has(fingerprint)) {
      clearRefinerStatus(); return;
    }
    const state = getRefineState(fingerprint);
    if (state && (state.state === 'queued' || state.state === 'processing' || state.state === 'manual_pending')) return;
    if (state && state.state === 'failed' && state.retryAt && state.retryAt > Date.now()) return;
    if (refineQueue.some(item => item.fingerprint === fingerprint)) return;
    markRefineState(fingerprint, 'queued', { retries: state ? (state.retries || 0) : 0 });
    refineQueue.push({ text, fingerprint, enqueuedAt: Date.now() });
    processQueue();
  }

  async function processQueue() {
    if (refineQueue.length === 0) return;
    if (document.querySelector('#refiner-confirm-overlay')) return;
    if (workerBusy) {
      if (Date.now() - workerStartTime > WORKER_TIMEOUT) {
        workerBusy = false; clearRefinerStatus();
      } else return;
    }
    workerBusy = true;
    workerStartTime = Date.now();

    const item = refineQueue.shift();
    if (processedFingerprints.has(item.fingerprint)) {
      markRefineState(item.fingerprint, 'done');
      workerBusy = false;
      if (refineQueue.length > 0) processQueue();
      return;
    }

    const prevState = getRefineState(item.fingerprint);
    markRefineState(item.fingerprint, 'processing', { retries: prevState ? (prevState.retries || 0) : 0 });

    let result = null;
    try {
      result = await Promise.race([
        refineMessage(item.text),
        new Promise((_, rej) => setTimeout(() => rej(new Error('refineMessage 60초 타임아웃')), 60000))
      ]);
    } catch (e) {
      clearRefinerStatus();
      result = { done: false, retry: true, reason: e.message || 'timeout' };
    }

    if (result && result.done) {
      processedFingerprints.add(item.fingerprint);
      saveProcessedFingerprints();
      markRefineState(item.fingerprint, 'done', { status: result.status || 'done' });
    } else if (result && result.status === 'manual_pending') {
      markRefineState(item.fingerprint, 'manual_pending', { reason: 'awaiting_user_decision' });
    } else {
      const retries = ((prevState && prevState.retries) || 0) + 1;
      const retryable = !result || result.retry !== false;
      markRefineState(item.fingerprint, 'failed', {
        retries,
        reason: result ? (result.reason || result.status) : 'unknown',
        retryAt: retryable && retries <= MAX_RETRY ? Date.now() + RETRY_COOLDOWN : Date.now() + 300000
      });
    }

    workerBusy = false;

    if (refineQueue.length > 0) processQueue();
  }

  // 옵저버
  let lastAssistantMsgId = null;
  let lastMsgLength = 0;
  let idleCount = 0;
  let lastChangeTime = 0;
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
        lastAssistantMsgId = msgId; lastMsgLength = contentLen; idleCount = 0; lastChangeTime = Date.now(); _needsWarmup = false;
        if (msgId) { processedFingerprints.add(msgId); saveProcessedFingerprints(); }
        return;
      }

      if (msgId !== lastAssistantMsgId) {
        setRefinerStatus('에리가 응답 기다리는 중', { busy: true });
        lastAssistantMsgId = msgId; lastMsgLength = contentLen; idleCount = 0; lastChangeTime = Date.now();
      } else {
        if (contentLen === lastMsgLength && lastMsgLength > 0) {
          idleCount++;
          if (idleCount >= 2 && Date.now() - lastChangeTime > 4000) enqueueRefine(lastLog.content, msgId);
        } else {
          lastMsgLength = contentLen; idleCount = 0; lastChangeTime = Date.now();
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
        workerBusy = false; clearRefinerStatus();
      }
      if (refineQueue.length > 0 && !workerBusy) processQueue();
    }, 2000);
  }

  // LEGACY
  const LEGACY_PROMPTS = [
`You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION
6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뽵겙습니다", unfamiliarity.
7. CONTEXTUAL HONORIFIC MISMATCH:
   Flag only direct-address mismatch.
   The current/latest vocative must be explicitly established in [Lore], [Summaries], [Recent Context], or [Call] matrix.
   Do NOT flag an older vocative only because it appears as "←prev".
   Do NOT flag when recent context plausibly justifies the switch: anger, emotional distance, sarcasm, teasing, public/formal setting, disguise, identity reveal, memory reset, possession, roleplay-within-roleplay, deliberate relationship shift, or quoted old dialogue.
   Do NOT flag narration that merely mentions an old term without using it as direct address.
8. USER IMPERSONATION: AI narrated the user's character's actions, decisions, dialogue, or internal thoughts WITHOUT user's explicit prior input.
   Violation examples: "당신은 웃으며 대답했다" when user never said they laughed; "내심 설렴이 일었다" when user expressed no such feeling.
   Allowed: describing physical cues the AI's character OBSERVES in the user (e.g., "당신의 눈빛을 보며"), but NOT internal states the AI cannot know.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION: Restore truncated/absent status blocks using [Recent Context].

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`,
`You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION: Restore truncated/absent status blocks using [Recent Context].

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`,
`You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION
6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뵙겠습니다", unfamiliarity.
7. CONTEXTUAL HONORIFIC MISMATCH:
   Flag only direct-address mismatch.
   The current/latest vocative must be explicitly established in [Lore], [Summaries], [Recent Context], or [Call] matrix.
   Do NOT flag an older vocative only because it appears as "←prev".
   Do NOT flag when recent context plausibly justifies the switch: anger, emotional distance, sarcasm, teasing, public/formal setting, disguise, identity reveal, memory reset, possession, roleplay-within-roleplay, deliberate relationship shift, or quoted old dialogue.
   Do NOT flag narration that merely mentions an old term without using it as direct address.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION: Restore truncated/absent status blocks using [Recent Context].

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`
  ];

  _w.__LoreRefiner = {
    DEFAULT_PROMPT,
    TEMPLATES,
    TOPICS,
    buildDynamicPrompt,
    PROMPT_VERSION,
    LEGACY_PROMPTS,
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
      refineStates.clear();
      _ls.removeItem(_PROCESSED_KEY);
    },
    setNeedsWarmup: function() {
      _needsWarmup = true;
    },
    // 수동 검수
    manualRefine: async function(text, msgId) {
      if (!text) return;
      if (msgId) processedFingerprints.delete(msgId);
      try { await refineMessage(text, true); } catch(e) { console.error('[Refiner] manual fail:', e); throw e; }
    }
  };

})();