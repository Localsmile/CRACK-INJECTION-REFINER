// == 인젝터 모듈 5/6 — inject ==
// 주입 파이프라인 + __loreRegister(inject)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__extractLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__extractLoaded)) { console.error('[LoreInj:5] extract 미로드'); return; }
  if (_w.__LoreInj.__injectLoaded) return;

  const {
    C, db, _ls, settings, OOC_FORMATS,
    getChatKey, incrementTurnCounter, recordEntryMention,
    getCooldownMap, setCooldownLastTurn,
    addInjLog, runAutoExtract
  } = _w.__LoreInj;

  const MAX_INPUT_CHARS = 2000;
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
      model: config.embeddingModel || 'gemini-embedding-001'
    };
    const searchConfig = {
      chatKey: chatKey, turnCounter: turnCounter,
      scanRange: config.scanRange || 6, scanOffset: config.scanOffset || 0,
      strictMatch: config.strictMatch !== false, similarityMatch: config.similarityMatch === true,
      embeddingEnabled: config.embeddingEnabled || false, embeddingWeight: config.embeddingWeight || 0.4,
      decayEnabled: config.decayEnabled !== false, decayHalfLife: config.decayHalfLife || C.DEFAULTS.decayHalfLife,
      aiMemoryTurns: config.aiMemoryTurns || 4, activeCharDetection: config.activeCharDetection !== false,
      activeCharBoost: config.activeCharBoostEnabled !== false ? C.DEFAULTS.activeCharBoost : 1.0,
      inactiveCharPenalty: config.activeCharBoostEnabled !== false ? C.DEFAULTS.inactiveCharPenalty : 1.0
    };

    let scored = [], activeNames = [];
    try {
      const r = await C.hybridSearch(userInput, recentMsgs, enabled, searchConfig, apiOpts);
      scored = r.scored || []; activeNames = r.activeNames || [];
      if (r.searchStats && config.embeddingEnabled) {
        const sk = 'lore-hybrid-stats';
        const st = JSON.parse(_ls.getItem(sk) || '{"to":0,"eo":0,"b":0,"n":0,"injLog":[],"lastInjected":[]}');
        st.to += r.searchStats.trigOnly; st.eo += r.searchStats.embOnly; st.b += r.searchStats.both; st.n++;
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
          model: config.rerankModel || config.autoExtModel || 'gemini-3-flash-preview'
        });
        C.hideStatusBadge();
      } catch(e) { C.hideStatusBadge(); }
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
    const _filteredScored = (config.deltaSkipEnabled === false) ? scored : scored.filter(s => {
      const rec = _recentInj[s.entry.id];
      if (!rec) return true;
      if (turnCounter - (rec.turn || 0) >= _deltaTurns) return true;
      const sig = String(s.entry.lastUpdated || s.entry.ts || '');
      if (sig !== rec.sig) return true;
      _deltaSkippedCount++;
      return false;
    });
    const topEntries = _filteredScored.slice(0, config.maxEntries || 4).map(s => s.entry);
    if (!topEntries.length) return userInput;
    for (const e of topEntries) { recordEntryMention(chatKey, e.id); setCooldownLastTurn(chatKey, e.id, turnCounter); }

    const pfx = config.prefix || OOC_FORMATS.default.prefix;
    const sfx = config.suffix || OOC_FORMATS.default.suffix;
    const wrapperChars = C.charLen(pfx) + C.charLen(sfx) + 6;
    const availableTotal = MAX_INPUT_CHARS - C.charLen(userInput) - wrapperChars;
    if (availableTotal < 30) {
      addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: turnCounter, matched: [], count: 0, note: '공간부족' });
      return userInput;
    }

    const maxBudget = config.loreBudgetMax || 600; const minBudget = config.loreBudgetChars || 350;
    const effectiveBudget = Math.min(availableTotal, Math.max(minBudget, Math.min(availableTotal, maxBudget)));

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
    if (recentMsgs.length > 0) {
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

    const fmtResult = C.adaptiveFormat({ entries: topEntries, activeNames, unmetPairs, honorifics, budget: effectiveBudget, config });
    if (!fmtResult.text && !firstEncounterBlock && !reunionTags && !sceneTag) return userInput;

    const body = [sceneTag, firstEncounterBlock, reunionTags, fmtResult.text].filter(Boolean).join('\n');
    let injected = '\n' + pfx + '\n' + body + '\n' + sfx + '\n';
    if (C.charLen(userInput) + C.charLen(injected) + 2 > MAX_INPUT_CHARS) {
      addInjLog(chatKey, { time: new Date().toLocaleTimeString(), turn: turnCounter, matched: [], count: 0, note: '최종 길이 초과, 주입 취소' });
      return userInput;
    }

    try {
      const sk = 'lore-hybrid-stats'; const st = JSON.parse(_ls.getItem(sk) || '{}');
      st.lastInjected = topEntries.map(e => e.name); _ls.setItem(sk, JSON.stringify(st));
    } catch(e) {}

    const _injectedLen = C.charLen(injected);
    const _userLen = C.charLen(userInput);
    // Delta skip 기록 갱신
    try {
      for (const e of topEntries) {
        _recentInj[e.id] = { turn: turnCounter, sig: String(e.lastUpdated || e.ts || '') };
      }
      for (const k of Object.keys(_recentInj)) {
        if (turnCounter - (_recentInj[k].turn || 0) > 20) delete _recentInj[k];
      }
      _ls.setItem(_deltaKey, JSON.stringify(_recentInj));
    } catch(e) {}

    addInjLog(chatKey, {
      time: new Date().toLocaleTimeString(), turn: turnCounter,
      matched: fmtResult.included.map(e => e.name), count: fmtResult.included.length,
      budget: effectiveBudget, used: fmtResult.usedChars, level: fmtResult.level,
      activeChars: activeNames.slice(0, 5),
      userInputChars: _userLen, injectedChars: _injectedLen,
      totalChars: _userLen + _injectedLen + 2, maxChars: MAX_INPUT_CHARS,
      deltaSkipped: _deltaSkippedCount,
      bundled: fmtResult.bundledCount || 0,
      sections: {
        scene: C.charLen(sceneTag || ''),
        firstEnc: C.charLen(firstEncounterBlock || ''),
        reunion: C.charLen(reunionTags || ''),
        honor: C.charLen(honorifics || ''),
        lore: C.charLen(fmtResult.text || '')
      }
    });

    return config.position === 'before' ? injected + '\n\n' + userInput : userInput + '\n\n' + injected;
  }

  if (_w.__loreRegister) _w.__loreRegister(inject);

  Object.assign(_w.__LoreInj, { inject, __injectLoaded: true });
  console.log('[LoreInj:5] inject loaded & registered');
})();
