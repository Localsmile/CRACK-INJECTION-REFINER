// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Loader)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test.33
// @description 모듈화된 로어 인젝터 로더 (ready-gate + early menu queue)
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

  // 메뉴 등록 큐 사전 설치 (document-start). 로더가 먼저 설치해야 sub 모듈이
  // injecter-6 보다 먼저 깨어나도 등록이 스텁 함수로 떨어지지 않음.
  _w.__LoreInj = _w.__LoreInj || {};
  if (!_w.__LoreInj.__menuQueue) {
    const _mq = [];
    const _smq = [];
    _w.__LoreInj.__menuQueue = _mq;
    _w.__LoreInj.__subMenuQueue = _smq;
    _w.__LoreInj.registerMenu = function(key, cb) { _mq.push({ key, cb }); };
    _w.__LoreInj.registerSubMenu = function(key, cb) { _smq.push({ key, cb }); };
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
  const deadline = Date.now() + TIMEOUT_MS;

  // __uiLoaded 는 UI 가 게이트 통과 후 켜므로 제외. 왜 자꾸 안도나ㅣ얌ㄴㅇㅁㄴㅁㄴㅇ
  const requiredCore = ['__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded', '__injectLoaded', '__inject6Loaded'];
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
    if (Date.now() < deadline) return setTimeout(check, POLL_MS);
    console.error('[LoreInj] 게이트 타임아웃, 미로드 플래그:', missing);
    _settle({ ok: false, reason: 'timeout', missing });
  };
  check();
})();
