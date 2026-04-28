// == 인젝터 모듈 5/6 — inject ==
// 주입 파이프라인 + __loreRegister(inject)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  try {

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__extractLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__extractLoaded)) { console.error('[LoreInj:5] extract 미로드'); return; }
  if (_w.__LoreInj.__injectLoaded) return;

  const {
    C, db, _ls, settings, OOC_FORMATS,
    parseJsonLoose,
    getChatKey, incrementTurnCounter, recordEntryMention,
    getCooldownMap, setCooldownLastTurn,
    addInjLog, runAutoExtract
  } = _w.__LoreInj;

  const MAX_INPUT_CHARS = 2000;

  function summaryOfEntry(e) {
    const s = e && e.summary;
    if (s && typeof s === 'object' && !Array.isArray(s)) return String(s.compact || s.full || s.micro || '');
    return String(s || e?.inject?.compact || e?.name || '');
  }

  function temporalCandidateId(e) {
    return String(e?.eventId || e?.id || e?.name || '');
  }

  function buildTemporalJudgeCandidates(scored, limit) {
    return (scored || [])
      .filter(s => s && s.entry && C.isTimelineEvent && C.isTimelineEvent(s.entry))
      .slice(0, Math.max(1, limit || 6))
      .map(s => {
        const e = s.entry;
        return {
          id: temporalCandidateId(e),
          name: e.name || e.title || '',
          anchor: e.when?.anchor || e.relativeTimeHint || e.timeline?.sceneLabel || '',
          participants: Array.isArray(e.participants) ? e.participants.slice(0, 6) : [],
          location: e.location || '',
          actions: Array.isArray(e.actions) ? e.actions.slice(0, 6) : [],
          hooks: Array.isArray(e.hooks) ? e.hooks.slice(0, 4) : [],
          summary: summaryOfEntry(e).slice(0, 220),
          score: Number((s.score || 0).toFixed ? s.score.toFixed(3) : s.score || 0),
          recall: s.temporalRecall?.score || s.components?.timelineRecall || 0
        };
      });
  }

  async function runTemporalRecallJudge(userInput, recentMsgs, scored, config, apiOpts) {
    if (!config.temporalRecallJudgeEnabled) return null;
    const candidates = buildTemporalJudgeCandidates(scored, config.temporalRecallJudgeCandidateLimit || 6);
    if (!candidates.length) return null;
    const recentText = Array.isArray(recentMsgs)
      ? recentMsgs.slice(-4).map(m => (m.role || '') + ': ' + String(m.message || '').slice(0, 180)).join('\n')
      : '';
    const schema = config.temporalRecallJudgeSchema || _w.__LoreInj.DEFAULT_TEMPORAL_RECALL_JUDGE_SCHEMA || '{}';
    const promptTpl = config.temporalRecallJudgePrompt || _w.__LoreInj.DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT || '';
    if (!promptTpl) return null;
    const prompt = promptTpl
      .replace('{schema}', schema)
      .replace('{context}', (recentText + '\nuser: ' + String(userInput || '').slice(0, 500)).trim())
      .replace('{candidates}', JSON.stringify(candidates, null, 2));
    try {
      // Phase 13-fix: race 종료 시 timeout 타이머 leak 방지 위해 항상 clearTimeout. callGeminiApi는 background에서 계속 실행될 수 있음 (Phase 14에서 AbortController 도입 검토).
      const _judgeTimeoutMs = Math.max(0, Number(config.temporalRecallJudgeTimeoutMs || 0));
      const _judgeCall = C.callGeminiApi(prompt, {
        ...apiOpts,
        model: config.temporalRecallJudgeModel || config.autoExtModel || 'gemini-3-flash-preview',
        responseMimeType: 'application/json',
        maxRetries: 0,
        thinkingConfig: config.temporalRecallJudgeReasoning === 'minimum' ? { thinkingBudget: 0 } : {}
      });
      let _judgeTimer = null;
      const res = _judgeTimeoutMs > 0
        ? await Promise.race([
            _judgeCall,
            new Promise((_, rej) => { _judgeTimer = setTimeout(() => rej(new Error('temporal_judge_timeout')), _judgeTimeoutMs); })
          ]).finally(() => { if (_judgeTimer) { clearTimeout(_judgeTimer); _judgeTimer = null; } })
        : await _judgeCall;
      if (!res || !res.text) return { error: res?.error || 'empty_response', fallback: true };
      const parsed = (parseJsonLoose ? parseJsonLoose(res.text) : JSON.parse(res.text));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'invalid_json', fallback: true };
      const allowedModes = ['none', 'compact_timeline', 'specific_event', 'unresolved_hook'];
      const mode = allowedModes.includes(parsed.mode) ? parsed.mode : (parsed.recall ? 'compact_timeline' : 'none');
      let eventIds = Array.isArray(parsed.eventIds) ? parsed.eventIds.map(String).filter(Boolean) : [];
      const validIds = new Set(candidates.map(c => String(c.id)));
      eventIds = eventIds.filter(id => validIds.has(id)).slice(0, 3);
      return {
        recall: !!parsed.recall && mode !== 'none',
        mode,
        wantedDepth: parsed.wantedDepth || (mode === 'specific_event' ? 'detail' : (mode === 'none' ? 'none' : 'compact')),
        maxChars: Math.max(0, Math.min(600, Number(parsed.maxChars || 0))),
        eventIds,
        query: parsed.query && typeof parsed.query === 'object' ? parsed.query : {},
        reason: String(parsed.reason || '').slice(0, 160)
      };
    } catch (e) {
      console.warn('[LoreInj:temporal-judge] 실패, deterministic fallback 사용:', e && e.message);
      return { error: e.message || String(e), fallback: true };
    }
  }

  function applyTemporalJudge(scored, decision) {
    if (!decision || decision.error || decision.fallback) return scored;
    const selected = new Set((decision.eventIds || []).map(String));
    for (const s of scored || []) {
      if (!s || !s.entry || !(C.isTimelineEvent && C.isTimelineEvent(s.entry))) continue;
      const id = temporalCandidateId(s.entry);
      s.temporalJudge = decision;
      s.entry._temporalJudge = decision;
      if (!decision.recall) {
        if (s.components?.timelineRecall || s.temporalRecall) s.score *= 0.55;
        continue;
      }
      if (selected.has(id)) {
        const mult = decision.mode === 'specific_event' ? 1.45 : (decision.mode === 'unresolved_hook' ? 1.25 : 1.18);
        s.score *= mult;
      } else if (selected.size > 0 && (s.components?.timelineRecall || s.temporalRecall)) {
        s.score *= 0.85;
      }
    }
    scored.sort((a,b) => b.score - a.score);
    return scored;
  }

  function buildTemporalInjectionPlan(scored, decision, config, ctx = {}) {
    const empty = { text: '', entries: [], entryIds: [], eventIds: [], usedChars: 0, mode: 'none', level: 'none', source: 'none' };
    if (!config || config.temporalInjectionEnabled === false || !(C.isTimelineEvent && C.buildTemporalRecallBlock)) return empty;
    const rows = (scored || []).filter(s => s && s.entry && C.isTimelineEvent(s.entry));
    if (!rows.length) return empty;
    const validDecision = decision && !decision.error && !decision.fallback && decision.recall;
    const selected = new Set(validDecision && Array.isArray(decision.eventIds) ? decision.eventIds.map(String) : []);
    const hasTemporalSignal = (s) => selected.has(temporalCandidateId(s.entry)) || !!s.temporalRecall || Number(s.components?.timelineRecall || 0) > 0;
    const explicitMax = Math.max(1, config.temporalRecallExplicitMaxEvents || 3);
    const naturalMax = Math.max(1, config.temporalRecallMaxEvents || 2);
    let picked;
    if (selected.size) picked = rows.filter(s => selected.has(temporalCandidateId(s.entry))).slice(0, explicitMax);
    else if (validDecision) picked = rows.filter(hasTemporalSignal).slice(0, explicitMax);
    else picked = rows.filter(s => hasTemporalSignal(s) && (s.temporalRecall || Number(s.components?.timelineRecall || 0) >= 0.12)).slice(0, naturalMax);
    if (!picked.length) return empty;
    const mode = validDecision ? decision.mode : 'compact_timeline';
    const depth = validDecision ? decision.wantedDepth : 'compact';
    const budget = validDecision
      ? Math.max(120, Math.min(650, Number(decision.maxChars || config.temporalRecallChars || 450)))
      : Math.max(80, Math.min(config.temporalRecallChars || 450, config.temporalRecallNaturalChars || 260));
    const block = C.buildTemporalRecallBlock(picked, {
      decision: validDecision ? decision : { mode, wantedDepth: depth, maxChars: budget },
      mode,
      depth,
      budget,
      maxEvents: validDecision ? explicitMax : naturalMax,
      currentTurn: ctx.currentTurn || 0,
      compressionEnabled: config.temporalCompressionEnabled !== false,
      minCompressedChars: config.temporalCompressionMinChars || 40,
      preserveFields: config.temporalCompressionPreserveFields || ['participants', 'location', 'hooks']
    });
    if (!block || !block.text) return empty;
    const entries = block.entries || picked.map(s => s.entry);
    return {
      text: block.text,
      entries,
      entryIds: entries.map(temporalCandidateId).filter(Boolean),
      eventIds: block.eventIds || entries.map(temporalCandidateId).filter(Boolean),
      usedChars: block.usedChars || C.charLen(block.text),
      mode: block.mode || mode,
      level: block.level || depth,
      source: validDecision ? 'judge' : 'deterministic',
      compressionActions: block.compressionActions || [],
      droppedEventIds: block.droppedEventIds || []
    };
  }

  async function inject(userInput) {
    if (!settings.config.enabled) return userInput;
    const _url = C.getCurUrl(); const chatKey = getChatKey();
    const turnCounter = incrementTurnCounter(chatKey);
    if (settings.config.autoExtEnabled && turnCounter > 0 && turnCounter % settings.config.autoExtTurns === 0) setTimeout(() => runAutoExtract(false), 100);

    const activePacksArr = settings.config.urlPacks?.[_url] || [];
    if (!activePacksArr.length) return userInput;
    const allForPacks = await db.entries.where('packName').anyOf(activePacksArr).toArray();
    const disabledSet = new Set(settings.config.urlDisabledEntries?.[_url] || []);
    let enabled = allForPacks.filter(e => !disabledSet.has(e.id));
    if (!enabled.length) return userInput;

    const fetchCount = Math.max(20, (settings.config.scanRange || 6) * 3);
    const recentMsgs = await C.fetchLogs(fetchCount);

    const config = settings.config;
    const apiOpts = {
      apiType: config.autoExtApiType || 'key', key: config.autoExtKey, vertexJson: config.autoExtVertexJson,
      vertexLocation: config.autoExtVertexLocation || 'global', vertexProjectId: config.autoExtVertexProjectId,
      firebaseScript: config.autoExtFirebaseScript, firebaseEmbedKey: config.autoExtFirebaseEmbedKey,
      model: config.embeddingModel || 'gemini-embedding-001'
    };
    const searchConfig = {
      chatKey: chatKey, turnCounter: turnCounter,
      scanRange: config.scanRange || 6, scanOffset: config.scanOffset || 0,
      strictMatch: config.strictMatch !== false, similarityMatch: config.similarityMatch === true,
      embeddingEnabled: config.embeddingEnabled || false, embeddingWeight: config.embeddingWeight || 0.4,
      decayEnabled: config.decayEnabled !== false, decayHalfLife: config.decayHalfLife || C.DEFAULTS.decayHalfLife,
      temporalGraphEnabled: config.temporalGraphEnabled !== false,
      temporalWeight: config.temporalWeight != null ? config.temporalWeight : C.DEFAULTS.temporalWeight,
      activeEntityWeight: config.activeEntityWeight != null ? config.activeEntityWeight : C.DEFAULTS.activeEntityWeight,
      relationshipGraphWeight: config.relationshipGraphWeight != null ? config.relationshipGraphWeight : C.DEFAULTS.relationshipGraphWeight,
      unresolvedWeight: config.unresolvedWeight != null ? config.unresolvedWeight : C.DEFAULTS.unresolvedWeight,
      maintenanceWeight: config.maintenanceWeight != null ? config.maintenanceWeight : C.DEFAULTS.maintenanceWeight,
      timelineRetrievalEnabled: config.timelineRetrievalEnabled !== false,
      timelineRecallWeight: config.timelineRecallWeight != null ? config.timelineRecallWeight : (C.DEFAULTS.timelineRecallWeight || 0.32),
      timelineNoCuePenalty: config.timelineNoCuePenalty != null ? config.timelineNoCuePenalty : (C.DEFAULTS.timelineNoCuePenalty || 0.35),
      timelineRecallPoolLimit: config.timelineRecallPoolLimit || 12,
      aiMemoryTurns: config.aiMemoryTurns || 4, activeCharDetection: config.activeCharDetection !== false,
      activeCharBoost: config.activeCharBoostEnabled !== false ? C.DEFAULTS.activeCharBoost : 1.0,
      inactiveCharPenalty: config.activeCharBoostEnabled !== false ? C.DEFAULTS.inactiveCharPenalty : 1.0
    };

    let scored = [], activeNames = [], temporalJudgeDecision = null;
    try {
      const r = await C.hybridSearch(userInput, recentMsgs, enabled, searchConfig, apiOpts);
      scored = r.scored || []; activeNames = r.activeNames || [];
      if (C.resolveTemporalRecall && config.timelineRetrievalEnabled !== false) {
        const resolved = C.resolveTemporalRecall(userInput, recentMsgs, enabled, { currentTurn: turnCounter, activeNames, limit: 4 });
        if (resolved && resolved.candidates && resolved.candidates.length) {
          const byId = new Map(scored.map(s => [s.entry.id, s]));
          for (const c of resolved.candidates) {
            const old = byId.get(c.entry.id);
            if (old) {
              if (old.components && old.components.timelineRecall > 0) {
                old.temporalRecall = old.temporalRecall || c;
                if (!old.matchedTrigger && c.matchedTriggers && c.matchedTriggers.length) old.matchedTrigger = c.matchedTriggers.join(',');
                continue;
              }
              old.score += c.score * (resolved.hasCue ? 0.75 : 0.35);
              old.temporalRecall = c;
            } else {
              const row = { entry: c.entry, score: c.score * (resolved.hasCue ? 0.9 : 0.45), tScore: 0, eSim: 0, matchedTrigger: (c.matchedTriggers || []).join(','), temporalRecall: c };
              scored.push(row);
              byId.set(c.entry.id, row);
            }
          }
          scored.sort((a,b) => b.score - a.score);
        }
      }
      temporalJudgeDecision = await runTemporalRecallJudge(userInput, recentMsgs, scored, config, apiOpts);
      if (temporalJudgeDecision && !temporalJudgeDecision.fallback && !temporalJudgeDecision.error) {
        scored = applyTemporalJudge(scored, temporalJudgeDecision);
      }
      if (r.searchStats && config.embeddingEnabled) {
        const sk = 'lore-hybrid-stats';
        const st = JSON.parse(_ls.getItem(sk) || '{"to":0,"eo":0,"b":0,"n":0,"injLog":[],"lastInjected":[]}');
        st.to += r.searchStats.trigOnly; st.eo += r.searchStats.embOnly; st.b += r.searchStats.both; st.n++;
        // Phase 12-fix: 시간축 회상 텔레메트리 누적.
        st.tRecall = (st.tRecall || 0) + (r.searchStats.temporalRecallCount || 0);
        st.tCue = (st.tCue || 0) + (r.searchStats.temporalRecallHasCue ? 1 : 0);
        if (st.lastInjected && st.lastInjected.length && recentMsgs.length >= 2) {
          const lastAIMsg = [...recentMsgs].reverse().find(m => m.role === 'assistant');
          const lastAI = (lastAIMsg?.message || '').toLowerCase();
          const reflected = st.lastInjected.filter(n => lastAI.includes(n.toLowerCase())).length;
          st.injLog.push(reflected / Math.max(st.lastInjected.length, 1));
          if (st.injLog.length > 30) st.injLog.shift();
        }
        if (st.n > 0 && st.n % 20 === 0) {
          const total = st.to + st.eo + st.b;
          if (total > 5) {
            const embContrib = (st.eo + st.b * 0.5) / total;
            const avgReflection = st.injLog.length > 0 ? st.injLog.reduce((a,b) => a + b, 0) / st.injLog.length : 0.5;
            const feedbackAdj = avgReflection > 0.4 ? 0 : (0.4 - avgReflection) * 0.3;
            const target = Math.max(0.15, Math.min(0.65, embContrib + feedbackAdj));
            const smoothed = 0.7 * (config.embeddingWeight || 0.4) + 0.3 * target;
            settings.config.embeddingWeight = parseFloat(smoothed.toFixed(3)); settings.save();
          }
        }
        _ls.setItem(sk, JSON.stringify(st));
      }
    } catch(e) {
      const tr = C.triggerScan(userInput, recentMsgs, enabled, searchConfig);
      scored = tr.map(r => ({ entry: r.entry, score: r.triggerScore }));
      activeNames = C.detectActiveCharacters(recentMsgs, enabled);
    }

    if (config.pendingPromiseBoost !== false) {
      for (const s of scored) { if (s.entry.type === 'promise' && s.entry.detail?.status === 'pending') s.score = Math.max(s.score, 0.3); }
      scored.sort((a,b) => b.score - a.score);
    }

    for (const s of scored) {
      if (s.entry.rootId && !s.entry.isCurrentArc) s.score *= 0.3;
    }
    scored.sort((a,b) => b.score - a.score);

    if (activeNames.length >= 2 && config.firstEncounterWarning !== false) {
      for (let i = 0; i < activeNames.length; i++) {
        for (let j = i + 1; j < activeNames.length; j++) {
          try {
            await C.recordFirstEncounter(activeNames[i], activeNames[j], { turnApprox: turnCounter });
          } catch(e) {}
        }
      }
    }

    if (config.rerankEnabled) {
      try {
        C.showStatusBadge('에리가 로어 재정렬 중');
        const last2 = recentMsgs.slice(-4).map(m => m.role + ': ' + m.message).join('\n');
        scored = await C.smartRerank(userInput, scored, last2, {
          apiType: config.autoExtApiType || 'key', key: config.autoExtKey,
          vertexJson: config.autoExtVertexJson, vertexLocation: config.autoExtVertexLocation || 'global',
          vertexProjectId: config.autoExtVertexProjectId,
          firebaseScript: config.autoExtFirebaseScript,
          model: config.rerankModel || config.autoExtModel || 'gemini-3-flash-preview'
        });
      } catch(e) {}
      // 리랭크 직후 hide 대신 "응답 기다리는 중"으로 전환 — Refiner가 실제 응답 감지 시 다음 상태로 교체/hide 담당
      C.showStatusBadge('에리가 응답 기다리는 중');
    }

    if (config.cooldownEnabled) {
      const cMap = getCooldownMap(chatKey);
      scored = scored.filter(s => {
        const last = cMap[s.entry.id];
        return last === undefined || (turnCounter - last) >= config.cooldownTurns;
      });
    }

    // Delta skip: 최근 N턴 이내 동일 콘텐츠로 주입된 엔트리는 재주입 생략 (예산 확보).
    const _deltaKey = 'lore-recent-injections:' + chatKey;
    let _recentInj = {}; try { _recentInj = JSON.parse(_ls.getItem(_deltaKey) || '{}'); } catch(e) {}
    const _deltaTurns = config.deltaSkipTurns != null ? config.deltaSkipTurns : 3;
    let _deltaSkippedCount = 0;
    // Delta skip은 기본 OFF. 명시적으로 true로 켜야 동작 (재생성 시나리오와 충돌 방지)
    const _filteredScored = (config.deltaSkipEnabled !== true) ? scored : scored.filter(s => {
      const rec = _recentInj[s.entry.id];
      if (!rec) return true;
      if (turnCounter - (rec.turn || 0) >= _deltaTurns) return true;
      const sig = String(s.entry.lastUpdated || s.entry.ts || '');
      if (sig !== rec.sig) return true;
      _deltaSkippedCount++;
      return false;
    });
    const temporalPlan = buildTemporalInjectionPlan(_filteredScored, temporalJudgeDecision, config, { currentTurn: turnCounter });
    const temporalIds = new Set(temporalPlan.entryIds || []);
    // Phase 12-fix: timeline_event 항목은 시간축 채널 전용으로 처리.
    // temporalPlan에 채택되지 못한 timeline_event도 lore 섹션에서 generic formatter로 노출되지 않도록 제외.
    const _loreScored = _filteredScored.filter(s => {
      if (!s || !s.entry) return false;
      if (temporalIds.has(temporalCandidateId(s.entry))) return false;
      if (C.isTimelineEvent && C.isTimelineEvent(s.entry)) return false;
      return true;
    });
    const topScored = _loreScored.slice(0, config.maxEntries || 4);
    const topEntries = topScored.map(s => { if (s.components) s.entry._nway = s.components; return s.entry; });
    if (!topEntries.length && !temporalPlan.text) return userInput;

    const pfx = config.prefix || OOC_FORMATS.default.prefix;
    const sfx = config.suffix || OOC_FORMATS.default.suffix;
    if (C.charLen(userInput) >= MAX_INPUT_CHARS - 20) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(), turn: turnCounter,
        matched: [], count: 0, note: '공간부족',
        budgetPlan: { userChars: C.charLen(userInput), maxInputChars: MAX_INPUT_CHARS },
        finalChars: C.charLen(userInput), reason: 'user_input_too_long'
      });
      return userInput;
    }

    let honorifics = '';
    if (config.honorificMatrixEnabled !== false) honorifics = C.formatHonorificMatrix(C.buildHonorificMatrix(enabled, activeNames), 80);
    let unmetPairs = [];
    if (config.firstEncounterWarning !== false) try { unmetPairs = await C.findUnmetPairs(activeNames); } catch(e) {}
    if (unmetPairs.length > 0) {
      const knownPairs = new Set();
      for (const r of enabled) {
        if (r.type !== 'rel' && r.type !== 'relationship') continue;
        let parties = r.parties || r.detail?.parties;
        if ((!parties || parties.length < 2) && typeof r.name === 'string') {
          if (r.name.includes('↔')) parties = r.name.split('↔').map(s => s.trim()).filter(Boolean);
          else if (r.name.includes('&')) parties = r.name.split('&').map(s => s.trim()).filter(Boolean);
        }
        if (parties && parties.length >= 2) knownPairs.add([parties[0], parties[1]].sort().join('|'));
      }
      if (knownPairs.size > 0) {
        unmetPairs = unmetPairs.filter(pair => !knownPairs.has([pair[0], pair[1]].sort().join('|')));
      }
    }

    let firstEncounterBlock = '';
    if (unmetPairs.length > 0 && config.firstEncounterWarning !== false) {
      try {
        const feKey = 'lore-fe-recent-' + chatKey;
        const log = JSON.parse(_ls.getItem(feKey) || '[]');
        const fresh = unmetPairs.filter(p => {
          const k = [...p].sort().join('|');
          const last = log.find(x => x.key === k);
          return !last || (turnCounter - last.turn) >= 5;
        });
        if (fresh.length > 0) {
          const pick = fresh[0];
          firstEncounterBlock = C.formatFirstEncounterBlock(pick);
          log.push({ key: [...pick].sort().join('|'), turn: turnCounter });
          _ls.setItem(feKey, JSON.stringify(log.slice(-20)));
          unmetPairs = unmetPairs.filter(p => p !== pick);
        }
      } catch(e) {}
    }

    let reunionTags = '';
    if (config.firstEncounterWarning !== false) {
      try {
        const reunions = await C.findReunionPairs(activeNames, turnCounter, 10);
        if (reunions.length > 0) {
          reunionTags = reunions.slice(0, 2).map(r => C.formatReunionTag(r.pair, r.gap)).join('\n');
        }
      } catch(e) {}
    }

    let sceneTag = '';
    if (recentMsgs.length > 0 && config.firstEncounterWarning !== false) {
      try {
        const kw = C.extractSceneKeywords(recentMsgs);
        sceneTag = C.formatSceneTag(kw);
      } catch(e) {}
    }

    try {
      await C.updateWorkingMemory(_url, {
        turn: turnCounter,
        activeChars: activeNames.slice(0, 5),
        scene: sceneTag,
        lastAction: (recentMsgs[recentMsgs.length - 1]?.message || '').slice(0, 80),
        updatedAt: Date.now()
      });
    } catch(e) {}

    const temporalHints = (config.firstEncounterWarning !== false && C.formatTemporalHints)
      ? C.formatTemporalHints(topEntries, { currentTurn: turnCounter, activeNames, budget: Math.min(config.temporalHintChars || C.DEFAULTS.temporalHintChars || 120, 120) })
      : '';
    const fmtResult = C.planInjectionBudget ? C.planInjectionBudget({
      userInput,
      maxInputChars: MAX_INPUT_CHARS,
      entries: topEntries,
      activeNames,
      unmetPairs,
      sceneTag,
      firstEncounterBlock,
      reunionTags,
      honorifics,
      temporalHints,
      temporalRecallBlock: temporalPlan.text,
      config,
      prefix: pfx,
      suffix: sfx
    }) : { injected: '', included: [], usedChars: 0, level: 'none', reason: 'planner_missing', finalChars: C.charLen(userInput), budgetPlan: {} };
    if (!fmtResult.injected) {
      addInjLog(chatKey, {
        time: new Date().toLocaleTimeString(), turn: turnCounter,
        matched: [], count: 0, note: '주입 취소',
        budgetPlan: fmtResult.budgetPlan || {},
        finalChars: fmtResult.finalChars || C.charLen(userInput),
        reason: fmtResult.reason || 'empty'
      });
      return userInput;
    }

    const injected = fmtResult.injected;
    const allIncluded = (() => {
      const m = new Map();
      for (const e of [...(fmtResult.included || []), ...(temporalPlan.entries || [])]) {
        if (e && e.id != null) m.set(e.id, e);
      }
      return Array.from(m.values());
    })();

    try {
      for (const e of allIncluded) {
        recordEntryMention(chatKey, e.id);
        setCooldownLastTurn(chatKey, e.id, turnCounter);
        try { await db.entries.update(e.id, { lastMentionedTurn: turnCounter }); } catch(_) {}
      }
    } catch(e) {}

    try {
      const sk = 'lore-hybrid-stats'; const st = JSON.parse(_ls.getItem(sk) || '{}');
      st.lastInjected = allIncluded.map(e => e.name); _ls.setItem(sk, JSON.stringify(st));
    } catch(e) {}

    const _injectedLen = C.charLen(injected);
    const _userLen = C.charLen(userInput);
    const _finalChars = fmtResult.finalChars || (_userLen + _injectedLen + 2);
    // Delta skip 기록 갱신
    try {
      for (const e of allIncluded) {
        _recentInj[e.id] = { turn: turnCounter, sig: String(e.lastUpdated || e.ts || '') };
      }
      for (const k of Object.keys(_recentInj)) {
        if (turnCounter - (_recentInj[k].turn || 0) > 20) delete _recentInj[k];
      }
      _ls.setItem(_deltaKey, JSON.stringify(_recentInj));
    } catch(e) {}

    addInjLog(chatKey, {
      time: new Date().toLocaleTimeString(), turn: turnCounter,
      matched: allIncluded.map(e => e.name), count: allIncluded.length,
      budget: fmtResult.budgetPlan?.loreBudget || 0, used: fmtResult.usedChars, level: fmtResult.level,
      activeChars: activeNames.slice(0, 5),
      userInputChars: _userLen, injectedChars: _injectedLen,
      totalChars: _finalChars, maxChars: MAX_INPUT_CHARS,
      budgetPlan: fmtResult.budgetPlan || {},
      downgraded: fmtResult.downgraded || [],
      dropped: fmtResult.dropped || [],
      finalChars: _finalChars,
      reason: fmtResult.reason || 'ok',
      temporalJudge: temporalJudgeDecision,
      temporalInjection: {
        source: temporalPlan.source,
        mode: temporalPlan.mode,
        level: temporalPlan.level,
        eventIds: temporalPlan.eventIds || [],
        chars: temporalPlan.usedChars || 0,
        compressionActions: temporalPlan.compressionActions || [],
        droppedEventIds: temporalPlan.droppedEventIds || []
      },
      deltaSkipped: _deltaSkippedCount,
      bundled: fmtResult.bundledCount || 0,
      sections: {
        scene: fmtResult.sections?.scene || C.charLen(sceneTag || ''),
        firstEnc: fmtResult.sections?.firstEncounter || C.charLen(firstEncounterBlock || ''),
        reunion: fmtResult.sections?.reunion || C.charLen(reunionTags || ''),
        honor: fmtResult.sections?.honorifics || C.charLen(honorifics || ''),
        temporalRecall: fmtResult.sections?.temporalRecall || C.charLen(temporalPlan.text || ''),
        lore: C.charLen(fmtResult.text || '')
      }
    });

    return config.position === 'before' ? injected + '\n\n' + userInput : userInput + '\n\n' + injected;
  }

  if (_w.__loreRegister) _w.__loreRegister(inject);

  Object.assign(_w.__LoreInj, { inject, __injectLoaded: true });
  console.log('[LoreInj:5] inject loaded & registered');
  } catch(fatal) {
    console.error('[LoreInj:5] FATAL — inject 등록 실패:', fatal, fatal?.stack);
    _w.__LoreInj = _w.__LoreInj || {};
    if (!_w.__LoreInj.inject) _w.__LoreInj.inject = async (u) => u;
    _w.__LoreInj.__injectLoaded = true;
  }
})();
