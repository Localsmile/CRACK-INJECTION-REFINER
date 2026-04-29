// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test.32
// @description 모듈화된 로어 인젝터 로더 (ready-gate)
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @updateURL   https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding_pre/erie_crack_inject.user.js
// @downloadURL https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding_pre/erie_crack_inject.user.js
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/vendor/toastify-injection.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/vendor/crack-shared-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/vendor/chasm-shared-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/vendor/decentralized-modal.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-ui.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-kernel.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-platform.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-memory.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-format.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-search.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-embedding.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/core-importer.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/refiner-prompts.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/refiner-dom.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/refiner-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/refiner-queue.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/refiner-observer.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/refiner.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-1.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-2.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-3.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-4.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-5.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-main.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-lore.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-merge.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-snapshot.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-file.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-extract.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-refiner.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-log.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-session.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-api.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-sub-help.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260427/embedding/injecter-6-ui.js
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

  if (!_w.__LoreInjReady) {
    let _resolve;
    const p = new Promise(r => { _resolve = r; });
    p.__resolve = _resolve;
    _w.__LoreInjReady = p;
  }

  const TIMEOUT_MS = 30000;
  const POLL_MS = 50;
  const deadline = Date.now() + TIMEOUT_MS;

  //  __uiLoaded 는 UI 가 게이트 통과 후 켜므로 일단 제외시키자는 시발 왜 자꾸 동작을 이상하게 함 시발 ㅁ너으미ㅏㄴㅇㄹ;ㅁ
  const requiredCore = ['__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded', '__injectLoaded'];
  const requiredSubs = ['__subMainLoaded', '__subLoreLoaded', '__subMergeLoaded', '__subSnapshotLoaded', '__subFileLoaded', '__subExtractLoaded', '__subRefinerLoaded', '__subLogLoaded', '__subSessionLoaded', '__subApiLoaded', '__subHelpLoaded'];
  const requiredAll = requiredCore.concat(requiredSubs);

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
      if (Date.now() < deadline) return setTimeout(check, POLL_MS);
      console.error('[LoreInj] __LoreInj 없음 (코어 미로드)');
      _settle({ ok: false, reason: 'no-core', missing: ['__LoreInj'] });
      return;
    }
    const missing = requiredAll.filter(k => !L[k]);
    if (missing.length === 0) {
      L.allReady = true;
      console.log('[LoreInj v' + (L.VER || '?') + '] 게이트 통과: 코어 5 + 서브 11 전부 로드됨 → UI 부트스트랩 허용');
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
    if (Date.now() < deadline) return setTimeout(check, POLL_MS);
    console.error('[LoreInj] 게이트 타임아웃, 미로드 플래그:', missing);
    _settle({ ok: false, reason: 'timeout', missing });
  };
  check();
})();
