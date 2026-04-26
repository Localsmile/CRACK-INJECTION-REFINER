// == 인젝터 UI 패널 — API + Help ==
// 역할: API 설정과 기능 안내
// 의존: injecter-ui-utils.js, core-ui.js, injecter-2.js settings
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:api-help] UI utils not loaded');
    return;
  }
  if (UI.__apiHelpPanelLoaded) return;

  function getRuntime() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  function makeSelect(nd, title, value, groups, onChange) {
    const label = document.createElement('div');
    label.textContent = title;
    label.style.cssText = 'font-size:12px;color:#999;margin:10px 0 4px;';
    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
    groups.forEach(function(group) {
      const og = document.createElement('optgroup');
      og.label = group.label;
      group.options.forEach(function(item) {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.value = value;
    sel.onchange = function(){ onChange(sel.value); };
    nd.appendChild(label);
    nd.appendChild(sel);
    return sel;
  }

  function makeTextArea(nd, title, value, onChange) {
    const label = document.createElement('div');
    label.textContent = title;
    label.style.cssText = 'font-size:12px;color:#999;margin:10px 0 4px;';
    const ta = document.createElement('textarea');
    ta.value = value || '';
    ta.style.cssText = 'width:100%;height:110px;padding:8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;font-family:monospace;resize:vertical;';
    ta.onchange = function(){ onChange(ta.value); };
    nd.appendChild(label);
    nd.appendChild(ta);
    return ta;
  }

  UI.registerPanel({
    id: 'api',
    label: 'API 설정',
    title: 'API 설정',
    order: 70,
    render: function(panel) {
      const L = getRuntime();
      const C = L.C;
      const settings = L.settings;
      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Settings are not loaded yet.', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Gemini / Vertex AI API', 'This key is used for extraction, rerank, conversion, and Refiner.'));
        if (C && typeof C.createApiInput === 'function') {
          C.createApiInput(settings.config, 'autoExt', nd, function(){ save(settings); });
        } else {
          nd.appendChild(UI.createNotice('API input helper is unavailable. Load core-ui.js first.', 'error'));
        }

        const row = document.createElement('div');
        row.style.cssText = 'margin:12px 0 16px;display:flex;gap:8px;align-items:center;';
        const btn = UI.createButton('Test API key', { kind: 'primary' });
        const result = document.createElement('span');
        result.style.cssText = 'font-size:12px;color:#888;word-break:break-all;';
        btn.onclick = async function() {
          if (!C || !C.callGeminiApi) { alert('API caller is unavailable.'); return; }
          const apiType = settings.config.autoExtApiType || 'key';
          const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript : !settings.config.autoExtKey;
          if (missing) { alert(apiType === 'vertex' ? 'Vertex JSON is required.' : apiType === 'firebase' ? 'Firebase config is required.' : 'API key is required.'); return; }
          btn.disabled = true;
          result.textContent = 'Testing';
          result.style.color = '#888';
          try {
            const r = await C.callGeminiApi('Say OK in one word.', {
              apiType: settings.config.autoExtApiType,
              key: settings.config.autoExtKey,
              vertexJson: settings.config.autoExtVertexJson,
              vertexLocation: settings.config.autoExtVertexLocation,
              vertexProjectId: settings.config.autoExtVertexProjectId,
              firebaseScript: settings.config.autoExtFirebaseScript,
              model: settings.config.autoExtModel,
              maxRetries: 0
            });
            result.textContent = r.text ? 'Success: ' + r.text.trim().slice(0, 50) : 'Failed: ' + r.error;
            result.style.color = r.text ? '#4a9' : '#d66';
          } catch(e) {
            result.textContent = 'Error: ' + e.message;
            result.style.color = '#d66';
          }
          btn.disabled = false;
        };
        row.appendChild(btn);
        row.appendChild(result);
        nd.appendChild(row);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Models'));

        makeSelect(nd, 'Default LLM model', settings.config.autoExtModel || 'gemini-3-flash-preview', [
          { label: 'Gemini 3.x', options: [
            { label: '3.0 Flash', value: 'gemini-3-flash-preview' },
            { label: '3.1 Pro', value: 'gemini-3.1-pro-preview' }
          ]},
          { label: 'Gemini 2.x', options: [
            { label: '2.5 Pro', value: 'gemini-2.5-pro' },
            { label: '2.0 Flash', value: 'gemini-2.0-flash' }
          ]},
          { label: 'Other', options: [{ label: 'Custom', value: '_custom' }] }
        ], function(v){ settings.config.autoExtModel = v; save(settings); customModel.style.display = v === '_custom' ? '' : 'none'; });

        const customModel = document.createElement('input');
        customModel.value = settings.config.autoExtCustomModel || '';
        customModel.placeholder = 'Custom model name';
        customModel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-top:6px;' + ((settings.config.autoExtModel || '') === '_custom' ? '' : 'display:none;');
        customModel.onchange = function(){ settings.config.autoExtCustomModel = customModel.value; save(settings); };
        nd.appendChild(customModel);

        makeSelect(nd, 'Reranker model', settings.config.rerankModel || 'gemini-3-flash-preview', [
          { label: 'Gemini', options: [
            { label: '3.1 Flash Lite', value: 'gemini-3.1-flash-lite-preview' },
            { label: '3.0 Flash', value: 'gemini-3-flash-preview' },
            { label: '2.5 Flash Lite', value: 'gemini-2.5-flash-lite' }
          ]}
        ], function(v){ settings.config.rerankModel = v; save(settings); });

        makeSelect(nd, 'Refiner model', settings.config.refinerModel !== undefined ? settings.config.refinerModel : '', [
          { label: 'Default', options: [{ label: 'Use default LLM', value: '' }] },
          { label: 'Gemini 3.x', options: [
            { label: '3.0 Flash', value: 'gemini-3-flash-preview' },
            { label: '3.1 Flash Lite', value: 'gemini-3.1-flash-lite-preview' },
            { label: '3.1 Pro', value: 'gemini-3.1-pro-preview' }
          ]},
          { label: 'Gemini 2.x', options: [
            { label: '2.5 Pro', value: 'gemini-2.5-pro' },
            { label: '2.5 Flash', value: 'gemini-2.5-flash' },
            { label: '2.0 Flash', value: 'gemini-2.0-flash' }
          ]},
          { label: 'Other', options: [{ label: 'Custom', value: '_custom' }] }
        ], function(v){ settings.config.refinerModel = v; save(settings); refinerCustom.style.display = v === '_custom' ? '' : 'none'; });

        const refinerCustom = document.createElement('input');
        refinerCustom.value = settings.config.refinerCustomModel || '';
        refinerCustom.placeholder = 'Custom Refiner model';
        refinerCustom.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-top:6px;' + ((settings.config.refinerModel || '') === '_custom' ? '' : 'display:none;');
        refinerCustom.onchange = function(){ settings.config.refinerCustomModel = refinerCustom.value; save(settings); };
        nd.appendChild(refinerCustom);

        makeTextArea(nd, 'Reranker prompt', settings.config.rerankPrompt || (C && C.DEFAULTS ? C.DEFAULTS.rerankPrompt : ''), function(v){ settings.config.rerankPrompt = v; save(settings); });
      });
    }
  });

  UI.registerPanel({
    id: 'help',
    label: '도움말',
    title: '도움말',
    order: 90,
    render: function(panel) {
      const sections = [
        {
          title: 'First setup',
          body: '1. Open API Settings.\n2. Enter a Gemini API key, Vertex service account JSON, or Firebase config.\n3. Click Test API key.\n4. Open Settings and choose Basic.\n5. Open Files and enable a lore pack for the current chat.\nExample: Use Basic first, then switch to Precise only after normal injection works.'
        },
        {
          title: 'Choose API mode',
          body: 'API Key is the simplest mode. Vertex is useful when you already use Google Cloud. Firebase is useful when your app already has Firebase config.\nExample: For normal personal use, choose API Key and paste the AI Studio key.\nNote: Firebase mode still needs a separate Gemini API key for embeddings.'
        },
        {
          title: 'Import a memory pack',
          body: 'Open Files, type a pack name, then import a JSON file or pasted JSON.\nExample: Pack name "Academy RP", then import academy-lore.json.\nImported packs are enabled for the current page automatically.'
        },
        {
          title: 'Turn on a pack',
          body: 'Open Files and switch a pack to ON for the current chat.\nOpen Lore to check which entries are active.\nExample: Keep only the current story pack ON. Turn old world packs OFF unless they are needed.'
        },
        {
          title: 'Auto capture from conversation',
          body: 'Auto Capture reads recent chat and saves important facts as lore.\nExample: 8 turns for normal use. 5 turns for fast relationship changes. 12 turns for lower API cost.\nUse manual capture after major scenes if automatic capture is off.'
        },
        {
          title: 'Response Refiner',
          body: 'Response Refiner checks the latest AI reply against lore and memory.\nUse it after basic injection works.\nExample: Enable Refiner when the model forgets a promise, death, injury, location, relationship state, or status block.'
        },
        {
          title: 'Honorific correction',
          body: 'Keep honorific sensitivity Low for roleplay.\nThe checker should only flag direct address that contradicts established context.\nExample: Do not flag a temporary switch caused by anger, public formality, disguise, sarcasm, identity reveal, or deliberate relationship distance.'
        },
        {
          title: 'Embedding search',
          body: 'Embedding search finds lore by meaning, not only exact words.\nExample: Lore says "canine companion" and the user says "dog"; semantic search can still find it.\nAfter changing the embedding model, regenerate search data for existing packs.'
        },
        {
          title: 'Reranker',
          body: 'Reranker asks the LLM to sort search results by scene relevance.\nExample: Turn it on when many entries match but the wrong ones are injected.\nCost note: Reranker adds an API call during injection.'
        },
        {
          title: 'Backups and restore',
          body: 'Advanced tools can create snapshots and restore entry versions.\nExample: Before large imports, batch capture, or merge work, create a snapshot.\nIf an extraction overwrites a useful entry, use version history to restore it.'
        },
        {
          title: 'Logs and diagnostics',
          body: 'Open Logs to inspect injection, extraction, Refiner, and contradiction records.\nOpen Session to reset cooldown and turn counters for the current chat.\nExample: If lore stops appearing, check active packs, cooldown entries, and injection logs.'
        },
        {
          title: 'Troubleshooting',
          body: 'No lore appears: check that the script is enabled, a pack is ON, and entries are not individually OFF.\nAPI fails: test the key in API Settings and check the selected model.\nRefiner repeats: clear processed record in Response Refiner.\nSearch feels stale: regenerate embeddings for the pack.'
        },
        {
          title: 'Safe migration rule',
          body: 'The loader targets the modular UI files. Old split UI pages are reference only until one browser smoke test passes.\nDo not delete user data during migration.\nKeep localStorage key lore-injector-v5 and Dexie database lore-injector unchanged.'
        }
      ];

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Feature guide', 'Short practical notes for common setup choices.'));
      });

      sections.forEach(function(section) {
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createSection(section.title));
          nd.appendChild(UI.createNotice(section.body, 'info'));
        });
      });
    }
  });

  UI.__apiHelpPanelLoaded = true;
  console.log('[LoreInj:UI] API and help panels loaded');
})();