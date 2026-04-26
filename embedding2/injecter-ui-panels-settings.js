// == 인젝터 UI 패널 — Settings ==
// 역할: 기본 설정과 빠른 프리셋
// 의존: injecter-ui-utils.js, injecter-2.js settings
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:settings] UI utils not loaded');
    return;
  }
  if (UI.__settingsPanelLoaded) return;

  function getRuntime() {
    return _w.__LoreInj || {};
  }

  function saveSettings(settings) {
    if (settings && typeof settings.save === 'function') settings.save();
  }

  function makeToggle(nd, title, desc, value, onChange) {
    const C = UI.getCore();
    if (C && typeof C.createToggleRow === 'function') {
      nd.appendChild(C.createToggleRow(title, desc, value, onChange));
      return;
    }

    const row = document.createElement('label');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;cursor:pointer;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div');
    d.textContent = desc || '';
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    left.appendChild(t);
    left.appendChild(d);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    cb.style.cssText = 'accent-color:#4a9;';
    cb.onchange = function() { onChange(cb.checked); };

    row.appendChild(left);
    row.appendChild(cb);
    nd.appendChild(row);
  }

  function makeSelectRow(nd, title, desc, value, options, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;margin-bottom:8px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div');
    d.textContent = desc || '';
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    left.appendChild(t);
    left.appendChild(d);

    const sel = document.createElement('select');
    sel.style.cssText = 'width:180px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
    options.forEach(function(opt) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = function() { onChange(sel.value); };

    row.appendChild(left);
    row.appendChild(sel);
    nd.appendChild(row);
  }

  function makeNumberRow(nd, title, desc, value, min, max, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;margin-bottom:8px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div');
    d.textContent = desc || '';
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    left.appendChild(t);
    left.appendChild(d);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:90px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
    input.onchange = function() {
      const n = parseInt(input.value, 10);
      if (!isNaN(n)) onChange(n);
    };

    row.appendChild(left);
    row.appendChild(input);
    nd.appendChild(row);
  }

  function applyPreset(settings, defaultSettings, preset) {
    settings.config = JSON.parse(JSON.stringify(defaultSettings || {}));
    Object.assign(settings.config, preset.config);
    saveSettings(settings);
  }

  UI.registerPanel({
    id: 'settings',
    label: '설정',
    title: '설정',
    order: 20,
    render: function(panel) {
      const L = getRuntime();
      const settings = L.settings;
      const defaultSettings = L.defaultSettings || {};

      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createNotice('Settings are not loaded yet. Reload the page after all injector modules are available.', 'error'));
        });
        return;
      }

      const PRESETS = {
        beginner: {
          name: 'Basic',
          desc: 'Balanced setup for normal RP. Auto extraction stays on, rerank stays off.',
          config: {
            enabled: true,
            embeddingEnabled: true,
            embeddingWeight: 0.35,
            autoExtEnabled: true,
            autoExtTurns: 8,
            autoExtIncludeDb: true,
            autoExtIncludePersona: true,
            autoEmbedOnExtract: true,
            scanOffset: 3,
            maxEntries: 4,
            cooldownTurns: 8,
            loreBudgetChars: 300,
            loreBudgetMax: 500,
            decayEnabled: true,
            activeCharDetection: true,
            activeCharBoostEnabled: true,
            honorificMatrixEnabled: true,
            firstEncounterWarning: true,
            importanceGating: true,
            importanceThreshold: 12,
            pendingPromiseBoost: true,
            rerankEnabled: false,
            useCompressedFormat: false,
            compressionMode: 'full',
            strictMatch: true,
            similarityMatch: true
          }
        },
        minimal: {
          name: 'Light',
          desc: 'Lower API usage. Manual extraction preferred.',
          config: {
            enabled: true,
            embeddingEnabled: true,
            embeddingWeight: 0.35,
            autoExtEnabled: false,
            autoEmbedOnExtract: true,
            scanOffset: 2,
            maxEntries: 3,
            cooldownTurns: 6,
            loreBudgetChars: 250,
            loreBudgetMax: 400,
            decayEnabled: true,
            activeCharDetection: true,
            activeCharBoostEnabled: true,
            honorificMatrixEnabled: true,
            firstEncounterWarning: false,
            importanceGating: true,
            importanceThreshold: 12,
            rerankEnabled: false,
            useCompressedFormat: false,
            compressionMode: 'full',
            strictMatch: true,
            similarityMatch: true
          }
        },
        advanced: {
          name: 'Precise',
          desc: 'More API usage. Enables rerank and Refiner.',
          config: {
            enabled: true,
            embeddingEnabled: true,
            embeddingWeight: 0.4,
            autoExtEnabled: true,
            autoExtTurns: 5,
            autoExtIncludeDb: true,
            autoExtIncludePersona: true,
            autoEmbedOnExtract: true,
            scanOffset: 3,
            maxEntries: 5,
            cooldownTurns: 8,
            loreBudgetChars: 400,
            loreBudgetMax: 700,
            decayEnabled: true,
            activeCharDetection: true,
            activeCharBoostEnabled: true,
            honorificMatrixEnabled: true,
            firstEncounterWarning: true,
            importanceGating: true,
            importanceThreshold: 10,
            pendingPromiseBoost: true,
            rerankEnabled: true,
            refinerEnabled: true,
            refinerLoreMode: 'semantic',
            useCompressedFormat: false,
            compressionMode: 'full',
            strictMatch: true,
            similarityMatch: true
          }
        }
      };

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('빠른 설정', '현재 옵션을 기본값으로 정리한 뒤 선택한 프리셋을 적용합니다. 저장된 로어 데이터는 삭제되지 않습니다.'));

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        Object.keys(PRESETS).forEach(function(key) {
          const preset = PRESETS[key];
          const btn = document.createElement('button');
          btn.style.cssText = 'padding:10px 14px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid #333;background:#1a1a1a;color:#ccc;display:flex;flex-direction:column;gap:4px;text-align:left;flex:1;min-width:120px;';
          const name = document.createElement('div');
          name.textContent = preset.name;
          name.style.cssText = 'font-weight:bold;color:#4a9;font-size:13px;';
          const desc = document.createElement('div');
          desc.textContent = preset.desc;
          desc.style.cssText = 'font-size:10px;color:#888;line-height:1.4;';
          btn.appendChild(name);
          btn.appendChild(desc);
          btn.onclick = function() {
            if (!confirm('Apply preset: ' + preset.name + '?')) return;
            applyPreset(settings, defaultSettings, preset);
            alert('Preset applied. Reload the page for all runtime modules to read the new values.');
          };
          row.appendChild(btn);
        });
        nd.appendChild(row);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('기본 동작'));

        makeToggle(nd, 'Lore injection', 'Insert relevant lore into the prompt while chatting.', settings.config.enabled !== false, function(v) {
          settings.config.enabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, 'Automatic compression', 'When input space is tight, shorten lore text automatically.', settings.config.useCompressedFormat !== false, function(v) {
          settings.config.useCompressedFormat = v;
          saveSettings(settings);
        });

        makeSelectRow(nd, 'Compression mode', 'Auto chooses the shortest needed level. Full is easiest to read.', settings.config.compressionMode || 'auto', [
          { value: 'auto', label: 'Auto' },
          { value: 'full', label: 'Full' },
          { value: 'compact', label: 'Compact' },
          { value: 'micro', label: 'Micro' }
        ], function(v) {
          settings.config.compressionMode = v;
          saveSettings(settings);
        });

        makeSelectRow(nd, 'Insert position', 'Choose where lore is inserted relative to the user message.', settings.config.position || 'after', [
          { value: 'before', label: 'Before message' },
          { value: 'after', label: 'After message' }
        ], function(v) {
          settings.config.position = v;
          saveSettings(settings);
        });
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('검색과 연속성'));

        makeToggle(nd, 'Semantic search', 'Find lore by meaning, not only exact keywords.', !!settings.config.embeddingEnabled, function(v) {
          settings.config.embeddingEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, 'Auto-generate search data', 'Create embedding data after extraction when possible.', settings.config.autoEmbedOnExtract !== false, function(v) {
          settings.config.autoEmbedOnExtract = v;
          saveSettings(settings);
        });

        makeToggle(nd, 'Rerank candidates', 'Use the LLM to pick the most relevant search results.', !!settings.config.rerankEnabled, function(v) {
          settings.config.rerankEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, 'Time decay', 'Bring back old but relevant lore after it has not appeared for a while.', settings.config.decayEnabled !== false, function(v) {
          settings.config.decayEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, 'Honorific matrix', 'Include short relationship address terms in the prompt.', settings.config.honorificMatrixEnabled !== false, function(v) {
          settings.config.honorificMatrixEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, 'Continuity hints', 'Track first encounters, reunions, and relationship continuity.', settings.config.firstEncounterWarning !== false, function(v) {
          settings.config.firstEncounterWarning = v;
          saveSettings(settings);
        });

        makeNumberRow(nd, 'Max lore entries', 'Maximum number of lore entries inserted per message.', settings.config.maxEntries || 4, 1, 12, function(v) {
          settings.config.maxEntries = v;
          saveSettings(settings);
        });

        makeNumberRow(nd, 'Cooldown turns', 'Prevent the same lore entry from repeating too often.', settings.config.cooldownTurns || 8, 0, 50, function(v) {
          settings.config.cooldownTurns = v;
          saveSettings(settings);
        });
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('메뉴 구성', '자주 쓰는 기능은 앞쪽에, 위험하거나 관리용 기능은 뒤쪽에 배치했습니다.'));
        nd.appendChild(UI.createNotice(
          'Available dedicated panels:\n' +
          '- API settings\n' +
          '- Extraction settings\n' +
          '- Lore management\n' +
          '- Files\n' +
          '- Refiner settings\n' +
          '- Logs\n' +
          '- Session\n' +
          '- Merge\n' +
          '- Advanced tools\n' +
          '- Help',
          'info'
        ));
      });
    }
  });

  UI.__settingsPanelLoaded = true;
  console.log('[LoreInj:UI] settings panel loaded');
})();