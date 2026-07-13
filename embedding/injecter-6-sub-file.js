// injecter / sub-file - 로어팩 관리와 백업 화면용 로어팩 가져오기 도구
// 역할: 팩 활성화/이름 변경/내보내기/임베딩/삭제, JSON 가져오기 공용 함수
// 의존: injecter-3 (settings, db, C, setPackEnabled)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-file] settings 미로드'); return; }
  if (_w.__LoreInj.__subFileLoaded) return;

  const { C, db, settings, setPackEnabled } = _w.__LoreInj;
  const _ls = _w.localStorage;
  const BACKUP_SCHEMA = 'crack-lore-full-backup';
  const BACKUP_VERSION = 1;
  const DB_TABLES = ['packs', 'entries', 'embeddings', 'workingMemory', 'encounters', 'entryVersions', 'snapshots'];
  const HEAVY_HISTORY_TABLES = ['entryVersions', 'snapshots'];
  const LS_KEYS = ['lore-active-packs-v1', 'lore-turn-counters', 'lore-last-mention', 'lore-api-cost-log', 'lore-api-cost-cumulative', 'lore-local-migration-version', 'lore-local-migration-status'];
  const SECRET_SETTING_KEYS = ['autoExtKey', 'autoExtVertexJson', 'autoExtFirebaseScript', 'autoExtFirebaseEmbedKey', 'autoExtGeminiEmbedKey', 'autoExtDeepSeekKey', 'autoExtOpenAIKey', 'backupServerPassword', 'backupServerToken'];
  const PAGE_SETTING_KEYS = ['urlPacks', 'urlDisabledEntries', 'urlAutoExtPacks', 'urlCooldownMaps', 'urlExtLogs', 'urlInjLogs', 'urlRefinerLogs'];
  const PAGE_LS_KEYS = ['lore-active-packs-v1', 'lore-turn-counters', 'lore-last-mention'];
  const LOG_SETTING_KEYS = ['urlExtLogs', 'urlInjLogs', 'urlRefinerLogs'];

  function clonePlain(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }

  function sanitizeSettings(config, includeSecrets, opts = {}) {
    const out = clonePlain(config || {});
    if (!includeSecrets) {
      SECRET_SETTING_KEYS.forEach(k => { if (out[k] !== undefined) out[k] = ''; });
    }
    if (opts.includeLogs === false) {
      LOG_SETTING_KEYS.forEach(k => { if (out[k] !== undefined) out[k] = {}; });
    }
    return out;
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function safeFileName(s) {
    return String(s || 'backup').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  }

  function normalizePackImportPayload(raw) {
    const entries = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.entries) ? raw.entries : [raw]);
    return entries.filter(entry => entry && typeof entry === 'object' && entry.name);
  }

  async function importLorePack(raw, requestedName) {
    const entries = normalizePackImportPayload(raw);
    if (!entries.length) throw new Error('가져올 로어 항목이 없음');
    const packName = String(requestedName || '가져온 로어').trim() || '가져온 로어';
    let added = 0, updated = 0;
    const tables = [db.packs, db.entries];
    if (db.embeddings) tables.push(db.embeddings);
    await db.transaction('rw', ...tables, async () => {
      for (const rawEntry of entries) {
        let entry = clonePlain(rawEntry);
        if (C.normalizeLoreEntry) entry = C.normalizeLoreEntry(entry, { source: 'imported' });
        if (!Array.isArray(entry.triggers) || !entry.triggers.length) entry.triggers = [entry.name];
        entry.packName = packName;
        entry.project = settings.config.activeProject || '';
        entry.enabled = true;
        entry.src = entry.src || 'im';
        entry.source = entry.source || 'imported';
        entry.ts = entry.ts || Date.now();
        entry.lastUpdated = Date.now();
        const existing = await db.entries.where('packName').equals(packName).and(item => item.name === entry.name).first();
        if (existing) {
          entry.id = existing.id;
          await db.entries.put(entry);
          if (db.embeddings) await db.embeddings.where('entryId').equals(existing.id).delete();
          updated++;
        } else {
          delete entry.id;
          await db.entries.add(entry);
          added++;
        }
      }
      const entryCount = await db.entries.where('packName').equals(packName).count();
      const existingPack = await db.packs.get(packName);
      await db.packs.put({ ...(existingPack || {}), name: packName, entryCount, project: existingPack && existingPack.project || settings.config.activeProject || '' });
    });
    await setPackEnabled(packName, true);
    return { packName, total: entries.length, added, updated };
  }

  function renderLorePackImportSection(parent, onDone) {
    const title = document.createElement('div'); title.textContent = '로어팩 가져오기'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:5px;'; parent.appendChild(title);
    const desc = document.createElement('div'); desc.textContent = '입력한 이름의 로어팩이 없으면 새로 만듭니다. 이미 있으면 같은 이름의 로어는 가져온 내용으로 갱신하고, 새로운 로어는 기존 팩에 추가한 뒤 현재 채팅에서 켭니다.'; desc.style.cssText = 'font-size:11px;color:#999;line-height:1.5;margin-bottom:8px;'; parent.appendChild(desc);
    const nameInput = document.createElement('input'); nameInput.placeholder = '저장할 로어팩 이름'; nameInput.style.cssText = 'width:100%;padding:7px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:7px;'; parent.appendChild(nameInput);
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.style.display = 'none';
    const fileButton = document.createElement('button'); fileButton.textContent = '로어 JSON 파일 선택'; fileButton.style.cssText = 'padding:7px 12px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;'; fileButton.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0]; if (!file) return;
      fileButton.disabled = true; const original = fileButton.textContent; fileButton.textContent = '가져오는 중...';
      try {
        const report = await importLorePack(JSON.parse(await file.text()), nameInput.value.trim() || file.name.replace(/\.json$/i, ''));
        alert('로어팩 가져오기 완료: ' + report.total + '개 처리 / 새로 추가 ' + report.added + '개 / 갱신 ' + report.updated + '개');
        if (typeof onDone === 'function') onDone(report);
      } catch (error) { alert('로어팩 가져오기 실패: ' + (error.message || String(error))); }
      fileInput.value = ''; fileButton.textContent = original; fileButton.disabled = false;
    };
    parent.appendChild(fileInput); parent.appendChild(fileButton);

    const details = document.createElement('details'); details.style.cssText = 'margin-top:9px;';
    const summary = document.createElement('summary'); summary.textContent = 'JSON 직접 입력'; summary.style.cssText = 'cursor:pointer;font-size:11px;color:#8bc;'; details.appendChild(summary);
    const textarea = document.createElement('textarea'); textarea.placeholder = '[{"name":"이름","triggers":["키워드"],"type":"character","summary":{"full":"설명"}}]'; textarea.style.cssText = 'width:100%;height:110px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:11px;font-family:monospace;resize:vertical;box-sizing:border-box;margin-top:7px;'; details.appendChild(textarea);
    const manualButton = document.createElement('button'); manualButton.textContent = '입력한 JSON 가져오기'; manualButton.style.cssText = 'margin-top:6px;padding:7px 12px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:1px solid #285;font-weight:bold;';
    manualButton.onclick = async () => {
      if (!textarea.value.trim()) { alert('가져올 JSON을 입력해 주세요.'); return; }
      manualButton.disabled = true; const original = manualButton.textContent; manualButton.textContent = '가져오는 중...';
      try {
        const report = await importLorePack(JSON.parse(textarea.value), nameInput.value.trim() || '수동 추가');
        textarea.value = '';
        alert('로어팩 가져오기 완료: ' + report.total + '개 처리 / 새로 추가 ' + report.added + '개 / 갱신 ' + report.updated + '개');
        if (typeof onDone === 'function') onDone(report);
      } catch (error) { alert('로어팩 가져오기 실패: ' + (error.message || String(error))); }
      manualButton.textContent = original; manualButton.disabled = false;
    };
    details.appendChild(manualButton); parent.appendChild(details);
  }

  async function renameLorePack(oldName, requestedName) {
    const newName = String(requestedName || '').trim();
    if (!oldName || !newName) throw new Error('새 로어팩 이름을 입력해야 함');
    if (oldName === newName) return { oldName, newName, unchanged: true };
    if (await db.packs.get(newName)) throw new Error('같은 이름의 로어팩이 이미 있음');
    const oldPack = await db.packs.get(oldName);
    if (!oldPack) throw new Error('이름을 바꿀 로어팩을 찾을 수 없음');
    const renamedSnapshots = [];
    if (db.snapshots) {
      const snapshots = await db.snapshots.where('packName').equals(oldName).toArray();
      for (const snapshot of snapshots) {
        let data = Array.isArray(snapshot.data) ? snapshot.data : [];
        if (snapshot.dataGzip && typeof C.unpackJsonFromStorage === 'function') data = await C.unpackJsonFromStorage(snapshot, 'data', 'dataGzip', 'dataEncoding');
        const renamedData = Array.isArray(data) ? data.map(entry => ({ ...entry, packName: newName })) : [];
        const packed = typeof C.packJsonForStorage === 'function' ? await C.packJsonForStorage(renamedData) : { value: renamedData, gzip: '', encoding: '' };
        renamedSnapshots.push({ ...snapshot, packName: newName, data: packed.value, dataGzip: packed.gzip || '', dataEncoding: packed.encoding || '', itemCount: renamedData.length });
      }
    }
    const tables = [db.packs, db.entries];
    if (db.embeddings) tables.push(db.embeddings);
    if (db.snapshots) tables.push(db.snapshots);
    await db.transaction('rw', ...tables, async () => {
      await db.packs.put({ ...oldPack, name: newName });
      await db.entries.where('packName').equals(oldName).modify({ packName: newName });
      if (db.embeddings) await db.embeddings.where('packName').equals(oldName).modify({ packName: newName });
      if (db.snapshots) for (const snapshot of renamedSnapshots) await db.snapshots.put(snapshot);
      await db.packs.delete(oldName);
    });
    const replaceList = (list) => Array.from(new Set((Array.isArray(list) ? list : []).map(name => name === oldName ? newName : name)));
    settings.config.autoPacks = replaceList(settings.config.autoPacks);
    if (settings.config.autoExtPack === oldName) settings.config.autoExtPack = newName;
    for (const key of Object.keys(settings.config.urlPacks || {})) settings.config.urlPacks[key] = replaceList(settings.config.urlPacks[key]);
    for (const key of Object.keys(settings.config.urlAutoExtPacks || {})) if (settings.config.urlAutoExtPacks[key] === oldName) settings.config.urlAutoExtPacks[key] = newName;
    const activeMap = typeof _w.__LoreInj.readActivePackMap === 'function' ? _w.__LoreInj.readActivePackMap() : {};
    for (const key of Object.keys(activeMap)) activeMap[key] = replaceList(activeMap[key]);
    if (typeof _w.__LoreInj.saveActivePackMap === 'function') _w.__LoreInj.saveActivePackMap(activeMap);
    settings.save();
    return { oldName, newName };
  }

  async function exportFullBackup(opts = {}) {
    const includeSecrets = !!opts.includeSecrets;
    const includeLogs = opts.includeLogs !== false;
    const includeEmbeddings = opts.includeEmbeddings !== false;
    const includeHistory = opts.includeHistory !== false;
    const tables = {};
    for (const name of DB_TABLES) {
      if (name === 'embeddings' && !includeEmbeddings) {
        tables[name] = [];
        continue;
      }
      if (!includeHistory && HEAVY_HISTORY_TABLES.includes(name)) {
        tables[name] = [];
        continue;
      }
      try { tables[name] = db[name] ? await db[name].toArray() : []; }
      catch (_) { tables[name] = []; }
    }
    const localStorageData = {};
    for (const key of LS_KEYS) {
      if (!includeLogs && key.includes('cost')) continue;
      try {
        const val = _ls.getItem(key);
        if (val != null) localStorageData[key] = val;
      } catch (_) {}
    }
    return {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      appVersion: _w.__LoreInj && _w.__LoreInj.VER || '',
      includeSecrets,
      serverSlim: !!opts.serverSlim,
      embeddingExcluded: !includeEmbeddings,
      historyExcluded: !includeHistory,
      logsExcluded: !includeLogs,
      settings: sanitizeSettings(settings.config, includeSecrets, { includeLogs }),
      localStorage: localStorageData,
      db: tables
    };
  }

  function normalizeBackup(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('백업 파일 형식 아님');
    if (raw.schema === BACKUP_SCHEMA && raw.db && raw.settings) return raw;
    if (Array.isArray(raw) || Array.isArray(raw.entries)) {
      return { schema: 'legacy-lore-pack', version: 0, db: { entries: Array.isArray(raw) ? raw : raw.entries }, settings: null, localStorage: {} };
    }
    throw new Error('지원하지 않는 백업 형식');
  }

  async function clearKnownTables() {
    for (const name of [...DB_TABLES].reverse()) {
      try { if (db[name]) await db[name].clear(); } catch (_) {}
    }
  }

  function uniqueName(base, used) {
    const root = String(base || '가져온 백업').trim() || '가져온 백업';
    if (!used.has(root)) return root;
    const first = root + ' (가져옴)';
    if (!used.has(first)) return first;
    let n = 2;
    while (used.has(root + ' (가져옴 ' + n + ')')) n++;
    return root + ' (가져옴 ' + n + ')';
  }

  function mergeObjectMap(current, incoming, mode) {
    const cur = current && typeof current === 'object' && !Array.isArray(current) ? clonePlain(current) : {};
    const inc = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? clonePlain(incoming) : {};
    if (mode === 'backup') return inc;
    if (mode === 'add_missing') {
      for (const [k, v] of Object.entries(inc)) if (cur[k] === undefined) cur[k] = v;
    }
    return cur;
  }

  function applySettingsPolicy(importedSettings, replace, opts) {
    const includeSecrets = !!opts.includeSecrets;
    const settingsMode = opts.settingsMode || (opts.importSettings ? 'backup' : 'keep');
    const pageMode = opts.pageMode || (replace ? 'backup' : 'add_missing');
    const imported = sanitizeSettings(importedSettings, includeSecrets);
    if (!includeSecrets) SECRET_SETTING_KEYS.forEach(k => { imported[k] = settings.config[k] || ''; });
    if (replace) {
      settings.config = Object.assign(clonePlain(_w.__LoreInj.defaultSettings || {}), imported);
      settings.save();
      return;
    }
    if (settingsMode === 'backup') {
      for (const [k, v] of Object.entries(imported)) {
        if (PAGE_SETTING_KEYS.includes(k)) continue;
        settings.config[k] = v;
      }
    }
    for (const key of PAGE_SETTING_KEYS) {
      if (imported[key] === undefined) continue;
      settings.config[key] = mergeObjectMap(settings.config[key], imported[key], pageMode);
    }
    settings.save();
  }

  function applyLocalStoragePolicy(localStorageData, replace, opts) {
    if (!localStorageData || typeof localStorageData !== 'object') return;
    const includeSecrets = !!opts.includeSecrets;
    const pageMode = opts.pageMode || (replace ? 'backup' : 'add_missing');
    for (const [key, value] of Object.entries(localStorageData)) {
      if (!includeSecrets && key === 'lore-injector-v5') continue;
      try {
        if (!replace && PAGE_LS_KEYS.includes(key) && pageMode !== 'backup') {
          const cur = JSON.parse(_ls.getItem(key) || '{}');
          const inc = JSON.parse(String(value || '{}'));
          _ls.setItem(key, JSON.stringify(mergeObjectMap(cur, inc, pageMode)));
        } else if (replace || pageMode === 'backup' || !PAGE_LS_KEYS.includes(key)) {
          _ls.setItem(key, String(value));
        }
      } catch (_) {}
    }
  }

  async function deletePackData(packName) {
    if (!packName) return;
    if (typeof _w.__LoreInj.deletePackData === 'function') {
      return await _w.__LoreInj.deletePackData(packName);
    }
    try {
      const es = await db.entries.where('packName').equals(packName).toArray();
      const ids = es.map(e => e && e.id).filter(id => id != null);
      const tables = [db.packs, db.entries];
      if (db.embeddings) tables.push(db.embeddings);
      if (db.entryVersions) tables.push(db.entryVersions);
      if (db.snapshots) tables.push(db.snapshots);
      await db.transaction('rw', ...tables, async () => {
        if (ids.length && db.embeddings) await db.embeddings.where('entryId').anyOf(ids).delete();
        if (ids.length && db.entryVersions) await db.entryVersions.where('entryId').anyOf(ids).delete();
        if (db.snapshots) await db.snapshots.where('packName').equals(packName).delete();
        await db.entries.where('packName').equals(packName).delete();
        await db.packs.delete(packName);
      });
    } catch (_) {}
  }

  async function analyzeBackupConflicts(backup) {
    const data = normalizeBackup(backup);
    const sourceDb = data.db || {};
    const packs = Array.isArray(sourceDb.packs) ? sourceDb.packs.filter(p => p && p.name) : [];
    const entries = Array.isArray(sourceDb.entries) ? sourceDb.entries.filter(e => e && e.name) : [];
    const existingPacks = await db.packs.toArray();
    const existingPackNames = new Set(existingPacks.map(p => p.name).filter(Boolean));
    const backupPackNames = new Set(packs.map(p => p.name));
    for (const e of entries) if (e.packName) backupPackNames.add(e.packName);
    const usedNames = new Set(existingPackNames);
    const packConflicts = [];
    const packPlan = {};
    for (const name of Array.from(backupPackNames).sort()) {
      const hasConflict = existingPackNames.has(name);
      const targetName = hasConflict ? uniqueName(name, usedNames) : name;
      usedNames.add(targetName);
      packPlan[name] = { action: hasConflict ? 'rename' : 'merge', targetName };
      if (hasConflict) {
        const incomingCount = entries.filter(e => (e.packName || '가져온 백업') === name).length;
        const existingCount = await db.entries.where('packName').equals(name).count();
        packConflicts.push({ name, targetName, incomingCount, existingCount });
      }
    }
    let entryConflicts = 0;
    for (const e of entries) {
      const pn = e.packName || '가져온 백업';
      if (!existingPackNames.has(pn)) continue;
      const ex = await db.entries.where('packName').equals(pn).and(x => x.name === e.name).first();
      if (ex) entryConflicts++;
    }
    const settingKeys = data.settings && typeof data.settings === 'object' ? Object.keys(data.settings) : [];
    const pageSettingConflicts = PAGE_SETTING_KEYS.filter(k => data.settings && data.settings[k] && settings.config[k]);
    const localStorageKeys = data.localStorage && typeof data.localStorage === 'object' ? Object.keys(data.localStorage) : [];
    return {
      data,
      summary: {
        packs: backupPackNames.size,
        entries: entries.length,
        embeddings: Array.isArray(sourceDb.embeddings) ? sourceDb.embeddings.length : 0,
        packConflicts: packConflicts.length,
        entryConflicts,
        settingKeys: settingKeys.length,
        pageSettingConflicts: pageSettingConflicts.length,
        localStorageKeys: localStorageKeys.length
      },
      packConflicts,
      defaultPlan: {
        packPlan,
        entryConflictMode: 'add_new',
        settingsMode: 'keep',
        pageMode: 'add_missing'
      }
    };
  }

  async function importFullBackup(backup, mode, opts = {}) {
    const replace = mode === 'replace';
    const includeSecrets = !!opts.includeSecrets;
    if (_w.__LoreInj.backupSettings) _w.__LoreInj.backupSettings('before-file-import');
    const data = normalizeBackup(backup);
    const sourceDb = data.db || {};
    const idMap = {};
    const conflictPlan = opts.conflictPlan || {};
    const packPlan = conflictPlan.packPlan || {};
    const entryConflictMode = conflictPlan.entryConflictMode || 'add_new';

    if (replace) await clearKnownTables();

    if (data.settings && (replace || opts.importSettings || conflictPlan.settingsMode)) applySettingsPolicy(data.settings, replace, { ...opts, settingsMode: conflictPlan.settingsMode, pageMode: conflictPlan.pageMode });

    const packs = Array.isArray(sourceDb.packs) ? sourceDb.packs : [];
    if (!replace) {
      for (const p of Object.values(packPlan)) {
        if (p && p.action === 'replace' && p.targetName) await deletePackData(p.targetName);
      }
    }
    for (const p of packs) {
      if (!p || !p.name) continue;
      const plan = !replace ? (packPlan[p.name] || { action: 'merge', targetName: p.name }) : { action: 'merge', targetName: p.name };
      if (plan.action === 'skip') continue;
      const targetName = plan.targetName || p.name;
      try {
        const cp = clonePlain(p);
        cp.name = targetName;
        if (replace || plan.action !== 'merge' || !(await db.packs.get(targetName))) await db.packs.put(cp);
      } catch (_) {}
    }

    const entries = Array.isArray(sourceDb.entries) ? sourceDb.entries : [];
    const touchedPacks = new Set();
    for (const raw of entries) {
      if (!raw || !raw.name) continue;
      const oldId = raw.id;
      const e = clonePlain(raw);
      if (!e.packName) e.packName = '가져온 백업';
      const plan = !replace ? (packPlan[e.packName] || { action: 'merge', targetName: e.packName }) : { action: 'merge', targetName: e.packName };
      if (plan.action === 'skip') {
        if (oldId != null) idMap[oldId] = null;
        continue;
      }
      e.packName = plan.targetName || e.packName;
      touchedPacks.add(e.packName);
      if (!e.triggers) e.triggers = [e.name];
      if (C.normalizeLoreEntry) Object.assign(e, C.normalizeLoreEntry(e, { source: 'backup_import' }));
      if (replace) {
        await db.entries.put(e);
        if (oldId != null) idMap[oldId] = e.id != null ? e.id : oldId;
      } else {
        delete e.id;
        const ex = await db.entries.where('packName').equals(e.packName).and(x => x.name === e.name).first();
        if (ex) {
          if (entryConflictMode === 'update') {
            await db.entries.update(ex.id, e);
            if (oldId != null) idMap[oldId] = ex.id;
            try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(ex.id); } catch (_) {}
          } else if (entryConflictMode === 'keep') {
            if (oldId != null) idMap[oldId] = null;
          } else {
            const names = new Set((await db.entries.where('packName').equals(e.packName).toArray()).map(x => x.name));
            e.name = uniqueName(e.name, names);
            const newId = await db.entries.add(e);
            if (oldId != null) idMap[oldId] = newId;
          }
        } else {
          const newId = await db.entries.add(e);
          if (oldId != null) idMap[oldId] = newId;
        }
      }
    }

    const embeddings = Array.isArray(sourceDb.embeddings) ? sourceDb.embeddings : [];
    for (const raw of embeddings) {
      if (!raw || raw.entryId == null) continue;
      const newEntryId = replace ? raw.entryId : idMap[raw.entryId];
      if (newEntryId == null) continue;
      const emb = clonePlain(raw);
      emb.entryId = newEntryId;
      if (!replace) delete emb.id;
      try { await db.embeddings.put(emb); } catch (_) {}
    }

    for (const name of ['workingMemory', 'encounters', 'entryVersions', 'snapshots']) {
      const rows = Array.isArray(sourceDb[name]) ? sourceDb[name] : [];
      if (!db[name]) continue;
      for (const raw of rows) {
        const row = clonePlain(raw);
        if (!replace && row.id != null) delete row.id;
        if (name === 'entryVersions' && row.entryId != null && idMap[row.entryId] != null) row.entryId = idMap[row.entryId];
        try { await db[name].put(row); } catch (_) {}
      }
    }

    for (const packName of touchedPacks) {
      if (!packName) continue;
      const exists = await db.packs.get(packName);
      if (!exists) await db.packs.put({ name: packName, entryCount: 0, project: settings.config.activeProject || '' });
    }

    const allPacks = await db.packs.toArray();
    for (const p of allPacks) {
      const count = await db.entries.where('packName').equals(p.name).count();
      if (count <= 0) await deletePackData(p.name);
      else await db.packs.update(p.name, { entryCount: count });
    }

    applyLocalStoragePolicy(data.localStorage, replace, { ...opts, includeSecrets, pageMode: conflictPlan.pageMode });

    settings.load();
    return { packs: allPacks.length, entries: entries.length, embeddings: embeddings.length, touchedPacks: Array.from(touchedPacks), mode };
  }

  function showBackupImportDialog(analysis) {
    return new Promise((resolve) => {
      const plan = clonePlain(analysis.defaultPlan || {});
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:min(760px,100%);max-height:min(760px,92vh);overflow:auto;background:#202020;color:#ddd;border:1px solid #555;border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:16px;box-sizing:border-box;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
      overlay.appendChild(modal);
      const h = document.createElement('div'); h.textContent = '백업 병합 확인'; h.style.cssText = 'font-size:18px;font-weight:700;color:#eee;margin-bottom:8px;'; modal.appendChild(h);
      const s = analysis.summary || {};
      const summary = document.createElement('div');
      summary.textContent = `로어팩 ${s.packs || 0}개, 로어 ${s.entries || 0}개, 검색 준비 ${s.embeddings || 0}개. 이름 충돌 로어팩 ${s.packConflicts || 0}개, 같은 이름 로어 ${s.entryConflicts || 0}개.`;
      summary.style.cssText = 'font-size:12px;color:#aaa;line-height:1.5;margin-bottom:12px;';
      modal.appendChild(summary);

      const makeSection = (title, desc) => {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid #3b3b3b;border-radius:6px;background:#181818;padding:12px;margin:10px 0;';
        const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'font-size:14px;font-weight:700;color:#ddd;margin-bottom:4px;'; box.appendChild(t);
        if (desc) { const d = document.createElement('div'); d.textContent = desc; d.style.cssText = 'font-size:11px;color:#888;line-height:1.45;margin-bottom:10px;'; box.appendChild(d); }
        modal.appendChild(box);
        return box;
      };
      const makeSelect = (items, value, onChange) => {
        const sel = document.createElement('select');
        sel.style.cssText = 'width:100%;padding:7px;border:1px solid #444;border-radius:4px;background:#101010;color:#ddd;font-size:12px;box-sizing:border-box;';
        items.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); });
        sel.value = value;
        sel.onchange = () => onChange(sel.value);
        return sel;
      };

      const packBox = makeSection('로어팩 이름 충돌', '같은 이름의 로어팩은 기본적으로 새 이름으로 가져옴. 기존 로어팩을 자동으로 덮어쓰지 않음.');
      if (!analysis.packConflicts || !analysis.packConflicts.length) {
        const none = document.createElement('div'); none.textContent = '겹치는 로어팩 이름 없음.'; none.style.cssText = 'font-size:12px;color:#888;'; packBox.appendChild(none);
      } else {
        analysis.packConflicts.forEach((pc) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 150px minmax(120px,180px);gap:8px;align-items:end;margin-top:8px;';
          if (typeof matchMedia === 'function' && matchMedia('(max-width: 620px)').matches) row.style.gridTemplateColumns = '1fr';
          const nameWrap = document.createElement('div');
          const nl = document.createElement('div'); nl.textContent = pc.name + ` (현재 ${pc.existingCount || 0}개 / 백업 ${pc.incomingCount || 0}개)`; nl.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;word-break:break-all;'; nameWrap.appendChild(nl);
          const input = document.createElement('input'); input.value = pc.targetName || (pc.name + ' (가져옴)'); input.style.cssText = 'width:100%;padding:7px;border:1px solid #444;border-radius:4px;background:#101010;color:#ddd;font-size:12px;box-sizing:border-box;';
          input.oninput = () => { if (!plan.packPlan[pc.name]) plan.packPlan[pc.name] = {}; plan.packPlan[pc.name].targetName = input.value.trim() || pc.targetName || pc.name; };
          nameWrap.appendChild(input);
          const action = makeSelect([
            ['rename', '새 이름으로 가져오기'],
            ['merge', '기존 팩에 병합'],
            ['replace', '기존 팩 교체'],
            ['skip', '가져오지 않기']
          ], plan.packPlan?.[pc.name]?.action || 'rename', (v) => {
            if (!plan.packPlan[pc.name]) plan.packPlan[pc.name] = {};
            plan.packPlan[pc.name].action = v;
            input.disabled = v !== 'rename';
            input.style.opacity = input.disabled ? '.55' : '1';
            if (v === 'merge' || v === 'replace') plan.packPlan[pc.name].targetName = pc.name;
            else if (v === 'skip') plan.packPlan[pc.name].targetName = pc.name;
            else plan.packPlan[pc.name].targetName = input.value.trim() || pc.targetName || pc.name;
          });
          const spacer = document.createElement('div'); spacer.appendChild(action);
          row.appendChild(nameWrap); row.appendChild(spacer);
          packBox.appendChild(row);
          action.onchange();
        });
      }

      const entryBox = makeSection('같은 이름 로어 처리', '기존 로어팩에 병합할 때 같은 이름의 로어가 있으면 어떻게 처리할지 선택함.');
      entryBox.appendChild(makeSelect([
        ['add_new', '새 항목으로 추가'],
        ['keep', '현재 로어 유지'],
        ['update', '백업 로어로 갱신']
      ], plan.entryConflictMode || 'add_new', (v) => { plan.entryConflictMode = v; }));

      const settingsBox = makeSection('설정 가져오기', '전역 설정과 채팅별 설정은 별도로 처리함. 기본값은 현재 전역 설정 유지, 없는 채팅별 설정만 추가.');
      const settingsGrid = document.createElement('div'); settingsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
      if (typeof matchMedia === 'function' && matchMedia('(max-width: 620px)').matches) settingsGrid.style.gridTemplateColumns = '1fr';
      const g1 = document.createElement('div'); const l1 = document.createElement('div'); l1.textContent = '전역 설정'; l1.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;'; g1.appendChild(l1);
      g1.appendChild(makeSelect([['keep', '현재 설정 유지'], ['backup', '백업 설정 사용']], plan.settingsMode || 'keep', (v) => { plan.settingsMode = v; }));
      const g2 = document.createElement('div'); const l2 = document.createElement('div'); l2.textContent = '채팅별 설정'; l2.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;'; g2.appendChild(l2);
      g2.appendChild(makeSelect([['add_missing', '없는 채팅만 추가'], ['current', '현재 값 유지'], ['backup', '백업 값 사용']], plan.pageMode || 'add_missing', (v) => { plan.pageMode = v; }));
      settingsGrid.appendChild(g1); settingsGrid.appendChild(g2); settingsBox.appendChild(settingsGrid);

      const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;';
      const cancel = document.createElement('button'); cancel.textContent = '취소'; cancel.style.cssText = 'padding:8px 14px;border:1px solid #555;background:#181818;color:#ccc;border-radius:4px;cursor:pointer;';
      const ok = document.createElement('button'); ok.textContent = '가져오기 실행'; ok.style.cssText = 'padding:8px 14px;border:1px solid #286;background:#173421;color:#8ed6a7;border-radius:4px;cursor:pointer;font-weight:700;';
      cancel.onclick = () => { document.body.removeChild(overlay); resolve(null); };
      ok.onclick = () => {
        for (const [name, p] of Object.entries(plan.packPlan || {})) {
          if (p.action === 'rename' && !String(p.targetName || '').trim()) {
            alert('새 로어팩 이름을 입력해야 함: ' + name);
            return;
          }
        }
        document.body.removeChild(overlay);
        resolve(plan);
      };
      buttons.appendChild(cancel); buttons.appendChild(ok); modal.appendChild(buttons);
      document.body.appendChild(overlay);
    });
  }

  Object.assign(_w.__LoreInj, {
    backupTools: {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION,
      exportFullBackup,
      normalizeBackup,
      analyzeBackupConflicts,
      importFullBackup,
      showBackupImportDialog,
      importLorePack,
      renderLorePackImportSection,
      renameLorePack,
      downloadJson,
      safeFileName
    }
  });

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  _w.__LoreInj.registerSubMenu('file', function(modal) {
    modal.createSubMenu('로어팩 관리', (m) => {
      const renderPackUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const rawPacks = await db.packs.toArray();
          const packs = [];
          for (const p of rawPacks) {
            const count = await db.entries.where('packName').equals(p.name).count();
            if (count <= 0) {
              await deletePackData(p.name);
              continue;
            }
            if ((p.entryCount || 0) !== count) await db.packs.update(p.name, { entryCount: count });
            packs.push({ ...p, entryCount: count });
          }
          if (!packs.length) { const empty = document.createElement('div'); empty.textContent = '등록된 팩이 없습니다.'; empty.style.cssText = 'color:#666;text-align:center;padding:20px;font-size:12px;'; nd.appendChild(empty); return; }
          const curUrl = C.getCurUrl(); const enabledPacks = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(curUrl) : (settings.config.urlPacks?.[curUrl] || []);
          for (const pack of packs) {
            const packDiv = document.createElement('div'); packDiv.style.cssText = 'margin-bottom:8px;border:1px solid #333;border-radius:4px;overflow:hidden;';
            const header = document.createElement('div'); header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#111;';
            const leftSide = document.createElement('div'); leftSide.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';
            const isEnabled = enabledPacks.includes(pack.name);
            const swWrap = document.createElement('div'); swWrap.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
            const swLabel = document.createElement('span'); swLabel.textContent = isEnabled ? 'ON' : 'OFF'; swLabel.style.cssText = 'font-size:10px;font-weight:bold;width:20px;text-align:center;color:' + (isEnabled ? '#4a7' : '#777') + ';';
            const sw = document.createElement('div'); sw.style.cssText = 'width:24px;height:12px;border-radius:6px;background:' + (isEnabled ? '#285' : '#444') + ';position:relative;';
            const dot = document.createElement('div'); dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;top:2px;left:' + (isEnabled ? '14px' : '2px') + ';transition:left .2s;';
            sw.appendChild(dot); swWrap.appendChild(swLabel); swWrap.appendChild(sw);
            swWrap.onclick = async () => { const curEnabled = ((_w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : (settings.config.urlPacks?.[C.getCurUrl()] || []))).includes(pack.name); await setPackEnabled(pack.name, !curEnabled); const nowEnabled = ((_w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : (settings.config.urlPacks?.[C.getCurUrl()] || []))).includes(pack.name); swLabel.textContent = nowEnabled ? 'ON' : 'OFF'; swLabel.style.color = nowEnabled ? '#4a7' : '#777'; sw.style.background = nowEnabled ? '#285' : '#444'; dot.style.left = nowEnabled ? '14px' : '2px'; };
            leftSide.appendChild(swWrap);
            const nameEl = document.createElement('span'); nameEl.textContent = pack.name + ' (' + (pack.entryCount || 0) + '개)'; nameEl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;'; leftSide.appendChild(nameEl);
            header.appendChild(leftSide);
            const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;';
            const B = 'font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
            const renameBtn = document.createElement('button'); renameBtn.textContent = '이름 변경'; renameBtn.style.cssText = B + 'color:#8bc;border-color:#346;';
            renameBtn.onclick = async () => {
              const nextName = prompt('새 로어팩 이름', pack.name);
              if (nextName == null || !nextName.trim() || nextName.trim() === pack.name) return;
              renameBtn.disabled = true;
              try {
                await renameLorePack(pack.name, nextName);
                m.replaceContentPanel(renderPackUI, '로어팩 관리');
              } catch (error) { alert('이름 변경 실패: ' + (error.message || String(error))); renameBtn.disabled = false; }
            };
            const exportBtn = document.createElement('button'); exportBtn.textContent = '내보내기'; exportBtn.style.cssText = B;
            exportBtn.onclick = async () => { const entries = await db.entries.where('packName').equals(pack.name).toArray(); if (!entries.length) { alert('항목 없음.'); return; } const clean = entries.map(({ id, packName, project, enabled, ...rest }) => rest); const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = pack.name + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
            const embBtn = document.createElement('button'); embBtn.textContent = '검색 준비'; embBtn.style.cssText = B + 'color:#4a9;border-color:#264;'; embBtn.onclick = async () => { const miss = _w.__LoreInj.getApiMissingReason ? _w.__LoreInj.getApiMissingReason(settings.config, 'embed') : ''; if (miss) { alert(miss || 'API 설정 필요.'); return; } if (!confirm('[' + pack.name + '] 의미 검색 준비를 시작할까요?')) return; embBtn.disabled = true; const orig = embBtn.textContent; try { const apiOpts = _w.__LoreInj.buildEmbeddingApiOpts ? _w.__LoreInj.buildEmbeddingApiOpts({ model: settings.config.embeddingModel || 'gemini-embedding-001' }, { feature: 'embed', chatKey: 'global' }) : { apiType: settings.config.autoExtApiType === 'deepseek' ? 'key' : (settings.config.autoExtApiType || 'key'), key: settings.config.autoExtApiType === 'deepseek' ? settings.config.autoExtFirebaseEmbedKey : settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }; const cnt = await C.embedPack(pack.name, apiOpts, (done, total) => { embBtn.textContent = done + '/' + total; }); embBtn.textContent = '완료 ' + cnt; setTimeout(() => { embBtn.textContent = orig; embBtn.disabled = false; }, 2000); } catch (e) { embBtn.textContent = 'X'; embBtn.disabled = false; alert('검색 준비 실패: ' + e.message); } };
            const cleanBtn = document.createElement('button'); cleanBtn.textContent = '정리'; cleanBtn.title = 'API 호출 없이 오래된 검색 준비 데이터를 삭제'; cleanBtn.style.cssText = B + 'color:#da8;border-color:#642;';
            cleanBtn.onclick = async () => { cleanBtn.disabled = true; const orig = cleanBtn.textContent; cleanBtn.textContent = '...'; try { const rpt = C.cleanupStaleEmbeddings ? await C.cleanupStaleEmbeddings(pack.name, { model: settings.config.embeddingModel || 'gemini-embedding-001' }) : { removed: 0 }; cleanBtn.textContent = '정리 ' + rpt.removed; alert('검색 준비 정리 완료: ' + (rpt.removed || 0) + '개 삭제'); } catch(e) { cleanBtn.textContent = 'X'; alert('정리 실패: ' + e.message); } setTimeout(() => { cleanBtn.textContent = orig; cleanBtn.disabled = false; }, 1500); };
            const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.cssText = B + 'color:#a55;border-color:#633;';
            delBtn.onclick = async () => { if (!confirm('[' + pack.name + '] 삭제? 이 팩의 로어, 검색 준비, 되돌리기 기록도 함께 삭제됩니다.')) return; await deletePackData(pack.name); m.replaceContentPanel(renderPackUI, '파일 관리'); };
            actions.appendChild(renameBtn); actions.appendChild(exportBtn); actions.appendChild(embBtn); actions.appendChild(cleanBtn); actions.appendChild(delBtn); header.appendChild(actions); packDiv.appendChild(header);

            const loreDetails = document.createElement('details');
            loreDetails.style.cssText = 'border-top:1px solid #292929;background:#090909;';
            const loreSummary = document.createElement('summary');
            loreSummary.textContent = '로어 펼쳐보기';
            loreSummary.style.cssText = 'cursor:pointer;padding:8px 12px;font-size:11px;color:#8bc;user-select:none;';
            const loreBody = document.createElement('div');
            loreBody.style.cssText = 'padding:0 10px 10px;';
            loreDetails.appendChild(loreSummary); loreDetails.appendChild(loreBody);
            let loreLoaded = false;
            loreDetails.ontoggle = async () => {
              if (!loreDetails.open || loreLoaded) return;
              loreLoaded = true;
              loreBody.textContent = '로어 불러오는 중...';
              try {
                const entries = await db.entries.where('packName').equals(pack.name).toArray();
                entries.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
                loreBody.innerHTML = '';
                if (!entries.length) { loreBody.textContent = '이 로어팩에 저장된 로어가 없습니다.'; return; }
                for (const entry of entries) {
                  const entryDetails = document.createElement('details');
                  entryDetails.style.cssText = 'margin-top:6px;border:1px solid #282828;border-radius:4px;background:#0d0d0d;';
                  const entrySummary = document.createElement('summary');
                  entrySummary.textContent = '[' + (entry.type || '기타') + '] ' + (entry.name || '이름 없음');
                  entrySummary.style.cssText = 'cursor:pointer;padding:7px 9px;font-size:11px;color:#ccc;font-weight:bold;word-break:break-word;';
                  const entryBody = document.createElement('div');
                  entryBody.style.cssText = 'padding:0 9px 9px;';
                  const editable = { ...entry };
                  delete editable.id; delete editable.packName; delete editable.project; delete editable.enabled;
                  const raw = document.createElement('pre');
                  raw.textContent = JSON.stringify(editable, null, 2);
                  raw.style.cssText = 'max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0;padding:8px;background:#070707;border:1px solid #222;border-radius:4px;color:#aaa;font-size:10px;';
                  const editArea = document.createElement('textarea');
                  editArea.value = JSON.stringify(editable, null, 2);
                  editArea.style.cssText = 'display:none;width:100%;height:260px;box-sizing:border-box;padding:8px;background:#070707;color:#ccc;border:1px solid #346;border-radius:4px;font:10px/1.45 monospace;resize:vertical;';
                  const buttonRow = document.createElement('div'); buttonRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:7px;';
                  const editEntryBtn = document.createElement('button'); editEntryBtn.textContent = '수정'; editEntryBtn.style.cssText = B + 'color:#8bc;border-color:#346;';
                  const cancelEntryBtn = document.createElement('button'); cancelEntryBtn.textContent = '취소'; cancelEntryBtn.style.cssText = B + 'display:none;';
                  const saveEntryBtn = document.createElement('button'); saveEntryBtn.textContent = '저장'; saveEntryBtn.style.cssText = B + 'display:none;color:#4a9;border-color:#264;';
                  const setEditing = (editing) => {
                    raw.style.display = editing ? 'none' : 'block'; editArea.style.display = editing ? 'block' : 'none';
                    editEntryBtn.style.display = editing ? 'none' : ''; cancelEntryBtn.style.display = editing ? '' : 'none'; saveEntryBtn.style.display = editing ? '' : 'none';
                  };
                  editEntryBtn.onclick = () => setEditing(true);
                  cancelEntryBtn.onclick = () => { editArea.value = JSON.stringify(editable, null, 2); setEditing(false); };
                  saveEntryBtn.onclick = async () => {
                    try {
                      const parsed = JSON.parse(editArea.value);
                      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON 객체 하나를 입력해 주세요.');
                      if (!String(parsed.name || '').trim()) throw new Error('로어 이름은 비워둘 수 없습니다.');
                      const updated = { ...entry, ...parsed, id: entry.id, packName: entry.packName, project: entry.project, enabled: entry.enabled !== false, lastUpdated: Date.now() };
                      await db.entries.put(updated);
                      try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(updated.id); else await db.embeddings.where('entryId').equals(updated.id).delete(); } catch (_) {}
                      Object.assign(entry, updated);
                      const nextEditable = { ...updated }; delete nextEditable.id; delete nextEditable.packName; delete nextEditable.project; delete nextEditable.enabled;
                      Object.keys(editable).forEach(key => delete editable[key]); Object.assign(editable, nextEditable);
                      raw.textContent = JSON.stringify(editable, null, 2); editArea.value = raw.textContent; entrySummary.textContent = '[' + (updated.type || '기타') + '] ' + updated.name;
                      setEditing(false);
                      alert('로어를 수정했습니다. 이 로어의 검색 준비는 자동으로 갱신 대상이 됩니다.');
                    } catch (error) { alert('수정 실패: ' + (error.message || String(error))); }
                  };
                  buttonRow.appendChild(editEntryBtn); buttonRow.appendChild(cancelEntryBtn); buttonRow.appendChild(saveEntryBtn);
                  entryBody.appendChild(raw); entryBody.appendChild(editArea); entryBody.appendChild(buttonRow);
                  entryDetails.appendChild(entrySummary); entryDetails.appendChild(entryBody); loreBody.appendChild(entryDetails);
                }
              } catch (error) {
                loreLoaded = false;
                loreBody.textContent = '로어 불러오기 실패: ' + (error.message || String(error));
              }
            };
            packDiv.appendChild(loreDetails); nd.appendChild(packDiv);
          }
        }});
      };
        m.replaceContentPanel(renderPackUI, '로어팩 관리');
    });
  });

  _w.__LoreInj.__subFileLoaded = true;
})();
