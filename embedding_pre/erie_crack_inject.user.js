// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test.62
// @description 모듈화된 로어 인젝터 로더
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @updateURL   https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260513/embedding_pre/erie_crack_inject.user.js
// @downloadURL https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260513/embedding_pre/erie_crack_inject.user.js
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @connect     generativelanguage.googleapis.com
// @connect     googleapis.com
// @connect     oauth2.googleapis.com
// @connect     firebasevertexai.googleapis.com
// @connect     www.gstatic.com
// @connect     contents-api.wrtn.ai
// @connect     crack-api.wrtn.ai
// @connect     *
// @run-at      document-start
// ==/UserScript==

(function () {
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const LOADER_VERSION = '1.4.0-test.62';
  const CDN_BASE = 'https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260513/embedding/';
  const CACHE = 'v=' + encodeURIComponent(LOADER_VERSION);
  const MODULES = [
    'https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js',
    CDN_BASE + 'vendor/toastify-injection.js?' + CACHE,
    CDN_BASE + 'vendor/crack-shared-core.js?' + CACHE,
    CDN_BASE + 'vendor/chasm-shared-core.js?' + CACHE,
    CDN_BASE + 'vendor/decentralized-modal.js?' + CACHE,
    CDN_BASE + 'core-ui.js?' + CACHE,
    CDN_BASE + 'core-kernel.js?' + CACHE,
    CDN_BASE + 'core-platform.js?' + CACHE,
    CDN_BASE + 'core-memory.js?' + CACHE,
    CDN_BASE + 'core-format.js?' + CACHE,
    CDN_BASE + 'core-search.js?' + CACHE,
    CDN_BASE + 'core-embedding.js?' + CACHE,
    CDN_BASE + 'core-pricing.js?' + CACHE,
    CDN_BASE + 'core-importer.js?' + CACHE,
    CDN_BASE + 'refiner-prompts.js?' + CACHE,
    CDN_BASE + 'refiner-dom.js?' + CACHE,
    CDN_BASE + 'refiner-core.js?' + CACHE,
    CDN_BASE + 'refiner-queue.js?' + CACHE,
    CDN_BASE + 'refiner-observer.js?' + CACHE,
    CDN_BASE + 'refiner.js?' + CACHE,
    CDN_BASE + 'injecter-1.js?' + CACHE,
    CDN_BASE + 'injecter-2.js?' + CACHE,
    CDN_BASE + 'injecter-3.js?' + CACHE,
    CDN_BASE + 'injecter-4.js?' + CACHE,
    CDN_BASE + 'injecter-5.js?' + CACHE,
    CDN_BASE + 'injecter-6.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-main.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-lore.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-merge.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-snapshot.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-file.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-extract.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-refiner.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-log.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-session.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-api.js?' + CACHE,
    CDN_BASE + 'injecter-6-sub-help.js?' + CACHE,
    CDN_BASE + 'injecter-6-ui.js?' + CACHE
  ];

  _w.__LoreInj = _w.__LoreInj || {};
  const L0 = _w.__LoreInj;
  L0.loaderVersion = LOADER_VERSION;
  L0.moduleStatus = L0.moduleStatus || {};
  L0.markLoaded = L0.markLoaded || function(name, meta) {
    L0.moduleStatus[name] = { ok: true, time: Date.now(), ...(meta || {}) };
    L0['__' + name + 'Loaded'] = true;
  };
  L0.markFailed = L0.markFailed || function(name, error, meta) {
    L0.moduleStatus[name] = {
      ok: false,
      time: Date.now(),
      error: String(error && error.message || error || 'unknown'),
      ...(meta || {})
    };
    L0['__' + name + 'Failed'] = true;
  };

  if (!L0.__menuQueue) {
    const _mq = [];
    const _smq = [];
    L0.__menuQueue = _mq;
    L0.__subMenuQueue = _smq;
    L0.registerMenu = function(key, cb) { _mq.push({ key, cb }); };
    L0.registerSubMenu = function(key, cb) { _smq.push({ key, cb }); };
  }

  if (!_w.__LoreInjReady) {
    let _resolve;
    const p = new Promise(r => { _resolve = r; });
    p.__resolve = _resolve;
    _w.__LoreInjReady = p;
  }

  function isChatPath(path = location.pathname) {
    return /\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(path)
      || /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(path)
      || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(path);
  }

  function isHomePath(path = location.pathname) {
    return path === '/' || path === '';
  }

  function updateRoute() {
    L0.route = {
      isChat: isChatPath(),
      isHome: isHomePath(),
      path: location.pathname,
      href: location.href
    };
  }

  function onRouteChange(cb) {
    let last = location.href;
    const fire = () => {
      if (last === location.href) return;
      last = location.href;
      updateRoute();
      try { cb(); } catch (e) { console.warn('[LoreInj] routechange callback 실패:', e); }
    };
    const patchHistory = (name) => {
      const orig = history[name];
      if (!orig || orig.__lorePatched) return;
      history[name] = function() {
        const ret = orig.apply(this, arguments);
        setTimeout(fire, 0);
        return ret;
      };
      history[name].__lorePatched = true;
    };
    try { patchHistory('pushState'); patchHistory('replaceState'); } catch (_) {}
    try { new MutationObserver(fire).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
    try { window.addEventListener('popstate', fire); } catch (_) {}
    try { window.addEventListener('hashchange', fire); } catch (_) {}
  }

  Object.assign(L0, {
    isChatPath,
    isHomePath,
    onRouteChange,
    runWhenChatRoute(init) {
      if (isChatPath()) return init();
      let started = false;
      onRouteChange(() => {
        if (started || !isChatPath()) return;
        started = true;
        init();
      });
    }
  });
  updateRoute();

  function showLoaderBadge(text, color = '#4a9') {
    try {
      const mount = document.body || document.documentElement;
      if (!mount) return;
      let el = document.getElementById('lore-lite-loader-badge');
      if (!el) {
        el = document.createElement('div');
        el.id = 'lore-lite-loader-badge';
        el.style.cssText = 'position:fixed;right:20px;bottom:70px;z-index:2147483646;background:#1a1a1a;border:1px solid #333;border-radius:20px;padding:8px 14px;font-size:12px;color:#ccc;box-shadow:0 4px 12px rgba(0,0,0,.4);font-family:inherit;pointer-events:none;';
        mount.appendChild(el);
      }
      el.textContent = text;
      el.style.borderColor = color;
    } catch (_) {}
  }

  function hideLoaderBadge() {
    try {
      const el = document.getElementById('lore-lite-loader-badge');
      if (el) el.remove();
    } catch (_) {}
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return res.text();
  }

  function startReadyGate() {
    const TIMEOUT_MS = 30000;
    const POLL_MS = 50;
    const SUB_SOFT_WAIT_MS = 7000;
    const gateDeadline = Date.now() + TIMEOUT_MS;
    const requiredCore = ['__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded', '__injectLoaded', '__inject6Loaded'];
    const requiredSubs = ['__subMainLoaded', '__subLoreLoaded', '__subMergeLoaded', '__subSnapshotLoaded', '__subFileLoaded', '__subExtractLoaded', '__subRefinerLoaded', '__subLogLoaded', '__subSessionLoaded', '__subApiLoaded', '__subHelpLoaded'];
    const requiredAll = requiredCore.concat(requiredSubs);
    let settled = false;

    const settle = (payload) => {
      if (settled) return;
      settled = true;
      try { _w.__LoreInjReady.__resolve(payload); } catch (_) {}
      try { _w.dispatchEvent(new CustomEvent('LoreInj:ready', { detail: payload })); } catch (_) {}
    };

    const check = () => {
      const L = _w.__LoreInj;
      updateRoute();
      const missingCore = requiredCore.filter(k => !L[k]);
      const missingSubs = requiredSubs.filter(k => !L[k]);
      if (missingCore.length === 0 && !L.__gateCoreReadyAt) L.__gateCoreReadyAt = Date.now();
      if (missingCore.length === 0 && missingSubs.length === 0) {
        L.allReady = true;
        console.log('[LoreInj v' + (L.VER || LOADER_VERSION) + '] 게이트 통과: 전체 모듈 로드');
        settle({ ok: true, ver: L.VER || LOADER_VERSION });
        hideLoaderBadge();
        return;
      }
      if (missingCore.length === 0 && missingSubs.length > 0 && Date.now() - (L.__gateCoreReadyAt || Date.now()) >= SUB_SOFT_WAIT_MS) {
        L.allReady = true;
        L.partialReady = true;
        L.missingSubs = missingSubs;
        console.warn('[LoreInj] 서브모듈 일부 미로드 — partial gate:', missingSubs);
        settle({ ok: true, ver: L.VER || LOADER_VERSION, partial: true, missingSubs, moduleStatus: L.moduleStatus || {} });
        hideLoaderBadge();
        return;
      }
      if (Date.now() < gateDeadline) return setTimeout(check, POLL_MS);
      const missing = requiredAll.filter(k => !L[k]);
      console.error('[LoreInj] 게이트 타임아웃:', missing, L.moduleStatus || {});
      settle({ ok: false, reason: 'timeout', missing, missingCore, missingSubs, moduleStatus: L.moduleStatus || {} });
      showLoaderBadge('로어 로드 지연: 콘솔 확인', '#d66');
    };
    check();
  }

  async function loadHeavyModules() {
    if (L0.__dynamicLoadStarted || L0.__dynamicLoaded) return;
    L0.__dynamicLoadStarted = true;
    L0.__dynamicLoadStartedAt = Date.now();
    showLoaderBadge('로어 모듈 로드 중');
    try {
      const codes = await Promise.all(MODULES.map(async (url) => {
        const code = await fetchText(url);
        return '\n/* ---- ' + url + ' ---- */\n' + code;
      }));
      const bundle = codes.join('\n');
      eval(bundle);
      L0.__dynamicLoaded = true;
      L0.__dynamicLoadedAt = Date.now();
      startReadyGate();
    } catch (e) {
      L0.__dynamicLoadError = String(e && e.message || e);
      console.error('[LoreInj] 동적 로드 실패:', e);
      showLoaderBadge('로어 로드 실패: 콘솔 확인', '#d66');
      try { _w.__LoreInjReady.__resolve({ ok: false, reason: 'dynamic-load-failed', error: L0.__dynamicLoadError }); } catch (_) {}
    }
  }

  if (isChatPath()) {
    loadHeavyModules();
  } else {
    console.log('[LoreInj loader ' + LOADER_VERSION + '] non-chat route: heavy modules deferred', location.pathname);
    onRouteChange(() => {
      if (isChatPath()) loadHeavyModules();
    });
  }
})();
