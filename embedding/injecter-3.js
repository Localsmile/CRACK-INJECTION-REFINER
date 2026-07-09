// == 인젝터 모듈 3/6 — settings + 유틸 ==
// defaultSettings, settings 객체, R.init, 턴/쿨다운/팩/로그 유틸, 스냅샷
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // deps 대기 (const module)
  const deadline = Date.now() + 10000;
  while (!(_w.__LoreInj && _w.__LoreInj.__constLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__constLoaded)) { console.error('[LoreInj:3] const 미로드'); return; }
  if (_w.__LoreInj.__settingsLoaded) return;

  // 중복 가드 (첫 gatekeeper)
  if (_w.__loreInjectorVersion) {
    try { CrackToast.warning('로어 인젝터: ' + _w.__loreInjectorVersion + ' 실행중. 중복방지로 비활성화.'); } catch(e) {}
    return;
  }
  _w.__loreInjectorVersion = 'v' + _w.__LoreInj.VER;

  const C = _w.__LoreCore;
  const R = _w.__LoreRefiner;
  if (!C) { console.error('[Lore] Core 미감지. 작동 불가.'); return; }
  console.log('[Lore] Core v' + C.VER + ' 연결 성공. Injector v' + _w.__LoreInj.VER);

  const {
    OOC_FORMAT_VERSION,
    OOC_FORMATS,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
    DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB,
    DEFAULT_AUTO_EXTRACT_SCHEMA,
    DEFAULT_AUTO_EXTRACT_PATCH_SCHEMA,
    DEFAULT_TEMPORAL_EXTRACT_PROMPT,
    DEFAULT_DEEPSEEK_TEMPORAL_EXTRACT_PROMPT,
    DEFAULT_TEMPORAL_EXTRACT_SCHEMA,
    DEFAULT_DEEPSEEK_IMPORT_PROMPT,
    DEFAULT_IMPORT_PROMPT,
    DEFAULT_IMPORT_SCHEMA,
    DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT,
    DEFAULT_TEMPORAL_RECALL_JUDGE_SCHEMA,
    AUTO_EXTRACT_PROMPT_VERSION,
    LEGACY_AUTO_EXTRACT_PROMPTS_WITH_DB
  } = _w.__LoreInj;

  const db = C.getDB();
  const _ls = _w.localStorage;
  const HISTORY_COMPRESSION_MIGRATION_KEY = 'lore-history-compression-v1';
  const ACTIVE_PACKS_STORAGE_KEY = 'lore-active-packs-v1';
  const MAX_SNAPSHOTS_PER_PACK = 3;
  const ORPHAN_STORAGE_CLEANUP_KEY = 'lore-orphan-storage-cleanup-v1';
  const EMBEDDING_MODEL_CLEANUP_KEY = 'lore-embedding-model-cleanup-v1';

  function isChatRoute() {
    const fn = _w.__LoreInj && _w.__LoreInj.isChatPath;
    if (typeof fn === 'function') {
      try { return !!fn(); } catch (_) {}
    }
    return /\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname)
      || /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname)
      || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname);
  }

  function runWhenChatRouteLocal(init) {
    if (isChatRoute()) return init();
    let last = location.href;
    let started = false;
    const tick = () => {
      if (last === location.href) return;
      last = location.href;
      if (started || !isChatRoute()) return;
      started = true;
      init();
    };
    try { new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
    try { window.addEventListener('popstate', tick); } catch (_) {}
    try { window.addEventListener('hashchange', tick); } catch (_) {}
  }

  let _heavyRuntimeInitDone = false;
  let _heavyRuntimeInitPromise = null;
  async function ensureHeavyRuntimeInit(reason = '') {
    if (_heavyRuntimeInitDone) return true;
    if (_heavyRuntimeInitPromise) return _heavyRuntimeInitPromise;
    _heavyRuntimeInitPromise = (async () => {
      await runLocalMigration();
      scheduleLegacyHistoryCompression();
      if (R && !R.__loreInjectorRuntimeInitDone) {
        R.init(
          C,
          () => settings.config,
          (url, logItem) => {
            if (!settings.config.urlRefinerLogs) settings.config.urlRefinerLogs = {};
            const chatKey = getChatKey();
            let logs = settings.config.urlRefinerLogs[chatKey] || [];
            logItem._id = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
            logs.unshift(logItem);
            if (logs.length > 50) logs.length = 50;
            settings.config.urlRefinerLogs[chatKey] = logs;
            settings.save();
          },
          (msg, color) => { if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show(msg, { duration: 3000, background: color }); },
          (url) => getActivePacksForUrl(url)
        );
        R.__loreInjectorRuntimeInitDone = true;
      }
      _heavyRuntimeInitDone = true;
      _w.__LoreInj.__settingsHeavyDeferred = false;
      _w.__LoreInj.__heavyRuntimeLoaded = true;
      console.log('[LoreInj:3] heavy runtime initialized', reason || 'chat');
      return true;
    })().catch(e => {
      console.warn('[LoreInj:3] heavy runtime init 실패:', e);
      throw e;
    }).finally(() => { _heavyRuntimeInitPromise = null; });
    return _heavyRuntimeInitPromise;
  }

  function defaultRefinerTopics() {
    const out = {};
    if (R && R.TOPICS) Object.keys(R.TOPICS).forEach(k => out[k] = true);
    return out;
  }

  function defaultRefinerPrompt() {
    const topics = defaultRefinerTopics();
    if (R && R.buildDynamicPrompt && Object.keys(topics).length) return R.buildDynamicPrompt(topics);
    return R ? R.DEFAULT_PROMPT : '';
  }

  function cloneJsonSafe(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function pruneLogMapForStorage(map, maxKeys, maxItems) {
    if (!map || typeof map !== 'object') return map || {};
    const out = {};
    const keys = Object.keys(map).slice(-Math.max(1, maxKeys || 20));
    for (const key of keys) {
      const arr = Array.isArray(map[key]) ? map[key] : [];
      out[key] = arr.slice(-Math.max(0, maxItems || 20));
    }
    return out;
  }

  function pruneConfigForStorage(config, hard = false) {
    const cfg = cloneJsonSafe(config || {});
    const softKeys = hard ? 12 : 30;
    cfg.urlExtLogs = pruneLogMapForStorage(cfg.urlExtLogs, softKeys, hard ? 8 : 20);
    cfg.urlInjLogs = pruneLogMapForStorage(cfg.urlInjLogs, softKeys, hard ? 20 : 60);
    cfg.urlRefinerLogs = pruneLogMapForStorage(cfg.urlRefinerLogs, softKeys, hard ? 8 : 20);
    return cfg;
  }

  function persistStorageIfPossible() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (_) {}
  }

  function getApiConfigSnapshot(config) {
    const keys = [
      'autoExtApiType', 'autoExtKey', 'autoExtVertexJson', 'autoExtVertexLocation', 'autoExtVertexProjectId',
      'autoExtFirebaseScript', 'autoExtFirebaseEmbedKey', 'autoExtGeminiEmbedKey', 'autoExtDeepSeekKey', 'autoExtDeepSeekThinking',
      'autoExtDeepSeekReasoning', 'autoExtOpenAIBaseUrl', 'autoExtOpenAIKey', 'autoExtOpenAIReasoning',
      'batchExtOpenAIReasoning', 'temporalExtractOpenAIReasoning', 'importOpenAIReasoning',
      'mergeOpenAIReasoning', 'rerankOpenAIReasoning', 'temporalRecallJudgeOpenAIReasoning', 'refinerOpenAIReasoning',
      'batchExtDeepSeekReasoning', 'temporalExtractDeepSeekReasoning', 'importDeepSeekReasoning',
      'mergeDeepSeekReasoning', 'rerankDeepSeekReasoning', 'temporalRecallJudgeDeepSeekReasoning', 'refinerDeepSeekReasoning',
      'deepSeekPromptOverridesEnabled', 'deepSeekJsonSystemPrompt',
      'autoExtModel', 'autoExtCustomModel',
      'autoExtReasoning', 'autoExtBudget', 'batchExtReasoning', 'batchExtBudget',
      'temporalExtractReasoning', 'temporalExtractBudget', 'importReasoning', 'importBudget',
      'mergeReasoning', 'mergeBudget', 'embeddingModel', 'rerankModel', 'rerankCustomModel',
      'rerankReasoning', 'rerankBudget', 'refinerModel', 'refinerCustomModel', 'refinerReasoning', 'refinerBudget',
      'temporalRecallJudgeModel', 'temporalRecallJudgeCustomModel', 'temporalRecallJudgeReasoning', 'temporalRecallJudgeBudget'
    ];
    const out = {};
    keys.forEach(k => { if (config && config[k] !== undefined) out[k] = config[k]; });
    return out;
  }

  function getDurableStateSnapshot(config) {
    const keys = [
      'urlPacks', 'urlDisabledEntries', 'urlAutoExtPacks', 'urlCooldownMaps',
      'urlExtLogs', 'urlInjLogs', 'urlRefinerLogs', 'urlTurnCounters',
      'autoPacks', 'templates', 'activeTemplateId',
      'temporalExtractPrompt', 'temporalExtractSchema', 'importPrompt', 'importSchema',
      'temporalRecallJudgePrompt', 'temporalRecallJudgeSchema',
      'refinerCustomPrompt', 'refinerUseDynamic', 'refinerTopics', 'refinerPromptVersion',
      'prefix', 'suffix', 'oocFormat', 'oocPromptVersion',
      'autoExtractPromptVersion', 'migrationStatus', 'localMigrationVersion'
    ];
    const out = {};
    keys.forEach(k => { if (config && config[k] !== undefined) out[k] = JSON.parse(JSON.stringify(config[k])); });
    return out;
  }

  function backupSettings(reason = 'manual') {
    try {
      const backups = JSON.parse(_ls.getItem('lore-injector-v5-backups') || '[]');
      const row = { ts: Date.now(), reason, config: JSON.parse(JSON.stringify(settings.config || {})) };
      backups.unshift(row);
      if (backups.length > 3) backups.length = 3;
      _ls.setItem('lore-injector-v5-backups', JSON.stringify(backups));
      return true;
    } catch (e) {
      console.warn('[LoreInj:settings] backup failed:', e);
      return false;
    }
  }

  function getSettingsStorageHealth() {
    const key = 'lore-injector-storage-test';
    const health = {
      ok: false,
      configBytes: 0,
      lastSaveOk: settings ? settings._lastSaveOk !== false : true,
      lastSaveError: settings ? settings._lastSaveError || '' : '',
      lastErrorRecord: null
    };
    try {
      const raw = JSON.stringify(settings.config || {});
      health.configBytes = raw.length;
      _ls.setItem(key, '1');
      health.ok = _ls.getItem(key) === '1';
      _ls.removeItem(key);
    } catch (e) {
      health.ok = false;
      health.lastSaveError = e && e.message ? e.message : String(e);
    }
    try {
      const savedErr = _ls.getItem('lore-injector-last-save-error');
      health.lastErrorRecord = savedErr ? JSON.parse(savedErr) : null;
    } catch (_) {}
    return health;
  }

  function applyPresetKeepState(presetConfig) {
    backupSettings('before-preset');
    const api = getApiConfigSnapshot(settings.config);
    const durable = getDurableStateSnapshot(settings.config);
    settings.config = JSON.parse(JSON.stringify(defaultSettings));
    Object.assign(settings.config, durable, api, presetConfig || {});
    settings.save();
  }

  function resetSettingsKeepApi() {
    backupSettings('before-reset');
    const api = getApiConfigSnapshot(settings.config);
    const preserved = getDurableStateSnapshot(settings.config);
    settings.config = JSON.parse(JSON.stringify(defaultSettings));
    Object.assign(settings.config, api, preserved);
    settings.save();
  }

  function parseJsonLoose(text) {
    if (!text) return null;
    let t = String(text).trim();
    const tryParse = (s) => {
      if (!s) return null;
      try { return JSON.parse(String(s).trim()); } catch (_) { return null; }
    };
    const stripFence = (s) => String(s || '')
      .trim()
      .replace(/^\uFEFF/, '')
      .replace(/^```(?:json|javascript|js)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const fenced = t.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
    const candidates = [t, stripFence(t)];
    if (fenced && fenced[1]) candidates.push(stripFence(fenced[1]));
    for (const c of candidates) {
      const parsed = tryParse(c);
      if (parsed !== null) return parsed;
    }
    function extractBalanced(s, start) {
      const open = s[start];
      const close = open === '[' ? ']' : '}';
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) return s.slice(start, i + 1);
        }
      }
      return null;
    }
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== '[' && t[i] !== '{') continue;
      const seg = extractBalanced(t, i);
      const parsed = tryParse(seg);
      if (parsed !== null) return parsed;
    }
    const firstBracket = t.search(/[\[{]/);
    if (firstBracket >= 0) {
      const open = t[firstBracket];
      const close = open === '[' ? ']' : '}';
      const lastClose = t.lastIndexOf(close);
      if (lastClose > firstBracket) {
        const parsed = tryParse(t.slice(firstBracket, lastClose + 1));
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }

  async function createSnapshot(packName, label, type = 'auto') {
    const entries = await db.entries.where('packName').equals(packName).toArray();
    const clean = entries.map(({ id, ...rest }) => rest);
    const packed = typeof C.packJsonForStorage === 'function'
      ? await C.packJsonForStorage(clean)
      : { value: clean, encoding: '', gzip: '' };
    await db.snapshots.add({
      packName,
      timestamp: Date.now(),
      label: label || '자동 저장',
      type,
      data: packed.value,
      dataGzip: packed.gzip || '',
      dataEncoding: packed.encoding || '',
      itemCount: clean.length
    });
    const all = await db.snapshots.where('packName').equals(packName).sortBy('timestamp');
    if (all.length > MAX_SNAPSHOTS_PER_PACK) await db.snapshots.bulkDelete(all.slice(0, all.length - MAX_SNAPSHOTS_PER_PACK).map(s => s.id));
  }

  async function restoreSnapshot(snapshotId) {
    const snap = await db.snapshots.get(snapshotId);
    if (!snap) return false;
    const snapshotData = (snap.dataGzip && typeof C.unpackJsonFromStorage === 'function')
      ? await C.unpackJsonFromStorage(snap, 'data', 'dataGzip', 'dataEncoding')
      : snap.data;
    if (!Array.isArray(snapshotData)) throw new Error('스냅샷 데이터가 손상됨');
    const previousEntries = await db.entries.where('packName').equals(snap.packName).toArray();
    const previousIds = previousEntries.map(entry => entry && entry.id).filter(id => id != null);
    const tables = [db.packs, db.entries];
    if (db.embeddings) tables.push(db.embeddings);
    if (db.entryVersions) tables.push(db.entryVersions);
    await db.transaction('rw', ...tables, async () => {
      if (previousIds.length && db.embeddings) await db.embeddings.where('entryId').anyOf(previousIds).delete();
      if (previousIds.length && db.entryVersions) await db.entryVersions.where('entryId').anyOf(previousIds).delete();
      await db.entries.where('packName').equals(snap.packName).delete();
      for (const e of snapshotData) await db.entries.add(e);
      await db.packs.update(snap.packName, { entryCount: snapshotData.length });
    });
    // Phase 12: 복원된 데이터가 구버전 스키마(예: imp/emo/sur 미세팅, recallTriggers 누락)일 수 있으므로 로컬 마이그레이션을 강제 재실행한다.
    try {
      _ls.removeItem('lore-local-migration-version');
      if (settings && settings.config) { settings.config.localMigrationVersion = ''; settings.save(); }
      await runLocalMigration();
    } catch (e) { console.warn('[LoreInj:3] restore 후 마이그레이션 재실행 실패:', e); }
    return true;
  }

  function removeDeletedPackReferences(packName, entryIds = []) {
    if (!packName || !settings || !settings.config) return;
    const config = settings.config;
    const removedIds = new Set(entryIds.map(String));
    let settingsChanged = false;
    const packMap = config.urlPacks || {};
    for (const key of Object.keys(packMap)) {
      const current = Array.isArray(packMap[key]) ? packMap[key] : [];
      const next = current.filter(name => name !== packName);
      if (next.length !== current.length) { packMap[key] = next; settingsChanged = true; }
    }
    const disabledMap = config.urlDisabledEntries || {};
    if (removedIds.size) {
      for (const key of Object.keys(disabledMap)) {
        const current = Array.isArray(disabledMap[key]) ? disabledMap[key] : [];
        const next = current.filter(id => !removedIds.has(String(id)));
        if (next.length !== current.length) { disabledMap[key] = next; settingsChanged = true; }
      }
    }
    if (settingsChanged) settings.save();

    const activeMap = readActivePackMap();
    let activeChanged = false;
    for (const key of Object.keys(activeMap)) {
      const current = Array.isArray(activeMap[key]) ? activeMap[key] : [];
      const next = current.filter(name => name !== packName);
      if (next.length !== current.length) { activeMap[key] = next; activeChanged = true; }
    }
    if (activeChanged) saveActivePackMap(activeMap);
  }

  async function deletePackData(packName) {
    if (!packName) return { deleted: false, entries: 0 };
    const entries = await db.entries.where('packName').equals(packName).toArray();
    const entryIds = entries.map(entry => entry && entry.id).filter(id => id != null);
    const tables = [db.packs, db.entries];
    if (db.embeddings) tables.push(db.embeddings);
    if (db.entryVersions) tables.push(db.entryVersions);
    if (db.snapshots) tables.push(db.snapshots);
    await db.transaction('rw', ...tables, async () => {
      if (entryIds.length && db.embeddings) await db.embeddings.where('entryId').anyOf(entryIds).delete();
      if (entryIds.length && db.entryVersions) await db.entryVersions.where('entryId').anyOf(entryIds).delete();
      if (db.snapshots) await db.snapshots.where('packName').equals(packName).delete();
      await db.entries.where('packName').equals(packName).delete();
      await db.packs.delete(packName);
    });
    removeDeletedPackReferences(packName, entryIds);
    return { deleted: true, entries: entryIds.length };
  }

  async function deleteEntryData(entryId) {
    const entry = await db.entries.get(entryId);
    if (!entry) return { deleted: false, packDeleted: false, remaining: 0 };
    const packName = entry.packName;
    const tables = [db.packs, db.entries];
    if (db.embeddings) tables.push(db.embeddings);
    if (db.entryVersions) tables.push(db.entryVersions);
    if (db.snapshots) tables.push(db.snapshots);
    let remaining = 0;
    await db.transaction('rw', ...tables, async () => {
      if (db.embeddings) await db.embeddings.where('entryId').equals(entryId).delete();
      if (db.entryVersions) await db.entryVersions.where('entryId').equals(entryId).delete();
      await db.entries.delete(entryId);
      remaining = await db.entries.where('packName').equals(packName).count();
      if (remaining <= 0) {
        if (db.snapshots) await db.snapshots.where('packName').equals(packName).delete();
        await db.packs.delete(packName);
      } else {
        await db.packs.update(packName, { entryCount: remaining });
      }
    });
    if (remaining <= 0) removeDeletedPackReferences(packName, [entryId]);
    return { deleted: true, packDeleted: remaining <= 0, remaining };
  }

  async function cleanupUnusedLoreStorage(opts = {}) {
    const trimSnapshots = opts.trimSnapshots === true;
    const compressHistory = opts.compressHistory === true;
    const maxSnapshots = Math.max(1, Number(opts.maxSnapshotsPerPack || MAX_SNAPSHOTS_PER_PACK) || MAX_SNAPSHOTS_PER_PACK);
    const entries = await db.entries.toArray();
    const packs = await db.packs.toArray();
    const entryIds = new Set(entries.map(entry => String(entry.id)));
    const entryPackNames = new Set(entries.map(entry => entry.packName).filter(Boolean));
    const emptyPackNames = packs.filter(pack => pack && !entryPackNames.has(pack.name)).map(pack => pack.name);
    const embeddings = db.embeddings ? await db.embeddings.toArray() : [];
    const entryVersions = db.entryVersions ? await db.entryVersions.toArray() : [];
    const snapshots = db.snapshots ? await db.snapshots.toArray() : [];
    const orphanEmbeddingIds = embeddings.filter(row => !entryIds.has(String(row.entryId))).map(row => row.id);
    const orphanVersionIds = entryVersions.filter(row => !entryIds.has(String(row.entryId))).map(row => row.id);
    const orphanSnapshotIds = snapshots.filter(row => !entryPackNames.has(row.packName)).map(row => row.id);
    const snapshotsToTrim = [];
    if (trimSnapshots) {
      const byPack = new Map();
      for (const snapshot of snapshots) {
        if (!snapshot || orphanSnapshotIds.includes(snapshot.id)) continue;
        const rows = byPack.get(snapshot.packName) || [];
        rows.push(snapshot);
        byPack.set(snapshot.packName, rows);
      }
      for (const rows of byPack.values()) {
        rows.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
        if (rows.length > maxSnapshots) snapshotsToTrim.push(...rows.slice(0, rows.length - maxSnapshots).map(row => row.id));
      }
    }
    const tables = [db.packs];
    if (db.embeddings) tables.push(db.embeddings);
    if (db.entryVersions) tables.push(db.entryVersions);
    if (db.snapshots) tables.push(db.snapshots);
    await db.transaction('rw', ...tables, async () => {
      if (orphanEmbeddingIds.length && db.embeddings) await db.embeddings.bulkDelete(orphanEmbeddingIds);
      if (orphanVersionIds.length && db.entryVersions) await db.entryVersions.bulkDelete(orphanVersionIds);
      if (db.snapshots) {
        const snapshotIds = orphanSnapshotIds.concat(snapshotsToTrim);
        if (snapshotIds.length) await db.snapshots.bulkDelete(snapshotIds);
      }
      if (emptyPackNames.length) await db.packs.bulkDelete(emptyPackNames);
    });
    let snapshotsCompressed = 0;
    let entryVersionsCompressed = 0;
    if (compressHistory && typeof C.packJsonForStorage === 'function') {
      const removedSnapshotIds = new Set(orphanSnapshotIds.concat(snapshotsToTrim));
      const removedVersionIds = new Set(orphanVersionIds);
      for (const row of snapshots) {
        if (!row || removedSnapshotIds.has(row.id) || row.dataGzip || !Array.isArray(row.data)) continue;
        try {
          const packed = await C.packJsonForStorage(row.data);
          if (packed.encoding === 'gzip') {
            await db.snapshots.update(row.id, { data: null, dataGzip: packed.gzip, dataEncoding: packed.encoding, itemCount: row.data.length });
            snapshotsCompressed++;
          }
        } catch (e) { console.warn('[LoreInj:3] snapshot compression skipped:', e && e.message ? e.message : e); }
      }
      for (const row of entryVersions) {
        if (!row || removedVersionIds.has(row.id) || row.snapshotGzip || !row.snapshot || typeof row.snapshot !== 'object') continue;
        try {
          const packed = await C.packJsonForStorage(row.snapshot);
          if (packed.encoding === 'gzip') {
            await db.entryVersions.update(row.id, { snapshot: null, snapshotGzip: packed.gzip, snapshotEncoding: packed.encoding });
            entryVersionsCompressed++;
          }
        } catch (e) { console.warn('[LoreInj:3] entry version compression skipped:', e && e.message ? e.message : e); }
      }
    }
    for (const packName of emptyPackNames) removeDeletedPackReferences(packName);
    return {
      orphanEmbeddingsRemoved: orphanEmbeddingIds.length,
      orphanEntryVersionsRemoved: orphanVersionIds.length,
      orphanSnapshotsRemoved: orphanSnapshotIds.length,
      snapshotsTrimmed: snapshotsToTrim.length,
      emptyPacksRemoved: emptyPackNames.length,
      snapshotsCompressed,
      entryVersionsCompressed
    };
  }

  async function cleanupOrphanedLoreStorageOnce() {
    if (_ls.getItem(ORPHAN_STORAGE_CLEANUP_KEY) === 'done') return null;
    const needsCompression = _ls.getItem(HISTORY_COMPRESSION_MIGRATION_KEY) !== 'done';
    const report = await cleanupUnusedLoreStorage({ compressHistory: needsCompression });
    _ls.setItem(ORPHAN_STORAGE_CLEANUP_KEY, 'done');
    if (needsCompression) _ls.setItem(HISTORY_COMPRESSION_MIGRATION_KEY, 'done');
    return report;
  }

  let _historyCompressionScheduled = false;
  function scheduleLegacyHistoryCompression() {
    if (_historyCompressionScheduled || _ls.getItem(HISTORY_COMPRESSION_MIGRATION_KEY) === 'done') return;
    _historyCompressionScheduled = true;
    const run = async () => {
      try {
        const report = await cleanupUnusedLoreStorage({ compressHistory: true });
        _ls.setItem(HISTORY_COMPRESSION_MIGRATION_KEY, 'done');
        const count = (report.snapshotsCompressed || 0) + (report.entryVersionsCompressed || 0);
        if (count) console.info('[LoreInj:3] 기존 로컬 이력 압축 완료:', count);
      } catch (e) {
        _historyCompressionScheduled = false;
        console.warn('[LoreInj:3] 기존 로컬 이력 압축 보류:', e && e.message ? e.message : e);
      }
    };
    if (typeof _w.requestIdleCallback === 'function') _w.requestIdleCallback(run, { timeout: 12000 });
    else setTimeout(run, 5000);
  }

  async function cleanupEmbeddingsForSelectedModel() {
    const model = settings.config.embeddingModel || C.DEFAULTS.embeddingModel;
    if (_ls.getItem(EMBEDDING_MODEL_CLEANUP_KEY) === model) return 0;
    if (!C.cleanupStaleEmbeddings) return 0;
    const report = await C.cleanupStaleEmbeddings(null, { model });
    _ls.setItem(EMBEDDING_MODEL_CLEANUP_KEY, model);
    return report.removed || 0;
  }

  // Phase 12: legacy 'event' / 'scene' 엔트리를 timeline_event 스키마로 변환하는 옵트인 헬퍼.
  // UI 트리거는 별도 phase에서 결정. 호출 측에서만 명시적으로 사용해야 하며 자동 변환은 하지 않는다.
  function convertLegacyEventToTimeline(entry, opts = {}) {
    if (!entry || typeof entry !== 'object') return entry;
    const _t = String(entry.type || '').toLowerCase();
    if (_t !== 'event' && _t !== 'scene') return entry;
    const _clamp10 = (v, fb) => { const n = Number(v); if (!Number.isFinite(n)) return fb; return Math.max(1, Math.min(10, Math.round(n))); };
    const out = JSON.parse(JSON.stringify(entry));
    out.type = C.TIMELINE_EVENT_TYPE || 'timeline_event';
    out.legacyOrigType = entry.type;
    out.title = out.title || out.name;
    const _entSrc = Array.isArray(entry.entities) && entry.entities.length ? entry.entities
                  : Array.isArray(entry.parties) ? entry.parties
                  : (entry.detail && Array.isArray(entry.detail.parties) ? entry.detail.parties : []);
    out.participants = Array.isArray(entry.participants) && entry.participants.length ? entry.participants : Array.from(new Set(_entSrc));
    out.hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
    out.recallTriggers = Array.isArray(entry.recallTriggers) && entry.recallTriggers.length
      ? entry.recallTriggers
      : Array.from(new Set([...(Array.isArray(entry.triggers) ? entry.triggers : []), ...(Array.isArray(entry.hooks) ? entry.hooks : [])].filter(Boolean)));
    out.actions = Array.isArray(entry.actions) ? entry.actions : [];
    out.linkedLore = Array.isArray(entry.linkedLore) ? entry.linkedLore : [];
    if (!out.when || typeof out.when !== 'object') {
      out.when = { anchor: (entry.when && entry.when.anchor) || '', timeline: (entry.timeline && entry.timeline.sceneLabel) || '' };
    }
    out.imp = _clamp10(entry.imp != null ? entry.imp : entry.importance, 6);
    out.emo = _clamp10(entry.emo != null ? entry.emo : entry.emotional, 5);
    const _surBase = entry.sur != null ? entry.sur
                    : (entry.surprise != null ? entry.surprise
                    : (entry.confidence != null ? Number(entry.confidence) * 10 : null));
    out.sur = _clamp10(_surBase, 6);
    out.gs = out.imp + out.emo + out.sur;
    if (C.stableTimelineEventId) {
      try { out.eventId = out.eventId || C.stableTimelineEventId(out); } catch(_) {}
    }
    out.migratedFromVersion = entry.migratedFromVersion || 'event-pre-pass11';
    out.lastUpdated = Date.now();
    return out;
  }

  const defaultSettings = {
    enabled: true, injectionControlVersion: 'split1', position: 'before',
    prefix: OOC_FORMATS.default.prefix, suffix: OOC_FORMATS.default.suffix,
    scanRange: 5, scanOffset: 2, maxEntries: 3, cooldownEnabled: true, cooldownTurns: 3,
    injectionCleanupEnabled: true, injectionCleanupTurns: 8,
    statusBadgeEnabled: true,
    strictMatch: true, similarityMatch: true, activeProject: '',

    autoExtEnabled: true, autoExtTurns: 5, autoExtScanRange: 5, autoExtOffset: 3, autoExtPack: '자동추출', autoExtMaxRetries: 2,
    autoExtApiType: 'key', autoExtVertexJson: '', autoExtVertexLocation: 'global', autoExtVertexProjectId: '',
    autoExtFirebaseScript: '', autoExtFirebaseEmbedKey: '', autoExtGeminiEmbedKey: '',
    autoExtDeepSeekKey: '', autoExtDeepSeekThinking: false, autoExtDeepSeekReasoning: 'high',
    autoExtOpenAIBaseUrl: '', autoExtOpenAIKey: '', autoExtOpenAIReasoning: 'off',
    deepSeekPromptOverridesEnabled: true,
    deepSeekJsonSystemPrompt: 'Return only one valid json object. Do not output markdown fences, explanations, comments, or trailing text. Preserve the language of the source content. Follow the exact object shape requested by the user.',
    deepSeekPromptWithoutDb: DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    deepSeekPromptWithDb: DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB,
    deepSeekTemporalExtractPrompt: DEFAULT_DEEPSEEK_TEMPORAL_EXTRACT_PROMPT,
    deepSeekImportPrompt: DEFAULT_DEEPSEEK_IMPORT_PROMPT,
    autoExtKey: '', autoExtModel: 'gemini-3-flash-preview', autoExtCustomModel: '', autoExtReasoning: 'medium', autoExtBudget: 2048,
    batchExtReasoning: 'medium', batchExtBudget: 2048,
    autoExtPrefix: '', autoExtSuffix: '', autoExtIncludeDb: true, autoExtIncludePersona: true,
    autoExtPatchMode: true, autoExtDbDigestLimit: 40,
    temporalExtractEnabled: true, temporalExtractAutoEnabled: false, temporalExtractBatchEnabled: false, temporalExtractMode: 'after_general', temporalCriticEnabled: false, temporalMaxEventsPerPass: 5,
    temporalExtractReasoning: 'medium', temporalExtractBudget: 2048,
    temporalExtractPrompt: DEFAULT_TEMPORAL_EXTRACT_PROMPT, temporalExtractSchema: DEFAULT_TEMPORAL_EXTRACT_SCHEMA,
    importPrompt: DEFAULT_IMPORT_PROMPT || C.DEFAULT_IMPORT_PROMPT || DEFAULT_DEEPSEEK_IMPORT_PROMPT,
    importSchema: DEFAULT_IMPORT_SCHEMA || C.DEFAULT_IMPORT_SCHEMA || '',
    timelineRetrievalEnabled: true, timelineRecallWeight: 0.32, timelineNoCuePenalty: 0.35, timelineRecallPoolLimit: 12,
    temporalInjectionEnabled: true, temporalRecallChars: 450, temporalRecallNaturalChars: 260,
    temporalRecallMaxEvents: 2, temporalRecallExplicitMaxEvents: 3, temporalRecallReserveChars: 120,
    temporalCompressionEnabled: true, temporalCompressionMinChars: 40,
    temporalCompressionApiEnabled: false, temporalCompressionTargetChars: 140,
    temporalCompressionPreserveFields: ['participants', 'location', 'hooks'],
    temporalRecallJudgeEnabled: false, temporalRecallJudgeModel: 'gemini-3.1-flash-lite-preview', temporalRecallJudgeCustomModel: '',
    temporalRecallJudgeReasoning: 'minimal', temporalRecallJudgeBudget: 512, temporalRecallJudgeTimeoutMs: 8000,
    temporalRecallJudgeCandidateLimit: 6,
    temporalRecallFallbackMode: 'deterministic',
    temporalRecallJudgePrompt: DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT,
    temporalRecallJudgeSchema: DEFAULT_TEMPORAL_RECALL_JUDGE_SCHEMA,

    activeTemplateId: 'default',
    templates: [{
      id: 'default', name: '기본 프롬프트', isDefault: true,
      schema: DEFAULT_AUTO_EXTRACT_SCHEMA,
      promptWithoutDb: DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
      promptWithDb: DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
      deepSeekPromptWithoutDb: DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
      deepSeekPromptWithDb: DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB,
      deepSeekTemporalExtractPrompt: DEFAULT_DEEPSEEK_TEMPORAL_EXTRACT_PROMPT,
      deepSeekImportPrompt: DEFAULT_DEEPSEEK_IMPORT_PROMPT
    }],
    autoPacks: ['자동추출'], urlPacks: {}, urlDisabledEntries: {},
    urlTurnCounters: {}, urlCooldownMaps: {}, urlAutoExtPacks: {}, urlExtLogs: {}, urlInjLogs: {},

    embeddingEnabled: true, activeCharDetection: true, decayEnabled: true, periodicRecallEnabled: true,
    loreBudgetChars: 300, loreBudgetMax: 500,
    compressionMode: 'auto', embeddingWeight: 0.35, useCompressedFormat: true,
    honorificMatrixEnabled: true, firstEncounterWarning: true, activeCharBoostEnabled: true,
    decayHalfLife: C.DEFAULTS.decayHalfLife,
    embeddingModel: 'gemini-embedding-001', autoEmbedOnExtract: true, extractStatusBadgeEnabled: true,
    aiMemoryTurns: 3, importanceGating: true, importanceThreshold: 12, pendingPromiseBoost: true,
    oocFormat: 'default', oocPromptVersion: OOC_FORMAT_VERSION, autoExtractPromptVersion: AUTO_EXTRACT_PROMPT_VERSION, rerankEnabled: false, rerankModel: 'gemini-3-flash-preview', rerankCustomModel: '',
    rerankReasoning: 'minimal', rerankBudget: 512, importReasoning: 'medium', importBudget: 2048, mergeReasoning: 'medium', mergeBudget: 2048,
    rerankPrompt: C.DEFAULTS.rerankPrompt,

    refinerEnabled: false, refinerAutoMode: false, refinerPassKeyword: 'PASS',
    refinerModel: 'gemini-3.1-flash-lite-preview', refinerCustomModel: '',
    refinerReasoning: 'minimal', refinerBudget: 512,
    refinerContextTurns: 3, refinerCustomPrompt: defaultRefinerPrompt(), refinerLoreMode: 'semantic', refinerMatchTurns: 5,
    refinerUseDynamic: true, refinerTopics: defaultRefinerTopics(), refinerPromptVersion: R ? R.PROMPT_VERSION : '',
    urlRefinerLogs: {},

    localMigrationVersion: '',
    migrationStatus: { version: '', oldFormatDetected: false, migratedEntries: 0, staleEmbeddingsRemoved: 0, checkedAt: 0, message: '' }
  };

  const settings = {
    config: JSON.parse(JSON.stringify(defaultSettings)),
    _lastSaveTime: 0,
    _lastSaveOk: true,
    _lastSaveError: '',
    save: function() {
      try {
        persistStorageIfPossible();
        const storable = pruneConfigForStorage(this.config, false);
        const payload = JSON.stringify(storable);
        _ls.setItem('lore-injector-v5', payload);
        this._lastSaveTime = Date.now();
        this._lastSaveOk = true;
        this._lastSaveError = '';
        try { _ls.removeItem('lore-injector-last-save-error'); } catch (_) {}
        return true;
      } catch(e) {
        try {
          const compact = pruneConfigForStorage(this.config, true);
          _ls.setItem('lore-injector-v5', JSON.stringify(compact));
          this._lastSaveTime = Date.now();
          this._lastSaveOk = true;
          this._lastSaveError = '';
          try { _ls.removeItem('lore-injector-last-save-error'); } catch (_) {}
          console.warn('[LoreInj:settings] save recovered after compacting logs:', e && e.message ? e.message : e);
          return true;
        } catch(e2) {
          this._lastSaveOk = false;
          this._lastSaveError = e2 && e2.message ? e2.message : String(e2);
          try {
            _ls.setItem('lore-injector-last-save-error', JSON.stringify({ ts: Date.now(), message: this._lastSaveError }));
          } catch (_) {}
          console.warn('[LoreInj:settings] save failed:', e2);
        }
        return false;
      }
    },
    load: function() {
      try {
        const saved = _ls.getItem('lore-injector-v5');
        if (saved) {
          const p = JSON.parse(saved);
          if (p && typeof p === 'object') {
            for (const k in p) { if (p[k] !== undefined) this.config[k] = p[k]; }
            // Older versions used one switch to stop both insertion and automatic extraction.
            // Preserve that intent once, then let the two controls operate independently.
            if (!p.injectionControlVersion) {
              if (p.enabled === false) this.config.autoExtEnabled = false;
              this.config.injectionControlVersion = 'split1';
              this.save();
            }
            if (Array.isArray(this.config.templates)) {
              const dT = this.config.templates.find(t => t.isDefault || t.id === 'default');
              if (dT) {
                dT.schema = DEFAULT_AUTO_EXTRACT_SCHEMA;
                dT.promptWithoutDb = DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB;
                dT.promptWithDb = DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB;
                dT.deepSeekPromptWithoutDb = DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB;
                dT.deepSeekPromptWithDb = DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB;
                dT.deepSeekTemporalExtractPrompt = DEFAULT_DEEPSEEK_TEMPORAL_EXTRACT_PROMPT;
                dT.deepSeekImportPrompt = DEFAULT_DEEPSEEK_IMPORT_PROMPT;
              }
              this.ensureDeepSeekTemplateFields();
            }
            try {
              const oldOocPrefix = '**OOC: Reference — factual background data. Incorporate naturally, never repeat verbatim.';
              const oldOocSuffix = '**';
              const savedOocVer = this.config.oocPromptVersion || '';
              if (savedOocVer !== OOC_FORMAT_VERSION) {
                const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
                const prefix = norm(this.config.prefix);
                const suffix = norm(this.config.suffix);
                const isDefaultish = !prefix || prefix === norm(oldOocPrefix) || prefix === norm(OOC_FORMATS.default.prefix) || this.config.oocFormat !== 'custom';
                const suffixDefaultish = !suffix || suffix === norm(oldOocSuffix) || suffix === norm(OOC_FORMATS.default.suffix) || this.config.oocFormat !== 'custom';
                if (isDefaultish && suffixDefaultish) {
                  this.config.oocFormat = 'default';
                  this.config.prefix = OOC_FORMATS.default.prefix;
                  this.config.suffix = OOC_FORMATS.default.suffix;
                }
                this.config.oocPromptVersion = OOC_FORMAT_VERSION;
                this.save();
              }
            } catch (e) {}
          }
        }

        // v1.4.0-test.47: 자동추출 promptWithDb LEGACY 마이그레이션. default 템플릿은 위에서 강제 덮어쓰이므로 여기는 non-default(사용자 복제) 템플릿 보호용. norm 불일치면 사용자 소유물로 간주하고 보존.
        try {
          const APV = AUTO_EXTRACT_PROMPT_VERSION;
          const LEGACY = LEGACY_AUTO_EXTRACT_PROMPTS_WITH_DB || [];
          const savedAPV = this.config.autoExtractPromptVersion || '';
          if (savedAPV !== APV && Array.isArray(this.config.templates)) {
            const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
            let migrated = 0;
            for (const t of this.config.templates) {
              if (!t || !t.promptWithDb) continue;
              const n = norm(t.promptWithDb);
              if (LEGACY.some(p => norm(p) === n)) {
                t.promptWithDb = DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB;
                migrated++;
              }
            }
            this.config.autoExtractPromptVersion = APV;
            this.save();
            if (migrated) console.log('[LoreInj:3] auto-extract prompt 마이그레이션:', migrated, '템플릿');
          }
        } catch (e) {}

        try {
          if (this.ensureDeepSeekTemplateFields()) this.save();
        } catch (e) {}

        const refSaved = _ls.getItem('speech-refiner-v1');
        if (refSaved) {
          const r = JSON.parse(refSaved);
          if (r && typeof r === 'object') {
            this.config.refinerEnabled = r.enabled ?? this.config.refinerEnabled;
            this.config.refinerAutoMode = r.autoMode ?? this.config.refinerAutoMode;
            this.config.refinerPassKeyword = r.passKeyword ?? this.config.refinerPassKeyword;
            this.config.refinerContextTurns = r.contextTurns ?? this.config.refinerContextTurns;
            this.config.refinerCustomPrompt = r.customPrompt ?? this.config.refinerCustomPrompt;
            this.config.refinerLoreMode = r.refinerLoreMode ?? this.config.refinerLoreMode;
            this.config.refinerMatchTurns = r.refinerMatchTurns ?? this.config.refinerMatchTurns;
            this.config.urlRefinerLogs = r.urlRefinerLogs ?? this.config.urlRefinerLogs;
            _ls.removeItem('speech-refiner-v1');
            this.save();
          }
        }

        try {
          const R2 = _w.__LoreRefiner;
          if (R2 && R2.PROMPT_VERSION && R2.LEGACY_PROMPTS) {
            const saved = (this.config.refinerCustomPrompt || '').trim();
            const savedVer = this.config.refinerPromptVersion || '';
            const norm = (s) => (s || '').trim().replace(/\s+/g, ' ');
            if (savedVer !== R2.PROMPT_VERSION) {
              const isLegacy = !saved || R2.LEGACY_PROMPTS.some(p => norm(p) === norm(saved)) || norm(R2.DEFAULT_PROMPT) === norm(saved);
              if (isLegacy) {
                const topics = {};
                if (R2.TOPICS) Object.keys(R2.TOPICS).forEach(k => topics[k] = true);
                this.config.refinerTopics = topics;
                this.config.refinerUseDynamic = true;
                this.config.refinerCustomPrompt = R2.buildDynamicPrompt ? R2.buildDynamicPrompt(topics) : R2.DEFAULT_PROMPT;
                this.config.refinerContextTurns = Math.max(this.config.refinerContextTurns || 0, 3);
              }
              this.config.refinerPromptVersion = R2.PROMPT_VERSION;
              this.save();
            }
          }
        } catch (e) {}
      } catch(e) {}
    },
    getActiveTemplate: function() {
      const id = this.config.activeTemplateId || 'default';
      const t = (this.config.templates || []).find(x => x.id === id);
      return t || this.config.templates[0];
    },
    ensureDeepSeekTemplateFields: function() {
      if (!Array.isArray(this.config.templates)) return false;
      const fallbacks = {
        deepSeekPromptWithoutDb: DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
        deepSeekPromptWithDb: DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB,
        deepSeekTemporalExtractPrompt: DEFAULT_DEEPSEEK_TEMPORAL_EXTRACT_PROMPT,
        deepSeekImportPrompt: DEFAULT_DEEPSEEK_IMPORT_PROMPT
      };
      let changed = false;
      for (const tpl of this.config.templates) {
        if (!tpl || typeof tpl !== 'object') continue;
        for (const key of Object.keys(fallbacks)) {
          if (tpl[key]) continue;
          tpl[key] = tpl.isDefault ? fallbacks[key] : (this.config[key] || fallbacks[key]);
          changed = true;
        }
      }
      return changed;
    }
  };

  function summaryToLevels(summary, entry) {
    const base = typeof summary === 'object' && summary && !Array.isArray(summary)
      ? { ...summary }
      : {};
    const fallback = typeof summary === 'string' ? summary : (entry.inject?.full || entry.inject?.compact || entry.inject?.micro || entry.name || '');
    const full = String(base.full || fallback || '').trim();
    const compact = String(base.compact || base.micro || full || entry.name || '').trim();
    const micro = String(base.micro || compact || entry.name || '').trim();
    return { full, compact, micro };
  }

  function normalizeCallStateLocal(entry) {
    const out = {};
    const add = (key, raw, meta = {}) => {
      if (!key) return;
      const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const current = obj.currentTerm || obj.term || obj.current || obj.call || (typeof raw === 'string' ? raw : '');
      if (!current) return;
      let previousTerms = obj.previousTerms || obj.previous || obj.prev || [];
      if (typeof previousTerms === 'string') previousTerms = [previousTerms];
      if (!Array.isArray(previousTerms)) previousTerms = [];
      previousTerms = Array.from(new Set(previousTerms.filter(x => x && x !== current)));
      out[key] = {
        currentTerm: current,
        previousTerms,
        tone: obj.tone || meta.tone || 'neutral',
        scope: obj.scope || meta.scope || 'stable',
        lastChangedTurn: obj.lastChangedTurn || obj.turn || meta.turn || entry.updatedTurn || entry.createdTurn || 0,
        confidence: obj.confidence != null ? obj.confidence : 0.7,
        reason: obj.reason || meta.reason || 'local migration'
      };
    };

    const source = entry.callState || entry.detail?.callState;
    if (source && typeof source === 'object') {
      if (Array.isArray(source)) source.forEach(cs => add(`${cs.from || cs.speaker || '?'}→${cs.to || cs.target || cs.addressee || '?'}`, cs));
      else if (source.currentTerm || source.term) add(`${source.from || source.speaker || '?'}→${source.to || source.target || source.addressee || '?'}`, source);
      else Object.entries(source).forEach(([k, v]) => add(k, v));
    }
    if (entry.detail?.nicknames && typeof entry.detail.nicknames === 'object') {
      Object.entries(entry.detail.nicknames).forEach(([k, v]) => add(k, v, { reason: 'migrated from detail.nicknames' }));
    }
    if (entry.call && typeof entry.call === 'object') {
      Object.entries(entry.call).forEach(([k, v]) => add(k, v, { reason: 'migrated from call' }));
    }
    if (Array.isArray(entry.callHistory)) {
      const byKey = {};
      entry.callHistory.forEach(h => {
        if (!h || !h.from || !h.to || !h.term) return;
        const k = `${h.from}→${h.to}`;
        (byKey[k] = byKey[k] || []).push(h);
      });
      Object.entries(byKey).forEach(([k, arr]) => {
        arr.sort((a,b) => (a.turn || 0) - (b.turn || 0));
        const last = arr[arr.length - 1];
        const previousTerms = Array.from(new Set(arr.slice(0, -1).map(x => x.term).filter(t => t && t !== last.term)));
        add(k, { ...last, currentTerm: last.term, previousTerms, reason: last.reason || 'migrated from callHistory' });
      });
    }
    return out;
  }

  function normalizeEntryForMigration(entry, currentTurn) {
    const patch = {};
    let oldFormat = false;

    const oldSummary = typeof entry.summary === 'string' || !entry.summary || typeof entry.summary !== 'object';
    const summary = summaryToLevels(entry.summary, entry);
    if (oldSummary || !entry.summary.full || !entry.summary.compact || !entry.summary.micro) {
      patch.summary = summary;
      oldFormat = true;
    }

    const inject = entry.inject && typeof entry.inject === 'object' ? { ...entry.inject } : {};
    if (!inject.full || !inject.compact || !inject.micro) {
      patch.inject = {
        full: inject.full || summary.full,
        compact: inject.compact || summary.compact,
        micro: inject.micro || summary.micro
      };
      oldFormat = true;
    }

    const callState = normalizeCallStateLocal(entry);
    if (Object.keys(callState).length && !entry.callState) {
      patch.callState = callState;
      oldFormat = true;
    }

    const eventTurn = entry.eventTurn || entry.timeline?.eventTurn || entry.createdTurn || entry.updatedTurn || currentTurn || 0;
    const timeline = entry.timeline && typeof entry.timeline === 'object' ? { ...entry.timeline } : {};
    if (!entry.timeline || timeline.eventTurn == null) {
      patch.timeline = {
        ...timeline,
        eventTurn,
        relativeOrder: timeline.relativeOrder || (eventTurn && currentTurn && eventTurn < currentTurn ? 'past' : 'current'),
        sceneLabel: timeline.sceneLabel || entry.sceneId || '',
        observedRecency: timeline.observedRecency || 'unknown'
      };
      oldFormat = true;
    }

    const entities = Array.isArray(entry.entities) && entry.entities.length
      ? entry.entities
      : (C.inferEntryEntities ? C.inferEntryEntities(entry) : []);
    if (entities.length && (!Array.isArray(entry.entities) || !entry.entities.length)) {
      patch.entities = Array.from(new Set(entities));
      oldFormat = true;
    }

    const parties = entry.parties || entry.detail?.parties || [];
    if (Array.isArray(parties) && parties.length) {
      if (!Array.isArray(entry.subjects) || !entry.subjects.length) patch.subjects = [parties[0]].filter(Boolean);
      if (!Array.isArray(entry.objects) || !entry.objects.length) patch.objects = parties.slice(1).filter(Boolean);
    }
    const locs = [entry.location, entry.detail?.location, entry.place, entry.detail?.place].filter(Boolean);
    if (locs.length && (!Array.isArray(entry.locations) || !entry.locations.length)) patch.locations = Array.from(new Set(locs.map(String)));
    if ((entry.type === 'promise' || entry.type === 'prom') && (!Array.isArray(entry.promises) || !entry.promises.length)) {
      patch.promises = [entry.name || summary.micro].filter(Boolean);
    }

    // Phase 11: timeline_event gate compatibility — derive imp/emo/sur from importance/emotional/surprise/confidence.
    const _tlType = (C.TIMELINE_EVENT_TYPE || 'timeline_event');
    if (entry.type === _tlType) {
      const _clamp10 = (v, fb) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return fb;
        return Math.max(1, Math.min(10, Math.round(n)));
      };
      const _impVal = entry.imp == null ? 0 : Number(entry.imp);
      const _emoVal = entry.emo == null ? 0 : Number(entry.emo);
      const _surVal = entry.sur == null ? 0 : Number(entry.sur);
      if ((!_impVal || _impVal <= 0) && entry.importance != null) { patch.imp = _clamp10(entry.importance, 6); oldFormat = true; }
      else if (!_impVal || _impVal <= 0) { patch.imp = 6; oldFormat = true; }
      if ((!_emoVal || _emoVal <= 0) && entry.emotional != null) { patch.emo = _clamp10(entry.emotional, 5); oldFormat = true; }
      else if (!_emoVal || _emoVal <= 0) { patch.emo = 5; oldFormat = true; }
      if ((!_surVal || _surVal <= 0) && entry.surprise != null) { patch.sur = _clamp10(entry.surprise, 6); oldFormat = true; }
      else if ((!_surVal || _surVal <= 0) && entry.confidence != null) { patch.sur = _clamp10(Number(entry.confidence) * 10, 6); oldFormat = true; }
      else if (!_surVal || _surVal <= 0) { patch.sur = 6; oldFormat = true; }
      const _finalImp = patch.imp != null ? patch.imp : (_impVal || 6);
      const _finalEmo = patch.emo != null ? patch.emo : (_emoVal || 5);
      const _finalSur = patch.sur != null ? patch.sur : (_surVal || 6);
      const _finalGs = _finalImp + _finalEmo + _finalSur;
      if (entry.gs !== _finalGs) { patch.gs = _finalGs; oldFormat = true; }
    }

    // Phase 11: legacy 'event' entries — backfill recallTriggers from triggers/hooks for hybrid retrieval.
    if (entry.type === 'event' && (!Array.isArray(entry.recallTriggers) || !entry.recallTriggers.length)) {
      const _fromTriggers = Array.isArray(entry.triggers) ? entry.triggers : [];
      const _fromHooks = Array.isArray(entry.hooks) ? entry.hooks : [];
      const _merged = Array.from(new Set([..._fromTriggers, ..._fromHooks].filter(Boolean)));
      if (_merged.length) { patch.recallTriggers = _merged; oldFormat = true; }
    }

    const now = Date.now();
    if (!entry.createdTurn) patch.createdTurn = eventTurn || currentTurn || 0;
    if (!entry.updatedTurn) patch.updatedTurn = currentTurn || eventTurn || 0;
    if (!entry.realTimestamp && (entry.lastUpdated || entry.ts)) patch.realTimestamp = entry.lastUpdated || entry.ts;
    if (!entry.migratedFromVersion || oldFormat) patch.migratedFromVersion = entry.migratedFromVersion || 'pre-1.4.0-test';
    patch.localMigrationVersion = C.LOCAL_MIGRATION_VERSION || '1.4.0-test-pass11-local';
    patch.lastMigrationAt = now;

    return { patch, oldFormat };
  }

  async function runLocalMigration() {
    const target = C.LOCAL_MIGRATION_VERSION || '1.4.0-test-pass11-local';
    const last = _ls.getItem('lore-local-migration-version') || settings.config.localMigrationVersion || '';
    if (last === target) {
      let prior = settings.config.migrationStatus || null;
      if (!prior) {
        try { prior = JSON.parse(_ls.getItem('lore-local-migration-status') || 'null'); } catch (_) {}
      }
      try {
        const staleEmbeddingsRemoved = await cleanupEmbeddingsForSelectedModel();
        const orphanCleanup = await cleanupOrphanedLoreStorageOnce();
        if (orphanCleanup || staleEmbeddingsRemoved) {
          const removed = staleEmbeddingsRemoved + (orphanCleanup?.orphanEmbeddingsRemoved || 0) + (orphanCleanup?.orphanEntryVersionsRemoved || 0) + (orphanCleanup?.orphanSnapshotsRemoved || 0) + (orphanCleanup?.emptyPacksRemoved || 0);
          prior = {
            ...(prior || {}),
            version: target,
            staleEmbeddingsRemoved,
            orphanedHistoryRemoved: (orphanCleanup?.orphanEntryVersionsRemoved || 0) + (orphanCleanup?.orphanSnapshotsRemoved || 0),
            checkedAt: Date.now(),
            message: removed ? '로어 상태 점검 완료. 사용하지 않는 저장 데이터 ' + removed + '개를 정리했습니다.' : '로어 상태 점검 완료.'
          };
          settings.config.migrationStatus = prior;
          settings.save();
          _ls.setItem('lore-local-migration-status', JSON.stringify(prior));
        }
      } catch (e) {
        console.warn('[LoreInj:migration] orphan storage cleanup failed:', e);
      }
      return prior || { version: target, oldFormatDetected: false, migratedEntries: 0, staleEmbeddingsRemoved: 0, orphanedHistoryRemoved: 0, checkedAt: Date.now(), message: '로어 상태 점검 완료.' };
    }
    const status = { version: target, oldFormatDetected: false, migratedEntries: 0, staleEmbeddingsRemoved: 0, orphanedHistoryRemoved: 0, checkedAt: Date.now(), message: '' };
    try {
      const currentTurn = getTurnCounter(getChatKey());
      const entries = await db.entries.toArray();
      for (const e of entries) {
        const { patch, oldFormat } = normalizeEntryForMigration(e, currentTurn);
        const keys = Object.keys(patch).filter(k => JSON.stringify(e[k]) !== JSON.stringify(patch[k]));
        if (!keys.length && last === target) continue;
        if (oldFormat) status.oldFormatDetected = true;
        const update = {};
        keys.forEach(k => update[k] = patch[k]);
        if (Object.keys(update).length) {
          await db.entries.update(e.id, update);
          status.migratedEntries++;
        }
      }
      if (C.cleanupStaleEmbeddings) {
        const model = settings.config.embeddingModel || C.DEFAULTS.embeddingModel;
        const clean = await C.cleanupStaleEmbeddings(null, { model });
        status.staleEmbeddingsRemoved = clean.removed || 0;
        _ls.setItem(EMBEDDING_MODEL_CLEANUP_KEY, model);
      }
      const orphanCleanup = await cleanupOrphanedLoreStorageOnce();
      if (orphanCleanup) {
        status.orphanedHistoryRemoved = (orphanCleanup.orphanEntryVersionsRemoved || 0) + (orphanCleanup.orphanSnapshotsRemoved || 0);
      }
      status.message = status.oldFormatDetected
        ? '이전 형식의 로어를 현재 방식에 맞게 정리했습니다.'
        : (status.orphanedHistoryRemoved ? '로어 상태 점검 완료. 사용하지 않는 이력 ' + status.orphanedHistoryRemoved + '개를 정리했습니다.' : '로어 상태 점검 완료.');
      settings.config.localMigrationVersion = target;
      settings.config.migrationStatus = status;
      settings.save();
      _ls.setItem('lore-local-migration-version', target);
      _ls.setItem('lore-local-migration-status', JSON.stringify(status));
    } catch (e) {
      status.message = '로어 상태 점검 실패: ' + (e.message || String(e));
      settings.config.migrationStatus = status;
      settings.save();
      console.warn('[LoreInj:migration] failed:', e);
    }
    return status;
  }

  function getMigrationStatus() {
    return settings.config.migrationStatus || JSON.parse(_ls.getItem('lore-local-migration-status') || 'null') || null;
  }

  settings.load();
  if (isChatRoute()) {
    await ensureHeavyRuntimeInit('initial-chat');
  } else {
    _w.__LoreInj.__settingsHeavyDeferred = true;
    console.log('[LoreInj:3] non-chat route: local migration/refiner init deferred');
    const bootHeavy = () => ensureHeavyRuntimeInit('route-chat').catch(e => console.warn('[LoreInj:3] route heavy init 실패:', e));
    if (_w.__LoreInj && typeof _w.__LoreInj.runWhenChatRoute === 'function') _w.__LoreInj.runWhenChatRoute(bootHeavy);
    else runWhenChatRouteLocal(bootHeavy);
  }
  window.addEventListener('storage', (e) => { if (e.key === 'lore-injector-v5' || e.key === ACTIVE_PACKS_STORAGE_KEY) reloadSettingsFromStorage(); });
  window.addEventListener('focus', () => { if (Date.now() - (settings._lastSaveTime || 0) > 3000) reloadSettingsFromStorage(); });

  function getChatKey() {
    try { const id = C.getCurrentChatId(); if (id) return 'chat:' + id; } catch(e) {}
    const m = window.location.pathname.match(/\/(?:chats|episodes)\/([a-f0-9]+)/);
    if (m) return 'chat:' + m[1];
    return C.getCurUrl();
  }

  function extractChatStateKeyFromText(text) {
    const m = String(text || '').match(/\/(?:chats|episodes|c)\/([a-f0-9]+)/);
    return m ? ('chat:' + m[1]) : '';
  }

  function getStableChatStateKey(url) {
    const hasProvidedUrl = url !== undefined && url !== null;
    const cur = hasProvidedUrl ? String(url || '') : C.getCurUrl();
    const fromProvided = extractChatStateKeyFromText(cur);
    if (fromProvided) return fromProvided;
    if (!hasProvidedUrl) {
      const chatKey = getChatKey();
      if (chatKey && chatKey.startsWith('chat:')) return chatKey;
    }
    const fromPath = extractChatStateKeyFromText(window.location.pathname || '');
    if (!hasProvidedUrl && fromPath) return fromPath;
    return cur;
  }

  function getLegacyStateKeys(url) {
    const keys = [];
    const add = (k) => { if (k && !keys.includes(k)) keys.push(k); };
    const cur = url || C.getCurUrl();
    add(cur);
    add(C.getCurUrl());
    try { add(window.location.pathname); } catch (_) {}
    try {
      const chatKey = getStableChatStateKey(url);
      const chatId = chatKey && chatKey.startsWith('chat:') ? chatKey.slice(5) : '';
      if (chatId) {
        const maps = [settings.config.urlPacks, settings.config.urlDisabledEntries, settings.config.urlAutoExtPacks].filter(Boolean);
        for (const map of maps) {
          Object.keys(map || {}).forEach(k => { if (k && k.includes(chatId)) add(k); });
        }
      }
    } catch (_) {}
    return keys;
  }

  function readActivePackMap() {
    try {
      const raw = _ls.getItem(ACTIVE_PACKS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveActivePackMap(map) {
    try {
      _ls.setItem(ACTIVE_PACKS_STORAGE_KEY, JSON.stringify(map || {}));
      return true;
    } catch (e) {
      console.warn('[LoreInj:settings] active pack state save failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  function normalizePackList(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean).map(String)));
  }

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function getActivePackStateKeys(url) {
    const keys = [];
    const add = (k) => { if (k && !keys.includes(k)) keys.push(k); };
    add(getStableChatStateKey(url));
    getLegacyStateKeys(url).forEach(add);
    return keys;
  }

  function writeActivePacksForUrl(url, list) {
    const normalized = normalizePackList(list);
    const activeMap = readActivePackMap();
    for (const key of getActivePackStateKeys(url)) activeMap[key] = normalized;
    saveActivePackMap(activeMap);
    return normalized;
  }

  function syncActivePackStateToSettings(url) {
    if (!settings.config.urlPacks) settings.config.urlPacks = {};
    const activeMap = readActivePackMap();
    const keys = getActivePackStateKeys(url);
    for (const key of keys) {
      if (!hasOwn(activeMap, key)) continue;
      const normalized = normalizePackList(activeMap[key]);
      if (JSON.stringify(settings.config.urlPacks[key] || []) !== JSON.stringify(normalized)) {
        settings.config.urlPacks[key] = normalized;
      }
      return normalized;
    }
    return null;
  }

  function reloadSettingsFromStorage() {
    settings.load();
    syncActivePackStateToSettings();
  }

  function migrateMapValueToStableKey(mapName, stableKey, legacyKey) {
    const map = settings.config[mapName];
    if (!map || !stableKey || !legacyKey || stableKey === legacyKey || map[stableKey] !== undefined || map[legacyKey] === undefined) return false;
    map[stableKey] = JSON.parse(JSON.stringify(map[legacyKey]));
    return true;
  }

  function incrementTurnCounter(chatKey) { return C.incrementTurn(chatKey); }
  function recordEntryMention(chatKey, entryId) { return C.recordMention(chatKey, entryId); }
  function getTurnCounter(chatKey) {
    const c = JSON.parse(_ls.getItem('lore-turn-counters') || '{}');
    return c[chatKey] || 0;
  }
  function setTurnCounter(chatKey, val) {
    const c = JSON.parse(_ls.getItem('lore-turn-counters') || '{}');
    c[chatKey] = val;
    _ls.setItem('lore-turn-counters', JSON.stringify(c));
  }
  function getCooldownMap(chatKey) {
    if (!settings.config.urlCooldownMaps) settings.config.urlCooldownMaps = {};
    return settings.config.urlCooldownMaps[chatKey] || {};
  }
  function setCooldownLastTurn(chatKey, id, turn) {
    if (!settings.config.urlCooldownMaps) settings.config.urlCooldownMaps = {};
    if (!settings.config.urlCooldownMaps[chatKey]) settings.config.urlCooldownMaps[chatKey] = {};
    settings.config.urlCooldownMaps[chatKey][id] = turn;
    settings.save();
  }

  async function getAutoExtPackForUrl(url) {
    if (!settings.config.urlAutoExtPacks) settings.config.urlAutoExtPacks = {};
    const stableKey = getStableChatStateKey(url);
    if (settings.config.urlAutoExtPacks[stableKey]) return settings.config.urlAutoExtPacks[stableKey];
    for (const key of getLegacyStateKeys(url)) {
      if (settings.config.urlAutoExtPacks[key]) {
        settings.config.urlAutoExtPacks[stableKey] = settings.config.urlAutoExtPacks[key];
        settings.save();
        return settings.config.urlAutoExtPacks[stableKey];
      }
    }
    let baseName = '자동추출';
    try {
      let chatId = C.getCurrentChatId();
      if (!chatId) { const match = url.match(/\/episodes\/([a-f0-9]+)/); if (match) chatId = match[1]; }
      if (chatId) {
        const CU = _w.CrackUtil || (typeof CrackUtil !== 'undefined' ? CrackUtil : null);
        const room = CU ? await CU.chatRoom().roomData(chatId) : null;
        if (room && !(room instanceof Error)) baseName = room.story?.name || room.title || '자동추출';
      }
    } catch(e) {}
    let finalName = baseName, counter = 1;
    const existing = Object.values(settings.config.urlAutoExtPacks || {});
    while (true) {
      const checkName = counter === 1 ? baseName : `${baseName} ${counter}`;
      const inDb = await db.packs.get(checkName);
      if (!inDb && !existing.includes(checkName)) { finalName = checkName; break; }
      counter++;
    }
    settings.config.urlAutoExtPacks[stableKey] = finalName; settings.save();
    return finalName;
  }
  function setAutoExtPackForUrl(url, packName) {
    if (!settings.config.urlAutoExtPacks) settings.config.urlAutoExtPacks = {};
    settings.config.urlAutoExtPacks[getStableChatStateKey(url)] = packName; settings.save();
  }

  function getUrlStateKey(url) {
    const stableKey = getStableChatStateKey(url);
    const packsByUrl = settings.config.urlPacks || {};
    if (packsByUrl[stableKey]) return stableKey;
    for (const key of getLegacyStateKeys(url)) {
      if (packsByUrl[key] && packsByUrl[key].length) {
        let changed = false;
        changed = migrateMapValueToStableKey('urlPacks', stableKey, key) || changed;
        changed = migrateMapValueToStableKey('urlDisabledEntries', stableKey, key) || changed;
        if (changed) settings.save();
        return stableKey;
      }
    }
    return stableKey;
  }

  function getActivePacksForUrl(url) {
    const stableKey = getStableChatStateKey(url);
    const activeMap = readActivePackMap();
    if (hasOwn(activeMap, stableKey)) return normalizePackList(activeMap[stableKey]);
    for (const legacyKey of getLegacyStateKeys(url)) {
      if (hasOwn(activeMap, legacyKey)) {
        const migrated = writeActivePacksForUrl(url, activeMap[legacyKey]);
        if (!settings.config.urlPacks) settings.config.urlPacks = {};
        settings.config.urlPacks[stableKey] = migrated;
        return migrated;
      }
    }
    const key = getUrlStateKey(url);
    const fromSettings = normalizePackList(settings.config.urlPacks && settings.config.urlPacks[key]);
    if (fromSettings.length) {
      writeActivePacksForUrl(url, fromSettings);
    }
    return fromSettings;
  }

  function getDisabledEntriesForUrl(url) {
    const key = getUrlStateKey(url);
    const map = settings.config.urlDisabledEntries || {};
    if (map[key]) return Array.from(new Set(map[key]));
    for (const legacyKey of getLegacyStateKeys(url)) {
      if (map[legacyKey] && map[legacyKey].length) {
        if (migrateMapValueToStableKey('urlDisabledEntries', key, legacyKey)) settings.save();
        return Array.from(new Set(map[key] || map[legacyKey] || []));
      }
    }
    return [];
  }

  function getExtLog(chatKey) { return settings.config.urlExtLogs?.[chatKey] || []; }
  function addExtLog(chatKey, logItem) {
    if (!settings.config.urlExtLogs) settings.config.urlExtLogs = {};
    let logs = settings.config.urlExtLogs[chatKey] || [];
    logs.unshift(logItem); if (logs.length > 30) logs.length = 30;
    settings.config.urlExtLogs[chatKey] = logs; settings.save();
  }
  function clearExtLog(chatKey) {
    if (!settings.config.urlExtLogs) settings.config.urlExtLogs = {};
    settings.config.urlExtLogs[chatKey] = []; settings.save();
  }

  function getInjLog(chatKey) { return settings.config.urlInjLogs?.[chatKey] || []; }
  function addInjLog(chatKey, logItem) {
    if (!settings.config.urlInjLogs) settings.config.urlInjLogs = {};
    let logs = settings.config.urlInjLogs[chatKey] || [];
    logs.unshift(logItem); if (logs.length > 100) logs.length = 100;
    settings.config.urlInjLogs[chatKey] = logs; settings.save();
  }
  function clearInjLog(chatKey) {
    if (!settings.config.urlInjLogs) settings.config.urlInjLogs = {};
    settings.config.urlInjLogs[chatKey] = []; settings.save();
  }

  function isEntryEnabledForUrl(entry) {
    const packs = getActivePacksForUrl();
    const disabled = getDisabledEntriesForUrl();
    return packs.includes(entry.packName) && !disabled.includes(entry.id);
  }

  async function setPackEnabled(packName, state) {
    const url = C.getCurUrl();
    const curUrl = getUrlStateKey(url);
    const stableKey = getStableChatStateKey(url);
    const activeMap = readActivePackMap();
    const up = JSON.parse(JSON.stringify(settings.config.urlPacks || {}));
    const ud = JSON.parse(JSON.stringify(settings.config.urlDisabledEntries || {}));
    up[curUrl] = up[curUrl] || []; ud[curUrl] = ud[curUrl] || [];
    const currentActive = normalizePackList(
      hasOwn(activeMap, curUrl) ? activeMap[curUrl] :
      (hasOwn(activeMap, stableKey) ? activeMap[stableKey] : up[curUrl])
    );
    up[curUrl] = normalizePackList(up[curUrl].length ? up[curUrl] : currentActive);
    if (state) {
      if (!up[curUrl].includes(packName)) up[curUrl].push(packName);
      const its = await db.entries.where('packName').equals(packName).toArray();
      const ids = its.map(x => x.id);
      ud[curUrl] = ud[curUrl].filter(id => !ids.includes(id));
    } else {
      up[curUrl] = up[curUrl].filter(p => p !== packName);
    }
    up[curUrl] = normalizePackList(up[curUrl]);
    if (stableKey !== curUrl) up[stableKey] = up[curUrl];
    if (stableKey !== curUrl) ud[stableKey] = ud[curUrl];
    writeActivePacksForUrl(url, up[curUrl]);
    settings.config.urlPacks = up; settings.config.urlDisabledEntries = ud; settings.save();
  }

  function setEntryEnabled(entry, state) {
    const url = C.getCurUrl();
    const curUrl = getUrlStateKey(url);
    const stableKey = getStableChatStateKey(url);
    const activeMap = readActivePackMap();
    const up = JSON.parse(JSON.stringify(settings.config.urlPacks || {}));
    const ud = JSON.parse(JSON.stringify(settings.config.urlDisabledEntries || {}));
    up[curUrl] = up[curUrl] || []; ud[curUrl] = ud[curUrl] || [];
    const currentActive = normalizePackList(
      hasOwn(activeMap, curUrl) ? activeMap[curUrl] :
      (hasOwn(activeMap, stableKey) ? activeMap[stableKey] : up[curUrl])
    );
    up[curUrl] = normalizePackList(up[curUrl].length ? up[curUrl] : currentActive);
    if (state) {
      ud[curUrl] = ud[curUrl].filter(id => id !== entry.id);
      if (!up[curUrl].includes(entry.packName)) up[curUrl].push(entry.packName);
    } else {
      if (!ud[curUrl].includes(entry.id)) ud[curUrl].push(entry.id);
    }
    up[curUrl] = normalizePackList(up[curUrl]);
    if (stableKey !== curUrl) up[stableKey] = up[curUrl];
    if (stableKey !== curUrl) ud[stableKey] = ud[curUrl];
    writeActivePacksForUrl(url, up[curUrl]);
    settings.config.urlPacks = up; settings.config.urlDisabledEntries = ud; settings.save();
  }

  function resolveConfiguredModel(value, customValue, fallback) {
    if (value === '_custom') return customValue || fallback;
    return value || fallback;
  }

  function getGenerationFallbackModel(config) {
    const apiType = config && config.autoExtApiType;
    if (apiType === 'deepseek') return 'deepseek-v4-flash';
    if (apiType === 'openai') return '';
    return 'gemini-3-flash-preview';
  }

  function isModelCompatibleWithApi(model, apiType) {
    const m = String(model || '');
    if (!m || m === '_custom') return true;
    if (apiType === 'deepseek') return m.startsWith('deepseek-');
    if (apiType === 'openai') return !m.startsWith('gemini-') && !m.startsWith('deepseek-');
    return !m.startsWith('deepseek-');
  }

  function featureThinkingKey(feature) {
    const f = String(feature || '');
    if (f === 'batchExtract' || f === 'batchExtractRetry') return 'batchExt';
    if (f === 'temporalExtract') return 'temporalExtract';
    if (f === 'urlImport' || f === 'textImport' || f === 'import') return 'import';
    if (f === 'merge') return 'merge';
    if (f === 'rerank') return 'rerank';
    if (f === 'judge') return 'temporalRecallJudge';
    if (f === 'refine') return 'refiner';
    return 'autoExt';
  }

  function thinkingModeForFeature(config, feature) {
    const key = featureThinkingKey(feature);
    return {
      key,
      mode: config[key + 'Reasoning'] || config.autoExtReasoning || 'default',
      budget: Number(config[key + 'Budget'] || config.autoExtBudget || 2048) || 2048
    };
  }

  function geminiThinkingConfigForModel(model, mode, budget) {
    const m = String(model || '').toLowerCase();
    const raw = String(mode || 'default').toLowerCase();
    if (!raw || raw === 'default') return {};
    const isGemini3 = /^gemini-3/.test(m);
    const isGemini25 = m.includes('gemini-2.5');
    const isThinking20 = m.includes('gemini-2.0-flash-thinking');
    if (!isGemini3 && !isGemini25 && !isThinking20) return {};
    if (isGemini3 || isThinking20) {
      if (raw === 'budget') {
        const b = Math.max(0, Number(budget) || 0);
        return { thinkingLevel: b >= 4096 ? 'high' : (b >= 2048 ? 'medium' : (b >= 1024 ? 'low' : 'minimal')) };
      }
      if (raw === 'off') return { thinkingLevel: 'minimal' };
      if (['minimal', 'low', 'medium', 'high'].includes(raw)) return { thinkingLevel: raw };
      return {};
    }
    if (isGemini25) {
      if (raw === 'off') return m.includes('pro') ? {} : { thinkingBudget: 0 };
      if (raw === 'budget') return { thinkingBudget: Math.max(-1, Number(budget) || 0) };
      const map = { minimal: 512, low: 1024, medium: 2048, high: 4096 };
      if (map[raw] != null) return { thinkingBudget: map[raw] };
    }
    return {};
  }

  function openAIReasoningForFeature(config, feature) {
    const key = featureThinkingKey(feature);
    const direct = String(config[key + 'OpenAIReasoning'] || config.autoExtOpenAIReasoning || '').trim();
    const selected = direct || 'off';
    if (!selected || selected === 'default' || selected === 'budget') return 'off';
    if (selected === 'off') return 'off';
    if (selected === 'minimal') return 'minimal';
    if (['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(selected)) return selected;
    return direct || 'off';
  }

  function deepSeekReasoningForFeature(config, feature) {
    const key = featureThinkingKey(feature);
    const globalThinking = config.autoExtDeepSeekThinking !== false;
    const globalReasoning = config.autoExtDeepSeekReasoning || 'high';
    const direct = key === 'autoExt'
      ? (globalThinking ? globalReasoning : 'off')
      : String(config[key + 'DeepSeekReasoning'] || 'default').trim();
    const selected = direct || 'default';
    if (selected === 'default') return { thinking: globalThinking, reasoning: globalReasoning };
    if (selected === 'off') return { thinking: false, reasoning: globalReasoning };
    if (['high', 'max'].includes(selected)) return { thinking: true, reasoning: selected };
    return { thinking: globalThinking, reasoning: globalReasoning };
  }

  function getGeminiEmbeddingKey(config, opts = {}) {
    const cfg = config || settings.config || {};
    const key = String(cfg.autoExtGeminiEmbedKey || cfg.autoExtFirebaseEmbedKey || '').trim();
    if (key) return key;
    return opts.allowGenerationKey ? String(cfg.autoExtKey || '').trim() : '';
  }

  function normalizeApiModelDefaults(config) {
    const cfg = config || settings.config || {};
    const apiType = cfg.autoExtApiType || 'key';
    const fallback = getGenerationFallbackModel(cfg);
    const forceOpenAICustom = (modelKey, customKey) => {
      const current = cfg[modelKey];
      const oldDefault = 'gpt-' + '4.1-mini';
      if (current && current !== '_custom' && current !== oldDefault && !String(current).startsWith('gemini-') && !String(current).startsWith('deepseek-') && !cfg[customKey]) {
        cfg[customKey] = current;
      }
      cfg[modelKey] = '_custom';
    };
    if (!isModelCompatibleWithApi(cfg.autoExtModel, apiType)) cfg.autoExtModel = fallback;
    if (apiType === 'deepseek') {
      if (!cfg.autoExtModel || cfg.autoExtModel === '_custom') cfg.autoExtModel = fallback;
      if (!cfg.rerankModel || !isModelCompatibleWithApi(cfg.rerankModel, apiType)) cfg.rerankModel = fallback;
      if (!cfg.temporalRecallJudgeModel || !isModelCompatibleWithApi(cfg.temporalRecallJudgeModel, apiType)) cfg.temporalRecallJudgeModel = fallback;
      if (cfg.refinerModel === '' || !isModelCompatibleWithApi(cfg.refinerModel, apiType)) cfg.refinerModel = fallback;
      if (cfg.autoExtDeepSeekThinking === undefined) cfg.autoExtDeepSeekThinking = false;
    } else if (apiType === 'openai') {
      forceOpenAICustom('autoExtModel', 'autoExtCustomModel');
      forceOpenAICustom('rerankModel', 'rerankCustomModel');
      forceOpenAICustom('temporalRecallJudgeModel', 'temporalRecallJudgeCustomModel');
      forceOpenAICustom('refinerModel', 'refinerCustomModel');
    } else {
      if (!cfg.autoExtModel || cfg.autoExtModel === '_custom' || !isModelCompatibleWithApi(cfg.autoExtModel, apiType)) cfg.autoExtModel = fallback;
      if (!cfg.rerankModel || cfg.rerankModel === '_custom' || !isModelCompatibleWithApi(cfg.rerankModel, apiType)) cfg.rerankModel = 'gemini-3-flash-preview';
      if (!cfg.temporalRecallJudgeModel || cfg.temporalRecallJudgeModel === '_custom' || !isModelCompatibleWithApi(cfg.temporalRecallJudgeModel, apiType)) cfg.temporalRecallJudgeModel = 'gemini-3.1-flash-lite-preview';
      if (cfg.refinerModel === '' || cfg.refinerModel === '_custom' || !isModelCompatibleWithApi(cfg.refinerModel, apiType)) cfg.refinerModel = 'gemini-3.1-flash-lite-preview';
    }
    return cfg;
  }

  function getApiMissingReason(config, purpose = 'generate') {
    const cfg = config || settings.config || {};
    if (purpose === 'embed') {
      if ((cfg.autoExtApiType || 'key') === 'deepseek') {
        return getGeminiEmbeddingKey(cfg) ? '' : '의미 검색용 Gemini API 키 필요.';
      }
      if ((cfg.autoExtApiType || 'key') === 'openai') {
        return getGeminiEmbeddingKey(cfg) ? '' : '의미 검색용 Gemini API 키 필요.';
      }
      if ((cfg.autoExtApiType || 'key') === 'vertex') return cfg.autoExtVertexJson ? '' : 'Vertex JSON 필요.';
      if ((cfg.autoExtApiType || 'key') === 'firebase') return getGeminiEmbeddingKey(cfg) ? '' : '의미 검색용 Gemini API 키 필요.';
      return getGeminiEmbeddingKey(cfg, { allowGenerationKey: true }) ? '' : 'Gemini API 키 필요.';
    }
    const apiType = cfg.autoExtApiType || 'key';
    if (apiType === 'deepseek') return cfg.autoExtDeepSeekKey ? '' : 'DeepSeek API 키 필요.';
    if (apiType === 'openai') {
      if (!cfg.autoExtOpenAIBaseUrl) return 'OpenAI 호환 Base URL 필요.';
      if (!cfg.autoExtOpenAIKey) return 'OpenAI 호환 API 키 필요.';
      if (!resolveConfiguredModel(cfg.autoExtModel, cfg.autoExtCustomModel, '')) return 'OpenAI 호환 모델명 필요.';
      return '';
    }
    if (apiType === 'vertex') return cfg.autoExtVertexJson ? '' : 'Vertex JSON 필요.';
    if (apiType === 'firebase') return cfg.autoExtFirebaseScript ? '' : 'Firebase 설정 필요.';
    return cfg.autoExtKey ? '' : 'Gemini API 키 필요.';
  }

  function buildGenerationApiOpts(overrides = {}, costContext = null) {
    const cfg = settings.config || {};
    const fallback = getGenerationFallbackModel(cfg);
    const model = resolveConfiguredModel(cfg.autoExtModel, cfg.autoExtCustomModel, fallback);
    const deepSeekReasoning = deepSeekReasoningForFeature(cfg, costContext && costContext.feature);
    const opts = {
      apiType: cfg.autoExtApiType || 'key',
      key: cfg.autoExtKey,
      deepSeekKey: cfg.autoExtDeepSeekKey,
      deepSeekThinking: deepSeekReasoning.thinking,
      deepSeekReasoning: deepSeekReasoning.reasoning,
      deepSeekJsonSystemPrompt: cfg.deepSeekJsonSystemPrompt || '',
      deepSeekPromptOverridesEnabled: cfg.deepSeekPromptOverridesEnabled !== false,
      openAIBaseUrl: cfg.autoExtOpenAIBaseUrl || '',
      openAIKey: cfg.autoExtOpenAIKey || '',
      openAIReasoning: openAIReasoningForFeature(cfg, costContext && costContext.feature),
      vertexJson: cfg.autoExtVertexJson,
      vertexLocation: cfg.autoExtVertexLocation || 'global',
      vertexProjectId: cfg.autoExtVertexProjectId,
      firebaseScript: cfg.autoExtFirebaseScript,
      firebaseEmbedKey: getGeminiEmbeddingKey(cfg, { allowGenerationKey: (cfg.autoExtApiType || 'key') === 'key' }),
      model,
      maxRetries: cfg.autoExtMaxRetries || 1,
      responseMimeType: 'application/json',
      costContext,
      ...overrides
    };
    const m = String(opts.model || '');
    if (opts.apiType !== 'deepseek' && opts.apiType !== 'openai') {
      const t = thinkingModeForFeature(cfg, costContext && costContext.feature);
      opts.thinkingConfig = {
        ...(opts.thinkingConfig || {}),
        ...geminiThinkingConfigForModel(m, t.mode, t.budget)
      };
      if (m.includes('pro') && opts.thinkingConfig?.thinkingLevel === 'minimal') opts.thinkingConfig.thinkingLevel = 'low';
      if (!Object.keys(opts.thinkingConfig || {}).length) delete opts.thinkingConfig;
    }
    return opts;
  }

  function buildEmbeddingApiOpts(overrides = {}, costContext = null) {
    const cfg = settings.config || {};
    const apiType = cfg.autoExtApiType || 'key';
    const geminiEmbedKey = getGeminiEmbeddingKey(cfg, { allowGenerationKey: apiType === 'key' });
    const opts = {
      apiType,
      key: cfg.autoExtKey,
      vertexJson: cfg.autoExtVertexJson,
      vertexLocation: cfg.autoExtVertexLocation || 'global',
      vertexProjectId: cfg.autoExtVertexProjectId,
      firebaseScript: cfg.autoExtFirebaseScript,
      firebaseEmbedKey: geminiEmbedKey,
      model: cfg.embeddingModel || 'gemini-embedding-001',
      costContext,
      ...overrides
    };
    if (apiType === 'deepseek') {
      opts.apiType = 'key';
      opts.key = geminiEmbedKey || '';
      delete opts.deepSeekKey;
    } else if (apiType === 'openai') {
      opts.apiType = 'key';
      opts.key = geminiEmbedKey || '';
      delete opts.openAIKey;
      delete opts.openAIBaseUrl;
    } else if (apiType === 'firebase') {
      opts.firebaseEmbedKey = geminiEmbedKey || '';
    } else if (apiType === 'key') {
      opts.key = geminiEmbedKey || cfg.autoExtKey || '';
    }
    return opts;
  }

  // R.init은 ensureHeavyRuntimeInit()에서 채팅 경로 진입 시점에만 실행한다.

  try { syncActivePackStateToSettings(); } catch (_) {}

  Object.assign(_w.__LoreInj, {
    C, R, db, _ls,
    defaultSettings, settings,
    parseJsonLoose, createSnapshot, restoreSnapshot, deleteEntryData, deletePackData, cleanupUnusedLoreStorage, convertLegacyEventToTimeline,
    getChatKey, incrementTurnCounter, recordEntryMention,
    getTurnCounter, setTurnCounter,
    getCooldownMap, setCooldownLastTurn,
    getAutoExtPackForUrl, setAutoExtPackForUrl,
    getUrlStateKey, getActivePacksForUrl, getDisabledEntriesForUrl,
    getExtLog, addExtLog, clearExtLog,
    getInjLog, addInjLog, clearInjLog,
    isEntryEnabledForUrl, setPackEnabled, setEntryEnabled,
    readActivePackMap, saveActivePackMap, syncActivePackStateToSettings,
    getApiConfigSnapshot, resetSettingsKeepApi,
    resolveConfiguredModel, getGenerationFallbackModel, normalizeApiModelDefaults, getApiMissingReason, buildGenerationApiOpts, buildEmbeddingApiOpts, getGeminiEmbeddingKey,
    getStableChatStateKey, applyPresetKeepState, backupSettings, getSettingsStorageHealth,
    runLocalMigration, getMigrationStatus, ensureHeavyRuntimeInit,
    __settingsLoaded: true
  });
  console.log('[LoreInj:3] settings+utils loaded');
})();
