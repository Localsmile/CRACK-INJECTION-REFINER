// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.3.19
// @description 모듈화된 로어 인젝터 로더
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @updateURL   https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/crack-lore-core.user.js
// @downloadURL https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/crack-lore-core.user.js
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-toastify-injection@v1.0.0/crack/libraries/toastify-injection.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.0.0/crack/libraries/crack-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@chasm-shared-core@v1.0.0/libraries/chasm-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@decentralized-pre-1.0.15/decentralized-modal.js
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-ui.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-status.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-kernel.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-platform.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-memory.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-format.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-search.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-embedding.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/core-importer.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/refiner-render.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/refiner-dom.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/refiner-modal.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/refiner-prompts.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/refiner.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/injecter-1.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/injecter-2.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/injecter-3.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/injecter-4.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/injecter-5.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/injecter-ui-copy.js?v=260425-test-4
// @require     https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260425_test/embedding2/injecter-6.js?v=260425-test-4
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

// 로더 검증용, 인젝터 6개 모듈 로드 확인용
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 20000;
  const required = ['__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded', '__injectLoaded', '__uiLoaded'];
  const check = () => {
    const L = _w.__LoreInj;
    if (!L) { if (Date.now() < deadline) return setTimeout(check, 200); console.error('[LoreInj] __LoreInj 없음'); return; }
    const missing = required.filter(k => !L[k]);
    if (missing.length === 0) return;
    if (Date.now() < deadline) return setTimeout(check, 200);
    console.error('[LoreInj] 미로드 모듈:', missing);
  };
  check();
})();
