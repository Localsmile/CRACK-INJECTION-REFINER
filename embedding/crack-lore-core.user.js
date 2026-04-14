// ==UserScript==
// @name        crack-lore-core
// @namespace   로어-코어
// @version     1.1.0
// @description 로어 인젝터/교정기/메모리엔진 공용 코어 (v4.1)
// @author      로컬AI
// @license     Apache-2.0
// @match       https://crack.wrtn.ai/*
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.0.0/crack/libraries/crack-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@chasm-shared-core@v1.0.0/libraries/chasm-shared-core.js
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @connect     generativelanguage.googleapis.com
// @connect     googleapis.com
// @connect     oauth2.googleapis.com
// @connect     contents-api.wrtn.ai
// @connect     crack-api.wrtn.ai
// @run-at      document-start
// ==/UserScript==

(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreCore) return;

  // 상수 및 기본 설정
  const VER = '1.1.0';
  const _gHost = 'generativelanguage.googleapis.com';
  const _gBase = 'https://' + _gHost + '/v1beta/models/';
  const SAFETY = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
  ];

  const PLATFORM = {
    contextTokens: 5500,
    recentTurnsSafe: 4,
    summaryRefreshTurns: 15,
    inputCharLimit: 2000,
    outputTokens: 800,
    avgUserInputChars: 80,
  };

  const DEFAULTS = {
    loreBudgetChars: 350,
    loreBudgetMax: 600,
    targetCharsPerEntry: {full: 140, compact: 70, micro: 35},
    autoCompression: true,
    scanRange: 4,
    scanOffset: 2,
    maxEntries: 4,
    strictMatch: true,
    similarityMatch: true,
    decayEnabled: true,
    decayHalfLife: {
      identity: 80, character: 80, relationship: 40,
      first_encounter: 40, promise: 25, event: 12,
      scene: 3, default: 20
    },
    aiMemoryTurns: 4,
    embeddingEnabled: false,
    embeddingModel: 'gemini-embedding-001',
    embeddingDimensions: 768,
    embeddingTaskType: 'RETRIEVAL_DOCUMENT',
    embeddingWeight: 0.4,
    activeCharDetection: true,
    activeCharBoost: 3.0,
    inactiveCharPenalty: 0.15,
    workingMemoryEnabled: true,
    workingMemoryChars: 60,
    honorificMatrixChars: 80,
    autoExtTurns: 8,
    autoExtScanRange: 4,
    autoExtOffset: 2,
    autoExtMaxRetries: 1,
    prefix: '**OOC:Lore',
    suffix: '**',
    position: 'before',
    importChunkSize: 3000,
    importMaxEntries: 50
  };

  // 데이터베이스
  let _db = null;
  function getDB() {
    if (_db) return _db;
    _db = new Dexie('lore-injector');
    _db.version(1).stores({ entries: '++id, name, type, packName, *triggers', packs: 'name, entryCount' });
    _db.version(2).stores({ entries: '++id, name, type, packName, project, *triggers', packs: 'name, entryCount, project' });
    _db.version(3).stores({ entries: '++id, name, type, packName, project, *triggers', packs: 'name, entryCount, project', snapshots: '++id, packName, timestamp, type' });
    _db.version(4).stores({
      entries: '++id, name, type, packName, project, *triggers',
      packs: 'name, entryCount, project',
      snapshots: '++id, packName, timestamp, type',
      embeddings: '++id, entryId, model, &[entryId+field]',
      workingMemory: 'url',
      encounters: '++id, &[char1+char2]'
    });
    return _db;
  }

  // 네트워크
  const _GM_xhr = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest : ((typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest.bind(GM) : null);
  function gmFetch(url, opts) {
    if (!_GM_xhr) {
      return fetch(url, { method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body || null });
    }
    return new Promise((resolve, reject) => {
      _GM_xhr({
        method: opts.method || 'GET', url, headers: opts.headers || {}, data: opts.body || null, responseType: 'text',
        onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: () => Promise.resolve(r.responseText), json: () => Promise.resolve(JSON.parse(r.responseText)) }),
        onerror: () => reject(new Error('네트워크 오류')), ontimeout: () => reject(new Error('타임아웃'))
      });
    });
  }

  // Vertex AI 인증
  function parseServiceAccountJson(jsonStr) {
    try {
      const obj = JSON.parse(jsonStr);
      if (!obj.client_email || !obj.private_key) return { ok: false, error: 'client_email 또는 private_key 누락' };
      return { ok: true, projectId: obj.project_id || '', clientEmail: obj.client_email, privateKey: obj.private_key, tokenUri: obj.token_uri || 'https://oauth2.googleapis.com/token' };
    } catch (e) { return { ok: false, error: 'JSON 파싱 실패' }; }
  }

  function pemToArrayBuffer(pem) {
    const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/[\r\n\s]/g, '');
    const bin = atob(b64); const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function b64url(buf) {
    if (typeof buf === 'string') buf = new TextEncoder().encode(buf);
    if (buf instanceof ArrayBuffer) buf = new Uint8Array(buf);
    let s = ''; for (const b of buf) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const _tokenCaches = {};
  async function getVertexAccessToken(sa, cacheKey = 'default') {
    if (!_tokenCaches[cacheKey]) _tokenCaches[cacheKey] = { token: null, expiry: 0 };
    const cache = _tokenCaches[cacheKey];
    const now = Math.floor(Date.now() / 1000);
    if (cache.token && cache.expiry > now + 60) return cache.token;
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ iss: sa.clientEmail, sub: sa.clientEmail, aud: sa.tokenUri, iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/cloud-platform' }));
    const signingInput = header + '.' + payload;
    const cryptoKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(sa.privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
    const jwt = signingInput + '.' + b64url(sigBuf);
    const resp = await gmFetch(sa.tokenUri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
    if (!resp.ok) throw new Error('토큰 교환 실패');
    const data = await resp.json();
    cache.token = data.access_token; cache.expiry = now + 3600;
    return cache.token;
  }

  // Gemini API
  async function callGeminiApi(prompt, opts = {}) {
    const { apiType = 'key', key = '', vertexJson = '', vertexLocation = 'global', vertexProjectId = '', model = 'gemini-3-flash-preview', thinkingConfig = {}, maxRetries = 1, responseMimeType, cacheKey = 'generate' } = opts;
    const isVertex = apiType === 'vertex';
    let url, headers;
    if (isVertex) {
      const sa = parseServiceAccountJson(vertexJson);
      if (!sa.ok) return { text: null, status: 0, error: sa.error, retries: 0 };
      const projId = vertexProjectId || sa.projectId;
      if (!projId) return { text: null, status: 0, error: 'project_id 누락', retries: 0 };
      try {
        const token = await getVertexAccessToken(sa, cacheKey);
        const is3x = model.includes('gemini-3') || model.includes('gemini-2.0-flash-thinking');
        const host = is3x ? 'aiplatform.googleapis.com' : `${vertexLocation}-aiplatform.googleapis.com`;
        const loc = is3x ? 'global' : vertexLocation;
        url = `https://${host}/v1/projects/${projId}/locations/${loc}/publishers/google/models/${model}:generateContent`;
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
      } catch (e) { return { text: null, status: 0, error: e.message, retries: 0 }; }
    } else {
      if (!key) return { text: null, status: 0, error: 'API 키 누락', retries: 0 };
      url = _gBase + model + ':generateContent?key=' + key;
      headers = { 'Content-Type': 'application/json' };
    }
    
    const genConfig = {};
    if (Object.keys(thinkingConfig).length > 0) genConfig.thinkingConfig = thinkingConfig;
    if (responseMimeType) genConfig.responseMimeType = responseMimeType;
    const body = JSON.stringify({ safetySettings: SAFETY, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: genConfig });
    
    let lastStatus = 0, lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const r = isVertex ? await gmFetch(url, { method: 'POST', headers, body }) : await fetch(url, { method: 'POST', headers, body }).then(resp => ({ ok: resp.ok, status: resp.status, text: () => resp.text(), json: () => resp.json() }));
        lastStatus = r.status;
        
        if (r.status === 401 && isVertex) {
          if (_tokenCaches[cacheKey]) { _tokenCaches[cacheKey].token = null; _tokenCaches[cacheKey].expiry = 0; }
          if (attempt < maxRetries) {
            try {
              const sa2 = parseServiceAccountJson(vertexJson);
              const newToken = await getVertexAccessToken(sa2, cacheKey);
              headers['Authorization'] = `Bearer ${newToken}`;
            } catch (e) { lastError = e.message; break; }
            continue;
          }
        }
        
        if (!r.ok) {
          const errBody = r.text ? await r.text().catch(() => '') : '';
          lastError = `HTTP ${r.status} ${errBody.slice(0, 500).replace(/\\n/g, ' ')}`;
          if ([400, 403, 404].includes(r.status)) break;
        } else {
          const json = await r.json();
          const parts = json.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find(p => p.text && !p.thought);
          const text = textPart?.text ?? null;
          if (text) return { text, status: r.status, error: null, retries: attempt };
          lastError = '응답 파싱 실패';
        }
      } catch (e) { lastError = e.message; }
      if (attempt < maxRetries) await new Promise(res => setTimeout(res, 2000));
    }
    return { text: null, status: lastStatus, error: lastError, retries: maxRetries };
  }

  async function embedTexts(texts, opts = {}) {
    const { apiType = 'key', key = '', vertexJson = '', vertexLocation = 'global', vertexProjectId = '', model = DEFAULTS.embeddingModel, dimensions = DEFAULTS.embeddingDimensions, taskType = DEFAULTS.embeddingTaskType, cacheKey = 'embed' } = opts;
    const arr = Array.isArray(texts) ? texts : [texts];
    const isVertex = apiType === 'vertex';
    if (isVertex) {
      const sa = parseServiceAccountJson(vertexJson);
      if (!sa.ok) throw new Error(sa.error);
      const projId = vertexProjectId || sa.projectId;
      const token = await getVertexAccessToken(sa, cacheKey);
      const embLoc = (!vertexLocation || vertexLocation === 'global') ? 'us-central1' : vertexLocation;
      const host = `${embLoc}-aiplatform.googleapis.com`;
      const url = `https://${host}/v1/projects/${projId}/locations/${embLoc}/publishers/google/models/${model}:predict`;
      const r = await gmFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ instances: arr.map(t => ({ content: t })), parameters: { outputDimensionality: dimensions } }) });
      if (!r.ok) throw new Error('Vertex 임베딩 실패: ' + r.status);
      const json = await r.json();
      return json.predictions.map(p => normalizeVector(p.embeddings.values));
    } else {
      if (!key) throw new Error('API 키 누락');
      const url = _gBase + model + ':embedContent?key=' + key;
      const bodyObj = { content: { parts: arr.map(t => ({ text: t })) }, output_dimensionality: dimensions };
      if (model.includes('embedding-001')) bodyObj.taskType = taskType;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) });
      if (!r.ok) throw new Error('임베딩 API 실패: ' + r.status);
      const json = await r.json();
      const embs = json.embeddings || [json.embedding];
      return embs.map(e => normalizeVector(e.values));
    }
  }

  async function embedText(text, opts) {
    const results = await embedTexts(text, opts);
    return results[0];
  }

  // 벡터 연산
  function normalizeVector(vec) {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    const out = new Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
    return out;
  }

  function cosineSim(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  // 플랫폼 연동
  function getCurUrl() { return window.location.pathname; }
  function getCurrentChatId() { try { return CrackUtil.path().chatRoom() || null; } catch (e) { return null; } }

  async function fetchLogs(count) {
    const chatId = getCurrentChatId();
    if (!chatId) return [];
    try {
      const items = await CrackUtil.chatRoom().extractLogs(chatId, { maxCount: count });
      if (items instanceof Error || !Array.isArray(items)) return [];
      return items.map(m => ({ role: m.role, message: m.content }));
    } catch (e) { return []; }
  }

  async function fetchAllMemories(chatRoomId) {
    let token = '';
    try { token = CrackUtil.cookie().getAuthToken(); } catch (e) {}
    if (!token) return { goal: [], shortTerm: [], relationship: [], longTerm: [] };
    const headers = { 'Authorization': 'Bearer ' + token };
    const result = { goal: [], shortTerm: [], relationship: [], longTerm: [] };
    const endpoints = {
      goal: { url: `https://contents-api.wrtn.ai/character-chat/v3/chats/${chatRoomId}/summaries?limit=10`, creds: true, hasTitle: false },
      shortTerm: { url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=shortTerm&orderBy=newest`, hasTitle: true },
      relationship: { url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=relationship&orderBy=newest`, hasTitle: true },
      longTerm: { url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=longTerm&orderBy=newest&filter=all`, hasTitle: true }
    };
    for (const [key, cfg] of Object.entries(endpoints)) {
      try {
        const opts = { method: 'GET', headers };
        if (cfg.creds) opts.credentials = 'include';
        const res = await fetch(cfg.url, opts);
        const json = await res.json();
        if (json.result === 'SUCCESS' && json.data?.summaries) {
          result[key] = json.data.summaries.map(s => cfg.hasTitle ? `${s.title}: ${s.summary}` : s.summary);
        }
      } catch (e) {}
    }
    return result;
  }

  async function fetchPersonaName() {
    try {
      const chatId = getCurrentChatId();
      if (!chatId) return null;
      const persona = await CrackUtil.chatRoom().currentPersona(chatId);
      if (persona && !(persona instanceof Error) && persona.name) return persona.name;
    } catch (e) {}
    return null;
  }

  // 시간 감쇠
  function calcForgottenScore(turnsSinceLastMention, halfLife) {
    if (turnsSinceLastMention <= 0) return 0;
    return 1 - Math.exp(-turnsSinceLastMention * Math.LN2 / halfLife);
  }

  function getHalfLife(entryType, config) {
    const hl = config?.decayHalfLife || DEFAULTS.decayHalfLife;
    return hl[entryType] || hl.default || 20;
  }

  function calcReinjectionScore(turnsSinceLastMention, entryType, config) {
    if (turnsSinceLastMention <= 0) return 0;
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
      return { entry: e, names: names.map(n => n.toLowerCase()) };
    });
    const active = [];
    for (const c of characters) {
      if (c.names.some(n => n.length >= 2 && pool.includes(n))) active.push(c.entry.name);
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
    await db.encounters.put({ char1, char2, location: data.location || '', introducer: data.introducer || '', turnApprox: data.turnApprox || 0, impressions: data.impressions || {}, timestamp: Date.now() });
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
    const actionWords = ['키스', '포옹', '악수', '싸움', '도망', '울', '웃', '잡', '안', '밀', '때리', '달리', '숨', '기다', '잠', '먹', '마시', '요리', '노래', '춤', '싸우', '치료'];
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
    const relEntries = entries.filter(e => e.type === 'relationship' && e.detail?.nicknames);
    for (const e of relEntries) {
      for (const [key, value] of Object.entries(e.detail.nicknames)) {
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
    return matrix;
  }

  function formatHonorificMatrix(matrix, budget) {
    const lines = [];
    for (const [from, targets] of Object.entries(matrix)) {
      const pairs = Object.entries(targets).map(([to, hon]) => `${to}=${hon}`);
      lines.push(`${from}→` + pairs.join('/'));
    }
    let result = '[호칭] ' + lines.join(' ');
    if (result.length > budget) result = result.slice(0, budget - 3) + '...';
    return result;
  }

  // 검색 로직
  function bigramSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0.0;
    const bigrams = (str) => { const bg = []; for (let i = 0; i < str.length - 1; i++) bg.push(str.slice(i, i + 2)); return bg; };
    const bg1 = bigrams(s1), bg2 = [...bigrams(s2)];
    let intersection = 0;
    for (const b of bg1) { const idx = bg2.indexOf(b); if (idx >= 0) { intersection++; bg2[idx] = null; } }
    return (2.0 * intersection) / (bigrams(s1).length + bigrams(s2).length);
  }

  function triggerScan(input, msgs, entries, config) {
    const range = config.scanRange || DEFAULTS.scanRange;
    const offset = config.scanOffset || DEFAULTS.scanOffset;
    const strict = config.strictMatch !== false;
    const simMatch = config.similarityMatch === true;
    let historyMsgs = [];
    if (offset > 0 && msgs.length > offset) { historyMsgs = msgs.slice(-(range + offset), -offset).map(m => m.message); }
    else { historyMsgs = msgs.slice(-range).map(m => m.message); }
    const textBlocks = [];
    const hLen = historyMsgs.length;
    for (let i = 0; i < hLen; i++) { textBlocks.push({ text: historyMsgs[i].toLowerCase(), weight: 10 + ((i + 1) / hLen) * 40 }); }
    textBlocks.push({ text: input.toLowerCase(), weight: 100 });
    const results = [];
    for (const e of entries) {
      let bestScore = 0;
      for (const t of (e.triggers || [])) {
        if (!t || t.length < 2) continue;
        const andParts = t.split('&&').map(p => p.trim().toLowerCase());
        let andMatched = true, minScore = Infinity;
        for (const part of andParts) {
          let partBest = 0;
          for (const block of textBlocks) {
            let isExact = false, simScore = 0;
            if (strict) {
              try {
                const esc = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`(^|[\\s\\.,!?\\'\\"\u3000])${esc}(은|는|이|가|을|를|의|에|에게|한테|로|으로|과|와|다|도|만|부터|까지|조차|마저|치고|서야|이라도|조차도|로서|로써|[\\s\\.,!?\\'\\"\u3000]|$)`, 'i');
                if (regex.test(block.text)) isExact = true;
              } catch { if (block.text.includes(part)) isExact = true; }
            } else { if (block.text.includes(part)) isExact = true; }
            if (!isExact && simMatch) {
              for (const w of block.text.split(/[\s.,!?'"]+/)) {
                if (w.length >= 2) { const s = bigramSimilarity(part, w); if (s >= 0.75 && s > simScore) simScore = s; }
              }
            }
            if (isExact || simScore > 0) { const score = block.weight * (isExact ? 1.0 : simScore * 0.7); if (score > partBest) partBest = score; }
          }
          if (partBest === 0) { andMatched = false; break; }
          if (partBest < minScore) minScore = partBest;
        }
        if (andMatched && minScore > bestScore) bestScore = minScore;
      }
      if (bestScore > 0) results.push({ entry: e, triggerScore: bestScore });
    }
    return results;
  }

  async function hybridSearch(input, msgs, entries, config, apiOpts) {
    const triggerResults = triggerScan(input, msgs, entries, config);
    const embWeight = config.embeddingWeight || DEFAULTS.embeddingWeight;
    const trigWeight = 1 - embWeight;
    const activeNames = config.activeCharDetection !== false ? detectActiveCharacters(msgs, entries) : [];
    const maxTrig = Math.max(...triggerResults.map(r => r.triggerScore), 1);

    let embeddingScores = {};
    if (config.embeddingEnabled) {
      try {
        const db = getDB();
        const queryTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_QUERY' : apiOpts.taskType;
        const queryVec = await embedText(input, { ...apiOpts, taskType: queryTaskType });
        const allEmbs = await db.embeddings.toArray();
        for (const emb of allEmbs) {
          const sim = cosineSim(queryVec, emb.vector);
          const key = emb.entryId;
          if (!embeddingScores[key] || sim > embeddingScores[key]) { embeddingScores[key] = sim; }
        }
      } catch (e) { console.warn('[LoreCore] 임베딩 검색 실패, 트리거만 사용:', e.message); }
    }

    const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;
    const url = getCurUrl();
    const turnCounters = JSON.parse(_ls.getItem('lore-turn-counters') || '{}');
    const currentTurn = turnCounters[url] || 0;
    const lastMentionMap = JSON.parse(_ls.getItem('lore-last-mention') || '{}')[url] || {};

    const scored = [];
    const trigMap = {};
    for (const r of triggerResults) trigMap[r.entry.id] = r.triggerScore / maxTrig;

    for (const entry of entries) {
      const tScore = trigMap[entry.id] || 0;
      const eScore = embeddingScores[entry.id] || 0;

      let score;
      if (config.embeddingEnabled && eScore > 0) { score = trigWeight * tScore + embWeight * eScore; } else { score = tScore; }
      if (score === 0 && eScore === 0) continue;

      if (config.decayEnabled !== false) {
        const lastMention = lastMentionMap[entry.id] || 0;
        const turnsSince = currentTurn - lastMention;
        const reinjScore = calcReinjectionScore(turnsSince, entry.type, config);
        if (reinjScore === 0 && score < 0.5) continue;
        score *= (0.2 + 0.8 * reinjScore);
      }

      if (config.activeCharDetection !== false && activeNames.length > 0) {
        if (isRelatedToActive(entry, activeNames)) { score *= (config.activeCharBoost || DEFAULTS.activeCharBoost); }
        else { score *= (config.inactiveCharPenalty || DEFAULTS.inactiveCharPenalty); }
      }

      const srcBoost = {'user_stated':1.0,'imported':0.9,'auto_extracted':0.7};
      score *= (srcBoost[entry.source] || 0.8);
      const gs = entry.gateScore;
      score *= (gs ? 0.7 + 0.3 * (gs / 30) : 0.85);

      scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const searchStats = {trigOnly:0, embOnly:0, both:0};
    if (config.embeddingEnabled) {
      for (const {entry} of scored) {
        const t = trigMap[entry.id] || 0;
        const e = embeddingScores[entry.id] || 0;
        if (t > 0 && e > 0) searchStats.both++;
        else if (t > 0) searchStats.trigOnly++;
        else if (e > 0) searchStats.embOnly++;
      }
    }
    return { scored, activeNames, searchStats };
  }

  async function smartRerank(query, candidates, recentContext, apiOpts) {
    if (!candidates || candidates.length <= 3) return candidates;
    const maxCandidates = 8;
    const subset = candidates.slice(0, maxCandidates);
    const candidateList = subset.map((c, i) => {
      const e = c.entry;
      const summ = (e.summary || '').slice(0, 40);
      const status = e.detail?.current_status || e.detail?.status || '';
      return i + ': ' + e.name + (status ? '|' + status : '') + (summ ? ' ' + summ : '');
    }).join('\n');
    const ctx = (recentContext || '').slice(-200);
    const prompt = 'Given the conversation context, rate each lore entry 1-5 for relevance to the current situation. Return ONLY a JSON array of objects [{"i":index,"s":score}], sorted by score descending.\n\nContext: "' + ctx + '"\nQuery: "' + query.slice(0, 100) + '"\n\nEntries:\n' + candidateList;
    try {
      const res = await callGeminiApi(prompt, {
        apiType: apiOpts.apiType || 'key', key: apiOpts.key, vertexJson: apiOpts.vertexJson, vertexLocation: apiOpts.vertexLocation || 'global', vertexProjectId: apiOpts.vertexProjectId,
        model: apiOpts.rerankModel || apiOpts.model || 'gemini-3-flash-preview',
        thinkingConfig: { thinkingLevel: 'minimal' }, responseMimeType: 'application/json', maxRetries: 0, cacheKey: 'rerank'
      });
      if (!res.text) return candidates;
      const parsed = JSON.parse(res.text);
      if (!Array.isArray(parsed)) return candidates;
      const scoreMap = {};
      for (const item of parsed) { if (typeof item.i === 'number' && typeof item.s === 'number') scoreMap[item.i] = item.s; }
      const reranked = [], unranked = [];
      for (let i = 0; i < subset.length; i++) {
        if (scoreMap[i] !== undefined) reranked.push({ ...subset[i], rerankScore: scoreMap[i] });
        else unranked.push(subset[i]);
      }
      reranked.sort((a, b) => b.rerankScore - a.rerankScore);
      const remaining = candidates.slice(maxCandidates);
      return [...reranked, ...unranked, ...remaining];
    } catch (e) { console.warn('[LoreCore] rerank 실패, 원본 유지:', e.message); return candidates; }
  }

  // 예산 기반 포매터
  function charLen(s){return[...s].length;}
  const TYPE_ABBR={character:'人',identity:'人',relationship:'係',promise:'約',location:'地',event:'事',item:'物',concept:'設',setting:'設'};
  
  function cfFull(e){
    const d=e.detail||{};const abbr=TYPE_ABBR[e.type]||'';const status=d.current_status||d.status||'';
    let line=abbr?'['+abbr+':'+e.name:'['+e.name;if(status)line+='|'+status;line+=']';
    if(e.summary){const sum=charLen(e.summary)>60?[...e.summary].slice(0,57).join('')+'...':e.summary;line+=' '+sum;}
    if(d.nicknames&&typeof d.nicknames==='object'){const pairs=Object.entries(d.nicknames);if(pairs.length>0){const nk=pairs.map(([k,v])=>{const m=k.match(/^(.+?)→(.+?)$/);return m?m[1]+'→'+m[2]+'='+v:k+'='+v;}).join(' ');line+=' 呼'+nk;}}
    if(e.type==='promise'&&d.condition)line+=' 조건:'+([...d.condition].slice(0,25).join(''));
    return line;
  }
  function cfCompact(e){
    const d=e.detail||{};const status=d.current_status||d.status||'';
    let line=e.name;if(status)line+='|'+status;line+=':';
    if(e.summary){const sum=charLen(e.summary)>35?[...e.summary].slice(0,32).join('')+'...':e.summary;line+=' '+sum;}
    if(d.nicknames&&typeof d.nicknames==='object'){const vals=Object.entries(d.nicknames);if(vals.length>0){const nk=vals.map(([k,v])=>v).join('/');line+=' 呼'+nk;}}
    if(e.type==='promise'&&d.status)line+='['+d.status+']';
    return line;
  }
  function cfMicro(e){
    const d=e.detail||{};const val=d.current_status||d.status||(e.summary?[...e.summary].slice(0,15).join(''):e.type);
    let hon='';if(d.nicknames&&typeof d.nicknames==='object'){const vals=Object.values(d.nicknames);if(vals.length>0)hon='/'+vals[0];}
    return e.name+'='+val+hon;
  }

  function adaptiveFormat(opts){
    const{entries=[],activeNames=[],unmetPairs=[],honorifics='',budget=350,config={}}=opts;
    if(!entries.length||budget<30)return{text:'',included:[],usedChars:0,level:'none'};
    const parts=[];let remaining=budget;
    if(honorifics&&config.honorificMatrixEnabled!==false){
      const hB=Math.min(Math.floor(remaining*0.2),80);
      let hT=honorifics;
      if(charLen(hT)>hB)hT=[...hT].slice(0,hB-3).join('')+'...';
      parts.push(hT);remaining-=charLen(hT)+1;
    }
    if(config.firstEncounterWarning!==false&&unmetPairs.length){
      const fB=Math.floor(remaining*0.1);let fUsed=0;
      for(const[a,b]of unmetPairs){
        const tag='[初?'+a+'⇄'+b+']';const tl=charLen(tag);
        if(fUsed+tl>fB)break;parts.push(tag);fUsed+=tl+1;
      }
      remaining-=fUsed;
    }
    const included=[];const loreParts=[];let loreUsed=0;let level='full';
    for(let i=0;i<entries.length;i++){
      const e=entries[i];
      const tag=(i<entries.length*0.25||i===0)?'[!] ':'';
      const line=tag+cfFull(e);const len=charLen(line);
      if(loreUsed+len+1>remaining)break;
      loreParts.push(line);included.push(e);loreUsed+=len+1;
    }
    const rem1=entries.slice(included.length);
    if(rem1.length>0&&remaining-loreUsed>30){
      level='mixed';
      for(const e of rem1){
        const line=cfCompact(e);const len=charLen(line);
        if(loreUsed+len+1>remaining)break;
        loreParts.push(line);included.push(e);loreUsed+=len+1;
      }
    }
    const rem2=entries.slice(included.length);
    if(rem2.length>0&&remaining-loreUsed>15){
      level='mixed+micro';
      for(const e of rem2){
        const line=cfMicro(e);const len=charLen(line);
        if(loreUsed+len+1>remaining)break;
        loreParts.push(line);included.push(e);loreUsed+=len+1;
      }
    }
    if(included.length===0&&entries.length>0){
      level='compact';
      for(const e of entries){
        let line=cfCompact(e);let len=charLen(line);
        if(loreUsed+len+1>remaining){line=cfMicro(e);len=charLen(line);level='micro';}
        if(loreUsed+len+1>remaining)break;
        loreParts.push(line);included.push(e);loreUsed+=len+1;
      }
    }
    if(loreParts.length>0)parts.push(loreParts.join('\n'));
    const usedChars=budget-remaining+loreUsed;
    return{text:parts.join('\n'),included,usedChars,level};
  }

  function formatEntryFull(e) {
    const d = e.detail || {};
    let line = `[${e.name}|${d.current_status || e.type}] ${e.summary || ''}`;
    if (d.nicknames && typeof d.nicknames === 'object') {
      const nk = Object.entries(d.nicknames).map(([k, v]) => `${k}:${v}`).join('/');
      if (nk) line += ` 호칭:${nk}`;
    }
    if (d.cause) line += ` ←${d.cause}`;
    if (e.type === 'promise' && d.condition) line += ` 조건:${d.condition}`;
    if (e.type === 'promise' && d.status) line += ` [${d.status}]`;
    return line;
  }

  function formatEntryCompact(e) {
    const d = e.detail || {};
    let line = `[${e.name}|${d.current_status || e.type}]`;
    if (e.summary) line += ` ${e.summary.slice(0, 40)}`;
    if (e.type === 'promise' && d.status) line += ` [${d.status}]`;
    return line;
  }

  function formatEntryMicro(e) {
    const d = e.detail || {};
    return `${e.name}:${(d.current_status || e.summary || e.type).slice(0, 15)}`;
  }

  function budgetFormat(entries, budget, config) {
    if (!entries.length) return '';
    const target = config?.targetCharsPerEntry || DEFAULTS.targetCharsPerEntry;
    let level;
    if (config?.autoCompression !== false) {
      const avgBudget = budget / entries.length;
      if (avgBudget >= target.full) level = 'full';
      else if (avgBudget >= target.compact) level = 'compact';
      else level = 'micro';
    } else { level = 'compact'; }
    const formatter = { full: formatEntryFull, compact: formatEntryCompact, micro: formatEntryMicro }[level];
    const lines = [];
    let used = 0;
    for (const e of entries) {
      const line = formatter(e);
      if (used + line.length > budget) break;
      lines.push(line);
      used += line.length + 1;
    }
    return lines.join('\n');
  }

  function assembleInjection(opts) {
    const { entries = [], activeNames = [], unmetPairs = [], sceneTag = '', honorifics = '', config = {}, prefix = '', suffix = '' } = opts;
    const budget = config.loreBudgetChars || DEFAULTS.loreBudgetChars;
    const parts = [];
    let remaining = budget;
    if (sceneTag && config.workingMemoryEnabled !== false) { parts.push(sceneTag); remaining -= sceneTag.length + 1; }
    if (honorifics && config.workingMemoryEnabled !== false) {
      const hBudget = Math.min(remaining * 0.3, config.honorificMatrixChars || DEFAULTS.honorificMatrixChars);
      const hText = honorifics.length <= hBudget ? honorifics : honorifics.slice(0, hBudget - 3) + '...';
      parts.push(hText); remaining -= hText.length + 1;
    }
    for (const [a, b] of unmetPairs) {
      const tag = `[첫만남없음:${a}↔${b}]`;
      if (remaining - tag.length < 50) break;
      parts.push(tag); remaining -= tag.length + 1;
    }
    if (remaining > 20 && entries.length > 0) {
      const loreText = budgetFormat(entries, remaining, config);
      if (loreText) parts.push(loreText);
    }
    const body = parts.join('\n');
    if (!body) return '';
    const pfx = prefix || config.prefix || DEFAULTS.prefix;
    const sfx = suffix || config.suffix || DEFAULTS.suffix;
    return `\n${pfx}\n${body}\n${sfx}\n`;
  }

  // 임베딩 관리
  async function ensureEmbedding(entry, apiOpts) {
    const db = getDB();
    const existing = await db.embeddings.where({ entryId: entry.id, field: 'summary' }).first();
    const text = `${entry.name}: ${entry.summary || ''}`;
    const hash = simpleHash(text);
    if (existing && existing.hash === hash) return;
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    const vec = await embedText(text, { ...apiOpts, taskType: docTaskType });
    await db.embeddings.put({
      entryId: entry.id, field: 'summary', vector: vec, hash, model: apiOpts.model || DEFAULTS.embeddingModel,
      taskType: docTaskType, updatedAt: Date.now()
    });
    if (entry.type === 'promise' && entry.detail?.condition) {
      const condText = entry.detail.condition;
      const condHash = simpleHash(condText);
      const existingCond = await db.embeddings.where({ entryId: entry.id, field: 'condition' }).first();
      if (!existingCond || existingCond.hash !== condHash) {
        const condVec = await embedText(condText, { ...apiOpts, taskType: docTaskType });
        await db.embeddings.put({
          entryId: entry.id, field: 'condition', vector: condVec, hash: condHash, model: apiOpts.model || DEFAULTS.embeddingModel,
          taskType: docTaskType, updatedAt: Date.now()
        });
      }
    }
  }

  async function embedPack(packName, apiOpts, onProgress) {
    const db = getDB();
    const entries = await db.entries.where('packName').equals(packName).toArray();
    const docTaskType = (apiOpts.model || '').includes('embedding-001') ? 'RETRIEVAL_DOCUMENT' : apiOpts.taskType;
    let done = 0;
    for (let i = 0; i < entries.length; i += 5) {
      const batch = entries.slice(i, i + 5);
      const texts = batch.map(e => `${e.name}: ${e.summary || ''}`);
      try {
        const vecs = await embedTexts(texts, { ...apiOpts, taskType: docTaskType });
        for (let j = 0; j < batch.length; j++) {
          const hash = simpleHash(texts[j]);
          await db.embeddings.put({
            entryId: batch[j].id, field: 'summary', vector: vecs[j], hash,
            model: apiOpts.model || DEFAULTS.embeddingModel, taskType: docTaskType, updatedAt: Date.now()
          });
        }
      } catch (e) {
        console.warn('[LoreCore] 배치 임베딩 실패, 개별 처리:', e.message);
        for (const entry of batch) { try { await ensureEmbedding(entry, apiOpts); } catch (e2) {} }
      }
      done += batch.length;
      if (onProgress) onProgress(done, entries.length);
    }
    return done;
  }

  function simpleHash(str) {
    let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return h.toString(36);
  }

  async function convertLegacyPack(packName, apiOpts, onProgress) {
    return await embedPack(packName, apiOpts, onProgress);
  }

  // 지식 변환기 (Knowledge Importer)
  const IMPORT_SCHEMA = `[\n  { "type": "character|location|item|event|concept",\n    "name": "엔티티 이름",\n    "triggers": ["키워드1", "키워드2", "관련어&&조합"],\n    "summary": "핵심 요약 (1-2문장)",\n    "detail": {\n      "attributes": "특성/외형/능력",\n      "relations": ["관계 설명"],\n      "background_or_history": "배경"\n    }\n  },\n  { "type": "relationship",\n    "name": "A↔B",\n    "triggers": ["A&&B", "B&&A"],\n    "summary": "관계 요약",\n    "detail": {\n      "parties": ["A", "B"],\n      "current_status": "상태",\n      "nicknames": { "A→B": "호칭", "B→A": "호칭" }\n    }\n  }\n]`;
  const IMPORT_PROMPT_TEMPLATE = `You are a Lore Structurer for AI RP.\nConvert the following source material into structured lore entries for an RP memory system.\n\nRULES:\n1. JSON ONLY. Output a valid JSON array. No markdown.\n2. Use the ORIGINAL LANGUAGE of the source. Korean source → Korean output.\n3. Each entity needs 3-5 triggers (exact keywords from the source).\n4. For relationships, use bidirectional compound triggers: A&&B and B&&A.\n5. Keep summaries terse but complete. Use noun/stem endings for Korean.\n6. Extract characters, locations, items, relationships, factions, key events.\n7. For well-known franchises, focus on RP-relevant info.\n8. Maximum {maxEntries} entries.\n\nSchema:\n{schema}\n\nSource Material:\n{source}`;

  async function importFromText(text, packName, apiOpts, opts = {}) {
    const maxEntries = opts.maxEntries || DEFAULTS.importMaxEntries;
    const chunkSize = opts.chunkSize || DEFAULTS.importChunkSize;
    const allEntries = [];
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) { chunks.push(text.slice(i, i + chunkSize)); }
    for (const chunk of chunks) {
      const prompt = IMPORT_PROMPT_TEMPLATE.replace('{source}', chunk).replace('{schema}', IMPORT_SCHEMA).replace('{maxEntries}', String(maxEntries));
      const res = await callGeminiApi(prompt, { ...apiOpts, responseMimeType: 'application/json', maxRetries: 1 });
      if (res.text) {
        try {
          const parsed = JSON.parse(res.text);
          if (Array.isArray(parsed)) allEntries.push(...parsed);
        } catch (e) { console.warn('[LoreCore] 변환 JSON 파싱 실패:', e.message); }
      }
    }
    if (allEntries.length > 0) {
      const db = getDB();
      let pack = await db.packs.get(packName);
      if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
      for (const e of allEntries) {
        e.packName = packName; e.project = ''; e.enabled = true; e.source = e.source || 'imported';
        await db.entries.put(e);
      }
      const count = await db.entries.where('packName').equals(packName).count();
      await db.packs.update(packName, { entryCount: count });
    }
    return allEntries.length;
  }

  async function importFromJson(jsonArray, packName) {
    const db = getDB();
    let pack = await db.packs.get(packName);
    if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
    let count = 0;
    for (const e of jsonArray) {
      if (!e.name) continue;
      e.packName = packName; e.project = e.project || ''; e.enabled = true; e.source = e.source || 'imported';
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

  // 중복 감지
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

  // UI 헬퍼
  var _statusBadge = null;
  var _pulseStyleAdded = false;
  function showStatusBadge(text) {
    if (!_pulseStyleAdded) {
      _pulseStyleAdded = true;
      var style = document.createElement('style');
      style.textContent = '@keyframes lore-pulse{0%,100%{opacity:1}50%{opacity:.3}}';
      document.head.appendChild(style);
    }
    if (!_statusBadge) {
      _statusBadge = document.createElement('div');
      _statusBadge.id = 'lore-status-badge';
      _statusBadge.style.cssText = 'position:fixed;bottom:70px;right:20px;z-index:999998;background:#1a1a1a;border:1px solid #333;border-radius:20px;padding:8px 16px;font-size:12px;color:#ccc;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;font-family:inherit;transition:opacity .3s;opacity:0;pointer-events:none;';
      document.body.appendChild(_statusBadge);
    }
    _statusBadge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:lore-pulse 1s infinite"></span> ' + text;
    _statusBadge.style.opacity = '1';
    _statusBadge.style.pointerEvents = 'auto';
  }
  function hideStatusBadge() {
    if (_statusBadge) { _statusBadge.style.opacity = '0'; _statusBadge.style.pointerEvents = 'none'; }
  }

  function setFullWidth(node) {
    const p = node.parentElement;
    if (p) {
      p.style.display = 'block'; p.style.padding = '0';
      p.style.border = 'none'; p.style.background = 'transparent';
      Array.from(p.children).forEach(c => { if (c !== node) c.style.display = 'none'; });
    }
    node.style.cssText = 'width:100%;display:block;padding:10px 14px;box-sizing:border-box;background:transparent;border:none;margin-bottom:12px;';
    node.innerHTML = '';
  }

  function createToggleRow(title, desc, isChecked, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc;
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.4;word-break:keep-all;';
    left.appendChild(t); left.appendChild(d);
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const swLabel = document.createElement('span');
    swLabel.textContent = isChecked ? 'ON' : 'OFF';
    swLabel.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;width:22px;text-align:center;';
    const sw = document.createElement('div');
    sw.style.cssText = `width:36px;height:20px;border-radius:10px;cursor:pointer;background:${isChecked ? '#285' : '#444'};position:relative;flex-shrink:0;`;
    const dot = document.createElement('div');
    dot.style.cssText = `width:16px;height:16px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${isChecked ? '18px' : '2px'};transition:left .2s;`;
    sw.appendChild(dot);
    sw.onclick = () => {
      isChecked = !isChecked; onChange(isChecked);
      swLabel.textContent = isChecked ? 'ON' : 'OFF';
      sw.style.background = isChecked ? '#285' : '#444';
      dot.style.left = isChecked ? '18px' : '2px';
    };
    right.appendChild(swLabel); right.appendChild(sw);
    wrap.appendChild(left); wrap.appendChild(right);
    return wrap;
  }

  function createApiInput(config, prefix, nd) {
    const apiTypeKey = prefix + 'ApiType';
    const keyKey = prefix === 'gemini' ? 'geminiKey' : prefix + 'Key';
    const jsonKey = prefix + 'VertexJson';
    const locKey = prefix + 'VertexLocation';
    const projKey = prefix + 'VertexProjectId';
    const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    const btnKey = document.createElement('button');
    const btnVertex = document.createElement('button');
    const keyArea = document.createElement('div');
    const vertexArea = document.createElement('div');
    const isVertex = () => (config[apiTypeKey] || 'key') === 'vertex';
    const updateBtns = () => {
      const v = isVertex();
      btnKey.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!v ? '#285' : '#444'};background:${!v ? '#285' : 'transparent'};color:${!v ? '#fff' : '#ccc'};`;
      btnVertex.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${v ? '#285' : '#444'};background:${v ? '#285' : 'transparent'};color:${v ? '#fff' : '#ccc'};`;
      keyArea.style.display = v ? 'none' : '';
      vertexArea.style.display = v ? '' : 'none';
    };
    btnKey.textContent = 'API Key';
    btnVertex.textContent = 'Vertex AI (JSON)';
    btnKey.onclick = () => { config[apiTypeKey] = 'key'; updateBtns(); };
    btnVertex.onclick = () => { config[apiTypeKey] = 'vertex'; updateBtns(); };
    typeRow.appendChild(btnKey); typeRow.appendChild(btnVertex);
    nd.appendChild(typeRow);
    const ki = document.createElement('input'); ki.type = 'text';
    ki.value = config[keyKey] || ''; ki.placeholder = 'AIzaSy...';
    ki.setAttribute('autocomplete', 'off');
    ki.style.cssText = S + '-webkit-text-security:disc;';
    ki.onchange = () => {
      const val = ki.value.trim();
      if (val.startsWith('{') && val.includes('client_email')) {
        config[apiTypeKey] = 'vertex'; config[jsonKey] = val;
        ki.value = ''; updateBtns(); return;
      }
      config[keyKey] = val;
    };
    keyArea.appendChild(ki); nd.appendChild(keyArea);
    const jta = document.createElement('textarea');
    jta.value = config[jsonKey] || '';
    jta.placeholder = '{ "type": "service_account", ... }';
    jta.style.cssText = S + 'height:100px;font-family:monospace;resize:vertical;';
    jta.onchange = () => { config[jsonKey] = jta.value; };
    vertexArea.appendChild(jta);
    const locRow = document.createElement('div');
    locRow.style.cssText = 'display:flex;gap:12px;margin-top:8px;';
    const locInput = document.createElement('input');
    locInput.value = config[locKey] || 'global';
    locInput.placeholder = 'Location'; locInput.style.cssText = S;
    locInput.onchange = () => { config[locKey] = locInput.value || 'global'; };
    const projInput = document.createElement('input');
    projInput.value = config[projKey] || '';
    projInput.placeholder = 'Project ID'; projInput.style.cssText = S;
    projInput.onchange = () => { config[projKey] = projInput.value; };
    const ld = document.createElement('div'); ld.style.flex = '1'; ld.appendChild(locInput);
    const pd = document.createElement('div'); pd.style.flex = '1'; pd.appendChild(projInput);
    locRow.appendChild(ld); locRow.appendChild(pd);
    vertexArea.appendChild(locRow); nd.appendChild(vertexArea);
    updateBtns();
  }

  // 설정 관리
  const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;

  function loadSettings(key, defaults) {
    try {
      const raw = _ls.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        return { ...defaults, ...p };
      }
    } catch (e) {}
    return { ...defaults };
  }

  function saveSettings(key, config) {
    try { _ls.setItem(key, JSON.stringify(config)); } catch (e) {}
  }

  function incrementTurn(url) {
    const counters = JSON.parse(_ls.getItem('lore-turn-counters') || '{}');
    counters[url] = (counters[url] || 0) + 1;
    _ls.setItem('lore-turn-counters', JSON.stringify(counters));
    return counters[url];
  }

  function recordMention(url, entryId) {
    const all = JSON.parse(_ls.getItem('lore-last-mention') || '{}');
    if (!all[url]) all[url] = {};
    const counters = JSON.parse(_ls.getItem('lore-turn-counters') || '{}');
    all[url][entryId] = counters[url] || 0;
    _ls.setItem('lore-last-mention', JSON.stringify(all));
  }

  // 공용 API 내보내기
  _w.__LoreCore = {
    VER, DEFAULTS, PLATFORM, getDB, gmFetch, callGeminiApi, embedText, embedTexts, parseServiceAccountJson, getVertexAccessToken,
    normalizeVector, cosineSim, getCurUrl, getCurrentChatId, fetchLogs, fetchAllMemories, fetchPersonaName, triggerScan, hybridSearch, smartRerank, bigramSimilarity,
    calcForgottenScore, calcReinjectionScore, getHalfLife, detectActiveCharacters, isRelatedToActive, checkFirstEncounter, recordFirstEncounter, findUnmetPairs,
    getWorkingMemory, updateWorkingMemory, extractSceneKeywords, formatSceneTag, buildHonorificMatrix, formatHonorificMatrix,
    formatEntryFull, formatEntryCompact, formatEntryMicro, budgetFormat, assembleInjection, adaptiveFormat, charLen, cfFull, cfCompact, cfMicro,
    ensureEmbedding, embedPack, convertLegacyPack, importFromText, importFromJson, importFromUrl, detectDuplicatesInSummary,
    showStatusBadge, hideStatusBadge, setFullWidth, createToggleRow, createApiInput, loadSettings, saveSettings, incrementTurn, recordMention,
  };

  console.log(`[LoreCore] v${VER} 로드 완료`);
})();
