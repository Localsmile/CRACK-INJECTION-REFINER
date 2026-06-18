// lore settings shell
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const L = _w.__LoreInj = _w.__LoreInj || {};
  if (L.__settingsShellLoaded) return;

  const SHELL_ID = 'lore-settings-shell';
  const STYLE_MARK = 'data-lore-settings-shell-style';
  const LAST_SECTION_KEY = 'lore-ui-last-section';

  function kv() {
    return (L.__LoreEnv && L.__LoreEnv.kv) || _w.localStorage;
  }

  function shellHost() {
    let host = document.getElementById(SHELL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = SHELL_ID;
      (document.body || document.documentElement).appendChild(host);
    }
    return host;
  }

  function shellRoot() {
    const host = shellHost();
    return host.shadowRoot || host.attachShadow({ mode: 'open' });
  }

  function shellNode() {
    const host = document.getElementById(SHELL_ID);
    const root = host && host.shadowRoot;
    return root ? root.querySelector('.lore-v2-app') : null;
  }

  function installStyle(root) {
    if (root.querySelector('style[' + STYLE_MARK + ']')) return;
    const css = `
      .lore-v2-app {
        --li-bg: #18181B;
        --li-surface: #232327;
        --li-surface-2: #2B2B31;
        --li-surface-3: #32323A;
        --li-line: #3F3F46;
        --li-line-strong: #52525B;
        --li-text: #FAFAFA;
        --li-text-soft: #A1A1AA;
        --li-muted: #A1A1AA;
        --li-accent: #818CF8;
        --li-accent-strong: #C7D2FE;
        --li-accent-bg: rgba(129,140,248,.14);
        --li-ok: #16A34A;
        --li-warn: #D97706;
        --li-danger: #DC2626;
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: none;
        color: var(--li-text);
        font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
        font-size: 14px;
        line-height: 1.5;
        letter-spacing: 0;
      }
      .lore-v2-app[data-open="true"] { display: block; }
      .lore-v2-app * { box-sizing: border-box; }
      .lore-v2-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,.58);
      }
      .lore-v2-frame {
        position: absolute;
        top: 50%;
        left: 50%;
        width: min(980px, calc(100vw - 40px));
        height: min(760px, calc(100vh - 56px));
        transform: translate(-50%, -50%);
        display: grid;
        grid-template-columns: 208px minmax(0, 1fr);
        background: var(--li-surface);
        border: 1px solid var(--li-line-strong);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 26px 80px rgba(0,0,0,.48);
      }
      .lore-v2-frame button,
      .lore-v2-frame input,
      .lore-v2-frame textarea,
      .lore-v2-frame select {
        max-width: 100%;
      }
      .lore-v2-sidebar {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr;
        gap: 12px;
        padding: 16px 13px;
        background: var(--li-bg);
        border-right: 1px solid var(--li-line);
      }
      .lore-v2-brand {
        padding: 2px 4px 12px;
        border-bottom: 1px solid var(--li-line);
      }
      .lore-v2-brand-title {
        font-size: 16px;
        line-height: 1.2;
        font-weight: 600;
        color: var(--li-text);
      }
      .lore-v2-search {
        width: 100%;
        height: 34px;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: var(--li-bg);
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
        min-height: 48px;
        padding: 9px 10px;
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
        font-size: 13px;
        font-weight: 600;
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
        font-weight: 600;
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
        font-weight: 600;
      }
      .lore-v2-close:hover {
        border-color: var(--li-accent);
        color: var(--li-text);
      }
      .lore-v2-pages {
        min-height: 48px;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: thin;
        padding: 9px 16px;
        border-bottom: 1px solid var(--li-line);
        background: var(--li-bg);
      }
      .lore-v2-page {
        flex: 0 0 auto;
        min-height: 34px;
        max-width: 240px;
        padding: 8px 12px;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: transparent;
        color: var(--li-text-soft);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
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
        overscroll-behavior: contain;
        padding: 22px 24px 34px;
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
        padding: 16px;
        margin: 0 0 16px;
        box-shadow: 0 1px 0 rgba(255,255,255,.03) inset;
      }
      .lore-v2-content input,
      .lore-v2-content textarea,
      .lore-v2-content select {
        border-color: var(--li-line) !important;
        background: var(--li-bg) !important;
        color: var(--li-text) !important;
        border-radius: 8px !important;
        min-height: 40px !important;
        padding: 9px 11px !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
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
        min-width: 0 !important;
        min-height: 36px !important;
        padding: 8px 13px !important;
        font-size: 12px !important;
        line-height: 1.25 !important;
        font-weight: 600 !important;
        background: var(--li-surface-3) !important;
        border-color: var(--li-line-strong) !important;
        color: var(--li-text) !important;
      }
      .lore-v2-content button:hover {
        border-color: var(--li-accent) !important;
        background: rgba(129,140,248,.16) !important;
      }
      .lore-v2-content textarea {
        min-height: 86px;
      }
      .lore-v2-content > * {
        max-width: 100%;
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
      .lore-v2-content [style*="#78d5a8"],
      .lore-v2-content [style*="rgb(120, 213, 168)"] {
        color: var(--li-accent-strong) !important;
      }
      .lore-v2-content [style*="rgba(120,213,168"],
      .lore-v2-content [style*="rgba(120, 213, 168"] {
        border-color: rgba(129,140,248,.42) !important;
        background-color: rgba(129,140,248,.12) !important;
      }
      .lore-v2-content [style*="#e7b56f"],
      .lore-v2-content [style*="rgb(231, 181, 111)"] {
        color: var(--li-warn) !important;
      }
      .lore-v2-content [style*="#ef6b6b"],
      .lore-v2-content [style*="rgb(239, 107, 107)"] {
        color: var(--li-danger) !important;
      }
      .lore-v2-content label {
        min-width: 0;
      }
      .lore-v2-content [style*="display:flex"],
      .lore-v2-content [style*="display: flex"] {
        min-width: 0;
      }
      .lore-v2-content [style*="font-weight:800"],
      .lore-v2-content [style*="font-weight: 800"],
      .lore-v2-content [style*="font-weight:900"],
      .lore-v2-content [style*="font-weight: 900"] {
        font-weight: 600 !important;
      }
      .lore-v2-content [style*="border-radius:9px"],
      .lore-v2-content [style*="border-radius: 9px"],
      .lore-v2-content [style*="border-radius:10px"],
      .lore-v2-content [style*="border-radius: 10px"] {
        border-radius: 8px !important;
      }
      @media (max-width: 639px) {
        .lore-v2-frame {
          inset: 0;
          top: auto;
          left: auto;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
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
        .lore-v2-brand { display: none; }
        .lore-v2-sections {
          flex-direction: row;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
          padding-bottom: 1px;
        }
        .lore-v2-section {
          width: auto;
          min-width: 124px;
          flex: 0 0 auto;
        }
        .lore-v2-section-desc { display: none; }
        .lore-v2-main { grid-template-rows: auto auto 1fr; }
        .lore-v2-header { min-height: 52px; padding: 9px 12px; }
        .lore-v2-title {
          font-size: 15px;
        }
        .lore-v2-subtitle {
          white-space: normal;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .lore-v2-pages { padding: 8px 10px; }
        .lore-v2-page {
          max-width: 190px;
        }
        .lore-v2-content { padding: 14px 12px calc(24px + env(safe-area-inset-bottom, 0px)); }
        .lore-v2-field { padding: 13px; margin-bottom: 12px; }
      }
      @media (max-height: 560px) and (min-width: 640px) {
        .lore-v2-frame {
          width: min(820px, calc(100vw - 28px));
          height: calc(100vh - 28px);
        }
        .lore-v2-section-desc {
          display: none;
        }
        .lore-v2-section {
          min-height: 34px;
          padding: 6px 8px;
        }
      }
    `;
    const style = document.createElement('style');
    style.setAttribute(STYLE_MARK, '');
    style.textContent = css;
    root.appendChild(style);
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

  function sortRootPages(root) {
    if (!root) return;
    root.pages.sort((a, b) => {
      const pa = state.pages.get(a);
      const pb = state.pages.get(b);
      const ao = pa ? pa.order : 1000;
      const bo = pb ? pb.order : 1000;
      if (ao !== bo) return ao - bo;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function addPage(rootId, label, action, key, order) {
    const root = state.roots.get(rootId) || ensureRoot(rootId, rootId, '', 1000);
    const id = rootId + ':' + (key || label);
    if (!state.pages.has(id)) {
      state.pages.set(id, { id, key: key || label, rootId, label, action, order: order || 1000 });
      root.pages.push(id);
      sortRootPages(root);
    } else {
      const page = state.pages.get(id);
      page.label = label;
      page.action = action;
      page.order = order || page.order || 1000;
      sortRootPages(root);
    }
    return state.pages.get(id);
  }

  function registerPage(spec) {
    if (!spec || !spec.key || typeof spec.render !== 'function') return;
    const root = ensureRoot(spec.rootId || spec.key, spec.rootLabel || spec.rootId || spec.key, spec.rootDesc || '', spec.rootOrder || 1000);
    addPage(root.id, spec.label || spec.key, spec.render, spec.key, spec.order || 1000);
    if (!state.activeRoot) {
      const restored = findRestoredRoot();
      if (restored) {
        const first = firstVisiblePage(restored);
        state.activeRoot = restored.id;
        state.activePage = first ? first.id : '';
      }
    }
    if (shellNode()) {
      renderShellNav();
      const active = state.pages.get(state.activePage);
      if (active) renderPage(active);
    }
  }

  function renderPage(page) {
    const shell = shellNode();
    if (!shell || !page) return;
    const content = shell.querySelector('.lore-v2-content');
    const title = shell.querySelector('.lore-v2-title');
    const subtitle = shell.querySelector('.lore-v2-subtitle');
    const root = state.roots.get(page.rootId);
    content.scrollTop = 0;
    content.innerHTML = '';
    title.textContent = page.label;
    subtitle.textContent = root && root.desc ? root.desc : '필요한 설정과 작업을 이 화면에서 처리함';
    const menuApi = {
      replaceContentPanel: function (renderer, titleOverride) {
        if (titleOverride) title.textContent = titleOverride;
        content.scrollTop = 0;
        content.innerHTML = '';
        const panel = makePanelAdapter(content);
        if (typeof renderer === 'function') renderer(panel);
        requestAnimationFrame(() => { content.scrollTop = 0; });
      },
      openPage
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
    requestAnimationFrame(() => { content.scrollTop = 0; });
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

  function findPageByKey(key) {
    for (const page of state.pages.values()) {
      if (page.key === key) return page;
    }
    return null;
  }

  function openPage(key) {
    const page = findPageByKey(key);
    if (!page) return false;
    setActive(page.rootId, page.id);
    const shell = shellNode();
    if (shell) shell.dataset.open = 'true';
    return true;
  }

  function findRestoredRoot() {
    return firstVisibleRoot();
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
    const shell = shellNode();
    if (!shell) return;
    const nav = shell.querySelector('.lore-v2-sections');
    const pages = shell.querySelector('.lore-v2-pages');
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
  }

  function ensureShell() {
    const root = shellRoot();
    installStyle(root);
    let shell = shellNode();
    if (shell) return shell;
    shell = document.createElement('div');
    shell.className = 'lore-v2-app';
    shell.innerHTML = `
      <div class="lore-v2-backdrop"></div>
      <div class="lore-v2-frame" role="dialog" aria-modal="true" aria-label="로어 인젝터 설정">
        <aside class="lore-v2-sidebar">
          <div class="lore-v2-brand">
            <div class="lore-v2-brand-title">로어 인젝터</div>
          </div>
          <input class="lore-v2-search" type="search" placeholder="검색" aria-label="설정 검색">
          <div class="lore-v2-sections" role="tablist" aria-label="설정 섹션"></div>
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
    root.appendChild(shell);
    return shell;
  }

  function open() {
    const shell = ensureShell();
    const root = firstVisibleRoot();
    if (root) setActive(root.id);
    else renderShellNav();
    shell.dataset.open = 'true';
  }

  function close() {
    const shell = shellNode();
    if (shell) shell.dataset.open = 'false';
  }

  function resetRegistry() {
    state.rootOrder.length = 0;
    state.roots.clear();
    state.pages.clear();
    state.activeRoot = '';
    state.activePage = '';
  }

  L.__LoreSettingsShell = { registerPage, open, close, ensureShell, resetRegistry, openPage };
  L.__settingsShellLoaded = true;
  if (typeof L.setupSettingsPages === 'function') L.setupSettingsPages();
  console.log('[LoreShell] loaded');
})();
