// == 인젝터 UI 패널 — Extraction ==
// 역할: 자동/수동/일괄 대화 정리 설정
// 의존: injecter-ui-utils.js, injecter-4.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:extract] UI utils not loaded');
    return;
  }
  if (UI.__extractPanelLoaded) return;

  function L() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  function toggle(nd, title, desc, value, onChange) {
    const C = UI.getCore();
    if (C && C.createToggleRow) {
      nd.appendChild(C.createToggleRow(title, desc, value, onChange));
      return;
    }
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;cursor:pointer;';
    const text = document.createElement('div'); text.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc; d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!value; cb.style.cssText = 'accent-color:#4a9;';
    cb.onchange = function(){ onChange(cb.checked); };
    text.appendChild(t); text.appendChild(d); row.appendChild(text); row.appendChild(cb); nd.appendChild(row);
  }

  function numberInput(nd, label, key, defaultVal, min, max, settings) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;';
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;';
    const input = document.createElement('input');
    input.type = 'number';
    input.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:90px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
    input.onchange = function() {
      const v = parseInt(input.value, 10);
      if (!isNaN(v)) { settings.config[key] = v; save(settings); }
    };
    row.appendChild(l);
    row.appendChild(input);
    nd.appendChild(row);
  }

  UI.registerPanel({
    id: 'extract',
    label: 'Auto Capture',
    title: 'Auto Capture',
    order: 50,
    render: function(panel) {
      const R = L();
      const C = R.C;
      const settings = R.settings;
      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Settings are not loaded yet.', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Capture settings', 'Automatically turn recent chat into lore entries.'));

        toggle(nd, 'Automatic capture', 'Read the conversation every few turns and save useful facts.', !!settings.config.autoExtEnabled, function(v){
          settings.config.autoExtEnabled = v;
          save(settings);
        });
        toggle(nd, 'Compare existing lore', 'Send current lore with the prompt to reduce duplicates.', settings.config.autoExtIncludeDb !== false, function(v){
          settings.config.autoExtIncludeDb = v;
          save(settings);
        });
        toggle(nd, 'Include persona name', 'Send the user persona name so extracted entries use the right character name.', settings.config.autoExtIncludePersona !== false, function(v){
          settings.config.autoExtIncludePersona = v;
          save(settings);
        });
        toggle(nd, 'Auto-generate search data', 'Create embeddings after capture if API settings are available.', settings.config.autoEmbedOnExtract !== false, function(v){
          settings.config.autoEmbedOnExtract = v;
          save(settings);
        });

        numberInput(nd, 'Capture every N turns', 'autoExtTurns', 8, 1, 50, settings);
        numberInput(nd, 'Read recent turns', 'autoExtScanRange', 6, 1, 50, settings);
        numberInput(nd, 'Offset latest turns', 'autoExtOffset', 3, 0, 30, settings);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Target pack', 'Captured lore is saved into this pack for the current page.'));

        const packInput = document.createElement('input');
        packInput.placeholder = 'Captured lore';
        packInput.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
        nd.appendChild(packInput);

        if (R.getAutoExtPackForUrl && C && C.getCurUrl) {
          R.getAutoExtPackForUrl(C.getCurUrl()).then(function(name){ packInput.value = name; });
        } else {
          packInput.value = settings.config.autoExtPack || 'Captured lore';
        }

        packInput.onchange = function() {
          const value = packInput.value.trim() || 'Captured lore';
          settings.config.autoExtPack = value;
          if (R.setAutoExtPackForUrl && C && C.getCurUrl) R.setAutoExtPackForUrl(C.getCurUrl(), value);
          save(settings);
        };
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Manual capture', 'Run capture once using the current settings.'));

        const btn = UI.createButton('Run manual capture', { kind: 'success', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runAutoExtract) { alert('Capture module is not loaded.'); return; }
          if (!confirm('Run manual capture now?')) return;
          btn.disabled = true;
          const orig = btn.textContent;
          const start = Date.now();
          btn.textContent = 'Running';
          status.textContent = 'Analyzing conversation';
          status.style.color = '#4a9';
          try {
            await R.runAutoExtract(true);
            status.textContent = 'Done (' + Math.floor((Date.now() - start) / 1000) + 's)';
            status.style.color = '#4a9';
          } catch(e) {
            status.textContent = 'Failed: ' + String(e.message || e).slice(0, 100);
            status.style.color = '#d66';
          } finally {
            btn.textContent = orig;
            btn.disabled = false;
          }
        };
        nd.appendChild(btn);
        nd.appendChild(status);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Batch capture', 'Process a long existing chat in batches. This can use many API calls.'));

        numberInput(nd, 'Turns per batch', 'batchExtTurnsPerBatch', 50, 10, 200, settings);
        numberInput(nd, 'Overlap turns', 'batchExtOverlap', 5, 0, 50, settings);
        numberInput(nd, 'Retries per batch', 'batchExtMaxAttempts', 3, 1, 10, settings);

        const btn = UI.createButton('Run batch capture', { kind: 'primary', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runBatchExtract) { alert('Batch capture module is not loaded.'); return; }
          if (!confirm('Run batch capture? This can use many API calls.')) return;
          btn.disabled = true;
          const orig = btn.textContent;
          const started = Date.now();
          btn.textContent = 'Running';
          status.textContent = 'Loading chat logs';
          status.style.color = '#4a9';
          try {
            const report = await R.runBatchExtract({
              turnsPerBatch: settings.config.batchExtTurnsPerBatch || 50,
              overlap: settings.config.batchExtOverlap !== undefined ? settings.config.batchExtOverlap : 5,
              maxAttempts: settings.config.batchExtMaxAttempts || 3,
              onProgress: function(ev) {
                if (ev.phase === 'batch') {
                  status.textContent = 'Batch ' + ev.index + '/' + ev.total + ' (' + Math.floor((Date.now() - started) / 1000) + 's)';
                }
              }
            });
            status.textContent = 'Done: ' + report.totalBatches + ' batches, ok ' + report.ok + ', empty ' + report.empty + ', failed ' + report.failed + ', merged ' + report.entriesAdded + '.';
            status.style.color = report.failed ? '#da8' : '#4a9';
          } catch(e) {
            status.textContent = 'Failed: ' + String(e.message || e).slice(0, 100);
            status.style.color = '#d66';
          } finally {
            btn.textContent = orig;
            btn.disabled = false;
          }
        };
        nd.appendChild(btn);
        nd.appendChild(status);
      });
    }
  });

  UI.__extractPanelLoaded = true;
  console.log('[LoreInj:UI] extraction panel loaded');
})();