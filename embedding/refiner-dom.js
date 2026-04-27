// refiner / dom 모듈
// 역할: DOM 조작, React Fiber 패치, SWR 재검증, 교정 확인 UI
// 의존: 없음 (순수 DOM 유틸)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = _w.__LoreRefiner = _w.__LoreRefiner || {};
  if (R.__domLoaded) return;

  // DOM
  function stripMarkdown(text) {
    return text
      .replace(/```\w*\n?/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function findDeepestMatchingElement(searchPlainText) {
    const snippet = (searchPlainText.length > 20 ? searchPlainText.slice(-20) : searchPlainText).trim();
    if (!snippet || snippet.length < 5) return null;

    let best = null;
    let bestScore = Infinity;

    const all = document.querySelectorAll('div, p, article, section, span');
    for (const el of all) {
      const text = el.textContent;
      if (!text || !text.includes(snippet)) continue;
      if (el.tagName === 'BODY' || el.tagName === 'HTML') continue;
      if (el.id === '__next' || el.id === 'root') continue;

      const childCount = el.querySelectorAll('*').length;
      const score = text.length + childCount * 50;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  }

  function tryPatchReactFiber(element, originalText, newText) {
    try {
      const fiberKey = Object.keys(element).find(k =>
        k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      );
      if (!fiberKey) return;

      const matchSnippet = stripMarkdown(originalText).slice(0, 40);
      let fiber = element[fiberKey];
      let depth = 0;

      while (fiber && depth < 20) {
        for (const propSet of [fiber.memoizedProps, fiber.pendingProps]) {
          if (!propSet || typeof propSet !== 'object') continue;
          for (const key of Object.keys(propSet)) {
            const val = propSet[key];
            if (typeof val === 'string' && val.length > 30 &&
                (val.includes(matchSnippet) || val === originalText)) {
              propSet[key] = newText;
            }
          }
          if (propSet.dangerouslySetInnerHTML?.__html &&
              propSet.dangerouslySetInnerHTML.__html.includes(matchSnippet)) {
            propSet.dangerouslySetInnerHTML.__html = (typeof marked !== 'undefined')
              ? marked.parse(newText, { breaks: false, gfm: true })
              : newText;
          }
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (e) {}
  }

  function renderMarkdownHTML(mdText) {
    if (typeof marked !== 'undefined' && marked.parse) {
      return marked.parse(mdText, { breaks: false, gfm: true });
    }
    return mdText
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function triggerSWRRevalidation() {
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
    const renderedHTML = renderMarkdownHTML(newText);
    let targetEl = null;

    function tryApply() {
      if (targetEl && document.contains(targetEl)) {
        const cur = (targetEl.textContent || '').trim();
        if (newSnippet && cur.includes(newSnippet) && (!oldSnippet || !cur.includes(oldSnippet))) return 'done';
        if (oldSnippet && cur.includes(oldSnippet)) {
          targetEl.innerHTML = renderedHTML;
          tryPatchReactFiber(targetEl, originalText, newText);
          return 'applied';
        }
      }
      targetEl = findDeepestMatchingElement(oldPlain);
      if (targetEl) {
        targetEl.innerHTML = renderedHTML;
        tryPatchReactFiber(targetEl, originalText, newText);
        return 'applied';
      }
      const checkEl = findDeepestMatchingElement(newPlain);
      if (checkEl) return 'done';
      return 'not_found';
    }

    const firstResult = tryApply();
    if (firstResult === 'done') return true;

    let pollCount = 0;
    const timer = setInterval(() => {
      pollCount++;
      if (pollCount >= 20) { clearInterval(timer); return; }
      if (tryApply() === 'done') clearInterval(timer);
    }, 500);

    triggerSWRRevalidation();
    return firstResult === 'applied';
  }

  // UI
  function showRefineConfirm(reason, refinedText, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.id = 'refiner-confirm-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;box-sizing:border-box;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:8px;width:100%;max-width:400px;padding:20px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;';

    const title = document.createElement('div');
    title.textContent = 'AI 응답 교정 제안';
    title.style.cssText = 'font-size:16px;font-weight:bold;color:#4a9;margin-bottom:4px;';

    const reasonTitle = document.createElement('div');
    reasonTitle.textContent = '교정 이유:';
    reasonTitle.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;';
    const reasonText = document.createElement('div');
    reasonText.textContent = reason;
    reasonText.style.cssText = 'font-size:13px;color:#ccc;background:#222;padding:8px;border-radius:4px;';

    const refTitle = document.createElement('div');
    refTitle.textContent = '수정된 응답:';
    refTitle.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;margin-top:8px;';

    const refTa = document.createElement('textarea');
    refTa.value = refinedText;
    refTa.style.cssText = 'width:100%;height:100px;background:#0a0a0a;color:#fff;border:1px solid #444;border-radius:4px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:12px;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = '원본 유지';
    btnCancel.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#444;color:#ccc;cursor:pointer;font-weight:bold;';
    btnCancel.onclick = () => { document.body.removeChild(overlay); onCancel(); };

    const btnConfirm = document.createElement('button');
    btnConfirm.textContent = '교정본 변경';
    btnConfirm.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#285;color:#fff;cursor:pointer;font-weight:bold;';
    btnConfirm.onclick = () => { document.body.removeChild(overlay); onConfirm(refTa.value); };

    btnRow.appendChild(btnCancel); btnRow.appendChild(btnConfirm);
    box.appendChild(title); box.appendChild(reasonTitle); box.appendChild(reasonText);
    box.appendChild(refTitle); box.appendChild(refTa); box.appendChild(btnRow);
    overlay.appendChild(box); document.body.appendChild(overlay);
  }

  R.stripMarkdown = stripMarkdown;
  R.findDeepestMatchingElement = findDeepestMatchingElement;
  R.tryPatchReactFiber = tryPatchReactFiber;
  R.renderMarkdownHTML = renderMarkdownHTML;
  R.triggerSWRRevalidation = triggerSWRRevalidation;
  R.refreshMessageInDOM = refreshMessageInDOM;
  R.showRefineConfirm = showRefineConfirm;
  R.__domLoaded = true;

})();
