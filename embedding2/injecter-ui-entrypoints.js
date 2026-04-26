// == 인젝터 UI 진입점 ==
// 역할: wrtn 설정 메뉴에 로어 설정 항목 삽입, 콘솔 진입 함수 유지, 진입점 진단 기록
// 의존: injecter-ui-utils.js, injecter-6.js에서 installEntrypoints 호출
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:entrypoints] UI utils not loaded');
    return;
  }
  if (UI.__entrypointsLoaded) return;

  const ENTRY_ID = 'lore-injector-settings-menu-entry';
  const ENTRY_ATTR = 'data-lore-injector-entry';
  const DIAG_KEY = '__uiEntrypointDiagnostics';

  function now() {
    return new Date().toISOString();
  }

  function getRuntime() {
    _w.__LoreInj = _w.__LoreInj || {};
    return _w.__LoreInj;
  }

  function getDiag() {
    const L = getRuntime();
    if (!L[DIAG_KEY]) {
      L[DIAG_KEY] = {
        installed: false,
        attempts: 0,
        openAttempts: 0,
        lastAttemptAt: '',
        lastInstalledAt: '',
        lastOpenAt: '',
        lastError: '',
        lastRoot: '',
        lastAnchorText: '',
        observerActive: false
      };
    }
    return L[DIAG_KEY];
  }

  function setDiag(patch) {
    Object.assign(getDiag(), patch || {});
  }

  function textOf(node) {
    return String((node && node.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function isSettingsHref(href) {
    if (!href) return false;
    try {
      const u = new URL(href, location.href);
      return u.pathname === '/setting' || u.pathname === '/settings';
    } catch (_) {
      return href === '/setting' || href === '/settings';
    }
  }

  function isSettingsLike(node) {
    if (!node || node.nodeType !== 1) return false;
    const href = node.getAttribute && node.getAttribute('href');
    if (isSettingsHref(href)) return true;
    const label = textOf(node);
    return label === '설정' || label === 'Settings' || label === '환경설정';
  }

  function isEntryAlreadyIn(root) {
    return !!(root && root.querySelector && root.querySelector('#' + cssEscape(ENTRY_ID) + ',[' + ENTRY_ATTR + '="true"]'));
  }

  function getCandidateRoots() {
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
    const roots = [];
    selectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        if (!roots.includes(el)) roots.push(el);
      });
    });
    return roots.filter(function(root) {
      if (!root || !root.isConnected) return false;
      const rect = root.getBoundingClientRect ? root.getBoundingClientRect() : null;
      if (rect && rect.width === 0 && rect.height === 0) return false;
      return true;
    });
  }

  function findSettingsItem(root) {
    if (!root || !root.querySelectorAll) return null;
    const items = Array.from(root.querySelectorAll('a[href],button,[role="menuitem"],[role="option"],li,div'));
    for (const item of items) {
      if (item.id === ENTRY_ID || item.getAttribute(ENTRY_ATTR) === 'true') continue;
      if (isSettingsLike(item)) return item;
      const link = item.querySelector && item.querySelector('a[href]');
      if (link && isSettingsHref(link.getAttribute('href'))) return item;
    }
    return null;
  }

  function findTextLeaf(root) {
    if (!root) return null;
    const candidates = Array.from(root.querySelectorAll ? root.querySelectorAll('span,p,div,strong') : []);
    const exact = candidates.find(function(el) {
      const t = textOf(el);
      return t === '설정' || t === 'Settings' || t === '환경설정';
    });
    if (exact) return exact;
    const nonEmpty = candidates.filter(function(el) {
      return textOf(el) && !el.querySelector('span,p,div,strong');
    });
    return nonEmpty[0] || root;
  }

  function makeEntryFrom(item, openFn) {
    const cloned = item.cloneNode(true);
    cloned.id = ENTRY_ID;
    cloned.setAttribute(ENTRY_ATTR, 'true');
    cloned.removeAttribute('href');
    cloned.removeAttribute('target');
    cloned.removeAttribute('aria-current');
    cloned.setAttribute('role', cloned.getAttribute('role') || 'menuitem');
    cloned.setAttribute('tabindex', '0');
    cloned.style.cursor = 'pointer';

    const leaf = findTextLeaf(cloned);
    if (leaf) leaf.textContent = '로어 설정';
    else cloned.textContent = '로어 설정';

    function activate(event) {
      event.preventDefault();
      event.stopPropagation();
      openFn();
    }

    cloned.addEventListener('click', activate, true);
    cloned.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    }, true);

    return cloned;
  }

  function installIntoOpenMenu(openFn) {
    const diag = getDiag();
    setDiag({ attempts: diag.attempts + 1, lastAttemptAt: now(), lastError: '' });

    const roots = getCandidateRoots();
    for (const root of roots) {
      if (isEntryAlreadyIn(root)) {
        setDiag({ installed: true, lastRoot: root.id ? '#' + root.id : root.getAttribute('role') || root.tagName });
        return true;
      }

      const item = findSettingsItem(root);
      if (!item || !item.parentElement) continue;

      try {
        const entry = makeEntryFrom(item, openFn);
        item.parentElement.appendChild(entry);
        setDiag({
          installed: true,
          lastInstalledAt: now(),
          lastRoot: root.id ? '#' + root.id : root.getAttribute('role') || root.tagName,
          lastAnchorText: textOf(item)
        });
        return true;
      } catch (err) {
        setDiag({ lastError: err && err.message ? err.message : String(err) });
      }
    }

    setDiag({ installed: false });
    return false;
  }

  function scanSoon(openFn) {
    const delays = [0, 80, 200, 500, 1000];
    delays.forEach(function(ms) {
      setTimeout(function() { installIntoOpenMenu(openFn); }, ms);
    });
  }

  function createOpenFunction(modalManager, menuId) {
    return function openLoreInjectorUI() {
      const diag = getDiag();
      setDiag({ openAttempts: diag.openAttempts + 1, lastOpenAt: now(), lastError: '' });

      try {
        const MM = modalManager || UI.getModalManager();
        const mgr = MM && MM.getOrCreateManager ? MM.getOrCreateManager(menuId || 'c2') : null;
        if (!mgr) throw new Error('Modal manager unavailable');
        if (typeof mgr.display !== 'function') throw new Error('modal.display unavailable');

        mgr.display(document.body.getAttribute('data-theme') !== 'light');
        return true;
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error('[LoreInj:UI:entrypoints] open failed:', err);
        setDiag({ lastError: msg });
        return false;
      }
    };
  }

  function installEntrypoints(opts) {
    opts = opts || {};
    const L = getRuntime();
    const openFn = createOpenFunction(opts.modalManager, opts.menuId || 'c2');

    L.openLoreInjectorUI = openFn;
    L.refreshLoreInjectorMenuEntry = function() {
      return installIntoOpenMenu(openFn);
    };

    scanSoon(openFn);

    if (L.__uiMenuObserver && typeof L.__uiMenuObserver.disconnect === 'function') {
      try { L.__uiMenuObserver.disconnect(); } catch (_) {}
    }

    const observer = new MutationObserver(function() {
      scanSoon(openFn);
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    L.__uiMenuObserver = observer;
    setDiag({ observerActive: true });

    if (!L.__uiEntrypointClickHooked) {
      document.addEventListener('click', function() { scanSoon(openFn); }, true);
      document.addEventListener('pointerdown', function() { scanSoon(openFn); }, true);
      L.__uiEntrypointClickHooked = true;
    }

    return openFn;
  }

  Object.assign(UI, {
    installEntrypoints,
    getEntrypointDiagnostics: getDiag,
    __entrypointsLoaded: true
  });

  console.log('[LoreInj:UI] entrypoints loaded');
})();