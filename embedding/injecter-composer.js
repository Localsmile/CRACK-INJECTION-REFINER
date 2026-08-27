(function () {
  'use strict';
  const _w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const L = _w.__LoreInj = _w.__LoreInj || {};
  if (L.__composerLoaded) return;
  const doc = _w.document;
  const EDITOR = '.__chat_input_textarea[contenteditable="true"]';
  // Crack's send arrow, not the stop/autoplay buttons sharing its toolbar slot.
  const SEND_PATH = 'M18.38 12.88H3v-1.6h15.38l-4.7-4.7 1.14-1.13 6.62 6.63-6.62 6.62-1.14-1.13z';
  let pending = null;
  let replaying = false;

  function serializeComposer(json) {
    if (!json || json.type !== 'doc' || !Array.isArray(json.content)) return null;
    let mentions = 0;
    function serialize(node) {
      if (node.type === 'text') return String(node.text || '');
      if (node.type === 'hardBreak') return '\n';
      if (node.type === 'mention') {
        const { id, label } = node.attrs || {};
        if (!id || !label) return '';
        return ++mentions === 1 ? `(shortcut:${id}:${label})` : `/${label}`;
      }
      if (node.type !== 'paragraph') throw new Error('Unknown composer node');
      return (node.content || []).map(serialize).join('');
    }
    try { return json.content.map(serialize).join('\n\n'); }
    catch (_) { return null; }
  }

  function readInput(editor) {
    try { return serializeComposer(editor.editor.getJSON()); }
    catch (_) { return null; }
  }

  function findSendButton(editor) {
    let node = editor.parentElement;
    for (let depth = 0; node && node !== doc.body && depth < 4; depth++, node = node.parentElement) {
      const buttons = Array.from(node.querySelectorAll('button')).filter(button =>
        Array.from(button.querySelectorAll('svg path')).some(p => p.getAttribute('d') === SEND_PATH));
      if (buttons.length === 1) return buttons[0];
      if (buttons.length > 1) return null;
    }
    return null;
  }

  function usable(editor, button) {
    return editor?.isConnected && button?.isConnected && !button.disabled &&
      editor.matches(EDITOR) && button.getClientRects().length > 0;
  }

  function stop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function cancelPending() {
    if (pending) L.sendBridge.cancel(pending.job);
  }

  async function prepareAndSend(editor, button, replay) {
    const bridge = L.sendBridge;
    const input = readInput(editor);
    if (!input?.trim() || !bridge?.canPrepare() || !bridge.needsInjection(input)) return false;
    const job = bridge.prepare(input);
    const state = { job, editor, button };
    pending = state;
    const oldBusy = button.getAttribute('aria-busy');
    button.setAttribute('aria-busy', 'true');
    _w.__LoreCore?.showStatusBadge?.('에리가 로어 준비 중');
    const unchanged = () => job.path === _w.location.pathname && usable(editor, button) && readInput(editor) === input;
    const watch = setInterval(() => { if (!unchanged()) bridge.cancel(job); }, 100);
    try {
      await job.promise;
      if (job.controller.signal.aborted || !unchanged()) return true;
      bridge.arm(job);
      replaying = true;
      try { replay(); }
      finally { replaying = false; }
    } catch (e) {
      const cancelled = job.controller.signal.aborted;
      bridge.cancel(job);
      console.warn('[Lore] prepare send failed:', e);
      if (!cancelled) _w.__LoreCore?.showStatusBadge?.('로어 준비에 실패했어요. 다시 전송해 주세요.');
    } finally {
      clearInterval(watch);
      if (oldBusy === null) button.removeAttribute('aria-busy');
      else button.setAttribute('aria-busy', oldBusy);
      if (pending === state) pending = null;
      if (doc.getElementById('lore-status-badge')?.textContent === '에리가 로어 준비 중') _w.__LoreCore?.hideStatusBadge?.();
    }
    return true;
  }

  function canIntercept(editor, button) {
    const input = readInput(editor);
    return usable(editor, button) && L.sendBridge?.canPrepare() &&
      L.settings?.config?.enabled !== false && !!input?.trim() && L.sendBridge.needsInjection(input);
  }

  _w.addEventListener('click', event => {
    if (replaying || event.defaultPrevented || event.button > 0) return;
    const clicked = event.target.closest?.('button');
    if (!clicked) return;
    for (const editor of doc.querySelectorAll(EDITOR)) {
      const button = findSendButton(editor);
      if (clicked !== button || !canIntercept(editor, button)) continue;
      stop(event);
      if (!pending) void prepareAndSend(editor, button, () => button.click());
      return;
    }
  }, true);

  _w.addEventListener('keydown', event => {
    if (replaying || event.defaultPrevented || event.key !== 'Enter' || event.shiftKey ||
        event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.keyCode === 229) return;
    const editor = event.target.closest?.(EDITOR);
    // Crack uses Enter for newlines on mobile/tablet and while selecting a shortcut.
    if (!editor || editor.editor?.view?.composing || _w.matchMedia('(max-width: 768px)').matches ||
        doc.querySelector('[aria-label="단축어 패널 열기"][data-state="open"], [data-tippy-root]')) return;
    const button = findSendButton(editor);
    if (!canIntercept(editor, button)) return;
    stop(event);
    if (!pending && !event.repeat) void prepareAndSend(editor, button, () => editor.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
    })));
  }, true);

  _w.addEventListener('input', event => {
    if (!replaying && pending && pending.editor.contains(event.target)) cancelPending();
  }, true);
  _w.addEventListener('pagehide', cancelPending);
  _w.addEventListener('popstate', cancelPending);
  L.serializeComposer = serializeComposer;
  L.__composerLoaded = true;
})();
