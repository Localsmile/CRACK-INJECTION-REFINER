// crack-lore-core / importer 모듈
// 역할: 외부 텍스트/JSON/URL을 로어 엔트리로 변환, 메모리 요약 내 중복 감지
// 의존: kernel.callGeminiApi, kernel.gmFetch, kernel.getDB, kernel.DEFAULTS
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:importer] kernel 미로드'); return; }
  if (C.__importerLoaded) return;
  const { callGeminiApi, gmFetch, getDB, DEFAULTS } = C;

  const IMPORT_SCHEMA = `[\n  { "type": "character|location|item|event|concept",\n    "name": "엔티티 이름",\n    "triggers": ["키워드1", "키워드2", "관련어&&조합"],\n    "summary": "핵심 요약 (1-2문장)",\n    "detail": {\n      "attributes": "특성/외형/능력",\n      "relations": ["관계 설명"],\n      "background_or_history": "배경"\n    }\n  },\n  { "type": "relationship",\n    "name": "A↔B",\n    "triggers": ["A&&B", "B&&A"],\n    "summary": "관계 요약",\n    "detail": {\n      "parties": ["A", "B"],\n      "current_status": "상태",\n      "nicknames": { "A→B": "호칭", "B→A": "호칭" }\n    }\n  }\n]`;

  const IMPORT_PROMPT_TEMPLATE = `You are a Lore Structurer for AI RP.\nConvert the following source material into structured lore entries for an RP memory system.\n\nRULES:\n1. JSON ONLY. Output a valid JSON array. No markdown.\n2. Use the ORIGINAL LANGUAGE of the source. Korean source → Korean output.\n3. Each entity needs 3-5 triggers (exact keywords from the source).\n4. For relationships, use bidirectional compound triggers: A&&B and B&&A.\n5. Keep summaries terse but complete. Use noun/stem endings for Korean.\n6. Extract characters, locations, items, relationships, factions, key events.\n7. For well-known franchises, focus on RP-relevant info.\n8. Maximum {maxEntries} entries.\n\nSchema:\n{schema}\n\nSource Material:\n{source}`;

  async function importFromText(text, packName, apiOpts, opts = {}) {
    const maxEntries = opts.maxEntries || DEFAULTS.importMaxEntries;
    const chunkSize = opts.chunkSize || DEFAULTS.importChunkSize;
    const allEntries = [];
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
    for (const chunk of chunks) {
      const prompt = IMPORT_PROMPT_TEMPLATE.replace('{source}', chunk).replace('{schema}', IMPORT_SCHEMA).replace('{maxEntries}', String(maxEntries));
      const res = await callGeminiApi(prompt, { ...apiOpts, responseMimeType: 'application/json', maxRetries: 1 });
      if (res.text) {
        try {
          const parsed = JSON.parse(res.text);
          if (Array.isArray(parsed)) allEntries.push(...parsed);
        } catch (e) { console.warn('[LoreCore] 변환 JSON 파싱 실패:', e.message); }
      }
    }
    if (allEntries.length > 0) {
      const db = getDB();
      let pack = await db.packs.get(packName);
      if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
      for (const e of allEntries) {
        e.packName = packName; e.project = ''; e.enabled = true;
        e.src = e.src || (e.source === 'user_stated' ? 'us' : (e.source === 'auto_extracted' ? 'ax' : 'im'));
        e.source = e.source || 'imported';
        e.ts = e.ts || Date.now();
        e.lastUpdated = e.ts;
        await db.entries.put(e);
      }
      const count = await db.entries.where('packName').equals(packName).count();
      await db.packs.update(packName, { entryCount: count });
    }
    return allEntries.length;
  }

  async function importFromJson(jsonArray, packName) {
    const db = getDB();
    let pack = await db.packs.get(packName);
    if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
    let count = 0;
    for (const e of jsonArray) {
      if (!e.name) continue;
      e.packName = packName; e.project = e.project || ''; e.enabled = true;
      e.src = e.src || (e.source === 'user_stated' ? 'us' : (e.source === 'auto_extracted' ? 'ax' : 'im'));
      e.source = e.source || 'imported';
      e.ts = e.ts || Date.now();
      e.lastUpdated = e.ts;
      await db.entries.put(e); count++;
    }
    const total = await db.entries.where('packName').equals(packName).count();
    await db.packs.update(packName, { entryCount: total });
    return count;
  }

  async function importFromUrl(url, packName, apiOpts, opts = {}) {
    try {
      const resp = await gmFetch(url, { method: 'GET', headers: {} });
      const html = await resp.text();
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&[a-z]+;/gi, ' ').replace(/\n{3,}/g, '\n\n').trim();
      return await importFromText(text, packName, apiOpts, opts);
    } catch (e) { console.error('[LoreCore] URL 임포트 실패:', e); return 0; }
  }

  function detectDuplicatesInSummary(entries, memories) {
    const summaryText = [...(memories.shortTerm || []), ...(memories.relationship || []), ...(memories.longTerm || [])].join(' ').toLowerCase();
    if (!summaryText) return [];
    const duplicates = [];
    for (const e of entries) {
      const name = e.name.toLowerCase();
      const keywords = (e.triggers || []).map(t => t.toLowerCase().split('&&')).flat();
      const nameInSummary = summaryText.includes(name);
      const keywordsInSummary = keywords.filter(k => k.length >= 3 && summaryText.includes(k));
      if (nameInSummary && keywordsInSummary.length >= 2) duplicates.push({ entryId: e.id, name: e.name, confidence: 0.8 });
      else if (nameInSummary) duplicates.push({ entryId: e.id, name: e.name, confidence: 0.5 });
    }
    return duplicates;
  }

  Object.assign(C, {
    importFromText, importFromJson, importFromUrl, detectDuplicatesInSummary,
    __importerLoaded: true
  });
  console.log('[LoreCore:importer] loaded');
})();
