// injecter / sub-file - 로어 관리 (파일)
// 역할: JSON 가져오기/내보내기, 팩 활성화/비활성화, 임베딩 생성, 삭제
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
  const UI = C.UI || {};
  const FIELD_STYLE = UI.field || 'width:100%;min-height:34px;border-radius:8px;border:1px solid var(--li-line,#2f3b4f);background:#08111d;color:var(--li-text,#e7edf5);padding:8px 10px;box-sizing:border-box;';
  const BTN_BASE = 'min-height:30px;padding:5px 10px;font-size:11px;border-radius:7px;background:transparent;border:1px solid var(--li-line,#2f3b4f);color:var(--li-text-soft,#a9b6c7);cursor:pointer;font-weight:800;';
  const TONE = {
    muted: 'var(--li-muted,#748196)',
    ok: '#78d5a8',
    warn: '#e7b56f',
    danger: '#ef6b6b'
  };

  function toggleStyle(on, w, h, dot) {
    const dw = dot || Math.max(8, h - 4);
    const leftOn = Math.max(2, w - dw - 2);
    return {
      wrap: 'width:' + w + 'px;height:' + h + 'px;border-radius:' + Math.ceil(h / 2) + 'px;background:' + (on ? 'rgba(120,213,168,.32)' : 'rgba(116,129,150,.22)') + ';border:1px solid ' + (on ? 'rgba(120,213,168,.6)' : 'var(--li-line,#2f3b4f)') + ';position:relative;cursor:pointer;flex-shrink:0;',
      dot: 'width:' + dw + 'px;height:' + dw + 'px;border-radius:50%;background:' + (on ? TONE.ok : TONE.muted) + ';position:absolute;top:2px;left:' + (on ? leftOn : 2) + 'px;transition:left .18s,background .18s;box-shadow:0 1px 3px rgba(0,0,0,.35);'
    };
  }

  const _ls = (_w.__LoreEnv && _w.__LoreEnv.kv) || _w.localStorage;
  const BACKUP_SCHEMA = 'crack-lore-full-backup';
  const BACKUP_VERSION = 1;
  const DB_TABLES = ['packs', 'entries', 'embeddings', 'workingMemory', 'encounters', 'entryVersions', 'snapshots'];
  const LS_KEYS = ['lore-api-cost-log', 'lore-api-cost-cumulative', 'lore-local-migration-version', 'lore-local-migration-status'];
  const SECRET_SETTING_KEYS = ['autoExtKey', 'autoExtVertexJson', 'autoExtFirebaseScript', 'autoExtFirebaseEmbedKey', 'autoExtDeepSeekKey', 'backupServerPassword', 'backupServerToken'];
  const PAGE_SETTING_KEYS = ['urlPacks', 'urlDisabledEntries', 'urlAutoExtPacks', 'urlCooldownMaps', 'urlExtLogs', 'urlInjLogs', 'urlRefinerLogs'];
  const PAGE_LS_KEYS = [];

  function clonePlain(v) {
    return JSON.parse(JSON.stringify(v == null ? null : v));
  }

  function sanitizeSettings(config, includeSecrets) {
    const out = clonePlain(config || {});
    if (!includeSecrets) {
      SECRET_SETTING_KEYS.forEach(k => { if (out[k] !== undefined) out[k] = ''; });
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

  async function exportFullBackup(opts = {}) {
    const includeSecrets = !!opts.includeSecrets;
    const includeLogs = opts.includeLogs !== false;
    const includeEmbeddings = opts.includeEmbeddings !== false;
    const tables = {};
    let embeddingsExpectedCount = 0;
    for (const name of DB_TABLES) {
      try {
        const rows = db[name] ? await db[name].toArray() : [];
        if (name === 'embeddings') {
          embeddingsExpectedCount = rows.length;
          tables[name] = includeEmbeddings ? rows : [];
        } else {
          tables[name] = rows;
        }
      }
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
      embeddingsExcluded: !includeEmbeddings,
      embeddingsExpectedCount,
      settings: sanitizeSettings(settings.config, includeSecrets),
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
    try {
      const es = await db.entries.where('packName').equals(packName).toArray();
      for (const e of es) if (e && e.id != null) await db.embeddings.where('entryId').equals(e.id).delete();
      await db.entries.where('packName').equals(packName).delete();
      await db.packs.delete(packName);
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
      if (count <= 0) await db.packs.delete(p.name);
      else await db.packs.update(p.name, { entryCount: count });
    }

    applyLocalStoragePolicy(data.localStorage, replace, { ...opts, includeSecrets, pageMode: conflictPlan.pageMode });

    settings.load();
    return {
      packs: allPacks.length,
      entries: entries.length,
      embeddings: embeddings.length,
      importedPacks: Array.from(touchedPacks).filter(Boolean),
      embeddingsExcluded: !!data.embeddingsExcluded,
      mode
    };
  }

  function showBackupImportDialog(analysis) {
    return new Promise((resolve) => {
      const plan = clonePlain(analysis.defaultPlan || {});
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(2,6,12,.74);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:min(780px,100%);max-height:min(760px,92vh);overflow:auto;background:linear-gradient(180deg,#101a2a,#0a111d);color:var(--li-text,#e7edf5);border:1px solid var(--li-line,#2f3b4f);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.62);padding:18px;box-sizing:border-box;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
      overlay.appendChild(modal);
      const h = document.createElement('div'); h.textContent = '백업 병합 확인'; h.style.cssText = 'font-size:18px;font-weight:900;color:var(--li-text,#e7edf5);margin-bottom:8px;'; modal.appendChild(h);
      const s = analysis.summary || {};
      const summary = document.createElement('div');
      summary.textContent = `로어팩 ${s.packs || 0}개, 로어 ${s.entries || 0}개, 검색 준비 ${s.embeddings || 0}개. 이름 충돌 로어팩 ${s.packConflicts || 0}개, 같은 이름 로어 ${s.entryConflicts || 0}개.`;
      summary.style.cssText = 'font-size:12px;color:var(--li-text-soft,#a9b6c7);line-height:1.55;margin-bottom:12px;';
      modal.appendChild(summary);

      const makeSection = (title, desc) => {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid var(--li-line,#2f3b4f);border-radius:10px;background:rgba(7,13,23,.78);padding:13px;margin:10px 0;';
        const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'font-size:14px;font-weight:900;color:var(--li-text,#e7edf5);margin-bottom:4px;'; box.appendChild(t);
        if (desc) { const d = document.createElement('div'); d.textContent = desc; d.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);line-height:1.5;margin-bottom:10px;'; box.appendChild(d); }
        modal.appendChild(box);
        return box;
      };
      const makeSelect = (items, value, onChange) => {
        const sel = document.createElement('select');
        sel.style.cssText = FIELD_STYLE + 'font-size:12px;padding:7px 9px;';
        items.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); });
        sel.value = value;
        sel.onchange = () => onChange(sel.value);
        return sel;
      };

      const packBox = makeSection('로어팩 이름 충돌', '같은 이름의 로어팩은 기본적으로 새 이름으로 가져옴. 기존 로어팩을 자동으로 덮어쓰지 않음.');
      if (!analysis.packConflicts || !analysis.packConflicts.length) {
        const none = document.createElement('div'); none.textContent = '겹치는 로어팩 이름 없음.'; none.style.cssText = 'font-size:12px;color:var(--li-muted,#748196);'; packBox.appendChild(none);
      } else {
        analysis.packConflicts.forEach((pc) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,180px);gap:8px;align-items:end;margin-top:8px;';
          if (typeof matchMedia === 'function' && matchMedia('(max-width: 620px)').matches) row.style.gridTemplateColumns = '1fr';
          const nameWrap = document.createElement('div');
          const nl = document.createElement('div'); nl.textContent = pc.name + ` (현재 ${pc.existingCount || 0}개 / 백업 ${pc.incomingCount || 0}개)`; nl.style.cssText = 'font-size:12px;color:var(--li-text-soft,#a9b6c7);margin-bottom:4px;word-break:break-all;'; nameWrap.appendChild(nl);
          const input = document.createElement('input'); input.value = pc.targetName || (pc.name + ' (가져옴)'); input.style.cssText = FIELD_STYLE + 'font-size:12px;padding:7px 9px;';
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
      const g1 = document.createElement('div'); const l1 = document.createElement('div'); l1.textContent = '전역 설정'; l1.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:4px;'; g1.appendChild(l1);
      g1.appendChild(makeSelect([['keep', '현재 설정 유지'], ['backup', '백업 설정 사용']], plan.settingsMode || 'keep', (v) => { plan.settingsMode = v; }));
      const g2 = document.createElement('div'); const l2 = document.createElement('div'); l2.textContent = '채팅별 설정'; l2.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:4px;'; g2.appendChild(l2);
      g2.appendChild(makeSelect([['add_missing', '없는 채팅만 추가'], ['current', '현재 값 유지'], ['backup', '백업 값 사용']], plan.pageMode || 'add_missing', (v) => { plan.pageMode = v; }));
      settingsGrid.appendChild(g1); settingsGrid.appendChild(g2); settingsBox.appendChild(settingsGrid);

      const buttons = document.createElement('div'); buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;';
      const cancel = document.createElement('button'); cancel.textContent = '취소'; cancel.style.cssText = BTN_BASE + 'min-height:34px;padding:8px 14px;';
      const ok = document.createElement('button'); ok.textContent = '가져오기 실행'; ok.style.cssText = BTN_BASE + 'min-height:34px;padding:8px 14px;background:rgba(120,213,168,.18);border-color:rgba(120,213,168,.55);color:' + TONE.ok + ';';
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
      downloadJson,
      safeFileName
    }
  });

  _w.__LoreInj.registerSettingsPage('file', '파일 관리', (m) => {
      const renderPackUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div'); title.textContent = '로어 가져오기'; title.style.cssText = 'font-size:15px;color:var(--li-text,#e7edf5);font-weight:900;margin-bottom:6px;'; nd.appendChild(title);
          const hint = document.createElement('div'); hint.textContent = 'JSON 파일이나 직접 입력으로 로어팩을 추가함. 같은 이름 로어는 갱신됨.'; hint.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);line-height:1.5;margin-bottom:10px;'; nd.appendChild(hint);
          const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;margin-bottom:8px;';
          if (typeof matchMedia === 'function' && matchMedia('(max-width: 620px)').matches) row.style.gridTemplateColumns = '1fr';
          const nameInput = document.createElement('input'); nameInput.placeholder = '로어팩 이름'; nameInput.style.cssText = FIELD_STYLE + 'font-size:12px;'; row.appendChild(nameInput);
          const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json'; fileInput.style.display = 'none';
          const importBtn = document.createElement('button'); importBtn.textContent = 'JSON 파일 선택'; importBtn.style.cssText = BTN_BASE + 'min-height:34px;padding:7px 14px;color:#fff;background:var(--li-accent,#5aa7ff);border-color:transparent;white-space:nowrap;'; importBtn.onclick = () => fileInput.click();
          fileInput.onchange = async (ev) => {
            const file = ev.target.files[0]; if (!file) return;
            const packName = nameInput.value.trim() || file.name.replace('.json', '');
            try {
              const text = await file.text(); const data = JSON.parse(text); const arr = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : [data]); let count = 0;
              for (let e of arr) {
                if (!e || !e.name) continue;
                if (C.normalizeLoreEntry) e = C.normalizeLoreEntry(e, { source: 'imported' });
                if (!e.triggers) e.triggers = [e.name];
                e.packName = packName; e.project = settings.config.activeProject || ''; e.enabled = true;
                e.src = e.src || 'im'; e.source = e.source || 'imported'; e.ts = e.ts || Date.now(); e.lastUpdated = Date.now();
                const existing = await db.entries.where('packName').equals(packName).and(x => x.name === e.name).first();
                if (existing) { await db.entries.update(existing.id, e); try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(existing.id); } catch(_){} }
                else { await db.entries.add(e); count++; }
              }
              const totalCount = await db.entries.where('packName').equals(packName).count(); let pack = await db.packs.get(packName); if (pack) await db.packs.update(packName, { entryCount: totalCount }); else await db.packs.put({ name: packName, entryCount: totalCount, project: settings.config.activeProject || '' });
              await setPackEnabled(packName, true); alert(arr.length + '개 항목 처리 완료 (신규 ' + count + '개)'); m.replaceContentPanel(renderPackUI, '파일 관리');
            } catch (err) { alert('가져오기 실패: ' + err.message); } fileInput.value = '';
          };
          row.appendChild(fileInput); row.appendChild(importBtn); nd.appendChild(row);

          const manualLbl = document.createElement('div'); manualLbl.textContent = '직접 JSON 입력'; manualLbl.style.cssText = 'font-size:12px;color:var(--li-text-soft,#a9b6c7);font-weight:800;margin:12px 0 5px;'; nd.appendChild(manualLbl);
          const manualTa = document.createElement('textarea'); manualTa.placeholder = '[{"name":"이름","triggers":["키워드"],"type":"character","summary":"설명","detail":{}}]'; manualTa.style.cssText = FIELD_STYLE + 'height:112px;font-size:12px;font-family:monospace;resize:vertical;'; nd.appendChild(manualTa);
          const manualBtnRow = document.createElement('div'); manualBtnRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
          const manualBtn = document.createElement('button'); manualBtn.textContent = '입력 내용 추가'; manualBtn.style.cssText = BTN_BASE + 'min-height:34px;padding:7px 14px;background:rgba(120,213,168,.18);border-color:rgba(120,213,168,.55);color:' + TONE.ok + ';';
          manualBtn.onclick = async () => {
            const pn = nameInput.value.trim() || '수동추가';
            try {
              const txt = manualTa.value.trim(); if (!txt) { alert('JSON을 입력할 것.'); return; }
              const data = JSON.parse(txt); const arr = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : [data]); let cnt = 0;
              for (let e of arr) {
                if (!e || !e.name) continue;
                if (C.normalizeLoreEntry) e = C.normalizeLoreEntry(e, { source: 'imported' });
                if (!e.triggers) e.triggers = [e.name];
                e.packName = pn; e.project = settings.config.activeProject || ''; e.enabled = true;
                e.src = e.src || 'im'; e.source = e.source || 'imported'; e.ts = e.ts || Date.now(); e.lastUpdated = Date.now();
                const ex = await db.entries.where('packName').equals(pn).and(x => x.name === e.name).first();
                if (ex) { await db.entries.update(ex.id, e); try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(ex.id); } catch(_){} }
                else { await db.entries.add(e); cnt++; }
              }
              const tc = await db.entries.where('packName').equals(pn).count(); let pk = await db.packs.get(pn); if (pk) await db.packs.update(pn, { entryCount: tc }); else await db.packs.put({ name: pn, entryCount: tc, project: settings.config.activeProject || '' });
              await setPackEnabled(pn, true); alert(arr.length + '개 처리 (신규 ' + cnt + '개)'); manualTa.value = ''; m.replaceContentPanel(renderPackUI, '파일 관리');
            } catch (err) { alert('JSON 파싱 실패: ' + err.message); }
          };
          manualBtnRow.appendChild(manualBtn); nd.appendChild(manualBtnRow);
        }});

        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const rawPacks = await db.packs.toArray();
          const packs = [];
          for (const p of rawPacks) {
            const count = await db.entries.where('packName').equals(p.name).count();
            if (count <= 0) {
              await db.packs.delete(p.name);
              continue;
            }
            if ((p.entryCount || 0) !== count) await db.packs.update(p.name, { entryCount: count });
            packs.push({ ...p, entryCount: count });
          }
          if (!packs.length) { const empty = document.createElement('div'); empty.textContent = '등록된 팩이 없습니다.'; empty.style.cssText = 'color:var(--li-muted,#748196);text-align:center;padding:24px;font-size:12px;border:1px dashed var(--li-line,#2f3b4f);border-radius:10px;background:rgba(7,13,23,.42);'; nd.appendChild(empty); return; }
          const curUrl = C.getCurUrl(); const enabledPacks = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(curUrl) : (settings.config.urlPacks?.[curUrl] || []);
          for (const pack of packs) {
            const packDiv = document.createElement('div'); packDiv.style.cssText = 'margin-bottom:8px;border:1px solid var(--li-line,#2f3b4f);border-radius:10px;overflow:hidden;background:rgba(7,13,23,.68);';
            const header = document.createElement('div'); header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:11px 12px;gap:10px;';
            const leftSide = document.createElement('div'); leftSide.style.cssText = 'display:flex;align-items:center;gap:9px;flex:1;min-width:0;';
            const isEnabled = enabledPacks.includes(pack.name);
            const swWrap = document.createElement('div'); swWrap.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer;background:rgba(255,255,255,.035);padding:4px 8px;border-radius:999px;border:1px solid var(--li-line,#2f3b4f);flex-shrink:0;';
            const swLabel = document.createElement('span'); swLabel.textContent = isEnabled ? 'ON' : 'OFF'; swLabel.style.cssText = 'font-size:10px;font-weight:900;width:22px;text-align:center;color:' + (isEnabled ? TONE.ok : TONE.muted) + ';';
            const initialToggle = toggleStyle(isEnabled, 28, 14, 10);
            const sw = document.createElement('div'); sw.style.cssText = initialToggle.wrap;
            const dot = document.createElement('div'); dot.style.cssText = initialToggle.dot;
            sw.appendChild(dot); swWrap.appendChild(swLabel); swWrap.appendChild(sw);
            swWrap.onclick = async () => { const curEnabled = ((_w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : (settings.config.urlPacks?.[C.getCurUrl()] || []))).includes(pack.name); await setPackEnabled(pack.name, !curEnabled); const nowEnabled = ((_w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : (settings.config.urlPacks?.[C.getCurUrl()] || []))).includes(pack.name); const st = toggleStyle(nowEnabled, 28, 14, 10); swLabel.textContent = nowEnabled ? 'ON' : 'OFF'; swLabel.style.color = nowEnabled ? TONE.ok : TONE.muted; sw.style.cssText = st.wrap; dot.style.cssText = st.dot; };
            leftSide.appendChild(swWrap);
            const nameEl = document.createElement('span'); nameEl.textContent = pack.name + ' (' + (pack.entryCount || 0) + '개)'; nameEl.style.cssText = 'font-size:13px;color:var(--li-text,#e7edf5);font-weight:900;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; leftSide.appendChild(nameEl);
            header.appendChild(leftSide);
            const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;';
            const B = BTN_BASE;
            const exportBtn = document.createElement('button'); exportBtn.textContent = '내보내기'; exportBtn.style.cssText = B;
            exportBtn.onclick = async () => { const entries = await db.entries.where('packName').equals(pack.name).toArray(); if (!entries.length) { alert('항목 없음.'); return; } const clean = entries.map(({ id, packName, project, enabled, ...rest }) => rest); const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = pack.name + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
            const embBtn = document.createElement('button'); embBtn.textContent = '임베딩'; embBtn.style.cssText = B + 'color:' + TONE.ok + ';border-color:rgba(120,213,168,.45);'; embBtn.onclick = async () => { const miss = _w.__LoreInj.getApiMissingReason ? _w.__LoreInj.getApiMissingReason(settings.config, 'embed') : ''; if (miss) { alert(miss || 'API 설정 필요.'); return; } if (!confirm('[' + pack.name + '] 임베딩 생성?')) return; embBtn.disabled = true; const orig = embBtn.textContent; try { const apiOpts = _w.__LoreInj.buildEmbeddingApiOpts ? _w.__LoreInj.buildEmbeddingApiOpts({ model: settings.config.embeddingModel || 'gemini-embedding-001' }, { feature: 'embed', chatKey: 'global' }) : { apiType: settings.config.autoExtApiType === 'deepseek' ? 'key' : (settings.config.autoExtApiType || 'key'), key: settings.config.autoExtApiType === 'deepseek' ? settings.config.autoExtFirebaseEmbedKey : settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }; const cnt = await C.embedPack(pack.name, apiOpts, (done, total) => { embBtn.textContent = done + '/' + total; }); embBtn.textContent = 'OK' + cnt; setTimeout(() => { embBtn.textContent = orig; embBtn.disabled = false; }, 2000); } catch (e) { embBtn.textContent = 'X'; embBtn.disabled = false; alert('실패:' + e.message); } };
            const cleanBtn = document.createElement('button'); cleanBtn.textContent = '검색 준비 정리'; cleanBtn.title = 'API 호출 없이 오래된 검색 준비 데이터를 정리함'; cleanBtn.style.cssText = B + 'color:' + TONE.warn + ';border-color:rgba(231,181,111,.45);';
            cleanBtn.onclick = async () => { cleanBtn.disabled = true; const orig = cleanBtn.textContent; cleanBtn.textContent = '...'; try { const rpt = C.cleanupStaleEmbeddings ? await C.cleanupStaleEmbeddings(pack.name, { model: settings.config.embeddingModel || 'gemini-embedding-001' }) : { removed: 0 }; cleanBtn.textContent = '정리 ' + rpt.removed; alert('오래된 검색 준비 데이터 정리 완료: ' + (rpt.removed || 0) + '개'); } catch(e) { cleanBtn.textContent = 'X'; alert('정리 실패: ' + e.message); } setTimeout(() => { cleanBtn.textContent = orig; cleanBtn.disabled = false; }, 1500); };
            const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.cssText = B + 'color:' + TONE.danger + ';border-color:rgba(239,107,107,.45);';
            delBtn.onclick = async () => { if (!confirm('[' + pack.name + '] 삭제?')) return; const es = await db.entries.where('packName').equals(pack.name).toArray(); for (const e of es) await db.embeddings.where('entryId').equals(e.id).delete(); await db.entries.where('packName').equals(pack.name).delete(); await db.packs.delete(pack.name); m.replaceContentPanel(renderPackUI, '파일 관리'); };
            actions.appendChild(exportBtn); actions.appendChild(embBtn); actions.appendChild(cleanBtn); actions.appendChild(delBtn); header.appendChild(actions); packDiv.appendChild(header); nd.appendChild(packDiv);
          }
        }});
      };
      m.replaceContentPanel(renderPackUI, '파일 관리');
  });

  _w.__LoreInj.__subFileLoaded = true;
})();
