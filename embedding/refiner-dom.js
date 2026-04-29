// refiner / dom 모듈
// 역할: DOM 조작, React Fiber 패치, SWR 재검증, 교정 확인 UI
// 의존: 없음 (순수 DOM 유틸)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = _w.__LoreRefiner = _w.__LoreRefiner || {};
  if (R.__domLoaded) return;

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  // DOM
  function stripMarkdown(text) {
    return String(text || '')
      .replace(/`{3}\w*\n?/g, '')
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

  function getMessageContainer(el) {
    if (!el) return null;
    return el.closest?.('[data-message-id], [data-id], [data-testid*="message"], [class*="message"], article, section, li')
        || el.closest?.('div')
        || el;
  }

  function findMessageContainerById(messageId) {
    if (!messageId) return null;
    const id = String(messageId);
    const candidates = document.querySelectorAll('[data-message-id], [data-id], [id], [href], [data-testid]');
    for (const el of candidates) {
      const vals = [
        el.getAttribute('data-message-id'),
        el.getAttribute('data-id'),
        el.getAttribute('id'),
        el.getAttribute('href'),
        el.getAttribute('data-testid')
      ].filter(Boolean);
      if (vals.some(v => String(v).includes(id))) return getMessageContainer(el);
    }
    const marked = document.querySelector(`[data-lore-refiner-message-id="${id.replace(/"/g, '\\"')}"]`);
    return marked ? getMessageContainer(marked) : null;
  }

  function findDeepestMatchingElement(searchPlainText, root) {
    const plain = normalizeText(searchPlainText);
    const snippet = (plain.length > 36 ? plain.slice(-36) : plain).trim();
    if (!snippet || snippet.length < 5) return null;

    let best = null;
    let bestScore = Infinity;
    const scope = root || document;
    const all = scope.querySelectorAll ? scope.querySelectorAll('div, p, article, section, span, li') : [];
    for (const el of all) {
      const text = normalizeText(el.textContent);
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

  function patchPropsObject(obj, originalText, newText, renderedHTML, seen, depth) {
    if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return false;
    seen.add(obj);
    let changed = false;
    const oldPlain = stripMarkdown(originalText);
    const oldSnippet = oldPlain.slice(0, 48);
    for (const key of Object.keys(obj)) {
      try {
        const val = obj[key];
        if (typeof val === 'string') {
          if ((oldSnippet && val.includes(oldSnippet)) || val === originalText) {
            obj[key] = key === '__html' ? renderedHTML : newText;
            changed = true;
          }
        } else if (val && typeof val === 'object') {
          changed = patchPropsObject(val, originalText, newText, renderedHTML, seen, depth + 1) || changed;
        }
      } catch (_) {}
    }
    return changed;
  }

  function tryPatchReactFiber(element, originalText, newText, renderedHTML) {
    try {
      let el = element;
      while (el && el !== document.body) {
        const fiberKey = Object.keys(el).find(k =>
          k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$') || k.startsWith('__reactProps$')
        );
        if (fiberKey) {
          let fiber = el[fiberKey];
          let depth = 0;
          while (fiber && depth < 30) {
            patchPropsObject(fiber.memoizedProps, originalText, newText, renderedHTML, new WeakSet(), 0);
            patchPropsObject(fiber.pendingProps, originalText, newText, renderedHTML, new WeakSet(), 0);
            fiber = fiber.return;
            depth++;
          }
        }
        el = el.parentElement;
      }
    } catch (e) {}
  }

  function renderMarkdownHTML(mdText) {
    let html = escapeHTML(mdText);
    // fenced code blocks first; stash into placeholders so the inline-code regex can't shave a backtick
    const fences = [];
    html = html.replace(/```(\w*)\r?\n?([\s\S]*?)```/g, function (_m, lang, code) {
      const idx = fences.length;
      fences.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code + '</code></pre>');
      return '@@LRFENCE' + idx + '@@';
    });
    html = html
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\n/g, '<br>');
    html = html.replace(/@@LRFENCE(\d+)@@(<br>)?/g, function (_m, idx) { return fences[+idx]; });
    return html;
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
        window.dispatchEvent(new Event('popstate'));

        setTimeout(() => {
          try {
            if (origDesc) Object.defineProperty(Document.prototype, 'visibilityState', origDesc);
            else delete document.visibilityState;
          } catch (_) {}
        }, 200);
      }, 100);
    } catch (e) {}
  }

  function isTextVisible(text, messageId) {
    const plain = stripMarkdown(text);
    const snippet = normalizeText(plain.length > 36 ? plain.slice(-36) : plain);
    if (!snippet) return false;
    const container = findMessageContainerById(messageId);
    if (container && normalizeText(container.textContent).includes(snippet)) return true;
    return !!findDeepestMatchingElement(plain);
  }

  function waitForVisibleText(text, messageId, timeoutMs) {
    const timeout = timeoutMs || 3500;
    const started = Date.now();
    return new Promise(resolve => {
      const tick = () => {
        if (isTextVisible(text, messageId)) return resolve(true);
        if (Date.now() - started >= timeout) return resolve(false);
        setTimeout(tick, 250);
      };
      tick();
    });
  }

  function rememberAssistantMessage(messageId, text) {
    const el = findDeepestMatchingElement(stripMarkdown(text));
    const container = getMessageContainer(el);
    if (container && messageId) {
      try { container.setAttribute('data-lore-refiner-message-id', String(messageId)); } catch (_) {}
    }
    return container;
  }

  function refreshMessageInDOM(originalText, newText, messageId) {
    const oldPlain = stripMarkdown(originalText);
    const newPlain = stripMarkdown(newText);
    const newSnippet = normalizeText(newPlain.length > 36 ? newPlain.slice(-36) : newPlain);
    const renderedHTML = renderMarkdownHTML(newText);

    // 1) locate a candidate element that contains the original text
    let candidate = null;
    const idContainer = findMessageContainerById(messageId);
    if (idContainer) candidate = findDeepestMatchingElement(oldPlain, idContainer) || idContainer;
    if (!candidate) candidate = findDeepestMatchingElement(oldPlain);

    // 2) walk up to host markdown wrapper so we replace the whole rendered block, not the inside of <pre><code>
    let targetEl = candidate;
    if (targetEl && targetEl.closest) {
      const md = targetEl.closest('.wrtn-markdown, [class*="wrtn-markdown"]');
      if (md) targetEl = md;
      else {
        const fence = targetEl.closest('pre');
        if (fence && fence.parentElement) targetEl = fence.parentElement;
      }
    }

    if (!targetEl || !document.contains(targetEl)) {
      return { applied: false, visible: false, status: 'not_found', messageId: messageId || null };
    }

    // 3) already showing new text -- mark and bail
    const cur = normalizeText(targetEl.textContent);
    if (newSnippet && cur.includes(newSnippet)) {
      try { if (messageId) getMessageContainer(targetEl).setAttribute('data-lore-refiner-message-id', String(messageId)); } catch (_) {}
      return { applied: false, visible: true, status: 'done', messageId: messageId || null };
    }

    // 4) one-shot apply. no setInterval, no fiber prop mutation, no SWR revalidation -- those caused the freeze
    try {
      targetEl.innerHTML = renderedHTML;
      try { if (messageId) getMessageContainer(targetEl).setAttribute('data-lore-refiner-message-id', String(messageId)); } catch (_) {}
    } catch (_) {}

    return { applied: true, visible: true, status: 'applied', messageId: messageId || null };
  }

  // store discovery + lock guard
  function collectFiberStores(rootEl) {
    const out = [];
    const handleSet = new WeakSet();
    const addIfStore = (v) => {
      if (!v || typeof v !== 'object' || handleSet.has(v)) return;
      if (typeof v.getState === 'function' && typeof v.setState === 'function' && typeof v.subscribe === 'function') {
        handleSet.add(v); out.push({ kind: 'zustand', handle: v });
      } else if (v.constructor && v.constructor.name === 'QueryClient') {
        handleSet.add(v); out.push({ kind: 'react-query', handle: v });
      } else if (v.cache && typeof v.cache.get === 'function' && typeof v.mutate === 'function') {
        handleSet.add(v); out.push({ kind: 'swr', handle: v });
      }
    };
    let cur = rootEl;
    const seenFibers = new WeakSet();
    while (cur && cur !== document.body) {
      const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber$'));
      if (fiberKey) {
        let f = cur[fiberKey];
        let depth = 0;
        while (f && depth < 80) {
          if (seenFibers.has(f)) break;
          seenFibers.add(f);
          // hook chain memoizedState
          let h = f.memoizedState;
          let hd = 0;
          while (h && hd < 40) {
            addIfStore(h.memoizedState);
            h = h.next; hd++;
          }
          // context provider value (zustand/react-query/SWR providers)
          try {
            const t = f.type;
            const isProvider = t && typeof t === 'object' && (t.$$typeof === Symbol.for('react.provider') || t._context);
            if (isProvider && f.memoizedProps) addIfStore(f.memoizedProps.value);
          } catch (_) {}
          // class instance props commonly carrying client/store
          try {
            if (f.stateNode && f.stateNode.props) {
              addIfStore(f.stateNode.props.client);
              addIfStore(f.stateNode.props.store);
              addIfStore(f.stateNode.props.value);
            }
          } catch (_) {}
          f = f.return; depth++;
        }
      }
      cur = cur.parentElement;
    }
    return out;
  }

  function patchMessageInState(state, messageId, newText, depth, budget) {
    const b = budget || { count: 0, max: 50000 };
    const d = depth || 0;
    if (!state || d > 6) return null;
    if (++b.count > b.max) return null;
    if (Array.isArray(state)) {
      let changed = false;
      const next = state.map(item => {
        if (item && typeof item === 'object' && (item.id === messageId || item._id === messageId)) {
          const fieldKey = ('content' in item) ? 'content' : ('message' in item) ? 'message' : null;
          if (fieldKey) { changed = true; return Object.assign({}, item, { [fieldKey]: newText }); }
        }
        const sub = patchMessageInState(item, messageId, newText, d + 1, b);
        if (sub) { changed = true; return sub; }
        return item;
      });
      return changed ? next : null;
    }
    if (typeof state === 'object') {
      // skip non-plain objects (Map, Set, Date, class instances) to avoid clone corruption
      const proto = Object.getPrototypeOf(state);
      if (proto !== Object.prototype && proto !== null) return null;
      let changed = false;
      const next = Object.assign({}, state);
      for (const k of Object.keys(state)) {
        const sub = patchMessageInState(state[k], messageId, newText, d + 1, b);
        if (sub) { next[k] = sub; changed = true; }
      }
      return changed ? next : null;
    }
    return null;
  }

  function tryStoreUpdate(rootEl, messageId, newText) {
    if (!rootEl || !messageId) return false;
    const stores = collectFiberStores(rootEl);
    let updated = false;
    for (const s of stores) {
      try {
        if (s.kind === 'zustand') {
          const state = s.handle.getState();
          const patched = patchMessageInState(state, messageId, newText);
          if (patched) { s.handle.setState(patched, true); updated = true; }
        } else if (s.kind === 'react-query') {
          const cache = s.handle.getQueryCache && s.handle.getQueryCache();
          const queries = (cache && cache.getAll && cache.getAll()) || [];
          for (const q of queries) {
            const data = q.state && q.state.data;
            if (!data) continue;
            const next = patchMessageInState(data, messageId, newText);
            if (next) { s.handle.setQueryData(q.queryKey, next); updated = true; }
          }
        } else if (s.kind === 'swr') {
          const cache = s.handle.cache;
          if (cache && typeof cache[Symbol.iterator] === 'function') {
            for (const [key, val] of cache) {
              const data = val && val.data;
              if (!data) continue;
              const next = patchMessageInState(data, messageId, newText);
              if (next) { s.handle.mutate(key, next, false); updated = true; }
            }
          }
        }
      } catch (_) {}
    }
    return updated;
  }

  // one-shot apply only — prior MutationObserver loop caused a React reconciliation feedback freeze
  function lockMessageHTML(targetEl, renderedHTML, oldPlain, newPlain, ttlMs) {
    if (!targetEl) return;
    try { if (targetEl.innerHTML !== renderedHTML) targetEl.innerHTML = renderedHTML; } catch (_) {}
  }

  function showReloadAction(message) {
    const old = document.querySelector('#refiner-reload-action');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'refiner-reload-action';
    box.style.cssText = 'position:fixed;right:18px;bottom:90px;z-index:999999;background:#1a1a1a;color:#ddd;border:1px solid #444;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.45);padding:12px;max-width:320px;font-size:12px;line-height:1.45;';
    const text = document.createElement('div');
    text.textContent = message || '서버 수정 완료. 화면이 아직 예전 응답이면 새로고침으로 반영하세요.';
    text.style.cssText = 'margin-bottom:10px;color:#ddd;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const close = document.createElement('button');
    close.textContent = '닫기';
    close.style.cssText = 'padding:7px 10px;border:0;border-radius:5px;background:#444;color:#ddd;cursor:pointer;';
    close.onclick = () => box.remove();
    const reload = document.createElement('button');
    reload.textContent = '새로고침';
    reload.style.cssText = 'padding:7px 10px;border:0;border-radius:5px;background:#285;color:white;font-weight:bold;cursor:pointer;';
    reload.onclick = () => location.reload();
    row.appendChild(close); row.appendChild(reload);
    box.appendChild(text); box.appendChild(row);
    document.body.appendChild(box);
    setTimeout(() => { if (document.body.contains(box)) box.remove(); }, 20000);
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

  R.escapeHTML = escapeHTML;
  R.stripMarkdown = stripMarkdown;
  R.findMessageContainerById = findMessageContainerById;
  R.findDeepestMatchingElement = findDeepestMatchingElement;
  R.tryPatchReactFiber = tryPatchReactFiber;
  R.renderMarkdownHTML = renderMarkdownHTML;
  R.triggerSWRRevalidation = triggerSWRRevalidation;
  R.isTextVisible = isTextVisible;
  R.waitForVisibleText = waitForVisibleText;
  R.rememberAssistantMessage = rememberAssistantMessage;
  R.refreshMessageInDOM = refreshMessageInDOM;
  R.collectFiberStores = collectFiberStores;
  R.patchMessageInState = patchMessageInState;
  R.tryStoreUpdate = tryStoreUpdate;
  R.lockMessageHTML = lockMessageHTML;
  R.showReloadAction = showReloadAction;
  R.showRefineConfirm = showRefineConfirm;
  R.__domLoaded = true;

})();
