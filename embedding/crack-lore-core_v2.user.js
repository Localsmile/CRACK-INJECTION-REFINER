// ==UserScript==
// @name         crack-lore-core (Loader)
// @namespace    crack.lore.core
// @version      1.3.0
// @description  모듈화된 crack-lore-core 로더. 8개 코어 모듈을 순차 로드.
// @author       you
// @match        https://crack.wrtn.ai/*
// @require      https://unpkg.com/dexie@3.2.4/dist/dexie.min.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-ui.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-kernel.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-platform.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-memory.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-format.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-search.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-embedding.js
// @require      https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding/core-importer.js
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      generativelanguage.googleapis.com
// @connect      aiplatform.googleapis.com
// @connect      oauth2.googleapis.com
// @connect      *
// @run-at       document-start
// ==/UserScript==

// 로더 작업: 모듈 로드 완전성 검증
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C) { console.error('[LoreCore] 로드 실패: __LoreCore 없음'); return; }
  const required = ['__kernelLoaded', '__platformLoaded', '__memoryLoaded', '__formatLoaded', '__searchLoaded', '__embeddingLoaded', '__importerLoaded', '__uiLoaded'];
  const missing = required.filter(k => !C[k]);
  if (missing.length) console.error('[LoreCore] 미로드 모듈:', missing);
  else console.log('[LoreCore v' + (C.VER || '?') + '] 전체 모듈 로드 완료 (kernel/platform/memory/format/search/embedding/importer/ui)');
})();
