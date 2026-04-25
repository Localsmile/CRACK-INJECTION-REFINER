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

  // 호칭 매트릭스
  function buildHonorificMatrix(entries, activeNames) {
    const matrix = {};
    const prevMap = {};
    for (const e of entries) {
      if (e.type !== 'rel' && e.type !== 'relationship') continue;
      const nicknames = e.call || (e.detail?.nicknames) || null;
      if (nicknames && typeof nicknames === 'object') {
        for (const [key, value] of Object.entries(nicknames)) {
          const match = key.match(/^(.+?)→(.+?)$/);
          if (!match) continue;
          const [, from, to] = match;
          if (activeNames.length > 0) {
            const fromActive = activeNames.some(n => from.includes(n) || n.includes(from));
            const toActive = activeNames.some(n => to.includes(n) || n.includes(to));
            if (!fromActive && !toActive) continue;
          }
          if (!matrix[from]) matrix[from] = {};
          matrix[from][to] = value;
        }
      }
      const hist = Array.isArray(e.callHistory) ? e.callHistory : [];
      if (hist.length >= 2) {
        const byKey = {};
        for (const h of hist) {
          if (!h || !h.from || !h.to || !h.term) continue;
          const k = `${h.from}→${h.to}`;
          (byKey[k] = byKey[k] || []).push(h);
        }
        for (const k in byKey) {
          const arr = byKey[k].sort((a,b) => (a.turn||0) - (b.turn||0));
          const last = arr[arr.length-1], prev = arr[arr.length-2];
          if (prev && last && prev.term !== last.term) prevMap[k] = prev.term;
        }
      }
    }
    return { matrix, prevMap };
  }

  function formatHonorificMatrix(result, budget) {
    const src = result && typeof result === 'object' && result.matrix ? result : { matrix: result || {}, prevMap: {} };
    const { matrix, prevMap } = src;
    const lines = [];
    for (const [from, targets] of Object.entries(matrix)) {
      const pairs = Object.entries(targets).map(([to, hon]) => {
        const k = `${from}→${to}`;
        const prev = prevMap && prevMap[k];
        return prev ? `${to}=${hon}(←${prev})` : `${to}=${hon}`;
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
    buildHonorificMatrix, formatHonorificMatrix,
    saveEntryVersion, getEntryVersions, restoreEntryVersion,
    __memoryLoaded: true
  });

})();