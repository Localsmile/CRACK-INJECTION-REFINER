// crack-lore-core / embedding 모듈
// 역할: 로어 엔트리에 대한 임베딩 생성/갱신 관리 + stale embedding cleanup
// 의존: kernel.getDB, kernel.embedText(s), kernel.simpleHash, kernel.DEFAULTS
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:embedding] kernel 미로드'); return; }
  if (C.__embeddingLoaded) return;
  const { getDB, embedText, embedTexts, simpleHash, DEFAULTS } = C;

  const EMB_SCHEMA_VERSION = 2;

  function summaryText(entry, level) {
    const s = entry && entry.summary;
    if (!s) return '';
    if (typeof s === 'object' && !Array.isArray(s)) return String(s[level] || s.full || s.compact || s.micro || '');
    return String(s || '');
  }

  function flattenCallState(entry) {
    const parts = [];
    const cs = entry && entry.callState;
    if (cs && typeof cs === 'object') {
      for (const [pair, v] of Object.entries(cs)) {
        if (!v) continue;
        if (typeof v === 'string') parts.push(`${pair} ${v}`);
        else parts.push([pair, v.currentTerm, ...(Array.isArray(v.previousTerms) ? v.previousTerms.slice(0, 2) : []), v.tone, v.scope, v.reason].filter(Boolean).join(' '));
      }
    }
    if (entry && entry.call && typeof entry.call === 'object') {
      for (const [pair, term] of Object.entries(entry.call)) parts.push(`${pair} ${term}`);
    }
    return parts.join(' ');
  }

  function buildEmbeddingText(entry, field = 'summary') {
    if (!entry) return '';
    if (field === 'condition') return String(entry.cond || entry.detail?.condition || '');
    const detail = entry.detail || {};
    const parties = Array.isArray(entry.parties) ? entry.parties : (Array.isArray(detail.parties) ? detail.parties : []);
    const entities = Array.isArray(entry.entities) ? entry.entities : [];
    const timeline = entry.timeline && typeof entry.timeline === 'object'
      ? [entry.timeline.sceneLabel, entry.timeline.relativeOrder, entry.timeline.observedRecency, entry.timeline.eventTurn ? 't' + entry.timeline.eventTurn : ''].filter(Boolean).join(' ')
      : '';
    const events = Array.isArray(entry.eventHistory)
      ? entry.eventHistory.slice(-4).map(ev => ev && ev.summary).filter(Boolean).join(' ')
      : '';
    const hooks = [entry.state, detail.current_status, detail.status, entry.cond, detail.condition].filter(Boolean).join(' ');
    const aliases = []
      .concat(Array.isArray(entry.aliases) ? entry.aliases : [])
      .concat(Array.isArray(detail.aliases) ? detail.aliases : [])
      .concat(detail.nicknames && typeof detail.nicknames === 'object' ? Object.values(detail.nicknames) : []);
    return [
      entry.name,
      entry.type,
      aliases.join(' '),
      (entry.triggers || []).join(' '),
      (entry.embed_text || ''),
      parties.join(' '),
      entities.join(' '),
      hooks,
      flattenCallState(entry),
      timeline,
      events,
      summaryText(entry, 'full'),
      summaryText(entry, 'compact'),
      summaryText(entry, 'micro')
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function embeddingSourceHash(entry, field = 'summary') {
    return simpleHash(buildEmbeddingText(entry, field));
  }

  function embeddingMeta(entry, field, text, apiOpts, taskType) {
    return {
      entryId: entry.id,
      field,
      packName: entry.packName || '',
      entryUpdatedAt: entry.lastUpdated || entry.ts || 0,
      sourceHash: simpleHash(text),
      hash: simpleHash(text),
      schemaVersion: EMB_SCHEMA_VERSION,
      model: apiOpts.model || DEFAULTS.embeddingModel,
      taskType,
      updatedAt: Date.now()
    };
  }

  async function invalidateEntryEmbeddings(entryId) {
    if (entryId == null) return 0;
    const db = getDB();
    return await db.embeddings.where('entryId').equals(entryId).delete();
  }

  async function cleanupStaleEmbeddings(packName, apiOpts = {}) {
    const db = getDB();
    const allEntries = await db.entries.toArray();
    const entryMap = {};
    for (const e of allEntries) entryMap[e.id] = e;
    const allRaw = await db.embeddings.toArray();
    const all = packName ? allRaw.filter(eb => {
      const entry = entryMap[eb.entryId];
      if (entry) return entry.packName === packName;
      return eb.packName === packName;
    }) : allRaw;
    const targetModel = apiOpts.model || DEFAULTS.embeddingModel;
    let removed = 0, staleHash = 0, missingEntry = 0, wrongModel = 0, wrongPack = 0;
    for (const eb of all) {
      const entry = entryMap[eb.entryId];
      let del = false;
      if (!entry) { del = true; missingEntry++; }
      else if (eb.packName && eb.packName !== entry.packName) { del = true; wrongPack++; }
      else {
        const field = eb.field || 'summary';
        const expectedHash = embeddingSourceHash(entry, field);
        if ((eb.sourceHash || eb.hash) !== expectedHash) { del = true; staleHash++; }
        else if (targetModel && eb.model && eb.model !== targetModel) { del = true; wrongModel++; }
      }
      if (del) {
        await db.embeddings.delete(eb.id);
        removed++;
      }
    }
    return { removed, missingEntry, staleHash, wrongModel, wrongPack, checked: all.length };
  }

  async function ensureEmbedding(entry, apiOpts) {
    const db = getDB();
    const field = 'summary';
    const text = buildEmbeddingText(entry, field);
    if (!text) return;
    const hash = simpleHash(text);
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    const targetModel = apiOpts.model || DEFAULTS.embeddingModel;
    const existing = await db.embeddings.where({ entryId: entry.id, field }).first();

    const summaryFresh = existing && (existing.sourceHash || existing.hash) === hash &&
      !(existing.model && existing.model !== targetModel) &&
      !(existing.taskType !== docTaskType && targetModel.includes('embedding-001')) &&
      existing.schemaVersion === EMB_SCHEMA_VERSION &&
      existing.packName === entry.packName;

    if (!summaryFresh) {
      const vec = await embedText(text, { ...apiOpts, taskType: docTaskType });
      const data = {
        ...embeddingMeta(entry, field, text, { ...apiOpts, model: targetModel }, docTaskType),
        vector: vec
      };
      if (existing) data.id = existing.id;
      await db.embeddings.put(data);
    }

    const condText = buildEmbeddingText(entry, 'condition');
    if ((entry.type === 'promise' || entry.type === 'prom') && condText) {
      const condHash = simpleHash(condText);
      const existingCond = await db.embeddings.where({ entryId: entry.id, field: 'condition' }).first();
      if (existingCond && (existingCond.sourceHash || existingCond.hash) === condHash) {
        const needsRegenCond = (existingCond.model && existingCond.model !== targetModel) ||
          (existingCond.taskType !== docTaskType && targetModel.includes('embedding-001')) ||
          existingCond.schemaVersion !== EMB_SCHEMA_VERSION ||
          existingCond.packName !== entry.packName;
        if (!needsRegenCond) return;
      }
      const condVec = await embedText(condText, { ...apiOpts, taskType: docTaskType });
      const condData = {
        ...embeddingMeta(entry, 'condition', condText, { ...apiOpts, model: targetModel }, docTaskType),
        vector: condVec
      };
      if (existingCond) condData.id = existingCond.id;
      await db.embeddings.put(condData);
    }
  }

  async function embedPack(packName, apiOpts, onProgress) {
    const db = getDB();
    const entries = await db.entries.where('packName').equals(packName).toArray();
    const cleanup = await cleanupStaleEmbeddings(packName, apiOpts);
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    const targetModel = apiOpts.model || DEFAULTS.embeddingModel;

    const allEmbs = entries.length ? await db.embeddings.where('entryId').anyOf(entries.map(e => e.id)).toArray() : [];
    const embMap = {};
    for (const eb of allEmbs) { if (eb.field === 'summary') embMap[eb.entryId] = eb; }

    const pending = entries.filter(e => {
      const text = buildEmbeddingText(e, 'summary');
      const hash = simpleHash(text);
      const existing = embMap[e.id];
      return !existing ||
        (existing.sourceHash || existing.hash) !== hash ||
        existing.model !== targetModel ||
        existing.schemaVersion !== EMB_SCHEMA_VERSION ||
        (targetModel.includes('embedding-001') && existing.taskType !== docTaskType) ||
        existing.packName !== e.packName;
    });

    let done = 0;
    for (let i = 0; i < pending.length; i += 5) {
      const batch = pending.slice(i, i + 5);
      const texts = batch.map(e => buildEmbeddingText(e, 'summary'));
      try {
        const vecs = await embedTexts(texts, { ...apiOpts, taskType: docTaskType, model: targetModel });
        for (let j = 0; j < batch.length; j++) {
          const existing = embMap[batch[j].id];
          const data = {
            ...embeddingMeta(batch[j], 'summary', texts[j], { ...apiOpts, model: targetModel }, docTaskType),
            vector: vecs[j]
          };
          if (existing) data.id = existing.id;
          await db.embeddings.put(data);
        }
      } catch (e) {
        console.warn('[LoreCore] 배치 임베딩 실패, 개별 처리:', e.message);
        for (const entry of batch) { try { await ensureEmbedding(entry, { ...apiOpts, model: targetModel }); } catch (e2) {} }
      }
      done += batch.length;
      if (onProgress) onProgress(done, pending.length, cleanup);
    }
    return done;
  }

  async function convertLegacyPack(packName, apiOpts, onProgress) {
    return await embedPack(packName, apiOpts, onProgress);
  }

  Object.assign(C, {
    buildEmbeddingText, embeddingSourceHash, cleanupStaleEmbeddings, invalidateEntryEmbeddings,
    ensureEmbedding, embedPack, convertLegacyPack,
    __embeddingLoaded: true
  });
  console.log('[LoreCore:embedding] loaded');
})();
