// crack-lore-refiner / dom 모듈
// 역할: 교정본을 안전하게 즉시 표시하고, 앱 재검증 후에도 유지되는지 확인
(function () {
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreRefinerDOM) return;

  function R() {
    return _w.__LoreRefinerRender;
  }

  function stripMarkdown(text) {
    const rr = R();
    return rr && rr.stripMarkdown ? rr.stripMarkdown(text) : String(text || '').trim();
  }

  function getSearchRoots() {
    const selectors = [
      '[data-testid*="chat"]',
      '[data-testid*="message"]',
      '[class*="chat"]',
      '[class*="message"]',
      'main',
      'article'
    ];
    const roots = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach(el => roots.push(el));
      if (roots.length > 0) break;
    }
    return roots.length ? roots : [document.body];
  }

  function findMessageElement(searchText) {
    const plain = stripMarkdown(searchText);
    const tail = (plain.length > 36 ? plain.slice(-36) : plain).trim();
    const head = (plain.length > 36 ? plain.slice(0, 36) : plain).trim();
    const snippets = [tail, head].filter(s => s && s.length >= 5);

    if (!snippets.length) return null;

    let best = null;
    let bestScore = Infinity;
    const roots = getSearchRoots();

    for (const root of roots) {
      const all = root.querySelectorAll('article, section, div, p, span');
      for (const el of all) {
        if (!el || el === document.body || el.tagName === 'HTML') continue;
        if (el.id === '__next' || el.id === 'root') continue;

        const text = el.textContent || '';
        if (!snippets.some(s => text.includes(s))) continue;

        const childCount = el.querySelectorAll('*').length;
        const rect = el.getBoundingClientRect();
        const visiblePenalty = rect.width > 0 && rect.height > 0 ? 0 : 100000;
        const score = text.length + childCount * 40 + visiblePenalty;

        if (score < bestScore) {
          best = el;
          bestScore = score;
        }
      }
    }

    return best;
  }

  function applyOptimisticPatch(element, newText) {
    if (!element) return false;

    const rr = R();
    const rendered = rr && rr.renderSafe
      ? rr.renderSafe(newText)
      : document.createTextNode(String(newText || ''));

    element.replaceChildren(rendered);
    element.setAttribute('data-refiner-patched', 'true');
    element.setAttribute('data-refiner-patched-at', String(Date.now()));
    return true;
  }

  function triggerRevalidation() {
    try {
      const origDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
                    || Object.getOwnPropertyDescriptor(document, 'visibilityState');

      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      setTimeout(() => {
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('online'));

        setTimeout(() => {
          try {
            if (origDesc) Object.defineProperty(Document.prototype, 'visibilityState', origDesc);
            else delete document.visibilityState;
          } catch (_) {}
        }, 200);
      }, 100);
    } catch (e) {}
  }

  function refreshMessageInDOM(originalText, newText) {
    const oldPlain = stripMarkdown(originalText);
    const newPlain = stripMarkdown(newText);
    const oldSnippet = (oldPlain.length > 30 ? oldPlain.slice(-30) : oldPlain).trim();
    const newSnippet = (newPlain.length > 30 ? newPlain.slice(-30) : newPlain).trim();

    let target = findMessageElement(oldPlain);
    let applied = false;
    let observer = null;

    function stopWatching() {
      if (observer) observer.disconnect();
      observer = null;
    }

    function watchTarget(el) {
      stopWatching();
      if (!el) return;
      observer = new MutationObserver(() => {
        setTimeout(() => { reapplyIfNeeded(el); }, 0);
      });
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    }

    function reapplyIfNeeded(el) {
      if (!el || !document.contains(el)) return false;
      const newVisible = newSnippet && !!findMessageElement(newPlain);
      if (newVisible) return true;

      const cur = el.textContent || '';
      if (oldSnippet && cur.includes(oldSnippet)) {
        target = el;
        applyOptimisticPatch(target, newText);
        return true;
      }
      return false;
    }

    if (target) {
      applied = applyOptimisticPatch(target, newText);
      watchTarget(target);
    } else if (findMessageElement(newPlain)) {
      triggerRevalidation();
      return true;
    }

    let tries = 0;
    const timer = setInterval(() => {
      tries++;

      const currentTarget = target && document.contains(target) ? target : findMessageElement(oldPlain);
      const newVisible = newSnippet && !!findMessageElement(newPlain);

      if (newVisible) {
        clearInterval(timer);
        stopWatching();
        return;
      }

      if (currentTarget) {
        if (currentTarget !== target) {
          target = currentTarget;
          watchTarget(target);
        }
        reapplyIfNeeded(currentTarget);
      }

      if (tries >= 20) {
        clearInterval(timer);
        stopWatching();
      }
    }, 500);

    triggerRevalidation();
    return applied;
  }

  _w.__LoreRefinerDOM = {
    stripMarkdown,
    findMessageElement,
    applyOptimisticPatch,
    triggerRevalidation,
    refreshMessageInDOM
  };


})();