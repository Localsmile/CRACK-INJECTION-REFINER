// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Router)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test.66
// @description 채팅방 전용 본체로 진입시키는 초경량 라우터
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @updateURL   https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding_pre/erie_crack_inject.user.js
// @downloadURL https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding_pre/erie_crack_inject.user.js
// @run-at      document-start
// @grant       none
// ==/UserScript==

(function () {
  'use strict';

  const ROUTER_VERSION = '1.4.0-test.66';
  const CHAT_SCRIPT_URL = 'https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding_pre/erie_crack_inject_chat.user.js';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInjRouter = _w.__LoreInjRouter || {};
  _w.__LoreInjRouter.version = ROUTER_VERSION;
  _w.__LoreInjRouter.chatScriptUrl = CHAT_SCRIPT_URL;

  function isChatPath(path = location.pathname) {
    return /\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(path)
      || /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(path)
      || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(path);
  }

  function updateRouteState() {
    _w.__LoreInjRouter.route = {
      isChat: isChatPath(),
      path: location.pathname,
      href: location.href,
      updatedAt: Date.now()
    };
  }

  function showHintOnce() {
    try {
      if (sessionStorage.getItem('lore-router-chat-hint-shown') === '1') return;
      sessionStorage.setItem('lore-router-chat-hint-shown', '1');
      console.info('[LoreInj router] 채팅방 전용 본체가 별도 스크립트로 필요함:', CHAT_SCRIPT_URL);
    } catch (_) {}
  }

  function reloadForChatRoute() {
    if (!isChatPath()) return;
    try {
      const key = 'lore-router-chat-reload:' + location.pathname;
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch (_) {}
    console.log('[LoreInj router] chat route detected via SPA; reloading for @require bootstrap');
    setTimeout(() => location.reload(), 50);
  }

  function onRouteChange(cb) {
    let last = location.href;
    const fire = () => {
      if (last === location.href) return;
      last = location.href;
      updateRouteState();
      try { cb(); } catch (e) { console.warn('[LoreInj router] route callback failed:', e); }
    };
    const patchHistory = (name) => {
      const orig = history[name];
      if (!orig || orig.__loreRouterPatched) return;
      history[name] = function() {
        const ret = orig.apply(this, arguments);
        setTimeout(fire, 0);
        return ret;
      };
      history[name].__loreRouterPatched = true;
    };
    try { patchHistory('pushState'); patchHistory('replaceState'); } catch (_) {}
    try { new MutationObserver(fire).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
    try { window.addEventListener('popstate', fire); } catch (_) {}
    try { window.addEventListener('hashchange', fire); } catch (_) {}
  }

  updateRouteState();
  if (isChatPath()) {
    showHintOnce();
    return;
  }

  console.log('[LoreInj router ' + ROUTER_VERSION + '] non-chat route: waiting for chat SPA navigation');
  onRouteChange(reloadForChatRoute);
})();
