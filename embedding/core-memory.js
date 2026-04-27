// crack-lore-core / memory 모듈
// 역할: 시간 감쇠, 활성 캐릭터 감지, 첫만남/재회 추적, Working Memory, 씨 키워드, 호칭 매트릭스
// 의존: kernel.getDB, kernel.DEFAULTS
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:memory] kernel 미로드'); return; }
  if (C.__memoryLoaded) return;
  const { getDB, DEFAULTS } = C;

  // 시간 감쇠
  function calcForgottenScore(turnsSinceLastMention, halfLife) {
    if (turnsSinceLastMention <= 0) return 0;
    return 1 - Math.exp(-turnsSinceLastMention * Math.LN2 / halfLife);
  }

  function getHalfLife(entryType, config) {
    const hl = config?.decayHalfLife || DEFAULTS.decayHalfLife;
    return hl[entryType] || hl.default || 20;
  }

  function calcReinjectionScore(turnsSinceLastMention, entryType, config, entry) {
    if (turnsSinceLastMention <= 0) return 0;
    if (entry && entry.anchor === true) return 1;
    const aiMem = config?.aiMemoryTurns || 4;
    const halfLife = getHalfLife(entryType, config);
    let needsReinjection;
    if (turnsSinceLastMention <= aiMem) { needsReinjection = 0; } else {
      const overLimit = turnsSinceLastMention - aiMem;
      needsReinjection = 1 - Math.exp(-overLimit * 0.5);
    }
    const relevanceDecay = Math.exp(-turnsSinceLastMention * Math.LN2 / halfLife);
    return needsReinjection * relevanceDecay;
  }

  // 활성 캐릭터
  function detectActiveCharacters(recentMsgs, allEntries) {
    const recent = recentMsgs.slice(-6);
    const pool = recent.map(m => m.message || '').join(' ').toLowerCase();
    const characters = allEntries.filter(e => e.type === 'identity' || e.type === 'character').map(e => {
      const names = [e.name];
      if (e.detail?.nicknames) { Object.values(e.detail.nicknames).forEach(n => { if (typeof n === 'string') names.push(n); }); }
      return { entry: e, names: names.map(n => (n || '').toLowerCase()).filter(Boolean) };
    });
    const active = [];
    for (const c of characters) {
      let hit = false;
      for (const n of c.names) {
        const isCJK = /[가-힣㐀-鿿]/.test(n);
        const minLen = isCJK ? 2 : 3;
        if (n.length < minLen) continue;
        if (isCJK) {
          if (pool.includes(n)) { hit = true; break; }
        } else {
          try {
            const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(pool)) { hit = true; break; }
          } catch { if (pool.includes(n)) { hit = true; break; } }
        }
      }
      if (hit) active.push(c.entry.name);
    }
    return active;
  }

  function isRelatedToActive(entry, activeNames) {
    if (!activeNames.length) return true;
    const text = (entry.name + ' ' + (entry.triggers || []).join(' ')).toLowerCase();
    return activeNames.some(name => text.includes(name.toLowerCase()));
  }

  // 첫만남 추적
  async function checkFirstEncounter(char1, char2) {
    const db = getDB();
    let enc = await db.encounters.where({ char1, char2 }).first();
    if (!enc) enc = await db.encounters.where({ char1: char2, char2: char1 }).first();
    return enc || null;
  }

  async function recordFirstEncounter(char1, char2, data) {
    const db = getDB();
    const existing = await checkFirstEncounter(char1, char2);
    const turn = data.turnApprox || 0;
    if (existing) {
      await db.encounters.update(existing.id, {
        lastSeenTurn: turn,
        totalEncounters: (existing.totalEncounters || 1) + 1,
        lastSeenAt: Date.now()
      });
    } else {
      await db.encounters.put({
        char1, char2,
        location: data.location || '',
        introducer: data.introducer || '',
        turnApprox: turn,
        firstMetTurn: turn,
        lastSeenTurn: turn,
        totalEncounters: 1,
        impressions: data.impressions || {},
        timestamp: Date.now(),
        lastSeenAt: Date.now()
      });
    }
  }

  async function findUnmetPairs(activeNames) {
    const unmet = [];
    for (let i = 0; i < activeNames.length; i++) {
      for (let j = i + 1; j < activeNames.length; j++) {
        const enc = await checkFirstEncounter(activeNames[i], activeNames[j]);
        if (!enc) unmet.push([activeNames[i], activeNames[j]]);
      }
    }
    return unmet;
  }

  async function findReunionPairs(activeNames, currentTurn, minGap) {
    const gap = minGap || 10;
    const out = [];
    for (let i = 0; i < activeNames.length; i++) {
      for (let j = i + 1; j < activeNames.length; j++) {
        const enc = await checkFirstEncounter(activeNames[i], activeNames[j]);
        if (!enc) continue;
        const last = enc.lastSeenTurn != null ? enc.lastSeenTurn : (enc.firstMetTurn != null ? enc.firstMetTurn : (enc.turnApprox || 0));
        const diff = currentTurn - last;
        if (diff >= gap) out.push({ pair: [activeNames[i], activeNames[j]], gap: diff });
      }
    }
    return out;
  }

  // Working Memory
  async function getWorkingMemory(url) {
    const db = getDB();
    return await db.workingMemory.get(url) || { url, scene: '', emotion: '', activeChars: [], lastAction: '', turn: 0 };
  }

  async function updateWorkingMemory(url, data) {
    const db = getDB();
    const existing = await getWorkingMemory(url);
    await db.workingMemory.put({ ...existing, ...data, url });
  }

  function extractSceneKeywords(recentMsgs) {
    const last2 = recentMsgs.slice(-4).map(m => m.message || '').join(' ');
    const locationPatterns = /(?:에서|으로|에|장소[:\s]*|곳[:\s]*)([\uAC00-\uD7A3a-zA-Z]+(?:방|집|카페|학교|공원|거리|사무실|병원|숲|바다|호텔|교실|옥상|지하|성|궁전|마을|도시|광장|시장|골목|강|호수|산|절벽|동굴|탑|성벽|아파트|편의점))/gi;
    const locations = [];
    let m;
    while ((m = locationPatterns.exec(last2)) !== null) locations.push(m[1]);
    const actionWords = ['키스', '포옭', '악수', '싸움', '도망', '울', '웃', '잡', '안', '밀', '때리', '달리', '숨', '기다', '잠', '먹', '마시', '요리', '노래', '춤', '싸우', '치료'];
    const actions = actionWords.filter(w => last2.includes(w));
    const emotionWords = ['기쁨', '슬픔', '분노', '공포', '놀람', '긴장', '행복', '불안', '절망', '설렘', '부끄', '당황', '차분'];
    const emotions = emotionWords.filter(w => last2.includes(w));
    return { locations, actions, emotions };
  }

  function formatSceneTag(keywords) {
    const parts = [];
    if (keywords.locations.length) parts.push(keywords.locations.slice(-1)[0]);
    if (keywords.actions.length) parts.push(keywords.actions.slice(-2).join('/'));
    if (keywords.emotions.length) parts.push(keywords.emotions.slice(-1)[0]);
    if (!parts.length) return '';
    return '[씬:' + parts.join('/') + ']';
  }

  // Temporal + entity graph helpers (v9)
  function _arr(x) { return Array.isArray(x) ? x.filter(Boolean).map(v => String(v).trim()).filter(Boolean) : []; }
  function _uniq(a) { return Array.from(new Set(_arr(a))); }
  function inferEntryEntities(entry) {
    if (!entry) return [];
    const d = entry.detail || {};
    const out = []
      .concat(_arr(entry.entities))
      .concat(_arr(entry.parties))
      .concat(_arr(d.parties))
      .concat(_arr(entry.subjects))
      .concat(_arr(entry.objects))
      .concat(_arr(entry.locations));
    if (entry.type === 'character' || entry.type === 'identity') out.push(entry.name);
    if ((entry.type === 'rel' || entry.type === 'relationship') && typeof entry.name === 'string') {
      if (entry.name.includes('↔')) out.push(...entry.name.split('↔'));
      else if (entry.name.includes('&')) out.push(...entry.name.split('&'));
    }
    return _uniq(out);
  }

  function normalizeTemporalGraph(entry, ctx = {}) {
    if (!entry) return entry;
    const nowTurn = Number(ctx.currentTurn || ctx.turn || 0);
    const ts = Date.now();
    const d = entry.detail || {};
    entry.entities = _uniq(inferEntryEntities(entry));
    entry.subjects = _uniq(entry.subjects || (entry.type === 'character' || entry.type === 'identity' ? [entry.name] : []));
    entry.objects = _uniq(entry.objects || d.objects || []);
    entry.locations = _uniq(entry.locations || d.locations || (entry.timeline && entry.timeline.location ? [entry.timeline.location] : []));
    entry.promises = _uniq(entry.promises || (entry.type === 'promise' || entry.type === 'prom' ? [entry.name] : []));
    if (!Array.isArray(entry.relations)) entry.relations = [];
    if (!entry.createdTurn) entry.createdTurn = entry.timeline?.eventTurn || nowTurn || 0;
    entry.updatedTurn = nowTurn || entry.updatedTurn || entry.createdTurn || 0;
    entry.eventTurn = entry.timeline?.eventTurn || entry.eventTurn || entry.createdTurn || 0;
    entry.sceneId = entry.sceneId || ctx.sceneId || entry.timeline?.sceneId || '';
    entry.arcId = entry.arcId || ctx.arcId || entry.rootId || entry.sceneId || '';
    entry.realTimestamp = entry.realTimestamp || entry.ts || ts;
    entry.relativeTimeHint = entry.relativeTimeHint || entry.timeline?.relativeOrder || '';
    return entry;
  }

  function temporalGap(entry, currentTurn) {
    const ev = Number(entry && (entry.eventTurn || entry.timeline?.eventTurn || entry.createdTurn || 0));
    if (!ev || !currentTurn) return null;
    return Math.max(0, currentTurn - ev);
  }

  function graphOverlapScore(entry, activeNames) {
    const active = _arr(activeNames).map(x => x.toLowerCase());
    if (!active.length || !entry) return 0;
    const ents = inferEntryEntities(entry).map(x => x.toLowerCase());
    if (!ents.length) return 0;
    let hits = 0;
    for (const a of active) if (ents.some(e => e === a || e.includes(a) || a.includes(e))) hits++;
    return Math.min(1, hits / Math.max(active.length, 1));
  }

  function relationshipGraphScore(entry, activeNames) {
    if (!entry) return 0;
    let score = 0;
    const t = entry.type;
    if (t === 'rel' || t === 'relationship') score += 0.45;
    if (entry.callState || entry.call || entry.callHistory) score += 0.25;
    score += graphOverlapScore(entry, activeNames) * 0.35;
    const rels = Array.isArray(entry.relations) ? entry.relations.length : 0;
    if (rels) score += Math.min(0.2, rels * 0.05);
    return Math.min(1, score);
  }

  function unresolvedPriorityScore(entry) {
    if (!entry) return 0;
    const d = entry.detail || {};
    const status = String(entry.state || d.status || d.current_status || '').toLowerCase();
    let score = 0;
    if (entry.type === 'promise' || entry.type === 'prom') score += 0.55;
    if (/pending|open|unresolved|미해결|보류|진행|약속/.test(status)) score += 0.35;
    if (entry.cond || d.condition) score += 0.2;
    if (Array.isArray(entry.eventHistory) && entry.eventHistory.length) score += 0.1;
    return Math.min(1, score);
  }

  function maintenanceRecallScore(entry, currentTurn, config) {
    const lmt = entry && entry.lastMentionedTurn;
    if (lmt == null || !currentTurn) return 0;
    const gap = Math.max(0, currentTurn - lmt);
    return calcReinjectionScore(gap, entry.type, config || {}, entry);
  }

  function temporalRecencyScore(entry, currentTurn) {
    const gap = temporalGap(entry, currentTurn);
    if (gap == null) return 0;
    if (entry.anchor) return 1;
    const unresolved = unresolvedPriorityScore(entry);
    const recency = Math.exp(-gap * Math.LN2 / 12);
    return Math.min(1, recency + unresolved * 0.35);
  }

  function buildTemporalHint(entry, currentTurn) {
    if (!entry) return '';
    const gap = temporalGap(entry, currentTurn);
    const ev = entry.eventTurn || entry.timeline?.eventTurn || entry.createdTurn || 0;
    const scene = entry.sceneId || entry.timeline?.sceneLabel || '';
    const arc = entry.arcId || entry.rootId || '';
    if (!ev && !scene && !arc) return '';
    const parts = [];
    if (ev) parts.push('t' + ev);
    if (gap != null) parts.push('gap=' + gap + 't');
    if (scene) parts.push('scene=' + scene);
    if (arc) parts.push('arc=' + arc);
    return `[Then:${entry.name} ${parts.join(' ')}]`;
  }

  function buildRelationDeltaHint(entry) {
    const hist = Array.isArray(entry && entry.callHistory) ? entry.callHistory : [];
    if (!hist.length) return '';
    const last = hist[hist.length - 1];
    if (!last || !last.from || !last.to || !last.term) return '';
    const prev = last.prevTerm ? ' from ' + last.prevTerm : '';
    return `[RelDelta:${last.from}→${last.to}${prev} to ${last.term}${last.turn ? ' at t' + last.turn : ''}]`;
  }

  function formatTemporalHints(entries, opts = {}) {
    const currentTurn = opts.currentTurn || 0;
    const budget = opts.budget || 180;
    const lines = [];
    if (currentTurn) lines.push('[Now:t' + currentTurn + (opts.sceneId ? ' scene=' + opts.sceneId : '') + ']');
    for (const e of entries || []) {
      const rel = buildRelationDeltaHint(e);
      const then = buildTemporalHint(e, currentTurn);
      for (const line of [rel, then]) {
        if (!line) continue;
        const next = lines.concat(line).join('\n');
        if (next.length > budget) return lines.join('\n');
        lines.push(line);
      }
    }
    return lines.join('\n');
  }

  // 호칭 매트릭스
  function parseCallKey(key) {
    const match = String(key || '').match(/^(.+?)→(.+?)$/);
    return match ? { from: match[1], to: match[2] } : null;
  }

  function normalizeCallState(raw, fallbackTerm) {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const currentTerm = source.currentTerm || source.term || source.current || source.call || (typeof raw === 'string' ? raw : fallbackTerm) || '';
    let previousTerms = source.previousTerms || source.previous || source.prev || [];
    if (typeof previousTerms === 'string') previousTerms = [previousTerms];
    if (!Array.isArray(previousTerms)) previousTerms = [];
    previousTerms = previousTerms.map(x => String(x || '').trim()).filter(x => x && x !== currentTerm);
    return {
      currentTerm,
      previousTerms: Array.from(new Set(previousTerms)),
      tone: source.tone || '',
      scope: source.scope || '',
      lastChangedTurn: source.lastChangedTurn || source.turn || 0,
      confidence: source.confidence,
      reason: source.reason || ''
    };
  }

  function isActiveCallPair(from, to, activeNames) {
    if (!activeNames || activeNames.length === 0) return true;
    const fromActive = activeNames.some(n => from.includes(n) || n.includes(from));
    const toActive = activeNames.some(n => to.includes(n) || n.includes(to));
    return fromActive || toActive;
  }

  function setCallState(matrix, states, from, to, raw, fallbackTerm) {
    if (!from || !to) return;
    const state = normalizeCallState(raw, fallbackTerm);
    if (!state.currentTerm && !fallbackTerm) return;
    if (!matrix[from]) matrix[from] = {};
    matrix[from][to] = state.currentTerm || fallbackTerm;
    states[`${from}→${to}`] = state;
  }

  function buildHonorificMatrix(entries, activeNames) {
    const matrix = {};
    const prevMap = {};
    const states = {};
    for (const e of entries) {
      if (e.type !== 'rel' && e.type !== 'relationship') continue;

      const nicknames = e.call || (e.detail?.nicknames) || null;
      if (nicknames && typeof nicknames === 'object') {
        for (const [key, value] of Object.entries(nicknames)) {
          const pair = parseCallKey(key);
          if (!pair) continue;
          if (!isActiveCallPair(pair.from, pair.to, activeNames)) continue;
          setCallState(matrix, states, pair.from, pair.to, { currentTerm: value }, value);
        }
      }

      const callState = e.callState || e.detail?.callState || null;
      if (Array.isArray(callState)) {
        for (const cs of callState) {
          if (!cs) continue;
          const from = cs.from || cs.speaker || cs.source;
          const to = cs.to || cs.target || cs.addressee;
          if (!isActiveCallPair(from || '', to || '', activeNames)) continue;
          setCallState(matrix, states, from, to, cs, cs.currentTerm || cs.term);
        }
      } else if (callState && typeof callState === 'object') {
        if (callState.currentTerm || callState.term) {
          const from = callState.from || callState.speaker || callState.source;
          const to = callState.to || callState.target || callState.addressee;
          if (isActiveCallPair(from || '', to || '', activeNames)) setCallState(matrix, states, from, to, callState, callState.currentTerm || callState.term);
        } else {
          for (const [key, value] of Object.entries(callState)) {
            const pair = parseCallKey(key);
            if (!pair || !isActiveCallPair(pair.from, pair.to, activeNames)) continue;
            setCallState(matrix, states, pair.from, pair.to, value, typeof value === 'string' ? value : value?.currentTerm || value?.term);
          }
        }
      }

      const hist = Array.isArray(e.callHistory) ? e.callHistory : [];
      if (hist.length >= 1) {
        const byKey = {};
        for (const h of hist) {
          if (!h || !h.from || !h.to || !h.term) continue;
          if (!isActiveCallPair(h.from, h.to, activeNames)) continue;
          const k = `${h.from}→${h.to}`;
          (byKey[k] = byKey[k] || []).push(h);
        }
        for (const k in byKey) {
          const arr = byKey[k].sort((a,b) => (a.turn||0) - (b.turn||0));
          const last = arr[arr.length-1];
          const prevTerms = Array.from(new Set(arr.slice(0, -1).map(h => h.term).filter(t => t && t !== last.term)));
          if (prevTerms.length) prevMap[k] = prevTerms[prevTerms.length - 1];
          const pair = parseCallKey(k);
          if (pair) setCallState(matrix, states, pair.from, pair.to, {
            currentTerm: last.term,
            previousTerms: prevTerms,
            tone: last.tone || '',
            scope: last.scope || '',
            lastChangedTurn: last.turn || 0,
            confidence: last.confidence,
            reason: last.reason || ''
          }, last.term);
        }
      }
    }
    return { matrix, prevMap, states };
  }

  function formatHonorificMatrix(result, budget) {
    const src = result && typeof result === 'object' && result.matrix ? result : { matrix: result || {}, prevMap: {}, states: {} };
    const { matrix, prevMap, states } = src;
    const lines = [];
    for (const [from, targets] of Object.entries(matrix)) {
      const pairs = Object.entries(targets).map(([to, hon]) => {
        const k = `${from}→${to}`;
        const state = states && states[k] ? states[k] : normalizeCallState({ currentTerm: hon, previousTerms: prevMap && prevMap[k] ? [prevMap[k]] : [] }, hon);
        const prevTerms = Array.from(new Set([...(state.previousTerms || []), prevMap && prevMap[k]].filter(Boolean))).filter(t => t !== state.currentTerm);
        const meta = [];
        if (state.tone) meta.push(`tone:${state.tone}`);
        if (state.scope) meta.push(`scope:${state.scope}`);
        if (state.lastChangedTurn) meta.push(`t${state.lastChangedTurn}`);
        if (state.confidence != null) meta.push(`conf:${state.confidence}`);
        let out = `${to}=current:${state.currentTerm || hon}`;
        if (prevTerms.length) out += `(prevContext:${prevTerms.slice(-2).join(',')})`;
        if (meta.length) out += `{${meta.join(',')}}`;
        return out;
      });
      lines.push(`${from}→` + pairs.join('/'));
    }
    let out = '[Call] ' + lines.join(' ');
    if (out.length > budget) out = out.slice(0, budget - 3) + '...';
    return out;
  }

  // Append-only 엔트리 버전 백업 (서사 무결성)
  // 기존 entry가 덮어써지기 직전 스냅샷을 entryVersions 테이블에 저장.
  // 엔트리당 최대 20개 유지.
  async function saveEntryVersion(entry, reason) {
    if (!entry || !entry.id) return;
    try {
      const db = getDB();
      if (!db.entryVersions) return; // v7 미만 fallback
      const snap = JSON.parse(JSON.stringify(entry));
      delete snap.id;
      await db.entryVersions.put({
        entryId: entry.id,
        ts: Date.now(),
        turn: 0,
        reason: reason || 'auto',
        snapshot: snap
      });
      const all = await db.entryVersions.where('entryId').equals(entry.id).sortBy('ts');
      if (all.length > 20) {
        const delIds = all.slice(0, all.length - 20).map(v => v.id);
        await db.entryVersions.bulkDelete(delIds);
      }
    } catch(e) { console.warn('[LoreCore:memory] saveEntryVersion 실패:', e.message); }
  }

  async function getEntryVersions(entryId) {
    try {
      const db = getDB();
      if (!db.entryVersions) return [];
      return await db.entryVersions.where('entryId').equals(entryId).reverse().sortBy('ts');
    } catch(e) { return []; }
  }

  async function restoreEntryVersion(versionId) {
    const db = getDB();
    const v = await db.entryVersions.get(versionId);
    if (!v || !v.snapshot) throw new Error('버전 없음');
    const cur = await db.entries.get(v.entryId);
    if (cur) await saveEntryVersion(cur, 'pre_restore');
    const restored = { ...v.snapshot, id: v.entryId };
    await db.entries.put(restored);
    return restored;
  }

  function isAnchor(entry) { return !!(entry && entry.anchor === true); }

  Object.assign(C, {
    calcForgottenScore, calcReinjectionScore, getHalfLife, isAnchor,
    detectActiveCharacters, isRelatedToActive,
    checkFirstEncounter, recordFirstEncounter, findUnmetPairs, findReunionPairs,
    getWorkingMemory, updateWorkingMemory, extractSceneKeywords, formatSceneTag,
    inferEntryEntities, normalizeTemporalGraph, temporalGap, graphOverlapScore,
    relationshipGraphScore, unresolvedPriorityScore, maintenanceRecallScore,
    temporalRecencyScore, buildTemporalHint, buildRelationDeltaHint, formatTemporalHints,
    buildHonorificMatrix, formatHonorificMatrix,
    saveEntryVersion, getEntryVersions, restoreEntryVersion,
    __memoryLoaded: true
  });
  console.log('[LoreCore:memory] loaded');
})();
