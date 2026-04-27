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

  function clampText(text, max) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!max || text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 1)).trim() + '…';
  }

  function normalizeSummaryValue(summary, name, state) {
    if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
      const full = clampText(summary.full || summary.compact || summary.micro || '', 700);
      const compact = clampText(summary.compact || full, 180);
      const micro = clampText(summary.micro || (state ? `${name}=${state}` : compact || name), 60);
      return { full, compact, micro };
    }
    const full = clampText(summary || '', 700);
    const compact = clampText(full || state || name || '', 180);
    const micro = clampText(state ? `${name}=${state}` : compact || name || '', 60);
    return { full, compact, micro };
  }

  function mergeText(a, b, max) {
    a = clampText(a || '', max);
    b = clampText(b || '', max);
    if (!a) return b;
    if (!b || a.includes(b)) return a;
    return clampText(a + ' / ' + b, max);
  }

  function mergeLoreSummary(existingSummary, incomingSummary, name, state) {
    const ex = normalizeSummaryValue(existingSummary, name, state);
    const inc = normalizeSummaryValue(incomingSummary, name, state);
    return {
      full: mergeText(ex.full, inc.full, 700),
      compact: mergeText(ex.compact, inc.compact, 180),
      micro: inc.micro || ex.micro
    };
  }

  function normalizeCallState(entry, turn) {
    const out = entry.callState && typeof entry.callState === 'object' ? JSON.parse(JSON.stringify(entry.callState)) : {};
    if (entry.call && typeof entry.call === 'object') {
      for (const [key, term] of Object.entries(entry.call)) {
        if (!out[key]) out[key] = {};
        if (typeof out[key] === 'string') out[key] = { currentTerm: out[key] };
        out[key].currentTerm = out[key].currentTerm || term;
        out[key].lastChangedTurn = out[key].lastChangedTurn || turn || 0;
      }
    }
    const deltas = Array.isArray(entry.callDelta) ? entry.callDelta : [];
    for (const d of deltas) {
      if (!d || !d.from || !d.to || !d.term) continue;
      const key = `${d.from}→${d.to}`;
      const prev = d.prevTerm ? [d.prevTerm] : [];
      out[key] = {
        currentTerm: d.term,
        previousTerms: prev,
        tone: d.tone || '',
        scope: d.scope || 'scene',
        lastChangedTurn: d.turnApprox || turn || 0,
        confidence: d.confidence != null ? d.confidence : 0.75,
        reason: d.reason || 'observed vocative change'
      };
    }
    return Object.keys(out).length ? out : undefined;
  }

  function normalizeLoreEntry(entry, opts = {}) {
    const e = { ...(entry || {}) };
    const turn = opts.turn || e.timeline?.eventTurn || e.eventTurn || 0;
    e.summary = normalizeSummaryValue(e.summary, e.name, e.state);
    if (!e.inject || typeof e.inject !== 'object') e.inject = {};
    e.inject.full = e.inject.full || e.summary.full;
    e.inject.compact = e.inject.compact || e.summary.compact;
    e.inject.micro = e.inject.micro || e.summary.micro;
    if (!e.embed_text) {
      const entities = Array.isArray(e.entities) ? e.entities.join(' ') : '';
      e.embed_text = clampText([e.name, entities, (e.triggers || []).join(' '), e.summary.compact, e.state].filter(Boolean).join(' '), 240);
    }
    const callState = normalizeCallState(e, turn);
    if (callState) e.callState = callState;
    if (!e.timeline || typeof e.timeline !== 'object') e.timeline = {};
    e.timeline.eventTurn = e.timeline.eventTurn || turn || 0;
    e.timeline.relativeOrder = e.timeline.relativeOrder || 'current';
    e.timeline.sceneLabel = e.timeline.sceneLabel || '';
    e.timeline.observedRecency = e.timeline.observedRecency || 'recent';
    if (!Array.isArray(e.entities)) {
      const names = [];
      if (Array.isArray(e.parties)) names.push(...e.parties);
      if (Array.isArray(e.detail?.parties)) names.push(...e.detail.parties);
      if (e.name) names.push(...String(e.name).split(/[↔&]/).map(x => x.trim()).filter(Boolean));
      e.entities = Array.from(new Set(names)).filter(Boolean);
    }
    return e;
  }

  const IMPORT_SCHEMA = `[\n  { "type": "character|location|item|event|concept|setting",\n    "name": "엔티티 이름",\n    "triggers": ["키워드1", "키워드2", "A&&B"],\n    "summary": {\n      "full": "self-contained continuity summary: who/what/why/current state",\n      "compact": "entity + state + relation/hook preserved",\n      "micro": "stable recall handle + current state"\n    },\n    "embed_text": "names aliases relationship terms causes stakes location unresolved hooks",\n    "timeline": { "eventTurn": 0, "relativeOrder": "current|past|foreshadow", "sceneLabel": "", "observedRecency": "recent|old|unknown" },\n    "entities": ["참여 인물/장소/아이템"],\n    "detail": { "attributes": "특성/외형/능력", "relations": ["관계 설명"], "background_or_history": "배경" }\n  },\n  { "type": "relationship|rel",\n    "name": "A↔B",\n    "parties": ["A", "B"],\n    "triggers": ["A&&B", "B&&A"],\n    "summary": { "full": "관계 원인/현재 상태/미해결 훅", "compact": "관계와 현재 상태", "micro": "A↔B=상태" },\n    "embed_text": "A B aliases call terms relationship stakes hooks",\n    "callState": { "A→B": { "currentTerm": "현재 호칭", "previousTerms": ["과거 호칭"], "tone": "affectionate|hostile|formal|neutral", "scope": "scene|stable|private|public", "lastChangedTurn": 0, "confidence": 0.8, "reason": "변경 근거" } },\n    "timeline": { "eventTurn": 0, "relativeOrder": "current", "sceneLabel": "", "observedRecency": "recent" },\n    "entities": ["A", "B"]\n  }\n]`;

  const IMPORT_PROMPT_TEMPLATE = `You are a Lore Structurer for AI RP.\nConvert the following source material into structured lore entries for an RP memory system.\n\nRULES:\n1. JSON ONLY. Output a valid JSON array. No markdown.\n2. Use the ORIGINAL LANGUAGE of the source. Korean source → Korean output.\n3. Each entity needs 3-5 triggers (exact keywords from the source).\n4. For relationships, use bidirectional compound triggers: A&&B and B&&A.\n5. Summary levels are semantic, not just character budgets:\n   - summary.full: continuity-safe and self-contained; include who/what/why/current state.\n   - summary.compact: preserve entity, state, relationship, and unresolved hooks.\n   - summary.micro: stable recall handle + current state only; never a vague teaser.\n6. embed_text must include names, aliases, relationship terms, event causes, stakes, locations, and unresolved hooks.\n7. Extract callState for relationships when vocatives are visible: currentTerm, previousTerms, tone, scope, lastChangedTurn, confidence, reason.\n8. Extract timeline and entities for every entry when inferable.\n9. For well-known franchises, focus on RP-relevant info.\n10. Maximum {maxEntries} entries.\n\nSchema:\n{schema}\n\nSource Material:\n{source}`;

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
      let pack = await db.packs.get(packName);
      if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
      for (let e of allEntries) {
        e = normalizeLoreEntry(e, { source: 'imported' });
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
    const okCount = chunkResults.filter(r => r.status === 'ok').length;
    const emptyCount = chunkResults.filter(r => r.status === 'empty').length;
    const failedCount = chunkResults.filter(r => r.status === 'failed').length;
    C.__lastImportReport = { added: allEntries.length, chunks: chunks.length, ok: okCount, empty: emptyCount, failed: failedCount, chunkResults };
    return allEntries.length;
  }

  async function importFromJson(jsonArray, packName) {
    const db = getDB();
    let pack = await db.packs.get(packName);
    if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
    let count = 0;
    for (let e of jsonArray) {
      if (!e.name) continue;
      e = normalizeLoreEntry(e, { source: 'imported' });
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
    normalizeLoreEntry, normalizeSummaryValue, mergeLoreSummary,
    __importerLoaded: true
  });
  console.log('[LoreCore:importer] loaded');
})();
