(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreRefiner) return;

  const PROMPT_MOD = _w.__LoreRefinerPrompts || null;
  const PROMPT_VERSION = PROMPT_MOD?.PROMPT_VERSION || 'v1.4.0-old-style-simple';
  const FALLBACK_PROMPT = `You are a Continuity Checker.

## Rule
Flag only direct contradictions against [Lore], [Summaries], or [Recent Context].
If recent context explains the change, do not flag it.
Do not correct honorifics unless stored lore and recent context clearly prove the current wording is wrong.
Repair only visibly truncated final sentences or missing trailing status blocks.

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found:
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`;

  const FALLBACK_TEMPLATES = {
    full: {
      name: '전체 검수',
      desc: '모순과 끊김을 함께 확인.',
      turnHint: 1,
      prompt: FALLBACK_PROMPT
    }
  };

  const FALLBACK_TOPICS = {
    factual: { label: '명시적 사실 모순', desc: '저장 정보와 정면 충돌', group: 'logic' },
    honorific: { label: '호칭 교정', desc: '맥락까지 보고 명백한 오류만 수정', group: 'logic' },
    truncSentence: { label: '문장 끊김 복구', desc: '잘린 마지막 문장 완성', group: 'repair' },
    truncStatusBlock: { label: '상태창 복구', desc: '누락된 마지막 상태창 복구', group: 'repair' }
  };

  function buildFallbackDynamicPrompt(topics) {
    const enabled = topics || {};
    const hasAny = Object.keys(enabled).some(k => enabled[k]);
    if (!hasAny) return 'Always output {passWord}.\n\n[New Speech]:\n{message}';
    return FALLBACK_PROMPT;
  }

  const DEFAULT_PROMPT = PROMPT_MOD?.DEFAULT_PROMPT || FALLBACK_PROMPT;

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
    const arr = Array.from(processedFingerprints).slice(-100);
    try { _ls.setItem(_PROCESSED_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // DOM
  function triggerSWRRevalidation() {
    const D = _w.__LoreRefinerDOM;
    if (D && D.triggerRevalidation) return D.triggerRevalidation();
    try {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    } catch (e) {}
  }

  function refreshMessageInDOM(originalText, newText) {
    const D = _w.__LoreRefinerDOM;
    if (D && D.refreshMessageInDOM) return D.refreshMessageInDOM(originalText, newText);
    return false;
  }

  // UI
  function showRefineConfirm(reason, refinedText, originalText, onConfirm, onCancel) {
    const M = _w.__LoreRefinerModal;
    if (M && M.show) {
      return M.show(reason, refinedText, onConfirm, onCancel, {
        originalText: originalText || '',
        afterClose: function () { setTimeout(function () { processQueue(); }, 100); }
      });
    }

    const edited = window.prompt('수정된 응답', refinedText || '');
    if (edited == null) {
      if (typeof onCancel === 'function') onCancel();
      setTimeout(function () { processQueue(); }, 100);
      return;
    }
    if (typeof onConfirm === 'function') onConfirm(edited);
    setTimeout(function () { processQueue(); }, 100);
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
    if (!config.refinerEnabled && !force) return;

    Core.showStatusBadge('에리가 문장 훑는 중');
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
    Core.showStatusBadge('에리가 기억 꺼내는 중');
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
    Core.showStatusBadge('에리가 응답 확인 중');
    const passWord = config.refinerPassKeyword || 'PASS';
    const configuredPrompt = config.refinerCustomPrompt || '';
    const promptTplRaw = isLegacyPrompt(configuredPrompt) ? DEFAULT_PROMPT : (configuredPrompt || DEFAULT_PROMPT);
    const promptTpl = PROMPT_MOD?.buildPrompt ? PROMPT_MOD.buildPrompt(promptTplRaw, config) : promptTplRaw;
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
        Core.showStatusBadge('에리: 이상 없음');
        setTimeout(Core.hideStatusBadge, 2000);
        if (ToastCallback) ToastCallback('에리: 통과', '#4a9');
        return;
      }

      let parsed = null;
      try {
        const raw = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(raw);
      } catch (e) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Parsing Error: ' + text.slice(0, 50), isError: true });
        Core.hideStatusBadge();
        if (ToastCallback) ToastCallback('에리: 응답 해석 실패, 원본 유지', '#a55');
        return;
      }

        if (parsed && !parsed.replacements && !parsed.refined_text) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: '응답 구조 불명', isError: true, reason: parsed.reason || '(이유 없음)' });
        Core.hideStatusBadge();
        if (ToastCallback) ToastCallback('에리: 응답 구조 불명', '#a55');
        return;
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
        Core.showStatusBadge('에리가 뭔가 발견');
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
                setTimeout(triggerSWRRevalidation, 6000);
                if (ToastCallback) ToastCallback(domUpdated ? `에리가 고침 — ${parsed.reason}` : `에리가 고침(새로고침 시 반영) — ${parsed.reason}`, '#285');
                if (!domUpdated) {
                  setTimeout(function () { refreshMessageInDOM(assistantText, newText); }, 1200);
                  setTimeout(function () { refreshMessageInDOM(assistantText, newText); }, 2600);
                }
                console.log('[Refiner] PATCH 성공. id=', lastBot.id, 'status=', editResult.status, 'domUpdated=', domUpdated);
              } else {
                let errText = '';
                try { errText = editResult.text ? await editResult.text() : ''; } catch(ex) {}
                console.error('[Refiner] PATCH 실패. status=', editResult.status, 'body=', errText.slice(0, 300));
                if (ToastCallback) ToastCallback(`에리: 서버 수정 실패 (${editResult.status})`, '#a55');
              }
            } else {
              if (ToastCallback) ToastCallback('에리: 대상 메시지 못 찾음, 로그에 보관', '#a55');
            }
          } catch (e) {
            if (ToastCallback) ToastCallback('에리: 수정 중 오류', '#a55');
          }
        };

        if (config.refinerAutoMode) {
          await applyRefinement(correctedText);
        } else {
          const existingPopup = document.querySelector('#refiner-confirm-overlay');
          if (existingPopup) {
            if (ToastCallback) ToastCallback('에리: 제안을 로그에 보관함', '#258');
          } else {
            showRefineConfirm(parsed.reason, correctedText, assistantText, applyRefinement, () => {});
          }
        }
      }
    } catch (e) {
      if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'System Error: ' + e.message, isError: true });
      Core.hideStatusBadge();
      if (ToastCallback) ToastCallback(`에리: 교정 실패 — ${e.message}`, '#a55');
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
    if (document.querySelector('#refiner-confirm-overlay')) return;
    if (workerBusy) {
      if (Date.now() - workerStartTime > WORKER_TIMEOUT) {
        workerBusy = false; Core.hideStatusBadge();
      } else return;
    }
    workerBusy = true;
    workerStartTime = Date.now();

    const item = refineQueue.shift();
    if (processedFingerprints.has(item.fingerprint)) {
      workerBusy = false;
      if (refineQueue.length > 0) processQueue();
      return;
    }
    processedFingerprints.add(item.fingerprint);
    saveProcessedFingerprints();
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
        Core.showStatusBadge('에리가 응답 기다리는 중');
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
        workerBusy = false; Core.hideStatusBadge();
      }
      if (refineQueue.length > 0 && !workerBusy) processQueue();
    }, 2000);
  }

  // LEGACY
  const LEGACY_PROMPTS = [
    'You are an RP Continuity Checker.',
    'You are an RP Text Repair AI.',
    'You are an RP Logic Checker.',
    'RATE: PG-13 ~ NC-21',
    'HONORIFIC REGRESSION',
    'USER IMPERSONATION'
  ];

  function normalizePromptForCompare(text) {
    return String(text || '').trim().replace(/\s+/g, ' ');
  }

  function isLegacyPrompt(prompt) {
    if (!prompt) return false;
    const normalized = normalizePromptForCompare(prompt);
    return LEGACY_PROMPTS.some(sig => normalized.includes(normalizePromptForCompare(sig)));
  }

  _w.__LoreRefiner = {
    DEFAULT_PROMPT,
    TEMPLATES: PROMPT_MOD?.TEMPLATES || FALLBACK_TEMPLATES,
    TOPICS: PROMPT_MOD?.TOPICS || FALLBACK_TOPICS,
    buildDynamicPrompt: PROMPT_MOD?.buildDynamicPrompt || buildFallbackDynamicPrompt,
    PROMPT_VERSION,
    LEGACY_PROMPTS,
    isLegacyPrompt,
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
    },
    // 수동 검수
    manualRefine: async function(text, msgId) {
      if (!text) return;
      if (msgId) processedFingerprints.delete(msgId);
      try { await refineMessage(text, true); } catch(e) { console.error('[Refiner] manual fail:', e); throw e; }
    }
  };

})();