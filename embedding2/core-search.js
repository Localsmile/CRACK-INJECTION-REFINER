// crack-lore-core / search 모듈
// 역할: 트리거 스캔, 하이브리드 검색, LLM 리랭커
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:search] kernel 미로드'); return; }
  if (!C.__memoryLoaded) { console.error('[LoreCore:search] memory 미로드'); return; }
  if (C.__searchLoaded) return;
  const { callGeminiApi, cosineSimilarity, getDB, DEFAULTS,
          calcReinjectionScore, detectActiveCharacters, isRelatedToActive } = C;

  function normalizeSearchText(text) {
    return String(text || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasCjk(text) {
    return /[가-힣㐀-鿿]/.test(String(text || ''));
  }

  function isShortCjkTrigger(text) {
    const t = normalizeSearchText(text).replace(/\s+/g, '');
    return hasCjk(t) && t.length < 2;
  }

  function bigramSimilarity(a, b) {
    a = normalizeSearchText(a);
    b = normalizeSearchText(b);
    if (!a || !b) return 0;
    const bigrams = s => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.substr(i, 2)); return set; };
    const A = bigrams(a), B = bigrams(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  function buildScanPool(userInput, recentMsgs, config) {
    const range = Math.max(1, (config && config.scanRange) || 6);
    const offset = Math.max(0, (config && config.scanOffset) || 0);
    const arr = Array.isArray(recentMsgs) ? recentMsgs : [];
    const end = Math.max(0, arr.length - offset);
    const start = Math.max(0, end - range);
    const sliceText = arr.slice(start, end).map(m => (m && m.message) || '').join(' ');
    return normalizeSearchText((userInput || '') + ' ' + sliceText);
  }

  function boundaryIncludes(pool, trigger) {
    if (!trigger) return false;
    if (!pool.includes(trigger)) return false;
    if (hasCjk(trigger)) return true;
    try {
      const esc = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)', 'i').test(pool);
    } catch (_) {
      return true;
    }
  }

  function triggerPartAllowed(part, entry) {
    if (!isShortCjkTrigger(part)) return true;
    if (entry && entry.anchor === true) return true;
    return normalizeSearchText(entry && entry.name) === normalizeSearchText(part);
  }

  function matchTrigger(raw, entry, pool, cfg) {
    const original = String(raw || '').trim();
    if (!original) return null;
    const strict = cfg.strictMatch !== false;
    const similar = cfg.similarityMatch === true;

    if (original.includes('&&')) {
      const parts = original.split('&&').map(normalizeSearchText).filter(Boolean);
      if (!parts.length) return null;
      if (!parts.every(p => triggerPartAllowed(p, entry))) return null;
      if (parts.every(p => pool.includes(p))) return { score: 1.0, matched: original, type: 'compound' };
      return null;
    }

    if (original.startsWith('~')) {
      if (!similar) return null;
      const pattern = normalizeSearchText(original.slice(1));
      if (!pattern) return null;
      if (isShortCjkTrigger(pattern) && !triggerPartAllowed(pattern, entry)) return null;
      if (pool.includes(pattern)) return { score: 0.9, matched: original, type: 'fuzzy-exact' };
      let best = 0;
      for (const word of pool.split(/[\s,.!?;:"'()\[\]{}]+/)) {
        if (!word) continue;
        const sim = bigramSimilarity(word, pattern);
        if (sim > best) best = sim;
      }
      if (best >= 0.75) return { score: 0.7 * best, matched: original, type: 'fuzzy' };
      return null;
    }

    const low = normalizeSearchText(original);
    if (!low) return null;
    if (isShortCjkTrigger(low) && !triggerPartAllowed(low, entry)) return null;
    if (!strict) {
      return pool.includes(low) ? { score: 1.0, matched: original, type: 'substring' } : null;
    }
    if (boundaryIncludes(pool, low)) {
      return { score: 1.0, matched: original, type: hasCjk(low) ? 'cjk-exact' : 'word-boundary' };
    }
    return null;
  }

  function triggerScan(userInput, recentMsgs, entries, config) {
    const cfg = config || {};
    const pool = buildScanPool(userInput, recentMsgs, cfg);
    const hits = [];
    for (const e of (entries || [])) {
      if (!e || e.enabled === false) continue;
      const triggers = Array.isArray(e.triggers) ? e.triggers : [];
      let best = null;
      for (const raw of triggers) {
        const matched = matchTrigger(raw, e, pool, cfg);
        if (!matched) continue;
        if (!best || matched.score > best.score) best = matched;
      }
      if (best) {
        hits.push({
          entry: e,
          triggerScore: best.score,
          matchedTrigger: best.matched,
          matchedTriggerType: best.type
        });
      }
    }
    return hits;
  }

  function getExpectedEmbeddingMeta(apiOpts) {
    const model = (apiOpts && apiOpts.model) || 'gemini-embedding-001';
    const queryTaskType = model.includes('embedding-001') ? 'RETRIEVAL_QUERY' : ((apiOpts && apiOpts.taskType) || 'RETRIEVAL_QUERY');
    const documentTaskType = model.includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : ((apiOpts && apiOpts.taskType) || queryTaskType);
    return { model, queryTaskType, documentTaskType };
  }

  function continuityScore(entry) {
    if (!entry) return 0;
    let score = 0;
    if (C.isPromiseEntry && C.isPromiseEntry(entry)) {
      score += 0.12;
      const st = C.getPromiseStatus ? C.getPromiseStatus(entry) : '';
      if (/pending|대기|진행|미완|약속|유지/i.test(st)) score += 0.18;
    }
    if (entry.type === 'rel' || entry.type === 'relationship') score += 0.12;
    if (entry.call || entry.callHistory) score += 0.05;
    if (Array.isArray(entry.eventHistory) && entry.eventHistory.length) score += 0.06;
    if (entry.anchor === true) score += 0.08;
    return Math.min(score, 0.35);
  }

  async function hybridSearch(userInput, recentMsgs, entries, config, apiOpts) {
    const db = getDB();
    const cfg = config || {};
    const embEnabled = !!cfg.embeddingEnabled;
    const embWeight = embEnabled ? (cfg.embeddingWeight != null ? cfg.embeddingWeight : 0.4) : 0;
    const trigWeight = 1 - embWeight;
    const threshold = cfg.embeddingThreshold != null ? cfg.embeddingThreshold : (DEFAULTS.embeddingThreshold != null ? DEFAULTS.embeddingThreshold : 0.3);
    const turnCounter = cfg.turnCounter != null ? cfg.turnCounter : null;
    const activeBoost = cfg.activeCharBoost != null ? cfg.activeCharBoost : 1.0;
    const inactivePenalty = cfg.inactiveCharPenalty != null ? cfg.inactiveCharPenalty : 1.0;
    const decayEnabled = cfg.decayEnabled !== false;

    let lastMentionMap = null;
    if (decayEnabled && cfg.chatKey) {
      try {
        const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
        const all = JSON.parse(_ls.getItem('lore-last-mention') || '{}');
        lastMentionMap = all[cfg.chatKey] || null;
      } catch (e) {}
    }

    const enabled = (entries || []).filter(e => e && e.enabled !== false);
    const trigHits = triggerScan(userInput, recentMsgs, enabled, cfg);
    const trigMap = {};
    for (const h of trigHits) {
      if (!h.entry || h.entry.id === undefined) continue;
      trigMap[h.entry.id] = { score: h.triggerScore, matched: h.matchedTrigger, type: h.matchedTriggerType };
    }

    const embMap = {};
    let embeddingOk = false;
    const stats = {
      trigOnly: 0,
      embOnly: 0,
      both: 0,
      embeddingOk: false,
      semanticSkippedNoKey: 0,
      semanticSkippedStale: 0,
      semanticSkippedModel: 0,
      semanticSkippedTask: 0,
      semanticSkippedDim: 0,
      missingVector: 0,
      semanticOnly: 0,
      keywordOnly: 0,
      mixed: 0
    };
    const hasKey = apiOpts && (apiOpts.key || apiOpts.geminiKey || apiOpts.vertexJson || apiOpts.firebaseEmbedKey);

    if (embEnabled && hasKey && typeof C.embedText === 'function') {
      try {
        const tail = Array.isArray(recentMsgs) ? recentMsgs.slice(-2).map(m => (m && m.message) || '').join(' ') : '';
        const qText = ((userInput || '') + ' ' + tail).slice(0, 2000);
        const meta = getExpectedEmbeddingMeta(apiOpts);
        const queryVec = await C.embedText(qText, Object.assign({}, apiOpts, { taskType: meta.queryTaskType }));
        if (queryVec) {
          const ids = enabled.map(e => e.id).filter(id => id !== undefined && id !== null);
          const allEmbs = ids.length ? await db.embeddings.where('entryId').anyOf(ids).toArray() : [];
          const anyVectorIds = new Set();
          const entryById = {};
          enabled.forEach(e => { entryById[e.id] = e; });

          for (const eb of allEmbs) {
            if (!eb || !eb.vector) continue;
            anyVectorIds.add(eb.entryId);
            const entry = entryById[eb.entryId];
            if (entry && entry.searchStale) { stats.semanticSkippedStale++; continue; }
            if (eb.model && eb.model !== meta.model) { stats.semanticSkippedModel++; continue; }
            if (meta.model.includes('embedding-001') && eb.taskType && eb.taskType !== meta.documentTaskType) { stats.semanticSkippedTask++; continue; }
            if (Array.isArray(eb.vector) && Array.isArray(queryVec) && eb.vector.length !== queryVec.length) { stats.semanticSkippedDim++; continue; }

            let boost = 1.0;
            if (eb.field === 'condition') boost = 1.2;
            const s = cosineSimilarity(queryVec, eb.vector) * boost;
            if (!(eb.entryId in embMap) || s > embMap[eb.entryId].score) {
              embMap[eb.entryId] = { score: s, field: eb.field || 'summary' };
            }
          }
          stats.missingVector = Math.max(0, enabled.length - anyVectorIds.size);
          embeddingOk = true;
          stats.embeddingOk = true;
        }
      } catch (e) { console.warn('[LoreCore] 쿼리 임베딩 실패:', e && e.message); }
    } else if (embEnabled && !hasKey) {
      stats.semanticSkippedNoKey = enabled.length;
    }

    const activeNames = cfg.activeCharDetection !== false
      ? (detectActiveCharacters(recentMsgs || [], enabled) || [])
      : [];

    const scored = enabled.map(e => {
      const tHit = trigMap[e.id];
      const tScore = tHit ? tHit.score : 0;
      const eSimRaw = embMap[e.id] ? embMap[e.id].score : 0;
      const eScore = eSimRaw > threshold ? eSimRaw : 0;
      if (tScore > 0 && eScore > 0) { stats.both++; stats.mixed++; }
      else if (tScore > 0) { stats.trigOnly++; stats.keywordOnly++; }
      else if (eScore > 0) { stats.embOnly++; stats.semanticOnly++; }

      const continuity = (tScore > 0 || eScore > 0 || e.anchor === true) ? continuityScore(e) : 0;
      let baseScore = trigWeight * tScore + embWeight * eScore + continuity;
      let score = baseScore;
      const matched = tHit ? tHit.matched : '';
      const matchedType = tHit ? tHit.type : '';

      let lmt = e.lastMentionedTurn != null
        ? e.lastMentionedTurn
        : (lastMentionMap && lastMentionMap[e.id] != null ? lastMentionMap[e.id] : null);
      if (lmt != null && turnCounter != null && lmt > turnCounter) lmt = null;
      let freshnessMultiplier = 1;
      if (decayEnabled && turnCounter != null && lmt != null) {
        const turnsSince = turnCounter - lmt;
        const reScore = calcReinjectionScore(turnsSince, e.type, cfg, e);
        freshnessMultiplier = 1 + reScore * 0.5;
        score = score * freshnessMultiplier;
      }
      if (decayEnabled && lmt == null && (tScore > 0 || eScore > 0)) {
        freshnessMultiplier *= 1.15;
        score = score * 1.15;
      }

      let arcMultiplier = 1;
      if (e.rootId && e.isCurrentArc === false) { arcMultiplier = 0.3; score *= arcMultiplier; }

      let activeMultiplier = 1;
      if (activeNames.length > 0 && (e.type === 'character' || e.type === 'identity')) {
        const related = isRelatedToActive(e, activeNames);
        activeMultiplier = related ? activeBoost : inactivePenalty;
        score = score * activeMultiplier;
      }

      if (e.anchor === true && score < 0.2) score = 0.2;

      return {
        entry: e,
        score,
        tScore,
        eSim: eSimRaw,
        semanticField: embMap[e.id] ? embMap[e.id].field : '',
        matchedTrigger: matched,
        matchedTriggerType: matchedType,
        scoreParts: {
          keyword: tScore,
          semantic: eScore,
          continuity,
          base: baseScore,
          freshnessMultiplier,
          arcMultiplier,
          activeMultiplier,
          final: score
        }
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const filtered = scored.filter(s => s.score > 0);

    return {
      scored: filtered,
      activeNames,
      searchStats: stats
    };
  }

  async function smartRerank(query, candidates, recentMsgs, apiOpts, config) {
    if (!candidates || !candidates.length) return candidates || [];
    const cfg = config || {};
    const maxCandidates = cfg.rerankMaxCandidates || 8;
    const blendWeight = cfg.rerankBlendWeight != null ? cfg.rerankBlendWeight : 0.5;
    const minLlmScore = cfg.rerankMinLlmScore != null ? cfg.rerankMinLlmScore : 2;
    const anchorBoost = cfg.rerankAnchorBoost != null ? cfg.rerankAnchorBoost : 1.0;
    const truncated = candidates.slice(0, maxCandidates);
    const recentText = typeof recentMsgs === 'string'
      ? recentMsgs
      : (Array.isArray(recentMsgs)
          ? recentMsgs.slice(-4).map(m => (m.role || '') + ': ' + ((m.message || '').slice(0, 100))).join('\n')
          : '');
    const listText = truncated.map((s, i) => {
      const text = C.entrySearchText ? C.entrySearchText(s.entry) : (s.entry.summary || s.entry.embed_text || '');
      return (i + 1) + '. [' + s.entry.type + '] ' + s.entry.name + ': ' + String(text || '').slice(0, 180);
    }).join('\n');
    const prompt = '명시적 답변 제외: 오직 JSON만 출력.\n장면과 직접 관련성 기준 5점 척도 (5=핵심, 1=무관).\n\n입력:\n' + query + '\n\n최근 대화:\n' + recentText + '\n\n후보:\n' + listText + '\n\n출력: {"scores":[5,4,...]}';
    try {
      const res = await callGeminiApi(prompt, Object.assign({}, apiOpts, { model: (apiOpts && apiOpts.model) || 'gemini-3-flash-preview', responseMimeType: 'application/json', maxOutputTokens: 256, thinkingLevel: 'minimal', maxRetries: 1 }));
      const data = JSON.parse(res.text);
      if (!Array.isArray(data.scores)) return candidates;
      const hScores = truncated.map(s => s.score);
      const hMin = Math.min.apply(null, hScores), hMax = Math.max.apply(null, hScores);
      const hRange = (hMax - hMin) || 1;
      const reranked = truncated.map((s, i) => {
        const raw = data.scores[i];
        const llmScore = (typeof raw === 'number' && raw >= 1 && raw <= 5) ? raw : 3;
        const hybNorm = (s.score - hMin) / hRange;
        const llmNorm = (llmScore - 1) / 4;
        let finalScore = (1 - blendWeight) * hybNorm + blendWeight * llmNorm;
        if (s.entry.anchor === true) finalScore += anchorBoost;
        return Object.assign({}, s, { origScore: s.score, llmScore, score: finalScore, rerankScore: finalScore });
      });
      const kept = reranked.filter(s => s.llmScore > minLlmScore || s.entry.anchor === true);
      const droppedCount = reranked.length - kept.length;
      if (droppedCount > 0) console.log('[LoreCore:rerank] 무관 ' + droppedCount + '개 제거 (llm<=' + minLlmScore + ')');
      if (kept.length === 0) { console.warn('[LoreCore:rerank] 전체 후보가 무관 판정 → 원본 순서 우선'); return candidates; }
      kept.sort((a, b) => b.score - a.score);
      const minKept = kept[kept.length - 1].score;
      const tail = candidates.slice(maxCandidates).map(s => Object.assign({}, s, { origScore: s.score, score: Math.min(s.score, minKept * 0.99) }));
      return kept.concat(tail);
    } catch (e) { console.warn('[LoreCore] 리랭크 실패, 기본 순서 사용:', e && e.message); return candidates; }
  }

  Object.assign(C, {
    normalizeSearchText,
    bigramSimilarity,
    buildScanPool,
    triggerScan,
    hybridSearch,
    smartRerank,
    __searchLoaded: true
  });
  console.log('[LoreCore:search] loaded phase6');
})();