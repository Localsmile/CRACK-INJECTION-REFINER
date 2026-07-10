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
  const DB_SCHEMA_VERSION = 10;
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
    contextTokens: 10000,
    contextTokensEstimated: true,
    recentTurnsSafe: 6,
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
    adaptiveAiMemory: true,
    nativeContextTokenBudget: 10000,
    nativeContextMinTurns: 3,
    nativeContextMaxTurns: 16,
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

  // Dexie 스키마:
  // - v7: entryVersions append-only.
  // - v8: embedding lifecycle/cleanup metadata.
  // - v9: temporal + entity graph 인덱스.
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
    // v10: insertion cleanup queue moved from localStorage to IndexedDB so pending cleanup tasks are not dropped by quota recovery.
    _db.version(10).stores({
      entries: '++id, name, type, packName, project, rootId, isCurrentArc, createdTurn, updatedTurn, lastMentionedTurn, eventTurn, sceneId, arcId, realTimestamp, *entities, *subjects, *objects, *locations, *promises, *triggers',
      packs: 'name, entryCount, project',
      snapshots: '++id, packName, timestamp, type',
      embeddings: '++id, entryId, packName, model, field, sourceHash, entryUpdatedAt, schemaVersion, &[entryId+field]',
      workingMemory: 'url',
      encounters: '++id, &[char1+char2], lastSeenTurn',
      entryVersions: '++id, entryId, ts, turn',
      cleanupQueue: 'id, chatId, chatKey, status, createdAt, completedAt'
    });
    return _db;
  }

  // 네트워크
  const _GM_xhr = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest : ((typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest.bind(GM) : null);
  function nativeFetchWithTimeout(url, opts = {}) {
    const timeoutMs = Math.max(0, Number(opts.timeout || opts.timeoutMs) || 0);
    const externalSignal = opts.signal || null;
    if (!timeoutMs || typeof AbortController !== 'function') {
      return fetch(url, { method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body || null, signal: externalSignal || undefined });
    }
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => { try { controller.abort(); } catch (_) {} };
    if (externalSignal) {
      if (externalSignal.aborted) onAbort();
      else try { externalSignal.addEventListener('abort', onAbort, { once: true }); } catch (_) {}
    }
    const timer = setTimeout(() => { timedOut = true; try { controller.abort(); } catch (_) {} }, timeoutMs);
    return fetch(url, {
      method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body || null, signal: controller.signal
    }).catch((error) => {
      if (timedOut) throw new Error('타임아웃');
      if (externalSignal && externalSignal.aborted) throw new Error('aborted');
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      if (externalSignal) try { externalSignal.removeEventListener('abort', onAbort); } catch (_) {}
    });
  }
  // AbortSignal forwarding: GM_xmlhttpRequest의 abort() 호출로 실제 요청 취소.
  function gmFetch(url, opts = {}) {
    const signal = opts && opts.signal;
    if (!_GM_xhr) {
      return nativeFetchWithTimeout(url, opts);
    }
    const fetchFallback = () => nativeFetchWithTimeout(url, opts);
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(new Error('aborted')); return; }
      let xhrHandle = null;
      let cleanedUp = false;
      const cleanup = () => { if (cleanedUp) return; cleanedUp = true; if (signal) { try { signal.removeEventListener('abort', onAbort); } catch (_) {} } };
      const onAbort = () => { try { xhrHandle && xhrHandle.abort && xhrHandle.abort(); } catch (_) {} cleanup(); reject(new Error('aborted')); };
      const retryWithFetch = (fallbackError) => {
        if (!opts.fetchFallbackOnError) { cleanup(); reject(fallbackError); return; }
        if (signal && signal.aborted) { cleanup(); reject(new Error('aborted')); return; }
        fetchFallback().then((r) => { cleanup(); resolve(r); }).catch((e) => {
          cleanup();
          reject(fallbackError || e);
        });
      };
      if (signal) { try { signal.addEventListener('abort', onAbort, { once: true }); } catch (_) {} }
      xhrHandle = _GM_xhr({
        method: opts.method || 'GET', url, headers: opts.headers || {}, data: opts.body || null, responseType: 'text',
        timeout: opts.timeout || opts.timeoutMs || 0,
        onload: (r) => { cleanup(); resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, text: () => Promise.resolve(r.responseText), json: () => Promise.resolve(JSON.parse(r.responseText)) }); },
        onerror: () => { retryWithFetch(new Error('네트워크 오류')); },
        ontimeout: () => { retryWithFetch(new Error('타임아웃')); },
        onabort: () => { cleanup(); reject(new Error('aborted')); }
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

  function fromB64url(value) {
    let b64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function transformCompressedBytes(bytes, StreamCtor) {
    if (typeof Blob === 'undefined' || typeof Response === 'undefined' || typeof StreamCtor !== 'function') throw new Error('compression unsupported');
    const stream = new Blob([bytes]).stream().pipeThrough(new StreamCtor('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Snapshot/history JSON is cold data. Keep small rows plain and only retain gzip when it saves IndexedDB space.
  async function packJsonForStorage(value, minChars = 1024) {
    const json = JSON.stringify(value);
    if (json.length < minChars || typeof CompressionStream !== 'function') return { value, encoding: '', gzip: '', originalChars: json.length };
    try {
      const zipped = await transformCompressedBytes(new TextEncoder().encode(json), CompressionStream);
      const gzip = b64url(zipped);
      if (!gzip || gzip.length >= json.length) return { value, encoding: '', gzip: '', originalChars: json.length };
      return { value: null, encoding: 'gzip', gzip, originalChars: json.length };
    } catch (_) {
      return { value, encoding: '', gzip: '', originalChars: json.length };
    }
  }

  async function unpackJsonFromStorage(row, valueKey, gzipKey, encodingKey) {
    if (!row) return undefined;
    const gzip = row[gzipKey];
    if (!gzip) return row[valueKey];
    if (row[encodingKey] && row[encodingKey] !== 'gzip') throw new Error('지원하지 않는 로컬 압축 형식');
    try {
      const raw = await transformCompressedBytes(fromB64url(gzip), DecompressionStream);
      return JSON.parse(new TextDecoder().decode(raw));
    } catch (e) {
      throw new Error('압축된 로컬 기록을 열 수 없음: ' + (e && e.message ? e.message : e));
    }
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
  // Firebase 인스턴스 캐시 — cold init 비용을 1회로 분할상환.
  // 키: app=cfg(apiKey+projectId), ai=app+location, model=ai+model+genConfigHash.
  const _fbAppCache = Object.create(null);
  const _fbAiCache = Object.create(null);
  const _fbModelCache = Object.create(null);
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

  function extractBalancedObjectLiteral(src, startIdx) {
    const open = src.indexOf('{', startIdx);
    if (open < 0) return '';
    let depth = 0, quote = '', esc = false;
    for (let i = open; i < src.length; i++) {
      const ch = src[i];
      if (quote) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return src.slice(open, i + 1);
      }
    }
    return '';
  }

  function parseFirebaseConfig(scriptStr) {
    if (!scriptStr) return null;
    try {
      const t = String(scriptStr || '').trim();
      if (!t) return null;
      if (t.startsWith('{')) return new Function('return ' + t)();

      const assign = t.search(/firebaseConfig\s*=/i);
      if (assign >= 0) {
        const obj = extractBalancedObjectLiteral(t, assign);
        if (obj) return new Function('return ' + obj)();
      }

      const init = t.search(/initializeApp\s*\(/i);
      if (init >= 0) {
        const obj = extractBalancedObjectLiteral(t, init);
        if (obj) return new Function('return ' + obj)();
      }

      const firstObj = extractBalancedObjectLiteral(t, 0);
      if (firstObj && /apiKey|projectId/i.test(firstObj)) return new Function('return ' + firstObj)();
    } catch (e) {}
    return null;
  }

  // Firebase 사전 워밍업 — 설정 로드 직후 호출하면 첫 실호출의 cold init 비용을 제거.
  // SDK dynamic import + initializeApp + getAI 까지 미리 끝내고 캐시 적재. 실패해도 throw 안 함.
  async function warmupFirebase(firebaseScript, model = 'gemini-3-flash-preview') {
    try {
      const cfg = parseFirebaseConfig(firebaseScript);
      if (!cfg || !cfg.apiKey || !cfg.projectId) return false;
      const sdk = await loadFirebaseSdk();
      const fb_is3x = model.includes('gemini-3') || model.includes('gemini-2.0-flash-thinking');
      const fb_loc = fb_is3x ? 'global' : 'us-central1';
      const appName = 'crack-ext-' + simpleHash(cfg.apiKey + ':' + cfg.projectId);
      if (!_fbAppCache[appName]) _fbAppCache[appName] = sdk.initializeApp(cfg, appName);
      const aiKey = appName + '|' + fb_loc;
      if (!_fbAiCache[aiKey]) _fbAiCache[aiKey] = sdk.getAI(_fbAppCache[appName], { backend: new sdk.VertexAIBackend(fb_loc) });
      return true;
    } catch (e) { return false; }
  }

  function trackGenerationCost(model, usageMeta, promptText, outText, costContext, opts = {}) {
    const core = _w.__LoreCore;
    if (!core || typeof core.recordApiCost !== 'function') return null;
    const ctx = costContext || { feature: 'unknown', chatKey: 'global' };
    try {
      let inTok, outTok, estimated = false;
      if (usageMeta && (usageMeta.promptTokenCount != null || usageMeta.candidatesTokenCount != null)) {
        inTok = Number(usageMeta.promptTokenCount) || 0;
        outTok = (Number(usageMeta.candidatesTokenCount) || 0) + (Number(usageMeta.thoughtsTokenCount) || 0);
      } else if (usageMeta && (usageMeta.prompt_tokens != null || usageMeta.completion_tokens != null)) {
        inTok = Number(usageMeta.prompt_tokens) || 0;
        outTok = Number(usageMeta.completion_tokens) || 0;
      } else {
        inTok = Math.ceil(String(promptText || '').length / 4);
        outTok = Math.ceil(String(outText || '').length / 4);
        estimated = true;
      }
      return core.recordApiCost({
        chatKey: ctx.chatKey || 'global',
        feature: ctx.feature || 'unknown',
        model, inTok, outTok, estimated,
        cacheHitTok: Number(opts.cacheHitTok) || 0,
        cacheMissTok: Number(opts.cacheMissTok) || 0
      });
    } catch (_) { return null; }
  }

  let _generationApiQueue = Promise.resolve();
  let _lastGenerationApiAt = 0;
  const _openAICompatVariantCache = new Map();
  const _generationInFlight = new Map();

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  function generationRetryLimit(maxRetries, opts = {}) {
    const raw = Math.max(0, Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 1);
    return opts.retryOnServerError === false ? raw : Math.max(raw, 1);
  }

  function retryableGenerationStatus(status) {
    return status === 0 || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }

  function retryableGenerationError(error) {
    return /503|502|504|429|네트워크 오류|타임아웃|failed to fetch|networkerror|load failed|fetch/i.test(String(error && error.message || error || ''));
  }

  function generationRetryDelay(attempt, capMs = 10000) {
    return Math.min(capMs, 1000 * Math.pow(2, attempt)) + Math.random() * 500;
  }

  function enqueueGenerationApi(task, opts = {}) {
    if (opts.skipGenerationQueue === true) return task();
    const minGap = Math.max(0, Number(opts.generationMinGapMs != null ? opts.generationMinGapMs : 250) || 0);
    const queued = _generationApiQueue.catch(() => {}).then(async () => {
      const waitMs = Math.max(0, _lastGenerationApiAt + minGap - Date.now());
      if (waitMs > 0) await sleep(waitMs);
      if (opts.signal && opts.signal.aborted) return { text: null, status: 0, error: 'aborted', retries: 0 };
      try {
        return await task();
      } finally {
        _lastGenerationApiAt = Date.now();
      }
    });
    _generationApiQueue = queued.catch(() => {});
    return queued;
  }

  function generationRequestFingerprint(prompt, opts = {}) {
    const provider = opts.apiType || 'key';
    const credential = opts.openAIKey || opts.deepSeekKey || opts.key || opts.vertexJson || opts.firebaseScript || '';
    const shape = {
      provider,
      model: opts.model || '',
      endpoint: opts.openAIBaseUrl || opts.baseUrl || opts.vertexLocation || '',
      credential: String(credential),
      prompt: String(prompt || ''),
      responseMimeType: opts.responseMimeType || '',
      maxOutputTokens: opts.maxOutputTokens == null ? null : Number(opts.maxOutputTokens),
      thinkingConfig: opts.thinkingConfig || {},
      deepSeekThinking: opts.deepSeekThinking !== false,
      deepSeekReasoning: opts.deepSeekReasoning || '',
      openAIReasoning: opts.openAIReasoning || '',
      feature: opts.costContext && opts.costContext.feature || '',
      chatKey: opts.costContext && opts.costContext.chatKey || ''
    };
    return JSON.stringify(shape);
  }

  async function callDeepSeekApi(prompt, opts = {}) {
    const {
      key = '', model = 'deepseek-v4-flash', maxRetries = 1, responseMimeType,
      costContext = null, signal = null, timeoutMs = 90000, maxOutputTokens = null,
      deepSeekThinking = true, deepSeekReasoning = 'high', deepSeekJsonSystemPrompt = ''
    } = opts;
    if (!key) return { text: null, status: 0, error: 'DeepSeek API 키 누락', retries: 0 };
    const url = 'https://api.deepseek.com/chat/completions';
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
    const jsonMode = !!(responseMimeType && String(responseMimeType).includes('json'));
    const jsonSystemPrompt = String(deepSeekJsonSystemPrompt || '').trim()
      || 'You are a strict JSON API. Return only one valid json object that matches the requested shape. Do not output markdown fences, explanations, comments, or trailing text. If there is no useful result, return the empty object shape requested by the user.';
    const messages = [];
    if (jsonMode) messages.push({ role: 'system', content: jsonSystemPrompt });
    messages.push({ role: 'user', content: String(prompt || '') });
    const bodyObj = {
      model,
      messages,
      stream: false
    };
    if (jsonMode) bodyObj.response_format = { type: 'json_object' };
    if (maxOutputTokens != null) bodyObj.max_tokens = maxOutputTokens;
    const thinkingOn = deepSeekThinking !== false;
    bodyObj.thinking = { type: thinkingOn ? 'enabled' : 'disabled' };
    if (thinkingOn) bodyObj.reasoning_effort = deepSeekReasoning === 'max' || deepSeekReasoning === 'xhigh' ? 'max' : 'high';
    const body = JSON.stringify(bodyObj);
    let lastStatus = 0, lastError = null;
    const effectiveMaxRetries = generationRetryLimit(maxRetries, opts);
    for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
      try {
        if (signal && signal.aborted) { lastError = 'aborted'; break; }
        const r = await gmFetch(url, { method: 'POST', headers, body, signal, timeout: timeoutMs });
        lastStatus = r.status;
        if (!r.ok) {
          const errBody = r.text ? await r.text().catch(() => '') : '';
          lastError = `HTTP ${r.status} ${errBody.slice(0, 500).replace(/\\n/g, ' ')}`;
          if ([400, 401, 403, 404].includes(r.status)) break;
          if (retryableGenerationStatus(r.status) && attempt < effectiveMaxRetries) {
            await sleep(generationRetryDelay(attempt + 1, 10000));
            continue;
          }
        } else {
          const json = await r.json();
          const choice = json.choices && json.choices[0];
          const msg = choice && choice.message;
          const text = msg && msg.content != null ? String(msg.content) : null;
          const finishReason = choice && choice.finish_reason;
          const reasoning = msg && msg.reasoning_content != null ? String(msg.reasoning_content) : '';
          const usage = json.usage || null;
          const cacheHitTok = usage ? Number(usage.prompt_cache_hit_tokens || usage.prompt_cache_hit_token_count || 0) : 0;
          const cacheMissTok = usage ? Number(usage.prompt_cache_miss_tokens || usage.prompt_cache_miss_token_count || 0) : 0;
          const cost = trackGenerationCost(model, usage, prompt, text, costContext, { cacheHitTok, cacheMissTok });
          if (text) return { text, status: r.status, error: null, retries: attempt, cost, finishReason };
          lastError = finishReason === 'length'
            ? 'DeepSeek 응답이 max_tokens 또는 컨텍스트 제한으로 잘림'
            : ('DeepSeek 최종 응답이 비어 있음' + (reasoning ? ' (reasoning_content만 반환됨)' : '') + (finishReason ? ' [' + finishReason + ']' : ''));
        }
      } catch (e) {
        lastError = e.message;
        if (!(attempt < effectiveMaxRetries && retryableGenerationError(e))) break;
      }
      if (attempt < effectiveMaxRetries) await sleep(generationRetryDelay(attempt, 8000));
    }
    return { text: null, status: lastStatus, error: lastError, retries: effectiveMaxRetries };
  }

  function normalizeOpenAICompatUrl(baseUrl) {
    let base = String(baseUrl || '').trim();
    if (!base) return '';
    base = base.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(base)) return base;
    return base + '/chat/completions';
  }

  function openAICompatReasoningVariants(openAIBaseUrl, reasoning) {
    const raw = String(reasoning || '').trim().toLowerCase();
    if (!raw || raw === 'off' || raw === 'default') return ['none'];
    const nestedFirst = /openrouter\.ai/i.test(String(openAIBaseUrl || ''));
    return nestedFirst ? ['nested', 'flat', 'none'] : ['flat', 'nested', 'none'];
  }

  function applyOpenAICompatReasoning(bodyObj, style, reasoning) {
    const value = String(reasoning || '').trim();
    if (!value || style === 'none') return;
    if (style === 'nested') bodyObj.reasoning = { effort: value };
    else if (style === 'flat') bodyObj.reasoning_effort = value;
  }

  function openAICompatVariantKey(url, model, jsonMode, hasMaxOutputTokens, reasoning) {
    return [url, model, jsonMode ? 'json' : 'text', hasMaxOutputTokens ? 'tokens' : 'no_tokens', String(reasoning || '').trim().toLowerCase()].join('|');
  }

  function variantId(variant) {
    return [variant.withJsonMode ? 'json' : 'plain', variant.tokenField || 'no_token', variant.reasoningStyle || 'none'].join('|');
  }

  function buildOpenAICompatVariants(jsonMode, maxOutputTokens, reasoningStyles) {
    const tokenFields = maxOutputTokens != null ? ['max_tokens', 'max_completion_tokens'] : [null];
    const styles = Array.from(new Set((reasoningStyles || ['none']).filter(Boolean)));
    if (!styles.includes('none')) styles.push('none');
    const variants = [];
    const seen = new Set();
    const add = (withJsonMode, tokenField, reasoningStyle) => {
      const variant = { withJsonMode: !!(jsonMode && withJsonMode), tokenField: tokenField || null, reasoningStyle: reasoningStyle || 'none' };
      const id = variantId(variant);
      if (seen.has(id) || variants.length >= 6) return;
      seen.add(id);
      variants.push(variant);
    };
    const primaryToken = tokenFields[0];
    const alternateToken = tokenFields[1];
    for (const style of styles.filter(s => s !== 'none')) add(true, primaryToken, style);
    add(true, primaryToken, 'none');
    add(false, primaryToken, 'none');
    if (alternateToken) {
      add(true, alternateToken, 'none');
      add(false, alternateToken, 'none');
    }
    if (!variants.length) add(false, null, 'none');
    return variants;
  }

  function promiseWithTimeout(promise, timeoutMs, label = '요청') {
    const ms = Math.max(0, Number(timeoutMs) || 0);
    if (!ms) return Promise.resolve(promise);
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' 타임아웃')), ms);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => { if (timer) clearTimeout(timer); });
  }

  async function callOpenAICompatApi(prompt, opts = {}) {
    const {
      key = '', openAIBaseUrl = '', model = '', maxRetries = 1, responseMimeType,
      costContext = null, signal = null, timeoutMs = 90000, maxOutputTokens = null,
      openAIReasoning = ''
    } = opts;
    const url = normalizeOpenAICompatUrl(openAIBaseUrl || opts.baseUrl || opts.openaiBaseUrl);
    if (!url) return { text: null, status: 0, error: 'OpenAI 호환 Base URL 누락', retries: 0 };
    if (!key) return { text: null, status: 0, error: 'OpenAI 호환 API 키 누락', retries: 0 };
    if (!model) return { text: null, status: 0, error: 'OpenAI 호환 모델명 누락', retries: 0 };

    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
    const jsonMode = !!(responseMimeType && String(responseMimeType).includes('json'));
    const messages = [];
    if (jsonMode) messages.push({ role: 'system', content: 'Return only valid JSON. Do not output markdown fences, explanations, comments, or trailing text.' });
    messages.push({ role: 'user', content: String(prompt || '') });
    const reasoning = String(openAIReasoning || '').trim();
    const makeBody = (withJsonMode, tokenField, reasoningStyle) => {
      const bodyObj = { model, messages, stream: false };
      if (maxOutputTokens != null && tokenField) bodyObj[tokenField] = maxOutputTokens;
      if (withJsonMode && jsonMode) bodyObj.response_format = { type: 'json_object' };
      applyOpenAICompatReasoning(bodyObj, reasoningStyle, reasoning);
      return JSON.stringify(bodyObj);
    };
    const reasoningStyles = openAICompatReasoningVariants(openAIBaseUrl || opts.baseUrl || opts.openaiBaseUrl, reasoning);
    const bodyVariants = buildOpenAICompatVariants(jsonMode, maxOutputTokens, reasoningStyles);
    const variantCacheKey = openAICompatVariantKey(url, model, jsonMode, maxOutputTokens != null, reasoning);
    const cachedVariantId = _openAICompatVariantCache.get(variantCacheKey);
    const orderedVariants = cachedVariantId
      ? bodyVariants.filter(v => variantId(v) === cachedVariantId).concat(bodyVariants.filter(v => variantId(v) !== cachedVariantId))
      : bodyVariants;

    let lastStatus = 0, lastError = null;
    const effectiveMaxRetries = generationRetryLimit(maxRetries, opts);
    for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
      for (const variant of orderedVariants) {
        try {
          if (signal && signal.aborted) { lastError = 'aborted'; break; }
          const r = await gmFetch(url, { method: 'POST', headers, body: makeBody(variant.withJsonMode, variant.tokenField, variant.reasoningStyle), signal, timeout: timeoutMs });
          lastStatus = r.status;
          if (!r.ok) {
            const errBody = r.text ? await r.text().catch(() => '') : '';
            lastError = `HTTP ${r.status} ${errBody.slice(0, 500).replace(/\n/g, ' ')}`;
            if (r.status === 400 && (variant.withJsonMode || variant.tokenField === 'max_tokens' || variant.reasoningStyle !== 'none')) continue;
            if ([400, 401, 403, 404].includes(r.status)) break;
            if (retryableGenerationStatus(r.status) && attempt < effectiveMaxRetries) break;
          } else {
            const json = await r.json();
            const choice = json.choices && json.choices[0];
            const msg = choice && choice.message;
            let text = msg && msg.content != null ? msg.content : null;
            if (Array.isArray(text)) {
              text = text.map(p => typeof p === 'string' ? p : (p && (p.text || p.content) || '')).join('');
            }
            text = text != null ? String(text) : null;
            const finishReason = choice && choice.finish_reason;
            const usage = json.usage || null;
            const cacheHitTok = usage ? Number(usage.prompt_cache_hit_tokens || usage.prompt_cache_hit_token_count || 0) : 0;
            const cacheMissTok = usage ? Number(usage.prompt_cache_miss_tokens || usage.prompt_cache_miss_token_count || 0) : 0;
            const cost = trackGenerationCost(model, usage, prompt, text, costContext, { cacheHitTok, cacheMissTok });
            if (text) {
              _openAICompatVariantCache.set(variantCacheKey, variantId(variant));
              return { text, status: r.status, error: null, retries: attempt, cost, finishReason };
            }
            lastError = finishReason === 'length'
              ? 'OpenAI 호환 응답이 max_tokens 또는 컨텍스트 제한으로 잘림'
              : ('OpenAI 호환 최종 응답이 비어 있음' + (finishReason ? ' [' + finishReason + ']' : ''));
          }
        } catch (e) {
          lastError = e.message;
          if (!(attempt < effectiveMaxRetries && retryableGenerationError(e))) break;
        }
        break;
      }
      if (attempt < effectiveMaxRetries && retryableGenerationStatus(lastStatus)) await sleep(generationRetryDelay(attempt, 8000));
      else if (attempt < effectiveMaxRetries && retryableGenerationError(lastError)) await sleep(generationRetryDelay(attempt, 8000));
      else break;
    }
    return { text: null, status: lastStatus, error: lastError, retries: effectiveMaxRetries };
  }

  // Gemini 생성
  async function callGeminiApi(prompt, opts = {}) {
    if (opts.skipGenerationQueue !== true) {
      const requestKey = generationRequestFingerprint(prompt, opts);
      const allowDedupe = opts.dedupeGeneration !== false && !opts.signal;
      if (allowDedupe && _generationInFlight.has(requestKey)) return _generationInFlight.get(requestKey);
      const queued = enqueueGenerationApi(() => callGeminiApi(prompt, { ...opts, skipGenerationQueue: true }), opts);
      if (allowDedupe) {
        _generationInFlight.set(requestKey, queued);
        queued.finally(() => {
          if (_generationInFlight.get(requestKey) === queued) _generationInFlight.delete(requestKey);
        }).catch(() => {});
      }
      return queued;
    }
    const { apiType = 'key', key = '', vertexJson = '', vertexLocation = 'global', vertexProjectId = '',
      firebaseScript = '', firebaseKey = '', firebaseProjectId = '', firebaseLocation = 'global',
      deepSeekKey = '', deepSeekThinking = true, deepSeekReasoning = 'high',
      openAIBaseUrl = '', openAIKey = '', openAIReasoning = '',
      model = 'gemini-3-flash-preview', thinkingConfig = {}, maxRetries = 1, responseMimeType, cacheKey = 'generate',
      costContext = null, signal = null, timeoutMs = 90000, maxOutputTokens = null } = opts;

    if (apiType === 'deepseek') {
      return await callDeepSeekApi(prompt, {
        key: deepSeekKey || key, model, maxRetries, responseMimeType, costContext, signal,
        timeoutMs, maxOutputTokens, deepSeekThinking, deepSeekReasoning,
        deepSeekJsonSystemPrompt: opts.deepSeekJsonSystemPrompt
      });
    }
    if (apiType === 'openai') {
      return await callOpenAICompatApi(prompt, {
        key: openAIKey || key, openAIBaseUrl, model, maxRetries, responseMimeType, costContext, signal,
        timeoutMs, maxOutputTokens, openAIReasoning
      });
    }

    // 비용 추적: costContext 미지정 시 unknown/global로 폴백 기록(누락 방지).
    // usageMetadata 부재 시 char/4 추정 + estimated:true.
    const _trackCost = (usageMeta, promptText, outText) => {
      const core = _w.__LoreCore;
      if (!core || typeof core.recordApiCost !== 'function') return null;
      const ctx = costContext || { feature: 'unknown', chatKey: 'global' };
      try {
        let inTok, outTok, estimated = false;
        if (usageMeta && (usageMeta.promptTokenCount != null || usageMeta.candidatesTokenCount != null)) {
          inTok = Number(usageMeta.promptTokenCount) || 0;
          outTok = (Number(usageMeta.candidatesTokenCount) || 0) + (Number(usageMeta.thoughtsTokenCount) || 0);
        } else {
          inTok = Math.ceil(String(promptText || '').length / 4);
          outTok = Math.ceil(String(outText || '').length / 4);
          estimated = true;
        }
        return trackGenerationCost(model, { promptTokenCount: inTok, candidatesTokenCount: outTok }, promptText, outText, ctx);
      } catch (_) { return null; }
    };
    const isVertex = apiType === 'vertex';
    const isFirebase = apiType === 'firebase';
    let url, headers;
    if (isFirebase) {
      // Firebase SDK (페이지 컨텍스트 주입). 3.x=global, 2.x=us-central1 자동.
      let cfg = parseFirebaseConfig(firebaseScript);
      if (!cfg || !cfg.apiKey || !cfg.projectId) {
        const liveScript = _w.__LoreInj && _w.__LoreInj.settings && _w.__LoreInj.settings.config
          ? _w.__LoreInj.settings.config.autoExtFirebaseScript
          : '';
        if (liveScript && liveScript !== firebaseScript) cfg = parseFirebaseConfig(liveScript);
      }
      if (!cfg || !cfg.apiKey || !cfg.projectId) {
        const len = String(firebaseScript || '').length;
        const head = String(firebaseScript || '').trim().slice(0, 40).replace(/\s+/g, ' ');
        return { text: null, status: 0, error: 'Firebase 스크립트 형식 오류 (firebaseConfig = {...} 형태 붙여넣기 필요; len=' + len + ', head=' + head + ')', retries: 0 };
      }
      // Firebase SDK는 generateContent에 signal 미지원: 진입 시점만 검사.
      if (signal && signal.aborted) return { text: null, status: 0, error: 'aborted', retries: 0 };
      const effectiveMaxRetries = generationRetryLimit(maxRetries, opts);
      let fbLastError = null;
      for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) try {
        const sdk = await loadFirebaseSdk();
        const fb_is3x = model.includes('gemini-3') || model.includes('gemini-2.0-flash-thinking');
        const fb_loc = fb_is3x ? 'global' : 'us-central1';
        const fbGenConfig = {};
        if (Object.keys(thinkingConfig).length > 0) fbGenConfig.thinkingConfig = thinkingConfig;
        if (responseMimeType) fbGenConfig.responseMimeType = responseMimeType;
        if (maxOutputTokens != null) fbGenConfig.maxOutputTokens = maxOutputTokens;
        // VertexAIBackend 강제 (GoogleAIBackend는 콘솔에서 별도 활성화 필요).
        // 인스턴스 캐시로 cold init 비용 분할상환.
        const appName = 'crack-ext-' + simpleHash(cfg.apiKey + ':' + cfg.projectId);
        let app = _fbAppCache[appName];
        if (!app) { app = sdk.initializeApp(cfg, appName); _fbAppCache[appName] = app; }
        const aiKey = appName + '|' + fb_loc;
        let ai = _fbAiCache[aiKey];
        if (!ai) { ai = sdk.getAI(app, { backend: new sdk.VertexAIBackend(fb_loc) }); _fbAiCache[aiKey] = ai; }
        const fbSafety = [
          { category: sdk.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: sdk.HarmBlockThreshold.OFF },
          { category: sdk.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: sdk.HarmBlockThreshold.OFF },
          { category: sdk.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: sdk.HarmBlockThreshold.OFF },
          { category: sdk.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: sdk.HarmBlockThreshold.OFF }
        ];
        const modelKey = aiKey + '|' + model + '|' + simpleHash(JSON.stringify(fbGenConfig));
        let gm = _fbModelCache[modelKey];
        if (!gm) { gm = sdk.getGenerativeModel(ai, { model, safetySettings: fbSafety, generationConfig: fbGenConfig }); _fbModelCache[modelKey] = gm; }
        const result = await promiseWithTimeout(gm.generateContent(prompt), timeoutMs, 'Firebase 생성 요청');
        const fbText = result.response.text();
        const _fbCost = _trackCost(result.response && result.response.usageMetadata, prompt, fbText);
        return { text: fbText || null, status: 200, error: fbText ? null : '응답 없음', retries: attempt, cost: _fbCost };
      } catch (fbErr) {
        fbLastError = fbErr;
        if (!(attempt < effectiveMaxRetries && retryableGenerationError(fbErr))) break;
        await sleep(generationRetryDelay(attempt, 8000));
      }
      return { text: null, status: 0, error: 'Firebase: ' + ((fbLastError && fbLastError.message) || String(fbLastError)), retries: effectiveMaxRetries };
      // (도달 불가, 구파서 호환용 잔존)
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
    if (maxOutputTokens != null) genConfig.maxOutputTokens = maxOutputTokens;
    const body = JSON.stringify({ safetySettings: SAFETY, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: genConfig });

    let lastStatus = 0, lastError = null;
    const effectiveMaxRetries = generationRetryLimit(maxRetries, opts);
    for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
      try {
        if (signal && signal.aborted) { lastError = 'aborted'; break; }
        const r = await gmFetch(url, { method: 'POST', headers, body, signal, timeout: timeoutMs });
        lastStatus = r.status;

        // 401 토큰 갱신
        if (r.status === 401 && isVertex) {
          if (_tokenCaches[cacheKey]) { _tokenCaches[cacheKey].token = null; _tokenCaches[cacheKey].expiry = 0; }
          if (attempt < effectiveMaxRetries) {
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
          if (retryableGenerationStatus(r.status) && attempt < effectiveMaxRetries) {
            await sleep(generationRetryDelay(attempt + 1, 10000));
            continue;
          }
        } else {
          const json = await r.json();
          const parts = json.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find(p => p.text && !p.thought);
          const text = textPart?.text ?? null;
          const _restCost = _trackCost(json.usageMetadata, prompt, text);
          if (text) return { text, status: r.status, error: null, retries: attempt, cost: _restCost };
          lastError = '응답 파싱 실패';
        }
      } catch (e) {
        lastError = e.message;
        if (!(attempt < effectiveMaxRetries && retryableGenerationError(e))) break;
      }
      if (attempt < effectiveMaxRetries) await sleep(generationRetryDelay(attempt, 8000));
    }
    return { text: null, status: lastStatus, error: lastError, retries: effectiveMaxRetries };
  }

  async function embedTexts(texts, opts = {}) {
    const { apiType = 'key', key = '', vertexJson = '', vertexLocation = 'global', vertexProjectId = '',
      firebaseEmbedKey = '', firebaseKey = '', firebaseProjectId = '', firebaseLocation = 'global',
      model = DEFAULTS.embeddingModel, dimensions = DEFAULTS.embeddingDimensions, taskType = DEFAULTS.embeddingTaskType, cacheKey = 'embed',
      costContext = null } = opts;
    const arr = Array.isArray(texts) ? texts : [texts];
    // 임베딩 비용 추적: usageMetadata 부재 → char/4 추정. costContext 없으면 embed/global 폴백.
    const _trackEmbedCost = (textArr, modelUsed) => {
      const core = _w.__LoreCore;
      if (!core || typeof core.recordApiCost !== 'function') return;
      try {
        const ctx = costContext || { feature: 'embed', chatKey: 'global' };
        const inputChars = (textArr || []).reduce((acc, t) => acc + String(t || '').length, 0);
        core.recordApiCost({
          chatKey: ctx.chatKey || 'global',
          feature: ctx.feature || 'embed',
          model: modelUsed,
          inTok: Math.ceil(inputChars / 4),
          outTok: 0,
          estimated: true
        });
      } catch (_) {}
    };
    const isVertex = apiType === 'vertex';
    const isFirebase = apiType === 'firebase';
    const maxEmbedRetries = Math.max(0, Math.min(3, Number.isFinite(Number(opts.maxRetries)) ? Number(opts.maxRetries) : 3));
    const retryableEmbeddingError = (e) => /\b(?:408|409|425|429|5\d{2})\b|네트워크 오류|타임아웃|failed to fetch|networkerror|load failed|fetch/i.test(String(e && e.message || e || ''));
    const waitEmbeddingRetry = (attempt) => new Promise(res => setTimeout(res, Math.min(8000, 1000 * Math.pow(2, attempt)) + Math.random() * 500));
    const validateEmbeddingVectors = (vectors, expectedCount) => {
      if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
        throw new Error('임베딩 결과 수가 요청 수와 다릅니다.');
      }
      if (vectors.some(vector => !Array.isArray(vector) || !vector.length || vector.some(value => !Number.isFinite(value)))) {
        throw new Error('임베딩 결과에 사용할 수 없는 벡터가 포함되어 있습니다.');
      }
      return vectors;
    };
    const fetchEmbeddingJson = async (url, fetchOpts, errorPrefix) => {
      let lastError = null;
      for (let attempt = 0; attempt <= maxEmbedRetries; attempt++) {
        try {
          const r = await gmFetch(url, {
            ...fetchOpts,
            timeout: fetchOpts.timeout || opts.timeoutMs || 45000,
            fetchFallbackOnError: true
          });
          if (!r.ok) {
            lastError = new Error(errorPrefix + ': ' + r.status);
            if ((r.status === 429 || r.status >= 500 || r.status === 0) && attempt < maxEmbedRetries) {
              await waitEmbeddingRetry(attempt);
              continue;
            }
            throw lastError;
          }
          return await r.json();
        } catch (e) {
          lastError = e;
          if (attempt < maxEmbedRetries && retryableEmbeddingError(e)) {
            await waitEmbeddingRetry(attempt);
            continue;
          }
          throw e;
        }
      }
      throw lastError || new Error(errorPrefix);
    };
    if (isFirebase) {
      // Firebase SDK는 임베딩 미지원 → 별도 Gemini API Key 로 REST 우회 (embedding-001 한정, 무료 티어 OK)
      if (!firebaseEmbedKey) throw new Error('Firebase 모드 임베딩: 별도 Gemini API Key 필요 (embedding-001 한정)');
      return embedTexts(arr, { ...opts, apiType: 'key', key: firebaseEmbedKey, model: 'gemini-embedding-001' });
      // (도달 불가, 구파서 호환용 잔존)
      const fbKey = firebaseKey || key;
      if (!fbKey) throw new Error('Firebase Web API Key 누락');
      if (!firebaseProjectId) throw new Error('Firebase projectId 누락');
      const embLoc = (!firebaseLocation || firebaseLocation === 'global') ? 'us-central1' : firebaseLocation;
      const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${firebaseProjectId}/locations/${embLoc}/publishers/google/models/${model}:predict`;
      const body = JSON.stringify({ instances: arr.map(t => ({ content: t })), parameters: { outputDimensionality: dimensions } });
      const r = await gmFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': fbKey }, body });
      if (!r.ok) throw new Error('Firebase 임베딩 실패: ' + r.status);
      const json = await r.json();
      return validateEmbeddingVectors(json.predictions.map(p => normalizeVector(p.embeddings.values)), arr.length);
    } else if (isVertex) {
      const sa = parseServiceAccountJson(vertexJson);
      if (!sa.ok) throw new Error(sa.error);
      const projId = vertexProjectId || sa.projectId;
      const token = await getVertexAccessToken(sa, cacheKey);
      const embLoc = (!vertexLocation || vertexLocation === 'global') ? 'us-central1' : vertexLocation;
      const host = `${embLoc}-aiplatform.googleapis.com`;
      const url = `https://${host}/v1/projects/${projId}/locations/${embLoc}/publishers/google/models/${model}:predict`;
      const json = await fetchEmbeddingJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ instances: arr.map(t => ({ content: t })), parameters: { outputDimensionality: dimensions } }) }, 'Vertex 임베딩 실패');
      _trackEmbedCost(arr, model);
      return json.predictions.map(p => normalizeVector(p.embeddings.values));
    } else {
      if (!key) throw new Error('API 키 누락');
      const embHeaders = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
      if (arr.length === 1) {
        const url = _gBase + model + ':embedContent';
        const bodyObj = { content: { parts: [{ text: arr[0] }] }, output_dimensionality: dimensions };
        if (model.includes('embedding-001')) bodyObj.taskType = taskType;
        const json = await fetchEmbeddingJson(url, { method: 'POST', headers: embHeaders, body: JSON.stringify(bodyObj) }, '임베딩 API 실패');
        const embs = json.embeddings || [json.embedding];
        _trackEmbedCost(arr, model);
        return validateEmbeddingVectors(embs.map(e => normalizeVector(e.values)), arr.length);
      } else {
        const url = _gBase + model + ':batchEmbedContents';
        const requests = arr.map(t => {
          const req = { model: 'models/' + model, content: { parts: [{ text: t }] }, outputDimensionality: dimensions };
          if (model.includes('embedding-001')) req.taskType = taskType;
          return req;
        });
        const json = await fetchEmbeddingJson(url, { method: 'POST', headers: embHeaders, body: JSON.stringify({ requests }) }, '배치 임베딩 API 실패');
        if (!json.embeddings) throw new Error('임베딩 결과가 없습니다.');
        _trackEmbedCost(arr, model);
        return validateEmbeddingVectors(json.embeddings.map(e => normalizeVector(e.values)), arr.length);
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

  function estimateTextTokens(text) {
    const value = String(text || '');
    if (!value) return 0;
    const cjk = (value.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    const nonCjk = value.length - cjk;
    return Math.max(1, Math.ceil(cjk * 0.9 + nonCjk / 4));
  }

  function estimateMessageTokens(message) {
    if (message == null) return 0;
    const text = typeof message === 'string'
      ? message
      : (message.message != null ? message.message : (message.content != null ? message.content : ''));
    return estimateTextTokens(text) + 6;
  }

  function deriveAiMemoryTurns(recentMsgs, config = {}) {
    const fallback = Math.max(1, Number(config.aiMemoryTurns || DEFAULTS.aiMemoryTurns || 3));
    if (config.adaptiveAiMemory === false || !Array.isArray(recentMsgs) || !recentMsgs.length) return fallback;
    const minTurns = Math.max(1, Number(config.nativeContextMinTurns || DEFAULTS.nativeContextMinTurns || 3));
    const maxTurns = Math.max(minTurns, Number(config.nativeContextMaxTurns || DEFAULTS.nativeContextMaxTurns || 16));
    const budget = Math.max(1000, Number(config.nativeContextTokenBudget || DEFAULTS.nativeContextTokenBudget || PLATFORM.contextTokens || 10000));
    let used = 0;
    let userTurns = 0;
    let messagesSeen = 0;
    for (let i = recentMsgs.length - 1; i >= 0; i--) {
      const msg = recentMsgs[i] || {};
      const tokens = estimateMessageTokens(msg);
      if (messagesSeen > 0 && used + tokens > budget) break;
      used += tokens;
      messagesSeen++;
      if (String(msg.role || '').toLowerCase() === 'user') userTurns++;
      if (userTurns >= maxTurns) break;
    }
    const inferred = userTurns || Math.ceil(messagesSeen / 2) || fallback;
    return Math.max(minTurns, Math.min(maxTurns, inferred));
  }

  // 네임스페이스 초기화
  const ns = _w.__LoreCore = _w.__LoreCore || {};
  Object.assign(ns, {
    VER, DB_SCHEMA_VERSION, LOCAL_MIGRATION_VERSION, TIMELINE_EVENT_TYPE, TIMELINE_SCHEMA_VERSION, TIMELINE_COMPRESSION_LEVELS, SAFETY, PLATFORM, DEFAULTS,
    getDB, gmFetch, parseServiceAccountJson, getVertexAccessToken,
    callGeminiApi, callDeepSeekApi, embedText, embedTexts, warmupFirebase,
    normalizeVector, cosineSim, simpleHash, packJsonForStorage, unpackJsonFromStorage,
    nativeFetchWithTimeout, generationRequestFingerprint, buildOpenAICompatVariants, promiseWithTimeout,
    estimateTextTokens, estimateMessageTokens, deriveAiMemoryTurns,
    loadSettings, saveSettings, incrementTurn, recordMention,
    __kernelLoaded: true
  });

  console.log(`[LoreCore:kernel] v${VER} loaded`);
})();
