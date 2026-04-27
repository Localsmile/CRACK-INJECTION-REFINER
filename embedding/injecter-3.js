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
    OOC_FORMATS,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
    DEFAULT_AUTO_EXTRACT_SCHEMA
  } = _w.__LoreInj;

  const db = C.getDB();
  const _ls = _w.localStorage;

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

  function getApiConfigSnapshot(config) {
    const keys = [
      'autoExtApiType', 'autoExtKey', 'autoExtVertexJson', 'autoExtVertexLocation', 'autoExtVertexProjectId',
      'autoExtFirebaseScript', 'autoExtFirebaseEmbedKey', 'autoExtModel', 'autoExtCustomModel',
      'autoExtReasoning', 'autoExtBudget', 'embeddingModel', 'rerankModel', 'refinerModel', 'refinerCustomModel'
    ];
    const out = {};
    keys.forEach(k => { if (config && config[k] !== undefined) out[k] = config[k]; });
    return out;
  }

  function resetSettingsKeepApi() {
    const api = getApiConfigSnapshot(settings.config);
    const preserved = {
      urlPacks: settings.config.urlPacks || {},
      urlAutoExtPacks: settings.config.urlAutoExtPacks || {},
      autoPacks: settings.config.autoPacks || ['자동추출']
    };
    settings.config = JSON.parse(JSON.stringify(defaultSettings));
    Object.assign(settings.config, api, preserved);
    settings.save();
  }

  function parseJsonLoose(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try { return JSON.parse(t); } catch {}
    const firstBracket = t.search(/[\[{]/);
    if (firstBracket >= 0) {
      const open = t[firstBracket];
      const close = open === '[' ? ']' : '}';
      const lastClose = t.lastIndexOf(close);
      if (lastClose > firstBracket) {
        try { return JSON.parse(t.slice(firstBracket, lastClose + 1)); } catch {}
      }
    }
    return null;
  }

  async function createSnapshot(packName, label, type = 'auto') {
    const entries = await db.entries.where('packName').equals(packName).toArray();
    const clean = entries.map(({ id, ...rest }) => rest);
    await db.snapshots.add({ packName, timestamp: Date.now(), label: label || '자동 저장', type, data: clean });
    const all = await db.snapshots.where('packName').equals(packName).sortBy('timestamp');
    if (all.length > 10) await db.snapshots.bulkDelete(all.slice(0, all.length - 10).map(s => s.id));
  }

  async function restoreSnapshot(snapshotId) {
    const snap = await db.snapshots.get(snapshotId);
    if (!snap) return false;
    await db.transaction('rw', db.packs, db.entries, async () => {
      await db.entries.where('packName').equals(snap.packName).delete();
      for (const e of snap.data) await db.entries.add(e);
      await db.packs.update(snap.packName, { entryCount: snap.data.length });
    });
    return true;
  }

  const defaultSettings = {
    enabled: true, position: 'before',
    prefix: OOC_FORMATS.default.prefix, suffix: OOC_FORMATS.default.suffix,
    scanRange: 5, scanOffset: 2, maxEntries: 3, cooldownEnabled: true, cooldownTurns: 3,
    strictMatch: true, similarityMatch: true, activeProject: '',

    autoExtEnabled: true, autoExtTurns: 5, autoExtScanRange: 5, autoExtOffset: 3, autoExtPack: '자동추출', autoExtMaxRetries: 1,
    autoExtApiType: 'key', autoExtVertexJson: '', autoExtVertexLocation: 'global', autoExtVertexProjectId: '',
    autoExtFirebaseScript: '', autoExtFirebaseEmbedKey: '',
    autoExtKey: '', autoExtModel: 'gemini-3-flash-preview', autoExtCustomModel: '', autoExtReasoning: 'medium', autoExtBudget: 2048,
    autoExtPrefix: '', autoExtSuffix: '', autoExtIncludeDb: true, autoExtIncludePersona: true,

    activeTemplateId: 'default',
    templates: [{ id: 'default', name: '기본 프롬프트', isDefault: true, schema: DEFAULT_AUTO_EXTRACT_SCHEMA, promptWithoutDb: DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB, promptWithDb: DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB }],
    autoPacks: ['자동추출'], urlPacks: {}, urlDisabledEntries: {},
    urlTurnCounters: {}, urlCooldownMaps: {}, urlAutoExtPacks: {}, urlExtLogs: {}, urlInjLogs: {},

    embeddingEnabled: true, activeCharDetection: true, decayEnabled: true,
    loreBudgetChars: 300, loreBudgetMax: 500,
    compressionMode: 'full', embeddingWeight: 0.35, useCompressedFormat: false,
    honorificMatrixEnabled: true, firstEncounterWarning: true, activeCharBoostEnabled: true,
    decayHalfLife: C.DEFAULTS.decayHalfLife,
    embeddingModel: 'gemini-embedding-001', autoEmbedOnExtract: true,
    aiMemoryTurns: 3, importanceGating: true, importanceThreshold: 12, pendingPromiseBoost: true,
    oocFormat: 'custom', rerankEnabled: false, rerankModel: 'gemini-3-flash-preview',
    rerankPrompt: C.DEFAULTS.rerankPrompt,

    refinerEnabled: false, refinerAutoMode: false, refinerPassKeyword: 'PASS',
    refinerContextTurns: 3, refinerCustomPrompt: defaultRefinerPrompt(), refinerLoreMode: 'semantic', refinerMatchTurns: 5,
    refinerUseDynamic: true, refinerTopics: defaultRefinerTopics(), refinerPromptVersion: R ? R.PROMPT_VERSION : '',
    urlRefinerLogs: {},

    localMigrationVersion: '',
    migrationStatus: { version: '', oldFormatDetected: false, migratedEntries: 0, staleEmbeddingsRemoved: 0, checkedAt: 0, message: '' }
  };

  const settings = {
    config: JSON.parse(JSON.stringify(defaultSettings)),
    _lastSaveTime: 0,
    save: function() {
      try { this._lastSaveTime = Date.now(); _ls.setItem('lore-injector-v5', JSON.stringify(this.config)); } catch(e) {}
    },
    load: function() {
      try {
        const saved = _ls.getItem('lore-injector-v5');
        if (saved) {
          const p = JSON.parse(saved);
          if (p && typeof p === 'object') {
            for (const k in p) { if (p[k] !== undefined) this.config[k] = p[k]; }
            if (Array.isArray(this.config.templates)) {
              const dT = this.config.templates.find(t => t.isDefault || t.id === 'default');
              if (dT) {
                dT.schema = DEFAULT_AUTO_EXTRACT_SCHEMA;
                dT.promptWithoutDb = DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB;
                dT.promptWithDb = DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB;
              }
            }
          }
        }

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

    const now = Date.now();
    if (!entry.createdTurn) patch.createdTurn = eventTurn || currentTurn || 0;
    if (!entry.updatedTurn) patch.updatedTurn = currentTurn || eventTurn || 0;
    if (!entry.realTimestamp && (entry.lastUpdated || entry.ts)) patch.realTimestamp = entry.lastUpdated || entry.ts;
    if (!entry.migratedFromVersion || oldFormat) patch.migratedFromVersion = entry.migratedFromVersion || 'pre-1.4.0-test';
    patch.localMigrationVersion = C.LOCAL_MIGRATION_VERSION || '1.4.0-test-pass8-local';
    patch.lastMigrationAt = now;

    return { patch, oldFormat };
  }

  async function runLocalMigration() {
    const target = C.LOCAL_MIGRATION_VERSION || '1.4.0-test-pass8-local';
    const last = _ls.getItem('lore-local-migration-version') || settings.config.localMigrationVersion || '';
    const status = { version: target, oldFormatDetected: false, migratedEntries: 0, staleEmbeddingsRemoved: 0, checkedAt: Date.now(), message: '' };
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
        const clean = await C.cleanupStaleEmbeddings(null, { model: settings.config.embeddingModel || C.DEFAULTS.embeddingModel });
        status.staleEmbeddingsRemoved = clean.removed || 0;
      }
      status.message = status.oldFormatDetected
        ? 'Old lore format detected and locally migrated. Review recommended.'
        : 'Local migration check complete.';
      settings.config.localMigrationVersion = target;
      settings.config.migrationStatus = status;
      settings.save();
      _ls.setItem('lore-local-migration-version', target);
      _ls.setItem('lore-local-migration-status', JSON.stringify(status));
    } catch (e) {
      status.message = 'Local migration failed: ' + (e.message || String(e));
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
  await runLocalMigration();
  window.addEventListener('storage', (e) => { if (e.key === 'lore-injector-v5') settings.load(); });
  window.addEventListener('focus', () => { if (Date.now() - (settings._lastSaveTime || 0) > 3000) settings.load(); });

  function getChatKey() {
    try { const id = C.getCurrentChatId(); if (id) return 'chat:' + id; } catch(e) {}
    const m = window.location.pathname.match(/\/(?:chats|episodes)\/([a-f0-9]+)/);
    if (m) return 'chat:' + m[1];
    return C.getCurUrl();
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
    if (settings.config.urlAutoExtPacks[url]) return settings.config.urlAutoExtPacks[url];
    let baseName = '자동추출';
    try {
      let chatId = C.getCurrentChatId();
      if (!chatId) { const match = url.match(/\/episodes\/([a-f0-9]+)/); if (match) chatId = match[1]; }
      if (chatId) {
        const room = await CrackUtil.chatRoom().roomData(chatId);
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
    settings.config.urlAutoExtPacks[url] = finalName; settings.save();
    return finalName;
  }
  function setAutoExtPackForUrl(url, packName) {
    if (!settings.config.urlAutoExtPacks) settings.config.urlAutoExtPacks = {};
    settings.config.urlAutoExtPacks[url] = packName; settings.save();
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
    const curUrl = C.getCurUrl();
    const packs = settings.config.urlPacks?.[curUrl] || [];
    const disabled = settings.config.urlDisabledEntries?.[curUrl] || [];
    return packs.includes(entry.packName) && !disabled.includes(entry.id);
  }

  async function setPackEnabled(packName, state) {
    const curUrl = C.getCurUrl();
    const up = JSON.parse(JSON.stringify(settings.config.urlPacks || {}));
    const ud = JSON.parse(JSON.stringify(settings.config.urlDisabledEntries || {}));
    up[curUrl] = up[curUrl] || []; ud[curUrl] = ud[curUrl] || [];
    if (state) {
      if (!up[curUrl].includes(packName)) up[curUrl].push(packName);
      const its = await db.entries.where('packName').equals(packName).toArray();
      const ids = its.map(x => x.id);
      ud[curUrl] = ud[curUrl].filter(id => !ids.includes(id));
    } else {
      up[curUrl] = up[curUrl].filter(p => p !== packName);
    }
    settings.config.urlPacks = up; settings.config.urlDisabledEntries = ud; settings.save();
  }

  function setEntryEnabled(entry, state) {
    const curUrl = C.getCurUrl();
    const up = JSON.parse(JSON.stringify(settings.config.urlPacks || {}));
    const ud = JSON.parse(JSON.stringify(settings.config.urlDisabledEntries || {}));
    up[curUrl] = up[curUrl] || []; ud[curUrl] = ud[curUrl] || [];
    if (state) {
      ud[curUrl] = ud[curUrl].filter(id => id !== entry.id);
      if (!up[curUrl].includes(entry.packName)) up[curUrl].push(entry.packName);
    } else {
      if (!ud[curUrl].includes(entry.id)) ud[curUrl].push(entry.id);
    }
    settings.config.urlPacks = up; settings.config.urlDisabledEntries = ud; settings.save();
  }

  // R.init
  if (R) {
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
      (url) => settings.config.urlPacks?.[url] || []
    );
  }

  Object.assign(_w.__LoreInj, {
    C, R, db, _ls,
    defaultSettings, settings,
    parseJsonLoose, createSnapshot, restoreSnapshot,
    getChatKey, incrementTurnCounter, recordEntryMention,
    getTurnCounter, setTurnCounter,
    getCooldownMap, setCooldownLastTurn,
    getAutoExtPackForUrl, setAutoExtPackForUrl,
    getExtLog, addExtLog, clearExtLog,
    getInjLog, addInjLog, clearInjLog,
    isEntryEnabledForUrl, setPackEnabled, setEntryEnabled,
    getApiConfigSnapshot, resetSettingsKeepApi,
    runLocalMigration, getMigrationStatus,
    __settingsLoaded: true
  });
  console.log('[LoreInj:3] settings+utils loaded');
})();
