// crack-lore-core / platform 모듈
// 역할: crack.wrtn.ai 어댑터 — URL/채팅ID/로그/메모리/페르소나
// 의존: kernel (글로벌 CrackUtil)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:platform] kernel 미로드'); return; }
  if (C.__platformLoaded) return;

  function getCurUrl() { return window.location.pathname; }
  function getCurrentChatId() { try { return CrackUtil.path().chatRoom() || null; } catch (e) { return null; } }

  async function fetchLogs(count) {
    const chatId = getCurrentChatId();
    if (!chatId) return [];
    try {
      const items = await CrackUtil.chatRoom().extractLogs(chatId, { maxCount: count });
      if (items instanceof Error || !Array.isArray(items)) return [];
      return items.map(m => ({ role: m.role, message: m.content }));
    } catch (e) { return []; }
  }

  async function fetchAllMemories(chatRoomId) {
    let token = '';
    try { token = CrackUtil.cookie().getAuthToken(); } catch (e) {}
    if (!token) return { goal: [], shortTerm: [], relationship: [], longTerm: [] };
    const headers = { 'Authorization': 'Bearer ' + token };
    const result = { goal: [], shortTerm: [], relationship: [], longTerm: [] };
    const endpoints = {
      goal: { url: `https://contents-api.wrtn.ai/character-chat/v3/chats/${chatRoomId}/summaries?limit=10`, creds: true, hasTitle: false },
      shortTerm: { url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=shortTerm&orderBy=newest`, hasTitle: true },
      relationship: { url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=relationship&orderBy=newest`, hasTitle: true },
      longTerm: { url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=longTerm&orderBy=newest&filter=all`, hasTitle: true }
    };
    for (const [key, cfg] of Object.entries(endpoints)) {
      try {
        const opts = { method: 'GET', headers };
        if (cfg.creds) opts.credentials = 'include';
        const cleanUrl = cfg.url.replace(/\{\{|\}\}/g, '');
        const res = await fetch(cleanUrl, opts);
        const json = await res.json();
        if (json.result === 'SUCCESS' && json.data?.summaries) {
          result[key] = json.data.summaries.map(s => cfg.hasTitle ? `${s.title}: ${s.summary}` : s.summary);
        }
      } catch (e) {}
    }
    return result;
  }

  async function fetchPersonaName() {
    try {
      const chatId = getCurrentChatId();
      if (!chatId) return null;
      const persona = await CrackUtil.chatRoom().currentPersona(chatId);
      if (persona && !(persona instanceof Error) && persona.name) return persona.name;
    } catch (e) {}
    return null;
  }

  Object.assign(C, {
    getCurUrl, getCurrentChatId, fetchLogs, fetchAllMemories, fetchPersonaName,
    __platformLoaded: true
  });
  console.log('[LoreCore:platform] loaded');
})();
