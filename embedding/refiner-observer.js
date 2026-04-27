// refiner / observer 모듈
// 역할: 메시지 감지 — MutationObserver + 폴링, idle 감지, 큐 enqueue
// 의존: queue, Core
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = _w.__LoreRefiner = _w.__LoreRefiner || {};
  if (!R.__queueLoaded) { console.error('[Refiner:observer] queue 미로드'); return; }
  if (R.__observerLoaded) return;

  let lastAssistantMsgId = null;
  let lastMsgLength = 0;
  let idleCount = 0;
  let lastChangeTime = 0;
  let _needsWarmup = true;
  let _lastKnownUrl = '';
  let _chatObserver = null;
  let _pollingInterval = null;

  async function checkLatestMessage() {
    const config = R.ConfigGetter();
    if (!config.refinerEnabled) return;

    const currentUrl = R.Core.getCurUrl();
    if (currentUrl !== _lastKnownUrl) {
      _lastKnownUrl = currentUrl; lastAssistantMsgId = null; lastMsgLength = 0; idleCount = 0; _needsWarmup = true;
    }

    const chatId = R.Core.getCurrentChatId();
    if (!chatId) return;

    try {
      const lastLog = await CrackUtil.chatRoom().findLastMessageId(chatId, "assistant");
      if (!lastLog || lastLog instanceof Error) return;

      const msgId = lastLog.id || (lastLog.content ? lastLog.content.slice(0, 40) : '');
      const contentLen = lastLog.content ? lastLog.content.length : 0;
      if (R.rememberAssistantMessage && lastLog.content) R.rememberAssistantMessage(msgId, lastLog.content);

      if (_needsWarmup) {
        lastAssistantMsgId = msgId; lastMsgLength = contentLen; idleCount = 0; lastChangeTime = Date.now(); _needsWarmup = false;
        if (msgId) { R.getProcessedFingerprints().add(msgId); R.saveProcessedFingerprints(); }
        return;
      }

      if (msgId !== lastAssistantMsgId) {
        R.Core.showStatusBadge('에리가 응답 기다리는 중');
        lastAssistantMsgId = msgId; lastMsgLength = contentLen; idleCount = 0; lastChangeTime = Date.now();
      } else {
        if (contentLen === lastMsgLength && lastMsgLength > 0) {
          idleCount++;
          if (idleCount >= 2 && Date.now() - lastChangeTime > 4000) R.enqueueRefine(lastLog.content, msgId);
        } else {
          lastMsgLength = contentLen; idleCount = 0; lastChangeTime = Date.now();
        }
      }
    } catch (e) {}
  }

  function setupObserver() {
    if (_chatObserver) _chatObserver.disconnect();
    if (_pollingInterval) clearInterval(_pollingInterval);

    _chatObserver = new MutationObserver(() => {
      const config = R.ConfigGetter();
      if (!config.refinerEnabled) return;
      if (window._refinerDebounceTimer) clearTimeout(window._refinerDebounceTimer);
      window._refinerDebounceTimer = setTimeout(() => { checkLatestMessage(); }, 800);
    });
    _chatObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    _pollingInterval = setInterval(() => {
      const config = R.ConfigGetter();
      if (config.refinerEnabled) checkLatestMessage();
    }, 3000);

    setInterval(() => {
      if (R.workerBusy && Date.now() - R.workerStartTime > R.WORKER_TIMEOUT) {
        R.workerBusy = false; R.Core && R.Core.hideStatusBadge();
      }
      if (R.refineQueue.length > 0 && !R.workerBusy) R.processQueue();
    }, 2000);
  }

  R.setupObserver = setupObserver;
  R.setNeedsWarmup = function() { _needsWarmup = true; };
  R.__observerLoaded = true;

})();
