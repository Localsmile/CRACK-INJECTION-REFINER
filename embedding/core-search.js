// crack-lore-core / search 모듈
// 역할: 트리거 스캔, 하이브리드 검색, LLM 리랭커
// 의존: kernel (callGeminiApi, cosineSimilarity, getDB, simpleHash, DEFAULTS), memory (calcReinjectionScore, detectActiveCharacters, isRelatedToActive)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:search] kernel 미로드'); return; }
  if (!C.__memoryLoaded) { console.error('[LoreCore:search] memory 미로드'); return; }
  if (C.__searchLoaded) return;
  const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
  const { callGeminiApi, cosineSimilarity, getDB, simpleHash, DEFAULTS,
          calcReinjectionScore, detectActiveCharacters, isRelatedToActive } = C;

  function bigramSimilarity(a, b) {
    if (!a || !b) return 0;
    const bigrams = s => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.substr(i, 2)); return set; };
    const A = bigrams(a.toLowerCase()), B = bigrams(b.toLowerCase());
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  function triggerScan(text, entries) {
    const hits = [];
    const lowerText = text.toLowerCase();
    for (const e of entries) {
      if (!e.enabled) continue;
      const triggers = e.triggers || [];
      let hit = false;
      let matchedTrigger = '';
      for (const trigger of triggers) {
        if (trigger.includes('&&')) {
          const parts = trigger.split('&&');
          if (parts.every(p => lowerText.includes(p.toLowerCase()))) { hit = true; matchedTrigger = trigger; break; }
        } else if (trigger.startsWith('~')) {
          const pattern = trigger.slice(1).toLowerCase();
          if (lowerText.includes(pattern)) { hit = true; matchedTrigger = trigger; break; }
          for (const word of lowerText.split(/\s+/)) {
            if (bigramSimilarity(word, pattern) >= 0.75) { hit = true; matchedTrigger = trigger; break; }
          }
          if (hit) break;
        } else {
          if (lowerText.includes(trigger.toLowerCase())) { hit = true; matchedTrigger = trigger; break; }
        }
      }
      if (hit) hits.push({ entry: e, matchedTrigger });
    }
    return hits;
  }

  async function hybridSearch(query, entries, opts = {}) {
    const db = getDB();
    const embWeight = opts.embeddingWeight != null ? opts.embeddingWeight : DEFAULTS.embeddingWeight;
    const trigWeight = 1 - embWeight;
    const topN = opts.topN || DEFAULTS.topN;
    const threshold = opts.threshold || DEFAULTS.embeddingThreshold;
    const recentMsgs = opts.recentMsgs || [];
    const enabled = entries.filter(e => e.enabled !== false);

    const trigHitsRaw = triggerScan(query, enabled);
    const trigSet = new Set(trigHitsRaw.map(h => h.entry.id));
    const trigMatchMap = {}; trigHitsRaw.forEach(h => { trigMatchMap[h.entry.id] = h.matchedTrigger; });

    let queryVec = null;
    if (opts.apiOpts && opts.apiOpts.geminiKey !== null) {
      try {
        const qTaskType = (opts.apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_QUERY' : (opts.apiOpts.taskType || 'RETRIEVAL_QUERY');
        queryVec = await C.embedText(query, { ...opts.apiOpts, taskType: qTaskType });
      } catch (e) { console.warn('[LoreCore] 쿼리 임베딩 실패:', e.message); }
    }

    const embMap = {};
    if (queryVec) {
      const ids = enabled.map(e => e.id);
      const allEmbs = await db.embeddings.where('entryId').anyOf(ids).toArray();
      for (const eb of allEmbs) {
        if (eb.field === 'summary') {
          const s = cosineSimilarity(queryVec, eb.vector);
          if (!embMap[eb.entryId] || s > embMap[eb.entryId]) embMap[eb.entryId] = s;
        } else if (eb.field === 'condition') {
          const s = cosineSimilarity(queryVec, eb.vector) * 1.2;
          if (!embMap[eb.entryId] || s > embMap[eb.entryId]) embMap[eb.entryId] = s;
        }
      }
    }

    const activeNames = opts.activeNames || (recentMsgs.length ? detectActiveCharacters(recentMsgs, enabled) : []);
    const activeBoost = DEFAULTS.activeCharBoost;
    const inactivePenalty = DEFAULTS.inactiveCharPenalty;

    const scored = enabled.map(e => {
      const tHit = trigSet.has(e.id) ? 1 : 0;
      const eSim = embMap[e.id] || 0;
      const tScore = tHit;
      const eScore = eSim > threshold ? eSim : 0;
      let score = trigWeight * tScore + embWeight * eScore;

      // 시간 감쇠 (재주입 필요도)
      if (opts.currentTurn != null && e.lastMentionedTurn != null) {
        const turnsSince = opts.currentTurn - e.lastMentionedTurn;
        const reScore = calcReinjectionScore(turnsSince, e.type, opts.config);
        score = score * (1 + reScore * 0.5);
      }

      // Shard 감점 (현재 아크 외)
      if (e.isCurrentArc === false || e.rootId) score *= 0.3;

      // 활성 캐릭터 부스트/패널티
      if (activeNames.length > 0) {
        const related = isRelatedToActive(e, activeNames);
        score = related ? score * activeBoost : score * inactivePenalty;
      }

      return { entry: e, score, tHit, eSim, matchedTrigger: trigMatchMap[e.id] };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, topN);
  }

  async function smartRerank(query, candidates, recentMsgs, apiOpts, config) {
    if (!candidates.length) return candidates;
    const cfg = config || {};
    const maxCandidates = cfg.rerankMaxCandidates || 8;
    const blendWeight = cfg.rerankBlendWeight != null ? cfg.rerankBlendWeight : 0.5; // LLM 비중 (0=하이브리드만, 1=LLM만)
    const minLlmScore = cfg.rerankMinLlmScore != null ? cfg.rerankMinLlmScore : 2;   // 이하는 무관 취급 제거 (앵커 예외)
    const anchorBoost = cfg.rerankAnchorBoost != null ? cfg.rerankAnchorBoost : 1.0; // 앵커 최종 점수 가산
    const truncated = candidates.slice(0, maxCandidates);
    const recentText = recentMsgs.slice(-4).map(m => `${m.role}: ${(m.message || '').slice(0, 100)}`).join('\n');
    const listText = truncated.map((s, i) => `${i + 1}. [${s.entry.type}] ${s.entry.name}: ${(s.entry.summary || '').slice(0, 100)}`).join('\n');
    const prompt = `명시적 답변 제외: 오직 JSON만 출력.\n장면과 직접 관련성 기준 5점 척도 (5=핵심, 1=무관).\n\n입력:\n${query}\n\n최근 대화:\n${recentText}\n\n후보:\n${listText}\n\n출력: {"scores":[5,4,...]}`;
    try {
      const res = await callGeminiApi(prompt, { ...apiOpts, model: 'gemini-3-flash-preview', responseMimeType: 'application/json', maxOutputTokens: 256, thinkingLevel: 'minimal', maxRetries: 1 });
      const data = JSON.parse(res.text);
      if (!Array.isArray(data.scores)) return candidates;
      // 하이브리드 스코어 min-max 정규화 (레인지 불일치 보정)
      const hScores = truncated.map(s => s.score);
      const hMin = Math.min(...hScores), hMax = Math.max(...hScores);
      const hRange = (hMax - hMin) || 1;
      const reranked = truncated.map((s, i) => {
        const raw = data.scores[i];
        const llmScore = (typeof raw === 'number' && raw >= 1 && raw <= 5) ? raw : 3; // 비정상 응답은 중립 3
        const hybNorm = (s.score - hMin) / hRange;  // 0..1
        const llmNorm = (llmScore - 1) / 4;         // 0..1
        let finalScore = (1 - blendWeight) * hybNorm + blendWeight * llmNorm;
        if (s.entry.anchor === true) finalScore += anchorBoost; // 앵커는 무조건 최상위
        return { ...s, origScore: s.score, llmScore, score: finalScore };
      });
      // 무관 필터 (앵커는 끝까지 살려둔다)
      const kept = reranked.filter(s => s.llmScore > minLlmScore || s.entry.anchor === true);
      const droppedCount = reranked.length - kept.length;
      if (droppedCount > 0) console.log(`[LoreCore:rerank] 무관 ${droppedCount}개 제거 (llm<=${minLlmScore})`);
      kept.sort((a, b) => b.score - a.score);
      // 리랭크 범위 밖 후보는 원 순서 유지, 하지만 kept 최저점보다 높이 올라가지 않도록 score 접어들림
      const minKept = kept.length ? kept[kept.length - 1].score : 0;
      const tail = candidates.slice(maxCandidates).map(s => ({ ...s, origScore: s.score, score: Math.min(s.score, minKept * 0.99) }));
      return [...kept, ...tail];
    } catch (e) { console.warn('[LoreCore] 리랭크 실패, 기본 순서 사용:', e.message); return candidates; }
  }

  Object.assign(C, {
    bigramSimilarity, triggerScan, hybridSearch, smartRerank,
    __searchLoaded: true
  });
  console.log('[LoreCore:search] loaded');
})();
