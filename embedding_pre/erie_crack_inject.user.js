// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test
// @description 모듈화된 로어 인젝터 로더
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @updateURL   https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/260427/embedding_pre/erie_crack_inject.user.js
// @downloadURL https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/260427/embedding_pre/erie_crack_inject.user.js
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/vendor/toastify-injection.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/vendor/crack-shared-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/vendor/chasm-shared-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/vendor/decentralized-modal.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-ui.js?v=1.3.8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-kernel.js?v=1.4.0-test-8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-platform.js?v=1.3.5
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-memory.js?v=1.4.0-test-6
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-format.js?v=1.4.0-test-6
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-search.js?v=1.4.0-test-6
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-embedding.js?v=1.4.0-test-8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/core-importer.js?v=1.4.0-test-3
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/refiner-prompts.js?v=1.4.0-test-2
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/refiner-dom.js?v=1.4.0-test-7
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/refiner-core.js?v=1.4.0-test-7
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/refiner-queue.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/refiner-observer.js?v=1.4.0-test-7
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/refiner.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-1.js?v=1.0.8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-2.js?v=1.4.0-test-8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-3.js?v=1.4.0-test-8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-4.js?v=1.4.0-test-6
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-5.js?v=1.4.0-test-6
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-main.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-lore.js?v=1.4.0-test-5
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-merge.js?v=1.4.0-test-5
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-snapshot.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-file.js?v=1.4.0-test-5
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-extract.js?v=1.4.0-test-3
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-refiner.js?v=1.4.0-test-2
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-log.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-session.js?v=1.4.0-test-8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-api.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-sub-help.js?v=1.4.0-test-8
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/refs/heads/260427/embedding/injecter-6-ui.js
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
    if (missing.length === 0) { console.log('[LoreInj v' + (L.VER || '?') + '] 전체 6개 모듈 로드 완료 (interceptor/const/settings/extract/inject/ui)'); return; }
    if (Date.now() < deadline) return setTimeout(check, 200);
    console.error('[LoreInj] 미로드 모듈:', missing);
  };
  check();
})();
