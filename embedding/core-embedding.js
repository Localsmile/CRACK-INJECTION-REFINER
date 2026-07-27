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
  const EMBED_BATCH_SIZE = 20;
  const VERTEX_EMBED_BATCH_SIZE = 5;
  const EMBED_BATCH_GAP_MS = 1200;

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

  function buildTimelineEmbeddingText(entry) {
    if (!entry) return '';
    const when = entry.when && typeof entry.when === 'object' ? entry.when : {};
    const timeline = entry.timeline && typeof entry.timeline === 'object' ? entry.timeline : {};
    const emotions = [];
    if (entry.emotions && typeof entry.emotions === 'object' && !Array.isArray(entry.emotions)) {
      for (const [who, vals] of Object.entries(entry.emotions)) {
        emotions.push(who, ...(Array.isArray(vals) ? vals : [vals]).filter(Boolean));
      }
    }
    return [
      entry.title,
      entry.name,
      entry.type,
      entry.eventId,
      when.anchor,
      when.inferredOrder,
      when.relative,
      when.turnStart ? 'start t' + when.turnStart : '',
      when.turnEnd ? 'end t' + when.turnEnd : '',
      timeline.sceneLabel,
      timeline.relativeOrder,
      timeline.observedRecency,
      entry.location,
      Array.isArray(entry.participants) ? entry.participants.join(' ') : '',
      Array.isArray(entry.entities) ? entry.entities.join(' ') : '',
      Array.isArray(entry.actions) ? entry.actions.join(' ') : '',
      emotions.join(' '),
      Array.isArray(entry.hooks) ? entry.hooks.join(' ') : '',
      Array.isArray(entry.recallTriggers) ? entry.recallTriggers.join(' ') : '',
      Array.isArray(entry.triggers) ? entry.triggers.join(' ') : '',
      Array.isArray(entry.linkedLore) ? entry.linkedLore.join(' ') : '',
      Array.isArray(entry.locations) ? entry.locations.join(' ') : '',
      entry.relativeTimeHint,
      entry.embed_text || '',
      summaryText(entry, 'full'),
      summaryText(entry, 'compact'),
      summaryText(entry, 'micro')
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function buildEmbeddingText(entry, field = 'summary') {
    if (!entry) return '';
    if (field === 'condition') return String(entry.cond || entry.detail?.condition || '');
    if (C.isTimelineEvent && C.isTimelineEvent(entry)) return buildTimelineEmbeddingText(entry);
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

  function isEmbeddingFresh(existing, entry, field, text, targetModel, taskType) {
    if (!existing || !text) return false;
    const taskTypeMismatch = taskType != null && existing.taskType != null && existing.taskType !== taskType;
    return (existing.sourceHash || existing.hash) === simpleHash(text) &&
      !(existing.model && existing.model !== targetModel) &&
      !taskTypeMismatch &&
      existing.schemaVersion === EMB_SCHEMA_VERSION &&
      existing.packName === entry.packName;
  }

  function needsConditionEmbedding(entry) {
    return !!(entry && (entry.type === 'promise' || entry.type === 'prom') && buildEmbeddingText(entry, 'condition'));
  }

  function assertEmbeddingVectors(vectors, expectedCount) {
    if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
      throw new Error('임베딩 결과 수가 요청 수와 다릅니다.');
    }
    if (vectors.some(vector => !Array.isArray(vector) || !vector.length || vector.some(value => !Number.isFinite(value)))) {
      throw new Error('임베딩 결과에 사용할 수 없는 벡터가 포함되어 있습니다.');
    }
  }

  function isTransientEmbeddingFailure(error) {
    return /\b(?:408|409|425|429|5\d{2})\b|네트워크 오류|타임아웃|failed to fetch|networkerror|load failed|fetch/i.test(String(error && error.message || error || ''));
  }

  async function ensureEmbedding(entry, apiOpts) {
    const db = getDB();
    const field = 'summary';
    const text = buildEmbeddingText(entry, field);
    if (!text) return;
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    const targetModel = apiOpts.model || DEFAULTS.embeddingModel;
    const existing = await db.embeddings.where({ entryId: entry.id, field }).first();

    // B22 fix(test.42): taskType 비교를 모든 임베딩 모델로 일반화.
    //   기존: embedding-001 모델일 때만 taskType mismatch 감지 → 다른 임베딩 모델로 전환 시
    //   RETRIEVAL_QUERY로 생성된 stale 임베딩이 그대로 유지되는 결함.
    //   수정: docTaskType이 정의되어 있고 existing.taskType과 다르면 일률적으로 stale.
    //   둘 중 하나가 null/undefined면 비교 생략 (구버전 호환).
    const summaryFresh = isEmbeddingFresh(existing, entry, field, text, targetModel, docTaskType);

    if (!summaryFresh) {
      const vec = await embedText(text, { ...apiOpts, taskType: docTaskType });
      assertEmbeddingVectors([vec], 1);
      const data = {
        ...embeddingMeta(entry, field, text, { ...apiOpts, model: targetModel }, docTaskType),
        vector: vec
      };
      if (existing) data.id = existing.id;
      await db.embeddings.put(data);
    }

    const condText = buildEmbeddingText(entry, 'condition');
    if ((entry.type === 'promise' || entry.type === 'prom') && condText) {
      const existingCond = await db.embeddings.where({ entryId: entry.id, field: 'condition' }).first();
      if (isEmbeddingFresh(existingCond, entry, 'condition', condText, targetModel, docTaskType)) return;
      const condVec = await embedText(condText, { ...apiOpts, taskType: docTaskType });
      assertEmbeddingVectors([condVec], 1);
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
    let cleanup = { removed: 0, deferred: true };
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    const targetModel = apiOpts.model || DEFAULTS.embeddingModel;

    const allEmbs = entries.length ? await db.embeddings.where('entryId').anyOf(entries.map(e => e.id)).toArray() : [];
    const summaryMap = {};
    const conditionMap = {};
    for (const eb of allEmbs) {
      if (eb.field === 'summary') summaryMap[eb.entryId] = eb;
      else if (eb.field === 'condition') conditionMap[eb.entryId] = eb;
    }

    const pendingSummary = entries.filter(entry => {
      const text = buildEmbeddingText(entry, 'summary');
      return !!text && !isEmbeddingFresh(summaryMap[entry.id], entry, 'summary', text, targetModel, docTaskType);
    });
    const initiallyPendingConditions = entries.filter(entry => {
      if (!needsConditionEmbedding(entry)) return false;
      const text = buildEmbeddingText(entry, 'condition');
      return !isEmbeddingFresh(conditionMap[entry.id], entry, 'condition', text, targetModel, docTaskType);
    });
    const requiredFields = new Map();
    for (const entry of pendingSummary) requiredFields.set(entry.id, new Set(['summary']));
    for (const entry of initiallyPendingConditions) {
      const fields = requiredFields.get(entry.id) || new Set();
      fields.add('condition');
      requiredFields.set(entry.id, fields);
    }
    const total = requiredFields.size;
    if (!total) {
      cleanup = await cleanupStaleEmbeddings(packName, apiOpts);
      if (onProgress) onProgress(0, 0, cleanup);
      return 0;
    }

    const completed = new Set();
    const failed = [];
    const failedEntryIds = new Set();
    const markFieldComplete = (entry, field) => {
      const fields = requiredFields.get(entry.id);
      if (!fields) return;
      fields.delete(field);
      if (!fields.size) completed.add(entry.id);
      if (onProgress) onProgress(completed.size, total, cleanup);
    };
    const defaultBatchSize = apiOpts.apiType === 'vertex' ? VERTEX_EMBED_BATCH_SIZE : EMBED_BATCH_SIZE;
    const batchSize = Math.max(1, Number(apiOpts.embeddingBatchSize || defaultBatchSize) || defaultBatchSize);
    const batchGapMs = Math.max(0, Number(apiOpts.embeddingBatchGapMs != null ? apiOpts.embeddingBatchGapMs : EMBED_BATCH_GAP_MS) || 0);

    const writeBatch = async (batch, field, map) => {
      const texts = batch.map(entry => buildEmbeddingText(entry, field));
      const vecs = await embedTexts(texts, { ...apiOpts, taskType: docTaskType, model: targetModel });
      assertEmbeddingVectors(vecs, batch.length);
      for (let index = 0; index < batch.length; index++) {
        const entry = batch[index];
        const existing = map[entry.id];
        const data = {
          ...embeddingMeta(entry, field, texts[index], { ...apiOpts, model: targetModel }, docTaskType),
          vector: vecs[index]
        };
        if (existing) data.id = existing.id;
        await db.embeddings.put(data);
        map[entry.id] = data;
        markFieldComplete(entry, field);
      }
    };

    const runBatches = async (pending, field, map) => {
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        try {
          await writeBatch(batch, field, map);
        } catch (batchError) {
          // A transient provider failure already exhausted bounded backoff in embedTexts.
          // Splitting it into individual calls would multiply 429/5xx traffic.
          if (isTransientEmbeddingFailure(batchError)) throw batchError;
          console.warn('[LoreCore] 배치 임베딩 실패, 개별 재시도:', batchError && batchError.message ? batchError.message : batchError);
          for (const entry of batch) {
            try {
              await ensureEmbedding(entry, { ...apiOpts, model: targetModel });
              markFieldComplete(entry, field);
              if (field === 'summary' && requiredFields.get(entry.id)?.has('condition')) {
                const condition = await db.embeddings.where({ entryId: entry.id, field: 'condition' }).first();
                const text = buildEmbeddingText(entry, 'condition');
                if (isEmbeddingFresh(condition, entry, 'condition', text, targetModel, docTaskType)) {
                  conditionMap[entry.id] = condition;
                  markFieldComplete(entry, 'condition');
                }
              }
            } catch (entryError) {
              failedEntryIds.add(entry.id);
              failed.push({ entry, field, error: entryError });
            }
          }
        }
        if (batchGapMs > 0 && i + batchSize < pending.length) await wait(batchGapMs);
      }
    };

    await runBatches(pendingSummary, 'summary', summaryMap);

    const refreshedConditions = entries.length ? await db.embeddings.where('entryId').anyOf(entries.map(e => e.id)).toArray() : [];
    for (const embedding of refreshedConditions) if (embedding.field === 'condition') conditionMap[embedding.entryId] = embedding;
    const pendingConditions = initiallyPendingConditions.filter(entry => {
      if (failedEntryIds.has(entry.id)) return false;
      const text = buildEmbeddingText(entry, 'condition');
      const fresh = isEmbeddingFresh(conditionMap[entry.id], entry, 'condition', text, targetModel, docTaskType);
      if (fresh) markFieldComplete(entry, 'condition');
      return !fresh;
    });
    await runBatches(pendingConditions, 'condition', conditionMap);

    if (failed.length) {
      const names = failed.slice(0, 3).map(item => item.entry && item.entry.name || '이름 없는 로어').join(', ');
      const detail = failed[0].error && (failed[0].error.message || String(failed[0].error));
      throw new Error('검색 준비 실패: ' + failed.length + '개 항목 (' + names + ')' + (detail ? ' / ' + detail : ''));
    }
    cleanup = await cleanupStaleEmbeddings(packName, apiOpts);
    if (onProgress) onProgress(completed.size, total, cleanup);
    return completed.size;
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
