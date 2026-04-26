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

  const IMPORT_PROMPT_TEMPLATE = `You are a Lore Structurer for chat continuity.\nConvert the following source material into structured lore entries for a chat memory system.\n\nRULES:\n1. JSON ONLY. Output a valid JSON array. No markdown.\n2. Use the ORIGINAL LANGUAGE of the source. Korean source → Korean output.\n3. Each entity needs 3-5 triggers (exact keywords from the source).\n4. For relationships, use bidirectional compound triggers: A&&B and B&&A.\n5. Keep summaries terse but complete. Use noun/stem endings for Korean.\n6. Extract characters, locations, items, relationships, factions, key events.\n7. For well-known franchises, focus on chat-continuity-relevant info.\n8. Maximum {maxEntries} entries.\n\nSchema:\n{schema}\n\nSource Material:\n{source}`;

  function sanitizeImportedEntry(raw, packName) {
    if (!raw || typeof raw !== 'object' || !raw.name) return null;
    const e = Object.assign({}, raw);
    delete e.id;
    delete e.enabled;
    e.name = String(e.name).trim();
    if (!e.name) return null;
    if (!Array.isArray(e.triggers)) e.triggers = [];
    e.triggers = e.triggers.map(t => String(t || '').trim()).filter(Boolean);
    if (!e.triggers.length) e.triggers = [e.name];
    e.packName = packName;
    e.project = e.project || '';
    e.src = e.src || (e.source === 'user_stated' ? 'us' : (e.source === 'auto_extracted' ? 'ax' : 'im'));
    e.source = e.source || 'imported';
    e.ts = e.ts || Date.now();
    e.lastUpdated = Date.now();
    e.searchStale = true;
    e.searchStaleAt = Date.now();
    return e;
  }

  async function createPreImportSnapshot(db, packName, label) {
    if (!db.snapshots) return;
    const existing = await db.entries.where('packName').equals(packName).toArray();
    if (!existing.length) return;
    const clean = existing.map(function(e) {
      const c = Object.assign({}, e);
      delete c.id;
      return c;
    });
    await db.snapshots.add({ packName, timestamp: Date.now(), label, type: 'pre_import', entryCount: clean.length, data: clean });
  }

  async function importFromText(text, packName, apiOpts, opts = {}) {
    const maxEntries = opts.maxEntries || DEFAULTS.importMaxEntries;
    const chunkSize = opts.chunkSize || DEFAULTS.importChunkSize;
    const maxAttempts = opts.maxAttempts !== undefined ? opts.maxAttempts : 3;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const allEntries = [];
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
    const chunkResults = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const prompt = IMPORT_PROMPT_TEMPLATE.replace('{source}', chunk).replace('{schema}', IMPORT_SCHEMA).replace('{maxEntries}', String(maxEntries));
      let ok = false; let status = 'failed'; let lastErr = ''; let rawSnippet = ''; let attempts = 0; let gotEntries = 0;
      for (let attempt = 0; attempt < maxAttempts && !ok; attempt++) {
        attempts++;
        if (onProgress) { try { onProgress({ phase: 'chunk', chunk: ci + 1, total: chunks.length, attempt: attempts, maxAttempts }); } catch(_){} }
        try {
          const res = await callGeminiApi(prompt, { ...apiOpts, responseMimeType: 'application/json', maxRetries: 0 });
          if (!res || !res.text) { lastErr = 'API 응답 없음 (' + ((res && res.error) || '알 수 없음') + ')'; continue; }
          rawSnippet = String(res.text).slice(0, 200);
          // Markdown fence 제거 + 선두/후미 잡텍스트 제거
          let raw = String(res.text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const fb = raw.indexOf('['); const fc = raw.indexOf('{');
          const first = fb === -1 ? fc : (fc === -1 ? fb : Math.min(fb, fc));
          if (first > 0) raw = raw.slice(first);
          const lastB = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'));
          if (lastB !== -1 && lastB < raw.length - 1) raw = raw.slice(0, lastB + 1);
          let parsed;
          try { parsed = JSON.parse(raw); }
          catch (pe) { lastErr = 'JSON 파싱 실패: ' + pe.message; continue; }
          if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.entries)) parsed = parsed.entries;
          if (!Array.isArray(parsed)) { lastErr = '응답이 배열 아님 (type=' + typeof parsed + ')'; continue; }
          gotEntries = parsed.length;
          if (parsed.length === 0) { status = 'empty'; ok = true; break; }
          allEntries.push(...parsed);
          status = 'ok'; ok = true;
        } catch (e) { lastErr = '예외: ' + (e.message || String(e)); }
      }
      const row = { index: ci, status, attempts, entries: gotEntries };
      if (!ok) {
        row.error = lastErr; row.rawSnippet = rawSnippet;
        console.warn('[LoreCore:importer] chunk ' + (ci + 1) + '/' + chunks.length + ' 실패 (' + attempts + '회 시도): ' + lastErr + (rawSnippet ? ' | 응답 스니핏: ' + rawSnippet : ''));
      }
      chunkResults.push(row);
    }
    if (allEntries.length > 0) {
      const db = getDB();
      await createPreImportSnapshot(db, packName, '텍스트 변환 전 자동 백업 ' + new Date().toLocaleString());
      let pack = await db.packs.get(packName);
      if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
      let saved = 0;
      for (const raw of allEntries) {
        const e = sanitizeImportedEntry(raw, packName);
        if (!e) continue;
        await db.entries.put(e);
        saved++;
      }
      const count = await db.entries.where('packName').equals(packName).count();
      await db.packs.update(packName, { entryCount: count });
      allEntries.length = saved;
    }
    const okCount = chunkResults.filter(r => r.status === 'ok').length;
    const emptyCount = chunkResults.filter(r => r.status === 'empty').length;
    const failedCount = chunkResults.filter(r => r.status === 'failed').length;
    C.__lastImportReport = { added: allEntries.length, chunks: chunks.length, ok: okCount, empty: emptyCount, failed: failedCount, chunkResults };
    return allEntries.length;
  }

  async function importFromJson(jsonArray, packName) {
    if (!Array.isArray(jsonArray)) throw new Error('JSON 배열이 필요함');
    const db = getDB();
    await createPreImportSnapshot(db, packName, 'JSON 가져오기 전 자동 백업 ' + new Date().toLocaleString());
    let pack = await db.packs.get(packName);
    if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
    let count = 0;
    for (const raw of jsonArray) {
      const e = sanitizeImportedEntry(raw, packName);
      if (!e) continue;
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