// crack-lore-core / embedding 모듈
// 역할: 로어 엔트리에 대한 임베딩 생성/갱신 관리
// 의존: kernel.getDB, kernel.embedText(s), kernel.simpleHash, kernel.DEFAULTS
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:embedding] kernel 미로드'); return; }
  if (C.__embeddingLoaded) return;
  const { getDB, embedText, embedTexts, simpleHash, DEFAULTS } = C;

  function isPromiseEntry(entry) {
    return !!entry && (entry.type === 'promise' || entry.type === 'prom');
  }

  function getPromiseCondition(entry) {
    if (!entry) return '';
    return String(entry.cond || entry.detail?.condition || '').trim();
  }

  function getPromiseStatus(entry) {
    if (!entry) return '';
    return String(entry.state || entry.detail?.status || entry.detail?.current_status || '').trim();
  }

  function entrySearchText(entry) {
    if (!entry) return '';
    const inject = entry.inject && typeof entry.inject === 'object' ? entry.inject : {};
    const detail = entry.detail && typeof entry.detail === 'object' ? entry.detail : {};
    const eventText = Array.isArray(entry.eventHistory)
      ? entry.eventHistory.slice(-4).map(ev => ev && ev.summary).filter(Boolean).join(' / ')
      : '';
    const callText = entry.call && typeof entry.call === 'object'
      ? Object.keys(entry.call).map(k => k + ':' + entry.call[k]).join(' / ')
      : '';
    return [
      entry.name,
      entry.summary,
      entry.state,
      entry.embed_text,
      inject.full,
      inject.compact,
      inject.micro,
      entry.cond,
      detail.condition,
      detail.current_status,
      detail.status,
      detail.current_state,
      callText,
      eventText
    ].filter(Boolean).map(v => String(v).trim()).filter(Boolean).join(' / ');
  }

  async function invalidateEntryEmbeddings(entryId) {
    if (entryId === undefined || entryId === null) return 0;
    const db = getDB();
    let deleted = 0;
    try {
      deleted = await db.embeddings.where('entryId').equals(entryId).delete();
    } catch (_) {}
    try {
      await db.entries.update(entryId, { searchStale: true, searchStaleAt: Date.now() });
    } catch (_) {}
    return deleted || 0;
  }

  async function markEntrySearchReady(entryId) {
    if (entryId === undefined || entryId === null) return;
    const db = getDB();
    try {
      await db.entries.update(entryId, { searchStale: false, searchUpdatedAt: Date.now() });
    } catch (_) {}
  }

  function embeddingModel(apiOpts) {
    return (apiOpts && apiOpts.model) || DEFAULTS.embeddingModel || 'gemini-embedding-001';
  }

  function documentTaskType(apiOpts) {
    const model = embeddingModel(apiOpts);
    return model.includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : (apiOpts && apiOpts.taskType);
  }

  async function ensureEmbedding(entry, apiOpts) {
    const db = getDB();
    const text = entrySearchText(entry);
    if (!text) return;
    const existing = await db.embeddings.where({ entryId: entry.id, field: 'summary' }).first();
    const hash = simpleHash(text);
    const docTaskType = documentTaskType(apiOpts || {});
    const targetModel = embeddingModel(apiOpts || {});

    let shouldUpdateSummary = true;
    if (existing && existing.hash === hash) {
      const needsRegen = (existing.model && existing.model !== targetModel) || (existing.taskType !== docTaskType && targetModel.includes('embedding-001'));
      shouldUpdateSummary = !!needsRegen;
    }

    if (shouldUpdateSummary) {
      const vec = await embedText(text, Object.assign({}, apiOpts, { taskType: docTaskType }));
      const data = {
        entryId: entry.id, field: 'summary', vector: vec, hash, model: targetModel,
        taskType: docTaskType, updatedAt: Date.now()
      };
      if (existing) data.id = existing.id;
      await db.embeddings.put(data);
    }

    const condText = isPromiseEntry(entry) ? getPromiseCondition(entry) : '';
    if (condText) {
      const condHash = simpleHash(condText);
      const existingCond = await db.embeddings.where({ entryId: entry.id, field: 'condition' }).first();

      let shouldUpdateCond = true;
      if (existingCond && existingCond.hash === condHash) {
        const needsRegenCond = (existingCond.model && existingCond.model !== targetModel) || (existingCond.taskType !== docTaskType && targetModel.includes('embedding-001'));
        shouldUpdateCond = !!needsRegenCond;
      }

      if (shouldUpdateCond) {
        const condVec = await embedText(condText, Object.assign({}, apiOpts, { taskType: docTaskType }));
        const condData = {
          entryId: entry.id, field: 'condition', vector: condVec, hash: condHash, model: targetModel,
          taskType: docTaskType, updatedAt: Date.now()
        };
        if (existingCond) condData.id = existingCond.id;
        await db.embeddings.put(condData);
      }
    }

    await markEntrySearchReady(entry.id);
  }

  async function embedPack(packName, apiOpts, onProgress) {
    const db = getDB();
    const entries = await db.entries.where('packName').equals(packName).toArray();
    const docTaskType = documentTaskType(apiOpts || {});
    const targetModel = embeddingModel(apiOpts || {});
    let done = 0;

    const ids = entries.map(e => e.id).filter(id => id !== undefined && id !== null);
    const allEmbs = ids.length ? await db.embeddings.where('entryId').anyOf(ids).toArray() : [];
    const embMap = {};
    for (const eb of allEmbs) { if (eb.field === 'summary') embMap[eb.entryId] = eb; }

    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      const texts = batch.map(entrySearchText);
      try {
        const vecs = await embedTexts(texts, Object.assign({}, apiOpts, { taskType: docTaskType }));
        for (let j = 0; j < batch.length; j++) {
          const hash = simpleHash(texts[j]);
          const existing = embMap[batch[j].id];
          const data = {
            entryId: batch[j].id, field: 'summary', vector: vecs[j], hash,
            model: targetModel, taskType: docTaskType, updatedAt: Date.now()
          };
          if (existing) data.id = existing.id;
          await db.embeddings.put(data);
          await markEntrySearchReady(batch[j].id);
        }
      } catch (e) {
        console.warn('[LoreCore] 배치 임베딩 실패, 개별 처리:', e.message);
        for (const entry of batch) { try { await ensureEmbedding(entry, apiOpts); } catch (e2) {} }
      }
      done += batch.length;
      if (onProgress) onProgress(done, entries.length);
    }
    return done;
  }

  async function convertLegacyPack(packName, apiOpts, onProgress) {
    return await embedPack(packName, apiOpts, onProgress);
  }

  Object.assign(C, {
    entrySearchText,
    isPromiseEntry,
    getPromiseCondition,
    getPromiseStatus,
    invalidateEntryEmbeddings,
    markEntrySearchReady,
    ensureEmbedding,
    embedPack,
    convertLegacyPack,
    __embeddingLoaded: true
  });
  console.log('[LoreCore:embedding] loaded');
})();