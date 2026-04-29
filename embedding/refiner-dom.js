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

  // store update strategy:
  // path 0 — best-effort in-place mutation of msg.content. wrtn freezes some refs (Immer),
  //          so this only succeeds on unfrozen ones; throws are silently counted.
  // path A — find the bubble's React fiber and walk UP via fiber.return only (no sibling tree),
  //          deep-scanning each useState/useReducer hook for any descendant carrying this msg.
  //          When found, dispatch a top-level shallow clone — React sees a new state ref and
  //          re-renders THAT subtree only. Scoping to ancestors avoids the cross-tree dispatch
  //          that broke wrtn's child reconciliation in v6/v7.
  function tryStoreUpdate(rootEl, messageId, newText) {
    if (!messageId) return false;
    let updated = false;
    const DBG = !!_w.__LR_DEBUG;

    // path 0
    const result = runPath0Mutation(messageId, newText);
    if (result.hits > 0) updated = true;
    _w.__LR_LAST_PATH0 = result;
    if (DBG) console.log('[Refiner v9] path0', result);

    // path A — ancestor-only deep scan
    let rerenderHits = 0;
    try {
      const targetEl = rootEl || (R.findMessageContainerById && R.findMessageContainerById(messageId));
      if (targetEl) {
        // collect ancestor fibers via fiber.return only
        const ancestors = [];
        let el = targetEl;
        while (el && el !== document.body) {
          const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
          if (fk) {
            let f = el[fk];
            let depth = 0;
            while (f && depth < 80) {
              ancestors.push(f);
              f = f.return; depth++;
            }
            break;
          }
          el = el.parentElement;
        }

        // deep check: does this state hold the msg anywhere within depth 8?
        const isMsgRef = (v) => {
          if (!v || typeof v !== 'object') return false;
          try { return v._id === messageId || v.id === messageId || v.messageId === messageId || v.msgId === messageId; } catch (_) { return false; }
        };
        const containsMsgDeep = (val, depth, seen) => {
          if (!val || typeof val !== 'object' || depth > 8) return false;
          if (seen.has(val)) return false;
          seen.add(val);
          if (isMsgRef(val)) return true;
          try {
            if (Array.isArray(val)) {
              for (let i = 0; i < val.length && i < 500; i++) {
                if (containsMsgDeep(val[i], depth + 1, seen)) return true;
              }
              return false;
            }
            const proto = Object.getPrototypeOf(val);
            if (proto !== Object.prototype && proto !== null) return false;
            for (const k of Object.keys(val)) {
              if (containsMsgDeep(val[k], depth + 1, seen)) return true;
            }
          } catch (_) {}
          return false;
        };

        const seenHooks = new WeakSet();
        for (const f of ancestors) {
          let h = f.memoizedState; let hd = 0;
          while (h && hd < 60) {
            if (!seenHooks.has(h) && h.queue && typeof h.queue.dispatch === 'function') {
              seenHooks.add(h);
              const cur = h.memoizedState;
              if (cur && typeof cur === 'object' && containsMsgDeep(cur, 0, new WeakSet())) {
                try {
                  const next = Array.isArray(cur) ? cur.slice() : Object.assign({}, cur);
                  h.queue.dispatch(next);
                  rerenderHits++;
                  updated = true;
                } catch (e) { if (DBG) console.warn('[Refiner v9] dispatch threw', e); }
              }
            }
            h = h.next; hd++;
          }
          if (rerenderHits >= 5) break;
        }
      }
    } catch (e) { if (DBG) console.warn('[Refiner v9] pathA threw', e); }
    _w.__LR_LAST_RERENDER_HITS = rerenderHits;
    if (DBG) console.log('[Refiner v9] pathA hits=', rerenderHits);

    return updated;
  }

  // Path 0 mutation walker, factored out for both tryStoreUpdate and manual testing.
  // Defensive against Proxy/getter throws and per-hook seen-set isolation: a throw on
  // one branch never poisons sibling branches or other hooks.
  function runPath0Mutation(messageId, newText) {
    const summary = { roots: 0, fibersVisited: 0, hooksScanned: 0, propsScanned: 0, isMsgEncounters: 0, hits: 0, errors: 0, mutationErrors: 0 };
    if (!messageId) return summary;

    const isMsg = (v) => {
      if (!v || typeof v !== 'object') return false;
      try {
        return v.id === messageId || v._id === messageId || v.messageId === messageId || v.msgId === messageId;
      } catch (_) { return false; }
    };
    const fieldKeyOf = (v) => {
      try {
        if ('content' in v) return 'content';
        if ('message' in v) return 'message';
        if ('text' in v) return 'text';
        if ('body' in v) return 'body';
      } catch (_) {}
      return null;
    };

    // single per-root WeakSet that survives across hooks (msg ref is shared)
    const globallySeen = new WeakSet();
    let totalObjs = 0;
    const OBJ_BUDGET = 200000;

    const mutate = (val, depth, localSeen) => {
      if (!val || depth > 14 || typeof val !== 'object') return;
      if (totalObjs++ > OBJ_BUDGET) return;
      if (localSeen.has(val)) return;
      localSeen.add(val);

      // try mutate first, BEFORE adding to globallySeen, so a throw later doesn't block re-entry
      let didMutate = false;
      let isM = false;
      try { isM = isMsg(val); } catch (_) { summary.errors++; }
      if (isM) {
        summary.isMsgEncounters++;
        const fk = fieldKeyOf(val);
        if (fk) {
          let cur;
          try { cur = val[fk]; } catch (_) { cur = undefined; summary.errors++; }
          if (cur !== newText) {
            try { val[fk] = newText; summary.hits++; didMutate = true; } catch (_) { summary.mutationErrors++; }
          }
        }
      }

      // recurse defensively
      let isArr = false;
      try { isArr = Array.isArray(val); } catch (_) {}
      if (isArr) {
        for (let i = 0; i < val.length; i++) {
          let child;
          try { child = val[i]; } catch (_) { summary.errors++; continue; }
          try { mutate(child, depth + 1, localSeen); } catch (_) { summary.errors++; }
        }
        return;
      }
      let proto;
      try { proto = Object.getPrototypeOf(val); } catch (_) { summary.errors++; return; }
      if (proto !== Object.prototype && proto !== null) return;
      let keys;
      try { keys = Object.keys(val); } catch (_) { summary.errors++; return; }
      for (const k of keys) {
        let child;
        try { child = val[k]; } catch (_) { summary.errors++; continue; }
        try { mutate(child, depth + 1, localSeen); } catch (_) { summary.errors++; }
      }
    };

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
    summary.roots = roots.length;

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
        // hook chain — fresh localSeen per hook so one stuck hook can't block others
        let h = f.memoizedState; let i = 0;
        while (h && i < 60) {
          summary.hooksScanned++;
          try { mutate(h.memoizedState, 0, new WeakSet()); } catch (_) { summary.errors++; }
          i++; h = h.next;
        }
        // memoizedProps with its own fresh seen
        try { mutate(f.memoizedProps, 0, new WeakSet()); summary.propsScanned++; } catch (_) { summary.errors++; }
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
    }
    summary.fibersVisited = visited;
    return summary;
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
  R.tryStoreUpdate = tryStoreUpdate;
  R.runPath0Mutation = runPath0Mutation;
  R.showReloadAction = showReloadAction;
  R.showRefineConfirm = showRefineConfirm;
  R.__version = 'v9';
  R.__domLoaded = true;

})();
