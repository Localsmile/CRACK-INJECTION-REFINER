// crack-lore-core / kernel 모듈
// 역할: 상수, Dexie DB, 네트워크, Vertex 인증, Gemini API, 임베딩, 벡터 연산, 해시, 설정 유틸
// 의존: Dexie (글로벌)
// 이후 모듈(platform, memory, search, format, embedding, importer, ui)은 이 모듈 이후에 로드돼야 함.
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreCore && _w.__LoreCore.__kernelLoaded) return;

  // 버전 / 최종 마이그레이션 타깃
  const VER = '1.4.0-test';
  const DB_SCHEMA_VERSION = 9;
  const LOCAL_MIGRATION_VERSION = '1.4.0-test-pass11-local';
  const TIMELINE_EVENT_TYPE = 'timeline_event';
  const TIMELINE_SCHEMA_VERSION = 1;
  const TIMELINE_COMPRESSION_LEVELS = { full: 'full', compact: 'compact', micro: 'micro' };
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
    avgUserInputChars: 80
  };

  const DEFAULTS = {
    loreBudgetChars: 350,
    loreBudgetMax: 600,
    sceneTagChars: 90,
    firstEncounterChars: 240,
    reunionTagChars: 140,
    targetCharsPerEntry: { full: 140, compact: 70, micro: 35 },
    autoCompression: false,
    scanRange: 4,
    scanOffset: 2,
    maxEntries: 4,
    strictMatch: true,
    similarityMatch: true,
    decayEnabled: true,
    decayHalfLife: {
      identity: 15, character: 15, relationship: 8,
      first_encounter: 8, promise: 5, event: 4,
      scene: 2, default: 6
    },
    aiMemoryTurns: 3,
    embeddingEnabled: false,
    embeddingModel: 'gemini-embedding-001',
    embeddingDimensions: 768,
    embeddingTaskType: 'RETRIEVAL_DOCUMENT',
    embeddingWeight: 0.4,
    temporalGraphEnabled: true,
    temporalWeight: 0.18,
    activeEntityWeight: 0.25,
    relationshipGraphWeight: 0.22,
    unresolvedWeight: 0.28,
    maintenanceWeight: 0.12,
    temporalHintChars: 180,
    temporalEventMaxTriggers: 12,
    temporalEventMaxHooks: 8,
    temporalEventMaxLinkedLore: 12,
    temporalEventDefaultCompression: 'compact',
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
    importMaxEntries: 50,
    rerankPrompt: `Given the current RP conversation context, score each lore entry for INJECTION PRIORITY (1-5).

Scoring criteria:
5 = Directly referenced or contradicted in current scene
4 = Active character/location in current scene
3 = Related to active relationship or pending promise
2 = Background info that adds depth
1 = Not relevant to current scene

Rules:
- Pending promises near trigger conditions → boost to 4-5
- Inactive characters not in scene → cap at 2
- Return JSON array: [{"i":<index>,"s":<score>}]
- Sort by score descending
- Omit entries scoring 1

Context: "{context}"
Query: "{query}"

Entries:
{candidates}`
  };

  // Dexie 데이터베이스
  // 1.4.0-test final schema:
  // - v7: entry version history baseline.
  // - v8: embedding lifecycle metadata and stale-row cleanup support.
  // - v9: temporal/entity graph metadata used by N-way memory ranking.
  // - Pass 8/8 local migration is no-API and runs from injecter-3 after settings load.
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
    _db.version(5).stores({
      entries: '++id, name, type, packName, project, *triggers',
      packs: 'name, entryCount, project',
      snapshots: '++id, packName, timestamp, type',
      embeddings: '++id, entryId, model, &[entryId+field]',
      workingMemory: 'url',
      encounters: '++id, &[char1+char2], lastSeenTurn'
    });
    // v6: Shard 아키텍처 — rootId 인덱스 추가.
    _db.version(6).stores({
      entries: '++id, name, type, packName, project, rootId, isCurrentArc, *triggers',
      packs: 'name, entryCount, project',
      snapshots: '++id, packName, timestamp, type',
      embeddings: '++id, entryId, model, &[entryId+field]',
      workingMemory: 'url',
      encounters: '++id, &[char1+char2], lastSeenTurn'
    });
    // v7: entryVersions — append-only 개별 엔트리 버전 이력
    _db.version(7).stores({
      entries: '++id, name, type, packName, project, rootId, isCurrentArc, *triggers',
      packs: 'name, entryCount, project',
      snapshots: '++id, packName, timestamp, type',
      embeddings: '++id, entryId, model, &[entryId+field]',
      workingMemory: 'url',
      encounters: '++id, &[char1+char2], lastSeenTurn',
      entryVersions: '++id, entryId, ts, turn'
    });
    // v8: embedding lifecycle metadata — stale row cleanup without API calls.
    _db.version(8).stores({
      entries: '++id, name, type, packName, project, rootId, isCurrentArc, *triggers',
      packs: 'name, entryCount, project',
      snapshots: '++id, packName, timestamp, type',
      embeddings: '++id, entryId, packName, model, field, sourceHash, entryUpdatedAt, schemaVersion, &[entryId+field]',
      workingMemory: 'url',
      encounters: '++id, &[char1+char2], lastSeenTurn',
      entryVersions: '++id, entryId, ts, turn'
    });
    // v9: temporal + entity graph metadata for N-way RP-aware memory ranking.
    _db.version(9).stores({
      entries: '++id, name, type, packName, project, rootId, isCurrentArc, createdTurn, updatedTurn, lastMentionedTurn, eventTurn, sceneId, arcId, realTimestamp, *entities, *subjects, *objects, *locations, *promises, *triggers',
      packs: 'name, entryCount, project',
      snapshots: '++id, packName, timestamp, type',
      embeddings: '++id, entryId, packName, model, field, sourceHash, entryUpdatedAt, schemaVersion, &[entryId+field]',
      workingMemory: 'url',
      encounters: '++id, &[char1+char2], lastSeenTurn',
      entryVersions: '++id, entryId, ts, turn'
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

  // Vertex 인증
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

  // Firebase SDK 로더 (페이지 컨텍스트에 <script type="module"> 주입)
  let _fbSdkPromise = null;
  function loadFirebaseSdk() {
    if (_w.__crackExtFirebaseSdk) return Promise.resolve(_w.__crackExtFirebaseSdk);
    if (_fbSdkPromise) return _fbSdkPromise;
    _fbSdkPromise = new Promise((resolve, reject) => {
      const to = setTimeout(() => { _fbSdkPromise = null; reject(new Error('Firebase SDK 로드 타임아웃')); }, 20000);
      _w.addEventListener('crack-ext-fbsdk-ready', () => { clearTimeout(to); resolve(_w.__crackExtFirebaseSdk); }, { once: true });
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = 'import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";\nimport { getAI, getGenerativeModel, GoogleAIBackend, VertexAIBackend, HarmBlockThreshold, HarmCategory } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";\nwindow.__crackExtFirebaseSdk = { initializeApp, getAI, getGenerativeModel, GoogleAIBackend, VertexAIBackend, HarmBlockThreshold, HarmCategory };\nwindow.dispatchEvent(new CustomEvent("crack-ext-fbsdk-ready"));';
      script.onerror = () => { clearTimeout(to); _fbSdkPromise = null; reject(new Error('Firebase SDK 스크립트 로드 실패')); };
      (document.head || document.documentElement).appendChild(script);
    });
    return _fbSdkPromise;
  }

  function parseFirebaseConfig(scriptStr) {
    if (!scriptStr) return null;
    try {
      const m = scriptStr.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\});?/);
      if (m) return new Function('return ' + m[1])();
      const t = scriptStr.trim();
      if (t.startsWith('{')) return new Function('return ' + t)();
    } catch (e) {}
    return null;
  }

  // Gemini 생성
  async function callGeminiApi(prompt, opts = {}) {
    const { apiType = 'key', key = '', vertexJson = '', vertexLocation = 'global', vertexProjectId = '',
      firebaseScript = '', firebaseKey = '', firebaseProjectId = '', firebaseLocation = 'global',
      model = 'gemini-3-flash-preview', thinkingConfig = {}, maxRetries = 1, responseMimeType, cacheKey = 'generate' } = opts;
    const isVertex = apiType === 'vertex';
    const isFirebase = apiType === 'firebase';
    let url, headers;
    if (isFirebase) {
      // Firebase SDK (페이지 컨텍스트 주입). 3.x=global, 2.x=us-central1 자동.
      const cfg = parseFirebaseConfig(firebaseScript);
      if (!cfg || !cfg.apiKey || !cfg.projectId) return { text: null, status: 0, error: 'Firebase 스크립트 형식 오류 (firebaseConfig = {...} 형태 붙여넣기 필요)', retries: 0 };
      try {
        const sdk = await loadFirebaseSdk();
        const fb_is3x = model.includes('gemini-3') || model.includes('gemini-2.0-flash-thinking');
        const fb_loc = fb_is3x ? 'global' : 'us-central1';
        const fbGenConfig = {};
        if (Object.keys(thinkingConfig).length > 0) fbGenConfig.thinkingConfig = thinkingConfig;
        if (responseMimeType) fbGenConfig.responseMimeType = responseMimeType;
        const app = sdk.initializeApp(cfg, 'crack-ext-' + Math.random().toString(36).slice(2, 10));
        const ai = sdk.getAI(app, { backend: sdk.GoogleAIBackend ? new sdk.GoogleAIBackend() : new sdk.VertexAIBackend(fb_loc) });
        const fbSafety = [
          { category: sdk.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: sdk.HarmBlockThreshold.OFF },
          { category: sdk.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: sdk.HarmBlockThreshold.OFF },
          { category: sdk.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: sdk.HarmBlockThreshold.OFF },
          { category: sdk.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: sdk.HarmBlockThreshold.OFF }
        ];
        const gm = sdk.getGenerativeModel(ai, { model, safetySettings: fbSafety, generationConfig: fbGenConfig });
        const result = await gm.generateContent(prompt);
        const fbText = result.response.text();
        return { text: fbText || null, status: 200, error: fbText ? null : '응답 없음', retries: 0 };
      } catch (fbErr) {
        return { text: null, status: 0, error: 'Firebase: ' + (fbErr.message || String(fbErr)), retries: 0 };
      }
      // 아래 REST 라인은 사띌문자 (return으로 도달 불가). 구파서 파싱 호환용 유지.
      const fbKey = firebaseKey || key;
      if (!fbKey) return { text: null, status: 0, error: 'Firebase Web API Key 누락', retries: 0 };
      if (!firebaseProjectId) return { text: null, status: 0, error: 'Firebase projectId 누락', retries: 0 };
      const is3x = model.includes('gemini-3') || model.includes('gemini-2.0-flash-thinking');
      const loc = is3x ? 'global' : (firebaseLocation || 'global');
      url = `https://firebasevertexai.googleapis.com/v1beta/projects/${firebaseProjectId}/locations/${loc}/publishers/google/models/${model}:generateContent`;
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': fbKey };
    } else if (isVertex) {
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
      url = _gBase + model + ':generateContent';
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    }

    const genConfig = {};
    if (Object.keys(thinkingConfig).length > 0) genConfig.thinkingConfig = thinkingConfig;
    if (responseMimeType) genConfig.responseMimeType = responseMimeType;
    const body = JSON.stringify({ safetySettings: SAFETY, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: genConfig });

    let lastStatus = 0, lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const r = await gmFetch(url, { method: 'POST', headers, body });
        lastStatus = r.status;

        // 401 토큰 갱신
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
          // 429 지수 백오프
          if (r.status === 429 && attempt < maxRetries) {
            const waitMs = Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
            await new Promise(res => setTimeout(res, waitMs));
            continue;
          }
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
    const { apiType = 'key', key = '', vertexJson = '', vertexLocation = 'global', vertexProjectId = '',
      firebaseEmbedKey = '', firebaseKey = '', firebaseProjectId = '', firebaseLocation = 'global',
      model = DEFAULTS.embeddingModel, dimensions = DEFAULTS.embeddingDimensions, taskType = DEFAULTS.embeddingTaskType, cacheKey = 'embed' } = opts;
    const arr = Array.isArray(texts) ? texts : [texts];
    const isVertex = apiType === 'vertex';
    const isFirebase = apiType === 'firebase';
    if (isFirebase) {
      // Firebase SDK는 임베딩 미지원 → 별도 Gemini API Key 로 REST 우회 (embedding-001 한정, 무료 티어 OK)
      if (!firebaseEmbedKey) throw new Error('Firebase 모드 임베딩: 별도 Gemini API Key 필요 (embedding-001 한정)');
      return embedTexts(arr, { ...opts, apiType: 'key', key: firebaseEmbedKey, model: 'gemini-embedding-001' });
      // 아래 REST 라인은 사띌문자 (return으로 도달 불가). 구파서 파싱 호환용 유지.
      const fbKey = firebaseKey || key;
      if (!fbKey) throw new Error('Firebase Web API Key 누락');
      if (!firebaseProjectId) throw new Error('Firebase projectId 누락');
      const embLoc = (!firebaseLocation || firebaseLocation === 'global') ? 'us-central1' : firebaseLocation;
      const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${firebaseProjectId}/locations/${embLoc}/publishers/google/models/${model}:predict`;
      const body = JSON.stringify({ instances: arr.map(t => ({ content: t })), parameters: { outputDimensionality: dimensions } });
      const r = await gmFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': fbKey }, body });
      if (!r.ok) throw new Error('Firebase 임베딩 실패: ' + r.status);
      const json = await r.json();
      return json.predictions.map(p => normalizeVector(p.embeddings.values));
    } else if (isVertex) {
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
      const embHeaders = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
      if (arr.length === 1) {
        const url = _gBase + model + ':embedContent';
        const bodyObj = { content: { parts: [{ text: arr[0] }] }, output_dimensionality: dimensions };
        if (model.includes('embedding-001')) bodyObj.taskType = taskType;
        const r = await gmFetch(url, { method: 'POST', headers: embHeaders, body: JSON.stringify(bodyObj) });
        if (!r.ok) throw new Error('임베딩 API 실패: ' + r.status);
        const json = await r.json();
        const embs = json.embeddings || [json.embedding];
        return embs.map(e => normalizeVector(e.values));
      } else {
        const url = _gBase + model + ':batchEmbedContents';
        const requests = arr.map(t => {
          const req = { model: 'models/' + model, content: { parts: [{ text: t }] }, outputDimensionality: dimensions };
          if (model.includes('embedding-001')) req.taskType = taskType;
          return req;
        });
        const r = await gmFetch(url, { method: 'POST', headers: embHeaders, body: JSON.stringify({ requests }) });
        if (!r.ok) throw new Error('배치 임베딩 API 실패: ' + r.status);
        const json = await r.json();
        if (!json.embeddings) throw new Error('임베딩 결과가 없습니다.');
        return json.embeddings.map(e => normalizeVector(e.values));
      }
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

  // 해시
  function simpleHash(str) {
    let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return h.toString(36);
  }

  // 설정/턴 유틸
  const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;

  function loadSettings(key, defaults) {
    try {
      const raw = _ls.getItem(key);
      if (raw) { const p = JSON.parse(raw); return { ...defaults, ...p }; }
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

  // 네임스페이스 초기화
  const ns = _w.__LoreCore = _w.__LoreCore || {};
  Object.assign(ns, {
    VER, DB_SCHEMA_VERSION, LOCAL_MIGRATION_VERSION, TIMELINE_EVENT_TYPE, TIMELINE_SCHEMA_VERSION, TIMELINE_COMPRESSION_LEVELS, SAFETY, PLATFORM, DEFAULTS,
    getDB, gmFetch, parseServiceAccountJson, getVertexAccessToken,
    callGeminiApi, embedText, embedTexts,
    normalizeVector, cosineSim, simpleHash,
    loadSettings, saveSettings, incrementTurn, recordMention,
    __kernelLoaded: true
  });

  console.log(`[LoreCore:kernel] v${VER} loaded`);
})();
