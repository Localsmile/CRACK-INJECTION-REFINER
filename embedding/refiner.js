// refiner 진입점
// 역할: 5개 서브모듈(prompts/dom/core/queue/observer) 조합 + init() 공개
// 의존: prompts, dom, core, queue, observer (이 파일 전에 로드 필요)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = _w.__LoreRefiner = _w.__LoreRefiner || {};
  if (R.__loaded) return;

  function fail(dep, msg) {
    console.error(msg);
    try { _w.__LoreInj?.markFailed?.('refiner', dep + ' missing'); } catch (_) {}
    R.__loadError = dep + ' missing';
    return true;
  }

  if (!R.__promptsLoaded && fail('prompts', '[Refiner] prompts 미로드')) return;
  if (!R.__domLoaded && fail('dom', '[Refiner] dom 미로드')) return;
  if (!R.__coreLoaded && fail('core', '[Refiner] core 미로드')) return;
  if (!R.__queueLoaded && fail('queue', '[Refiner] queue 미로드')) return;
  if (!R.__observerLoaded && fail('observer', '[Refiner] observer 미로드')) return;

  R.init = function(coreInstance, configGetterFn, logCb, toastCb, getPacksCb) {
    R.Core = coreInstance;
    R.ConfigGetter = configGetterFn;
    R.setCallbacks(coreInstance, configGetterFn, logCb, toastCb, getPacksCb);
    R.setupObserver();
  };

  R.clearProcessed = function() {
    R.getProcessedFingerprints().clear();
    const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
    _ls.removeItem('speech-refiner-processed');
  };

  R.manualRefine = async function(text, msgId) {
    if (!text) return;
    if (msgId) R.getProcessedFingerprints().delete(msgId);
    try { await R.refineMessage(text, true, R.processQueue); } catch(e) { console.error('[Refiner] manual fail:', e); throw e; }
  };

  R.__loaded = true;

})();
