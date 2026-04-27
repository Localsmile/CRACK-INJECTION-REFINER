// crack-lore-core / search 모듈 (v1.3.9)
// 역할: 트리거 스캔, 하이브리드 검색, LLM 리랭커
// 의존: kernel (callGeminiApi, cosineSimilarity, getDB, simpleHash, DEFAULTS, embedText),
//       memory (calcReinjectionScore, detectActiveCharacters, isRelatedToActive)
// 시그니처 (v1.3.6):
//   triggerScan(userInput, recentMsgs, entries, config) -> Array<{entry, triggerScore, matchedTrigger}>
//   hybridSearch(userInput, recentMsgs, entries, config, apiOpts) -> {scored, activeNames, searchStats}
//   smartRerank(query, candidates, recentMsgsOrText, apiOpts, config) -> candidates[]
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:search] kernel 미로드'); return; }
  if (!C.__memoryLoaded) { console.error('[LoreCore:search] memory 미로드'); return; }
  if (C.__searchLoaded) return;
  const { callGeminiApi, getDB, DEFAULTS,
          calcReinjectionScore, detectActiveCharacters, isRelatedToActive } = C;
  const cosineSimilarity = C.cosineSimilarity || C.cosineSim;

  // ---- 유틸 ----
  function bigramSimilarity(a, b) {
    if (!a || !b) return 0;
    const bigrams = s => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.substr(i, 2)); return set; };
    const A = bigrams(a.toLowerCase()), B = bigrams(b.toLowerCase());
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  // 스캔 풀: 유저 입력 + 최근 메세지 범위 (config.scanRange / scanOffset)
  function buildScanPool(userInput, recentMsgs, config) {
    const range = Math.max(1, (config && config.scanRange) || 6);
    const offset = Math.max(0, (config && config.scanOffset) || 0);
    const arr = Array.isArray(recentMsgs) ? recentMsgs : [];
    const end = Math.max(0, arr.length - offset);
    const start = Math.max(0, end - range);
    const sliceText = arr.slice(start, end).map(m => (m && m.message) || '').join(' ');
    return ((userInput || '') + ' ' + sliceText).toLowerCase();
  }

  // ---- 트리거 스캔 ----
  function triggerScan(userInput, recentMsgs, entries, config) {
    const cfg = config || {};
    const pool = buildScanPool(userInput, recentMsgs, cfg);
    const strict = cfg.strictMatch !== false;
    const similar = cfg.similarityMatch === true;
    const hits = [];
    for (const e of (entries || [])) {
      if (!e || e.enabled === false) continue;
      const triggers = Array.isArray(e.triggers) ? e.triggers : [];
      let hit = false, matched = '', score = 0;
      for (const raw of triggers) {
        const t = (raw || '').trim(); if (!t) continue;
        if (t.includes('&&')) {
          const parts = t.split('&&').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (parts.length && parts.every(p => pool.includes(p))) { hit = true; matched = t; score = 1.0; break; }
        } else if (t.startsWith('~')) {
          if (!similar) continue;
          const pattern = t.slice(1).toLowerCase(); if (!pattern) continue;
          if (pool.includes(pattern)) { hit = true; matched = t; score = 0.9; break; }
          let best = 0;
          for (const word of pool.split(/[\s,.!?;:"'()\[\]{}]+/)) {
            if (!word) continue;
            const sim = bigramSimilarity(word, pattern);
            if (sim > best) best = sim;
          }
          if (best >= 0.75) { hit = true; matched = t; score = 0.7 * best; break; }
        } else {
          const low = t.toLowerCase();
          if (!pool.includes(low)) continue;
          const isCJK = /[가-힣㐀-鿿]/.test(low);
          if (!strict || isCJK) { hit = true; matched = t; score = 1.0; break; }
          try {
            const esc = low.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)', 'i').test(pool)) { hit = true; matched = t; score = 1.0; break; }
          } catch { hit = true; matched = t; score = 1.0; break; }
        }
      }
      if (hit) hits.push({ entry: e, triggerScore: score, matchedTrigger: matched });
    }
    return hits;
  }

  // ---- 하이브리드 검색 ----
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
    const temporalEnabled = cfg.temporalGraphEnabled !== false;
    const activeEntityWeight = cfg.activeEntityWeight != null ? cfg.activeEntityWeight : (DEFAULTS.activeEntityWeight || 0.25);
    const relationshipGraphWeight = cfg.relationshipGraphWeight != null ? cfg.relationshipGraphWeight : (DEFAULTS.relationshipGraphWeight || 0.22);
    const temporalWeight = cfg.temporalWeight != null ? cfg.temporalWeight : (DEFAULTS.temporalWeight || 0.18);
    const unresolvedWeight = cfg.unresolvedWeight != null ? cfg.unresolvedWeight : (DEFAULTS.unresolvedWeight || 0.28);
    const maintenanceWeight = cfg.maintenanceWeight != null ? cfg.maintenanceWeight : (DEFAULTS.maintenanceWeight || 0.12);

    // decay fallback: entry.lastMentionedTurn 없으면 localStorage 'lore-last-mention' 맵 조회
    let lastMentionMap = null;
    if (decayEnabled && cfg.chatKey) {
      try {
        const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
        const all = JSON.parse(_ls.getItem('lore-last-mention') || '{}');
        lastMentionMap = all[cfg.chatKey] || null;
      } catch (e) {}
    }

    const enabled = (entries || []).filter(e => e && e.enabled !== false);

    // 1) 트리거
    const trigHits = triggerScan(userInput, recentMsgs, enabled, cfg);
    const trigMap = {};
    for (const h of trigHits) trigMap[h.entry.id] = { score: h.triggerScore, matched: h.matchedTrigger };

    // 2) 임베딩 검색 (API 가용 시)
    const embMap = {};
    let embeddingOk = false;
    const hasKey = apiOpts && (apiOpts.key || apiOpts.geminiKey || apiOpts.vertexJson || apiOpts.firebaseEmbedKey);
    if (embEnabled && hasKey && typeof C.embedText === 'function') {
      try {
        const tail = Array.isArray(recentMsgs) ? recentMsgs.slice(-2).map(m => (m && m.message) || '').join(' ') : '';
        const qText = ((userInput || '') + ' ' + tail).slice(0, 2000);
        const model = apiOpts.model || 'gemini-embedding-001';
        const qTaskType = model.includes('embedding-001') ? 'RETRIEVAL_QUERY' : (apiOpts.taskType || 'RETRIEVAL_QUERY');
        const queryVec = await C.embedText(qText, Object.assign({}, apiOpts, { taskType: qTaskType }));
        if (queryVec) {
          const ids = enabled.map(e => e.id);
          const allEmbs = ids.length ? await db.embeddings.where('entryId').anyOf(ids).toArray() : [];
          const entryMap = {};
          for (const e of enabled) entryMap[e.id] = e;
          for (const eb of allEmbs) {
            if (!eb || !eb.vector) continue;
            const entry = entryMap[eb.entryId];
            if (!entry) continue;
            if (eb.packName && eb.packName !== entry.packName) continue;
            if (C.embeddingSourceHash) {
              const expected = C.embeddingSourceHash(entry, eb.field || 'summary');
              if ((eb.sourceHash || eb.hash) !== expected) continue;
            }
            let boost = 1.0;
            if (eb.field === 'condition') boost = 1.2;
            if (eb.schemaVersion && eb.schemaVersion < 2) boost *= 0.95;
            const s = cosineSimilarity(queryVec, eb.vector) * boost;
            if (!(eb.entryId in embMap) || s > embMap[eb.entryId]) embMap[eb.entryId] = s;
          }
          embeddingOk = true;
        }
      } catch (e) { console.warn('[LoreCore] 쿼리 임베딩 실패:', e && e.message); }
    }

    // 3) 활성 캐릭터
    const activeNames = cfg.activeCharDetection !== false
      ? (detectActiveCharacters(recentMsgs || [], enabled) || [])
      : [];

    // 4) 스코어 집계
    let trigOnly = 0, embOnly = 0, both = 0;
    const scored = enabled.map(e => {
      const tHit = trigMap[e.id];
      const tScore = tHit ? tHit.score : 0;
      const eSimRaw = embMap[e.id] || 0;
      const eScore = eSimRaw > threshold ? eSimRaw : 0;
      if (tScore > 0 && eScore > 0) both++;
      else if (tScore > 0) trigOnly++;
      else if (eScore > 0) embOnly++;

      let score = trigWeight * tScore + embWeight * eScore;
      const matched = tHit ? tHit.matched : '';

      // 언급 시점 해석: entry 프로퍼티 우선, 없으면 localStorage 맵 fallback
      let lmt = e.lastMentionedTurn != null
        ? e.lastMentionedTurn
        : (lastMentionMap && lastMentionMap[e.id] != null ? lastMentionMap[e.id] : null);
      // 방어: 저장된 lmt가 현재 카운터보다 크면(세션 리셋/데이터 불일치) 미언급으로 취급
      if (lmt != null && turnCounter != null && lmt > turnCounter) lmt = null;
      // 재주입 필요도 (최근 언급된 엔트리에 약한 가산)
      if (decayEnabled && turnCounter != null && lmt != null) {
        const turnsSince = turnCounter - lmt;
        const reScore = calcReinjectionScore(turnsSince, e.type, cfg, e);
        score = score * (1 + reScore * 0.5);
      }
      // 신규(미언급) 엔트리 최초 등장 기회 — 소폭 가점
      if (decayEnabled && lmt == null && (tScore > 0 || eScore > 0)) {
        score = score * 1.15;
      }

      // Shard 감점 (비활성 아크)
      if (e.rootId && e.isCurrentArc === false) score *= 0.3;

      // 활성 캐릭터 부스트/패널티 — 캐릭터 계열 엔트리에만 적용
      if (activeNames.length > 0 && (e.type === 'character' || e.type === 'identity')) {
        const related = isRelatedToActive(e, activeNames);
        score = related ? score * activeBoost : score * inactivePenalty;
      }

      const components = {};
      if (temporalEnabled) {
        components.activeEntity = C.graphOverlapScore ? C.graphOverlapScore(e, activeNames) : 0;
        components.relationshipGraph = C.relationshipGraphScore ? C.relationshipGraphScore(e, activeNames) : 0;
        components.temporal = C.temporalRecencyScore ? C.temporalRecencyScore(e, turnCounter || 0) : 0;
        components.unresolved = C.unresolvedPriorityScore ? C.unresolvedPriorityScore(e) : 0;
        components.maintenance = C.maintenanceRecallScore ? C.maintenanceRecallScore(e, turnCounter || 0, cfg) : 0;
        score += components.activeEntity * activeEntityWeight;
        score += components.relationshipGraph * relationshipGraphWeight;
        score += components.temporal * temporalWeight;
        score += components.unresolved * unresolvedWeight;
        score += components.maintenance * maintenanceWeight;
      }

      // 앵커 최소 점수 보장
      if (e.anchor === true && score < 0.2) score = 0.2;
      if (e.anchor === true && temporalEnabled) score += 0.4;

      return { entry: e, score, tScore, eSim: eSimRaw, matchedTrigger: matched, components };
    });

    scored.sort((a, b) => b.score - a.score);
    const filtered = scored.filter(s => s.score > 0);

    return {
      scored: filtered,
      activeNames,
      searchStats: { trigOnly, embOnly, both, embeddingOk }
    };
  }

  // ---- LLM 리랭커 ----
  async function smartRerank(query, candidates, recentMsgs, apiOpts, config) {
    if (!candidates || !candidates.length) return candidates || [];
    const cfg = config || {};
    const maxCandidates = cfg.rerankMaxCandidates || 8;
    const blendWeight = cfg.rerankBlendWeight != null ? cfg.rerankBlendWeight : 0.5;
    const minLlmScore = cfg.rerankMinLlmScore != null ? cfg.rerankMinLlmScore : 2;
    const anchorBoost = cfg.rerankAnchorBoost != null ? cfg.rerankAnchorBoost : 1.0;
    const truncated = candidates.slice(0, maxCandidates);
    // recentMsgs: 이미 포맷된 string이면 그대로, 배열이면 포맷
    const recentText = typeof recentMsgs === 'string'
      ? recentMsgs
      : (Array.isArray(recentMsgs)
          ? recentMsgs.slice(-4).map(m => (m.role || '') + ': ' + ((m.message || '').slice(0, 100))).join('\n')
          : '');
    const summaryOf = (e) => {
      const s = e.summary;
      if (s && typeof s === 'object' && !Array.isArray(s)) return String(s.compact || s.full || s.micro || '');
      return String(s || '');
    };
    const listText = truncated.map((s, i) => (i + 1) + '. [' + s.entry.type + '] ' + s.entry.name + ': ' + summaryOf(s.entry).slice(0, 100)).join('\n');
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
        return Object.assign({}, s, { origScore: s.score, llmScore, score: finalScore });
      });
      const kept = reranked.filter(s => s.llmScore > minLlmScore || s.entry.anchor === true);
      const droppedCount = reranked.length - kept.length;
      if (droppedCount > 0) console.log('[LoreCore:rerank] 무관 ' + droppedCount + '개 제거 (llm<=' + minLlmScore + ')');
      // kept 전멸이면 리랭크 결과 무시하고 원본 순서 유지
      if (kept.length === 0) { console.warn('[LoreCore:rerank] 전체 후보가 무관 판정 → 원본 순서 우선'); return candidates; }
      kept.sort((a, b) => b.score - a.score);
      const minKept = kept[kept.length - 1].score;
      const tail = candidates.slice(maxCandidates).map(s => Object.assign({}, s, { origScore: s.score, score: Math.min(s.score, minKept * 0.99) }));
      return kept.concat(tail);
    } catch (e) { console.warn('[LoreCore] 리랭크 실패, 기본 순서 사용:', e && e.message); return candidates; }
  }

  Object.assign(C, {
    bigramSimilarity, buildScanPool, triggerScan, hybridSearch, smartRerank,
    __searchLoaded: true
  });
  console.log('[LoreCore:search] loaded v1.3.9');
})();
