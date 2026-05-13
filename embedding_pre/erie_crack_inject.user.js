// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test.50
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

  // 메뉴 등록 큐 사전 설치 (document-start). 로더가 먼저 설치해야 sub 모듈이
  // injecter-6 보다 먼저 깨어나도 등록이 스텁 함수로 떨어지지 않음.
  _w.__LoreInj = _w.__LoreInj || {};
  const L0 = _w.__LoreInj;
  const BASE = 'https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260513/embedding/';
  const DYNAMIC_MODULES = [
    'https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js',
    BASE + 'vendor/toastify-injection.js',
    BASE + 'vendor/crack-shared-core.js',
    BASE + 'vendor/chasm-shared-core.js',
    BASE + 'vendor/decentralized-modal.js',
    BASE + 'core-ui.js?v=1.4.0-test.37',
    BASE + 'core-kernel.js?v=1.4.0-test.42',
    BASE + 'core-platform.js',
    BASE + 'core-memory.js?v=1.4.0-test.44',
    BASE + 'core-format.js?v=1.4.0-test.43',
    BASE + 'core-search.js?v=1.4.0-test.48',
    BASE + 'core-embedding.js?v=1.4.0-test.42',
    BASE + 'core-pricing.js?v=1.4.0-test.38',
    BASE + 'core-importer.js?v=1.4.0-test.37',
    BASE + 'refiner-prompts.js',
    BASE + 'refiner-dom.js',
    BASE + 'refiner-core.js?v=1.4.0-test.40',
    BASE + 'refiner-queue.js?v=1.4.0-test.38',
    BASE + 'refiner-observer.js?v=1.4.0-test.38',
    BASE + 'refiner.js',
    BASE + 'injecter-1.js',
    BASE + 'injecter-2.js?v=1.4.0-test.48',
    BASE + 'injecter-3.js?v=1.4.0-test.47',
    BASE + 'injecter-4.js?v=1.4.0-test.50',
    BASE + 'injecter-5.js?v=1.4.0-test.48',
    BASE + 'injecter-6.js?v=1.4.0-test.48',
    BASE + 'injecter-6-sub-main.js',
    BASE + 'injecter-6-sub-lore.js',
    BASE + 'injecter-6-sub-merge.js?v=1.4.0-test.40',
    BASE + 'injecter-6-sub-snapshot.js',
    BASE + 'injecter-6-sub-file.js',
    BASE + 'injecter-6-sub-extract.js?v=1.4.0-test.50',
    BASE + 'injecter-6-sub-refiner.js',
    BASE + 'injecter-6-sub-log.js?v=1.4.0-test.42',
    BASE + 'injecter-6-sub-session.js',
    BASE + 'injecter-6-sub-api.js?v=1.4.0-test.37',
    BASE + 'injecter-6-sub-help.js',
    BASE + 'injecter-6-ui.js?v=1.4.0-test.50'
  ];

  function isChatPath(path = location.pathname) {
    return /\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(path)
      || /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(path)
      || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(path);
  }
  function isHomePath(path = location.pathname) {
    return path === '/' || path === '';
  }
  function onRouteChange(cb) {
    let last = location.href;
    const tick = () => {
      if (last === location.href) return;
      last = location.href;
      try { cb(); } catch (e) { console.warn('[LoreInj] routechange callback 실패:', e); }
    };
    try { new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
    try { window.addEventListener('popstate', tick); } catch (_) {}
    try { window.addEventListener('hashchange', tick); } catch (_) {}
  }
  function runWhenChatRoute(init) {
    if (isChatPath()) return init();
    let started = false;
    onRouteChange(() => {
      if (started || !isChatPath()) return;
      started = true;
      init();
    });
  }
  Object.assign(L0, {
    route: { isChat: isChatPath(), isHome: isHomePath(), path: location.pathname, href: location.href },
    isChatPath,
    isHomePath,
    onRouteChange,
    runWhenChatRoute
  });
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
  if (!_w.__LoreInj.__menuQueue) {
    const _mq = [];
    const _smq = [];
    _w.__LoreInj.__menuQueue = _mq;
    _w.__LoreInj.__subMenuQueue = _smq;
    _w.__LoreInj.registerMenu = function(key, cb) { _mq.push({ key, cb }); };
    _w.__LoreInj.registerSubMenu = function(key, cb) { _smq.push({ key, cb }); };
  }

  function fetchScriptText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300 && res.responseText) resolve(res.responseText);
          else reject(new Error('load failed ' + res.status + ' ' + url));
        },
        onerror: () => reject(new Error('network error ' + url)),
        ontimeout: () => reject(new Error('timeout ' + url)),
        timeout: 30000
      });
    });
  }

  async function loadScriptIntoSandbox(url) {
    const src = await fetchScriptText(url);
    (0, eval)(src + '\n//# sourceURL=' + url);
  }

  function setLoaderBadge(text, color = '#285', sticky = false) {
    const show = () => {
      if (!document.body) return setTimeout(show, 100);
      let btn = document.getElementById('lore-dynamic-loader-badge');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'lore-dynamic-loader-badge';
        btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999999;background:#285;color:#fff;border:0;border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.35);max-width:260px;text-align:left;';
        btn.onclick = () => {
          const payload = {
            progress: L0.dynamicLoadProgress || null,
            failed: !!L0.dynamicLoadFailed,
            error: L0.dynamicLoadError || '',
            route: L0.route || null
          };
          if (L0.dynamicLoadFailed && confirm('Lore Injector module load failed.\n\n' + JSON.stringify(payload, null, 2).slice(0, 1200) + '\n\nRetry now?')) {
            try { L0.retryDynamicLoad && L0.retryDynamicLoad(); } catch (_) {}
          } else if (!L0.dynamicLoadFailed) {
            alert(JSON.stringify(payload, null, 2).slice(0, 1600));
          }
        };
        document.body.appendChild(btn);
      }
      btn.textContent = text;
      btn.style.background = color;
      btn.style.display = '';
      if (!sticky) {
        clearTimeout(btn.__hideTimer);
        btn.__hideTimer = setTimeout(() => {
          if (!L0.dynamicLoading && !L0.dynamicLoadFailed) btn.style.display = 'none';
        }, 2500);
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, { once: true });
    else show();
  }

  let dynamicLoadPromise = null;
  function startDynamicLoad() {
    if (dynamicLoadPromise) return dynamicLoadPromise;
    L0.dynamicLoading = true;
    L0.dynamicLoadFailed = false;
    L0.dynamicLoadError = '';
    L0.dynamicLoadStartedAt = Date.now();
    gateDeadline = Date.now() + TIMEOUT_MS;
    console.log('[LoreInj] chat route detected: dynamic module loading started');
    setLoaderBadge('Lore Injector loading modules...', '#285', true);
    dynamicLoadPromise = (async () => {
      for (let i = 0; i < DYNAMIC_MODULES.length; i++) {
        const url = DYNAMIC_MODULES[i];
        L0.dynamicLoadProgress = { index: i + 1, total: DYNAMIC_MODULES.length, url };
        setLoaderBadge('Lore loading ' + (i + 1) + '/' + DYNAMIC_MODULES.length, '#285', true);
        await loadScriptIntoSandbox(url);
      }
      L0.dynamicLoading = false;
      L0.dynamicLoaded = true;
      L0.dynamicLoadedAt = Date.now();
      setLoaderBadge('Lore Injector loaded', '#285');
      console.log('[LoreInj] dynamic module loading complete');
      return true;
    })().catch((err) => {
      L0.dynamicLoading = false;
      L0.dynamicLoadFailed = true;
      L0.dynamicLoadError = String(err && err.message || err);
      dynamicLoadPromise = null;
      setLoaderBadge('Lore load failed - tap for retry', '#833', true);
      try { L0.markFailed('dynamicLoader', err); } catch (_) {}
      console.error('[LoreInj] dynamic module loading failed:', err);
      throw err;
    });
    return dynamicLoadPromise;
  }

  // 전역 ready 게이트: UI 부트스트랩(injecter-6-ui)이 이걸 await 한 뒤에만 마운트한다.
  // document-start 시점에 노출해야 다른 모듈이 안전하게 참조 가능.
  if (!_w.__LoreInjReady) {
    let _resolve;
    const p = new Promise(r => { _resolve = r; });
    p.__resolve = _resolve;
    _w.__LoreInjReady = p;
  }

  const TIMEOUT_MS = 30000;
  const POLL_MS = 50;
  let gateDeadline = Date.now() + TIMEOUT_MS;

  // __uiLoaded 는 UI 가 게이트 통과 후 켜므로 제외.
  const requiredCore = ['__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded', '__injectLoaded', '__inject6Loaded'];
  const requiredSubs = ['__subMainLoaded', '__subLoreLoaded', '__subMergeLoaded', '__subSnapshotLoaded', '__subFileLoaded', '__subExtractLoaded', '__subRefinerLoaded', '__subLogLoaded', '__subSessionLoaded', '__subApiLoaded', '__subHelpLoaded'];
  const requiredAll = requiredCore.concat(requiredSubs);
  const SUB_SOFT_WAIT_MS = 7000;

  let _settled = false;
  const _settle = (payload) => {
    if (_settled) return;
    _settled = true;
    try { _w.__LoreInjReady.__resolve(payload); } catch (_) {}
    try { _w.dispatchEvent(new CustomEvent('LoreInj:ready', { detail: payload })); } catch (_) {}
  };

  const check = () => {
    const L = _w.__LoreInj;
    if (!L) {
      if (Date.now() < gateDeadline) return setTimeout(check, POLL_MS);
      console.error('[LoreInj] __LoreInj 없음 (코어 미로드)');
      _settle({ ok: false, reason: 'no-core', missing: ['__LoreInj'] });
      return;
    }
    L.route = {
      isChat: L.isChatPath ? L.isChatPath() : false,
      isHome: L.isHomePath ? L.isHomePath() : false,
      path: location.pathname,
      href: location.href
    };
    if (!L.route.isChat) {
      L.allReady = false;
      L.lightReady = true;
      console.log('[LoreInj] non-chat route: dynamic loader standby', L.route.path);
      return;
    }
    if (!L.dynamicLoaded) {
      if (!L.dynamicLoading) startDynamicLoad().then(() => setTimeout(check, 0)).catch(err => _settle({ ok: false, reason: 'dynamic-load-failed', error: String(err && err.message || err), progress: L.dynamicLoadProgress || null }));
      return;
    }
    const missingCore = requiredCore.filter(k => !L[k]);
    const missingSubs = requiredSubs.filter(k => !L[k]);
    if (missingCore.length === 0 && !L.__gateCoreReadyAt) L.__gateCoreReadyAt = Date.now();
    if (missingCore.length === 0 && missingSubs.length === 0) {
      L.allReady = true;
      console.log('[LoreInj v' + (L.VER || '?') + '] 게이트 통과: 코어 6 + 서브 11 전부 로드 + setupSubMenus 준비 → UI 부트스트랩 허용');
      _settle({ ok: true, ver: L.VER });
      // UI 마운트 사후 점검 (실패시 콘솔 경고만)
      const tail = Date.now() + 5000;
      const tailCheck = () => {
        if (L.__uiLoaded) { console.log('[LoreInj v' + (L.VER || '?') + '] UI 마운트 완료'); return; }
        if (Date.now() < tail) return setTimeout(tailCheck, 100);
        console.warn('[LoreInj] __uiLoaded 미설정 — UI 마운트가 도중에 죽었을 수 있음');
      };
      tailCheck();
      return;
    }
    if (missingCore.length === 0 && missingSubs.length > 0 && Date.now() - (L.__gateCoreReadyAt || Date.now()) >= SUB_SOFT_WAIT_MS) {
      L.allReady = true;
      L.partialReady = true;
      L.missingSubs = missingSubs;
      console.warn('[LoreInj] 서브모듈 일부 미로드 — partial gate로 UI 부트스트랩 허용:', missingSubs);
      console.warn('[LoreInj] 모듈 상태:', L.moduleStatus || {});
      _settle({ ok: true, ver: L.VER, partial: true, missingSubs, moduleStatus: L.moduleStatus || {} });
      const tail = Date.now() + 5000;
      const tailCheck = () => {
        if (L.__uiLoaded) { console.log('[LoreInj v' + (L.VER || '?') + '] UI 마운트 완료(partial)'); return; }
        if (Date.now() < tail) return setTimeout(tailCheck, 100);
        console.warn('[LoreInj] __uiLoaded 미설정 — partial gate 이후 UI 마운트가 도중에 죽었을 수 있음');
      };
      tailCheck();
      return;
    }
    if (Date.now() < gateDeadline) return setTimeout(check, POLL_MS);
    const missing = requiredAll.filter(k => !L[k]);
    console.error('[LoreInj] 게이트 타임아웃, 미로드 플래그:', missing);
    console.error('[LoreInj] 코어 미로드:', missingCore, '서브 미로드:', missingSubs);
    console.error('[LoreInj] 모듈 상태:', L.moduleStatus || {});
    _settle({ ok: false, reason: 'timeout', missing, missingCore, missingSubs, moduleStatus: L.moduleStatus || {} });
  };
  function handleDynamicLoadError(err) {
    console.error('[LoreInj] dynamic load will wait for user retry:', err);
    setLoaderBadge('Lore load failed - tap for retry', '#833', true);
  }
  L0.retryDynamicLoad = function() {
    if (L0.dynamicLoading) return dynamicLoadPromise;
    L0.dynamicLoadFailed = false;
    L0.dynamicLoadError = '';
    setLoaderBadge('Lore Injector retrying...', '#285', true);
    return startDynamicLoad().then(() => check()).catch(handleDynamicLoadError);
  };
  if (isChatPath()) {
    startDynamicLoad().then(() => check()).catch(handleDynamicLoadError);
  } else {
    console.log('[LoreInj] main/non-chat route: heavy modules are not loaded until chat route');
    runWhenChatRoute(() => {
      startDynamicLoad().then(() => check()).catch(handleDynamicLoadError);
    });
  }
})();
