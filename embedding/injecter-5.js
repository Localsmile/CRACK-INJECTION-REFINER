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
    getChatKey, incrementTurnCounter, recordEntryMention,
    getTurnCounter,
    getCooldownMap, setCooldownLastTurn,
    addInjLog, runAutoExtract
  } = _w.__LoreInj;

  const MAX_INPUT_CHARS = 2000;
  const CLEANUP_KEY = 'lore-injection-cleanup-v1';
  const CLEANUP_MAX_ITEMS = 160;
  const CLEANUP_RECONCILE_LIMIT = 40;
  const CLEANUP_LOG_LIMIT = 90;
  const CLEANUP_QUEUE_MAX_EDITS = 5;
  const CLEANUP_FALLBACK_MAX_EDITS = 5;
  const CLEANUP_FALLBACK_MIN_INTERVAL_MS = 4000;
  const LORE_CONTEXT_TAG_PATTERN = /\s*<ooc_lore_context>[\s\S]*?<\/ooc_lore_context>\s*/gi;
  let _cleanupTimer = null;
  let _cleanupRunning = false;
  let _cleanupPending = false;
  const _fallbackCleanupLastByChat = new Map();

  function cleanupHash(text) {
    try { return C.simpleHash(String(text || '')); } catch (_) { return String(String(text || '').length); }
  }

  function normalizeCleanupText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function compactCleanupItems(items) {
    const now = Date.now();
    const source = Array.isArray(items) ? items.filter(Boolean) : [];
    const live = source.filter(it => it.status !== 'done' && it.status !== 'stale' && it.status !== 'failed');
    const done = source
      .filter(it => it.status === 'done' || it.status === 'stale' || it.status === 'failed')
      .filter(it => !it.completedAt || now - it.completedAt < 7 * 24 * 60 * 60 * 1000)
      .sort((a, b) => (a.completedAt || a.createdAt || 0) - (b.completedAt || b.createdAt || 0))
      .slice(-80);
    return live.concat(done).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  function mergeCleanupItems(primary, secondary) {
    const merged = new Map();
    const add = (item) => {
      if (!item) return;
      const id = item.id || cleanupHash([item.chatId, item.turn, item.createdAt, item.finalHash || item.finalText].join('|'));
      const prev = merged.get(id);
      if (!prev || (item.completedAt || item.updatedAt || item.createdAt || 0) >= (prev.completedAt || prev.updatedAt || prev.createdAt || 0)) {
        merged.set(id, { ...item, id });
      }
    };
    (Array.isArray(primary) ? primary : []).forEach(add);
    (Array.isArray(secondary) ? secondary : []).forEach(add);
    return Array.from(merged.values());
  }

  async function loadCleanupState() {
    let legacyItems = [];
    let legacyRaw = '';
    try {
      legacyRaw = _ls.getItem(CLEANUP_KEY) || '';
      const parsed = legacyRaw ? JSON.parse(legacyRaw) : null;
      if (parsed && Array.isArray(parsed.items)) legacyItems = parsed.items.filter(Boolean);
    } catch (_) {}
    try {
      if (db.cleanupQueue) {
        const rows = await db.cleanupQueue.toArray();
        if (legacyItems.length) {
          await db.cleanupQueue.bulkPut(legacyItems);
          // Keep a journal written by a concurrent send after this read.
          try { if ((_ls.getItem(CLEANUP_KEY) || '') === legacyRaw) _ls.removeItem(CLEANUP_KEY); } catch (_) {}
        }
        const merged = mergeCleanupItems(rows, legacyItems);
        return { version: 2, items: compactCleanupItems(merged) };
      }
    } catch (e) {
      console.warn('[Lore] cleanup state DB load failed:', e);
    }
    return { version: 1, items: compactCleanupItems(legacyItems) };
  }

  async function saveCleanupState(state) {
    const kept = compactCleanupItems(state && state.items);
    try {
      if (db.cleanupQueue) {
        // Additive writes prevent a cleanup pass from deleting an item queued by a concurrent send.
        if (kept.length) await db.cleanupQueue.bulkPut(kept);
        try {
          const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
          await db.cleanupQueue.where('completedAt').below(cutoff).delete();
        } catch (_) {}
        return true;
      }
    } catch (e) {
      console.warn('[Lore] cleanup state DB save failed:', e);
    }
    try {
      const now = Date.now();
      _ls.setItem(CLEANUP_KEY, JSON.stringify({ version: 1, updatedAt: now, items: kept }));
      return true;
    } catch (e) {
      try {
        const now = Date.now();
        const live = kept.filter(it => it && it.status !== 'done' && it.status !== 'stale' && it.status !== 'failed');
        _ls.setItem(CLEANUP_KEY, JSON.stringify({ version: 1, updatedAt: now, compacted: true, items: live }));
        console.warn('[Lore] cleanup state save recovered after compacting:', e && e.message ? e.message : e);
        return true;
      } catch (e2) {
        console.warn('[Lore] cleanup state save failed:', e2);
      }
      return false;
    }
  }

  function getCrackUtilSafe() {
    try { return _w.CrackUtil || (typeof CrackUtil !== 'undefined' ? CrackUtil : null); } catch (_) { return null; }
  }

  function currentChatIdSafe() {
    try { return C.getCurrentChatId && C.getCurrentChatId(); } catch (_) { return null; }
  }

  async function fetchRawLogs(chatId, maxCount, naturalOrder) {
    try {
      const CU = getCrackUtilSafe();
      if (!CU || !CU.chatRoom || !chatId) return [];
      const logs = await CU.chatRoom().extractLogs(chatId, { maxCount: maxCount || CLEANUP_LOG_LIMIT, naturalOrder: naturalOrder !== false });
      if (logs instanceof Error || !Array.isArray(logs)) return [];
      return logs;
    } catch (_) { return []; }
  }

  async function getMessageById(chatId, messageId) {
    try {
      const CU = getCrackUtilSafe();
      if (CU && CU.chatRoom && typeof CU.chatRoom().getMessage === 'function') {
        const msg = await CU.chatRoom().getMessage(chatId, messageId);
        if (msg && !(msg instanceof Error)) return msg;
      }
    } catch (_) {}
    let token = '';
    try {
      const CU = getCrackUtilSafe();
      token = CU && CU.cookie ? CU.cookie().getAuthToken() : '';
    } catch (_) {}
    if (!token || !chatId || !messageId) return null;
    const urls = [
      `https://contents-api.wrtn.ai/character-chat/v3/chats/${chatId}/messages/${messageId}`,
      `https://contents-api.wrtn.ai/character-chat/character-chats/${chatId}/messages/${messageId}`,
      `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatId}/messages/${messageId}`
    ];
    for (const url of urls) {
      try {
        const fetcher = C.gmFetch || fetch;
        const res = await fetcher(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'platform': 'web',
            'wrtn-locale': 'ko-KR'
          }
        });
        if (!res || !res.ok) continue;
        const json = await res.json().catch(() => null);
        const data = json && (json.data || json.result || json);
        if (data && !(data instanceof Error)) return data;
      } catch (_) {}
    }
    return null;
  }

  async function patchUserMessage(chatId, messageId, nextText) {
    try {
      const CU = getCrackUtilSafe();
      if (CU && CU.chatRoom && typeof CU.chatRoom().editMessage === 'function') {
        const edited = await CU.chatRoom().editMessage(chatId, messageId, nextText);
        if (edited === true) return { ok: true, status: 200, via: 'CrackUtil.editMessage' };
      }
    } catch (_) {}
    let token = '';
    try {
      const CU = getCrackUtilSafe();
      token = CU && CU.cookie ? CU.cookie().getAuthToken() : '';
    } catch (_) {}
    if (!token || !chatId || !messageId) return { ok: false, status: 0, error: 'auth_or_id_missing' };
    const urls = [
      `https://contents-api.wrtn.ai/character-chat/v3/chats/${chatId}/messages/${messageId}`,
      `https://contents-api.wrtn.ai/character-chat/character-chats/${chatId}/messages/${messageId}`,
      `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatId}/messages/${messageId}`
    ];
    let last = { ok: false, status: 0, error: 'not_attempted' };
    for (const url of urls) {
      try {
        const fetcher = C.gmFetch || fetch;
        const res = await fetcher(url, {
          method: 'PATCH',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'platform': 'web',
            'wrtn-locale': 'ko-KR'
          },
          body: JSON.stringify({ message: nextText })
        });
        const body = await res.text().catch(() => '');
        let parsed = null;
        try { parsed = body ? JSON.parse(body) : null; } catch (_) {}
        const ok = !!(res.ok && (!parsed || parsed.result === 'SUCCESS' || parsed.ok !== false));
        last = { ok, status: res.status, body: body.slice(0, 300), via: url };
        if (ok) return last;
      } catch (e) {
        last = { ok: false, status: 0, error: e && e.message ? e.message : String(e), via: url };
      }
    }
    return last;
  }

  function messageIdOf(log) {
    return log && (log.id || log._id || log.messageId || log.msgId);
  }

  function messageTextOf(log) {
    if (!log) return null;
    if (typeof log.content === 'string') return log.content;
    if (typeof log.message === 'string') return log.message;
    if (log.data) return messageTextOf(log.data);
    return null;
  }

  function messageRoleOf(log) {
    if (!log) return '';
    const direct = String(log.role || log.speaker || log.data?.role || '').toLowerCase();
    if (direct) return direct;
    try { if (typeof log.isUser === 'function' && log.isUser()) return 'user'; } catch (_) {}
    try { if (typeof log.isBot === 'function' && log.isBot()) return 'assistant'; } catch (_) {}
    try { if (typeof log.isAssistant === 'function' && log.isAssistant()) return 'assistant'; } catch (_) {}
    return '';
  }

  function buildInjectedMessage(originalText, injectedText, position) {
    return position === 'before' ? injectedText + '\n\n' + originalText : originalText + '\n\n' + injectedText;
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
    const tagCleaned = cleanLoreContextTags(cur);
    if (tagCleaned && normalizeCleanupText(tagCleaned) === normalizeCleanupText(original)) {
      return { ok: true, text: original, mode: 'tag' };
    }
    return { ok: false, reason: 'unsafe_partial' };
  }

  function cleanLoreContextTags(currentText) {
    const cur = String(currentText || '');
    if (!cur || cur.indexOf('<ooc_lore_context>') < 0) return null;
    LORE_CONTEXT_TAG_PATTERN.lastIndex = 0;
    const next = cur.replace(LORE_CONTEXT_TAG_PATTERN, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!next || next === cur) return null;
    return next;
  }

  function refreshCleanedMessageInDOM(beforeText, afterText, messageId) {
    try {
      const refiner = _w.__LoreRefiner;
      if (refiner && typeof refiner.refreshMessageInDOM === 'function') {
        return refiner.refreshMessageInDOM(beforeText, afterText, messageId);
      }
    } catch (_) {}
    return null;
  }

  function shouldRunFallbackCleanupScan(chatKey, reason, queuedCount, queueCleaned) {
    const now = Date.now();
    const last = _fallbackCleanupLastByChat.get(chatKey) || 0;
    if (now - last < CLEANUP_FALLBACK_MIN_INTERVAL_MS) return false;
    const r = String(reason || '');
    if (!queuedCount) return true;
    if (queueCleaned < CLEANUP_FALLBACK_MAX_EDITS) return true;
    return r === 'module-load' || r === 'pending-reconcile';
  }

  async function runFallbackTagCleanup(chatId, chatKey, logs, maxEdits) {
    const configuredTurns = Math.max(1, parseInt(settings.config.injectionCleanupTurns || 8, 10) || 8);
    const availableLogs = Array.isArray(logs) && logs.length ? logs : await fetchRawLogs(chatId, CLEANUP_LOG_LIMIT, true);
    const userMsgs = availableLogs.filter(log => log && messageRoleOf(log) === 'user' && messageIdOf(log) && messageTextOf(log) != null);
    if (userMsgs.length <= configuredTurns) return { cleaned: 0, deferred: 0, failed: 0 };
    const candidates = userMsgs.slice(0, Math.max(0, userMsgs.length - configuredTurns));
    const currentTurn = getTurnCounter(chatKey);
    let cleaned = 0;
    let attempted = 0;
    let deferred = 0;
    let failed = 0;
    for (const log of candidates) {
      const cleanText = cleanLoreContextTags(messageTextOf(log));
      if (!cleanText) continue;
      if (attempted >= maxEdits) {
        deferred++;
        continue;
      }
      attempted++;
      const patched = await patchUserMessage(chatId, messageIdOf(log), cleanText);
      if (patched.ok) {
        refreshCleanedMessageInDOM(messageTextOf(log), cleanText, messageIdOf(log));
        cleaned++;
        addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: currentTurn, matched: [], count: 0, reason: 'cleanup_fallback_done', note: `${configuredTurns}턴 지난 삽입 태그 흔적 정리`, messageId: messageIdOf(log) });
      } else {
        failed++;
        addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: currentTurn, matched: [], count: 0, reason: 'cleanup_fallback_failed', note: '삽입 태그 흔적 정리 실패', status: patched.status });
      }
    }
    return { cleaned, deferred, failed };
  }

  function countUserTurnsAfter(logs, item) {
    if (!Array.isArray(logs) || !logs.length) return null;
    const full = item.finalText || buildInjectedMessage(item.originalText, item.injectedText, item.position);
    let idx = -1;
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (!log || messageRoleOf(log) !== 'user') continue;
      const body = messageTextOf(log);
      if ((item.messageId && messageIdOf(log) === item.messageId) || body === full) { idx = i; break; }
    }
    if (idx < 0) return null;
    let count = 0;
    for (let i = idx + 1; i < logs.length; i++) if (logs[i] && messageRoleOf(logs[i]) === 'user') count++;
    return count;
  }

  async function reconcileCleanupItem(item, logs) {
    if (!item || item.messageId) return false;
    const full = item.finalText || buildInjectedMessage(item.originalText, item.injectedText, item.position);
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      const body = messageTextOf(log);
      const msgId = messageIdOf(log);
      if (!log || messageRoleOf(log) !== 'user' || body == null) continue;
      if ((body === item.originalText || cleanupHash(body) === item.originalHash)) {
        if (msgId) item.messageId = msgId;
        item.status = 'done';
        item.cleanedMode = 'already_clean';
        item.completedAt = Date.now();
        item.linkedAt = Date.now();
        return true;
      }
      const safeMatch = cleanInjectedContent(body, item);
      const normalizedOriginal = normalizeCleanupText(item.originalText);
      const normalizedBody = normalizeCleanupText(body);
      const normalizedMatch = normalizedOriginal && normalizedBody.includes(normalizedOriginal) && body.indexOf('<ooc_lore_context>') >= 0;
      if ((body === full || safeMatch.ok || normalizedMatch) && msgId) {
        item.messageId = msgId;
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
    if (_cleanupRunning) {
      _cleanupPending = true;
      return;
    }
    const chatId = currentChatIdSafe();
    const chatKey = getChatKey();
    if (!chatId || !chatKey) return;
    _cleanupRunning = true;
    try {
      const state = await loadCleanupState();
      const items = state.items.filter(it => it && (it.chatId === chatId || it.chatKey === chatKey) && it.status !== 'done' && it.status !== 'failed' && it.status !== 'stale');
      const logs = await fetchRawLogs(chatId, Math.max(CLEANUP_RECONCILE_LIMIT, CLEANUP_LOG_LIMIT), true);
      let changed = false;
      for (const item of items) {
        if (!item.messageId) {
          const before = {
            messageId: item.messageId || null,
            status: item.status || null,
            linkAttempts: item.linkAttempts || 0,
            lastLinkAttemptAt: item.lastLinkAttemptAt || 0,
            completedAt: item.completedAt || 0
          };
          const linked = await reconcileCleanupItem(item, logs);
          changed = linked
            || changed
            || before.messageId !== (item.messageId || null)
            || before.status !== (item.status || null)
            || before.linkAttempts !== (item.linkAttempts || 0)
            || before.lastLinkAttemptAt !== (item.lastLinkAttemptAt || 0)
            || before.completedAt !== (item.completedAt || 0);
        }
      }
      const currentTurn = getTurnCounter(chatKey);
      let cleaned = 0;
      let attempted = 0;
      let queueDeferred = false;
      for (const item of items) {
        if (!item.messageId || item.status === 'stale') continue;
        const configuredTurns = Math.max(1, parseInt(settings.config.injectionCleanupTurns || item.cleanupAfterTurns || 8, 10) || 8);
        const serverTurns = countUserTurnsAfter(logs, item);
        const fallbackExpired = currentTurn && item.turn && (currentTurn - item.turn) >= configuredTurns;
        if (!(serverTurns != null ? serverTurns >= configuredTurns : fallbackExpired)) continue;
        if (attempted >= CLEANUP_QUEUE_MAX_EDITS) {
          queueDeferred = true;
          continue;
        }
        attempted++;

        const cur = await getMessageById(item.chatId || chatId, item.messageId);
        const currentText = messageTextOf(cur);
        if (!cur || messageRoleOf(cur) !== 'user' || currentText == null) {
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
        const patched = await patchUserMessage(item.chatId || chatId, item.messageId, clean.text);
        item.cleanupAttempts = (item.cleanupAttempts || 0) + 1;
        item.lastCleanupAttemptAt = Date.now();
        if (patched.ok) {
          refreshCleanedMessageInDOM(currentText, clean.text, item.messageId);
          item.status = 'done';
          item.completedAt = Date.now();
          item.cleanedMode = clean.mode;
          cleaned++;
          addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: currentTurn, matched: [], count: 0, reason: 'cleanup_done', note: `${configuredTurns}턴 지난 삽입 흔적 정리`, messageId: item.messageId });
        } else if (item.cleanupAttempts >= 5) {
          item.status = 'failed';
          item.failReason = patched.error || ('http_' + patched.status);
          item.completedAt = Date.now();
          addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: currentTurn, matched: [], count: 0, reason: 'cleanup_failed', note: '삽입 흔적 정리 실패', status: patched.status });
        }
        changed = true;
      }
      // Queue reconciliation can reject normalized legacy rows before making
      // any PATCH request. Preserve the fallback budget for those rows so the
      // tag-based pass can still clean them in the same run.
      const fallbackBudget = Math.max(0, CLEANUP_FALLBACK_MAX_EDITS - cleaned);
      if (fallbackBudget > 0 && shouldRunFallbackCleanupScan(chatKey, reason, items.length, cleaned)) {
        _fallbackCleanupLastByChat.set(chatKey, Date.now());
        const fallback = await runFallbackTagCleanup(chatId, chatKey, logs, fallbackBudget);
        if (fallback.deferred > 0) scheduleInjectionCleanup('fallback-drain', 5000);
      }
      if (queueDeferred) scheduleInjectionCleanup('queue-drain', 5000);
      if (changed) await saveCleanupState(state);
      if (items.some(it => it && !it.messageId && it.status !== 'stale')) scheduleInjectionCleanup('pending-reconcile', 10000);
    } finally {
      _cleanupRunning = false;
      if (_cleanupPending) {
        _cleanupPending = false;
        scheduleInjectionCleanup('pending-run', 1000);
      }
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

  function journalCleanupItem(item) {
    try {
      const raw = _ls.getItem(CLEANUP_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const current = parsed && Array.isArray(parsed.items) ? parsed.items : [];
      const items = compactCleanupItems(mergeCleanupItems(current, [item]));
      _ls.setItem(CLEANUP_KEY, JSON.stringify({ version: 2, updatedAt: Date.now(), journal: true, items }));
      return true;
    } catch (e) {
      console.warn('[Lore] cleanup journal save failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  function queueInjectionCleanup(chatKey, chatId, originalText, injectedText, finalText, turnCounter, position) {
    if (settings.config.injectionCleanupEnabled === false) return;
    const cleanupTurns = Math.max(1, parseInt(settings.config.injectionCleanupTurns || 8, 10) || 8);
    if (!chatId || !originalText || !injectedText || !finalText) return;
    const now = Date.now();
    const item = {
      id: cleanupHash([chatId, turnCounter, now, finalText].join('|')),
      chatKey, chatId, messageId: null,
      turn: turnCounter, cleanupAfterTurns: cleanupTurns,
      createdAt: now, status: 'pending',
      position: position === 'after' ? 'after' : 'before',
      originalText, injectedText, finalText,
      originalHash: cleanupHash(originalText),
      injectedHash: cleanupHash(injectedText),
      finalHash: cleanupHash(finalText),
      linkAttempts: 0, cleanupAttempts: 0
    };
    // The small synchronous journal survives an immediate refresh. IndexedDB
    // persistence is deliberately off the message-send critical path.
    journalCleanupItem(item);
    Promise.resolve().then(async () => {
      const state = await loadCleanupState();
      if (!state.items.some(row => row && row.id === item.id)) state.items.push(item);
      await saveCleanupState(state);
    }).catch(e => console.warn('[Lore] cleanup queue persist failed:', e));
    scheduleInjectionCleanup('link-after-send', 3500);
    return item;
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
        || (config.autoExtModel === '_custom' ? config.autoExtCustomModel : config.autoExtModel)
        || (_w.__LoreInj.getGenerationFallbackModel ? _w.__LoreInj.getGenerationFallbackModel(config) : 'gemini-3.1-flash-lite');
      const _judgeAbortCtrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const _judgeOpts = _w.__LoreInj.buildGenerationApiOpts
        ? _w.__LoreInj.buildGenerationApiOpts({
          model: _judgeModel,
          responseMimeType: 'application/json',
          maxRetries: 1,
          generationLane: 'interactive',
          timeoutMs: Math.max(8000, _judgeTimeoutMs + 2000),
          signal: _judgeAbortCtrl ? _judgeAbortCtrl.signal : undefined
        }, { feature: 'judge', chatKey: getChatKey() || 'global' })
        : {
          ...apiOpts,
          model: _judgeModel,
          responseMimeType: 'application/json',
          maxRetries: 1,
          generationLane: 'interactive',
          timeoutMs: Math.max(8000, _judgeTimeoutMs + 2000),
          deepSeekThinking: config.autoExtDeepSeekThinking !== false,
          deepSeekReasoning: config.autoExtDeepSeekReasoning || 'high',
          costContext: { feature: 'judge', chatKey: getChatKey() || 'global' },
          signal: _judgeAbortCtrl ? _judgeAbortCtrl.signal : undefined
        };
      const _judgeCall = C.callGeminiApi(prompt, _judgeOpts);
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
    const hasTemporalSignal = (s) => {
      if (s.temporalRecall?.blockedByProvenance && !s.temporalRecall?.hasExplicitCue) return false;
      return selected.has(temporalCandidateId(s.entry)) || !!s.temporalRecall || Number(s.components?.timelineRecall || 0) > 0;
    };
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

  function injectionDeadlineError(stage) {
    const error = new Error('injection_deadline:' + stage);
    error.code = 'LORE_INJECTION_DEADLINE';
    error.stage = stage;
    return error;
  }

  async function awaitWithinInjectionDeadline(taskOrFactory, deadlineAt, stage) {
    const startTask = () => typeof taskOrFactory === 'function' ? taskOrFactory() : taskOrFactory;
    if (!deadlineAt) return await startTask();
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw injectionDeadlineError(stage);
    let timer = null;
    try {
      return await Promise.race([
        startTask(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(injectionDeadlineError(stage)), remaining);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function inject(userInput, runtime = {}) {
    const startedAt = Date.now();
    const config = settings.config;
    const liveDeadlineEnabled = runtime.deadlineMs > 0
      && config.rerankEnabled !== true
      && config.temporalRecallJudgeEnabled !== true;
    const deadlineAt = liveDeadlineEnabled ? startedAt + Number(runtime.deadlineMs) : 0;
    const latency = {
      transport: runtime.transport || 'unknown',
      deadlineMs: liveDeadlineEnabled ? Number(runtime.deadlineMs) : 0,
      packReadMs: 0,
      logFetchMs: 0,
      searchMs: 0,
      totalMs: 0,
      fallback: ''
    };
    const publishLatency = (extra = {}) => {
      latency.totalMs = Date.now() - startedAt;
      Object.assign(latency, extra);
      _w.__LoreInj.__lastInjectionDiagnostics = { ...latency, at: Date.now() };
      return { ...latency };
    };
    const _url = C.getCurUrl(); const chatKey = getChatKey();
    const turnCounter = incrementTurnCounter(chatKey);
    scheduleInjectionCleanup('turn-start', 2500);
    if (settings.config.autoExtEnabled && turnCounter > 0 && turnCounter % settings.config.autoExtTurns === 0) {
      setTimeout(() => runAutoExtract(false).catch(error => console.warn('[Lore:auto-extract] scheduled run failed:', error)), 100);
    }
    if (settings.config.enabled === false) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(), turn: turnCounter,
        matched: [], count: 0, note: '자동 삽입 꺼짐', reason: 'injection_disabled', url: _url
      });
      return userInput;
    }

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
    const packReadAt = Date.now();
    const allForPacks = await db.entries.where('packName').anyOf(activePacksArr).toArray();
    latency.packReadMs = Date.now() - packReadAt;
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

    const fetchCount = Math.max(48, (settings.config.scanRange || 6) * 3);
    const logFetchAt = Date.now();
    let rawRecentMsgs = [];
    try {
      rawRecentMsgs = await awaitWithinInjectionDeadline(() => C.fetchLogs(fetchCount), deadlineAt, 'recent_logs');
    } catch (error) {
      if (error && error.code === 'LORE_INJECTION_DEADLINE') {
        latency.fallback = 'recent_logs_timeout';
        console.warn('[Lore] 실시간 로그 조회 지연, 현재 입력 기반 검색으로 전환');
      } else {
        throw error;
      }
    }
    latency.logFetchMs = Date.now() - logFetchAt;
    const recentMsgs = rawRecentMsgs.map(m => ({
      ...m,
      message: m.role === 'user' ? (cleanLoreContextTags(m.message) || m.message) : m.message
    }));

    const effectiveAiMemoryTurns = C.deriveAiMemoryTurns
      ? C.deriveAiMemoryTurns(recentMsgs, config)
      : (config.aiMemoryTurns || 4);
    let priorMemory = null;
    if (C.getWorkingMemory) {
      try {
        const memory = await C.getWorkingMemory(_url);
        const age = turnCounter - Number(memory && memory.turn || 0);
        if (memory && age >= 0 && age <= Math.max(1, Number(config.workingMemoryMaxAgeTurns || 3))) priorMemory = memory;
      } catch (_) {}
    }
    const liveEmbeddingTimeoutMs = liveDeadlineEnabled
      ? Math.max(250, Math.min(1500, deadlineAt - Date.now()))
      : 8000;
    const baseApiOpts = _w.__LoreInj.buildEmbeddingApiOpts
      ? _w.__LoreInj.buildEmbeddingApiOpts({ model: config.embeddingModel || 'gemini-embedding-001', embeddingLane: 'interactive', timeoutMs: liveEmbeddingTimeoutMs }, { feature: 'injectQueryEmbed', chatKey: chatKey || 'global' })
      : {
        apiType: config.autoExtApiType === 'deepseek' ? 'key' : (config.autoExtApiType || 'key'),
        key: config.autoExtApiType === 'deepseek' ? config.autoExtFirebaseEmbedKey : config.autoExtKey,
        vertexJson: config.autoExtVertexJson,
        vertexLocation: config.autoExtVertexLocation || 'global', vertexProjectId: config.autoExtVertexProjectId,
        firebaseScript: config.autoExtFirebaseScript, firebaseEmbedKey: config.autoExtFirebaseEmbedKey,
        model: config.embeddingModel || 'gemini-embedding-001',
        embeddingLane: 'interactive',
        timeoutMs: liveEmbeddingTimeoutMs,
        costContext: { feature: 'injectQueryEmbed', chatKey: chatKey || 'global' }
      };
    // Live queries use a paced interactive lane that is independent from bulk
    // search preparation, so chat sends stay responsive without bypassing diagnostics.
    const apiOpts = { ...baseApiOpts, embeddingLane: 'interactive', maxRetries: 0 };
    const searchConfig = {
      chatKey: chatKey, turnCounter: turnCounter,
      scanRange: config.scanRange || 6, scanOffset: config.scanOffset || 0,
      strictMatch: config.strictMatch !== false, similarityMatch: config.similarityMatch === true,
      embeddingEnabled: config.embeddingEnabled || false, embeddingWeight: config.embeddingWeight || 0.4,
      decayEnabled: config.decayEnabled !== false, decayHalfLife: config.decayHalfLife || C.DEFAULTS.decayHalfLife,
      temporalGraphEnabled: config.temporalGraphEnabled !== false,
      temporalWeight: config.temporalWeight != null ? config.temporalWeight : C.DEFAULTS.temporalWeight,
      activeEntityWeight: config.activeEntityWeight != null ? config.activeEntityWeight : C.DEFAULTS.activeEntityWeight,
      relationshipGraphWeight: config.relationshipGraphWeight != null ? config.relationshipGraphWeight : C.DEFAULTS.relationshipGraphWeight,
      unresolvedWeight: config.unresolvedWeight != null ? config.unresolvedWeight : C.DEFAULTS.unresolvedWeight,
      maintenanceWeight: config.maintenanceWeight != null ? config.maintenanceWeight : C.DEFAULTS.maintenanceWeight,
      periodicRecallEnabled: config.periodicRecallEnabled !== false,
      timelineRetrievalEnabled: config.timelineRetrievalEnabled !== false,
      timelineRecallWeight: config.timelineRecallWeight != null ? config.timelineRecallWeight : (C.DEFAULTS.timelineRecallWeight || 0.32),
      timelineNoCuePenalty: config.timelineNoCuePenalty != null ? config.timelineNoCuePenalty : (C.DEFAULTS.timelineNoCuePenalty || 0.35),
      timelineRecallPoolLimit: config.timelineRecallPoolLimit || 12,
      aiMemoryTurns: effectiveAiMemoryTurns, activeCharDetection: config.activeCharDetection !== false,
      activeCharBoost: config.activeCharBoostEnabled !== false ? C.DEFAULTS.activeCharBoost : 1.0,
      inactiveCharPenalty: config.activeCharBoostEnabled !== false ? C.DEFAULTS.inactiveCharPenalty : 1.0,
      workingMemory: priorMemory
    };

    let scored = [], activeNames = [], temporalJudgeDecision = null;
    const searchAt = Date.now();
    try {
      const r = await awaitWithinInjectionDeadline(
        () => C.hybridSearch(userInput, recentMsgs, enabled, searchConfig, apiOpts),
        deadlineAt,
        'hybrid_search'
      );
      scored = r.scored || []; activeNames = r.activeNames || [];
      if (C.resolveTemporalRecall && config.timelineRetrievalEnabled !== false) {
        const resolved = C.resolveTemporalRecall(userInput, recentMsgs, enabled, { currentTurn: turnCounter, activeNames, chatKey, limit: 4 });
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
      if (e && e.code === 'LORE_INJECTION_DEADLINE') {
        latency.fallback = e.stage || 'hybrid_search_timeout';
        console.warn('[Lore] 의미 검색 지연, 트리거 검색으로 전환:', latency.fallback);
      }
      const tr = C.triggerScan(userInput, recentMsgs, enabled, searchConfig);
      scored = tr.map(r => ({ entry: r.entry, score: r.triggerScore }));
      activeNames = C.detectActiveCharacters(recentMsgs, enabled);
    }
    latency.searchMs = Date.now() - searchAt;

    if (config.pendingPromiseBoost !== false) {
      for (const s of scored) { if (s.entry.type === 'promise' && s.entry.detail?.status === 'pending') s.score = Math.max(s.score, 0.3); }
      scored.sort((a,b) => b.score - a.score);
    }

    for (const s of scored) {
      if (s.entry.rootId && !s.entry.isCurrentArc) s.score *= 0.3;
    }
    scored.sort((a,b) => b.score - a.score);

    if (config.rerankEnabled) {
      try {
        C.showStatusBadge('에리가 로어 재정렬 중');
        const last2 = recentMsgs.slice(-4).map(m => m.role + ': ' + m.message).join('\n');
        const rerankModel = (config.rerankModel === '_custom' ? config.rerankCustomModel : config.rerankModel)
          || (config.autoExtModel === '_custom' ? config.autoExtCustomModel : config.autoExtModel)
          || (_w.__LoreInj.getGenerationFallbackModel ? _w.__LoreInj.getGenerationFallbackModel(config) : 'gemini-3-flash-preview');
        const rerankApiOpts = _w.__LoreInj.buildGenerationApiOpts ? _w.__LoreInj.buildGenerationApiOpts({
          model: rerankModel,
          generationLane: 'interactive',
          costContext: { feature: 'rerank', chatKey: chatKey || 'global' }
        }, { feature: 'rerank', chatKey: chatKey || 'global' }) : {
          apiType: config.autoExtApiType || 'key', key: config.autoExtKey, deepSeekKey: config.autoExtDeepSeekKey,
          deepSeekThinking: config.autoExtDeepSeekThinking !== false, deepSeekReasoning: config.autoExtDeepSeekReasoning || 'high',
          vertexJson: config.autoExtVertexJson, vertexLocation: config.autoExtVertexLocation || 'global',
          vertexProjectId: config.autoExtVertexProjectId,
          firebaseScript: config.autoExtFirebaseScript,
          model: rerankModel,
          generationLane: 'interactive',
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
        if (last !== undefined && turnCounter != null && Number(last) > turnCounter) {
          delete cMap[s.entry.id];
          staleCooldownCount++;
          return true;
        }
        return last === undefined || (turnCounter - last) >= config.cooldownTurns;
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

    // Delta skip: 최근 N턴 이내 동일 콘텐츠로 주입된 엔트리는 재주입 생략 (예산 확보).
    const _deltaKey = 'lore-recent-injections:' + chatKey;
    let _recentInj = {}; try { _recentInj = JSON.parse(_ls.getItem(_deltaKey) || '{}'); } catch(e) {}
    const _deltaTurns = config.deltaSkipTurns != null ? config.deltaSkipTurns : 3;
    let _deltaSkippedCount = 0;
    // Delta skip은 기본 OFF. 명시적으로 true로 켜야 동작 (재생성 시나리오와 충돌 방지)
    const _filteredScored = (config.deltaSkipEnabled !== true) ? scored : scored.filter(s => {
      const rec = _recentInj[s.entry.id];
      if (!rec) return true;
      if (turnCounter - (rec.turn || 0) >= _deltaTurns) return true;
      const sig = String(s.entry.lastUpdated || s.entry.ts || '');
      if (sig !== rec.sig) return true;
      _deltaSkippedCount++;
      return false;
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
    const topScored = C.selectDiverseCandidates
      ? C.selectDiverseCandidates(_loreScored, config.maxEntries || 4, {
          enabled: config.diversitySelectionEnabled !== false,
          relevanceWeight: config.diversityRelevanceWeight || 0.84,
          poolLimit: config.diversityCandidatePool || 12
        })
      : _loreScored.slice(0, config.maxEntries || 4);
    const topEntries = topScored.map(s => {
      if (s.components) s.entry._nway = s.components;
      s.entry._retrievalScore = Number(s.score) || 0;
      return s.entry;
    });
    let sceneTag = '';
    if (recentMsgs.length > 0) {
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
    if (!topEntries.length && !temporalPlan.text) {
      const latencyInfo = publishLatency();
      if (!cooldownFilteredAll) {
        addInjLog(chatKey, {
          time: new Date().toLocaleTimeString(), turn: turnCounter,
          matched: [], count: 0, note: '삽입 후보 없음',
          reason: 'no_injection_candidates', latency: latencyInfo,
          activePacks: activePacksArr.slice(0, 8)
        });
      }
      return userInput;
    }

    const pfx = config.prefix || OOC_FORMATS.default.prefix;
    const sfx = config.suffix || OOC_FORMATS.default.suffix;
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
    if (config.firstEncounterWarning !== false) try { unmetPairs = await C.findUnmetPairs(activeNames, chatKey); } catch(e) {}
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
        const reunions = await C.findReunionPairs(activeNames, turnCounter, 10, chatKey);
        if (reunions.length > 0) {
          reunionTags = reunions.slice(0, 2).map(r => C.formatReunionTag(r.pair, r.gap)).join('\n');
        }
      } catch(e) {}
    }

    // Read encounter/reunion state before recording this turn, then persist the current encounter for later turns.
    if (activeNames.length >= 2 && config.firstEncounterWarning !== false) {
      for (let i = 0; i < activeNames.length; i++) {
        for (let j = i + 1; j < activeNames.length; j++) {
          try {
            await C.recordFirstEncounter(activeNames[i], activeNames[j], { chatKey, turnApprox: turnCounter });
          } catch(e) {}
        }
      }
    }

    const temporalHints = C.formatTemporalHints
      ? C.formatTemporalHints(topEntries, { currentTurn: turnCounter, activeNames, budget: Math.min(config.temporalHintChars || C.DEFAULTS.temporalHintChars || 120, 120) })
      : '';
    const fmtResult = C.planInjectionBudget ? C.planInjectionBudget({
      userInput,
      maxInputChars: MAX_INPUT_CHARS,
      entries: topEntries,
      activeNames,
      unmetPairs,
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
        recordEntryMention(chatKey, e.id);
        setCooldownLastTurn(chatKey, e.id, turnCounter);
        try { await db.entries.update(e.id, { lastMentionedTurn: turnCounter }); } catch(_) {}
      }
    } catch(e) {}

    try {
      const sk = 'lore-hybrid-stats'; const st = JSON.parse(_ls.getItem(sk) || '{}');
      st.lastInjected = allIncluded.map(e => e.name); _ls.setItem(sk, JSON.stringify(st));
    } catch(e) {}

    const _injectedLen = C.charLen(injected);
    const _userLen = C.charLen(userInput);
    const _finalChars = fmtResult.finalChars || (_userLen + _injectedLen + 2);
    // Delta skip 기록 갱신
    try {
      for (const e of allIncluded) {
        _recentInj[e.id] = { turn: turnCounter, sig: String(e.lastUpdated || e.ts || '') };
      }
      for (const k of Object.keys(_recentInj)) {
        if (turnCounter - (_recentInj[k].turn || 0) > 20) delete _recentInj[k];
      }
      _ls.setItem(_deltaKey, JSON.stringify(_recentInj));
    } catch(e) {}

    const latencyInfo = publishLatency();
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
      variants: fmtResult.variants || [],
      finalChars: _finalChars,
      reason: fmtResult.reason || 'ok',
      temporalJudge: temporalJudgeDecision,
      latency: latencyInfo,
      temporalInjection: {
        source: temporalPlan.source,
        mode: temporalPlan.mode,
        level: temporalPlan.level,
        eventIds: temporalPlan.eventIds || [],
        chars: temporalPlan.usedChars || 0,
        compressionActions: temporalPlan.compressionActions || [],
        droppedEventIds: temporalPlan.droppedEventIds || []
      },
      deltaSkipped: _deltaSkippedCount,
      bundled: fmtResult.bundledCount || 0,
      sections: {
        scene: fmtResult.sections?.scene || C.charLen(sceneTag || ''),
        firstEnc: fmtResult.sections?.firstEncounter || C.charLen(firstEncounterBlock || ''),
        reunion: fmtResult.sections?.reunion || C.charLen(reunionTags || ''),
        honor: fmtResult.sections?.honorifics || C.charLen(honorifics || ''),
        temporalRecall: fmtResult.sections?.temporalRecall || C.charLen(temporalPlan.text || ''),
        lore: C.charLen(fmtResult.text || '')
      }
    });

    const finalMessage = buildInjectedMessage(userInput, injected, config.position);
    try {
      queueInjectionCleanup(chatKey, currentChatIdSafe(), userInput, injected, finalMessage, turnCounter, config.position);
    } catch (e) {
      console.warn('[Lore] cleanup queue failed:', e);
    }
    return finalMessage;
  }

  if (_w.__loreRegister) _w.__loreRegister(inject);

  scheduleInjectionCleanup('module-load', 4000);
  try {
    _w.addEventListener('online', () => scheduleInjectionCleanup('online', 1000));
    _w.addEventListener('focus', () => scheduleInjectionCleanup('focus', 1500));
    _w.document.addEventListener('visibilitychange', () => {
      if (_w.document.visibilityState === 'visible') scheduleInjectionCleanup('visible', 1500);
    });
  } catch (_) {}

  Object.assign(_w.__LoreInj, { inject, runInjectionCleanup, queueInjectionCleanup, __injectLoaded: true });
  console.log('[LoreInj:5] inject loaded & registered');
  } catch(fatal) {
    console.error('[LoreInj:5] FATAL — inject 등록 실패:', fatal, fatal?.stack);
    _w.__LoreInj = _w.__LoreInj || {};
    if (!_w.__LoreInj.inject) _w.__LoreInj.inject = async (u) => u;
    _w.__LoreInj.__injectLoaded = true;
  }
})();
