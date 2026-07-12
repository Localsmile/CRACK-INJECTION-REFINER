// refiner / core 모듈
// 역할: 교정 메인 로직 — 로어/메모리/컨텍스트 수집 → API 호출 → 교정 적용
// 의존: prompts, dom, Core(__LoreCore)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = _w.__LoreRefiner = _w.__LoreRefiner || {};
  if (!R.__promptsLoaded) { console.error('[Refiner:core] prompts 미로드'); return; }
  if (!R.__domLoaded) { console.error('[Refiner:core] dom 미로드'); return; }
  if (R.__coreLoaded) return;

  let Core = null;
  let ConfigGetter = null;
  let LogCallback = null;
  let ToastCallback = null;
  let GetActivePacksCallback = null;

  const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
  // v1.4.0-test.40 B3 fix: speech-refiner-processed 글로벌 단일 Set → 채팅별 분리.
  //   채팅간 지문 충돌 제거. 구버전 단일 키는 'global' 버킷으로 흡수 후 삭제.
  //   버킷별 cap 50 (이전 글로벌 100 → 채팅별 50, 일반적 교정 빈도 충분).
  const _PROCESSED_KEY_LEGACY = 'speech-refiner-processed';
  const _PROCESSED_KEY_PREFIX = 'speech-refiner-processed:';
  const PROCESSED_CAP_PER_CHAT = 50;
  const _processedByChat = new Map();

  function _currentChatKey() {
    try { return (Core && Core.getCurrentChatId && Core.getCurrentChatId()) || 'global'; }
    catch (_) { return 'global'; }
  }
  function _loadChat(chatKey) {
    if (_processedByChat.has(chatKey)) return _processedByChat.get(chatKey);
    const set = new Set();
    try {
      const raw = _ls.getItem(_PROCESSED_KEY_PREFIX + chatKey);
      if (raw) JSON.parse(raw).forEach(fp => set.add(fp));
    } catch (_) {}
    _processedByChat.set(chatKey, set);
    return set;
  }
  // 구버전 글로벌 키 1회성 흡수.
  try {
    const legacy = _ls.getItem(_PROCESSED_KEY_LEGACY);
    if (legacy) {
      const set = _loadChat('global');
      JSON.parse(legacy).forEach(fp => set.add(fp));
      const arr = Array.from(set).slice(-PROCESSED_CAP_PER_CHAT);
      _ls.setItem(_PROCESSED_KEY_PREFIX + 'global', JSON.stringify(arr));
      _ls.removeItem(_PROCESSED_KEY_LEGACY);
    }
  } catch (_) {}

  function saveProcessedFingerprints(chatKeyOverride) {
    const chatKey = chatKeyOverride || _currentChatKey();
    const set = _processedByChat.get(chatKey);
    if (!set) return;
    if (set.size > PROCESSED_CAP_PER_CHAT) {
      const arr = Array.from(set).slice(-PROCESSED_CAP_PER_CHAT);
      set.clear();
      arr.forEach(v => set.add(v));
    }
    try { _ls.setItem(_PROCESSED_KEY_PREFIX + chatKey, JSON.stringify(Array.from(set))); } catch (_) {}
  }

  const _activeRefines = new Set();
  function _refineLockKey(chatId, messageId, text) {
    return String(chatId || 'global') + ':' + String(messageId || (text || '').slice(0, 80));
  }
  function _acquireRefineLock(chatId, messageId, text) {
    const key = _refineLockKey(chatId, messageId, text);
    if (_activeRefines.has(key)) return null;
    _activeRefines.add(key);
    return function releaseRefineLock() {
      _activeRefines.delete(key);
    };
  }

  function normalizeRefinerText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isAssistantLog(log) {
    if (!log || log instanceof Error) return false;
    if (String(log.role || '').toLowerCase() !== 'assistant') return false;
    if (typeof log.isBot === 'function' && !log.isBot()) return false;
    return !!String(log.content || '').trim();
  }

  function isUserMessageEcho(value, recentMsgs) {
    const candidate = normalizeRefinerText(value);
    if (candidate.length < 8) return false;
    return (recentMsgs || []).some(msg => {
      if (!msg || String(msg.role || '').toLowerCase() !== 'user') return false;
      const userText = normalizeRefinerText(msg.message || msg.content);
      if (!userText) return false;
      if (candidate === userText) return true;
      const shorter = Math.min(candidate.length, userText.length);
      const longer = Math.max(candidate.length, userText.length);
      return shorter / longer >= 0.92 && (candidate.includes(userText) || userText.includes(candidate));
    });
  }

  async function patchChatMessage(chatId, messageId, nextText) {
    try {
      if (typeof CrackUtil !== 'undefined' && CrackUtil.chatRoom && typeof CrackUtil.chatRoom().editMessage === 'function') {
        const edited = await CrackUtil.chatRoom().editMessage(chatId, messageId, nextText);
        if (edited === true) return { ok: true, status: 200, data: { content: nextText, id: messageId }, via: 'CrackUtil.editMessage' };
      }
    } catch (_) {}
    let token = '';
    try { token = CrackUtil.cookie().getAuthToken(); } catch (_) {}
    if (!token) return { ok: false, status: 0, error: 'auth_missing' };
    const urls = [
      `https://contents-api.wrtn.ai/character-chat/v3/chats/${chatId}/messages/${messageId}`,
      `https://contents-api.wrtn.ai/character-chat/character-chats/${chatId}/messages/${messageId}`,
      `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatId}/messages/${messageId}`
    ];
    let last = { ok: false, status: 0, error: 'not_attempted' };
    for (const editUrl of urls) {
      try {
        const editResult = await Core.gmFetch(editUrl, {
          method: 'PATCH',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'platform': 'web',
            'wrtn-locale': 'ko-KR'
          },
          body: JSON.stringify({ message: nextText })
        });
        let text = '';
        let json = null;
        try { text = editResult.text ? await editResult.text() : ''; } catch (_) {}
        try { json = text ? JSON.parse(text) : null; } catch (_) {}
        const ok = !!(editResult.ok && (!json || json.result === 'SUCCESS' || json.ok !== false));
        last = { ok, status: editResult.status, text, json, data: json && (json.data || json.result), via: editUrl };
        if (ok) return last;
      } catch (e) {
        last = { ok: false, status: 0, error: e && e.message ? e.message : String(e), via: editUrl };
      }
    }
    return last;
  }

  function formatCallStateForRefiner(entry) {
    const out = [];
    const addState = (key, raw) => {
      const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
      const current = obj.currentTerm || obj.term || obj.current || obj.call || (typeof raw === 'string' ? raw : '');
      if (!current) return;
      let prev = obj.previousTerms || obj.previous || obj.prev || [];
      if (typeof prev === 'string') prev = [prev];
      if (!Array.isArray(prev)) prev = [];
      prev = prev.filter(x => x && x !== current);
      const meta = [];
      if (obj.tone) meta.push(`tone=${obj.tone}`);
      if (obj.scope) meta.push(`scope=${obj.scope}`);
      if (obj.lastChangedTurn || obj.turn) meta.push(`changed=t${obj.lastChangedTurn || obj.turn}`);
      if (obj.confidence != null) meta.push(`confidence=${obj.confidence}`);
      if (obj.reason) meta.push(`reason=${obj.reason}`);
      out.push(`${key}: current=${current}${prev.length ? `; previous-context=${prev.join(', ')}` : ''}${meta.length ? `; ${meta.join('; ')}` : ''}`);
    };

    const callState = entry.callState || entry.detail?.callState;
    if (Array.isArray(callState)) {
      callState.forEach(cs => addState(`${cs.from || cs.speaker || '?'}→${cs.to || cs.target || cs.addressee || '?'}`, cs));
    } else if (callState && typeof callState === 'object') {
      if (callState.currentTerm || callState.term) addState(`${callState.from || callState.speaker || '?'}→${callState.to || callState.target || callState.addressee || '?'}`, callState);
      else Object.entries(callState).forEach(([k, v]) => addState(k, v));
    }

    const hist = Array.isArray(entry.callHistory) ? entry.callHistory : [];
    if (hist.length) {
      const byKey = {};
      hist.forEach(h => {
        if (!h || !h.from || !h.to || !h.term) return;
        const k = `${h.from}→${h.to}`;
        (byKey[k] = byKey[k] || []).push(h);
      });
      Object.entries(byKey).forEach(([k, arr]) => {
        arr.sort((a,b) => (a.turn || 0) - (b.turn || 0));
        const last = arr[arr.length - 1];
        const previousTerms = Array.from(new Set(arr.slice(0, -1).map(x => x.term).filter(t => t && t !== last.term)));
        addState(k, { ...last, currentTerm: last.term, previousTerms });
      });
    }
    return Array.from(new Set(out)).join(' | ');
  }

  function buildCallChangeContext(entries, recentMsgs) {
    const hasCallData = entries.some(e => e.call || e.callState || e.detail?.nicknames || e.detail?.callState || (Array.isArray(e.callHistory) && e.callHistory.length));
    if (!hasCallData) return '';
    const recent = (recentMsgs || []).slice(-4).map(m => `${m.role}: ${m.message || ''}`).join('\n');
    return `[Call Continuity Context]\nPrevious nicknames/insults are context, not permanent requirements. Prefer the latest stable call-state. Current name/title is valid when recent context shows normalization, direct name use, emotional cooling, formal setting, or a new scene.\n${recent}`;
  }

  function renderLoreForRefiner(entries) {
    const L = {personality:'성격',attributes:'특성',abilities:'능력',current_state:'현재',last_interaction:'최근',current_status:'현재 상태',nicknames:'호칭',relations:'관계',background_or_history:'배경',maker:'약속자',target:'대상',condition:'발동 조건',status:'상태',resolution:'결과',parties:'관계자',ingredients:'재료',steps:'순서',tips:'참고',rules:'규칙',effects:'효과',callState:'호칭상태'};
    return entries.map(e => {
      const callStateText = formatCallStateForRefiner(e);
      if (e.inject?.full) {
        let line = `[${e.type}] ${e.name}: ${e.inject.full}`;
        if (e.state) line += ` (${e.state})`;
        if (e.call) {
          const c = Object.entries(e.call).map(([k,v])=>`${k}:current=${v}`).join(', ');
          line += ` | 호칭(current only; previous terms are context): ${c}`;
        }
        if (callStateText) line += ` | callState(latest stable): ${callStateText}`;
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
      if (e.call) {
        const c = Object.entries(e.call).map(([k,v])=>`${k}:current=${v}`).join(', ');
        line += ` | 호칭(current only; previous terms are context): ${c}`;
      }
      if (callStateText) line += ` | callState(latest stable): ${callStateText}`;
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
  async function refineMessage(assistantText, force, enqueueCallback, requestedMsgId) {
    const config = ConfigGetter();
    if (!config.refinerEnabled && !force) return;

    Core.showStatusBadge('에리가 문장 훑는 중');
    const chatRoomId = Core.getCurrentChatId();
    if (!chatRoomId) { Core.hideStatusBadge(); return; }
    const url = Core.getCurUrl();
    let targetLog = null;
    try { targetLog = await CrackUtil.chatRoom().findLastBotMessage(chatRoomId); } catch (_) {}
    if (!isAssistantLog(targetLog)) {
      R.lastState = { state: 'skipped', detail: 'AI 응답을 찾지 못함', at: Date.now(), queue: R.refineQueue ? R.refineQueue.length : 0, busy: !!R.workerBusy };
      Core.hideStatusBadge();
      return;
    }
    const targetMsgId = targetLog.id || '';
    if (requestedMsgId && String(requestedMsgId) !== String(targetMsgId)) {
      R.lastState = { state: 'skipped', detail: '지난 AI 응답 교정 생략', at: Date.now(), queue: R.refineQueue ? R.refineQueue.length : 0, busy: !!R.workerBusy };
      Core.hideStatusBadge();
      return;
    }
    assistantText = String(targetLog.content || '');
    const releaseRefineLock = _acquireRefineLock(chatRoomId, targetMsgId, assistantText);
    if (!releaseRefineLock) {
      R.lastState = { state: 'skipped', detail: '중복 교정 요청 생략', at: Date.now(), queue: R.refineQueue ? R.refineQueue.length : 0, busy: !!R.workerBusy };
      Core.hideStatusBadge();
      return;
    }
    let holdRefineLock = false;

    // 1. 로어
    let loreText = '활성화된 로어 없음.';
    let activeEntries = [];
    try {
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
        const apiOpts = _w.__LoreInj && _w.__LoreInj.buildEmbeddingApiOpts
          ? _w.__LoreInj.buildEmbeddingApiOpts({ model: config.embeddingModel || 'gemini-embedding-001' }, { feature: 'embed', chatKey: chatRoomId || 'global' })
          : {
            apiType: config.autoExtApiType === 'deepseek' ? 'key' : (config.autoExtApiType || 'key'),
            key: config.autoExtApiType === 'deepseek' ? config.autoExtFirebaseEmbedKey : config.autoExtKey,
            vertexJson: config.autoExtVertexJson,
            vertexLocation: config.autoExtVertexLocation || 'global', vertexProjectId: config.autoExtVertexProjectId,
            firebaseScript: config.autoExtFirebaseScript, firebaseEmbedKey: config.autoExtFirebaseEmbedKey,
            model: config.embeddingModel || 'gemini-embedding-001',
            costContext: { feature: 'embed', chatKey: chatRoomId || 'global' }
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
    let allMsgsForContext = [];
    const turns = config.refinerContextTurns !== undefined ? config.refinerContextTurns : 1;
    if (turns > 0) {
      const allMsgs = await Core.fetchLogs(turns * 2 + 2);
      if (allMsgs && allMsgs.length > 0) {
        allMsgsForContext = allMsgs.slice();
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
    const callChangeContext = buildCallChangeContext(activeEntries, allMsgsForContext);
    if (callChangeContext) contextText += '\n\n' + callChangeContext;

    const passWord = config.refinerPassKeyword || 'PASS';
    const promptTpl = config.refinerCustomPrompt || R.DEFAULT_PROMPT;
    let prompt = promptTpl
      .replace('{lore}', loreText)
      .replace('{memory}', memoryText)
      .replace('{context}', contextText)
      .replace('{message}', assistantText)
      .replace('{passWord}', passWord);
    prompt += '\n\nTARGET BOUNDARY: [New Speech] is the only text you may correct. [Recent Context] user messages are reference context and are never correction targets. Never return, rewrite, or substitute a user message as refined_text. Every replacements.from must be an exact substring of [New Speech]. If [New Speech] needs no change, return PASS only.';

    const _fallbackModel = _w.__LoreInj && _w.__LoreInj.getGenerationFallbackModel ? _w.__LoreInj.getGenerationFallbackModel(config) : 'gemini-3-flash-preview';
    const _refModel = (config.refinerModel === '_custom' ? config.refinerCustomModel : config.refinerModel)
                   || (config.autoExtModel === '_custom' ? config.autoExtCustomModel : (config.autoExtModel || _fallbackModel));
    let _refElapsedMs = 0, _refCost = null;
    try {
      const _isDeepSeekConfig = (config.autoExtApiType || 'key') === 'deepseek';
      const apiOpts = _w.__LoreInj && _w.__LoreInj.buildGenerationApiOpts
        ? _w.__LoreInj.buildGenerationApiOpts({ model: _refModel, maxRetries: 1, timeoutMs: _isDeepSeekConfig ? 90000 : 60000, maxOutputTokens: _isDeepSeekConfig ? 4096 : 2048 }, { feature: 'refine', chatKey: chatRoomId || 'global' })
        : {
          apiType: config.autoExtApiType || 'key',
          key: config.autoExtKey,
          deepSeekKey: config.autoExtDeepSeekKey,
          deepSeekThinking: config.autoExtDeepSeekThinking !== false,
          deepSeekReasoning: config.autoExtDeepSeekReasoning || 'high',
          deepSeekJsonSystemPrompt: config.deepSeekJsonSystemPrompt || '',
          vertexJson: config.autoExtVertexJson,
          vertexLocation: config.autoExtVertexLocation || 'global',
          vertexProjectId: config.autoExtVertexProjectId,
          firebaseScript: config.autoExtFirebaseScript,
          firebaseEmbedKey: config.autoExtFirebaseEmbedKey,
          model: _refModel,
          maxRetries: 1,
          timeoutMs: _isDeepSeekConfig ? 90000 : 60000,
          maxOutputTokens: _isDeepSeekConfig ? 4096 : 2048,
          costContext: { feature: 'refine', chatKey: chatRoomId || 'global' }
        };
      const isDeepSeekRefiner = apiOpts.apiType === 'deepseek';
      Core.showStatusBadge(isDeepSeekRefiner ? '에리가 딥식이에게 묻는 중' : '에리가 잼민이에게 묻는 중');
      if (ToastCallback) ToastCallback(isDeepSeekRefiner ? '에리가 딥식이로 응답 검수 중' : '에리가 응답 검수 중', '#258');
      if (isDeepSeekRefiner) {
        apiOpts.responseMimeType = 'application/json';
        prompt += '\n\nStructured output instruction:\nReturn valid json only. Use exactly one of these formats:\n{"pass":true,"reason":"PASS"}\n{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}\n{"reason":"교정 이유","refined_text":"전체 교정본"}';
      }

      const _refT0 = Date.now();
      const response = await Core.callGeminiApi(prompt, apiOpts);
      _refElapsedMs = Date.now() - _refT0;
      _refCost = (response && response.cost) || null;
      if (!response.text) {
        if (LogCallback) LogCallback(url, {
          time: new Date().toLocaleTimeString(),
          original: assistantText,
          result: 'API Error: ' + ((response && response.error) || 'AI 응답 없음'),
          isError: true,
          api: response ? { status: response.status, error: response.error, retries: response.retries } : null,
          model: _refModel,
          elapsedMs: _refElapsedMs,
          cost: _refCost
        });
        throw new Error((response && response.error) || 'AI 응답 없음');
      }
      const text = response.text.trim();

      const finishPass = (reason) => {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'PASS', isPass: true, reason: reason || 'PASS', model: _refModel, elapsedMs: _refElapsedMs, cost: _refCost });
        R.lastState = { state: 'idle', detail: '교정할 내용 없음', at: Date.now(), queue: R.refineQueue ? R.refineQueue.length : 0, busy: false };
        Core.hideStatusBadge();
      };

      const isPass = text.includes(passWord) && text.length < passWord.length + 10;
      if (isPass) {
        finishPass('PASS');
        return;
      }

      let parsed = null;
      try {
        const raw = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        const looseParser = _w.__LoreInj && _w.__LoreInj.parseJsonLoose;
        parsed = looseParser ? looseParser(raw) : JSON.parse(raw);
        if (!parsed) throw new Error('empty parsed json');
      } catch (e) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Parsing Error: ' + text.slice(0, 50), isError: true, model: _refModel, elapsedMs: _refElapsedMs, cost: _refCost });
        Core.hideStatusBadge();
        if (ToastCallback) ToastCallback('에리: 응답 해석 실패, 원본 유지', '#a55');
        return;
      }

      if (parsed && parsed.pass === true) {
        finishPass(parsed.reason || 'PASS');
        return;
      }

      if (parsed && !parsed.replacements && !parsed.refined_text) {
        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: '응답 구조 불명', isError: true, reason: parsed.reason || '(이유 없음)', model: _refModel, elapsedMs: _refElapsedMs, cost: _refCost });
        Core.hideStatusBadge();
        if (ToastCallback) ToastCallback('에리: 응답 구조 불명', '#a55');
        return;
      }

      if (parsed && (parsed.replacements || parsed.refined_text)) {
        let correctedText = assistantText;
        const replacements = parsed.replacements || [];
        if (replacements.length > 0) {
          for (const r of replacements) {
            if (r.from && r.to !== undefined && assistantText.includes(r.from)) correctedText = correctedText.replace(r.from, r.to);
          }
        } else if (parsed.refined_text) {
          correctedText = parsed.refined_text;
        }

        if (normalizeRefinerText(correctedText) === normalizeRefinerText(assistantText)) {
          finishPass(parsed.reason || '교정 대상 변경 없음');
          return;
        }
        if (isUserMessageEcho(correctedText, allMsgsForContext)) {
          finishPass('유저 입력이 교정본으로 반환되어 원본 유지');
          return;
        }

        if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Refined', isPass: false, refined: correctedText, reason: parsed.reason, model: _refModel, elapsedMs: _refElapsedMs, cost: _refCost });
        Core.showStatusBadge('에리가 뭔가 발견');
        setTimeout(Core.hideStatusBadge, 3000);

        const applyRefinement = async (newText) => {
          try {
            const _cid = Core.getCurrentChatId();
            if (!_cid) throw new Error('채팅방 ID 없음');
            const lastBot = targetLog && !(targetLog instanceof Error) ? targetLog : await CrackUtil.chatRoom().findLastBotMessage(_cid);
            if (lastBot && !(lastBot instanceof Error)) {
              const editResult = await patchChatMessage(_cid, lastBot.id, newText);
              const editText = editResult.text || '';
              const editJson = editResult.json || null;
              const serverOk = !!editResult.ok;
              const editData = editResult.data || (editJson && editJson.data) || null;
              const serverText = (editData && typeof editData.content === 'string') ? editData.content : newText;
              const serverMessageId = (editData && (editData._id || editData.id)) || lastBot.id;

              if (serverOk) {
                const newFp = serverMessageId || serverText.slice(0, 40);
                _loadChat(_currentChatKey()).add(newFp);
                saveProcessedFingerprints();
                // store update -> DOM apply -> lock fallback -> verify -> reload toast last resort
                const originalForDom = (lastBot && lastBot.content) || assistantText;
                const oldPlain = R.stripMarkdown ? R.stripMarkdown(originalForDom) : originalForDom;
                const newPlain = R.stripMarkdown ? R.stripMarkdown(serverText) : serverText;
                let targetEl = null;
                try {
                  targetEl = (R.findMessageContainerById && R.findMessageContainerById(serverMessageId))
                          || (R.findDeepestMatchingElement && R.findDeepestMatchingElement(oldPlain))
                          || null;
                } catch (_) {}
                const storeOk = !!(targetEl && R.tryStoreUpdate && R.tryStoreUpdate(targetEl, serverMessageId, serverText));
                // v11: gate innerHTML stomp behind path A failure.
                // When path A fired (RERENDER_HITS > 0), wrtn re-renders the bubble with its
                // own native markdown pipeline, which handles wrtn-specific code-block boxes,
                // editing-textarea seeds, etc. Our generic innerHTML stomp was racing with
                // that commit and producing the code-block-wrapping / stale-textarea artifacts.
                const hasCodeFence = /```/.test(serverText || '');
                const rerenderOk = (_w.__LR_LAST_RERENDER_HITS || 0) > 0;
                let domResult = null;
                let domUpdated = false;

                const verifyAndPatchVisible = async (delayMs) => {
                  if (delayMs) await new Promise(r => setTimeout(r, delayMs));
                  let visible = false;
                  try {
                    visible = R.waitForVisibleText
                      ? await R.waitForVisibleText(serverText, serverMessageId, 900)
                      : (R.isTextVisible ? R.isTextVisible(serverText, serverMessageId) : storeOk);
                  } catch (_) { visible = !!storeOk; }

                  if (!visible && R.refreshMessageInDOM && !hasCodeFence) {
                    let fallbackResult = null;
                    try { fallbackResult = R.refreshMessageInDOM(originalForDom, serverText, serverMessageId); } catch (_) {}
                    _w.__LR_LAST_DOM_FALLBACK = fallbackResult;
                    visible = !!(fallbackResult === true || (fallbackResult && (fallbackResult.applied || fallbackResult.visible)));
                  } else if (!visible && hasCodeFence) {
                    _w.__LR_LAST_DOM_FALLBACK = { skipped: true, status: 'skipped_codeblock', messageId: serverMessageId };
                  }

                  if (!visible && R.nudgeMessageNativeRender) {
                    let nudged = false;
                    try { nudged = !!(await R.nudgeMessageNativeRender(serverMessageId, serverText, originalForDom)); } catch (_) {}
                    _w.__LR_LAST_NATIVE_NUDGE = nudged;
                    if (nudged) {
                      try {
                        visible = R.waitForVisibleText
                          ? await R.waitForVisibleText(serverText, serverMessageId, 900)
                          : (R.isTextVisible ? R.isTextVisible(serverText, serverMessageId) : visible);
                      } catch (_) {}
                    }
                  }

                  if (!visible && delayMs && R.showReloadAction) R.showReloadAction('서버 수정 완료. 화면이 아직 예전 응답이면 새로고침 필요.');
                  return visible;
                };

                verifyAndPatchVisible(150).then((visible) => {
                  if (!visible) setTimeout(() => { verifyAndPatchVisible(0); }, 1200);
                });
                const newFingerprint = R.stripMarkdown ? R.stripMarkdown(serverText).slice(0, 80) : (serverText || '').slice(0, 80);
                if (newFingerprint) { _loadChat(_currentChatKey()).add(newFingerprint); saveProcessedFingerprints(); }
                if (ToastCallback) ToastCallback(`에리가 고침 — ${parsed.reason}`, '#285');
                console.log('[Refiner] PATCH 성공. id=', serverMessageId, 'status=', editResult.status, 'storeOk=', storeOk, 'rerenderOk=', rerenderOk, 'domResult=', domResult);
              } else {
                console.error('[Refiner] PATCH 실패. status=', editResult.status, 'body=', (editText || '').slice(0, 300));
                if (ToastCallback) ToastCallback(`에리: 서버 수정 실패 (${editResult.status})`, '#a55');
              }
            } else {
              if (ToastCallback) ToastCallback('에리: 대상 메시지 못 찾음, 로그에 보관', '#a55');
            }
          } catch (e) {
            if (ToastCallback) ToastCallback('에리: 수정 중 오류', '#a55');
          }
          // 큐 다음 처리
          if (enqueueCallback) setTimeout(enqueueCallback, 100);
        };

        if (config.refinerAutoMode) {
          await applyRefinement(correctedText);
        } else {
          const existingPopup = document.querySelector('#refiner-confirm-overlay');
          if (existingPopup) {
            if (ToastCallback) ToastCallback('에리: 제안을 로그에 보관함', '#258');
            if (enqueueCallback) setTimeout(enqueueCallback, 100);
          } else {
            holdRefineLock = true;
            R.showRefineConfirm(
              parsed.reason,
              correctedText,
              (newText) => { applyRefinement(newText).finally(releaseRefineLock); },
              () => { releaseRefineLock(); if (enqueueCallback) setTimeout(enqueueCallback, 100); }
            );
          }
        }
      }
    } catch (e) {
      if (LogCallback) LogCallback(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'System Error: ' + e.message, isError: true, model: _refModel, elapsedMs: _refElapsedMs, cost: _refCost });
      Core.hideStatusBadge();
      if (ToastCallback) ToastCallback(`에리: 교정 실패 — ${e.message}`, '#a55');
    }
    } finally {
      if (!holdRefineLock) releaseRefineLock();
    }
  }

  R.renderLoreForRefiner = renderLoreForRefiner;
  R.buildCallChangeContext = buildCallChangeContext;
  R.matchEntriesByTrigger = matchEntriesByTrigger;
  R.refineMessage = refineMessage;
  R.setCallbacks = function(coreInstance, configGetterFn, logCb, toastCb, getPacksCb) {
    Core = coreInstance;
    ConfigGetter = configGetterFn;
    LogCallback = logCb;
    ToastCallback = toastCb;
    GetActivePacksCallback = getPacksCb;
  };
  R.getProcessedFingerprints = function() { return _loadChat(_currentChatKey()); };
  R.saveProcessedFingerprints = saveProcessedFingerprints;
  R.__coreLoaded = true;

})();
