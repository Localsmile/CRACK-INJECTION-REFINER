// lore settings shell
// Native settings surface that can consume the existing menu callback API.
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const L = _w.__LoreInj = _w.__LoreInj || {};
  if (L.__settingsShellLoaded) return;

  const SHELL_ID = 'lore-settings-shell';
  const STYLE_ID = 'lore-settings-shell-style';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #${SHELL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: none;
        color: #e5e7eb;
        font-family: inherit;
      }
      #${SHELL_ID}[data-open="true"] { display: block; }
      .lore-shell-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(3, 7, 18, .72);
        backdrop-filter: blur(4px);
      }
      .lore-shell-frame {
        position: absolute;
        inset: min(5vh, 44px) min(4vw, 48px);
        display: grid;
        grid-template-columns: 220px 1fr;
        background: #111827;
        border: 1px solid #374151;
        border-radius: 12px;
        box-shadow: 0 24px 60px rgba(0,0,0,.55);
        overflow: hidden;
      }
      .lore-shell-nav {
        background: #0b1220;
        border-right: 1px solid #253044;
        padding: 14px;
        overflow: auto;
      }
      .lore-shell-brand {
        padding: 8px 8px 14px;
        border-bottom: 1px solid #253044;
        margin-bottom: 12px;
      }
      .lore-shell-brand-title {
        font-size: 15px;
        font-weight: 800;
        color: #f8fafc;
        letter-spacing: 0;
      }
      .lore-shell-brand-sub {
        margin-top: 4px;
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.45;
      }
      .lore-shell-main {
        min-width: 0;
        display: grid;
        grid-template-rows: auto 1fr;
        background: #111827;
      }
      .lore-shell-header {
        height: 54px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 18px;
        border-bottom: 1px solid #253044;
        background: #111827;
      }
      .lore-shell-title {
        font-size: 16px;
        font-weight: 800;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-shell-close {
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #374151;
        border-radius: 8px;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      .lore-shell-body {
        display: grid;
        grid-template-columns: minmax(170px, 24%) 1fr;
        min-height: 0;
      }
      .lore-shell-subnav {
        border-right: 1px solid #253044;
        background: #0f172a;
        padding: 12px;
        overflow: auto;
      }
      .lore-shell-content {
        min-width: 0;
        overflow: auto;
        padding: 16px 18px 28px;
      }
      .lore-shell-nav-btn,
      .lore-shell-sub-btn {
        width: 100%;
        min-height: 36px;
        padding: 8px 10px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: #cbd5e1;
        text-align: left;
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0;
      }
      .lore-shell-sub-btn { font-weight: 600; color: #b6c2d3; }
      .lore-shell-nav-btn:hover,
      .lore-shell-sub-btn:hover { background: #172033; }
      .lore-shell-nav-btn[data-active="true"],
      .lore-shell-sub-btn[data-active="true"] {
        background: #1e3a5f;
        border-color: #315f96;
        color: #f8fafc;
      }
      .lore-shell-empty {
        border: 1px dashed #374151;
        border-radius: 10px;
        padding: 18px;
        color: #94a3b8;
        font-size: 13px;
        line-height: 1.6;
      }
      .lore-shell-field {
        border: 1px solid #2d3748;
        border-radius: 10px;
        background: #0f172a;
        padding: 12px;
        margin-bottom: 12px;
      }
      @media (max-width: 760px) {
        .lore-shell-frame {
          inset: 0;
          border-radius: 0;
          grid-template-columns: 1fr;
        }
        .lore-shell-nav {
          border-right: 0;
          border-bottom: 1px solid #253044;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 10px;
        }
        .lore-shell-brand { display: none; }
        .lore-shell-nav-btn {
          width: auto;
          white-space: nowrap;
          flex: 0 0 auto;
        }
        .lore-shell-body {
          grid-template-columns: 1fr;
          grid-template-rows: auto 1fr;
        }
        .lore-shell-subnav {
          border-right: 0;
          border-bottom: 1px solid #253044;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 10px;
        }
        .lore-shell-sub-btn {
          width: auto;
          white-space: nowrap;
          flex: 0 0 auto;
        }
        .lore-shell-content { padding: 14px 12px 24px; }
      }
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  const state = {
    rootOrder: [],
    roots: new Map(),
    pages: new Map(),
    activeRoot: '',
    activePage: ''
  };

  function ensureRoot(id, label, desc) {
    if (!state.roots.has(id)) {
      state.roots.set(id, { id, label: label || id, desc: desc || '', pages: [] });
      state.rootOrder.push(id);
    }
    return state.roots.get(id);
  }

  function makePanelAdapter(content) {
    return {
      addBoxedField: function (_label, _value, opts) {
        const box = document.createElement('div');
        box.className = 'lore-shell-field';
        content.appendChild(box);
        if (opts && typeof opts.onInit === 'function') opts.onInit(box);
        return box;
      },
      addText: function (text) {
        const p = document.createElement('div');
        p.textContent = text || '';
        p.className = 'lore-shell-empty';
        content.appendChild(p);
        return p;
      }
    };
  }

  function addPage(rootId, label, action, desc) {
    const root = ensureRoot(rootId, rootId, desc);
    const id = rootId + ':' + label;
    if (!state.pages.has(id)) {
      state.pages.set(id, { id, rootId, label, action });
      root.pages.push(id);
    }
    return state.pages.get(id);
  }

  function createCollector(rootId, rootLabel, rootDesc) {
    const root = ensureRoot(rootId, rootLabel, rootDesc);
    return {
      createMenu: function (label, action) {
        return addPage(root.id, label, action, root.desc);
      },
      createSubMenu: function (label, action) {
        return addPage(root.id, label, action, root.desc);
      }
    };
  }

  function renderPage(page) {
    const shell = document.getElementById(SHELL_ID);
    if (!shell || !page) return;
    const content = shell.querySelector('.lore-shell-content');
    const title = shell.querySelector('.lore-shell-title');
    content.innerHTML = '';
    title.textContent = page.label;
    const menuApi = {
      replaceContentPanel: function (renderer, titleOverride) {
        if (titleOverride) title.textContent = titleOverride;
        content.innerHTML = '';
        const panel = makePanelAdapter(content);
        if (typeof renderer === 'function') renderer(panel);
      }
    };
    try {
      page.action(menuApi);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'lore-shell-empty';
      err.textContent = '화면 렌더링 실패: ' + (e && e.message ? e.message : String(e));
      content.appendChild(err);
      console.error('[LoreShell] render failed:', page.id, e);
    }
  }

  function setActive(rootId, pageId) {
    const root = state.roots.get(rootId);
    if (!root) return;
    const nextPage = pageId || root.pages[0];
    const page = state.pages.get(nextPage);
    if (!page) return;
    state.activeRoot = rootId;
    state.activePage = nextPage;
    renderShellNav();
    renderPage(page);
  }

  function renderShellNav() {
    const shell = document.getElementById(SHELL_ID);
    if (!shell) return;
    const nav = shell.querySelector('.lore-shell-nav-list');
    const sub = shell.querySelector('.lore-shell-subnav');
    nav.innerHTML = '';
    sub.innerHTML = '';
    state.rootOrder.forEach((rootId) => {
      const root = state.roots.get(rootId);
      if (!root || !root.pages.length) return;
      const btn = document.createElement('button');
      btn.className = 'lore-shell-nav-btn';
      btn.textContent = root.label;
      btn.dataset.active = String(rootId === state.activeRoot);
      btn.onclick = () => setActive(rootId);
      nav.appendChild(btn);
    });
    const root = state.roots.get(state.activeRoot);
    if (root) {
      root.pages.forEach((pageId) => {
        const page = state.pages.get(pageId);
        if (!page) return;
        const btn = document.createElement('button');
        btn.className = 'lore-shell-sub-btn';
        btn.textContent = page.label;
        btn.dataset.active = String(pageId === state.activePage);
        btn.onclick = () => setActive(root.id, pageId);
        sub.appendChild(btn);
      });
    }
  }

  function ensureShell() {
    installStyle();
    let shell = document.getElementById(SHELL_ID);
    if (shell) return shell;
    shell = document.createElement('div');
    shell.id = SHELL_ID;
    shell.innerHTML = `
      <div class="lore-shell-backdrop"></div>
      <div class="lore-shell-frame" role="dialog" aria-modal="true" aria-label="Lore Injector 설정">
        <aside class="lore-shell-nav">
          <div class="lore-shell-brand">
            <div class="lore-shell-brand-title">Lore Injector</div>
            <div class="lore-shell-brand-sub">로어, 자동화, API, 진단을 작업 흐름별로 관리함</div>
          </div>
          <div class="lore-shell-nav-list"></div>
        </aside>
        <main class="lore-shell-main">
          <header class="lore-shell-header">
            <div class="lore-shell-title">설정</div>
            <button class="lore-shell-close" type="button" title="닫기" aria-label="닫기">X</button>
          </header>
          <div class="lore-shell-body">
            <nav class="lore-shell-subnav"></nav>
            <section class="lore-shell-content"></section>
          </div>
        </main>
      </div>
    `;
    shell.querySelector('.lore-shell-backdrop').onclick = close;
    shell.querySelector('.lore-shell-close').onclick = close;
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && shell.dataset.open === 'true') close();
    });
    (document.body || document.documentElement).appendChild(shell);
    return shell;
  }

  function open() {
    const shell = ensureShell();
    if (!state.activeRoot) {
      const firstRoot = state.rootOrder.find(id => {
        const root = state.roots.get(id);
        return root && root.pages.length;
      });
      if (firstRoot) setActive(firstRoot);
    } else {
      renderShellNav();
      renderPage(state.pages.get(state.activePage));
    }
    shell.dataset.open = 'true';
  }

  function close() {
    const shell = document.getElementById(SHELL_ID);
    if (shell) shell.dataset.open = 'false';
  }

  function resetRegistry() {
    state.rootOrder.length = 0;
    state.roots.clear();
    state.pages.clear();
    state.activeRoot = '';
    state.activePage = '';
  }

  function mountQueues(menuQ, subQ, menuGroups, keyToGroup) {
    resetRegistry();
    (menuQ || []).forEach(({ key, cb }) => {
      try {
        const collector = createCollector(key, key === 'main' ? '로어 설정' : key, '');
        cb(collector);
      } catch (e) { console.error('[LoreShell] menu collect failed:', key, e); }
    });
    (subQ || []).forEach(({ key, cb }) => {
      const groupKey = keyToGroup[key] || 'diagnostics';
      const group = menuGroups[groupKey] || { label: groupKey, desc: '' };
      try {
        const collector = createCollector(groupKey, group.label, group.desc);
        cb(collector);
      } catch (e) { console.error('[LoreShell] submenu collect failed:', key, e); }
    });
    if (document.getElementById(SHELL_ID)) {
      if (!state.activeRoot) {
        const firstRoot = state.rootOrder.find(id => state.roots.get(id)?.pages.length);
        if (firstRoot) setActive(firstRoot);
      } else {
        renderShellNav();
      }
    }
  }

  L.__LoreSettingsShell = { mountQueues, open, close, ensureShell };
  L.__settingsShellLoaded = true;
  console.log('[LoreShell] loaded');
})();
