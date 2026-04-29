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
    // fenced code blocks first; stash into placeholders so the inline regex can't shave a backtick
    const fences = [];
    html = html.replace(/```(\w*)\r?\n?([\s\S]*?)```/g, function (_m, lang, code) {
      const idx = fences.length;
      fences.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code + '</code></pre>');
      return '@@LRFENCE' + idx + '@@';
    });
    // images first (must run before links since both use [...])
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (_m, alt, src) {
      return '<img alt="' + alt + '" src="' + src + '" style="max-width:100%;height:auto;">';
    });
    // links
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // headings (line-anchored, before <br> conversion)
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    // blockquote (single line)
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    // inline emphasis & code
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
    const oldSnippet = normalizeText(oldPlain.length > 36 ? oldPlain.slice(-36) : oldPlain);
    const newSnippet = normalizeText(newPlain.length > 36 ? newPlain.slice(-36) : newPlain);
    const renderedHTML = renderMarkdownHTML(newText);

    // Locate the bubble's own .wrtn-markdown directly (one per message bubble in wrtn DOM).
    // Closest() walking + substring class matching could land on a chat-wide wrapper, which
    // produced the stacked old+user+new render after React reconciled detached children.
    let targetEl = null;
    const allMds = document.querySelectorAll('.wrtn-markdown');

    // pass 1: prefer the wrtn-markdown that contains old text but not new text (pre-edit bubble)
    if (oldSnippet) {
      for (const md of allMds) {
        const t = normalizeText(md.textContent);
        if (t.includes(oldSnippet) && (!newSnippet || !t.includes(newSnippet))) {
          targetEl = md;
          break;
        }
      }
    }

    // pass 2: any wrtn-markdown containing old snippet
    if (!targetEl && oldSnippet) {
      for (const md of allMds) {
        if (normalizeText(md.textContent).includes(oldSnippet)) { targetEl = md; break; }
      }
    }

    // pass 3: already showing new text in some bubble -- treat as visible done
    if (!targetEl && newSnippet) {
      for (const md of allMds) {
        if (normalizeText(md.textContent).includes(newSnippet)) {
          try {
            if (messageId) {
              const c = getMessageContainer(md);
              if (c) c.setAttribute('data-lore-refiner-message-id', String(messageId));
            }
          } catch (_) {}
          return { applied: false, visible: true, status: 'done', messageId: messageId || null };
        }
      }
    }

    if (!targetEl || !document.contains(targetEl)) {
      return { applied: false, visible: false, status: 'not_found', messageId: messageId || null };
    }

    // one-shot apply at the bubble level only -- never on chat-wide wrappers
    try {
      targetEl.innerHTML = renderedHTML;
      try {
        if (messageId) {
          const c = getMessageContainer(targetEl);
          if (c) c.setAttribute('data-lore-refiner-message-id', String(messageId));
        }
      } catch (_) {}
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
    const visitFiber = (f) => {
      // hook chain memoizedState + queue.lastRenderedState
      let h = f.memoizedState;
      let hd = 0;
      while (h && hd < 60) {
        addIfStore(h.memoizedState);
        try { if (h.queue && h.queue.lastRenderedState) addIfStore(h.queue.lastRenderedState); } catch (_) {}
        h = h.next; hd++;
      }
      // context provider value
      try {
        const t = f.type;
        const isProvider = t && typeof t === 'object' && (t.$$typeof === Symbol.for('react.provider') || t._context);
        if (isProvider && f.memoizedProps) addIfStore(f.memoizedProps.value);
      } catch (_) {}
      // class instance props commonly carrying client/store
      try {
        if (f.stateNode && typeof f.stateNode === 'object' && f.stateNode.props) {
          addIfStore(f.stateNode.props.client);
          addIfStore(f.stateNode.props.store);
          addIfStore(f.stateNode.props.value);
        }
      } catch (_) {}
      // memoizedProps shallow scan -- some apps pass stores as props
      try {
        const mp = f.memoizedProps;
        if (mp && typeof mp === 'object') {
          for (const k of Object.keys(mp)) {
            try { addIfStore(mp[k]); } catch (_) {}
          }
        }
      } catch (_) {}
    };

    const seenFibers = new WeakSet();

    // Pass 1: walk up from rootEl spine
    let cur = rootEl;
    while (cur && cur !== document.body) {
      const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber$'));
      if (fiberKey) {
        let f = cur[fiberKey];
        let depth = 0;
        while (f && depth < 80) {
          if (seenFibers.has(f)) break;
          seenFibers.add(f);
          visitFiber(f);
          f = f.return; depth++;
        }
      }
      cur = cur.parentElement;
    }

    // Pass 2: walk entire fiber tree from React root(s)
    const roots = [];
    const tryAddRoot = (el) => {
      if (!el) return;
      try {
        const containerKey = Object.keys(el).find(k => k.startsWith('__reactContainer$'));
        if (containerKey && el[containerKey] && el[containerKey].stateNode) roots.push(el[containerKey].stateNode.current);
      } catch (_) {}
      try {
        if (el._reactRootContainer && el._reactRootContainer._internalRoot) roots.push(el._reactRootContainer._internalRoot.current);
      } catch (_) {}
    };
    tryAddRoot(document.getElementById('__next'));
    tryAddRoot(document.getElementById('root'));
    document.querySelectorAll('body > div, body > main').forEach(tryAddRoot);

    let visited = 0;
    const VISIT_CAP = 50000;
    for (const root of roots) {
      const stack = [root];
      while (stack.length && visited < VISIT_CAP) {
        const f = stack.pop();
        if (!f || seenFibers.has(f)) continue;
        seenFibers.add(f);
        visited++;
        visitFiber(f);
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
    }

    return out;
  }

  function patchMessageInState(state, messageId, newText, depth, budget) {
    const b = budget || { count: 0, max: 50000 };
    const d = depth || 0;
    if (!state || d > 6) return null;
    if (++b.count > b.max) return null;
    const isMsg = (v) => v && typeof v === 'object' &&
      (v.id === messageId || v._id === messageId || v.messageId === messageId || v.msgId === messageId);
    const fieldKeyOf = (v) => {
      if ('content' in v) return 'content';
      if ('message' in v) return 'message';
      if ('text' in v) return 'text';
      if ('body' in v) return 'body';
      return null;
    };
    if (Array.isArray(state)) {
      let changed = false;
      const next = state.map(item => {
        if (isMsg(item)) {
          const fk = fieldKeyOf(item);
          if (fk) { changed = true; return Object.assign({}, item, { [fk]: newText }); }
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
      // plain object that itself is the message (e.g. state.messages[id] = { id, content })
      if (isMsg(state)) {
        const fk = fieldKeyOf(state);
        if (fk) return Object.assign({}, state, { [fk]: newText });
      }
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
    if (!messageId) return false;
    let updated = false;
    const DBG = !!_w.__LR_DEBUG;
    if (DBG) console.log('[Refiner v6] tryStoreUpdate enter', messageId, 'len=', newText && newText.length);

    // path 0 (primary): in-place mutation across the entire fiber tree.
    // Hook dispatch paths have proven unreliable here -- silent React reducer
    // bailouts or shadowed memoizedState indices. Direct mutation of the
    // message object updates every place that holds the same reference
    // (zustand selectors, useMemo caches, derived hooks) at once.
    try {
      const roots = [];
      const tryAddRoot = (el) => {
        if (!el) return;
        try {
          const k = Object.keys(el).find(k => k.startsWith('__reactContainer$'));
          if (k && el[k] && el[k].stateNode) roots.push(el[k].stateNode.current);
        } catch (_) {}
        try {
          if (el._reactRootContainer && el._reactRootContainer._internalRoot) roots.push(el._reactRootContainer._internalRoot.current);
        } catch (_) {}
      };
      tryAddRoot(document.getElementById('__next'));
      tryAddRoot(document.getElementById('root'));
      document.querySelectorAll('body > div, body > main').forEach(tryAddRoot);

      const isMsg = (v) => v && typeof v === 'object' &&
        (v.id === messageId || v._id === messageId || v.messageId === messageId || v.msgId === messageId);
      const fieldKeyOf = (v) => {
        if ('content' in v) return 'content';
        if ('message' in v) return 'message';
        if ('text' in v) return 'text';
        if ('body' in v) return 'body';
        return null;
      };
      const seenObjs = new WeakSet();
      let path0Hits = 0;
      let path0Visited = 0;
      const mutate = (val, depth) => {
        if (!val || depth > 12 || typeof val !== 'object' || seenObjs.has(val)) return;
        seenObjs.add(val);
        path0Visited++;
        if (isMsg(val)) {
          const fk = fieldKeyOf(val);
          if (DBG) console.log('[Refiner v6] path0 isMsg hit, fk=', fk, 'oldLen=', fk ? (val[fk] && val[fk].length) : null);
          if (fk && val[fk] !== newText) {
            try { val[fk] = newText; updated = true; path0Hits++; } catch (e) { if (DBG) console.warn('[Refiner v6] mutate threw', e); }
          }
        }
        if (Array.isArray(val)) {
          for (const v of val) mutate(v, depth + 1);
          return;
        }
        // only descend into plain objects to avoid corrupting Maps/Sets/class instances
        const p = Object.getPrototypeOf(val);
        if (p !== Object.prototype && p !== null) return;
        for (const k of Object.keys(val)) mutate(val[k], depth + 1);
      };

      const seenFibers = new WeakSet();
      let visited = 0;
      const VISIT_CAP = 50000;
      for (const root of roots) {
        const stack = [root];
        while (stack.length && visited < VISIT_CAP) {
          const f = stack.pop();
          if (!f || seenFibers.has(f)) continue;
          seenFibers.add(f);
          visited++;
          // hook chain
          let h = f.memoizedState; let i = 0;
          while (h && i < 60) {
            try { mutate(h.memoizedState, 0); } catch (_) {}
            i++; h = h.next;
          }
          // memoizedProps -- some derived data lives directly in props
          try { mutate(f.memoizedProps, 0); } catch (_) {}
          if (f.child) stack.push(f.child);
          if (f.sibling) stack.push(f.sibling);
        }
      }
      if (DBG) console.log('[Refiner v6] path0 done. roots=', roots.length, 'fibersVisited=', visited, 'objsVisited=', path0Visited, 'hits=', path0Hits);
    } catch (e) { if (DBG) console.warn('[Refiner v6] path0 threw', e); }

    // path 1: known store types collected from fiber spine + tree
    if (rootEl) {
      const stores = collectFiberStores(rootEl);
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
    }

    // path 2: useState / useReducer hooks across the entire fiber tree
    try {
      const roots = [];
      const tryAddRoot = (el) => {
        if (!el) return;
        try {
          const containerKey = Object.keys(el).find(k => k.startsWith('__reactContainer$'));
          if (containerKey && el[containerKey] && el[containerKey].stateNode) roots.push(el[containerKey].stateNode.current);
        } catch (_) {}
        try {
          if (el._reactRootContainer && el._reactRootContainer._internalRoot) roots.push(el._reactRootContainer._internalRoot.current);
        } catch (_) {}
      };
      tryAddRoot(document.getElementById('__next'));
      tryAddRoot(document.getElementById('root'));
      document.querySelectorAll('body > div, body > main').forEach(tryAddRoot);

      const seenFibers = new WeakSet();
      let visited = 0;
      const VISIT_CAP = 50000;
      for (const root of roots) {
        const stack = [root];
        while (stack.length && visited < VISIT_CAP) {
          const f = stack.pop();
          if (!f || seenFibers.has(f)) continue;
          seenFibers.add(f);
          visited++;
          let h = f.memoizedState;
          let hd = 0;
          while (h && hd < 60) {
            try {
              if (h.queue && typeof h.queue.dispatch === 'function') {
                const cur = h.memoizedState;
                if (cur && typeof cur === 'object') {
                  const next = patchMessageInState(cur, messageId, newText);
                  if (next) {
                    try { h.queue.dispatch(next); updated = true; } catch (_) {}
                  }
                }
              }
            } catch (_) {}
            h = h.next; hd++;
          }
          if (f.child) stack.push(f.child);
          if (f.sibling) stack.push(f.sibling);
        }
      }
    } catch (_) {}

    return updated;
  }

  // Diagnostic helper: scan all fibers and report where messageId is found.
  // Usage from console: __LoreRefiner.debugFindMessage('69f04...')
  function debugFindMessage(messageId) {
    const findings = [];
    const seenObjs = new WeakSet();
    const walk = (val, path, depth) => {
      if (val == null || depth > 8) return;
      if (typeof val === 'string') {
        if (val === messageId) findings.push({ path: path.join('.') || '<root>', kind: 'id-string', sample: val });
        return;
      }
      if (typeof val !== 'object') return;
      if (seenObjs.has(val)) return;
      seenObjs.add(val);
      if (val.id === messageId || val._id === messageId || val.messageId === messageId || val.msgId === messageId) {
        findings.push({ path: path.join('.') || '<root>', kind: 'message-object', keys: Object.keys(val).slice(0, 30) });
      }
      if (Array.isArray(val)) {
        const lim = Math.min(val.length, 200);
        for (let i = 0; i < lim; i++) walk(val[i], path.concat('[' + i + ']'), depth + 1);
        return;
      }
      const proto = Object.getPrototypeOf(val);
      if (proto !== Object.prototype && proto !== null) return;
      for (const k of Object.keys(val)) walk(val[k], path.concat(k), depth + 1);
    };
    const roots = [];
    const tryAddRoot = (el) => {
      if (!el) return;
      try {
        const containerKey = Object.keys(el).find(k => k.startsWith('__reactContainer$'));
        if (containerKey && el[containerKey] && el[containerKey].stateNode) roots.push(el[containerKey].stateNode.current);
      } catch (_) {}
      try {
        if (el._reactRootContainer && el._reactRootContainer._internalRoot) roots.push(el._reactRootContainer._internalRoot.current);
      } catch (_) {}
    };
    tryAddRoot(document.getElementById('__next'));
    tryAddRoot(document.getElementById('root'));
    document.querySelectorAll('body > div, body > main').forEach(tryAddRoot);
    const seenFibers = new WeakSet();
    let visited = 0;
    for (const root of roots) {
      const stack = [root];
      while (stack.length && visited < 50000) {
        const f = stack.pop();
        if (!f || seenFibers.has(f)) continue;
        seenFibers.add(f);
        visited++;
        const dn = (f.type && (f.type.displayName || f.type.name)) || (typeof f.type === 'string' ? f.type : '?');
        // hooks
        let h = f.memoizedState; let hd = 0;
        while (h && hd < 60) {
          try { walk(h.memoizedState, ['fiber<' + dn + '>', 'hook[' + hd + ']', 'state'], 0); } catch (_) {}
          h = h.next; hd++;
        }
        // memoizedProps
        try { walk(f.memoizedProps, ['fiber<' + dn + '>', 'props'], 0); } catch (_) {}
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
    }
    return findings;
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
  R.debugFindMessage = debugFindMessage;
  R.lockMessageHTML = lockMessageHTML;
  R.showReloadAction = showReloadAction;
  R.showRefineConfirm = showRefineConfirm;
  R.__version = 'v6';
  R.__domLoaded = true;

})();
