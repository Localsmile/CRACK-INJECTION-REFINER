// lore settings shell
// Native settings surface that consumes the existing menu callback API.
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
        --li-bg: #0b0f17;
        --li-panel: #111827;
        --li-panel-2: #151f2e;
        --li-line: #273244;
        --li-line-strong: #3a465a;
        --li-text: #e7edf5;
        --li-text-soft: #a9b6c7;
        --li-muted: #748196;
        --li-accent: #5aa7ff;
        --li-accent-bg: #143456;
        --li-danger: #ef6b6b;
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: none;
        color: var(--li-text);
        font-family: inherit;
      }
      #${SHELL_ID}[data-open="true"] { display: block; }
      .lore-shell-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(2, 6, 12, .74);
        backdrop-filter: blur(4px);
      }
      .lore-shell-frame {
        position: absolute;
        inset: min(4vh, 34px) min(3vw, 42px);
        display: grid;
        grid-template-columns: 248px minmax(0, 1fr);
        max-width: 1180px;
        margin: 0 auto;
        background: var(--li-panel);
        border: 1px solid var(--li-line-strong);
        border-radius: 14px;
        box-shadow: 0 28px 70px rgba(0,0,0,.58);
        overflow: hidden;
      }
      .lore-shell-nav {
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 12px;
        min-height: 0;
        background: #0d1420;
        border-right: 1px solid var(--li-line);
        padding: 16px;
      }
      .lore-shell-brand {
        padding-bottom: 12px;
        border-bottom: 1px solid var(--li-line);
      }
      .lore-shell-brand-title {
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0;
        color: #f8fbff;
      }
      .lore-shell-brand-sub {
        margin-top: 6px;
        font-size: 12px;
        color: var(--li-text-soft);
        line-height: 1.45;
        word-break: keep-all;
      }
      .lore-shell-search {
        width: 100%;
        height: 34px;
        box-sizing: border-box;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: #090f18;
        color: var(--li-text);
        padding: 0 10px;
        font-size: 12px;
        outline: none;
      }
      .lore-shell-search:focus { border-color: var(--li-accent); }
      .lore-shell-nav-list {
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .lore-shell-nav-btn {
        width: 100%;
        min-height: 42px;
        padding: 8px 10px;
        border: 1px solid transparent;
        border-radius: 9px;
        background: transparent;
        color: var(--li-text-soft);
        text-align: left;
        cursor: pointer;
        letter-spacing: 0;
      }
      .lore-shell-nav-btn:hover { background: #142033; }
      .lore-shell-nav-btn[data-active="true"] {
        background: var(--li-accent-bg);
        border-color: #276296;
        color: #f8fbff;
      }
      .lore-shell-nav-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 13px;
        font-weight: 800;
      }
      .lore-shell-nav-desc {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.35;
        color: var(--li-muted);
      }
      .lore-shell-nav-count {
        min-width: 20px;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(255,255,255,.08);
        color: var(--li-text-soft);
        font-size: 10px;
        text-align: center;
      }
      .lore-shell-system {
        border-top: 1px solid var(--li-line);
        padding-top: 10px;
        color: var(--li-muted);
        font-size: 11px;
        line-height: 1.5;
      }
      .lore-shell-main {
        min-width: 0;
        display: grid;
        grid-template-rows: auto 1fr;
        background: var(--li-panel);
      }
      .lore-shell-header {
        min-height: 62px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 18px;
        border-bottom: 1px solid var(--li-line);
        background: #111827;
      }
      .lore-shell-title-wrap { min-width: 0; }
      .lore-shell-title {
        font-size: 17px;
        font-weight: 800;
        color: #f8fbff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-shell-subtitle {
        margin-top: 4px;
        font-size: 12px;
        color: var(--li-text-soft);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-shell-close {
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--li-line-strong);
        border-radius: 8px;
        background: transparent;
        color: var(--li-text-soft);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }
      .lore-shell-close:hover { border-color: var(--li-accent); color: var(--li-text); }
      .lore-shell-body {
        display: grid;
        grid-template-columns: minmax(174px, 23%) minmax(0, 1fr);
        min-height: 0;
      }
      .lore-shell-subnav {
        min-height: 0;
        overflow: auto;
        background: #101827;
        border-right: 1px solid var(--li-line);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .lore-shell-sub-btn {
        width: 100%;
        min-height: 36px;
        padding: 8px 9px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--li-text-soft);
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
      }
      .lore-shell-sub-btn:hover { background: #172235; }
      .lore-shell-sub-btn[data-active="true"] {
        background: #1d2d45;
        border-color: #355578;
        color: #f8fbff;
      }
      .lore-shell-content {
        min-width: 0;
        overflow: auto;
        padding: 18px 20px 30px;
        background: linear-gradient(180deg, rgba(255,255,255,.015), transparent 120px), var(--li-panel);
      }
      .lore-shell-empty {
        border: 1px dashed var(--li-line-strong);
        border-radius: 10px;
        padding: 16px;
        color: var(--li-text-soft);
        font-size: 13px;
        line-height: 1.6;
        word-break: keep-all;
      }
      .lore-shell-field {
        border: 1px solid var(--li-line);
        border-radius: 10px;
        background: #0f1724;
        padding: 12px;
        margin-bottom: 12px;
      }
      @media (max-width: 860px) {
        .lore-shell-frame {
          inset: 0;
          max-width: none;
          border-radius: 0;
          grid-template-columns: 1fr;
        }
        .lore-shell-nav {
          grid-template-rows: auto auto;
          gap: 8px;
          border-right: 0;
          border-bottom: 1px solid var(--li-line);
          padding: 10px;
        }
        .lore-shell-brand,
        .lore-shell-system { display: none; }
        .lore-shell-nav-list {
          overflow-x: auto;
          flex-direction: row;
          padding-bottom: 2px;
        }
        .lore-shell-nav-btn {
          width: auto;
          min-width: 118px;
          flex: 0 0 auto;
        }
        .lore-shell-nav-desc { display: none; }
        .lore-shell-header { min-height: 56px; padding: 8px 12px; }
        .lore-shell-subtitle { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .lore-shell-body {
          grid-template-columns: 1fr;
          grid-template-rows: auto 1fr;
        }
        .lore-shell-subnav {
          border-right: 0;
          border-bottom: 1px solid var(--li-line);
          flex-direction: row;
          overflow-x: auto;
          padding: 8px 10px;
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
    activePage: '',
    query: ''
  };

  function normalizeText(text) {
    return String(text || '').toLowerCase();
  }

  function pageMatches(root, page) {
    const q = normalizeText(state.query).trim();
    if (!q) return true;
    return normalizeText(root.label + ' ' + root.desc + ' ' + page.label).includes(q);
  }

  function ensureRoot(id, label, desc, order) {
    if (!state.roots.has(id)) {
      state.roots.set(id, { id, label: label || id, desc: desc || '', order: order || 1000, pages: [] });
      state.rootOrder.push(id);
      state.rootOrder.sort((a, b) => {
        const ra = state.roots.get(a);
        const rb = state.roots.get(b);
        const ao = ra ? ra.order : 1000;
        const bo = rb ? rb.order : 1000;
        if (ao !== bo) return ao - bo;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    } else {
      const root = state.roots.get(id);
      if (label) root.label = label;
      if (desc) root.desc = desc;
      if (order) root.order = order;
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

  function addPage(rootId, label, action) {
    const root = ensureRoot(rootId, rootId, '', 1000);
    const id = rootId + ':' + label;
    if (!state.pages.has(id)) {
      state.pages.set(id, { id, rootId, label, action });
      root.pages.push(id);
    }
    return state.pages.get(id);
  }

  function createCollector(rootId, rootLabel, rootDesc, rootOrder) {
    const root = ensureRoot(rootId, rootLabel, rootDesc, rootOrder);
    return {
      createMenu: function (label, action) {
        return addPage(root.id, label, action);
      },
      createSubMenu: function (label, action) {
        return addPage(root.id, label, action);
      }
    };
  }

  function renderPage(page) {
    const shell = document.getElementById(SHELL_ID);
    if (!shell || !page) return;
    const content = shell.querySelector('.lore-shell-content');
    const title = shell.querySelector('.lore-shell-title');
    const subtitle = shell.querySelector('.lore-shell-subtitle');
    const root = state.roots.get(page.rootId);
    content.innerHTML = '';
    title.textContent = page.label;
    subtitle.textContent = root && root.desc ? root.desc : '설정을 확인하고 필요한 작업을 실행함';
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

  function firstVisiblePage(root) {
    if (!root) return null;
    for (const pageId of root.pages) {
      const page = state.pages.get(pageId);
      if (page && pageMatches(root, page)) return page;
    }
    return null;
  }

  function firstVisibleRoot() {
    for (const rootId of state.rootOrder) {
      const root = state.roots.get(rootId);
      if (firstVisiblePage(root)) return root;
    }
    return null;
  }

  function setActive(rootId, pageId) {
    const root = state.roots.get(rootId);
    if (!root) return;
    const page = pageId ? state.pages.get(pageId) : firstVisiblePage(root);
    if (!page) return;
    state.activeRoot = rootId;
    state.activePage = page.id;
    renderShellNav();
    renderPage(page);
  }

  function renderShellNav() {
    const shell = document.getElementById(SHELL_ID);
    if (!shell) return;
    const nav = shell.querySelector('.lore-shell-nav-list');
    const sub = shell.querySelector('.lore-shell-subnav');
    const system = shell.querySelector('.lore-shell-system');
    nav.innerHTML = '';
    sub.innerHTML = '';
    const root = state.roots.get(state.activeRoot);
    const activeStillVisible = root && state.pages.get(state.activePage) && pageMatches(root, state.pages.get(state.activePage));
    if (!activeStillVisible) {
      const nextRoot = firstVisibleRoot();
      if (nextRoot) {
        const nextPage = firstVisiblePage(nextRoot);
        state.activeRoot = nextRoot.id;
        state.activePage = nextPage ? nextPage.id : '';
      }
    }
    let visibleRoots = 0;
    state.rootOrder.forEach((rootId) => {
      const root = state.roots.get(rootId);
      if (!root) return;
      const visiblePages = root.pages.map(id => state.pages.get(id)).filter(page => page && pageMatches(root, page));
      if (!visiblePages.length) return;
      visibleRoots += 1;
      const btn = document.createElement('button');
      btn.className = 'lore-shell-nav-btn';
      btn.dataset.active = String(rootId === state.activeRoot);
      btn.innerHTML = `
        <span class="lore-shell-nav-label"><span></span><span class="lore-shell-nav-count"></span></span>
        <span class="lore-shell-nav-desc"></span>
      `;
      btn.querySelector('.lore-shell-nav-label span:first-child').textContent = root.label;
      btn.querySelector('.lore-shell-nav-count').textContent = String(visiblePages.length);
      btn.querySelector('.lore-shell-nav-desc').textContent = root.desc;
      btn.onclick = () => setActive(rootId);
      nav.appendChild(btn);
    });
    const activeRoot = state.roots.get(state.activeRoot);
    if (activeRoot) {
      activeRoot.pages.forEach((pageId) => {
        const page = state.pages.get(pageId);
        if (!page || !pageMatches(activeRoot, page)) return;
        const btn = document.createElement('button');
        btn.className = 'lore-shell-sub-btn';
        btn.textContent = page.label;
        btn.dataset.active = String(pageId === state.activePage);
        btn.onclick = () => setActive(activeRoot.id, pageId);
        sub.appendChild(btn);
      });
    }
    if (system) {
      const totalPages = Array.from(state.pages.values()).length;
      system.textContent = '섹션 ' + state.rootOrder.length + '개, 화면 ' + totalPages + '개. 검색 결과 ' + visibleRoots + '개 섹션 표시 중.';
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
            <div class="lore-shell-brand-sub">Status, Memory, Retrieval, Injection, Models 기준으로 관리함</div>
          </div>
          <input class="lore-shell-search" type="search" placeholder="설정 검색" aria-label="설정 검색">
          <div class="lore-shell-nav-list"></div>
          <div class="lore-shell-system"></div>
        </aside>
        <main class="lore-shell-main">
          <header class="lore-shell-header">
            <div class="lore-shell-title-wrap">
              <div class="lore-shell-title">설정</div>
              <div class="lore-shell-subtitle">작업 흐름을 선택함</div>
            </div>
            <button class="lore-shell-close" type="button" title="닫기" aria-label="닫기">X</button>
          </header>
          <div class="lore-shell-body">
            <nav class="lore-shell-subnav" aria-label="하위 설정"></nav>
            <section class="lore-shell-content"></section>
          </div>
        </main>
      </div>
    `;
    shell.querySelector('.lore-shell-backdrop').onclick = close;
    shell.querySelector('.lore-shell-close').onclick = close;
    const search = shell.querySelector('.lore-shell-search');
    search.oninput = () => {
      state.query = search.value || '';
      renderShellNav();
      const page = state.pages.get(state.activePage);
      if (page) renderPage(page);
    };
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && shell.dataset.open === 'true') close();
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k' && shell.dataset.open === 'true') {
        ev.preventDefault();
        search.focus();
      }
    });
    (document.body || document.documentElement).appendChild(shell);
    return shell;
  }

  function open() {
    const shell = ensureShell();
    if (!state.activeRoot) {
      const firstRoot = firstVisibleRoot();
      if (firstRoot) setActive(firstRoot.id);
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

  function groupMetaForKey(key, menuGroups, keyToGroup) {
    const groupId = keyToGroup[key] || key;
    const group = menuGroups[groupId] || { label: key, desc: '', order: 1000 };
    return { id: groupId, label: group.label || key, desc: group.desc || '', order: group.order || 1000 };
  }

  function mountQueues(menuQ, subQ, menuGroups, keyToGroup) {
    resetRegistry();
    menuGroups = menuGroups || {};
    keyToGroup = keyToGroup || {};
    (menuQ || []).forEach(({ key, cb }) => {
      const meta = groupMetaForKey(key, menuGroups, keyToGroup);
      try {
        cb(createCollector(meta.id, meta.label, meta.desc, meta.order));
      } catch (e) { console.error('[LoreShell] menu collect failed:', key, e); }
    });
    (subQ || []).forEach(({ key, cb }) => {
      const meta = groupMetaForKey(key, menuGroups, keyToGroup);
      try {
        cb(createCollector(meta.id, meta.label, meta.desc, meta.order));
      } catch (e) { console.error('[LoreShell] submenu collect failed:', key, e); }
    });
    if (document.getElementById(SHELL_ID)) {
      if (!state.activeRoot) {
        const firstRoot = firstVisibleRoot();
        if (firstRoot) setActive(firstRoot.id);
      } else {
        renderShellNav();
        const page = state.pages.get(state.activePage);
        if (page) renderPage(page);
      }
    }
  }

  L.__LoreSettingsShell = { mountQueues, open, close, ensureShell };
  L.__settingsShellLoaded = true;
  console.log('[LoreShell] loaded');
})();
