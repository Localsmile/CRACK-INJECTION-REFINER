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

  function applyRetrievalProvenanceGuard(score, entry, provenance, hasTemporalCue) {
    let adjusted = Number(score) || 0;
    let maxInjectionLevel = null;
    let scope = '';
    const hasCrossArcCue = !!(provenance && (provenance.hasSpecificCue || hasTemporalCue));
    if (provenance?.crossArc && !hasCrossArcCue) {
      const stableReference = entry?.type === 'character' || entry?.type === 'identity' || entry?.type === 'rel' || entry?.type === 'relationship';
      adjusted = stableReference ? adjusted * 0.35 : 0;
      if (stableReference) maxInjectionLevel = 'micro';
      scope = 'cross_arc_reference';
    }
    if (provenance?.futureTurnRisk && !hasCrossArcCue) {
      adjusted = 0;
      scope = 'future_turn_guard';
    }
    return { score: adjusted, maxInjectionLevel, scope, hasCrossArcCue };
  }

  function workingMemoryText(memory) {
    if (!memory || typeof memory !== 'object') return '';
    return [
      memory.scene,
      Array.isArray(memory.activeChars) ? memory.activeChars.join(' ') : '',
      memory.emotion
    ].filter(Boolean).join(' ').slice(0, 300);
  }

  // 스캔 풀: 유저 입력 + 최근 메세지 범위 (config.scanRange / scanOffset)
  function buildScanPool(userInput, recentMsgs, config) {
    const range = Math.max(1, (config && config.scanRange) || 6);
    const offset = Math.max(0, (config && config.scanOffset) || 0);
    const arr = Array.isArray(recentMsgs) ? recentMsgs : [];
    const end = Math.max(0, arr.length - offset);
    const start = Math.max(0, end - range);
    const sliceText = arr.slice(start, end).map(m => (m && m.message) || '').join(' ');
    return ((userInput || '') + ' ' + sliceText + ' ' + workingMemoryText(config && config.workingMemory)).toLowerCase();
  }

  function candidateTerms(entry) {
    if (!entry) return [];
    const values = [
      entry.name,
      ...(entry.triggers || []),
      ...(entry.entities || []),
      ...(entry.parties || [])
    ].filter(Boolean).join(' ').toLowerCase();
    const words = values.split(/[\s,.!?;:"'()[\]{}<>\/\\|=:+→↔&_-]+/).map(x => x.trim()).filter(x => x.length >= 2);
    return Array.from(new Set(words)).slice(0, 80);
  }

  function candidateSimilarity(a, b) {
    const ea = a && (a.entry || a), eb = b && (b.entry || b);
    if (!ea || !eb) return 0;
    if (ea.id != null && eb.id != null && ea.id === eb.id) return 1;
    if (ea.rootId && eb.rootId && ea.rootId === eb.rootId) return 0.95;
    const an = String(ea.name || '').trim().toLowerCase();
    const bn = String(eb.name || '').trim().toLowerCase();
    if (an && bn && an === bn) return 0.9;
    const A = new Set(candidateTerms(ea)), B = new Set(candidateTerms(eb));
    if (!A.size || !B.size) return 0;
    let overlap = 0;
    for (const term of A) if (B.has(term)) overlap++;
    const jaccard = overlap / Math.max(1, A.size + B.size - overlap);
    const entityA = new Set((C.inferEntryEntities ? C.inferEntryEntities(ea) : (ea.entities || [])).map(x => String(x).toLowerCase()));
    const entityB = new Set((C.inferEntryEntities ? C.inferEntryEntities(eb) : (eb.entities || [])).map(x => String(x).toLowerCase()));
    let entityOverlap = 0;
    for (const term of entityA) if (entityB.has(term)) entityOverlap++;
    const entityScore = entityOverlap / Math.max(1, Math.min(entityA.size || 1, entityB.size || 1));
    return Math.min(1, jaccard * 0.7 + entityScore * 0.3);
  }

  function selectDiverseCandidates(candidates, limit, options = {}) {
    const rows = (candidates || []).filter(row => row && row.entry && Number(row.score) > 0);
    const maxCount = Math.max(0, Number(limit || 0));
    if (!maxCount || !rows.length) return [];
    if (options.enabled === false || rows.length <= 1) return rows.slice(0, maxCount);
    const poolLimit = Math.max(maxCount, Number(options.poolLimit || Math.max(12, maxCount * 4)));
    const pool = rows.slice(0, poolLimit);
    const maxScore = Math.max(...pool.map(row => Number(row.score) || 0), 0.000001);
    const relWeight = Math.max(0.7, Math.min(0.95, Number(options.relevanceWeight || 0.84)));
    const selected = [];
    const remaining = pool.map((row, index) => ({ row, index }));
    while (selected.length < maxCount && remaining.length) {
      let bestIndex = 0;
      let bestValue = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i];
        const relevance = Math.max(0, Math.min(1, (Number(item.row.score) || 0) / maxScore));
        const similarity = selected.length
          ? Math.max(...selected.map(chosen => candidateSimilarity(item.row, chosen)))
          : 0;
        const directEvidence = (Number(item.row.tScore) > 0 || Number(item.row.eSim) > 0) ? 0.025 : 0;
        const value = relevance * relWeight + (1 - similarity) * (1 - relWeight) + directEvidence - item.index * 0.0001;
        if (value > bestValue) {
          bestValue = value;
          bestIndex = i;
        }
      }
      const picked = remaining.splice(bestIndex, 1)[0].row;
      selected.push(picked);
    }
    return selected;
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
    const periodicRecallEnabled = cfg.periodicRecallEnabled !== false;
    const maintenanceWeight = periodicRecallEnabled ? (cfg.maintenanceWeight != null ? cfg.maintenanceWeight : (DEFAULTS.maintenanceWeight || 0.12)) : 0;
    const timelineRetrievalEnabled = cfg.timelineRetrievalEnabled !== false;
    const timelineRecallWeight = cfg.timelineRecallWeight != null ? cfg.timelineRecallWeight : (DEFAULTS.timelineRecallWeight || 0.32);
    const timelineNoCuePenalty = periodicRecallEnabled ? (cfg.timelineNoCuePenalty != null ? cfg.timelineNoCuePenalty : (DEFAULTS.timelineNoCuePenalty || 0.35)) : 0;
    const timelineRecallLimit = cfg.timelineRecallPoolLimit || Math.max(8, (cfg.maxEntries || 4) * 3);

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
        const model = apiOpts.model || 'gemini-embedding-001';
        const ids = enabled.map(e => e.id);
        const allEmbs = ids.length ? await db.embeddings.where('entryId').anyOf(ids).toArray() : [];
        const entryMap = {};
        for (const e of enabled) entryMap[e.id] = e;
        const expectedDocTask = model.includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : null;
        const usableEmbeddings = allEmbs.filter(eb => {
          if (!eb || !Array.isArray(eb.vector) || !eb.vector.length) return false;
          const entry = entryMap[eb.entryId];
          if (!entry) return false;
          if (eb.packName && eb.packName !== entry.packName) return false;
          if (eb.model && eb.model !== model) return false;
          if (expectedDocTask && eb.taskType && eb.taskType !== expectedDocTask) return false;
          if (C.embeddingSourceHash) {
            const expected = C.embeddingSourceHash(entry, eb.field || 'summary');
            if ((eb.sourceHash || eb.hash) !== expected) return false;
          }
          return true;
        });
        if (usableEmbeddings.length) {
          const tail = Array.isArray(recentMsgs) ? recentMsgs.slice(-2).map(m => (m && m.message) || '').join(' ') : '';
          const qText = ((userInput || '') + ' ' + tail + ' ' + workingMemoryText(cfg.workingMemory)).slice(0, 2000);
          const qTaskType = model.includes('embedding-001') ? 'RETRIEVAL_QUERY' : (apiOpts.taskType || 'RETRIEVAL_QUERY');
          const queryVec = await C.embedText(qText, Object.assign({}, apiOpts, { taskType: qTaskType }));
          if (queryVec) {
            let comparedVectors = 0;
            for (const eb of usableEmbeddings) {
              if (eb.vector.length !== queryVec.length) continue;
              // Vectors from different model spaces or dimensions are not
              // comparable even when their source text is still current.
              const entry = entryMap[eb.entryId];
              let boost = 1.0;
              if (eb.field === 'condition') boost = 1.2;
              if (eb.schemaVersion && eb.schemaVersion < 2) boost *= 0.95;
              const s = cosineSimilarity(queryVec, eb.vector) * boost;
              if (!(eb.entryId in embMap) || s > embMap[eb.entryId]) embMap[eb.entryId] = s;
              comparedVectors++;
            }
            embeddingOk = comparedVectors > 0;
          }
        }
      } catch (e) { console.warn('[LoreCore] 쿼리 임베딩 실패:', e && e.message); }
    }

    // 3) 활성 캐릭터
    const detectedActiveNames = cfg.activeCharDetection !== false
      ? (detectActiveCharacters(recentMsgs || [], enabled) || [])
      : [];
    const memoryActiveNames = cfg.workingMemory && Array.isArray(cfg.workingMemory.activeChars)
      ? cfg.workingMemory.activeChars
      : [];
    const activeNames = Array.from(new Set([...detectedActiveNames, ...memoryActiveNames].filter(Boolean))).slice(0, 8);

    const temporalRecallMap = {};
    let temporalRecallHasCue = false, temporalRecallCount = 0;
    if (temporalEnabled && timelineRetrievalEnabled && C.resolveTemporalRecall) {
      try {
        const resolvedTemporal = C.resolveTemporalRecall(userInput, recentMsgs, enabled, {
          currentTurn: turnCounter || 0,
          activeNames,
          chatKey: cfg.chatKey || '',
          limit: timelineRecallLimit,
          range: cfg.scanRange || 4
        });
        temporalRecallHasCue = !!(resolvedTemporal && resolvedTemporal.hasCue);
        const candidates = (resolvedTemporal && resolvedTemporal.candidates) || [];
        for (const c of candidates) {
          if (c && c.entry && c.entry.id != null) {
            temporalRecallMap[c.entry.id] = c;
            temporalRecallCount++;
          }
        }
      } catch (e) {
        console.warn('[LoreCore] 시간축 리콜 해석 실패:', e && e.message);
      }
    }

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
      let matched = tHit ? tHit.matched : '';

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
        components.maintenance = periodicRecallEnabled && C.maintenanceRecallScore ? C.maintenanceRecallScore(e, turnCounter || 0, cfg) : 0;
        score += components.activeEntity * activeEntityWeight;
        score += components.relationshipGraph * relationshipGraphWeight;
        score += components.temporal * temporalWeight;
        score += components.unresolved * unresolvedWeight;
        score += components.maintenance * maintenanceWeight;
        components.timelineRecall = 0;
        if (timelineRetrievalEnabled && C.isTimelineEvent && C.isTimelineEvent(e)) {
          const tr = temporalRecallMap[e.id];
          if (tr) {
            components.timelineRecall = tr.score || 0;
            if (!matched && tr.matchedTriggers && tr.matchedTriggers.length) matched = tr.matchedTriggers.join(',');
            const rowHasCue = !!tr.hasExplicitCue;
            let recallBoost = tr.blockedByProvenance
              ? 0
              : components.timelineRecall * timelineRecallWeight * (rowHasCue ? 1 : timelineNoCuePenalty);
            if (!rowHasCue && tScore <= 0 && eScore <= 0 && components.timelineRecall < 0.45) recallBoost = 0;
            score += recallBoost;
          }
        }

        if (C.entryRetrievalProvenance) {
          const userCuePool = C.temporalUserCuePool ? C.temporalUserCuePool(userInput, recentMsgs, cfg.scanRange || 4) : userInput;
          const provenance = C.entryRetrievalProvenance(e, {
            chatKey: cfg.chatKey || '',
            currentTurn: turnCounter || 0,
            activeNames,
            userCuePool
          });
          const hasTemporalCue = C.temporalRecallCueScore ? C.temporalRecallCueScore(userCuePool) > 0 : false;
          components.crossArc = provenance.crossArc ? 1 : 0;
          components.futureTurnRisk = provenance.futureTurnRisk ? 1 : 0;
          components.specificCue = provenance.hasSpecificCue ? 1 : 0;
          components.temporalCue = hasTemporalCue ? 1 : 0;
          delete e._maxInjectionLevel;
          delete e._retrievalScope;
          const guarded = applyRetrievalProvenanceGuard(score, e, provenance, hasTemporalCue);
          score = guarded.score;
          if (guarded.maxInjectionLevel) e._maxInjectionLevel = guarded.maxInjectionLevel;
          if (guarded.scope) e._retrievalScope = guarded.scope;
        }
      }

      // 앵커는 주기 회수 ON일 때만 단독 삽입 후보가 될 수 있음.
      if (e.anchor === true && periodicRecallEnabled && score < 0.2) score = 0.2;
      if (e.anchor === true && temporalEnabled && periodicRecallEnabled) score += 0.4;

      return { entry: e, score, tScore, eSim: eSimRaw, matchedTrigger: matched, components };
    });

    scored.sort((a, b) => b.score - a.score);
    const filtered = scored.filter(s => s.score > 0);

    return {
      scored: filtered,
      activeNames,
      searchStats: { trigOnly, embOnly, both, embeddingOk, temporalRecallCount, temporalRecallHasCue }
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
    const promptTpl = cfg.rerankPrompt || apiOpts?.rerankPrompt || DEFAULTS.rerankPrompt || '';
    const isDeepSeek = apiOpts && apiOpts.apiType === 'deepseek';
    const prompt = promptTpl
      ? promptTpl
          .replace('{context}', recentText)
          .replace('{query}', query || '')
          .replace('{candidates}', listText)
        + (isDeepSeek
          ? '\n\nReturn exactly one JSON object: {"scores":[5,4,...]}. No markdown.'
          : '\n\nReturn either {"scores":[5,4,...]} or [{"i":1,"s":5},...] as JSON only.')
      : '명시적 답변 제외: 오직 JSON만 출력.\n장면과 직접 관련성 기준 5점 척도 (5=핵심, 1=무관).\n\n입력:\n' + query + '\n\n최근 대화:\n' + recentText + '\n\n후보:\n' + listText + '\n\n출력: {"scores":[5,4,...]}';
    try {
      const res = await callGeminiApi(prompt, Object.assign({}, apiOpts, { model: (apiOpts && apiOpts.model) || 'gemini-3-flash-preview', responseMimeType: 'application/json', maxRetries: 1 }));
      const raw = String(res && res.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const data = JSON.parse(raw);
      let llmScores = null;
      if (Array.isArray(data.scores)) {
        llmScores = data.scores;
      } else if (Array.isArray(data)) {
        llmScores = new Array(truncated.length);
        for (const row of data) {
          if (!row || typeof row !== 'object') continue;
          const idx = Number(row.i) - 1;
          if (idx >= 0 && idx < truncated.length) llmScores[idx] = row.s;
        }
      }
      if (!Array.isArray(llmScores)) return candidates;
      const hScores = truncated.map(s => s.score);
      const hMin = Math.min.apply(null, hScores), hMax = Math.max.apply(null, hScores);
      const hRange = (hMax - hMin) || 1;
      const reranked = truncated.map((s, i) => {
        const raw = llmScores[i];
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
    bigramSimilarity, applyRetrievalProvenanceGuard,
    buildScanPool, selectDiverseCandidates, triggerScan, hybridSearch, smartRerank,
    __searchLoaded: true
  });
  console.log('[LoreCore:search] loaded v1.3.9');
})();
