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

  function messageIdOf(log) {
    return log && (log.id || log._id || log.messageId) ? String(log.id || log._id || log.messageId) : '';
  }

  function userTurnsBetweenLogs(logs, fromMessageId) {
    if (!Array.isArray(logs) || !logs.length || !fromMessageId) return null;
    let found = false;
    let count = 0;
    for (const log of logs) {
      if (!log) continue;
      if (!found) {
        if (messageIdOf(log) === String(fromMessageId)) found = true;
        continue;
      }
      if (log.role === 'user') count++;
    }
    return found ? count : null;
  }

  function entryLiteralForGate(entry) {
    if (!entry) return '';
    const inject = entry.inject && typeof entry.inject === 'object' ? entry.inject : null;
    return String(
      (inject && (inject.micro || inject.state || inject.summary || inject.detail)) ||
      entry.state ||
      entry.summary ||
      entry.detail ||
      ''
    ).trim();
  }

  function noveltyGate(entry, windowText, logs, opts) {
    opts = opts || {};
    if (!entry) return { allow: false, reason: 'missing_entry' };
    if (opts.explicitRecall === true) return { allow: true, reason: 'explicit_recall' };
    const literal = entryLiteralForGate(entry);
    const hay = String(windowText || '').toLowerCase();
    if (literal && hay.includes(literal.toLowerCase())) return { allow: false, reason: 'literal_present' };
    if (entry.lastMentionedMsgId && Array.isArray(logs)) {
      const idx = logs.findIndex(m => messageIdOf(m) === String(entry.lastMentionedMsgId));
      if (idx >= 0) {
        const mentionAt = Number(entry.lastMentionedAt || 0);
        const updatedAt = Number(entry.lastUpdated || entry.ts || entry.updatedAt || 0);
        if (!updatedAt || !mentionAt || updatedAt <= mentionAt) return { allow: false, reason: 'already_seen_in_window' };
      }
    }
    return { allow: true, reason: 'new_or_changed' };
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
    const unresolvedWeight = cfg.unresolvedWeight != null ? cfg.unresolvedWeight : (DEFAULTS.unresolvedWeight || 0.28);
    const periodicRecallEnabled = cfg.periodicRecallEnabled !== false;
    const timelineRetrievalEnabled = cfg.timelineRetrievalEnabled !== false;
    const timelineRecallWeight = cfg.timelineRecallWeight != null ? cfg.timelineRecallWeight : (DEFAULTS.timelineRecallWeight || 0.32);
    const timelineNoCuePenalty = periodicRecallEnabled ? (cfg.timelineNoCuePenalty != null ? cfg.timelineNoCuePenalty : (DEFAULTS.timelineNoCuePenalty || 0.35)) : 0;
    const timelineRecallLimit = cfg.timelineRecallPoolLimit || Math.max(8, (cfg.maxEntries || 4) * 3);

    const halfLifeHours = cfg.decayHalfLifeHours || DEFAULTS.decayHalfLifeHours || {};
    const hoursSinceMention = (entry) => {
      const at = Number(entry && entry.lastMentionedAt) || 0;
      if (!at) return null;
      return Math.max(0, (Date.now() - at) / 3600000);
    };
    const timeReinjectionScore = (entry) => {
      const hours = hoursSinceMention(entry);
      if (hours == null) return null;
      const type = entry && entry.type || 'default';
      const halfLife = Math.max(1, Number(halfLifeHours[type] || halfLifeHours.default || 24));
      const aiMemHours = Math.max(1, Number(cfg.aiMemoryHours || 6));
      if (hours <= aiMemHours) return 0;
      const overLimit = hours - aiMemHours;
      const needsReinjection = 1 - Math.exp(-overLimit * Math.LN2 / halfLife);
      const relevanceDecay = Math.exp(-hours * Math.LN2 / (halfLife * 4));
      return needsReinjection * relevanceDecay;
    };

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

    const temporalRecallMap = {};
    let temporalRecallHasCue = false, temporalRecallCount = 0;
    if (temporalEnabled && timelineRetrievalEnabled && C.resolveTemporalRecall) {
      try {
        const resolvedTemporal = C.resolveTemporalRecall(userInput, recentMsgs, enabled, {
          currentTurn: turnCounter || 0,
          activeNames,
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

      const serverTurnsSinceMention = e.lastMentionedMsgId ? userTurnsBetweenLogs(recentMsgs, e.lastMentionedMsgId) : null;
      let legacyTurnsSince = null;
      if (serverTurnsSinceMention == null && e.lastMentionedTurn != null && turnCounter != null && e.lastMentionedTurn <= turnCounter) {
        legacyTurnsSince = Math.max(0, turnCounter - e.lastMentionedTurn);
      }
      const timeScore = serverTurnsSinceMention == null && legacyTurnsSince == null ? timeReinjectionScore(e) : null;
      const mentionReScore = timeScore != null
        ? timeScore
        : ((serverTurnsSinceMention != null || legacyTurnsSince != null)
            ? calcReinjectionScore(serverTurnsSinceMention != null ? serverTurnsSinceMention : legacyTurnsSince, e.type, cfg, e)
            : null);
      // 재주입 필요도: 서버 메시지 ID 우선, 구버전 턴 필드 보조, 로그 창 밖이면 시간 기반.
      if (decayEnabled && mentionReScore != null) {
        score = score * (1 + mentionReScore * 0.5);
      }
      // 신규(미언급) 엔트리 최초 등장 기회 — 소폭 가점
      if (decayEnabled && !e.lastMentionedMsgId && e.lastMentionedTurn == null && !e.lastMentionedAt && (tScore > 0 || eScore > 0)) {
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
        components.unresolved = C.unresolvedPriorityScore ? C.unresolvedPriorityScore(e) : 0;
        score += components.unresolved * unresolvedWeight;
        components.timelineRecall = 0;
        if (timelineRetrievalEnabled && C.isTimelineEvent && C.isTimelineEvent(e)) {
          const tr = temporalRecallMap[e.id];
          if (tr) {
            components.timelineRecall = tr.score || 0;
            if (!matched && tr.matchedTriggers && tr.matchedTriggers.length) matched = tr.matchedTriggers.join(',');
            let recallBoost = components.timelineRecall * timelineRecallWeight * (temporalRecallHasCue ? 1 : timelineNoCuePenalty);
            if (!temporalRecallHasCue && tScore <= 0 && eScore <= 0 && components.timelineRecall < 0.45) recallBoost = 0;
            score += recallBoost;
          }
        }
      }

      // 앵커는 주기 회수 ON일 때만 단독 삽입 후보가 될 수 있음.
      if (e.anchor === true && periodicRecallEnabled && score < 0.2) score = 0.2;

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
      const res = await callGeminiApi(prompt, Object.assign({}, apiOpts, { model: (apiOpts && apiOpts.model) || 'gemini-3-flash-preview', responseMimeType: 'application/json', maxOutputTokens: 256, thinkingLevel: 'minimal', maxRetries: 1 }));
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
    bigramSimilarity, buildScanPool, triggerScan, hybridSearch, noveltyGate, smartRerank,
    __searchLoaded: true
  });
  console.log('[LoreCore:search] loaded v1.3.9');
})();
