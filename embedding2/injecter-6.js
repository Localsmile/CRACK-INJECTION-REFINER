// == 인젝터 모듈 6/6 — UI shell ==
// 역할: 패널 레지스트리 기반 UI shell + ModalManager 메뉴 구성 + 설정 메뉴 진입점
// 의존: injecter-ui-utils.js, injecter-5.js
(async function(){
  'use strict';

  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  }

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:6] UI utils not loaded');
    return;
  }

  try {
    await UI.waitFor(() => _w.__LoreInj && _w.__LoreInj.__injectLoaded, 15000, 50);
  } catch (_) {
    console.error('[LoreInj:6] inject module not loaded');
    return;
  }

  const L = _w.__LoreInj;
  if (L.__uiLoaded) return;

  const MM = UI.getModalManager();
  if (!MM) {
    console.warn('[LoreInj:6] external ModalManager not loaded; using standalone UI shell');
  }

  const ENTRY_ID = 'lore-injector-settings-menu-entry';
  const ENTRY_ATTR = 'data-lore-injector-entry';
  const DIAG_KEY = '__uiEntrypointDiagnostics';

  function getEntrypointDiagnostics() {
    if (!L[DIAG_KEY]) {
      L[DIAG_KEY] = {
        installed: false,
        attempts: 0,
        lastScanAt: 0,
        lastReason: '',
        lastCandidateCount: 0,
        lastSettingsCount: 0,
        inserted: false,
        insertCount: 0,
        lastError: ''
      };
    }
    return L[DIAG_KEY];
  }

  function openLoreInjectorUI() {
    try {
      if (!MM || typeof MM.getOrCreateManager !== 'function') return openStandaloneLoreInjectorUI();
      const mgr = MM.getOrCreateManager('c2');
      if (mgr && typeof mgr.display === 'function') {
        mgr.display(document.body.getAttribute('data-theme') !== 'light');
        return true;
      }
      if (mgr && typeof mgr.open === 'function') {
        mgr.open();
        return true;
      }
      if (mgr && typeof mgr.show === 'function') {
        mgr.show();
        return true;
      }
    } catch (err) {
      getEntrypointDiagnostics().lastError = err && err.message ? err.message : String(err);
    }
    return openStandaloneLoreInjectorUI();
  }

  function ensureStandaloneShellStyle() {
    if (document.getElementById('lore-standalone-shell-style')) return;
    const style = document.createElement('style');
    style.id = 'lore-standalone-shell-style';
    style.textContent = [
      '.lore-standalone-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.56);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;}',
      '.lore-standalone-shell{width:min(1120px,100%);height:min(840px,92vh);display:grid;grid-template-columns:220px minmax(0,1fr);background:var(--lore-panel,#151816);color:var(--lore-text,#e7eee9);border:1px solid var(--lore-line,#303832);border-radius:14px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.48);}',
      '.lore-standalone-menu{background:var(--lore-surface-soft,#111412);border-right:1px solid var(--lore-line-soft,#252b27);padding:14px;display:flex;flex-direction:column;gap:7px;overflow:auto;}',
      '.lore-standalone-menu-title{font-size:15px;font-weight:900;color:var(--lore-accent,#7fd7bd);padding:4px 4px 10px;}',
      '.lore-standalone-tab{width:100%;min-height:36px;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--lore-sub,#9aa6a0);text-align:left;padding:8px 10px;font-size:13px;font-weight:750;cursor:pointer;}',
      '.lore-standalone-tab:hover{border-color:var(--lore-line,#303832);background:var(--lore-surface,#191d1a);color:var(--lore-text,#e7eee9);}',
      '.lore-standalone-tab.is-active{border-color:var(--lore-accent,#7fd7bd);background:var(--lore-accent-soft,#203a32);color:var(--lore-text,#e7eee9);}',
      '.lore-standalone-main{min-width:0;display:flex;flex-direction:column;min-height:0;}',
      '.lore-standalone-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--lore-line-soft,#252b27);}',
      '.lore-standalone-title{font-size:16px;font-weight:900;line-height:1.35;}',
      '.lore-standalone-content{padding:14px 16px;overflow:auto;min-height:0;}',
      '@media (max-width:720px){.lore-standalone-overlay{padding:8px;align-items:stretch}.lore-standalone-shell{height:calc(100vh - 16px);grid-template-columns:1fr}.lore-standalone-menu{border-right:none;border-bottom:1px solid var(--lore-line-soft,#252b27);max-height:170px}.lore-standalone-main{min-height:0}}'
    ].join('');
    document.head.appendChild(style);
  }

  function openStandaloneLoreInjectorUI(preselectedId) {
    ensureStandaloneShellStyle();
    const existing = document.getElementById('lore-standalone-shell-root');
    if (existing) existing.remove();

    const panels = UI.getPanels().filter(panel => panel && panel.id !== 'help' && panel.hidden !== true);
    const firstPanel = panels.find(p => p.id === preselectedId) || panels[0];
    if (!firstPanel) {
      console.error('[LoreInj:6] no UI panels registered');
      return false;
    }

    const overlay = document.createElement('div');
    overlay.id = 'lore-standalone-shell-root';
    overlay.className = 'lore-standalone-overlay';
    const shell = document.createElement('div');
    shell.className = 'lore-standalone-shell';
    const menu = document.createElement('div');
    menu.className = 'lore-standalone-menu';
    const main = document.createElement('div');
    main.className = 'lore-standalone-main';
    const head = document.createElement('div');
    head.className = 'lore-standalone-head';
    const title = document.createElement('div');
    title.className = 'lore-standalone-title';
    const closeBtn = UI.createButton ? UI.createButton('닫기', { compact: true }) : document.createElement('button');
    closeBtn.textContent = closeBtn.textContent || '닫기';
    const content = document.createElement('div');
    content.className = 'lore-standalone-content';

    function closeShell() {
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onKey(ev) {
      if (ev.key === 'Escape') closeShell();
    }
    closeBtn.onclick = closeShell;
    overlay.addEventListener('click', function(ev) {
      if (ev.target === overlay) closeShell();
    });
    document.addEventListener('keydown', onKey, true);

    const menuTitle = document.createElement('div');
    menuTitle.className = 'lore-standalone-menu-title';
    menuTitle.textContent = '로어 설정';
    menu.appendChild(menuTitle);

    function renderPanel(panelDef) {
      content.innerHTML = '';
      title.textContent = panelDef.title || panelDef.label || '로어 설정';
      Array.from(menu.querySelectorAll('.lore-standalone-tab')).forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute('data-panel-id') === panelDef.id);
      });
      try {
        const result = panelDef.render(content);
        if (result && typeof result.then === 'function') {
          result.catch(err => UI.reportPanelError(content, panelDef.id || panelDef.label || 'panel', err));
        }
      } catch (err) {
        UI.reportPanelError(content, panelDef.id || panelDef.label || 'panel', err);
      }
    }

    panels.forEach(function(panelDef) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'lore-standalone-tab';
      tab.setAttribute('data-panel-id', panelDef.id);
      tab.textContent = panelDef.label || panelDef.title || panelDef.id;
      tab.onclick = function() { renderPanel(panelDef); };
      menu.appendChild(tab);
    });

    head.appendChild(title);
    head.appendChild(closeBtn);
    main.appendChild(head);
    main.appendChild(content);
    shell.appendChild(menu);
    shell.appendChild(main);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);
    renderPanel(firstPanel);
    return true;
  }

  function isSettingsLike(el) {
    if (!el || el.nodeType !== 1) return false;
    const text = (el.textContent || '').trim();
    const href = (el.getAttribute && (el.getAttribute('href') || '')) || '';
    const tag = (el.tagName || '').toLowerCase();
    const role = (el.getAttribute && (el.getAttribute('role') || '')) || '';
    const clickable = tag === 'a' || tag === 'button' || role === 'menuitem' || role === 'button';
    if (!clickable) return false;
    return /\/settings?(?:[/?#]|$)/i.test(href)
      || /^(설정|Settings|환경설정)$/i.test(text);
  }

  function getMenuCandidates() {
    const selectors = [
      '#web-modal',
      '[role="menu"]',
      '[role="dialog"]',
      '[data-radix-popper-content-wrapper]',
      '[data-radix-menu-content]',
      '[data-headlessui-state]',
      '.chakra-menu__menu-list',
      '.ant-dropdown',
      '.ant-popover',
      '.MuiPopover-root'
    ];
    const out = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!out.includes(el)) out.push(el);
      });
    });
    return out;
  }

  function makeEntryFrom(src) {
    const entry = src.cloneNode(true);
    entry.id = ENTRY_ID;
    entry.setAttribute(ENTRY_ATTR, 'true');
    entry.removeAttribute('href');
    entry.removeAttribute('target');
    entry.removeAttribute('rel');
    entry.style.display = '';
    entry.style.visibility = '';
    entry.style.pointerEvents = 'auto';
    entry.style.cursor = 'pointer';

    const labelNode = Array.from(entry.querySelectorAll('span, div, p, a, button')).find(n => {
      const t = (n.textContent || '').trim();
      return t === '설정' || /^Settings$/i.test(t) || t === '환경설정';
    });
    if (labelNode) labelNode.textContent = '로어 설정';
    else entry.textContent = '로어 설정';

    const handler = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setTimeout(openLoreInjectorUI, 0);
    };
    entry.addEventListener('click', handler, true);
    entry.addEventListener('pointerdown', ev => ev.stopPropagation(), true);
    entry.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') handler(ev);
    }, true);
    return entry;
  }

  function removeBrokenEntry() {
    const ex = document.getElementById(ENTRY_ID);
    if (!ex) return;
    const parent = ex.parentElement;
    const looksLikeMenuItem = parent && (
      ex.tagName === 'A'
      || ex.tagName === 'BUTTON'
      || ex.getAttribute('role') === 'menuitem'
      || parent.querySelector('a, button, [role="menuitem"]')
    );
    if (!looksLikeMenuItem || ex.textContent.length > 80) ex.remove();
  }

  function insertLegacyWebModalEntry() {
    const modal = document.getElementById('web-modal');
    if (!modal) return false;
    if (document.getElementById(ENTRY_ID)) return true;

    const anchors = Array.from(modal.getElementsByTagName('a'));
    const src = anchors.find(a => {
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').trim();
      return href === '/setting' || href === '/settings' || /^설정$|^Settings$/i.test(text);
    });
    if (!src || !src.parentElement) return false;

    const cloned = src.cloneNode(true);
    cloned.id = ENTRY_ID;
    cloned.setAttribute(ENTRY_ATTR, 'true');
    cloned.setAttribute('href', 'javascript: void(0)');
    cloned.removeAttribute('target');
    cloned.removeAttribute('rel');

    const span = cloned.getElementsByTagName('span')[0];
    if (span) span.innerText = '로어 설정';
    else cloned.textContent = '로어 설정';

    cloned.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openLoreInjectorUI();
    };

    src.parentElement.append(cloned);
    return true;
  }

  async function injectTopMenuButton() {
    if (document.getElementById('lore-injector-top-menu-entry')) return true;
    try {
      const isChatRoute = /\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname)
        || /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname)
        || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname);
      if (!isChatRoute) return false;

      const legacyPanels = document.getElementsByClassName(/\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) ? 'css-1c5w7et' : 'css-l8r172');
      let top = null;
      if (legacyPanels && legacyPanels.length > 0) {
        const topContainer = legacyPanels[0].childNodes[legacyPanels.length - 1]?.getElementsByTagName('div');
        if (topContainer && topContainer.length > 0) {
          const topList = topContainer[0].children[0]?.children;
          if (topList && topList.length) top = topList[topList.length - 1];
        }
      }

      if (!top) {
        const candidates = Array.from(document.querySelectorAll('header, nav, main [class*="chat"], main'));
        top = candidates.find(el => el && el.getBoundingClientRect && el.getBoundingClientRect().width > 200);
      }
      if (!top) return false;

      const btn = document.createElement('button');
      btn.id = 'lore-injector-top-menu-entry';
      btn.type = 'button';
      btn.textContent = '로어 설정';
      btn.style.cssText = 'margin-right:10px;padding:6px 10px;border-radius:8px;border:1px solid #285;background:#1a1a1a;color:#9fd;font-size:12px;font-weight:bold;cursor:pointer;white-space:nowrap;';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openLoreInjectorUI();
      }, true);

      if (top.childNodes && top.childNodes.length) top.insertBefore(btn, top.childNodes[0]);
      else top.appendChild(btn);
      return true;
    } catch (err) {
      getEntrypointDiagnostics().lastError = err && err.message ? err.message : String(err);
      return false;
    }
  }

  function scanAndInsertMenuEntry(reason) {
    const diag = getEntrypointDiagnostics();
    diag.attempts += 1;
    diag.lastScanAt = Date.now();
    diag.lastReason = reason || 'manual';
    diag.lastError = '';

    try {
      removeBrokenEntry();
      if (insertLegacyWebModalEntry()) {
        diag.inserted = true;
        diag.insertCount += 1;
        return true;
      }
      if (document.getElementById(ENTRY_ID)) {
        diag.inserted = true;
        return true;
      }

      const candidates = getMenuCandidates();
      diag.lastCandidateCount = candidates.length;

      let settingsItems = [];
      candidates.forEach(root => {
        const nodes = Array.from(root.querySelectorAll('a, button, [role="menuitem"], [role="button"]'));
        nodes.forEach(node => {
          if (node.id === ENTRY_ID || node.getAttribute?.(ENTRY_ATTR) === 'true') return;
          if (isSettingsLike(node) && !settingsItems.includes(node)) settingsItems.push(node);
        });
      });
      diag.lastSettingsCount = settingsItems.length;

      const src = settingsItems.find(el => el.parentElement);
      if (!src || !src.parentElement) return false;

      const entry = makeEntryFrom(src);
      src.parentElement.insertBefore(entry, src.nextSibling);
      diag.inserted = true;
      diag.insertCount += 1;
      return true;
    } catch (err) {
      diag.lastError = err && err.message ? err.message : String(err);
      return false;
    }
  }

  function installModalCloseAffordance() {
    if (document.getElementById('lore-injector-modal-affordance-style')) return;

    const style = document.createElement('style');
    style.id = 'lore-injector-modal-affordance-style';
    style.textContent = [
      '#web-modal button[aria-label*="close" i],',
      '#web-modal button[aria-label*="닫"],',
      '#web-modal [role="button"][aria-label*="close" i],',
      '#web-modal [role="button"][aria-label*="닫"]{',
      '  cursor:pointer!important;',
      '  transition:background-color .12s ease, opacity .12s ease, transform .08s ease!important;',
      '}',
      '#web-modal button[aria-label*="close" i]:hover,',
      '#web-modal button[aria-label*="닫"]:hover,',
      '#web-modal [role="button"][aria-label*="close" i]:hover,',
      '#web-modal [role="button"][aria-label*="닫"]:hover{',
      '  opacity:.9!important;',
      '  background:rgba(255,255,255,.08)!important;',
      '}',
      '#web-modal button[aria-label*="close" i]:active,',
      '#web-modal button[aria-label*="닫"]:active,',
      '#web-modal [role="button"][aria-label*="close" i]:active,',
      '#web-modal [role="button"][aria-label*="닫"]:active{',
      '  transform:scale(.94)!important;',
      '}',
      '.lore-modal-close-affordance{',
      '  cursor:pointer!important;',
      '  transition:background-color .12s ease, opacity .12s ease, transform .08s ease!important;',
      '}',
      '.lore-modal-close-affordance:hover{',
      '  opacity:.9!important;',
      '  background:rgba(255,255,255,.08)!important;',
      '}',
      '.lore-modal-close-affordance:active{',
      '  transform:scale(.94)!important;',
      '}'
    ].join('');
    document.head.appendChild(style);

    const markCloseButtons = () => {
      const root = document.getElementById('web-modal') || document.body;
      const nodes = Array.from(root.querySelectorAll('button, [role="button"]'));
      nodes.forEach(node => {
        const label = (node.getAttribute('aria-label') || node.getAttribute('title') || '').trim();
        const text = (node.textContent || '').trim();
        const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        const looksClose = /close|닫기|닫음/i.test(label)
          || text === '×'
          || text === '✕'
          || text === 'X'
          || (text.length <= 2 && /[×✕x]/i.test(text) && rect && rect.width <= 64 && rect.height <= 64);
        if (!looksClose) return;
        node.classList.add('lore-modal-close-affordance');
        if (!node.getAttribute('title')) node.setAttribute('title', '닫기');
        node.style.cursor = 'pointer';
      });
    };

    markCloseButtons();
    document.addEventListener('pointerover', markCloseButtons, true);
    try {
      const mo = new MutationObserver(markCloseButtons);
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function installSettingsMenuEntry() {
    const diag = getEntrypointDiagnostics();
    if (diag.installed) return;
    diag.installed = true;

    L.openLoreInjectorUI = openLoreInjectorUI;
    L.refreshLoreInjectorMenuEntry = function() {
      return scanAndInsertMenuEntry('manual');
    };
    UI.getEntrypointDiagnostics = getEntrypointDiagnostics;
    UI.__entrypointsLoaded = true;

    const delayed = [0, 80, 200, 500, 1000, 1500];
    const schedule = (reason) => delayed.forEach(ms => setTimeout(() => scanAndInsertMenuEntry(reason), ms));
    const scheduleTop = () => delayed.forEach(ms => setTimeout(() => injectTopMenuButton(), ms));

    schedule('install');
    scheduleTop();
    document.addEventListener('click', () => { schedule('document-click'); scheduleTop(); }, true);
    document.addEventListener('pointerdown', () => { schedule('document-pointerdown'); scheduleTop(); }, true);
    window.addEventListener('popstate', () => { schedule('route-popstate'); scheduleTop(); });
    window.addEventListener('hashchange', () => { schedule('route-hashchange'); scheduleTop(); });

    try {
      const mo = new MutationObserver(() => { scanAndInsertMenuEntry('mutation'); injectTopMenuButton(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      diag.observer = true;
    } catch (err) {
      diag.lastError = err && err.message ? err.message : String(err);
    }
  }

  function getRuntimeSmokeReport() {
    const requiredFlags = [
      '__interceptorLoaded',
      '__constLoaded',
      '__settingsLoaded',
      '__extractLoaded',
      '__injectLoaded',
      '__uiLoaded'
    ];
    const requiredPanelIds = [
      'dashboard',
      'api',
      'settings',
      'loreManager',
      'extract',
      'refiner',
      'logs',
      'advanced'
    ];
    const panelIds = UI.getPanels().map(p => p.id);
    const missingFlags = requiredFlags.filter(k => !L[k]);
    const requiredUiFlags = ['__utilsLoaded', '__entrypointsLoaded'];
    const missingUiFlags = requiredUiFlags.filter(k => !UI[k]);
    const missingPanels = requiredPanelIds.filter(id => !panelIds.includes(id));
    const entrypoints = UI.getEntrypointDiagnostics ? UI.getEntrypointDiagnostics() : null;
    return {
      version: L.VER || '?',
      ok: missingFlags.length === 0 && missingUiFlags.length === 0 && missingPanels.length === 0,
      missingFlags,
      missingUiFlags,
      missingPanels,
      panelIds,
      entrypoints
    };
  }

  function ensureFallbackPanels() {
    if (UI.getPanels().length > 0) return;

    UI.registerPanel({
      id: 'dashboard',
      label: '대시보드',
      order: 10,
      title: '대시보드',
      render: function(panel) {
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createSection('로어 인젝터', '패널 모듈을 아직 불러오지 못했음'));
          nd.appendChild(UI.createNotice(
            '필수 패널 모듈 누락. 로더 순서와 업로드 상태 확인 필요.',
            'warn'
          ));
        });
      }
    });

    UI.registerPanel({
      id: 'diagnostics',
      label: '진단',
      order: 90,
      title: '진단',
      render: function(panel) {
        UI.addBox(panel, function(nd) {
          const report = getRuntimeSmokeReport();
          nd.appendChild(UI.createSection('런타임 진단', '패널 로드 실패 시 확인용'));
          nd.appendChild(UI.createNotice(JSON.stringify(report, null, 2), report.ok ? 'info' : 'warn'));
        });
      }
    });
  }

  function setupModalMenu() {
    ensureFallbackPanels();

    if (!MM || typeof MM.getOrCreateManager !== 'function') {
      return true;
    }

    const modal = MM.getOrCreateManager('c2');
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu unavailable:', modal);
      return false;
    }

    const panels = UI.getPanels().filter(panel => panel && panel.id !== 'help' && panel.hidden !== true);
    const firstPanel = panels[0];
    if (!firstPanel) {
      console.error('[LoreInj:6] no UI panels registered');
      return false;
    }

    let chain = modal.createMenu('로어 설정', (m) => {
      UI.openPanel(m, firstPanel.render, firstPanel.title || firstPanel.label, firstPanel.id);
    });

    panels.slice(1).forEach(panel => {
      if (!chain || typeof chain.createSubMenu !== 'function') return;
      chain = chain.createSubMenu(panel.label, (m) => {
        UI.openPanel(m, panel.render, panel.title || panel.label, panel.id);
      });
    });

    return true;
  }

  function setupUI() {
    const ok = setupModalMenu();
    installSettingsMenuEntry();
    installModalCloseAffordance();

    return ok;
  }

  setupUI();

  Object.assign(L, {
    setupUI,
    getRuntimeSmokeReport,
    openLoreInjectorUI: L.openLoreInjectorUI,
    __uiLoaded: true
  });

  console.log('[LoreInj:6] modular UI shell loaded');
})();