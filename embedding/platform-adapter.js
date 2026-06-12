// lore platform adapter
// Centralizes crack.wrtn.ai host access so feature modules do not bind to DOM/API details directly.
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LorePlatform && _w.__LorePlatform.__loaded) return;

  function crackUtil() {
    try { return _w.CrackUtil || (typeof CrackUtil !== 'undefined' ? CrackUtil : null); } catch (_) { return null; }
  }

  function pathname() {
    try { return _w.location && _w.location.pathname ? _w.location.pathname : ''; } catch (_) { return ''; }
  }

  function isChatPath(path) {
    const p = path || pathname();
    return /\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(p)
      || /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(p)
      || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(p);
  }

  function getChatId() {
    try {
      const CU = crackUtil();
      if (CU && CU.path && typeof CU.path === 'function') {
        const id = CU.path().chatRoom && CU.path().chatRoom();
        if (id) return id;
      }
    } catch (_) {}
    const p = pathname();
    const m = p.match(/\/(?:chats|episodes|c)\/([a-f0-9]+)/);
    return m ? m[1] : null;
  }

  function getChatUrlKey() {
    const id = getChatId();
    return id ? 'chat:' + id : pathname();
  }

  async function getRecentMessages(opts) {
    const chatId = opts && opts.chatId ? opts.chatId : getChatId();
    const maxCount = opts && opts.maxCount ? opts.maxCount : 90;
    const naturalOrder = !(opts && opts.naturalOrder === false);
    try {
      const CU = crackUtil();
      if (!CU || !CU.chatRoom || !chatId) return [];
      const logs = await CU.chatRoom().extractLogs(chatId, { maxCount, naturalOrder });
      return (logs instanceof Error || !Array.isArray(logs)) ? [] : logs;
    } catch (_) { return []; }
  }

  async function getMessageById(chatId, messageId) {
    try {
      const CU = crackUtil();
      if (CU && CU.chatRoom && typeof CU.chatRoom().getMessage === 'function') {
        const msg = await CU.chatRoom().getMessage(chatId, messageId);
        if (msg && !(msg instanceof Error)) return msg;
      }
    } catch (_) {}
    return null;
  }

  async function findLastAssistantMessage(chatId, opts) {
    const mode = opts && opts.messageIdOnly ? 'messageId' : 'bot';
    try {
      const CU = crackUtil();
      if (!CU || !CU.chatRoom || !chatId) return null;
      const room = CU.chatRoom();
      let msg = null;
      if (mode === 'messageId' && typeof room.findLastMessageId === 'function') {
        msg = await room.findLastMessageId(chatId, 'assistant');
      } else if (typeof room.findLastBotMessage === 'function') {
        msg = await room.findLastBotMessage(chatId);
      }
      return msg && !(msg instanceof Error) ? msg : null;
    } catch (_) { return null; }
  }

  function getAuthToken() {
    try {
      const CU = crackUtil();
      return CU && CU.cookie ? (CU.cookie().getAuthToken() || '') : '';
    } catch (_) { return ''; }
  }

  async function patchMessage(chatId, messageId, nextText) {
    const token = getAuthToken();
    if (!token || !chatId || !messageId) return { ok: false, status: 0, error: 'auth_or_id_missing' };
    try {
      const res = await fetch(`https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatId}/messages/${messageId}`, {
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
      let json = null;
      try { json = body ? JSON.parse(body) : null; } catch (_) {}
      return { ok: res.ok, status: res.status, body: body.slice(0, 300), json };
    } catch (e) {
      return { ok: false, status: 0, error: e && e.message ? e.message : String(e) };
    }
  }

  async function fetchPersonaName() {
    try {
      const chatId = getChatId();
      const CU = crackUtil();
      if (!CU || !chatId) return null;
      const persona = await CU.chatRoom().currentPersona(chatId);
      return persona && !(persona instanceof Error) && persona.name ? persona.name : null;
    } catch (_) { return null; }
  }

  async function getPlatformSummary() {
    return null;
  }

  function getLauncherMount() {
    try {
      const storyPath = /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(pathname()) || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(pathname());
      const panels = document.getElementsByClassName(storyPath ? 'css-1c5w7et' : 'css-l8r172');
      if (!panels || !panels.length) return null;
      const shell = panels[0];
      const carrier = shell.childNodes[panels.length - 1] || shell.lastElementChild || shell;
      const divs = carrier.getElementsByTagName ? carrier.getElementsByTagName('div') : [];
      if (!divs || !divs.length || !divs[0].children || !divs[0].children[0]) return null;
      const list = divs[0].children[0].children;
      const target = list && list.length ? list[list.length - 1] : null;
      return target ? { target, before: target.childNodes[0] || null } : null;
    } catch (_) { return null; }
  }

  function capabilities() {
    const CU = crackUtil();
    const chatId = getChatId();
    const chatApi = !!(CU && CU.chatRoom);
    const token = getAuthToken();
    return {
      hasCrackUtil: !!CU,
      hasChatRoomApi: chatApi,
      chatId,
      chatPath: isChatPath(),
      canReadLogs: !!(chatApi && chatId),
      canPatch: !!(token && chatId),
      canReadSummary: false
    };
  }

  _w.__LorePlatform = {
    __loaded: true,
    crackUtil,
    pathname,
    isChatPath,
    getChatId,
    getChatUrlKey,
    getRecentMessages,
    getMessageById,
    findLastAssistantMessage,
    patchMessage,
    getPlatformSummary,
    getAuthToken,
    fetchPersonaName,
    getLauncherMount,
    capabilities
  };
  console.log('[LorePlatform] loaded');
})();
