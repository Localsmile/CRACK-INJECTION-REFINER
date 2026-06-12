// == 인젝터 모듈 5/6 — inject ==
// 주입 파이프라인 + __loreRegister(inject)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  try {

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__extractLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__extractLoaded)) { console.error('[LoreInj:5] extract 미로드'); return; }
  if (_w.__LoreInj.__injectLoaded) return;

  const {
    C, db, _ls, settings, OOC_FORMATS,
    parseJsonLoose,
    getChatKey,
    getTurnCounter, getServerTurnCounterFromLogs,
    getCooldownMap, setCooldownLastTurn,
    addInjLog, runAutoExtract
  } = _w.__LoreInj;

  const MAX_INPUT_CHARS = 2000;
  const CLEANUP_KEY = 'lore-injection-cleanup-v1';
  const CLEANUP_MAX_ITEMS = 160;
  const CLEANUP_RECONCILE_LIMIT = 40;
  const CLEANUP_LOG_LIMIT = 90;
  let _cleanupTimer = null;
  let _cleanupRunning = false;

  function cleanupHash(text) {
    try { return C.simpleHash(String(text || '')); } catch (_) { return String(String(text || '').length); }
  }

  function loadCleanupState() {
    try {
      const raw = _ls.getItem(CLEANUP_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.items)) return parsed;
    } catch (_) {}
    return { version: 1, items: [] };
  }

  function saveCleanupState(state) {
    try {
      const now = Date.now();
      const items = Array.isArray(state.items) ? state.items.slice() : [];
      const live = items.filter(it => it && it.status !== 'done' && it.status !== 'stale' && it.status !== 'failed');
      const done = items
        .filter(it => it && !live.includes(it))
        .filter(it => !it.completedAt || now - it.completedAt < 7 * 24 * 60 * 60 * 1000)
        .slice(-40);
      const kept = live.slice(-CLEANUP_MAX_ITEMS).concat(done);
      _ls.setItem(CLEANUP_KEY, JSON.stringify({ version: 1, updatedAt: now, items: kept }));
      return true;
    } catch (e) {
      console.warn('[Lore] cleanup state save failed:', e);
      return false;
    }
  }

  function platformChatId() {
    try {
      const P = _w.__LorePlatform;
      return (P && P.getChatId && P.getChatId()) || (C.getCurrentChatId && C.getCurrentChatId());
    } catch (_) { return null; }
  }

  async function platformRecentMessages(chatId, maxCount, naturalOrder) {
    try {
      const P = _w.__LorePlatform;
      const logs = P && P.getRecentMessages
        ? await P.getRecentMessages({ chatId, maxCount: maxCount || CLEANUP_LOG_LIMIT, naturalOrder: naturalOrder !== false })
        : [];
      if (logs instanceof Error || !Array.isArray(logs)) return [];
      return logs;
    } catch (_) { return []; }
  }

  async function platformMessageById(chatId, messageId) {
    try {
      const P = _w.__LorePlatform;
      return P && P.getMessageById ? await P.getMessageById(chatId, messageId) : null;
    } catch (_) {}
    return null;
  }

  async function platformPatchMessage(chatId, messageId, nextText) {
    try {
      const P = _w.__LorePlatform;
      return P && P.patchMessage
        ? await P.patchMessage(chatId, messageId, nextText)
        : { ok: false, status: 0, error: 'platform_missing' };
    } catch (e) {
      return { ok: false, status: 0, error: e && e.message ? e.message : String(e) };
    }
  }

  function buildInjectedMessage(originalText, injectedText, position) {
    return position === 'before' ? injectedText + '\n\n' + originalText : originalText + '\n\n' + injectedText;
  }

  function messageIdOf(log) {
    return log && (log.id || log._id || log.messageId) ? String(log.id || log._id || log.messageId) : '';
  }

  function cleanInjectedContent(currentText, item) {
    const cur = String(currentText || '');
    const original = String(item.originalText || '');
    const injected = String(item.injectedText || '');
    const full = item.finalText || buildInjectedMessage(original, injected, item.position);
    if (cur === full) return { ok: true, text: original, mode: 'exact' };
    if (!original || !injected) return { ok: false, reason: 'missing_text' };
    if (!cur.includes(original) || !cur.includes(injected)) return { ok: false, reason: 'content_changed' };
    const before = cur;
    let next = before.replace(injected, '');
    next = next.replace(/\n{3,}/g, '\n\n').trim();
    if (next === original || cleanupHash(next) === item.originalHash) return { ok: true, text: next, mode: 'block' };
    return { ok: false, reason: 'unsafe_partial' };
  }

  function messageText(log) {
    return String((log && (log.content != null ? log.content : log.message)) || '');
  }

  function userTurnIndexFromLogs(logs) {
    if (!Array.isArray(logs) || !logs.length) return 0;
    let count = 0;
    for (const log of logs) if (log && log.role === 'user') count++;
    return count;
  }

  function userTurnsBetweenLogs(logs, fromMessageId) {
    if (!Array.isArray(logs) || !logs.length || !fromMessageId) return null;
    let found = false;
    let count = 0;
    for (const log of logs) {
      if (!log) continue;
      if (!found) {
        if (messageIdOf(log) === String(fromMessageId)) found = true;
        continue;
      }
      if (log.role === 'user') count++;
    }
    return found ? count : null;
  }

  function getLastUserMessageId(logs) {
    if (!Array.isArray(logs)) return '';
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log && log.role === 'user') return messageIdOf(log);
    }
    return '';
  }

  function countCharsAfter(logs, item) {
    if (!Array.isArray(logs) || !logs.length) return null;
    const full = item.finalText || buildInjectedMessage(item.originalText, item.injectedText, item.position);
    let idx = -1;
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (!log || log.role !== 'user') continue;
      if ((item.messageId && log.id === item.messageId) || messageText(log) === full) { idx = i; break; }
    }
    if (idx < 0) return null;
    let chars = 0;
    for (let i = idx + 1; i < logs.length; i++) chars += messageText(logs[i]).length;
    return chars;
  }

  function getWindowExitChars(item) {
    const raw = item && item.windowExitChars != null ? item.windowExitChars : settings.config.windowExitChars;
    const parsed = parseInt(raw, 10);
    return Math.max(1000, Number.isFinite(parsed) && parsed > 0 ? parsed : (C.DEFAULTS && C.DEFAULTS.windowExitChars) || 7000);
  }

  function isCleanupExpiredByFallback(item) {
    const createdAt = Number(item && item.createdAt) || 0;
    return createdAt > 0 && Date.now() - createdAt >= 24 * 60 * 60 * 1000;
  }

  function cooldownExpired(last, turnCounter, logs, config) {
    if (last === undefined || last === null) return true;
    const cooldownTurns = Math.max(0, parseInt(config.cooldownTurns || 0, 10) || 0);
    if (!cooldownTurns) return true;
    if (typeof last === 'object') {
      const msgId = last.messageId || last.msgId || last.injectedAtMsgId || '';
      const serverGap = userTurnsBetweenLogs(logs, msgId);
      if (serverGap != null) return serverGap >= cooldownTurns;
      const at = Number(last.at || last.timestamp || 0);
      if (at && Date.now() - at > 24 * 60 * 60 * 1000) return true;
      const idx = Number(last.turnIndex || last.turn || 0);
      if (idx && turnCounter != null) return (turnCounter - idx) >= cooldownTurns;
      return false;
    }
    const oldTurn = Number(last);
    if (!Number.isFinite(oldTurn)) return true;
    if (turnCounter != null && oldTurn > turnCounter) return true;
    return turnCounter == null || (turnCounter - oldTurn) >= cooldownTurns;
  }

  async function reconcileCleanupItem(item, logs) {
    if (!item || item.messageId) return false;
    const full = item.finalText || buildInjectedMessage(item.originalText, item.injectedText, item.position);
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log && log.role === 'user' && log.content === full && log.id) {
        item.messageId = log.id;
        item.status = 'tracked';
        item.linkedAt = Date.now();
        return true;
      }
    }
    item.linkAttempts = (item.linkAttempts || 0) + 1;
    item.lastLinkAttemptAt = Date.now();
    if (item.linkAttempts >= 12 && Date.now() - (item.createdAt || 0) > 10 * 60 * 1000) {
      item.status = 'stale';
      item.completedAt = Date.now();
    }
    return false;
  }

  async function runInjectionCleanup(reason) {
    if (settings.config.injectionCleanupEnabled === false) return;
    if (_cleanupRunning) return;
    const chatId = platformChatId();
    const chatKey = getChatKey();
    if (!chatId || !chatKey) return;
    const caps = _w.__LorePlatform && _w.__LorePlatform.capabilities ? _w.__LorePlatform.capabilities() : {};
    if (!caps.canReadLogs || !caps.canPatch) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(),
        turn: getTurnCounter(chatKey),
        matched: [],
        count: 0,
        reason: 'cleanup_unavailable',
        note: caps.canReadLogs ? '삽입 흔적 정리 중단: 메시지 수정 API 사용 불가' : '삽입 흔적 정리 중단: 대화 로그 읽기 불가'
      });
      return;
    }
    _cleanupRunning = true;
    try {
      const state = loadCleanupState();
      const items = state.items.filter(it => it && (it.chatId === chatId || it.chatKey === chatKey) && it.status !== 'done' && it.status !== 'failed' && it.status !== 'stale');
      if (!items.length) return;
      const logs = await platformRecentMessages(chatId, Math.max(CLEANUP_RECONCILE_LIMIT, CLEANUP_LOG_LIMIT), true);
      let changed = false;
      for (const item of items) {
        if (!item.messageId) changed = (await reconcileCleanupItem(item, logs)) || changed;
      }
      const currentTurn = getTurnCounter(chatKey);
      let cleaned = 0;
      for (const item of items) {
        if (cleaned >= 3) break;
        if (!item.messageId || item.status === 'stale') continue;
        const configuredChars = getWindowExitChars(item);
        const charsAfter = countCharsAfter(logs, item);
        const fallbackExpired = isCleanupExpiredByFallback(item);
        if (!(charsAfter != null ? charsAfter >= configuredChars : fallbackExpired)) continue;

        const cur = await platformMessageById(item.chatId || chatId, item.messageId);
        const currentText = cur && typeof cur.content === 'string' ? cur.content : null;
        if (!cur || cur.role !== 'user' || currentText == null) {
          item.cleanupAttempts = (item.cleanupAttempts || 0) + 1;
          item.lastCleanupAttemptAt = Date.now();
          changed = true;
          continue;
        }
        const clean = cleanInjectedContent(currentText, item);
        if (!clean.ok) {
          item.status = 'failed';
          item.failReason = clean.reason || 'unsafe';
          item.completedAt = Date.now();
          changed = true;
          addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: currentTurn, matched: [], count: 0, reason: 'cleanup_skip_' + item.failReason, note: '삽입 흔적 정리 건너뜀' });
          continue;
        }
        const patched = await platformPatchMessage(item.chatId || chatId, item.messageId, clean.text);
        item.cleanupAttempts = (item.cleanupAttempts || 0) + 1;
        item.lastCleanupAttemptAt = Date.now();
        if (patched.ok) {
          item.status = 'done';
          item.completedAt = Date.now();
          item.cleanedMode = clean.mode;
          cleaned++;
          addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: currentTurn, matched: [], count: 0, reason: 'cleanup_done', note: '최근 창을 지난 삽입 흔적 정리', messageId: item.messageId, charsAfter: charsAfter || null });
        } else if (item.cleanupAttempts >= 5) {
          item.status = 'failed';
          item.failReason = patched.error || ('http_' + patched.status);
          item.completedAt = Date.now();
          addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: currentTurn, matched: [], count: 0, reason: 'cleanup_failed', note: '삽입 흔적 정리 실패', status: patched.status });
        }
        changed = true;
      }
      if (changed) saveCleanupState(state);
      if (items.some(it => it && !it.messageId && it.status !== 'stale')) scheduleInjectionCleanup('pending-reconcile', 10000);
    } finally {
      _cleanupRunning = false;
    }
  }

  function scheduleInjectionCleanup(reason, delayMs) {
    if (settings.config.injectionCleanupEnabled === false) return;
    if (_cleanupTimer) clearTimeout(_cleanupTimer);
    _cleanupTimer = setTimeout(() => {
      _cleanupTimer = null;
      runInjectionCleanup(reason).catch(e => console.warn('[Lore] cleanup failed:', e));
    }, Math.max(250, delayMs || 2500));
  }

  function queueInjectionCleanup(chatKey, chatId, originalText, injectedText, finalText, turnCounter, position) {
    if (settings.config.injectionCleanupEnabled === false) return;
    const windowExitChars = getWindowExitChars(null);
    if (!chatId || !originalText || !injectedText || !finalText) return;
    const now = Date.now();
    const state = loadCleanupState();
    const item = {
      id: cleanupHash([chatId, turnCounter, now, finalText].join('|')),
      chatKey, chatId, messageId: null,
      turn: turnCounter, windowExitChars,
      createdAt: now, status: 'pending',
      position: position === 'after' ? 'after' : 'before',
      originalText, injectedText, finalText,
      originalHash: cleanupHash(originalText),
      injectedHash: cleanupHash(injectedText),
      finalHash: cleanupHash(finalText),
      linkAttempts: 0, cleanupAttempts: 0
    };
    state.items.push(item);
    saveCleanupState(state);
    scheduleInjectionCleanup('link-after-send', 3500);
  }

  function summaryOfEntry(e) {
    const s = e && e.summary;
    if (s && typeof s === 'object' && !Array.isArray(s)) return String(s.compact || s.full || s.micro || '');
    return String(s || e?.inject?.compact || e?.name || '');
  }

  function temporalCandidateId(e) {
    return String(e?.eventId || e?.id || e?.name || '');
  }

  function resolveActivePackState(url) {
    const packsByUrl = settings.config.urlPacks || {};
    const disabledByUrl = settings.config.urlDisabledEntries || {};
    let key = url;
    let packs = packsByUrl[key] || [];
    if (!packs.length) {
      try {
        const chatId = C.getCurrentChatId && C.getCurrentChatId();
        if (chatId) {
          const found = Object.keys(packsByUrl).find(k => k && k.includes(chatId) && packsByUrl[k] && packsByUrl[k].length);
          if (found) { key = found; packs = packsByUrl[found] || []; }
        }
      } catch (_) {}
    }
    return { key, packs, disabled: disabledByUrl[key] || [] };
  }

  function buildTemporalJudgeCandidates(scored, limit) {
    return (scored || [])
      .filter(s => s && s.entry && C.isTimelineEvent && C.isTimelineEvent(s.entry))
      .slice(0, Math.max(1, limit || 6))
      .map(s => {
        const e = s.entry;
        return {
          id: temporalCandidateId(e),
          name: e.name || e.title || '',
          anchor: e.when?.anchor || e.relativeTimeHint || e.timeline?.sceneLabel || '',
          participants: Array.isArray(e.participants) ? e.participants.slice(0, 6) : [],
          location: e.location || '',
          actions: Array.isArray(e.actions) ? e.actions.slice(0, 6) : [],
          hooks: Array.isArray(e.hooks) ? e.hooks.slice(0, 4) : [],
          summary: summaryOfEntry(e).slice(0, 220),
          score: Number((s.score || 0).toFixed ? s.score.toFixed(3) : s.score || 0),
          recall: s.temporalRecall?.score || s.components?.timelineRecall || 0
        };
      });
  }

  async function runTemporalRecallJudge(userInput, recentMsgs, scored, config, apiOpts) {
    if (!config.temporalRecallJudgeEnabled) return null;
    const candidates = buildTemporalJudgeCandidates(scored, config.temporalRecallJudgeCandidateLimit || 6);
    if (!candidates.length) return null;
    const recentText = Array.isArray(recentMsgs)
      ? recentMsgs.slice(-4).map(m => (m.role || '') + ': ' + String(m.message || '').slice(0, 180)).join('\n')
      : '';
    const schema = config.temporalRecallJudgeSchema || _w.__LoreInj.DEFAULT_TEMPORAL_RECALL_JUDGE_SCHEMA || '{}';
    const promptTpl = config.temporalRecallJudgePrompt || _w.__LoreInj.DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT || '';
    if (!promptTpl) return null;
    const prompt = promptTpl
      .replace('{schema}', schema)
      .replace('{context}', (recentText + '\nuser: ' + String(userInput || '').slice(0, 500)).trim())
      .replace('{candidates}', JSON.stringify(candidates, null, 2));
    try {
      // Phase 14 (v1.4.0-test.41): AbortController 도입으로 judge timeout 시 background fetch까지 취소.
      // kernel 단의 callGeminiApi가 opts.signal을 fetch/GM_xmlhttpRequest로 전달해야 해야 완전 취소 가능.
      // kernel 미지원 시 abort는 user-land race만 끊고, fetch 자체는 끝까지 실행됨(추후 kernel 보강 필요).
      const _judgeTimeoutMs = Math.max(0, Number(config.temporalRecallJudgeTimeoutMs || 0));
      const _judgeModel = (config.temporalRecallJudgeModel === '_custom' ? config.temporalRecallJudgeCustomModel : config.temporalRecallJudgeModel)
        || (_w.__LoreInj.getGenerationFallbackModel ? _w.__LoreInj.getGenerationFallbackModel(config) : 'gemini-3.1-flash-lite-preview');
      const _judgeAbortCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const _judgeCall = C.callGeminiApi(prompt, {
        ...apiOpts,
        model: _judgeModel,
        responseMimeType: 'application/json',
        maxRetries: 1,
        timeoutMs: Math.max(8000, _judgeTimeoutMs + 2000),
        maxOutputTokens: 512,
        thinkingConfig: (apiOpts && apiOpts.apiType) === 'deepseek' ? undefined : { thinkingLevel: config.temporalRecallJudgeReasoning || 'minimal' },
        deepSeekThinking: config.autoExtDeepSeekThinking !== false,
        deepSeekReasoning: config.autoExtDeepSeekReasoning || 'high',
        costContext: { feature: 'judge', chatKey: getChatKey() || 'global' },
        signal: _judgeAbortCtrl ? _judgeAbortCtrl.signal : undefined
      });
      let _judgeTimer = null;
      const res = _judgeTimeoutMs > 0
        ? await Promise.race([
            _judgeCall,
            new Promise((_, rej) => { _judgeTimer = setTimeout(() => {
              try { if (_judgeAbortCtrl) _judgeAbortCtrl.abort(); } catch (_) {}
              rej(new Error('temporal_judge_timeout'));
            }, _judgeTimeoutMs); })
          ]).finally(() => { if (_judgeTimer) { clearTimeout(_judgeTimer); _judgeTimer = null; } })
        : await _judgeCall;
      if (!res || !res.text) return { error: res?.error || 'empty_response', fallback: true };
      const parsed = (parseJsonLoose ? parseJsonLoose(res.text) : JSON.parse(res.text));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'invalid_json', fallback: true };
      const allowedModes = ['none', 'compact_timeline', 'specific_event', 'unresolved_hook'];
      const mode = allowedModes.includes(parsed.mode) ? parsed.mode : (parsed.recall ? 'compact_timeline' : 'none');
      let eventIds = Array.isArray(parsed.eventIds) ? parsed.eventIds.map(String).filter(Boolean) : [];
      const validIds = new Set(candidates.map(c => String(c.id)));
      eventIds = eventIds.filter(id => validIds.has(id)).slice(0, 3);
      return {
        recall: !!parsed.recall && mode !== 'none',
        mode,
        wantedDepth: parsed.wantedDepth || (mode === 'specific_event' ? 'detail' : (mode === 'none' ? 'none' : 'compact')),
        maxChars: Math.max(0, Math.min(600, Number(parsed.maxChars || 0))),
        eventIds,
        query: parsed.query && typeof parsed.query === 'object' ? parsed.query : {},
        reason: String(parsed.reason || '').slice(0, 160)
      };
    } catch (e) {
      console.warn('[LoreInj:temporal-judge] 실패, deterministic fallback 사용:', e && e.message);
      return { error: e.message || String(e), fallback: true };
    }
  }

  function applyTemporalJudge(scored, decision) {
    if (!decision || decision.error || decision.fallback) return scored;
    const selected = new Set((decision.eventIds || []).map(String));
    for (const s of scored || []) {
      if (!s || !s.entry || !(C.isTimelineEvent && C.isTimelineEvent(s.entry))) continue;
      const id = temporalCandidateId(s.entry);
      s.temporalJudge = decision;
      s.entry._temporalJudge = decision;
      if (!decision.recall) {
        if (s.components?.timelineRecall || s.temporalRecall) s.score *= 0.55;
        continue;
      }
      if (selected.has(id)) {
        const mult = decision.mode === 'specific_event' ? 1.45 : (decision.mode === 'unresolved_hook' ? 1.25 : 1.18);
        s.score *= mult;
      } else if (selected.size > 0 && (s.components?.timelineRecall || s.temporalRecall)) {
        s.score *= 0.85;
      }
    }
    scored.sort((a,b) => b.score - a.score);
    return scored;
  }

  function buildTemporalInjectionPlan(scored, decision, config, ctx = {}) {
    const empty = { text: '', entries: [], entryIds: [], eventIds: [], usedChars: 0, mode: 'none', level: 'none', source: 'none' };
    if (!config || config.temporalInjectionEnabled === false || !(C.isTimelineEvent && C.buildTemporalRecallBlock)) return empty;
    const rows = (scored || []).filter(s => s && s.entry && C.isTimelineEvent(s.entry));
    if (!rows.length) return empty;
    const validDecision = decision && !decision.error && !decision.fallback && decision.recall;
    const selected = new Set(validDecision && Array.isArray(decision.eventIds) ? decision.eventIds.map(String) : []);
    const hasTemporalSignal = (s) => selected.has(temporalCandidateId(s.entry)) || !!s.temporalRecall || Number(s.components?.timelineRecall || 0) > 0;
    const explicitMax = Math.max(1, config.temporalRecallExplicitMaxEvents || 3);
    const naturalMax = Math.max(1, config.temporalRecallMaxEvents || 2);
    let picked;
    if (selected.size) picked = rows.filter(s => selected.has(temporalCandidateId(s.entry))).slice(0, explicitMax);
    else if (validDecision) picked = rows.filter(hasTemporalSignal).slice(0, explicitMax);
    else picked = rows.filter(s => hasTemporalSignal(s) && (s.temporalRecall || Number(s.components?.timelineRecall || 0) >= 0.12)).slice(0, naturalMax);
    if (!picked.length) return empty;
    const mode = validDecision ? decision.mode : 'compact_timeline';
    const depth = validDecision ? decision.wantedDepth : 'compact';
    const budget = validDecision
      ? Math.max(120, Math.min(650, Number(decision.maxChars || config.temporalRecallChars || 450)))
      : Math.max(80, Math.min(config.temporalRecallChars || 450, config.temporalRecallNaturalChars || 260));
    const block = C.buildTemporalRecallBlock(picked, {
      decision: validDecision ? decision : { mode, wantedDepth: depth, maxChars: budget },
      mode,
      depth,
      budget,
      maxEvents: validDecision ? explicitMax : naturalMax,
      currentTurn: ctx.currentTurn || 0,
      compressionEnabled: config.temporalCompressionEnabled !== false,
      minCompressedChars: config.temporalCompressionMinChars || 40,
      preserveFields: config.temporalCompressionPreserveFields || ['participants', 'location', 'hooks']
    });
    if (!block || !block.text) return empty;
    const entries = block.entries || picked.map(s => s.entry);
    return {
      text: block.text,
      entries,
      entryIds: entries.map(temporalCandidateId).filter(Boolean),
      eventIds: block.eventIds || entries.map(temporalCandidateId).filter(Boolean),
      usedChars: block.usedChars || C.charLen(block.text),
      mode: block.mode || mode,
      level: block.level || depth,
      source: validDecision ? 'judge' : 'deterministic',
      compressionActions: block.compressionActions || [],
      droppedEventIds: block.droppedEventIds || []
    };
  }

  async function inject(userInput) {
    if (!settings.config.enabled) return userInput;
    const _url = C.getCurUrl(); const chatKey = getChatKey();
    let turnCounter = getTurnCounter(chatKey);
    scheduleInjectionCleanup('turn-start', 2500);

    const activePacksArr = typeof _w.__LoreInj.getActivePacksForUrl === 'function'
      ? _w.__LoreInj.getActivePacksForUrl(_url)
      : (resolveActivePackState(_url).packs || []);
    if (!activePacksArr.length) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(), turn: turnCounter,
        matched: [], count: 0, note: '활성 로어팩 없음',
        reason: 'no_active_packs', url: _url
      });
      return userInput;
    }
    const allForPacks = await db.entries.where('packName').anyOf(activePacksArr).toArray();
    const disabledSet = new Set(typeof _w.__LoreInj.getDisabledEntriesForUrl === 'function'
      ? _w.__LoreInj.getDisabledEntriesForUrl(_url)
      : (resolveActivePackState(_url).disabled || []));
    let enabled = allForPacks.filter(e => !disabledSet.has(e.id));
    if (!enabled.length) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(), turn: turnCounter,
        matched: [], count: 0, note: '사용 가능한 로어 없음',
        reason: 'no_enabled_entries', activePacks: activePacksArr.slice(0, 8)
      });
      return userInput;
    }

    const fetchCount = Math.max(20, (settings.config.scanRange || 6) * 3);
    const recentMsgs = await C.fetchLogs(fetchCount);
    const serverTurnCounter = getServerTurnCounterFromLogs
      ? getServerTurnCounterFromLogs(recentMsgs, true)
      : (Array.isArray(recentMsgs) && recentMsgs.length ? userTurnIndexFromLogs(recentMsgs) + 1 : 0);
    if (serverTurnCounter > 0) turnCounter = serverTurnCounter;
    const lastServerUserMsgId = getLastUserMessageId(recentMsgs);
    if (settings.config.autoExtEnabled && turnCounter > 0 && turnCounter % settings.config.autoExtTurns === 0) setTimeout(() => runAutoExtract(false), 100);

    const config = settings.config;
    const apiOpts = _w.__LoreInj.buildEmbeddingApiOpts
      ? _w.__LoreInj.buildEmbeddingApiOpts({ model: config.embeddingModel || 'gemini-embedding-001' }, { feature: 'embed', chatKey: chatKey || 'global' })
      : {
        apiType: config.autoExtApiType === 'deepseek' ? 'key' : (config.autoExtApiType || 'key'),
        key: config.autoExtApiType === 'deepseek' ? config.autoExtFirebaseEmbedKey : config.autoExtKey,
        vertexJson: config.autoExtVertexJson,
        vertexLocation: config.autoExtVertexLocation || 'global', vertexProjectId: config.autoExtVertexProjectId,
        firebaseScript: config.autoExtFirebaseScript, firebaseEmbedKey: config.autoExtFirebaseEmbedKey,
        model: config.embeddingModel || 'gemini-embedding-001',
        costContext: { feature: 'embed', chatKey: chatKey || 'global' }
      };
    const searchConfig = {
      chatKey: chatKey, turnCounter: turnCounter,
      scanRange: config.scanRange || 6, scanOffset: config.scanOffset || 0,
      strictMatch: config.strictMatch !== false, similarityMatch: config.similarityMatch === true,
      embeddingEnabled: config.embeddingEnabled || false, embeddingWeight: config.embeddingWeight || 0.4,
      decayEnabled: config.decayEnabled !== false, decayHalfLife: config.decayHalfLife || C.DEFAULTS.decayHalfLife,
      temporalGraphEnabled: config.temporalGraphEnabled !== false,
      unresolvedWeight: config.unresolvedWeight != null ? config.unresolvedWeight : C.DEFAULTS.unresolvedWeight,
      periodicRecallEnabled: config.periodicRecallEnabled !== false,
      timelineRetrievalEnabled: config.timelineRetrievalEnabled !== false,
      timelineRecallWeight: config.timelineRecallWeight != null ? config.timelineRecallWeight : (C.DEFAULTS.timelineRecallWeight || 0.32),
      timelineNoCuePenalty: config.timelineNoCuePenalty != null ? config.timelineNoCuePenalty : (C.DEFAULTS.timelineNoCuePenalty || 0.35),
      timelineRecallPoolLimit: config.timelineRecallPoolLimit || 12,
      aiMemoryTurns: config.aiMemoryTurns || 4, activeCharDetection: config.activeCharDetection !== false,
      activeCharBoost: config.activeCharBoostEnabled !== false ? C.DEFAULTS.activeCharBoost : 1.0,
      inactiveCharPenalty: config.activeCharBoostEnabled !== false ? C.DEFAULTS.inactiveCharPenalty : 1.0
    };

    let scored = [], activeNames = [], temporalJudgeDecision = null;
    try {
      const r = await C.hybridSearch(userInput, recentMsgs, enabled, searchConfig, apiOpts);
      scored = r.scored || []; activeNames = r.activeNames || [];
      if (C.resolveTemporalRecall && config.timelineRetrievalEnabled !== false) {
        const resolved = C.resolveTemporalRecall(userInput, recentMsgs, enabled, { currentTurn: turnCounter, activeNames, limit: 4 });
        if (resolved && resolved.candidates && resolved.candidates.length && (config.periodicRecallEnabled !== false || resolved.hasCue)) {
          const byId = new Map(scored.map(s => [s.entry.id, s]));
          for (const c of resolved.candidates) {
            const old = byId.get(c.entry.id);
            if (old) {
              if (old.components && old.components.timelineRecall > 0) {
                old.temporalRecall = old.temporalRecall || c;
                if (!old.matchedTrigger && c.matchedTriggers && c.matchedTriggers.length) old.matchedTrigger = c.matchedTriggers.join(',');
                continue;
              }
              old.score += c.score * (resolved.hasCue ? 0.75 : 0.35);
              old.temporalRecall = c;
            } else {
              const row = { entry: c.entry, score: c.score * (resolved.hasCue ? 0.9 : 0.45), tScore: 0, eSim: 0, matchedTrigger: (c.matchedTriggers || []).join(','), temporalRecall: c };
              scored.push(row);
              byId.set(c.entry.id, row);
            }
          }
          scored.sort((a,b) => b.score - a.score);
        }
      }
      temporalJudgeDecision = await runTemporalRecallJudge(userInput, recentMsgs, scored, config, apiOpts);
      if (temporalJudgeDecision && !temporalJudgeDecision.fallback && !temporalJudgeDecision.error) {
        scored = applyTemporalJudge(scored, temporalJudgeDecision);
      }
      if (r.searchStats && config.embeddingEnabled) {
        const sk = 'lore-hybrid-stats';
        const st = JSON.parse(_ls.getItem(sk) || '{"to":0,"eo":0,"b":0,"n":0,"injLog":[],"lastInjected":[]}');
        st.to += r.searchStats.trigOnly; st.eo += r.searchStats.embOnly; st.b += r.searchStats.both; st.n++;
        // Phase 12-fix: 시간축 회상 텔레메트리 누적.
        st.tRecall = (st.tRecall || 0) + (r.searchStats.temporalRecallCount || 0);
        st.tCue = (st.tCue || 0) + (r.searchStats.temporalRecallHasCue ? 1 : 0);
        if (st.lastInjected && st.lastInjected.length && recentMsgs.length >= 2) {
          const lastAIMsg = [...recentMsgs].reverse().find(m => m.role === 'assistant');
          const lastAI = (lastAIMsg?.message || '').toLowerCase();
          const reflected = st.lastInjected.filter(n => lastAI.includes(n.toLowerCase())).length;
          st.injLog.push(reflected / Math.max(st.lastInjected.length, 1));
          if (st.injLog.length > 30) st.injLog.shift();
        }
        // Phase 14 (v1.4.0-test.41): 자동 embeddingWeight 조정은 명시적 opt-in. 이전에는 매 20턴마다 사용자 설정을 덮어썼음 (예측 불가능 행동). config.autoTuneEmbeddingWeight === true일 때만 작동.
        if (config.autoTuneEmbeddingWeight === true && st.n > 0 && st.n % 20 === 0) {
          const total = st.to + st.eo + st.b;
          if (total > 5) {
            const embContrib = (st.eo + st.b * 0.5) / total;
            const avgReflection = st.injLog.length > 0 ? st.injLog.reduce((a,b) => a + b, 0) / st.injLog.length : 0.5;
            const feedbackAdj = avgReflection > 0.4 ? 0 : (0.4 - avgReflection) * 0.3;
            const target = Math.max(0.15, Math.min(0.65, embContrib + feedbackAdj));
            const smoothed = 0.7 * (config.embeddingWeight || 0.4) + 0.3 * target;
            settings.config.embeddingWeight = parseFloat(smoothed.toFixed(3)); settings.save();
          }
        }
        _ls.setItem(sk, JSON.stringify(st));
      }
    } catch(e) {
      const tr = C.triggerScan(userInput, recentMsgs, enabled, searchConfig);
      scored = tr.map(r => ({ entry: r.entry, score: r.triggerScore }));
      activeNames = C.detectActiveCharacters(recentMsgs, enabled);
    }

    for (const s of scored) {
      if (s.entry.rootId && !s.entry.isCurrentArc) s.score *= 0.3;
    }
    scored.sort((a,b) => b.score - a.score);

    if (activeNames.length >= 2 && config.firstEncounterWarning !== false) {
      for (let i = 0; i < activeNames.length; i++) {
        for (let j = i + 1; j < activeNames.length; j++) {
          try {
            await C.recordFirstEncounter(activeNames[i], activeNames[j], { turnApprox: turnCounter });
          } catch(e) {}
        }
      }
    }

    if (config.rerankEnabled) {
      try {
        C.showStatusBadge('에리가 로어 재정렬 중');
        const last2 = recentMsgs.slice(-4).map(m => m.role + ': ' + m.message).join('\n');
        const rerankModel = (config.rerankModel === '_custom' ? config.rerankCustomModel : config.rerankModel)
          || (config.autoExtModel === '_custom' ? config.autoExtCustomModel : config.autoExtModel)
          || (_w.__LoreInj.getGenerationFallbackModel ? _w.__LoreInj.getGenerationFallbackModel(config) : 'gemini-3-flash-preview');
        const rerankApiOpts = _w.__LoreInj.buildGenerationApiOpts ? _w.__LoreInj.buildGenerationApiOpts({
          model: rerankModel,
          costContext: { feature: 'rerank', chatKey: chatKey || 'global' }
        }, { feature: 'rerank', chatKey: chatKey || 'global' }) : {
          apiType: config.autoExtApiType || 'key', key: config.autoExtKey, deepSeekKey: config.autoExtDeepSeekKey,
          deepSeekThinking: config.autoExtDeepSeekThinking !== false, deepSeekReasoning: config.autoExtDeepSeekReasoning || 'high',
          vertexJson: config.autoExtVertexJson, vertexLocation: config.autoExtVertexLocation || 'global',
          vertexProjectId: config.autoExtVertexProjectId,
          firebaseScript: config.autoExtFirebaseScript,
          model: rerankModel,
          costContext: { feature: 'rerank', chatKey: chatKey || 'global' }
        };
        scored = await C.smartRerank(userInput, scored, last2, rerankApiOpts, config);
      } catch(e) {}
      // 리랭크 직후 hide 대신 "응답 기다리는 중"으로 전환 — Refiner가 실제 응답 감지 시 다음 상태로 교체/hide 담당
      C.showStatusBadge('에리가 응답 기다리는 중');
    }

    let cooldownFilteredAll = false;
    const scoredCountBeforeCooldown = scored.length;
    if (config.cooldownEnabled) {
      const cMap = getCooldownMap(chatKey);
      let staleCooldownCount = 0;
      scored = scored.filter(s => {
        const last = cMap[s.entry.id];
        if (last !== undefined && last !== null && typeof last !== 'object' && turnCounter != null && Number(last) > turnCounter) {
          delete cMap[s.entry.id];
          staleCooldownCount++;
          return true;
        }
        return cooldownExpired(last, turnCounter, recentMsgs, config);
      });
      if (staleCooldownCount > 0) settings.save();
      cooldownFilteredAll = scoredCountBeforeCooldown > 0 && !scored.length;
      if (cooldownFilteredAll) {
        addInjLog(chatKey, {
          time: new Date().toLocaleTimeString(), turn: turnCounter,
          matched: [], count: 0, note: '삽입 쿨타임 대기',
          reason: 'cooldown_filtered_all',
          cooldownTurns: config.cooldownTurns,
          activePacks: activePacksArr.slice(0, 8)
        });
      }
    }

    const windowText = (recentMsgs || []).map(m => m && (m.message || m.content) || '').join('\n').slice(-8000);
    let noveltySkippedCount = 0;
    const _filteredScored = scored.filter(s => {
      const explicitRecall = !!(s.temporalRecall && (s.temporalRecall.matchedTriggers || s.temporalRecall.reason));
      const gate = C.noveltyGate ? C.noveltyGate(s.entry, windowText, recentMsgs, { explicitRecall }) : { allow: true };
      if (!gate.allow) noveltySkippedCount++;
      return gate.allow;
    });
    const temporalPlan = buildTemporalInjectionPlan(_filteredScored, temporalJudgeDecision, config, { currentTurn: turnCounter });
    const temporalIds = new Set(temporalPlan.entryIds || []);
    // Phase 12-fix: timeline_event 항목은 시간축 채널 전용으로 처리.
    // temporalPlan에 채택되지 못한 timeline_event도 lore 섹션에서 generic formatter로 노출되지 않도록 제외.
    const _loreScored = _filteredScored.filter(s => {
      if (!s || !s.entry) return false;
      if (temporalIds.has(temporalCandidateId(s.entry))) return false;
      if (C.isTimelineEvent && C.isTimelineEvent(s.entry)) return false;
      return true;
    });
    const topScored = _loreScored.slice(0, config.maxEntries || 4);
    const topEntries = topScored.map(s => { if (s.components) s.entry._nway = s.components; return s.entry; });
    if (!topEntries.length && !temporalPlan.text) {
      if (!cooldownFilteredAll) {
        addInjLog(chatKey, {
          time: new Date().toLocaleTimeString(), turn: turnCounter,
          matched: [], count: 0, note: '삽입 후보 없음',
          reason: 'no_injection_candidates',
          activePacks: activePacksArr.slice(0, 8)
        });
      }
      return userInput;
    }

    const wrapper = (config.oocFormat || 'default') === 'default' && C.getDefaultMemoryWrapper
      ? C.getDefaultMemoryWrapper(C.detectChatLanguage ? C.detectChatLanguage([...(recentMsgs || []), userInput]) : 'ko')
      : { prefix: config.prefix || OOC_FORMATS.default.prefix, suffix: config.suffix || OOC_FORMATS.default.suffix };
    const pfx = wrapper.prefix || OOC_FORMATS.default.prefix;
    const sfx = wrapper.suffix || OOC_FORMATS.default.suffix;
    if (C.charLen(userInput) >= MAX_INPUT_CHARS - 20) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(), turn: turnCounter,
        matched: [], count: 0, note: '공간부족',
        budgetPlan: { userChars: C.charLen(userInput), maxInputChars: MAX_INPUT_CHARS },
        finalChars: C.charLen(userInput), reason: 'user_input_too_long'
      });
      return userInput;
    }

    let honorifics = '';
    if (config.honorificMatrixEnabled !== false) honorifics = C.formatHonorificMatrix(C.buildHonorificMatrix(enabled, activeNames), 80);
    let unmetPairs = [];
    if (config.firstEncounterWarning !== false) try { unmetPairs = await C.findUnmetPairs(activeNames); } catch(e) {}
    if (unmetPairs.length > 0) {
      const knownPairs = new Set();
      for (const r of enabled) {
        if (r.type !== 'rel' && r.type !== 'relationship') continue;
        let parties = r.parties || r.detail?.parties;
        if ((!parties || parties.length < 2) && typeof r.name === 'string') {
          if (r.name.includes('↔')) parties = r.name.split('↔').map(s => s.trim()).filter(Boolean);
          else if (r.name.includes('&')) parties = r.name.split('&').map(s => s.trim()).filter(Boolean);
        }
        if (parties && parties.length >= 2) knownPairs.add([parties[0], parties[1]].sort().join('|'));
      }
      if (knownPairs.size > 0) {
        unmetPairs = unmetPairs.filter(pair => !knownPairs.has([pair[0], pair[1]].sort().join('|')));
      }
    }

    let firstEncounterBlock = '';
    if (unmetPairs.length > 0 && config.firstEncounterWarning !== false) {
      try {
        const feKey = 'lore-fe-recent-' + chatKey;
        const log = JSON.parse(_ls.getItem(feKey) || '[]');
        const fresh = unmetPairs.filter(p => {
          const k = [...p].sort().join('|');
          const last = log.find(x => x.key === k);
          return !last || (turnCounter - last.turn) >= 5;
        });
        if (fresh.length > 0) {
          const pick = fresh[0];
          firstEncounterBlock = C.formatFirstEncounterBlock(pick);
          log.push({ key: [...pick].sort().join('|'), turn: turnCounter });
          _ls.setItem(feKey, JSON.stringify(log.slice(-20)));
          unmetPairs = unmetPairs.filter(p => p !== pick);
        }
      } catch(e) {}
    }

    let reunionTags = '';
    if (config.firstEncounterWarning !== false) {
      try {
        const reunions = await C.findReunionPairs(activeNames, turnCounter, 10);
        if (reunions.length > 0) {
          reunionTags = reunions.slice(0, 2).map(r => C.formatReunionTag(r.pair, r.gap)).join('\n');
        }
      } catch(e) {}
    }

    let sceneTag = '';
    if (recentMsgs.length > 0 && config.firstEncounterWarning !== false) {
      try {
        const kw = C.extractSceneKeywords(recentMsgs);
        sceneTag = C.formatSceneTag(kw);
      } catch(e) {}
    }

    try {
      await C.updateWorkingMemory(_url, {
        turn: turnCounter,
        activeChars: activeNames.slice(0, 5),
        scene: sceneTag,
        lastAction: (recentMsgs[recentMsgs.length - 1]?.message || '').slice(0, 80),
        updatedAt: Date.now()
      });
    } catch(e) {}

    let sceneStateBlock = '';
    try {
      const sceneState = C.updateSceneStateFromContext
        ? await C.updateSceneStateFromContext(chatKey, recentMsgs, activeNames)
        : (C.getSceneState ? await C.getSceneState(chatKey) : null);
      sceneStateBlock = C.formatSceneStateBlock
        ? C.formatSceneStateBlock(sceneState, activeNames, config.stateBlockChars || C.DEFAULTS.stateBlockChars || 450)
        : '';
    } catch(e) {}

    const temporalHints = (config.firstEncounterWarning !== false && C.formatTemporalHints)
      ? C.formatTemporalHints(topEntries, { currentTurn: turnCounter, activeNames, budget: Math.min(config.temporalHintChars || C.DEFAULTS.temporalHintChars || 120, 120) })
      : '';
    const fmtResult = C.planInjectionBudget ? C.planInjectionBudget({
      userInput,
      maxInputChars: MAX_INPUT_CHARS,
      entries: topEntries,
      activeNames,
      unmetPairs,
      stateBlock: sceneStateBlock,
      sceneTag,
      firstEncounterBlock,
      reunionTags,
      honorifics,
      temporalHints,
      temporalRecallBlock: temporalPlan.text,
      config,
      prefix: pfx,
      suffix: sfx
    }) : { injected: '', included: [], usedChars: 0, level: 'none', reason: 'planner_missing', finalChars: C.charLen(userInput), budgetPlan: {} };
    if (!fmtResult.injected) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(), turn: turnCounter,
        matched: [], count: 0, note: '주입 취소',
        budgetPlan: fmtResult.budgetPlan || {},
        finalChars: fmtResult.finalChars || C.charLen(userInput),
        reason: fmtResult.reason || 'empty'
      });
      return userInput;
    }

    const injected = fmtResult.injected;
    const allIncluded = (() => {
      const m = new Map();
      for (const e of [...(fmtResult.included || []), ...(temporalPlan.entries || [])]) {
        if (e && e.id != null) m.set(e.id, e);
      }
      return Array.from(m.values());
    })();

    try {
      for (const e of allIncluded) {
        setCooldownLastTurn(chatKey, e.id, { turnIndex: turnCounter, messageId: lastServerUserMsgId || '', at: Date.now() });
        try { await db.entries.update(e.id, { lastMentionedTurn: turnCounter, lastMentionedMsgId: lastServerUserMsgId || '', lastMentionedAt: Date.now() }); } catch(_) {}
      }
    } catch(e) {}

    try {
      const sk = 'lore-hybrid-stats'; const st = JSON.parse(_ls.getItem(sk) || '{}');
      st.lastInjected = allIncluded.map(e => e.name); _ls.setItem(sk, JSON.stringify(st));
    } catch(e) {}

    const _injectedLen = C.charLen(injected);
    const _userLen = C.charLen(userInput);
    const _finalChars = fmtResult.finalChars || (_userLen + _injectedLen + 2);
    addInjLog(chatKey, {
      time: new Date().toLocaleTimeString(), turn: turnCounter,
      matched: allIncluded.map(e => e.name), count: allIncluded.length,
      budget: fmtResult.budgetPlan?.loreBudget || 0, used: fmtResult.usedChars, level: fmtResult.level,
      activeChars: activeNames.slice(0, 5),
      userInputChars: _userLen, injectedChars: _injectedLen,
      totalChars: _finalChars, maxChars: MAX_INPUT_CHARS,
      budgetPlan: fmtResult.budgetPlan || {},
      downgraded: fmtResult.downgraded || [],
      dropped: fmtResult.dropped || [],
      finalChars: _finalChars,
      reason: fmtResult.reason || 'ok',
      temporalJudge: temporalJudgeDecision,
      temporalInjection: {
        source: temporalPlan.source,
        mode: temporalPlan.mode,
        level: temporalPlan.level,
        eventIds: temporalPlan.eventIds || [],
        chars: temporalPlan.usedChars || 0,
        compressionActions: temporalPlan.compressionActions || [],
        droppedEventIds: temporalPlan.droppedEventIds || []
      },
      noveltySkipped: noveltySkippedCount,
      bundled: fmtResult.bundledCount || 0,
      sections: {
        scene: fmtResult.sections?.scene || C.charLen(sceneTag || ''),
        state: fmtResult.sections?.state || C.charLen(sceneStateBlock || ''),
        firstEnc: fmtResult.sections?.firstEncounter || C.charLen(firstEncounterBlock || ''),
        reunion: fmtResult.sections?.reunion || C.charLen(reunionTags || ''),
        honor: fmtResult.sections?.honorifics || C.charLen(honorifics || ''),
        temporalRecall: fmtResult.sections?.temporalRecall || C.charLen(temporalPlan.text || ''),
        lore: C.charLen(fmtResult.text || '')
      }
    });

    const finalMessage = buildInjectedMessage(userInput, injected, config.position);
    try {
      queueInjectionCleanup(chatKey, platformChatId(), userInput, injected, finalMessage, turnCounter, config.position);
    } catch (e) {
      console.warn('[Lore] cleanup queue failed:', e);
    }
    return finalMessage;
  }

  if (_w.__loreRegister) _w.__loreRegister(inject);

  scheduleInjectionCleanup('module-load', 4000);

  Object.assign(_w.__LoreInj, { inject, runInjectionCleanup, __injectLoaded: true });
  console.log('[LoreInj:5] inject loaded & registered');
  } catch(fatal) {
    console.error('[LoreInj:5] FATAL — inject 등록 실패:', fatal, fatal?.stack);
    _w.__LoreInj = _w.__LoreInj || {};
    if (!_w.__LoreInj.inject) _w.__LoreInj.inject = async (u) => u;
    _w.__LoreInj.__injectLoaded = true;
  }
})();
