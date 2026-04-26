// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.49-test
// @description 모듈화된 로어 인젝터 로더
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @updateURL   https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/erie_crack_inject.user.js
// @downloadURL https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/erie_crack_inject.user.js
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// 외부 milkyway0308 모달/공용 스크립트는 파서 충돌 방지를 위해 제거.
// UI shell은 injecter-6.js의 standalone shell로 동작.
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-ui.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-kernel.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-platform.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-memory.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-format.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-search.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-embedding.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/core-importer.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/refiner.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-1.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-2.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-3.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-4.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-5.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-utils.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-start.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-settings.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-lore.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-extract.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-refiner.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-api-help.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-logs.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-merge.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-ui-panels-advanced.js?v=1.4.49-test
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260425_test/embedding2/injecter-6.js?v=1.4.49-test
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

  const requiredInjectorFlags = [
    '__interceptorLoaded',
    '__constLoaded',
    '__settingsLoaded',
    '__extractLoaded',
    '__injectLoaded',
    '__uiLoaded'
  ];

  const requiredUiFlags = [
    '__utilsLoaded',
    '__entrypointsLoaded'
  ];

  const requiredPanelIds = [
    'dashboard',
    'api',
    'settings',
    'loreManager',
    'extract',
    'refiner',
    'logs',
    'advanced'
  ];

  function check() {
    const L = _w.__LoreInj;
    const UI = _w.__LoreInjUI;

    if (!L) {
      if (Date.now() < deadline) return setTimeout(check, 200);
      console.error('[LoreInj] __LoreInj 없음');
      return;
    }

    const missingFlags = requiredInjectorFlags.filter(k => !L[k]);
    const missingUiFlags = requiredUiFlags.filter(k => !(UI && UI[k]));
    const panelIds = UI && typeof UI.getPanels === 'function' ? UI.getPanels().map(p => p.id) : [];
    const missingPanels = requiredPanelIds.filter(id => !panelIds.includes(id));

    if (missingFlags.length === 0 && missingUiFlags.length === 0 && missingPanels.length === 0) {
      console.log('[LoreInj v' + (L.VER || '?') + '] modular loader ready. Panels:', panelIds.join(', '));
      return;
    }

    if (Date.now() < deadline) return setTimeout(check, 200);

    if (missingFlags.length) console.error('[LoreInj] 미로드 모듈:', missingFlags);
    if (missingUiFlags.length) console.error('[LoreInj] 미로드 UI 모듈:', missingUiFlags);
    if (missingPanels.length) console.error('[LoreInj] 미로드 UI 패널:', missingPanels);
    console.error('[LoreInj] 현재 UI 패널:', panelIds);
  }

  check();
})();