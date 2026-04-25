// == 인젝터 UI 패널 — Lore + Files ==
// 역할: 기본 로어 목록, 팩 활성화, JSON 가져오기/내보내기
// 의존: injecter-ui-utils.js, injecter-2.js settings/db
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:lore] UI utils not loaded');
    return;
  }
  if (UI.__lorePanelLoaded) return;

  function L() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  function makeSmallButton(label, kind) {
    return UI.createButton(label, { compact: true, kind: kind || '', bold: kind === 'primary' || kind === 'danger' });
  }

  function getEnabledPacks(settings, url) {
    return (settings.config.urlPacks && settings.config.urlPacks[url]) || [];
  }

  async function setPackEnabledForUrl(settings, packName, enabled) {
    const C = UI.getCore();
    const curUrl = C && C.getCurUrl ? C.getCurUrl() : location.href;
    const map = JSON.parse(JSON.stringify(settings.config.urlPacks || {}));
    const arr = map[curUrl] || [];
    if (enabled) {
      if (!arr.includes(packName)) arr.push(packName);
    } else {
      const idx = arr.indexOf(packName);
      if (idx >= 0) arr.splice(idx, 1);
    }
    map[curUrl] = arr;
    settings.config.urlPacks = map;
    save(settings);
  }

  function isEntryEnabled(settings, url, entry) {
    const disabled = (settings.config.urlDisabledEntries && settings.config.urlDisabledEntries[url]) || [];
    return !disabled.includes(entry.id);
  }

  function setEntryEnabledForUrl(settings, url, entry, enabled) {
    const map = JSON.parse(JSON.stringify(settings.config.urlDisabledEntries || {}));
    const arr = map[url] || [];
    const idx = arr.indexOf(entry.id);
    if (enabled && idx >= 0) arr.splice(idx, 1);
    if (!enabled && idx < 0) arr.push(entry.id);
    map[url] = arr;
    settings.config.urlDisabledEntries = map;
    save(settings);
  }

  async function refreshPackCount(db, packName) {
    const count = await db.entries.where('packName').equals(packName).count();
    const pack = await db.packs.get(packName);
    if (pack) await db.packs.update(packName, { entryCount: count });
    else await db.packs.put({ name: packName, entryCount: count, project: '' });
    return count;
  }

  async function importEntries(db, settings, packName, entries) {
    let created = 0;
    for (const raw of entries) {
      if (!raw || !raw.name) continue;
      const e = Object.assign({}, raw);
      if (!Array.isArray(e.triggers) || !e.triggers.length) e.triggers = [e.name];
      e.packName = packName;
      e.project = settings.config.activeProject || '';
      const existing = await db.entries.where('packName').equals(packName).and(x => x.name === e.name).first();
      if (existing) await db.entries.update(existing.id, e);
      else { await db.entries.add(e); created++; }
    }
    await refreshPackCount(db, packName);
    await setPackEnabledForUrl(settings, packName, true);
    return created;
  }

  UI.registerPanel({
    id: 'lore',
    label: 'Lore',
    title: 'Lore',
    order: 30,
    render: async function(panel) {
      const R = L();
      const C = R.C;
      const db = R.db;
      const settings = R.settings;
      if (!db || !settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Database or settings are not loaded.', 'error')); });
        return;
      }

      const url = C && C.getCurUrl ? C.getCurUrl() : location.href;
      const activePacks = getEnabledPacks(settings, url);
      const allEntries = await db.entries.toArray();
      const entries = allEntries.filter(e => activePacks.includes(e.packName));
      const grouped = {};
      entries.forEach(e => { (grouped[e.packName] = grouped[e.packName] || []).push(e); });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Active lore', 'Entries from packs enabled for the current page.'));
        if (!activePacks.length) {
          nd.appendChild(UI.createNotice('No active packs for this page. Open Files and enable a pack.', 'warn'));
          return;
        }
        if (!entries.length) {
          nd.appendChild(UI.createNotice('Active packs have no entries.', 'warn'));
          return;
        }
        nd.appendChild(UI.createNotice('Active packs: ' + activePacks.join(', '), 'info'));
      });

      Object.keys(grouped).forEach(function(packName) {
        UI.addBox(panel, function(nd) {
          const items = grouped[packName];
          nd.appendChild(UI.createSection(packName + ' (' + items.length + ')'));
          const list = document.createElement('div');
          list.className = 'lore-scroll-list';
          list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:420px;overflow:auto;';
          items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(function(entry) {
            const row = document.createElement('div');
            row.className = 'lore-card lore-row';
            row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:flex-start;border:1px solid #333;border-radius:6px;background:#111;padding:8px;';
            const left = document.createElement('div');
            left.style.cssText = 'flex:1;min-width:0;';
            const title = document.createElement('div');
            title.textContent = '[' + (entry.type || 'entity') + '] ' + entry.name;
            title.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;word-break:break-all;';
            const desc = document.createElement('div');
            desc.textContent = String(entry.summary || entry.inject?.compact || entry.inject?.full || '').slice(0, 180);
            desc.style.cssText = 'font-size:11px;color:#888;line-height:1.5;margin-top:3px;word-break:break-all;';
            left.appendChild(title);
            left.appendChild(desc);

            const right = document.createElement('div');
            right.className = 'lore-actions';
            right.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';
            const on = isEntryEnabled(settings, url, entry);
            const toggle = makeSmallButton(on ? 'ON' : 'OFF', on ? 'success' : '');
            toggle.onclick = function() {
              const next = !isEntryEnabled(settings, url, entry);
              setEntryEnabledForUrl(settings, url, entry, next);
              toggle.textContent = next ? 'ON' : 'OFF';
              toggle.style.background = next ? '#285' : 'transparent';
              toggle.style.borderColor = next ? '#285' : '#555';
              toggle.style.color = next ? '#fff' : '#ccc';
            };
            const copy = makeSmallButton('Copy');
            copy.onclick = function() {
              const clean = Object.assign({}, entry);
              delete clean.id; delete clean.packName; delete clean.project; delete clean.enabled;
              navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(function(){ alert('Copied.'); }).catch(function(){ alert('Copy failed.'); });
            };
            right.appendChild(toggle);
            right.appendChild(copy);
            row.appendChild(left);
            row.appendChild(right);
            list.appendChild(row);
          });
          nd.appendChild(list);
        });
      });
    }
  });

  UI.registerPanel({
    id: 'files',
    label: 'Files',
    title: 'Files',
    order: 40,
    render: async function(panel) {
      const R = L();
      const db = R.db;
      const settings = R.settings;
      const C = R.C;
      if (!db || !settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Database or settings are not loaded.', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Import JSON', 'Import a lore pack from a JSON file or pasted JSON.'));

        const nameInput = document.createElement('input');
        nameInput.placeholder = 'Pack name';
        nameInput.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';
        nd.appendChild(nameInput);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.style.display = 'none';

        const fileBtn = UI.createButton('Import JSON file', { kind: 'primary' });
        fileBtn.onclick = function(){ fileInput.click(); };
        fileInput.onchange = async function(ev) {
          const file = ev.target.files && ev.target.files[0];
          if (!file) return;
          const packName = nameInput.value.trim() || file.name.replace(/\.json$/i, '');
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const created = await importEntries(db, settings, packName, arr);
            alert('Imported ' + arr.length + ' entries. New entries: ' + created + '.');
            location.reload();
          } catch(e) {
            alert('Import failed: ' + e.message);
          } finally {
            fileInput.value = '';
          }
        };

        const ta = document.createElement('textarea');
        ta.placeholder = '[{\"name\":\"Character\",\"triggers\":[\"keyword\"],\"type\":\"character\",\"summary\":\"Description\"}]';
        ta.style.cssText = 'width:100%;height:110px;padding:8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;font-family:monospace;resize:vertical;margin:8px 0;';
        const pasteBtn = UI.createButton('Import pasted JSON', { kind: 'success' });
        pasteBtn.onclick = async function() {
          const packName = nameInput.value.trim() || 'Manual import';
          if (!ta.value.trim()) { alert('Paste JSON first.'); return; }
          try {
            const parsed = JSON.parse(ta.value);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const created = await importEntries(db, settings, packName, arr);
            alert('Imported ' + arr.length + ' entries. New entries: ' + created + '.');
            location.reload();
          } catch(e) {
            alert('Import failed: ' + e.message);
          }
        };

        const row = document.createElement('div');
        row.className = 'lore-actions';
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        row.appendChild(fileBtn);
        row.appendChild(pasteBtn);
        nd.appendChild(fileInput);
        nd.appendChild(row);
        nd.appendChild(ta);
      });

      const packs = await db.packs.toArray();
      const url = C && C.getCurUrl ? C.getCurUrl() : location.href;
      const enabled = getEnabledPacks(settings, url);

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Packs', 'Enable packs for this page, export them, or delete them.'));
        if (!packs.length) {
          nd.appendChild(UI.createNotice('No packs registered.', 'warn'));
          return;
        }

        const list = document.createElement('div');
        list.className = 'lore-scroll-list';
        list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
        packs.sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(function(pack) {
          const row = document.createElement('div');
          row.className = 'lore-card lore-row';
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid #333;border-radius:6px;background:#111;padding:8px;';

          const title = document.createElement('div');
          title.textContent = pack.name + ' (' + (pack.entryCount || 0) + ')';
          title.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;word-break:break-all;flex:1;';

          const actions = document.createElement('div');
          actions.className = 'lore-actions';
          actions.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;';
          const isOn = enabled.includes(pack.name);
          const toggle = makeSmallButton(isOn ? 'ON' : 'OFF', isOn ? 'success' : '');
          toggle.onclick = async function() {
            const next = !getEnabledPacks(settings, url).includes(pack.name);
            await setPackEnabledForUrl(settings, pack.name, next);
            toggle.textContent = next ? 'ON' : 'OFF';
            toggle.style.background = next ? '#285' : 'transparent';
            toggle.style.borderColor = next ? '#285' : '#555';
            toggle.style.color = next ? '#fff' : '#ccc';
          };

          const exportBtn = makeSmallButton('Export');
          exportBtn.onclick = async function() {
            const entries = await db.entries.where('packName').equals(pack.name).toArray();
            const clean = entries.map(function(e) {
              const c = Object.assign({}, e);
              delete c.id; delete c.packName; delete c.project; delete c.enabled;
              return c;
            });
            const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = pack.name + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          };

          const del = makeSmallButton('Delete', 'danger');
          del.onclick = async function() {
            if (!confirm('Delete pack: ' + pack.name + '?')) return;
            const entries = await db.entries.where('packName').equals(pack.name).toArray();
            for (const e of entries) {
              try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(_){}
            }
            await db.entries.where('packName').equals(pack.name).delete();
            await db.packs.delete(pack.name);
            alert('Deleted.');
            location.reload();
          };

          actions.appendChild(toggle);
          actions.appendChild(exportBtn);
          actions.appendChild(del);
          row.appendChild(title);
          row.appendChild(actions);
          list.appendChild(row);
        });
        nd.appendChild(list);
      });
    }
  });

  UI.__lorePanelLoaded = true;
  console.log('[LoreInj:UI] lore and files panels loaded');
})();