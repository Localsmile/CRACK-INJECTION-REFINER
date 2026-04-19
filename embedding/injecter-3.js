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
    refinerContextTurns: 1, refinerCustomPrompt: R ? R.DEFAULT_PROMPT : '', refinerLoreMode: 'semantic', refinerMatchTurns: 5,
    urlRefinerLogs: {}
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
              const isLegacy = !saved || R2.LEGACY_PROMPTS.some(p => norm(p) === norm(saved));
              if (isLegacy) this.config.refinerCustomPrompt = R2.DEFAULT_PROMPT;
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

  settings.load();
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
    __settingsLoaded: true
  });
  console.log('[LoreInj:3] settings+utils loaded');
})();
