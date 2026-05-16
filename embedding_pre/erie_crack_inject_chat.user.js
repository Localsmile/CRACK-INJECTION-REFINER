// ==UserScript==
// @name        에리의 크랙 로어 인젝터 (Chat)
// @namespace   에리의 크랙 로어 인젝터
// @version     1.4.0-test.66
// @description 채팅방에서만 @require로 안정 부트스트랩되는 로어 인젝터 본체
// @author      로컬AI
// @match       https://crack.wrtn.ai/stories/*/episodes/*
// @match       https://crack.wrtn.ai/characters/*/chats/*
// @match       https://crack.wrtn.ai/u/*/c/*
// @updateURL   https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding_pre/erie_crack_inject_chat.user.js
// @downloadURL https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding_pre/erie_crack_inject_chat.user.js
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/vendor/toastify-injection.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/vendor/crack-shared-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/vendor/chasm-shared-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/vendor/decentralized-modal.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-ui.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-kernel.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-platform.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-memory.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-format.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-search.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-embedding.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-pricing.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/core-importer.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/refiner-prompts.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/refiner-dom.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/refiner-core.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/refiner-queue.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/refiner-observer.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/refiner.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-1.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-2.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-3.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-4.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-5.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-main.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-lore.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-merge.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-snapshot.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-file.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-extract.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-refiner.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-log.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-session.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-api.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-sub-help.js
// @require     https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260517-hybrid-require/embedding/injecter-6-ui.js
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
  _w.__LoreInj = _w.__LoreInj || {};
  const L = _w.__LoreInj;
  L.chatBootstrapVersion = '1.4.0-test.66';

  if (!_w.__LoreInjReady) {
    let resolveReady;
    const p = new Promise(r => { resolveReady = r; });
    p.__resolve = resolveReady;
    _w.__LoreInjReady = p;
  }

  const TIMEOUT_MS = 30000;
  const POLL_MS = 50;
  const SUB_SOFT_WAIT_MS = 7000;
  const deadline = Date.now() + TIMEOUT_MS;
  const requiredCore = ['__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded', '__injectLoaded', '__inject6Loaded'];
  const requiredSubs = ['__subMainLoaded', '__subLoreLoaded', '__subMergeLoaded', '__subSnapshotLoaded', '__subFileLoaded', '__subExtractLoaded', '__subRefinerLoaded', '__subLogLoaded', '__subSessionLoaded', '__subApiLoaded', '__subHelpLoaded'];
  const requiredAll = requiredCore.concat(requiredSubs);
  let settled = false;

  function settle(payload) {
    if (settled) return;
    settled = true;
    try { _w.__LoreInjReady.__resolve(payload); } catch (_) {}
    try { _w.dispatchEvent(new CustomEvent('LoreInj:ready', { detail: payload })); } catch (_) {}
  }

  function check() {
    const state = _w.__LoreInj;
    if (!state) {
      if (Date.now() < deadline) return setTimeout(check, POLL_MS);
      settle({ ok: false, reason: 'no-core', missing: ['__LoreInj'] });
      return;
    }
    const missingCore = requiredCore.filter(k => !state[k]);
    const missingSubs = requiredSubs.filter(k => !state[k]);
    if (missingCore.length === 0 && !state.__gateCoreReadyAt) state.__gateCoreReadyAt = Date.now();
    if (missingCore.length === 0 && missingSubs.length === 0) {
      state.allReady = true;
      console.log('[LoreInj chat ' + (state.VER || L.chatBootstrapVersion) + '] require gate passed');
      settle({ ok: true, ver: state.VER || L.chatBootstrapVersion });
      return;
    }
    if (missingCore.length === 0 && missingSubs.length > 0 && Date.now() - (state.__gateCoreReadyAt || Date.now()) >= SUB_SOFT_WAIT_MS) {
      state.allReady = true;
      state.partialReady = true;
      state.missingSubs = missingSubs;
      console.warn('[LoreInj chat] partial require gate:', missingSubs);
      settle({ ok: true, ver: state.VER || L.chatBootstrapVersion, partial: true, missingSubs });
      return;
    }
    if (Date.now() < deadline) return setTimeout(check, POLL_MS);
    const missing = requiredAll.filter(k => !state[k]);
    console.error('[LoreInj chat] require gate timeout:', missing);
    settle({ ok: false, reason: 'timeout', missing, missingCore, missingSubs });
  }

  check();
})();
