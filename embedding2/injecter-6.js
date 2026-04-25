// == 인젝터 모듈 6/6 — UI shell ==
// 역할: 패널 레지스트리 기반 UI shell + ModalManager 메뉴 구성
// 의존: injecter-ui-utils.js, injecter-ui-entrypoints.js, injecter-5.js
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
    const entrypoints = UI.getEntrypointDiagnostics ? UI.getEntrypointDiagnostics() : null;
    return {
      version: L.VER || '?',
      ok: missingFlags.length === 0 && missingPanels.length === 0,
      missingFlags,
      missingPanels,
      panelIds,
      entrypoints
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
          nd.appendChild(UI.createSection('Lore Injector UI', 'This is the modular UI shell. Panel modules have not been loaded yet.'));
          nd.appendChild(UI.createNotice(
            'Required panel modules are missing. Check loader @require order and network fetch results.',
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
          const report = getRuntimeSmokeReport();
          nd.appendChild(UI.createSection('Runtime Diagnostics', 'Fallback diagnostics while migrating from the old split UI.'));
          nd.appendChild(UI.createNotice(JSON.stringify(report, null, 2), report.ok ? 'info' : 'warn'));
        });
      }
    });
  }

  function setupModalMenu() {
    ensureFallbackPanels();

    const modal = MM.getOrCreateManager('c2');
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu unavailable:', modal);
      return false;
    }

    const panels = UI.getPanels();
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

    if (UI.installEntrypoints) {
      UI.installEntrypoints({
        modalManager: MM,
        menuId: 'c2'
      });
    } else {
      console.warn('[LoreInj:6] entrypoints module not loaded; console open function only');
      L.openLoreInjectorUI = function() {
        const mgr = MM.getOrCreateManager('c2');
        if (mgr && typeof mgr.display === 'function') {
          mgr.display(document.body.getAttribute('data-theme') !== 'light');
          return true;
        }
        return false;
      };
    }

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
