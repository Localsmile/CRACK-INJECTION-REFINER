// == 인젝터 UI 패널 — Start Here ==
// 역할: 신규 모듈형 UI 첫 화면
// 의존: injecter-ui-utils.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:start] UI utils not loaded');
    return;
  }
  if (UI.__startPanelLoaded) return;

  function getRuntime() {
    return _w.__LoreInj || {};
  }

  UI.registerPanel({
    id: 'start',
    label: 'Start Here',
    title: 'Start Here',
    order: 10,
    render: function(panel) {
      const L = getRuntime();

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          'Lore Injector',
          'This is the active modular UI path. It replaces the old split UI runtime path.'
        ));

        nd.appendChild(UI.createNotice(
          'Current migration state:\n' +
          '- UI shell: ready\n' +
          '- Start panel: ready\n' +
          '- Basic settings panel: ready\n' +
          '- Lore and files panels: ready\n' +
          '- Extraction panel: ready\n' +
          '- Refiner panel: ready\n' +
          '- API and help panels: ready\n' +
          '- Logs and session panels: ready\n' +
          '- Merge panel: ready\n' +
          '- Advanced panel: ready',
          'info'
        ));
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          'Recommended order',
          'Use this order while testing the modular UI.'
        ));

        const list = document.createElement('ol');
        list.style.cssText = 'font-size:12px;color:#ccc;line-height:1.8;margin:0;padding-left:20px;';
        [
          'Confirm the loader can fetch every file from the 260425_test / embedding2 path.',
          'Open Settings and confirm the master toggle, compression, search, and continuity options.',
          'Open Files and verify existing packs and active-pack mappings are still present.',
          'Run manual capture, Refiner manual check, and one non-destructive panel open test.',
          'After one successful smoke test, archive or delete the old split UI reference pages.'
        ].forEach(text => {
          const li = document.createElement('li');
          li.textContent = text;
          list.appendChild(li);
        });
        nd.appendChild(list);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Runtime status'));

        const required = [
          '__interceptorLoaded',
          '__constLoaded',
          '__settingsLoaded',
          '__extractLoaded',
          '__injectLoaded'
        ];
        const missing = required.filter(k => !L[k]);
        const rows = [
          'Injector version: ' + (L.VER || '?'),
          'Missing module flags: ' + (missing.length ? missing.join(', ') : 'none'),
          'Registered UI panels: ' + UI.getPanels().map(p => p.id).join(', ') + '\n' +
          'Loader target: 260425_test / embedding2'
        ];

        nd.appendChild(UI.createNotice(rows.join('\n'), missing.length ? 'warn' : 'info'));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
        btnRow.appendChild(UI.createButton('Reload page', {
          kind: 'primary',
          onClick: function() { location.reload(); }
        }));
        btnRow.appendChild(UI.createButton('Print diagnostics', {
          onClick: function() {
            console.log('[LoreInj:UI] diagnostics', {
              version: L.VER,
              flags: required.reduce((acc, key) => { acc[key] = !!L[key]; return acc; }, {}),
              panels: UI.getPanels().map(p => p.id)
            });
          }
        }));
        nd.appendChild(btnRow);
      });
    }
  });

  UI.__startPanelLoaded = true;
  console.log('[LoreInj:UI] start panel loaded');
})();