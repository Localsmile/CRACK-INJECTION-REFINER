// refiner / dom 모듈
// 역할: DOM 조작, 최소 client ref 갱신, native remount nudge, fallback 렌더
// 의존: 없음 (순수 DOM 유틸)
(function () {
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const R = _w.__LoreRefiner = _w.__LoreRefiner || {};

  // Diagnostics are initialized before the load guard so console probes never ReferenceError.
  _w.__LR_LAST_NATIVE_NUDGE = false;
  _w.__LR_LAST_DOM_FALLBACK = null;
  _w.__LR_LAST_VISIBLE_AFTER_VERIFY = null;
  _w.__LR_LAST_RERENDER_HITS = _w.__LR_LAST_RERENDER_HITS || 0;
  _w.__LR_LAST_OPS = _w.__LR_LAST_OPS || 0;
  _w.__LR_LAST_PATH0 = _w.__LR_LAST_PATH0 || null;

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
    const marked = document.querySelector(`[data-lore-refiner-message-id="${id.replace(/"/g, '\\"')}"]`);
    if (marked) return getMessageContainer(marked);

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
    return null;
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
      const score = text.length + el.querySelectorAll('*').length * 50;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  }

  function renderMarkdownHTML(mdText) {
    let html = escapeHTML(mdText);
    const fences = [];
    html = html.replace(/```(\w*)\r?\n?([\s\S]*?)```/g, function (_m, lang, code) {
      const idx = fences.length;
      fences.push('<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code + '</code></pre>');
      return '@@LRFENCE' + idx + '@@';
    });
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (_m, alt, src) {
      return '<img alt="' + alt + '" src="' + src + '" style="max-width:100%;height:auto;">';
    });
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    html = html
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\n/g, '<br>');
    return html.replace(/@@LRFENCE(\d+)@@(<br>)?/g, function (_m, idx) { return fences[+idx]; });
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
    const timeout = timeoutMs || 2500;
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
    const allMds = document.querySelectorAll('.wrtn-markdown');

    let targetEl = null;
    if (oldSnippet) {
      for (const md of allMds) {
        const t = normalizeText(md.textContent);
        if (t.includes(oldSnippet) && (!newSnippet || !t.includes(newSnippet))) {
          targetEl = md;
          break;
        }
      }
    }
    if (!targetEl && oldSnippet) {
      for (const md of allMds) {
        if (normalizeText(md.textContent).includes(oldSnippet)) {
          targetEl = md;
          break;
        }
      }
    }
    if (!targetEl && newSnippet) {
      for (const md of allMds) {
        if (normalizeText(md.textContent).includes(newSnippet)) {
          try {
            const c = getMessageContainer(md);
            if (c && messageId) c.setAttribute('data-lore-refiner-message-id', String(messageId));
          } catch (_) {}
          return { applied: false, visible: true, status: 'done', messageId: messageId || null };
        }
      }
    }
    if (!targetEl || !document.contains(targetEl)) {
      return { applied: false, visible: false, status: 'not_found', messageId: messageId || null };
    }

    try {
      targetEl.innerHTML = renderedHTML;
      const c = getMessageContainer(targetEl);
      if (c && messageId) c.setAttribute('data-lore-refiner-message-id', String(messageId));
    } catch (_) {}

    return { applied: true, visible: true, status: 'applied', messageId: messageId || null };
  }

  function getReactRoots() {
    const roots = [];
    const add = (el) => {
      if (!el) return;
      try {
        const k = Object.keys(el).find(x => x.startsWith('__reactContainer$'));
        if (k && el[k] && el[k].stateNode) roots.push(el[k].stateNode.current);
      } catch (_) {}
      try {
        if (el._reactRootContainer && el._reactRootContainer._internalRoot) roots.push(el._reactRootContainer._internalRoot.current);
      } catch (_) {}
    };
    add(document.getElementById('__next'));
    add(document.getElementById('root'));
    document.querySelectorAll('body > div, body > main').forEach(add);
    return roots;
  }

  function runPath0Mutation(messageId, newText) {
    const summary = { roots: 0, fibersVisited: 0, hooksScanned: 0, propsScanned: 0, isMsgEncounters: 0, hits: 0, errors: 0, mutationErrors: 0, objects: 0 };
    if (!messageId) return summary;

    const isMsg = (v) => {
      if (!v || typeof v !== 'object') return false;
      try { return v.id === messageId || v._id === messageId || v.messageId === messageId || v.msgId === messageId; }
      catch (_) { return false; }
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

    const mutate = (val, depth, seen) => {
      if (!val || typeof val !== 'object' || depth > 14 || seen.has(val) || summary.objects > 120000) return;
      seen.add(val);
      summary.objects++;

      let matched = false;
      try { matched = isMsg(val); } catch (_) { summary.errors++; }
      if (matched) {
        summary.isMsgEncounters++;
        const fk = fieldKeyOf(val);
        if (fk) {
          let cur;
          try { cur = val[fk]; } catch (_) { summary.errors++; }
          if (cur !== newText) {
            try { val[fk] = newText; summary.hits++; } catch (_) { summary.mutationErrors++; }
          }
        }
      }

      let isArr = false;
      try { isArr = Array.isArray(val); } catch (_) {}
      if (isArr) {
        for (let i = 0; i < val.length && i < 500; i++) {
          try { mutate(val[i], depth + 1, seen); } catch (_) { summary.errors++; }
        }
        return;
      }

      let proto;
      try { proto = Object.getPrototypeOf(val); } catch (_) { summary.errors++; return; }
      if (proto !== Object.prototype && proto !== null) return;

      let keys;
      try { keys = Object.keys(val); } catch (_) { summary.errors++; return; }
      for (const k of keys) {
        try { mutate(val[k], depth + 1, seen); } catch (_) { summary.errors++; }
      }
    };

    const roots = getReactRoots();
    summary.roots = roots.length;
    const seenFibers = new WeakSet();
    let visited = 0;
    for (const root of roots) {
      const stack = [root];
      while (stack.length && visited < 50000) {
        const f = stack.pop();
        if (!f || seenFibers.has(f)) continue;
        seenFibers.add(f);
        visited++;

        let h = f.memoizedState;
        let i = 0;
        while (h && i < 60) {
          summary.hooksScanned++;
          try { mutate(h.memoizedState, 0, new WeakSet()); } catch (_) { summary.errors++; }
          h = h.next;
          i++;
        }

        try { mutate(f.memoizedProps, 0, new WeakSet()); summary.propsScanned++; } catch (_) { summary.errors++; }
        try { mutate(f.pendingProps, 0, new WeakSet()); summary.propsScanned++; } catch (_) { summary.errors++; }

        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
      }
    }
    summary.fibersVisited = visited;
    return summary;
  }

  function tryStoreUpdate(rootEl, messageId, newText) {
    const result = runPath0Mutation(messageId, newText);
    _w.__LR_LAST_PATH0 = result;
    _w.__LR_LAST_OPS = result.objects || 0;

    // A successful path0 mutation means edit-mode/native remount can read corrected refs.
    // Mark rerender as truthy to avoid immediate generic DOM stomp; core verifies visibility
    // shortly after and triggers native nudge/fallback only if needed.
    const ok = result.hits > 0;
    _w.__LR_LAST_RERENDER_HITS = ok ? 1 : 0;
    return ok;
  }

  function nudgeMessageNativeRender(messageId) {
    try {
      const container = findMessageContainerById(messageId);
      if (!container || !document.contains(container)) return false;
      const host = container.closest?.('article, section, li, [data-message-id], [data-testid*="message"], [class*="message"]') || container;

      try {
        ['mouseenter', 'mouseover', 'mousemove'].forEach(t => {
          host.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
        });
      } catch (_) {}

      const labelOf = (el) => {
        if (!el) return '';
        return [
          el.textContent,
          el.getAttribute && el.getAttribute('aria-label'),
          el.getAttribute && el.getAttribute('title'),
          el.getAttribute && el.getAttribute('data-testid')
        ].filter(Boolean).join(' ').trim();
      };
      const findButton = (root, re) => {
        if (!root || !root.querySelectorAll) return null;
        const buttons = root.querySelectorAll('button, [role="button"], [aria-label], [title]');
        for (const b of buttons) {
          try { if (re.test(labelOf(b))) return b; } catch (_) {}
        }
        return null;
      };

      const editBtn = findButton(host, /(수정|편집|edit)/i)
                   || findButton(host.parentElement, /(수정|편집|edit)/i);
      if (!editBtn) return false;
      try { editBtn.click(); } catch (_) { return false; }

      setTimeout(() => {
        try {
          const cancelBtn = findButton(host, /(취소|cancel|닫기|close)/i)
                         || findButton(document, /(취소|cancel)/i);
          if (cancelBtn) {
            try { cancelBtn.click(); return; } catch (_) {}
          }
          const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
          try { (document.activeElement || document.body).dispatchEvent(esc); } catch (_) {}
          try { document.dispatchEvent(esc); } catch (_) {}
        } catch (_) {}
      }, 180);

      return true;
    } catch (_) {
      return false;
    }
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
    row.appendChild(close);
    row.appendChild(reload);
    box.appendChild(text);
    box.appendChild(row);
    document.body.appendChild(box);
    setTimeout(() => { if (document.body.contains(box)) box.remove(); }, 20000);
  }

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

    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnConfirm);
    box.appendChild(title);
    box.appendChild(reasonTitle);
    box.appendChild(reasonText);
    box.appendChild(refTitle);
    box.appendChild(refTa);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  R.escapeHTML = escapeHTML;
  R.stripMarkdown = stripMarkdown;
  R.findMessageContainerById = findMessageContainerById;
  R.findDeepestMatchingElement = findDeepestMatchingElement;
  R.renderMarkdownHTML = renderMarkdownHTML;
  R.isTextVisible = isTextVisible;
  R.waitForVisibleText = waitForVisibleText;
  R.rememberAssistantMessage = rememberAssistantMessage;
  R.refreshMessageInDOM = refreshMessageInDOM;
  R.tryStoreUpdate = tryStoreUpdate;
  R.runPath0Mutation = runPath0Mutation;
  R.nudgeMessageNativeRender = nudgeMessageNativeRender;
  R.showReloadAction = showReloadAction;
  R.showRefineConfirm = showRefineConfirm;
  R.__version = 'v21';
  R.__domLoaded = true;
})();
