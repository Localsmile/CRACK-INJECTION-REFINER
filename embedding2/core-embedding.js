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

  async function ensureEmbedding(entry, apiOpts) {
    const db = getDB();
    const existing = await db.embeddings.where({ entryId: entry.id, field: 'summary' }).first();
    const text = entry.embed_text
      ? `${entry.name} ${entry.embed_text}`
      : `${entry.name}: ${entry.summary || ''}`;
    const hash = simpleHash(text);
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    const targetModel = apiOpts.model || DEFAULTS.embeddingModel;

    if (existing && existing.hash === hash) {
      const needsRegen = (existing.model && existing.model !== targetModel) || (existing.taskType !== docTaskType && targetModel.includes('embedding-001'));
      if (!needsRegen) return;
    }

    const vec = await embedText(text, { ...apiOpts, taskType: docTaskType });
    const data = {
      entryId: entry.id, field: 'summary', vector: vec, hash, model: targetModel,
      taskType: docTaskType, updatedAt: Date.now()
    };
    if (existing) data.id = existing.id;
    await db.embeddings.put(data);

    // promise 조건식 임베딩
    if (entry.type === 'promise' && entry.detail?.condition) {
      const condText = entry.detail.condition;
      const condHash = simpleHash(condText);
      const existingCond = await db.embeddings.where({ entryId: entry.id, field: 'condition' }).first();

      if (existingCond && existingCond.hash === condHash) {
        const needsRegenCond = (existingCond.model && existingCond.model !== targetModel) || (existingCond.taskType !== docTaskType && targetModel.includes('embedding-001'));
        if (!needsRegenCond) return;
      }

      const condVec = await embedText(condText, { ...apiOpts, taskType: docTaskType });
      const condData = {
        entryId: entry.id, field: 'condition', vector: condVec, hash: condHash, model: targetModel,
        taskType: docTaskType, updatedAt: Date.now()
      };
      if (existingCond) condData.id = existingCond.id;
      await db.embeddings.put(condData);
    }
  }

  async function embedPack(packName, apiOpts, onProgress) {
    const db = getDB();
    const entries = await db.entries.where('packName').equals(packName).toArray();
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    const targetModel = apiOpts.model || DEFAULTS.embeddingModel;
    let done = 0;

    // 기존 요약 임베딩 ID 매핑
    const allEmbs = await db.embeddings.where('entryId').anyOf(entries.map(e => e.id)).toArray();
    const embMap = {};
    for (const eb of allEmbs) { if (eb.field === 'summary') embMap[eb.entryId] = eb; }

    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      const texts = batch.map(e => e.embed_text ? `${e.name} ${e.embed_text}` : `${e.name}: ${e.summary || ''}`);
      try {
        const vecs = await embedTexts(texts, { ...apiOpts, taskType: docTaskType });
        for (let j = 0; j < batch.length; j++) {
          const hash = simpleHash(texts[j]);
          const existing = embMap[batch[j].id];
          const data = {
            entryId: batch[j].id, field: 'summary', vector: vecs[j], hash,
            model: targetModel, taskType: docTaskType, updatedAt: Date.now()
          };
          if (existing) data.id = existing.id;
          await db.embeddings.put(data);
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
    ensureEmbedding, embedPack, convertLegacyPack,
    __embeddingLoaded: true
  });
  console.log('[LoreCore:embedding] loaded');
})();