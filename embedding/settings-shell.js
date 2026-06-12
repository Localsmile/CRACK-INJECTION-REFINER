// lore settings shell
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const L = _w.__LoreInj = _w.__LoreInj || {};
  if (L.__settingsShellLoaded) return;

  const SHELL_ID = 'lore-settings-shell';
  const STYLE_ID = 'lore-settings-shell-style';
  const LAST_SECTION_KEY = 'lore-ui-last-section';

  function kv() {
    return (L.__LoreEnv && L.__LoreEnv.kv) || _w.localStorage;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #${SHELL_ID} {
        --li-bg: #101113;
        --li-surface: #18191c;
        --li-surface-2: #202226;
        --li-surface-3: #272a2f;
        --li-line: #343840;
        --li-line-strong: #4b515c;
        --li-text: #f3f4f6;
        --li-text-soft: #b8bec8;
        --li-muted: #858c98;
        --li-accent: #8ab4ff;
        --li-accent-strong: #b8d2ff;
        --li-accent-bg: rgba(138,180,255,.13);
        --li-danger: #f06f6f;
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: none;
        color: var(--li-text);
        font-family: inherit;
        letter-spacing: 0;
      }
      #${SHELL_ID}[data-open="true"] { display: block; }
      #${SHELL_ID} * { box-sizing: border-box; }
      .lore-v2-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,.58);
      }
      .lore-v2-frame {
        position: absolute;
        top: 50%;
        left: 50%;
        width: min(920px, calc(100vw - 48px));
        height: min(680px, calc(100vh - 72px));
        transform: translate(-50%, -50%);
        display: grid;
        grid-template-columns: 176px minmax(0, 1fr);
        background: var(--li-surface);
        border: 1px solid var(--li-line-strong);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 26px 80px rgba(0,0,0,.48);
      }
      .lore-v2-sidebar {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 12px;
        padding: 14px 12px;
        background: #141518;
        border-right: 1px solid var(--li-line);
      }
      .lore-v2-brand {
        padding: 2px 4px 12px;
        border-bottom: 1px solid var(--li-line);
      }
      .lore-v2-brand-title {
        font-size: 15px;
        line-height: 1.2;
        font-weight: 900;
        color: var(--li-text);
      }
      .lore-v2-brand-sub {
        margin-top: 6px;
        font-size: 11px;
        line-height: 1.5;
        color: var(--li-muted);
        word-break: keep-all;
      }
      .lore-v2-search {
        width: 100%;
        height: 34px;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: #0f1012;
        color: var(--li-text);
        padding: 0 10px;
        font-size: 12px;
        outline: none;
      }
      .lore-v2-search:focus {
        border-color: var(--li-accent);
        box-shadow: 0 0 0 2px rgba(138,180,255,.12);
      }
      .lore-v2-sections {
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .lore-v2-section {
        width: 100%;
        min-height: 42px;
        padding: 8px 9px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--li-text-soft);
        text-align: left;
        cursor: pointer;
      }
      .lore-v2-section:hover { background: var(--li-surface-2); }
      .lore-v2-section[data-active="true"] {
        background: var(--li-accent-bg);
        border-color: rgba(138,180,255,.36);
        color: var(--li-text);
      }
      .lore-v2-section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
        font-weight: 900;
      }
      .lore-v2-section-desc {
        margin-top: 4px;
        color: var(--li-muted);
        font-size: 10px;
        line-height: 1.35;
        word-break: keep-all;
      }
      .lore-v2-count {
        min-width: 20px;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(255,255,255,.07);
        color: var(--li-text-soft);
        font-size: 10px;
        text-align: center;
      }
      .lore-v2-system {
        padding: 10px 4px 0;
        border-top: 1px solid var(--li-line);
        color: var(--li-muted);
        font-size: 10px;
        line-height: 1.55;
      }
      .lore-v2-main {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr;
        background: var(--li-surface);
      }
      .lore-v2-header {
        min-height: 54px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px 10px;
        border-bottom: 1px solid var(--li-line);
        background: var(--li-surface);
      }
      .lore-v2-title-wrap { min-width: 0; }
      .lore-v2-title {
        color: var(--li-text);
        font-size: 17px;
        font-weight: 900;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-v2-subtitle {
        margin-top: 4px;
        color: var(--li-muted);
        font-size: 11px;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-v2-close {
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: var(--li-surface-2);
        color: var(--li-text-soft);
        cursor: pointer;
        font-size: 14px;
        font-weight: 900;
      }
      .lore-v2-close:hover {
        border-color: var(--li-accent);
        color: var(--li-text);
      }
      .lore-v2-pages {
        min-height: 46px;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 9px 16px;
        border-bottom: 1px solid var(--li-line);
        background: #16171a;
      }
      .lore-v2-page {
        flex: 0 0 auto;
        min-height: 28px;
        max-width: 220px;
        padding: 6px 10px;
        border: 1px solid var(--li-line);
        border-radius: 999px;
        background: transparent;
        color: var(--li-text-soft);
        cursor: pointer;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-v2-page:hover { background: var(--li-surface-2); }
      .lore-v2-page[data-active="true"] {
        border-color: rgba(138,180,255,.42);
        background: var(--li-accent-bg);
        color: var(--li-accent-strong);
      }
      .lore-v2-content {
        min-width: 0;
        min-height: 0;
        overflow: auto;
        padding: 16px 18px 28px;
        background: var(--li-surface);
      }
      .lore-v2-empty {
        border: 1px dashed var(--li-line-strong);
        border-radius: 10px;
        padding: 14px;
        color: var(--li-text-soft);
        font-size: 12px;
        line-height: 1.7;
        word-break: keep-all;
      }
      .lore-v2-field {
        width: 100%;
        border: 1px solid var(--li-line);
        border-radius: 10px;
        background: var(--li-surface-2);
        padding: 12px;
        margin: 0 0 12px;
      }
      .lore-v2-content input,
      .lore-v2-content textarea,
      .lore-v2-content select {
        border-color: var(--li-line) !important;
        background: var(--li-bg) !important;
        color: var(--li-text) !important;
        border-radius: 8px !important;
        outline: none !important;
      }
      .lore-v2-content input:focus,
      .lore-v2-content textarea:focus,
      .lore-v2-content select:focus {
        border-color: var(--li-accent) !important;
        box-shadow: 0 0 0 2px rgba(138,180,255,.12) !important;
      }
      .lore-v2-content button {
        border-radius: 8px !important;
        letter-spacing: 0 !important;
      }
      .lore-v2-content table {
        width: 100%;
        border-collapse: collapse;
      }
      .lore-v2-content th,
      .lore-v2-content td {
        border-color: var(--li-line) !important;
      }
      .lore-v2-content pre,
      .lore-v2-content code {
        background: var(--li-bg);
        color: var(--li-text-soft);
      }
      .lore-v2-content ::placeholder {
        color: var(--li-muted);
        opacity: 1;
      }
      @media (prefers-color-scheme: light) {
        #${SHELL_ID} {
          --li-bg: #f7f7f8;
          --li-surface: #ffffff;
          --li-surface-2: #f3f4f6;
          --li-surface-3: #e9ebef;
          --li-line: #d4d7dd;
          --li-line-strong: #b7bcc6;
          --li-text: #17191d;
          --li-text-soft: #3d4350;
          --li-muted: #69707d;
          --li-accent: #2563eb;
          --li-accent-strong: #1d4ed8;
          --li-accent-bg: rgba(37,99,235,.10);
        }
        .lore-v2-sidebar { background: #f4f5f7; }
        .lore-v2-search { background: #fff; }
        .lore-v2-pages { background: #f8f8f9; }
      }
      @media (max-width: 639px) {
        .lore-v2-frame {
          inset: 0;
          top: auto;
          left: auto;
          width: 100vw;
          height: 100vh;
          transform: none;
          grid-template-columns: 1fr;
          grid-template-rows: auto 1fr;
          border: 0;
          border-radius: 0;
        }
        .lore-v2-sidebar {
          grid-template-rows: auto auto;
          gap: 8px;
          padding: calc(10px + env(safe-area-inset-top, 0px)) 10px 8px;
          border-right: 0;
          border-bottom: 1px solid var(--li-line);
        }
        .lore-v2-brand,
        .lore-v2-system { display: none; }
        .lore-v2-sections {
          flex-direction: row;
          overflow-x: auto;
          padding-bottom: 1px;
        }
        .lore-v2-section {
          width: auto;
          min-width: 108px;
          flex: 0 0 auto;
        }
        .lore-v2-section-desc { display: none; }
        .lore-v2-main { grid-template-rows: auto auto 1fr; }
        .lore-v2-header { min-height: 52px; padding: 9px 12px; }
        .lore-v2-subtitle {
          white-space: normal;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .lore-v2-pages { padding: 8px 10px; }
        .lore-v2-content { padding: 12px 10px calc(22px + env(safe-area-inset-bottom, 0px)); }
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

  function saveLastSection(rootId) {
    try { kv().setItem(LAST_SECTION_KEY, rootId || ''); } catch (_) {}
  }

  function loadLastSection() {
    try { return kv().getItem(LAST_SECTION_KEY) || ''; } catch (_) { return ''; }
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
        box.className = 'lore-v2-field';
        content.appendChild(box);
        if (opts && typeof opts.onInit === 'function') opts.onInit(box);
        return box;
      },
      addText: function (text) {
        const p = document.createElement('div');
        p.textContent = text || '';
        p.className = 'lore-v2-empty';
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
    const content = shell.querySelector('.lore-v2-content');
    const title = shell.querySelector('.lore-v2-title');
    const subtitle = shell.querySelector('.lore-v2-subtitle');
    const root = state.roots.get(page.rootId);
    content.innerHTML = '';
    title.textContent = page.label;
    subtitle.textContent = root && root.desc ? root.desc : '필요한 설정과 작업을 이 화면에서 처리함';
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
      err.className = 'lore-v2-empty';
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

  function findRestoredRoot() {
    const last = loadLastSection();
    const root = last ? state.roots.get(last) : null;
    return firstVisiblePage(root) ? root : firstVisibleRoot();
  }

  function setActive(rootId, pageId) {
    const root = state.roots.get(rootId);
    if (!root) return;
    const page = pageId ? state.pages.get(pageId) : firstVisiblePage(root);
    if (!page) return;
    state.activeRoot = rootId;
    state.activePage = page.id;
    saveLastSection(rootId);
    renderShellNav();
    renderPage(page);
  }

  function makeSectionButton(root, visiblePages) {
    const btn = document.createElement('button');
    btn.className = 'lore-v2-section';
    btn.dataset.active = String(root.id === state.activeRoot);
    btn.innerHTML = `
      <span class="lore-v2-section-title"><span></span><span class="lore-v2-count"></span></span>
      <span class="lore-v2-section-desc"></span>
    `;
    btn.querySelector('.lore-v2-section-title span:first-child').textContent = root.label;
    btn.querySelector('.lore-v2-count').textContent = String(visiblePages.length);
    btn.querySelector('.lore-v2-section-desc').textContent = root.desc;
    btn.onclick = () => setActive(root.id);
    return btn;
  }

  function renderShellNav() {
    const shell = document.getElementById(SHELL_ID);
    if (!shell) return;
    const nav = shell.querySelector('.lore-v2-sections');
    const pages = shell.querySelector('.lore-v2-pages');
    const system = shell.querySelector('.lore-v2-system');
    nav.innerHTML = '';
    pages.innerHTML = '';
    const root = state.roots.get(state.activeRoot);
    const activePage = state.pages.get(state.activePage);
    const activeStillVisible = root && activePage && pageMatches(root, activePage);
    if (!activeStillVisible) {
      const nextRoot = findRestoredRoot();
      if (nextRoot) {
        const nextPage = firstVisiblePage(nextRoot);
        state.activeRoot = nextRoot.id;
        state.activePage = nextPage ? nextPage.id : '';
      }
    }
    let visibleRoots = 0;
    state.rootOrder.forEach((rootId) => {
      const section = state.roots.get(rootId);
      if (!section) return;
      const visiblePages = section.pages.map(id => state.pages.get(id)).filter(page => page && pageMatches(section, page));
      if (!visiblePages.length) return;
      visibleRoots += 1;
      nav.appendChild(makeSectionButton(section, visiblePages));
    });
    const currentRoot = state.roots.get(state.activeRoot);
    if (currentRoot) {
      currentRoot.pages.forEach((pageId) => {
        const page = state.pages.get(pageId);
        if (!page || !pageMatches(currentRoot, page)) return;
        const btn = document.createElement('button');
        btn.className = 'lore-v2-page';
        btn.textContent = page.label;
        btn.dataset.active = String(pageId === state.activePage);
        btn.onclick = () => setActive(currentRoot.id, pageId);
        pages.appendChild(btn);
      });
    }
    if (system) {
      const totalPages = Array.from(state.pages.values()).length;
      system.textContent = '섹션 ' + visibleRoots + '/' + state.rootOrder.length + ', 화면 ' + totalPages + '개';
    }
  }

  function ensureShell() {
    installStyle();
    let shell = document.getElementById(SHELL_ID);
    if (shell) return shell;
    shell = document.createElement('div');
    shell.id = SHELL_ID;
    shell.innerHTML = `
      <div class="lore-v2-backdrop"></div>
      <div class="lore-v2-frame" role="dialog" aria-modal="true" aria-label="Lore Injector 설정">
        <aside class="lore-v2-sidebar">
          <div class="lore-v2-brand">
            <div class="lore-v2-brand-title">Lore Injector</div>
            <div class="lore-v2-brand-sub">상태, 기억, 검색, 삽입, 모델 기준으로 관리함</div>
          </div>
          <input class="lore-v2-search" type="search" placeholder="검색" aria-label="설정 검색">
          <div class="lore-v2-sections" role="tablist" aria-label="설정 섹션"></div>
          <div class="lore-v2-system"></div>
        </aside>
        <main class="lore-v2-main">
          <header class="lore-v2-header">
            <div class="lore-v2-title-wrap">
              <div class="lore-v2-title">설정</div>
              <div class="lore-v2-subtitle">작업 흐름 선택</div>
            </div>
            <button class="lore-v2-close" type="button" title="닫기" aria-label="닫기">X</button>
          </header>
          <nav class="lore-v2-pages" aria-label="현재 섹션 화면"></nav>
          <section class="lore-v2-content"></section>
        </main>
      </div>
    `;
    shell.querySelector('.lore-v2-backdrop').onclick = close;
    shell.querySelector('.lore-v2-close').onclick = close;
    const search = shell.querySelector('.lore-v2-search');
    search.oninput = () => {
      state.query = search.value || '';
      renderShellNav();
      const page = state.pages.get(state.activePage);
      if (page && pageMatches(state.roots.get(page.rootId), page)) renderPage(page);
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
      const root = findRestoredRoot();
      if (root) setActive(root.id);
    } else {
      renderShellNav();
      const page = state.pages.get(state.activePage);
      if (page) renderPage(page);
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
        const root = findRestoredRoot();
        if (root) setActive(root.id);
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
