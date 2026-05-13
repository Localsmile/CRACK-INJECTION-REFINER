// refiner / queue 모듈
// 역할: 교정 큐 시스템 — 중복 방지, 순차 처리, 타임아웃
// 의존: core
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = _w.__LoreRefiner = _w.__LoreRefiner || {};
  if (!R.__coreLoaded) { console.error('[Refiner:queue] core 미로드'); return; }
  if (R.__queueLoaded) return;

  const refineQueue = [];
  // v1.4.0-test.38 B1 fix: workerBusy/workerStartTime을 R에 노출. observer 워치독이 읽음.
  R.workerBusy = false;
  R.workerStartTime = 0;
  const WORKER_TIMEOUT = 90000;

  function enqueueRefine(text, msgId) {
    const fingerprints = R.getProcessedFingerprints();
    const fingerprint = msgId || text.slice(0, 40);
    if (fingerprints.has(fingerprint)) {
      R.Core && R.Core.hideStatusBadge(); return;
    }
    if (refineQueue.some(item => item.fingerprint === fingerprint)) return;
    refineQueue.push({ text, fingerprint, enqueuedAt: Date.now() });
    processQueue();
  }

  async function processQueue() {
    if (refineQueue.length === 0) return;
    if (document.querySelector('#refiner-confirm-overlay')) return;
    if (R.workerBusy) {
      if (Date.now() - R.workerStartTime > WORKER_TIMEOUT) {
        R.workerBusy = false; R.Core && R.Core.hideStatusBadge();
      } else return;
    }
    R.workerBusy = true;
    R.workerStartTime = Date.now();

    const item = refineQueue.shift();
    const fingerprints = R.getProcessedFingerprints();
    if (fingerprints.has(item.fingerprint)) {
      R.workerBusy = false;
      if (refineQueue.length > 0) processQueue();
      return;
    }
    fingerprints.add(item.fingerprint);
    R.saveProcessedFingerprints();
    try {
      await Promise.race([
        R.refineMessage(item.text, false, processQueue),
        new Promise((_, rej) => setTimeout(() => rej(new Error('refineMessage 60초 타임아웃')), 60000))
      ]);
    } catch (e) {
      R.Core && R.Core.hideStatusBadge();
    }

    // B6 fix: 중복 add/save 제거 (위 try 진입 전 이미 처리됨)
    R.workerBusy = false;

    if (refineQueue.length > 0) processQueue();
  }

  R.refineQueue = refineQueue;
  R.enqueueRefine = enqueueRefine;
  R.processQueue = processQueue;
  R.WORKER_TIMEOUT = WORKER_TIMEOUT;
  R.__queueLoaded = true;

})();
