// == 인젝터 UI 패널 — Advanced Tools ==
// 역할: 스냅샷, 엔트리 편집, 버전 복원, 임베딩, 변환, 추출 템플릿
// 의존: injecter-ui-utils.js, injecter-2.js, injecter-3.js, core-importer.js, core-embedding.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:advanced] UI utils not loaded');
    return;
  }
  if (UI.__advancedPanelLoaded) return;

  function runtime() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }
  function nowName() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function cssInput(extra) {
    return 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;' + (extra || '');
  }
  function smallButton(label, kind) {
    return UI.createButton(label, { compact: true, kind: kind || '', bold: kind === 'primary' || kind === 'danger' });
  }
  function cleanEntryForEdit(e) {
    const c = Object.assign({}, e || {});
    delete c.id;
    delete c.packName;
    delete c.project;
    delete c.enabled;
    return c;
  }
  function apiOpts(settings, embedding) {
    const cfg = settings.config;
    return {
      apiType: cfg.autoExtApiType || 'key',
      key: cfg.autoExtKey,
      vertexJson: cfg.autoExtVertexJson,
      vertexLocation: cfg.autoExtVertexLocation || 'global',
      vertexProjectId: cfg.autoExtVertexProjectId,
      firebaseScript: cfg.autoExtFirebaseScript,
      firebaseEmbedKey: cfg.autoExtFirebaseEmbedKey,
      model: embedding ? (cfg.embeddingModel || 'gemini-embedding-001') : (cfg.autoExtModel === '_custom' ? cfg.autoExtCustomModel : cfg.autoExtModel)
    };
  }
  function hasApi(settings, embedding) {
    const cfg = settings.config;
    const type = cfg.autoExtApiType || 'key';
    if (embedding && type === 'firebase') return !!cfg.autoExtFirebaseEmbedKey;
    if (type === 'vertex') return !!cfg.autoExtVertexJson;
    if (type === 'firebase') return !!cfg.autoExtFirebaseScript;
    return !!cfg.autoExtKey;
  }

  async function renderSnapshotTools(nd, R) {
    const db = R.db;
    const settings = R.settings;
    const createSnapshot = R.createSnapshot;
    const restoreSnapshot = R.restoreSnapshot;

    nd.appendChild(UI.createSection('Snapshots', 'Create or restore pack-level backups.'));

    if (!db || !db.snapshots || !createSnapshot || !restoreSnapshot) {
      nd.appendChild(UI.createNotice('Snapshot helpers are not loaded.', 'error'));
      return;
    }

    const packs = await db.packs.toArray();
    const row = document.createElement('div');
    row.className = 'lore-row';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;';
    const packSel = document.createElement('select');
    packSel.style.cssText = cssInput('flex:1;');
    packs.forEach(function(pack) {
      const opt = document.createElement('option');
      opt.value = pack.name;
      opt.textContent = pack.name + ' (' + (pack.entryCount || 0) + ')';
      packSel.appendChild(opt);
    });
    const createBtn = smallButton('Create snapshot', 'primary');
    createBtn.onclick = async function() {
      if (!packSel.value) { alert('No pack selected.'); return; }
      const label = prompt('Snapshot label', 'Manual backup ' + nowName());
      if (label === null) return;
      createBtn.disabled = true;
      try {
        await createSnapshot(packSel.value, label || 'Manual backup', 'manual');
        alert('Snapshot created.');
        location.reload();
      } catch(e) {
        alert('Snapshot failed: ' + e.message);
      } finally {
        createBtn.disabled = false;
      }
    };
    row.appendChild(packSel);
    row.appendChild(createBtn);
    nd.appendChild(row);

    const snaps = await db.snapshots.orderBy('timestamp').reverse().toArray();
    if (!snaps.length) {
      nd.appendChild(UI.createNotice('No snapshots yet.', 'info'));
      return;
    }

    const list = document.createElement('div');
    list.className = 'lore-scroll-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto;';
    snaps.slice(0, 30).forEach(function(snap) {
      const item = document.createElement('div');
      item.className = 'lore-card lore-row';
      item.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:center;border:1px solid #333;border-radius:6px;background:#111;padding:8px;';
      const info = document.createElement('div');
      info.style.cssText = 'font-size:12px;color:#ccc;line-height:1.5;word-break:break-all;flex:1;';
      info.textContent = snap.packName + ' / ' + (snap.label || 'snapshot') + ' / ' + new Date(snap.timestamp).toLocaleString();
      const restore = smallButton('Restore', 'danger');
      restore.onclick = async function() {
        if (!confirm('Restore snapshot for pack: ' + snap.packName + '? Current pack entries will be replaced.')) return;
        restore.disabled = true;
        try {
          await restoreSnapshot(snap.id);
          alert('Snapshot restored.');
          location.reload();
        } catch(e) {
          alert('Restore failed: ' + e.message);
        } finally {
          restore.disabled = false;
        }
      };
      item.appendChild(info);
      item.appendChild(restore);
      list.appendChild(item);
    });
    nd.appendChild(list);
  }

  async function renderEntryTools(nd, R) {
    const db = R.db;
    const settings = R.settings;
    const C = R.C || UI.getCore();

    nd.appendChild(UI.createSection('Entry editor', 'Edit one entry, lock it as an anchor, restore versions, or regenerate search data.'));

    if (!db || !settings || !settings.config) {
      nd.appendChild(UI.createNotice('Database or settings are not loaded.', 'error'));
      return;
    }

    const packs = await db.packs.toArray();
    const packSel = document.createElement('select');
    packSel.style.cssText = cssInput('margin-bottom:8px;');
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All packs';
    packSel.appendChild(allOpt);
    packs.forEach(function(pack) {
      const opt = document.createElement('option');
      opt.value = pack.name;
      opt.textContent = pack.name + ' (' + (pack.entryCount || 0) + ')';
      packSel.appendChild(opt);
    });

    const entrySel = document.createElement('select');
    entrySel.style.cssText = cssInput('margin-bottom:8px;');

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;color:#888;line-height:1.5;margin-bottom:8px;min-height:16px;';

    const ta = document.createElement('textarea');
    ta.style.cssText = cssInput('height:240px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const historyBox = document.createElement('div');
    historyBox.style.cssText = 'display:none;margin-top:8px;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:6px;';

    let currentEntries = [];
    let currentEntry = null;

    async function loadEntries() {
      entrySel.innerHTML = '';
      const packName = packSel.value;
      currentEntries = packName ? await db.entries.where('packName').equals(packName).toArray() : await db.entries.toArray();
      currentEntries.sort(function(a, b) {
        return String(a.packName || '').localeCompare(String(b.packName || '')) || String(a.name || '').localeCompare(String(b.name || ''));
      });
      currentEntries.forEach(function(e) {
        const opt = document.createElement('option');
        opt.value = String(e.id);
        opt.textContent = '[' + (e.type || 'entity') + '] ' + e.name + ' / ' + e.packName + (e.anchor ? ' / anchored' : '');
        entrySel.appendChild(opt);
      });
      selectEntry();
    }

    function selectEntry() {
      currentEntry = currentEntries.find(e => String(e.id) === String(entrySel.value)) || currentEntries[0] || null;
      if (!currentEntry) {
        meta.textContent = 'No entries.';
        ta.value = '';
        historyBox.style.display = 'none';
        historyBox.innerHTML = '';
        return;
      }
      entrySel.value = String(currentEntry.id);
      meta.textContent = 'ID: ' + currentEntry.id + ' / Pack: ' + currentEntry.packName + ' / Anchor: ' + (currentEntry.anchor ? 'on' : 'off');
      ta.value = JSON.stringify(cleanEntryForEdit(currentEntry), null, 2);
      historyBox.style.display = 'none';
      historyBox.innerHTML = '';
    }

    packSel.onchange = loadEntries;
    entrySel.onchange = selectEntry;

    nd.appendChild(packSel);
    nd.appendChild(entrySel);
    nd.appendChild(meta);
    nd.appendChild(ta);

    const actions = document.createElement('div');
    actions.className = 'lore-actions';
    actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const saveBtn = smallButton('Save JSON', 'primary');
    saveBtn.onclick = async function() {
      if (!currentEntry) return;
      try {
        const parsed = JSON.parse(ta.value);
        if (!parsed.name) throw new Error('name is required.');
        const updated = Object.assign({}, currentEntry, parsed, {
          id: currentEntry.id,
          packName: currentEntry.packName,
          project: currentEntry.project || '',
          enabled: currentEntry.enabled !== false,
          lastUpdated: Date.now()
        });
        if (C && C.saveEntryVersion) {
          try { await C.saveEntryVersion(currentEntry, 'manual_edit'); } catch(_){}
        }
        await db.entries.put(updated);
        currentEntry = updated;
        const idx = currentEntries.findIndex(e => e.id === updated.id);
        if (idx >= 0) currentEntries[idx] = updated;
        meta.textContent = 'Saved. ID: ' + updated.id + ' / Pack: ' + updated.packName + ' / Anchor: ' + (updated.anchor ? 'on' : 'off');
        alert('Saved.');
      } catch(e) {
        alert('Save failed: ' + e.message);
      }
    };

    const anchorBtn = smallButton('Toggle anchor');
    anchorBtn.onclick = async function() {
      if (!currentEntry) return;
      currentEntry.anchor = !currentEntry.anchor;
      await db.entries.put(currentEntry);
      meta.textContent = 'ID: ' + currentEntry.id + ' / Pack: ' + currentEntry.packName + ' / Anchor: ' + (currentEntry.anchor ? 'on' : 'off');
      ta.value = JSON.stringify(cleanEntryForEdit(currentEntry), null, 2);
      alert(currentEntry.anchor ? 'Anchor enabled.' : 'Anchor disabled.');
    };

    const embedBtn = smallButton('Generate embedding', 'success');
    embedBtn.onclick = async function() {
      if (!currentEntry) return;
      if (!C || !C.ensureEmbedding) { alert('Embedding helper is not loaded.'); return; }
      if (!hasApi(settings, true)) { alert('Embedding API setting is missing.'); return; }
      embedBtn.disabled = true;
      const orig = embedBtn.textContent;
      embedBtn.textContent = 'Generating';
      try {
        await C.ensureEmbedding(currentEntry, apiOpts(settings, true));
        alert('Embedding generated.');
      } catch(e) {
        alert('Embedding failed: ' + e.message);
      } finally {
        embedBtn.textContent = orig;
        embedBtn.disabled = false;
      }
    };

    const historyBtn = smallButton('Version history');
    historyBtn.onclick = async function() {
      if (!currentEntry) return;
      if (!C || !C.getEntryVersions || !C.restoreEntryVersion) {
        historyBox.style.display = 'block';
        historyBox.innerHTML = '<div style="font-size:11px;color:#d66;">Version history helper is not loaded.</div>';
        return;
      }
      if (historyBox.style.display !== 'none') {
        historyBox.style.display = 'none';
        return;
      }
      historyBox.style.display = 'block';
      historyBox.innerHTML = '<div style="font-size:11px;color:#888;">Loading versions.</div>';
      try {
        const versions = await C.getEntryVersions(currentEntry.id);
        historyBox.innerHTML = '';
        if (!versions || !versions.length) {
          historyBox.appendChild(UI.createNotice('No saved versions. Versions are created before future edits or extraction merges.', 'info'));
          return;
        }
        versions.forEach(function(v) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:flex-start;border-bottom:1px dashed #222;padding:6px 0;';
          const info = document.createElement('div');
          info.style.cssText = 'font-size:11px;color:#aaa;line-height:1.5;word-break:break-all;flex:1;';
          const snap = v.snapshot || {};
          info.textContent = new Date(v.ts).toLocaleString() + ' / ' + (v.reason || 'auto') + ' / ' + String(snap.summary || snap.name || '').slice(0, 100);
          const restore = smallButton('Restore', 'danger');
          restore.onclick = async function() {
            if (!confirm('Restore this entry version? Current state will be backed up if supported.')) return;
            try {
              const restored = await C.restoreEntryVersion(v.id);
              currentEntry = restored;
              const idx = currentEntries.findIndex(e => e.id === restored.id);
              if (idx >= 0) currentEntries[idx] = restored;
              ta.value = JSON.stringify(cleanEntryForEdit(restored), null, 2);
              meta.textContent = 'Restored. ID: ' + restored.id + ' / Pack: ' + restored.packName + ' / Anchor: ' + (restored.anchor ? 'on' : 'off');
              alert('Restored.');
            } catch(e) {
              alert('Restore failed: ' + e.message);
            }
          };
          row.appendChild(info);
          row.appendChild(restore);
          historyBox.appendChild(row);
        });
      } catch(e) {
        historyBox.innerHTML = '<div style="font-size:11px;color:#d66;">Error: ' + e.message + '</div>';
      }
    };

    actions.appendChild(saveBtn);
    actions.appendChild(anchorBtn);
    actions.appendChild(embedBtn);
    actions.appendChild(historyBtn);
    nd.appendChild(actions);
    nd.appendChild(historyBox);

    await loadEntries();
  }

  async function renderConversionTools(nd, R) {
    const C = R.C || UI.getCore();
    const settings = R.settings;
    const setPackEnabled = R.setPackEnabled;

    nd.appendChild(UI.createSection('URL and text conversion', 'Convert external settings into a lore pack.'));

    if (!C || !C.importFromUrl || !C.importFromText || !settings || !settings.config) {
      nd.appendChild(UI.createNotice('Importer helpers are not loaded.', 'error'));
      return;
    }

    const pack = document.createElement('input');
    pack.placeholder = 'Pack name';
    pack.style.cssText = cssInput('margin-bottom:8px;');
    nd.appendChild(pack);

    const url = document.createElement('input');
    url.placeholder = 'URL';
    url.style.cssText = cssInput('margin-bottom:8px;');
    nd.appendChild(url);

    const urlBtn = UI.createButton('Convert URL', { kind: 'primary', bold: true });
    const urlStatus = document.createElement('div');
    urlStatus.style.cssText = 'font-size:11px;color:#888;margin:6px 0 14px;min-height:16px;line-height:1.5;';
    urlBtn.onclick = async function() {
      const packName = pack.value.trim();
      if (!url.value.trim() || !packName) { alert('URL and pack name are required.'); return; }
      if (!hasApi(settings, false)) { alert('LLM API setting is missing.'); return; }
      urlBtn.disabled = true;
      urlStatus.textContent = 'Converting URL';
      urlStatus.style.color = '#4a9';
      try {
        const count = await C.importFromUrl(url.value.trim(), packName, apiOpts(settings, false));
        if (count > 0 && setPackEnabled) await setPackEnabled(packName, true);
        urlStatus.textContent = 'Created ' + count + ' entries.';
        urlStatus.style.color = count ? '#4a9' : '#da8';
      } catch(e) {
        urlStatus.textContent = 'Failed: ' + e.message;
        urlStatus.style.color = '#d66';
      } finally {
        urlBtn.disabled = false;
      }
    };
    nd.appendChild(urlBtn);
    nd.appendChild(urlStatus);

    const text = document.createElement('textarea');
    text.placeholder = 'Paste source text, character sheet, world setting, or scene notes.';
    text.style.cssText = cssInput('height:150px;font-family:monospace;resize:vertical;margin-bottom:8px;');
    nd.appendChild(text);

    const textBtn = UI.createButton('Convert text', { kind: 'success', bold: true });
    const textStatus = document.createElement('div');
    textStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;min-height:16px;line-height:1.5;';
    textBtn.onclick = async function() {
      const packName = pack.value.trim();
      if (!text.value.trim() || !packName) { alert('Text and pack name are required.'); return; }
      if (!hasApi(settings, false)) { alert('LLM API setting is missing.'); return; }
      textBtn.disabled = true;
      textStatus.textContent = 'Converting text';
      textStatus.style.color = '#4a9';
      try {
        const count = await C.importFromText(text.value.trim(), packName, apiOpts(settings, false));
        if (count > 0 && setPackEnabled) await setPackEnabled(packName, true);
        textStatus.textContent = 'Created ' + count + ' entries.';
        textStatus.style.color = count ? '#4a9' : '#da8';
      } catch(e) {
        textStatus.textContent = 'Failed: ' + e.message;
        textStatus.style.color = '#d66';
      } finally {
        textBtn.disabled = false;
      }
    };
    nd.appendChild(textBtn);
    nd.appendChild(textStatus);
  }

  function renderTemplateTools(nd, R) {
    const settings = R.settings;

    nd.appendChild(UI.createSection('Extraction templates', 'Create and edit prompts used by automatic capture.'));

    if (!settings || !settings.config || !settings.getActiveTemplate) {
      nd.appendChild(UI.createNotice('Template settings are not loaded.', 'error'));
      return;
    }

    if (!Array.isArray(settings.config.templates)) settings.config.templates = [];

    const top = document.createElement('div');
    top.className = 'lore-actions';
    top.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
    const select = document.createElement('select');
    select.style.cssText = cssInput('flex:1;');
    const newBtn = smallButton('New template', 'primary');
    const renameBtn = smallButton('Rename');
    const delBtn = smallButton('Delete', 'danger');
    top.appendChild(select);
    top.appendChild(newBtn);
    top.appendChild(renameBtn);
    top.appendChild(delBtn);
    nd.appendChild(top);

    const schemaLabel = document.createElement('div');
    schemaLabel.textContent = 'Schema JSON';
    schemaLabel.style.cssText = 'font-size:12px;color:#999;margin:8px 0 4px;';
    const schema = document.createElement('textarea');
    schema.style.cssText = cssInput('height:130px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const noDbLabel = document.createElement('div');
    noDbLabel.textContent = 'Prompt without existing database';
    noDbLabel.style.cssText = 'font-size:12px;color:#999;margin:8px 0 4px;';
    const noDb = document.createElement('textarea');
    noDb.style.cssText = cssInput('height:150px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const withDbLabel = document.createElement('div');
    withDbLabel.textContent = 'Prompt with existing database';
    withDbLabel.style.cssText = 'font-size:12px;color:#999;margin:8px 0 4px;';
    const withDb = document.createElement('textarea');
    withDb.style.cssText = cssInput('height:150px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const saveBtn = UI.createButton('Save template changes', { kind: 'success', bold: true });
    const resetBtn = UI.createButton('Reset custom template from default', { kind: '', bold: false });

    nd.appendChild(schemaLabel);
    nd.appendChild(schema);
    nd.appendChild(noDbLabel);
    nd.appendChild(noDb);
    nd.appendChild(withDbLabel);
    nd.appendChild(withDb);

    const btnRow = document.createElement('div');
    btnRow.className = 'lore-actions';
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(resetBtn);
    nd.appendChild(btnRow);

    function activeTemplate() {
      return settings.getActiveTemplate() || settings.config.templates[0];
    }

    function renderOptions() {
      select.innerHTML = '';
      settings.config.templates.forEach(function(t) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name + (t.isDefault ? ' (default)' : '');
        select.appendChild(opt);
      });
      select.value = settings.config.activeTemplateId || 'default';
      renderFields();
    }

    function renderFields() {
      const t = activeTemplate();
      if (!t) return;
      schema.value = t.schema || '';
      noDb.value = t.promptWithoutDb || '';
      withDb.value = t.promptWithDb || '';
      const readOnly = !!t.isDefault;
      schema.disabled = readOnly;
      noDb.disabled = readOnly;
      withDb.disabled = readOnly;
      renameBtn.style.display = readOnly ? 'none' : '';
      delBtn.style.display = readOnly ? 'none' : '';
      resetBtn.style.display = readOnly ? 'none' : '';
      const opacity = readOnly ? '0.6' : '1';
      schema.style.opacity = opacity;
      noDb.style.opacity = opacity;
      withDb.style.opacity = opacity;
    }

    select.onchange = function() {
      settings.config.activeTemplateId = select.value;
      save(settings);
      renderFields();
    };

    newBtn.onclick = function() {
      const name = prompt('Template name');
      if (!name) return;
      const base = activeTemplate();
      const id = 'tpl_' + Date.now();
      settings.config.templates.push({
        id,
        name: name.trim(),
        isDefault: false,
        schema: base ? base.schema : '',
        promptWithoutDb: base ? base.promptWithoutDb : '',
        promptWithDb: base ? base.promptWithDb : ''
      });
      settings.config.activeTemplateId = id;
      save(settings);
      renderOptions();
    };

    renameBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) return;
      const name = prompt('Template name', t.name);
      if (!name) return;
      t.name = name.trim();
      save(settings);
      renderOptions();
    };

    delBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) return;
      if (!confirm('Delete template: ' + t.name + '?')) return;
      settings.config.templates = settings.config.templates.filter(x => x.id !== t.id);
      settings.config.activeTemplateId = 'default';
      save(settings);
      renderOptions();
    };

    saveBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) { alert('Default template is read-only.'); return; }
      try {
        JSON.parse(schema.value);
      } catch(e) {
        if (!confirm('Schema is not valid JSON. Save anyway?')) return;
      }
      t.schema = schema.value;
      t.promptWithoutDb = noDb.value;
      t.promptWithDb = withDb.value;
      save(settings);
      alert('Template saved.');
    };

    resetBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) return;
      const def = settings.config.templates.find(x => x.isDefault || x.id === 'default');
      if (!def) { alert('Default template not found.'); return; }
      if (!confirm('Reset this template from default?')) return;
      t.schema = def.schema;
      t.promptWithoutDb = def.promptWithoutDb;
      t.promptWithDb = def.promptWithDb;
      save(settings);
      renderFields();
      alert('Template reset.');
    };

    renderOptions();
  }

  UI.registerPanel({
    id: 'advanced',
    label: 'Advanced',
    title: 'Advanced Tools',
    order: 88,
    render: async function(panel) {
      const R = runtime();

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Advanced tools', 'Use these only when maintaining lore data or migrating content.'));
        nd.appendChild(UI.createNotice('These tools edit persistent lore data. Create a snapshot before large changes.', 'warn'));
      });

      await UI.addBox(panel, async function(nd) { await renderSnapshotTools(nd, R); });
      await UI.addBox(panel, async function(nd) { await renderEntryTools(nd, R); });
      await UI.addBox(panel, async function(nd) { await renderConversionTools(nd, R); });
      UI.addBox(panel, function(nd) { renderTemplateTools(nd, R); });
    }
  });

  UI.__advancedPanelLoaded = true;
  console.log('[LoreInj:UI] advanced panel loaded');
})();