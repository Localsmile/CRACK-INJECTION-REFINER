// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test.31
// @description 모듈화된 로어 인젝터 로더
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @updateURL   https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding_pre/erie_crack_inject.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding_pre/erie_crack_inject.user.js
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/vendor/toastify-injection.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/vendor/crack-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/vendor/chasm-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/vendor/decentralized-modal.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-ui.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-kernel.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-platform.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-memory.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-format.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-search.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-embedding.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/core-importer.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/refiner-prompts.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/refiner-dom.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/refiner-core.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/refiner-queue.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/refiner-observer.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/refiner.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-1.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-2.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-3.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-4.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-5.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-main.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-lore.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-merge.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-snapshot.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-file.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-extract.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-refiner.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-log.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-session.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-api.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-sub-help.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260427_plus/embedding/injecter-6-ui.js
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @connect     generativelanguage.googleapis.com
// @connect     googleapis.com
// @connect     oauth2.googleapis.com
// @connect     firebasevertexai.googleapis.com
// @connect     www.gstatic.com
// @connect     contents-api.wrtn.ai
// @connect     crack-api.wrtn.ai
// @run-at      document-start
// ==/UserScript==

(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 20000;
  const required = ['__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded', '__injectLoaded', '__uiLoaded'];
  const check = () => {
    const L = _w.__LoreInj;
    if (!L) { if (Date.now() < deadline) return setTimeout(check, 200); console.error('[LoreInj] __LoreInj 없음'); return; }
    const missing = required.filter(k => !L[k]);
    if (missing.length === 0) { console.log('[LoreInj v' + (L.VER || '?') + '] 전체 6개 모듈 로드 완료 (interceptor/const/settings/extract/inject/ui)'); return; }
    if (Date.now() < deadline) return setTimeout(check, 200);
    console.error('[LoreInj] 미로드 모듈:', missing);
  };
  check();
})();
