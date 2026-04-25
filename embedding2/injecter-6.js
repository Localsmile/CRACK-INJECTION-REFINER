// == 인젝터 모듈 6/6 — UI shell ==
// 역할: 패널 레지스트리 기반 UI 진입점
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
    console.error('[LoreInj:6] ModalManager not loaded');
    return;
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
      'start',
      'settings',
      'lore',
      'files',
      'extract',
      'refiner',
      'api',
      'help',
      'logs',
      'session',
      'merge',
      'advanced'
    ];
    const panelIds = UI.getPanels().map(p => p.id);
    const missingFlags = requiredFlags.filter(k => !L[k]);
    const missingPanels = requiredPanelIds.filter(id => !panelIds.includes(id));
    return {
      version: L.VER || '?',
      ok: missingFlags.length === 0 && missingPanels.length === 0,
      missingFlags,
      missingPanels,
      panelIds
    };
  }

  function ensureFallbackPanels() {
    if (UI.getPanels().length > 0) return;

    UI.registerPanel({
      id: 'start',
      label: 'Start Here',
      order: 10,
      title: 'Start Here',
      render: function(panel) {
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createSection('Lore Injector UI', 'This is the new modular UI shell. Panel modules have not been loaded yet.'));
          nd.appendChild(UI.createNotice(
            'Next required modules:\n' +
            '- injecter-ui-panels-start.js\n' +
            '- injecter-ui-panels-settings.js\n' +
            '- injecter-ui-panels-lore.js\n' +
            '- injecter-ui-panels-extract.js\n' +
            '- injecter-ui-panels-refiner.js\n' +
            '- injecter-ui-panels-api-help.js\n' +
            '- injecter-ui-panels-logs.js\n' +
            '- injecter-ui-panels-merge.js\n' +
            '- injecter-ui-panels-advanced.js\n' +
            '- injecter-6.js',
            'warn'
          ));
        });
      }
    });

    UI.registerPanel({
      id: 'diagnostics',
      label: 'Diagnostics',
      order: 90,
      title: 'Diagnostics',
      render: function(panel) {
        UI.addBox(panel, function(nd) {
          const required = [
            '__interceptorLoaded',
            '__constLoaded',
            '__settingsLoaded',
            '__extractLoaded',
            '__injectLoaded'
          ];
          const missing = required.filter(k => !L[k]);
          nd.appendChild(UI.createSection('Runtime Diagnostics', 'Use this panel while migrating from the old split UI.'));
          nd.appendChild(UI.createNotice(
            'Loaded version: ' + (L.VER || '?') + '\n' +
            'Missing injector flags: ' + (missing.length ? missing.join(', ') : 'none') + '\n' +
            'Registered UI panels: ' + UI.getPanels().map(p => p.id).join(', '),
            missing.length ? 'warn' : 'info'
          ));
        });
      }
    });
  }

  function setupUI() {
    ensureFallbackPanels();

    const modal = MM.getOrCreateManager('c2');
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu unavailable:', modal);
      return;
    }

    const panels = UI.getPanels();
    const firstPanel = panels[0];
    if (!firstPanel) {
      console.error('[LoreInj:6] no UI panels registered');
      return;
    }

    let chain = modal.createMenu('설정 정보', (m) => {
      UI.openPanel(m, firstPanel.render, firstPanel.title || firstPanel.label, firstPanel.id);
    });

    panels.slice(1).forEach(panel => {
      if (!chain || typeof chain.createSubMenu !== 'function') return;
      chain = chain.createSubMenu(panel.label, (m) => {
        UI.openPanel(m, panel.render, panel.title || panel.label, panel.id);
      });
    });

    installSettingsMenuEntry();
  }

  function installSettingsMenuEntry() {
    const ENTRY_ID = 'chasm-decentral-menu';

    function updateModalMenu() {
      const modal = document.getElementById('web-modal');
      if (!modal || document.getElementById(ENTRY_ID)) return;

      const links = modal.getElementsByTagName('a');
      for (const item of links) {
        if (item.getAttribute('href') === '/setting') {
          const cloned = item.cloneNode(true);
          cloned.id = ENTRY_ID;
          const textElement = cloned.getElementsByTagName('span')[0];
          if (textElement) textElement.innerText = '결정화 캐즘';
          cloned.setAttribute('href', 'javascript:void(0)');
          cloned.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            MM.getOrCreateManager('c2').display(document.body.getAttribute('data-theme') !== 'light');
          };
          item.parentElement && item.parentElement.append(cloned);
          break;
        }
      }
    }

    updateModalMenu();

    if (L.__uiMenuObserver && typeof L.__uiMenuObserver.disconnect === 'function') {
      try { L.__uiMenuObserver.disconnect(); } catch (_) {}
    }
    const observer = new MutationObserver(updateModalMenu);
    observer.observe(document.body, { childList: true, subtree: true });
    L.__uiMenuObserver = observer;
  }

  setupUI();

  Object.assign(L, {
    setupUI,
    getRuntimeSmokeReport,
    __uiLoaded: true
  });

  console.log('[LoreInj:6] modular UI shell loaded');
})();