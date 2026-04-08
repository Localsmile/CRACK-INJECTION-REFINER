// ==UserScript==
// @name        AI 응답 교정기
// @namespace   로어-교정기
// @version     1.0.0
// @description 로어·메모리 기반 AI 응답 자동 교정
// @author      로컬AI
// @match       https://crack.wrtn.ai/*
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-toastify-injection@v1.0.0/crack/libraries/toastify-injection.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.0.0/crack/libraries/crack-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@chasm-shared-core@v1.0.0/libraries/chasm-shared-core.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@decentralized-pre-1.0.15/decentralized-modal.js
// @require     https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @connect     generativelanguage.googleapis.com
// @connect     googleapis.com
// @connect     oauth2.googleapis.com
// @connect     contents-api.wrtn.ai
// @connect     crack-api.wrtn.ai
// @connect     aiplatform.googleapis.com
// @run-at      document-idle
// ==/UserScript==

// Ignitor 연동 플러그인

!(async function () {
  'use strict';

  // 기본 초기화
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  console.log('[교정기] 초기화 완료');

  const _GM_xhr = (typeof GM_xmlhttpRequest !== 'undefined')
    ? GM_xmlhttpRequest
    : (typeof GM !== 'undefined' && GM.xmlHttpRequest)
      ? GM.xmlHttpRequest.bind(GM)
      : null;

  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  }
  console.log('[교정기] UI 초기화 시작...');

  // 상수 및 설정
  const VER = 'v1.0.1';
  const _gHost = 'generativelanguage.googleapis.com';
  const _gBase = 'https://' + _gHost + '/v1beta/models/';
  const SAFETY = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
  ];

  const DEFAULT_PROMPT = `You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited RP)

## Scope
You receive:
- [Lore]: partial character/world data (NOT exhaustive — may be missing characters, locations, or rules that exist in the RP system prompt you cannot see)
- [Summaries]: memory snapshots from the chat platform
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response to check

You do NOT have the RP system prompt. You cannot see character definitions, world rules, or narration instructions the RP AI operates under.

## Core Rule
Your ONLY evidence sources are [Lore] and [Summaries].
Absence of information is NOT evidence of error.
An error exists ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error

1. EXPLICIT FACTUAL CONTRADICTION
   [New Speech] states something that is the logical opposite of an explicit fact in [Lore] or [Summaries].
   - Lore: "A와 B는 자매" → Speech: "A와 B는 연인" → error
   - Lore: "C는 사망" → Speech: C acting alive → error
   - Lore has no entry for character D → Speech mentions D → NOT an error

2. PRESENCE / ABSENCE CONTRADICTION
   A character is present in [New Speech] who is explicitly stated as absent, dead, or otherwise unable to be there according to [Lore] or [Summaries]. Or vice versa: a character explicitly stated to be present is missing from a scene where [Lore] confirms they must be.
   - Lore: "C는 해외 출장 중" → Speech: C가 국내 카페에 등장 → error
   - No location data for C → C appears anywhere → NOT an error

3. NICKNAME / TITLE MISMATCH
   A character uses or is called a 호칭 that contradicts a 호칭 explicitly defined in [Lore] (especially relationship entries with nicknames fields).
   - Lore: A→B 호칭 "언니" → Speech: A calls B "누나" → error
   - No 호칭 defined for a pair → any 호칭 → NOT an error

4. STATE CONTRADICTION
   A character's physical/emotional state in [New Speech] contradicts their current_state in [Lore].
   - Lore: "A: 왼팔 부상" → Speech: A swings a sword with left arm → error
   - No state recorded → any state → NOT an error

5. PROMISE / ARC CONTRADICTION
   [New Speech] references a promise, contract, or relationship milestone whose status contradicts [Lore] or [Summaries].
   - Lore promise status: "pending" → Speech: "약속을 지켜줘서 고마워" → error
   - Lore relationship arc shows phase "hostile" as latest → Speech treats them as allies without transition → error
   - No promise/arc data → any reference → NOT an error

## What is NEVER an Error
- Characters, locations, items, abilities, or events NOT mentioned in [Lore] or [Summaries]. They may exist in the RP system prompt.
- Writing style, tone, vocabulary, sentence structure, narration voice.
- Markdown formatting, line breaks, decorative elements.
- Content that is new, unexpected, or creative but not contradicted by evidence.
- Emotional or narrative choices that differ from what you might expect.

## Truncation Repair

Token limits may cut [New Speech] short. Two cases:

A) SENTENCE TRUNCATION
   [New Speech] ends mid-word or mid-clause. Complete ONLY the final interrupted sentence using [Recent Context] as reference. Do not add new narrative content.

B) STATUS BLOCK TRUNCATION
   Some RPs use a fenced code block as a status display at the end of each turn.
   - If [Recent Context] contains a complete status block AND [New Speech] has a truncated or absent status block → restore it.
   - Template: use the MOST RECENT complete status block from [Recent Context].
   - Update only values that [New Speech] content logically changes (e.g., HP after damage). Keep all other values unchanged.
   - If NO status block exists anywhere in [Recent Context] → do nothing.

## Principle
Make the MINIMUM surgical fix. Preserve everything else byte-for-byte. If uncertain whether something is an error, it is NOT an error — PASS.

## Decision Process
For each potential issue:
1. Can I point to a SPECIFIC statement in [Lore] or [Summaries] that this contradicts?
2. YES → flag it.
3. NO (including "no data exists") → PASS.

## Output Format
Reason MUST be in Korean.

No issues and no truncation repair needed:
{passWord}

Issues or repairs found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

Rules for replacements:
- "from" must be an EXACT character-by-character substring of [New Speech].
- "to" is the minimal corrected version.
- Change only what is wrong. Do not rewrite surrounding text.
- Multiple fixes = multiple objects in the array.
- For truncation: "from" = incomplete fragment, "to" = completed version.

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`;

  const _SKEY = 'speech-refiner-v1';
  const _ls = (typeof unsafeWindow !== 'undefined') ? unsafeWindow.localStorage : localStorage;

  const defaultSettings = {
    enabled: false,
    autoMode: false,
    passKeyword: 'PASS',
    contextTurns: 1,

    geminiApiType: 'key',
    geminiKey: '',
    geminiVertexJson: '',
    geminiVertexLocation: 'global',
    geminiVertexProjectId: '',
    geminiModel: 'gemini-3.1-flash-lite-preview',
    geminiCustomModel: '',
    geminiReasoning: 'medium',
    geminiBudget: 2048,
    customPrompt: DEFAULT_PROMPT,
    refinerLoreMode: 'matchedOnly',
    refinerMatchTurns: 5,
    urlRefinerLogs: {}
  };

  const settings = {
    config: JSON.parse(JSON.stringify(defaultSettings)),
    save() {
      try { _ls.setItem(_SKEY, JSON.stringify(this.config)); } catch (e) { /* noop */ }
    },
    load() {
      try {
        const saved = _ls.getItem(_SKEY);
        if (saved) {
          const p = JSON.parse(saved);
          if (p && typeof p === 'object') {
            for (const k in p) { if (p[k] !== undefined) this.config[k] = p[k]; }
          }
        }
      } catch (e) { console.warn('[교정기] 설정 로드 실패:', e); }
    }
  };
  settings.load();

  const syncSettings = (jsonStr) => {
    try {
      const p = JSON.parse(jsonStr);
      if (p && typeof p === 'object') {
        for (const k in p) { if (p[k] !== undefined) settings.config[k] = p[k]; }
      }
    } catch (err) { /* noop */ }
  };

  window.addEventListener('storage', (e) => {
    if (e.key === _SKEY && e.newValue) syncSettings(e.newValue);
  });
  window.addEventListener('focus', () => {
    try { const raw = _ls.getItem(_SKEY); if (raw) syncSettings(raw); } catch (e) { /* noop */ }
  });

  // 처리 완료 fingerprint 추적 (localStorage에 넣자)
  const _PROCESSED_KEY = 'speech-refiner-processed';
  const processedFingerprints = new Set();
  try {
    const saved = _ls.getItem(_PROCESSED_KEY);
    if (saved) JSON.parse(saved).forEach(fp => processedFingerprints.add(fp));
  } catch (e) { /* noop */ }

  function saveProcessedFingerprints() {
    const arr = Array.from(processedFingerprints).slice(-30); // 최근 30개만 유지
    try { _ls.setItem(_PROCESSED_KEY, JSON.stringify(arr)); } catch (e) { /* noop */ }
  }

  const db = new Dexie('lore-injector');
  db.version(1).stores({ entries: '++id, name, type, packName, *triggers', packs: 'name, entryCount' });
  db.version(2).stores({ entries: '++id, name, type, packName, project, *triggers', packs: 'name, entryCount, project' });

  // UI 상태 배지
  let _statusBadge = null;

  function showStatusBadge(text) {
    if (!_statusBadge) {
      _statusBadge = document.createElement('div');
      _statusBadge.id = 'refiner-status-badge';
      _statusBadge.style.cssText = [
        'position:fixed', 'bottom:20px', 'right:20px', 'z-index:999998',
        'background:#1a1a1a', 'border:1px solid #333', 'border-radius:20px',
        'padding:8px 16px', 'font-size:12px', 'color:#ccc',
        'box-shadow:0 4px 12px rgba(0,0,0,0.4)', 'display:flex',
        'align-items:center', 'gap:8px', 'font-family:inherit',
        'transition:opacity .3s', 'opacity:0', 'pointer-events:none'
      ].join(';');
      document.body.appendChild(_statusBadge);
    }
    _statusBadge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:refiner-pulse 1s infinite"></span> ${text}`;
    _statusBadge.style.opacity = '1';
    _statusBadge.style.pointerEvents = 'auto';
  }

  function hideStatusBadge() {
    if (_statusBadge) {
      _statusBadge.style.opacity = '0';
      _statusBadge.style.pointerEvents = 'none';
    }
  }

  // 펄스 애니메이션
  GM_addStyle(`
    @keyframes refiner-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `);

  // 플러그인 연동

  function getCurrentChatId() {
    try {
      return CrackUtil.path().chatRoom() || null;
    } catch (e) {
      console.warn('[교정기] getCurrentChatId 실패:', e);
      return null;
    }
  }

  async function fetchLogsFallback(fetchCount) {
    const chatId = getCurrentChatId();
    if (!chatId) return [];
    try {
      const msgs = await CrackUtil.chatRoom().extractLogs(chatId, { maxCount: fetchCount });
      if (msgs instanceof Error) {
        console.warn('[교정기] 메시지 fetch 에러:', msgs.message);
        return [];
      }
      return msgs.map(m => ({
        id: m.id || (m.content ? m.content.slice(0, 40) : ''),
        role: m.role,
        userName: m.role || '',
        message: m.content
      }));
    } catch (e) {
      console.warn('[교정기] fetchLogsFallback 예외:', e);
      return [];
    }
  }

  // 데이터 수집

  function getCurUrl() { return window.location.pathname; }

  function getActiveLorePacks() {
    try {
      const raw = _ls.getItem('lore-injector-v5');
      if (raw) {
        const p = JSON.parse(raw);
        const url = getCurUrl();
        return p.urlPacks?.[url] || [];
      }
    } catch (e) { /* noop */ }
    return [];
  }

  // 인젝터 자동추출 팩 목록 조회
  function getInjectorAutoPacks() {
    try {
      const raw = _ls.getItem('lore-injector-v5');
      if (raw) {
        const p = JSON.parse(raw);
        const ap = [...(p.autoPacks || [])];
        const urlPack = p.urlAutoExtPacks?.[getCurUrl()];
        if (urlPack && !ap.includes(urlPack)) ap.push(urlPack);
        return ap;
      }
    } catch (e) { /* noop */ }
    return ['자동추출'];
  }

  // 경량 트리거 매칭 (교정기용)
  function matchEntriesByTrigger(entries, recentMsgs, text) {
    const pool = [text.toLowerCase(), ...recentMsgs.map(m => (m.message || '').toLowerCase())].join(' ');
    return entries.filter(e => {
      if (!e.triggers || !e.triggers.length) return false;
      for (const t of e.triggers) {
        if (!t || t.length < 2) continue;
        if (t.split('&&').map(p => p.trim().toLowerCase()).every(p => pool.includes(p))) return true;
      }
      return false;
    });
  }

  // 범용 로어 렌더러 (교정기용)
  function renderLoreForRefiner(entries) {
    const L = {personality:'성격',attributes:'특성',abilities:'능력',current_state:'현재',last_interaction:'최근',current_status:'현재 상태',nicknames:'호칭',relations:'관계',background_or_history:'배경',maker:'약속자',target:'대상',condition:'발동 조건',status:'상태',resolution:'결과',parties:'관계자',ingredients:'재료',steps:'순서',tips:'참고',rules:'규칙',effects:'효과'};
    return entries.map(e => {
      const d = e.detail || {};
      let line = '[' + (e.type||'entity') + '] ' + e.name + ': ' + (e.summary||'');
      for (const [k, v] of Object.entries(d)) {
        if (v == null || v === '') continue;
        const lb = L[k] || k;
        if (Array.isArray(v)) {
          if (!v.length) continue;
          line += ' | ' + lb + ': ' + (typeof v[0]==='object' ? v.map(x=>Object.values(x).filter(Boolean).join(' / ')).join(' → ') : v.join(', '));
        } else if (typeof v === 'object') {
          const f = Object.entries(v).map(([a,b])=>a+': '+b).join(', ');
          if (f) line += ' | ' + lb + ': ' + f;
        } else line += ' | ' + lb + ': ' + String(v);
      }
      return line;
    }).join('\n');
  }

  async function fetchAllMemories(chatRoomId) {
    let bearerToken = '';
    if (typeof CrackUtil !== 'undefined' && CrackUtil.cookie) {
      try { bearerToken = CrackUtil.cookie().getAuthToken(); } catch (e) { /* noop */ }
    }
    const headers = {};
    if (bearerToken) headers['Authorization'] = 'Bearer ' + bearerToken;

    const endpoints = {
      goal: {
        url: `https://contents-api.wrtn.ai/character-chat/v3/chats/${chatRoomId}/summaries?limit=10`,
        hasTitle: false, useCreds: true
      },
      shortTerm: {
        url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=shortTerm&orderBy=newest`,
        hasTitle: true, useCreds: false
      },
      relationship: {
        url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=relationship&orderBy=newest`,
        hasTitle: true, useCreds: false
      },
      longTerm: {
        url: `https://crack-api.wrtn.ai/crack-gen/v3/chats/${chatRoomId}/summaries?limit=20&type=longTerm&orderBy=newest&filter=all`,
        hasTitle: true, useCreds: false
      }
    };

    const result = { goal: [], shortTerm: [], relationship: [], longTerm: [] };
    for (const [key, config] of Object.entries(endpoints)) {
      if (!bearerToken && !config.useCreds) continue;
      try {
        const reqOpts = { method: 'GET', headers };
        if (config.useCreds) reqOpts.credentials = 'include';
        const res = await fetch(config.url, reqOpts);
        const json = await res.json();
        if (json.result === 'SUCCESS' && json.data && json.data.summaries) {
          result[key] = json.data.summaries.map(s =>
            config.hasTitle ? `${s.title}: ${s.summary}` : s.summary
          );
        }
      } catch (e) {
        console.warn(`[교정기] ${key} 메모리 획득 실패:`, e);
      }
    }
    return result;
  }

  // AI 연동

  function gmFetch(url, opts) {
    if (!_GM_xhr) {
      return fetch(url, {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body || null,
      });
    }
    return new Promise((resolve, reject) => {
      _GM_xhr({
        method: opts.method || 'GET',
        url,
        headers: opts.headers || {},
        data: opts.body || null,
        responseType: 'text',
        onload: (r) => resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          text: () => Promise.resolve(r.responseText),
          json: () => Promise.resolve(JSON.parse(r.responseText)),
        }),
        onerror: (e) => reject(new Error(`GM_xmlhttpRequest error: ${JSON.stringify(e)}`)),
        ontimeout: () => reject(new Error('GM_xmlhttpRequest timeout')),
      });
    });
  }

  function parseServiceAccountJson(jsonStr) {
    try {
      const obj = JSON.parse(jsonStr);
      if (!obj.client_email || !obj.private_key) return { ok: false, error: 'invalid format' };
      return { ok: true, projectId: obj.project_id || '', clientEmail: obj.client_email, privateKey: obj.private_key, tokenUri: obj.token_uri || 'https://oauth2.googleapis.com/token' };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  let vertexTokenCache = { token: null, expiry: 0 };

  function pemToArrayBuffer(pem) {
    const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/[\r\n\s]/g, '');
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

  async function getVertexAccessToken(sa, cache) {
    const now = Math.floor(Date.now() / 1000);
    if (cache.token && cache.expiry > now + 60) return cache.token;
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ iss: sa.clientEmail, sub: sa.clientEmail, aud: sa.tokenUri, iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/cloud-platform' }));
    const signingInput = header + '.' + payload;
    const cryptoKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(sa.privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
    const jwt = signingInput + '.' + b64url(sigBuf);
    const resp = await gmFetch(sa.tokenUri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
    if (!resp.ok) throw new Error('Token exchange failed');
    const tokenData = await resp.json();
    cache.token = tokenData.access_token; cache.expiry = now + 3600;
    return cache.token;
  }

  async function callGeminiApi(prompt) {
    const isVertex = settings.config.geminiApiType === 'vertex';
    const model = settings.config.geminiModel === '_custom' ? settings.config.geminiCustomModel : settings.config.geminiModel;
    let url, headers;

    if (isVertex) {
      const sa = parseServiceAccountJson(settings.config.geminiVertexJson);
      if (!sa.ok) throw new Error('Service Account JSON 오류');
      const projId = settings.config.geminiVertexProjectId || sa.projectId;
      const accessToken = await getVertexAccessToken(sa, vertexTokenCache);
      const isGemini3 = model.includes('gemini-3');
      const host = isGemini3 ? 'aiplatform.googleapis.com' : `${settings.config.geminiVertexLocation}-aiplatform.googleapis.com`;
      const loc = isGemini3 ? 'global' : settings.config.geminiVertexLocation;
      url = `https://${host}/v1/projects/${projId}/locations/${loc}/publishers/google/models/${model}:generateContent`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` };
    } else {
      if (!settings.config.geminiKey) throw new Error('API 키가 없음.');
      url = _gBase + model + ':generateContent?key=' + settings.config.geminiKey;
      headers = { 'Content-Type': 'application/json' };
    }

    let thinkingConfig = {};
    const is3x = model.includes('gemini-3');
    const isPro = model.includes('pro');
    const sel = settings.config.geminiReasoning || 'medium';
    if (is3x) {
      if (sel === 'off' || sel === 'minimal') thinkingConfig = { thinkingLevel: isPro ? 'low' : 'minimal' };
      else if (sel === 'budget') thinkingConfig = { thinkingLevel: settings.config.geminiBudget <= 2048 ? 'low' : 'medium' };
      else thinkingConfig = { thinkingLevel: sel };
    } else {
      if (sel === 'off') thinkingConfig = { thinkingBudget: 0 };
      else if (sel === 'minimal') thinkingConfig = { thinkingBudget: 256 };
      else if (sel === 'budget') thinkingConfig = { thinkingBudget: settings.config.geminiBudget || 0 };
      else { const map = { low: 1024, medium: 2048, high: 4096 }; thinkingConfig = { thinkingBudget: map[sel] || 2048 }; }
    }

    const body = JSON.stringify({
      safetySettings: SAFETY,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { thinkingConfig }
    });

    const r = await gmFetch(url, { method: 'POST', headers, body });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      throw new Error(`API 오류 (${r.status}): ${err.slice(0, 200)}`);
    }
    const json = await r.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text && !p.thought);
    if (textPart) return textPart.text;
    const anyText = parts.find(p => p.text);
    return anyText?.text || '';
  }

  // UI 팝업

  function showRefineConfirm(reason, refinedText, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.id = 'refiner-confirm-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;justify-content:center;align-items:center;padding:20px;box-sizing:border-box;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:8px;width:100%;max-width:400px;padding:20px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;';

    const title = document.createElement('div');
    title.textContent = '✏️ AI 응답 교정 제안';
    title.style.cssText = 'font-size:16px;font-weight:bold;color:#4a9;margin-bottom:4px;';

    const reasonTitle = document.createElement('div');
    reasonTitle.textContent = '교정 이유:';
    reasonTitle.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;';
    const reasonText = document.createElement('div');
    reasonText.textContent = reason;
    reasonText.style.cssText = 'font-size:13px;color:#ccc;background:#222;padding:8px;border-radius:4px;';

    const refTitle = document.createElement('div');
    refTitle.textContent = '수정된 응답:';
    refTitle.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;margin-top:8px;';

    const refTa = document.createElement('textarea');
    refTa.value = refinedText;
    refTa.style.cssText = 'width:100%;height:100px;background:#0a0a0a;color:#fff;border:1px solid #444;border-radius:4px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:12px;';

    const btnCancel = document.createElement('button');
    btnCancel.textContent = '원본 유지';
    btnCancel.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#444;color:#ccc;cursor:pointer;font-weight:bold;';
    btnCancel.onclick = () => { document.body.removeChild(overlay); onCancel(); };

    const btnConfirm = document.createElement('button');
    btnConfirm.textContent = '교정본 변경';
    btnConfirm.style.cssText = 'padding:10px 16px;border-radius:6px;border:none;background:#285;color:#fff;cursor:pointer;font-weight:bold;';
    btnConfirm.onclick = () => { document.body.removeChild(overlay); onConfirm(refTa.value); };

    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnConfirm);
    box.appendChild(title);
    box.appendChild(reasonTitle);
    box.appendChild(reasonText);
    box.appendChild(refTitle);
    box.appendChild(refTa);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // DOM 헬퍼

  // 마크다운 구문을 제거하여 평문 추출 (DOM 텍스트 매칭용)
  function stripMarkdown(text) {
    return text
      .replace(/```\w*\n?/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  // 평문 스니펫을 포함하는 가장 구체적인(=가장 작은) DOM 요소 서칭
  // 텍스트 길이가 짧고 자식 div가 적은 요소를 우선 (일단 땜빵 처리)
  function findDeepestMatchingElement(searchPlainText) {
    // 스니펫 길이를 20자로 줄여 매칭 확률 상승
    const snippet = (searchPlainText.length > 20 ? searchPlainText.slice(-20) : searchPlainText).trim();
    if (!snippet || snippet.length < 5) {
      console.warn('[교정기] 탐색 스니펫 부족:', JSON.stringify(snippet));
      return null;
    }

    let best = null;
    let bestScore = Infinity;

    const all = document.querySelectorAll('div, p, article, section, span');
    for (const el of all) {
      const text = el.textContent;
      if (!text || !text.includes(snippet)) continue;
      if (el.tagName === 'BODY' || el.tagName === 'HTML') continue;
      if (el.id === '__next' || el.id === 'root') continue;

      // 점수: 텍스트 길이 + 자식 요소 수 (작을수록 구체적)
      const childCount = el.querySelectorAll('*').length;
      const score = text.length + childCount * 50;
      if (score < bestScore) {
        best = el;
        bestScore = score;
      }
    }

    if (best) {
      console.log('[교정기] 요소 탐색 성공:', best.tagName, best.className?.slice?.(0, 40), 'score:', bestScore);
    }
    return best;
  }

  // React Fiber props의 메시지 데이터를 교정본 패치
  // React 재조정(reconciliation) 시 DOM 롤백방지
  function tryPatchReactFiber(element, originalText, newText) {
    try {
      const fiberKey = Object.keys(element).find(k =>
        k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      );
      if (!fiberKey) return;

      const matchSnippet = stripMarkdown(originalText).slice(0, 40);
      let fiber = element[fiberKey];
      let depth = 0;

      while (fiber && depth < 20) {
        for (const propSet of [fiber.memoizedProps, fiber.pendingProps]) {
          if (!propSet || typeof propSet !== 'object') continue;
          for (const key of Object.keys(propSet)) {
            const val = propSet[key];
            if (typeof val === 'string' && val.length > 30 &&
                (val.includes(matchSnippet) || val === originalText)) {
              propSet[key] = newText;
            }
          }
          if (propSet.dangerouslySetInnerHTML?.__html &&
              propSet.dangerouslySetInnerHTML.__html.includes(matchSnippet)) {
            propSet.dangerouslySetInnerHTML.__html = (typeof marked !== 'undefined')
              ? marked.parse(newText, { breaks: false, gfm: true })
              : newText;
          }
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (e) {
      console.warn('[교정기] Fiber 패치 실패 (무시 가능):', e);
    }
  }

  // 마크다운을 HTML로 렌더링. marked.js 미로드 시 기본 변환.
  function renderMarkdownHTML(mdText) {
    if (typeof marked !== 'undefined' && marked.parse) {
      return marked.parse(mdText, { breaks: false, gfm: true });
    }
    return mdText
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  // SWR/React Query의 revalidateOnFocus 트리거.
  // visibilityState 일시적으로 hidden→visible로 전환, 데이터 재검증 유도. (땜빵용)
  function triggerSWRRevalidation() {
    try {
      const origDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
                    || Object.getOwnPropertyDescriptor(document, 'visibilityState');

      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden', configurable: true
      });
      document.dispatchEvent(new Event('visibilitychange'));

      setTimeout(() => {
        Object.defineProperty(document, 'visibilityState', {
          get: () => 'visible', configurable: true
        });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('online'));

        setTimeout(() => {
          try {
            if (origDesc) {
              Object.defineProperty(Document.prototype, 'visibilityState', origDesc);
            } else {
              delete document.visibilityState;
            }
          } catch (_) {}
        }, 200);
      }, 100);

      console.log('[교정기] SWR 재검증 트리거 발송');
    } catch (e) {
      console.warn('[교정기] SWR 재검증 트리거 실패:', e);
    }
  }

  // 마크다운 렌더링 유지, 메시지 DOM 즉시 갱신
  // React 재조정 대비, 10초간 500ms 간격으로 반복 적용
  // 추가로 SWR 재검증을 트리거, 서버 데이터 재요청 유도
  // @param {string} originalText 원본 메시지 (마크다운)
  // @param {string} newText 교정된 메시지 (마크다운)
  // @returns {boolean} 초기 적용 성공 여부
  function refreshMessageInDOM(originalText, newText) {
    const oldPlain = stripMarkdown(originalText);
    const newPlain = stripMarkdown(newText);
    const oldSnippet = (oldPlain.length > 30 ? oldPlain.slice(-30) : oldPlain).trim();
    const newSnippet = (newPlain.length > 30 ? newPlain.slice(-30) : newPlain).trim();
    const renderedHTML = renderMarkdownHTML(newText);
    let targetEl = null;

    function tryApply() {
      // 1) 기존 참조 요소가 DOM에 남아있는지 확인
      if (targetEl && document.contains(targetEl)) {
        const cur = (targetEl.textContent || '').trim();
        // 이미 교정본 반영됨
        if (newSnippet && cur.includes(newSnippet) && (!oldSnippet || !cur.includes(oldSnippet))) {
          return 'done';
        }
        // 아직 원본 → 재적용
        if (oldSnippet && cur.includes(oldSnippet)) {
          targetEl.innerHTML = renderedHTML;
          tryPatchReactFiber(targetEl, originalText, newText);
          console.log('[교정기] DOM 재적용 (React 롤백 감지)');
          return 'applied';
        }
      }

      // 2) 원본 텍스트로 요소 재탐색
      targetEl = findDeepestMatchingElement(oldPlain);
      if (targetEl) {
        targetEl.innerHTML = renderedHTML;
        tryPatchReactFiber(targetEl, originalText, newText);
        console.log('[교정기] DOM 갱신 적용 (요소 탐색 성공)');
        return 'applied';
      }

      // 3) 교정본으로 탐색 — 이미 반영된 상태일 수 있음
      const checkEl = findDeepestMatchingElement(newPlain);
      if (checkEl) {
        console.log('[교정기] 교정본 이미 DOM에 반영됨');
        return 'done';
      }

      console.warn('[교정기] DOM 요소 탐색 실패');
      return 'not_found';
    }

    // 즉시 1회 적용
    const firstResult = tryApply();
    if (firstResult === 'done') return true;

    // 반복 폴링: React 재조정 대비 (500ms × 20 = 10초)
    let pollCount = 0;
    const timer = setInterval(() => {
      pollCount++;
      if (pollCount >= 20) {
        clearInterval(timer);
        console.log('[교정기] 폴링 종료 (제한 도달)');
        return;
      }
      const r = tryApply();
      if (r === 'done') {
        clearInterval(timer);
        console.log('[교정기] 폴링 종료 (교정본 확인)');
      }
    }, 500);

    // SWR 재검증 트리거 (서버에서 교정된 데이터 재요청 유도)
    triggerSWRRevalidation();

    return firstResult === 'applied';
  }



  // 교정 로직

  async function refineMessage(assistantText) {
    if (!settings.config.enabled) return;

    console.log('[교정기] 검수 시작...');
    showStatusBadge('응답 검수 중...');

    const chatRoomId = getCurrentChatId();
    if (!chatRoomId) {
      console.warn('[교정기] 채팅방 ID 추출 실패');
      hideStatusBadge();
      return;
    }
    const url = getCurUrl();

    // (status block repair removed — handled by prompt)
    if (false) { // status block repair disabled — handled by AI prompt
      try {
        const repaired = null;
        if (repaired && repaired !== assistantText) {
          console.log('[교정기] 상태창 복구 적용');
          try {
            const _rcid = CrackUtil.path().chatRoom();
            const _rbot = await CrackUtil.chatRoom().findLastBotMessage(_rcid);
            if (_rbot && !(_rbot instanceof Error)) {
              const _rtoken = CrackUtil.cookie().getAuthToken();
              await gmFetch(`https://contents-api.wrtn.ai/character-chat/v3/chats/${_rcid}/messages/${_rbot.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + _rtoken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: repaired })
              });
            }
          } catch (e) { console.warn('[교정기] 상태창 복구 서버 수정 실패:', e); }
          addRefinerLog(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'StatusBlock Repaired', isPass: false, refined: repaired, reason: '상태창 잘림/누락 복구' });
          if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show('상태창 복구 완료 ✅', { duration: 2000, background: '#285' });
          assistantText = repaired;
        }
      } catch (e) { console.warn('[교정기] 상태창 복구 실패:', e); }
    }

    // 1. 로어
    const activePacks = getActiveLorePacks();
    let loreText = '활성화된 로어 없음.';
    if (activePacks.length > 0) {
      try {
        const entries = await db.entries.toArray();
        const activeEntries = entries.filter(e => activePacks.includes(e.packName));
        if (activeEntries.length > 0) {
          // 트리거 매칭 기반 선별
          const _tMsgs = await fetchLogsFallback(Math.max(4, (settings.config.refinerMatchTurns || 5) * 2));
          const _aP = getInjectorAutoPacks();
          const _fE = activeEntries.filter(x => !_aP.includes(x.packName));
          const _aE = activeEntries.filter(x => _aP.includes(x.packName));
          const _mF = matchEntriesByTrigger(_fE, _tMsgs, assistantText);
          const _mA = matchEntriesByTrigger(_aE, _tMsgs, assistantText);
          const _lE = settings.config.refinerLoreMode === 'matchedOnly' ? [..._mF, ..._mA] : [..._mF, ..._aE];
          if (_lE.length > 0) { loreText = renderLoreForRefiner(_lE); }
          else { loreText = '(키워드 매칭된 로어 없음 — 오타/끊김 검수만 수행)'; }
          if(false) loreText = activeEntries.map(e => {
            const d = e.detail || {};
            let line = `[${e.type||'entity'}] ${e.name}: ${e.summary || ''}`;
            if(e.type==='relationship'){
              if(d.current_status) line += ` (${d.current_status})`;
              if(d.nicknames && typeof d.nicknames==='object') line += ` | 호칭: ${Object.entries(d.nicknames).map(([k,v])=>k+': "'+v+'"').join(', ')}`;
              if(Array.isArray(d.arc) && d.arc.length) line += ` | 서사: ${d.arc.map(a=>a.phase+(a.summary?': '+a.summary:'')).join(' → ')}`;
            } else if(e.type==='promise'){
              if(d.status) line += ` [상태: ${d.status}]`;
              if(d.condition) line += ` [조건: ${d.condition}]`;
            } else {
              if(d.current_state) line += ` | 현재: ${d.current_state}`;
              if(d.last_interaction) line += ` | 최근: ${d.last_interaction}`;
              if(d.attributes) line += ` | 특성: ${d.attributes}`;
            }
            return line;
          }).join('\n');
        }
      } catch (e) { console.warn('[교정기] 로어 DB 접근 실패', e); }
    }

    // 2. 메모리
    showStatusBadge('메모리 수집 중...');
    let memoryText = '메모리 없음.';
    try {
      const mems = await fetchAllMemories(chatRoomId);
      const parts = [];
      if (mems.goal?.length) parts.push(`[목표]:\n${mems.goal.join('\n')}`);
      if (mems.shortTerm?.length) parts.push(`[단기기억]:\n${mems.shortTerm.join('\n')}`);
      if (mems.longTerm?.length) parts.push(`[장기기억]:\n${mems.longTerm.join('\n')}`);
      if (mems.relationship?.length) parts.push(`[관계도]:\n${mems.relationship.join('\n')}`);
      if (parts.length > 0) memoryText = parts.join('\n\n');
    } catch (e) { console.warn('[교정기] 메모리 수집 실패', e); }

    // 3. 컨텍스트
    let contextText = '최근 대화 내역 없음.';
    const turns = settings.config.contextTurns || 1;
    if (turns > 0) {
      const recentMsgs = await fetchLogsFallback(turns * 2);
      if (recentMsgs && recentMsgs.length > 0) {
        contextText = recentMsgs.map(m => `${m.role}: ${m.message}`).join('\n\n');
      }
    }

    // 4. AI 요청
    showStatusBadge('AI에게 검수 요청 중...');
    const passWord = settings.config.passKeyword || 'PASS';
    const prompt = (settings.config.customPrompt)
      .replace('{lore}', loreText)
      .replace('{memory}', memoryText)
      .replace('{context}', contextText)
      .replace('{message}', assistantText)
      .replace('{passWord}', passWord);

    try {
      if (typeof ToastifyInjection !== 'undefined') {
        ToastifyInjection.show('AI 응답 검수 중...', { duration: 2000, background: '#258' });
      }

      const response = await callGeminiApi(prompt);
      const text = response.trim();

      const isPass = text.includes(passWord) && text.length < passWord.length + 10;
      if (isPass) {
        console.log(`[교정기] ✅ 검수 통과`);
        addRefinerLog(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'PASS', isPass: true });
        showStatusBadge('✅ 문제없음');
        setTimeout(hideStatusBadge, 2000);
        if (typeof ToastifyInjection !== 'undefined') {
          ToastifyInjection.show('문제없이 통과됨 ✅', { duration: 2000, background: '#4a9' });
        }
        return;
      }

      let parsed = null;
      try {
        const raw = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(raw);
      } catch (e) {
        console.warn('[교정기] JSON 파싱 실패:', text.slice(0, 200));
        addRefinerLog(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Parsing Error: ' + text.slice(0, 50), isError: true });
        hideStatusBadge();
        if (typeof ToastifyInjection !== 'undefined') {
          ToastifyInjection.show('응답을 해석할 수 없어 원본을 유지함.', { duration: 3000, background: '#a55' });
        }
        return;
      }

      if (parsed && (parsed.replacements || parsed.refined_text)) {
        // replacements 방식: from→to 쌍으로 원본 텍스트에 적용
        let correctedText = assistantText;
        const replacements = parsed.replacements || [];
        if (replacements.length > 0) {
          for (const r of replacements) {
            if (r.from && r.to !== undefined) correctedText = correctedText.replace(r.from, r.to);
          }
        } else if (parsed.refined_text) {
          correctedText = parsed.refined_text; // 레거시 호환
        }

        console.log('[교정기] ⚠️ 교정 필요:', parsed.reason, '| 교체:', replacements.length, '건');
        addRefinerLog(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'Refined', isPass: false, refined: correctedText, reason: parsed.reason });
        showStatusBadge('⚠️ 교정 제안 있음');
        setTimeout(hideStatusBadge, 3000);

        const applyRefinement = async (newText) => {
          try {
            const _cid = CrackUtil.path().chatRoom();
            const lastBot = await CrackUtil.chatRoom().findLastBotMessage(_cid);
            if (lastBot && !(lastBot instanceof Error)) {
              // GM_xmlhttpRequest 경유로 CORS 우회
              const token = CrackUtil.cookie().getAuthToken();
              const editUrl = `https://contents-api.wrtn.ai/character-chat/v3/chats/${_cid}/messages/${lastBot.id}`;
              const editResult = await gmFetch(editUrl, {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: newText })
              });

              // 재교정 방지: 수정된 텍스트의 ID(혹은 fingerprint) 등록
              const newFp = lastBot.id || newText.slice(0, 40);
              processedFingerprints.add(newFp);
              saveProcessedFingerprints();
              lastAssistantMsgId = newFp;
              lastMsgLength = newText.length;

              if (editResult.ok) {
                console.log('[교정기] 메시지 서버 수정 완료');
                // DOM 즉시 갱신 (마크다운 렌더링 유지)
                const domUpdated = refreshMessageInDOM(assistantText, newText);
                if (!domUpdated) {
                  console.warn('[교정기] DOM 직접 갱신 실패 — 새로고침이 필요할 수 있음');
                }
                if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show(`교정 반영 완료 — ${parsed.reason}`, { duration: 4000, background: '#285' });
              } else {
                console.warn('[교정기] 메시지 수정 API 실패:', editResult.status);
                if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show('서버 수정 실패.', { duration: 3000, background: '#a55' });
              }
            } else {
              console.warn('[교정기] 마지막 봇 메시지를 찾을 수 없음');
              if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show('대상 메시지 탐색 실패. 교정본은 로그에 저장됨.', { duration: 3000, background: '#a55' });
            }
          } catch (e) {
            console.error('[교정기] 메시지 수정 오류:', e);
            if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show('메시지 수정 오류. 교정본은 로그에 저장됨.', { duration: 3000, background: '#a55' });
          }
        };

        if (settings.config.autoMode) {
          await applyRefinement(correctedText, replacements);
        } else {
          // 팝업 중복 방지: 이미 팝업이 떠있으면 새로 안 띄우고 로그에만 저장
          const existingPopup = document.querySelector('#refiner-confirm-overlay');
          if (existingPopup) {
            console.log('[교정기] 팝업이 이미 열려있음 — 로그에만 저장');
            if (typeof ToastifyInjection !== 'undefined') {
              ToastifyInjection.show('교정 제안이 로그에 저장됨.', { duration: 2000, background: '#258' });
            }
          } else {
            showRefineConfirm(
              parsed.reason,
              correctedText,
              (newText) => applyRefinement(newText, replacements),
              () => { console.log('[교정기] 교정 건너뜀'); }
            );
          }
        }
      }
    } catch (e) {
      console.error('[교정기] AI 처리 오류:', e);
      addRefinerLog(url, { time: new Date().toLocaleTimeString(), original: assistantText, result: 'System Error: ' + e.message, isError: true });
      hideStatusBadge();
      if (typeof ToastifyInjection !== 'undefined') {
        ToastifyInjection.show(`교정 실패: ${e.message}`, { duration: 3000, background: '#a55' });
      }
    }
  }

  // 큐 시스템

  const refineQueue = [];
  let workerBusy = false;
  let workerStartTime = 0;
  const WORKER_TIMEOUT = 90000; // 90초 타임아웃

  function enqueueRefine(text, msgId) {
    const fingerprint = msgId || text.slice(0, 40);
    // 이미 처리된 메시지면 스킵 (새로고침 후에도 유지)
    if (processedFingerprints.has(fingerprint)) {
      hideStatusBadge();
      return; // 이미 처리됨 — 무음으로 스킵
    }
    if (refineQueue.some(item => item.fingerprint === fingerprint)) {
      return; // 큐에 이미 있음
    }
    // fingerprint는 처리 완료 후 등록 (processQueue에서)
    refineQueue.push({ text, fingerprint, enqueuedAt: Date.now() });
    console.log(`[교정기] 큐에 추가됨 (큐 크기: ${refineQueue.length})`);
    processQueue();
  }

  async function processQueue() {
    if (refineQueue.length === 0) return;
    // workerBusy 타임아웃 방어: 90초 이상 멏힘면 강제 해제
    if (workerBusy) {
      if (Date.now() - workerStartTime > WORKER_TIMEOUT) {
        console.warn('[교정기] workerBusy 타임아웃 — 강제 해제');
        workerBusy = false;
        hideStatusBadge();
      } else {
        return;
      }
    }
    workerBusy = true;
    workerStartTime = Date.now();

    const item = refineQueue.shift();
    console.log(`[교정기] 큐 처리 시작 (남은 큐: ${refineQueue.length})`);

    try {
      // 60초 타임아웃 래핑 — hang 방지
      await Promise.race([
        refineMessage(item.text),
        new Promise((_, rej) => setTimeout(() => rej(new Error('refineMessage 60초 타임아웃')), 60000))
      ]);
    } catch (e) {
      console.error('[교정기] 큐 처리 에러:', e.message || e);
      hideStatusBadge();
    }

    // 처리 완료 후 fingerprint 등록 (성공/실패 무관 — 무한 재시도 방지)
    processedFingerprints.add(item.fingerprint);
    saveProcessedFingerprints();

    workerBusy = false;
    console.log('[교정기] 큐 처리 완료, workerBusy 해제');

    // 다음 아이템이 있으면 바로 처리
    if (refineQueue.length > 0) {
      console.log(`[교정기] 다음 큐 아이템 처리 시작...`);
      processQueue();
    }
  }

  // 상태 감지 (MutationObserver 기반)

  let lastAssistantMsgId = null;
  let lastMsgLength = 0;
  let idleCount = 0;
  let _needsWarmup = true; // OFF→ON 전환 시 기존 메시지 무시용
  let _lastKnownUrl = getCurUrl(); // 채팅방 URL 변경 감지용

  let _chatObserver = null;
  let _pollingInterval = null;

  async function checkLatestMessage() {
    if (!settings.config.enabled) return;

    const currentUrl = getCurUrl();
    if (currentUrl !== _lastKnownUrl) {
      console.log('[교정기] 채팅방 변경 감지 → warmup 재설정');
      _lastKnownUrl = currentUrl;
      lastAssistantMsgId = null;
      lastMsgLength = 0;
      idleCount = 0;
      _needsWarmup = true;
    }

    const chatId = getCurrentChatId();
    if (!chatId) return;

    try {
      const lastLog = await CrackUtil.chatRoom().findLastMessageId(chatId, "assistant");
      if (!lastLog || lastLog instanceof Error) return;

      const msgId = lastLog.id || (lastLog.content ? lastLog.content.slice(0, 40) : '');
      const contentLen = lastLog.content ? lastLog.content.length : 0;

      if (_needsWarmup) {
        console.log('[교정기] Warmup: 기존 메시지 스냅샷, 새 응답부터 감지 시작');
        lastAssistantMsgId = msgId;
        lastMsgLength = contentLen;
        idleCount = 0;
        _needsWarmup = false;
        return;
      }

      if (msgId !== lastAssistantMsgId) {
        console.log(`[교정기] 새 AI 응답 감지 (길이: ${contentLen})`);
        showStatusBadge('AI 응답 수신 대기...');
        lastAssistantMsgId = msgId;
        lastMsgLength = contentLen;
        idleCount = 0;
      } else {
        if (contentLen === lastMsgLength && lastMsgLength > 0) {
          idleCount++;
          // 약 2초간(관찰 2회) 길이 변화 없으면 스트리밍 완료로 간주
          if (idleCount === 2) {
            console.log('[교정기] 스트리밍 완료 감지 → 큐에 추가');
            enqueueRefine(lastLog.content, msgId);
          }
        } else {
          lastMsgLength = contentLen;
          idleCount = 0;
        }
      }
    } catch (e) {
      console.warn('[교정기] 감지 로직 에러:', e);
    }
  }

  // 백업용 큐 처리 인터벌 (workerBusy 방어)
  setInterval(() => {
    if (workerBusy && Date.now() - workerStartTime > WORKER_TIMEOUT) {
      console.warn('[교정기] 폴링 — workerBusy 타임아웃 강제 해제');
      workerBusy = false;
      hideStatusBadge();
    }
    if (refineQueue.length > 0 && !workerBusy) processQueue();
  }, 2000);

  function setupMutationObserver() {
    if (_chatObserver) _chatObserver.disconnect();
    if (_pollingInterval) clearInterval(_pollingInterval);

    // 1. MutationObserver로 DOM 변화 감지 (텍스트 길이 변화 등)
    _chatObserver = new MutationObserver((mutations) => {
      if (!settings.config.enabled) return;
      // DOM 변화가 있을 때만 메시지 체크를 위한 디바운싱 타이머 리셋
      if (window._refinerDebounceTimer) clearTimeout(window._refinerDebounceTimer);
      window._refinerDebounceTimer = setTimeout(() => {
        checkLatestMessage();
      }, 800); // 변화가 멈춘 후 0.8초 뒤 체크
    });

    _chatObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // 2. DOM 변화가 없더라도 가끔씩 체크 (백업) - 기존 1초에서 3초로 늘려 네트워크 부하 최소화
    _pollingInterval = setInterval(() => {
      if (settings.config.enabled) checkLatestMessage();
    }, 3000);

    console.log('[교정기] DOM 옵저버 기반 감지 시스템 시작됨.');
  }

  setupMutationObserver();

  // 로그

  function getRefinerLogs(url) {
    if (!settings.config.urlRefinerLogs) settings.config.urlRefinerLogs = {};
    return settings.config.urlRefinerLogs[url] || [];
  }

  function addRefinerLog(url, logItem) {
    if (!settings.config.urlRefinerLogs) settings.config.urlRefinerLogs = {};
    let logs = settings.config.urlRefinerLogs[url] || [];
    logItem._id = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    logs.unshift(logItem);
    if (logs.length > 50) logs.length = 50;
    settings.config.urlRefinerLogs[url] = logs;
    settings.save();
  }

  function removeRefinerLog(url, logId) {
    if (!settings.config.urlRefinerLogs) return;
    let logs = settings.config.urlRefinerLogs[url] || [];
    settings.config.urlRefinerLogs[url] = logs.filter(l => l._id !== logId);
    settings.save();
  }

  // UI 헬퍼

  function setFullWidth(node) {
    const p = node.parentElement;
    if (p) {
      p.style.display = 'block'; p.style.padding = '0'; p.style.margin = '0';
      p.style.border = 'none'; p.style.background = 'transparent';
      Array.from(p.children).forEach(c => { if (c !== node) c.style.display = 'none'; });
    }
    node.style.cssText = 'width:100%;display:block;padding:4px 6px;box-sizing:border-box;background:transparent;border:none;margin-bottom:8px;';
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

  // 펼치기,접기 텍스트 박스를 만드는 헬퍼
  function createCollapsibleBox(label, text, borderColor, copyLabel) {
    const container = document.createElement('div');
    container.style.cssText = 'margin-bottom:6px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;';

    const toggle = document.createElement('span');
    toggle.textContent = `▶ ${label}`;
    toggle.style.cssText = 'font-size:11px;color:#aaa;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = copyLabel || '복사';
    copyBtn.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = copyLabel || '복사'; }, 1000);
      });
    };
    btnRow.appendChild(copyBtn);
    header.appendChild(toggle);
    header.appendChild(btnRow);

    const content = document.createElement('div');
    content.style.cssText = `display:none;background:#1a1a1a;padding:6px 8px;border-radius:4px;font-size:12px;color:#ccc;margin-top:4px;border-left:3px solid ${borderColor};white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;line-height:1.5;`;
    content.textContent = text;

    let isOpen = false;
    header.onclick = () => {
      isOpen = !isOpen;
      content.style.display = isOpen ? 'block' : 'none';
      toggle.textContent = `${isOpen ? '▼' : '▶'} ${label}`;
    };

    container.appendChild(header);
    container.appendChild(content);
    return container;
  }

  function createApiInput(config, prefix, nd) {
    const apiTypeKey = prefix + 'ApiType';
    const keyKey = prefix + 'Key';
    const jsonKey = prefix + 'VertexJson';
    const locKey = prefix + 'VertexLocation';
    const projKey = prefix + 'VertexProjectId';
    const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';

    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    const btnKey = document.createElement('button');
    const btnVertex = document.createElement('button');
    const isVertex = () => (config[apiTypeKey] || 'key') === 'vertex';
    const keyArea = document.createElement('div');
    const vertexArea = document.createElement('div');

    const updateTypeBtns = () => {
      const v = isVertex();
      btnKey.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!v ? '#285' : '#444'};background:${!v ? '#285' : 'transparent'};color:${!v ? '#fff' : '#ccc'};`;
      btnVertex.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${v ? '#285' : '#444'};background:${v ? '#285' : 'transparent'};color:${v ? '#fff' : '#ccc'};`;
      keyArea.style.display = v ? 'none' : ''; vertexArea.style.display = v ? '' : 'none';
    };
    btnKey.textContent = 'API Key'; btnVertex.textContent = 'Vertex AI (JSON)';
    btnKey.onclick = () => { config[apiTypeKey] = 'key'; settings.save(); updateTypeBtns(); };
    btnVertex.onclick = () => { config[apiTypeKey] = 'vertex'; settings.save(); updateTypeBtns(); };
    typeRow.appendChild(btnKey); typeRow.appendChild(btnVertex); nd.appendChild(typeRow);

    const ki = document.createElement('input'); ki.type = 'text'; ki.value = config[keyKey] || '';
    ki.placeholder = 'AIzaSy...'; ki.setAttribute('autocomplete', 'off');
    ki.style.cssText = S + '-webkit-text-security: disc;';
    ki.onchange = () => {
      const val = ki.value.trim();
      if (val.startsWith('{') && val.includes('client_email')) {
        config[apiTypeKey] = 'vertex'; config[jsonKey] = val; ki.value = '';
        settings.save(); updateTypeBtns(); return;
      }
      config[keyKey] = val; settings.save();
    };
    keyArea.appendChild(ki); nd.appendChild(keyArea);

    const jta = document.createElement('textarea'); jta.value = config[jsonKey] || '';
    jta.placeholder = '{\n  "type": "service_account",\n  ... }';
    jta.style.cssText = S + 'height:80px;font-family:monospace;resize:vertical;';
    jta.onchange = () => { config[jsonKey] = jta.value; settings.save(); };
    vertexArea.appendChild(jta);

    const locRow = document.createElement('div'); locRow.style.cssText = 'display:flex;gap:12px;margin-top:8px;';
    const locDiv = document.createElement('div'); locDiv.style.flex = '1';
    const locInput = document.createElement('input'); locInput.value = config[locKey] || 'global';
    locInput.placeholder = 'Location'; locInput.style.cssText = S;
    locInput.onchange = () => { config[locKey] = locInput.value || 'global'; settings.save(); };
    locDiv.appendChild(locInput);
    const projDiv = document.createElement('div'); projDiv.style.flex = '1';
    const projInput = document.createElement('input'); projInput.value = config[projKey] || '';
    projInput.placeholder = 'Project ID (자동감지)'; projInput.style.cssText = S;
    projInput.onchange = () => { config[projKey] = projInput.value; settings.save(); };
    projDiv.appendChild(projInput);
    locRow.appendChild(locDiv); locRow.appendChild(projDiv);
    vertexArea.appendChild(locRow); nd.appendChild(vertexArea);

    const testRow = document.createElement('div');
    testRow.style.cssText = 'margin-top:12px;display:flex;gap:8px;align-items:center;';
    const testBtn = document.createElement('button'); testBtn.textContent = 'API 키 테스트';
    testBtn.style.cssText = 'padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;';
    const testResult = document.createElement('span');
    testResult.style.cssText = 'font-size:12px;color:#888;word-break:break-all;';
    testBtn.onclick = async () => {
      const v = (config[apiTypeKey] || 'key') === 'vertex';
      if (v ? !config[jsonKey] : !config[keyKey]) { alert('API 키를 입력하세요.'); return; }
      testBtn.disabled = true; testResult.textContent = '테스트 중...';
      try {
        const r = await callGeminiApi('Say "OK" in one word.');
        testResult.textContent = r ? '✅ 성공: ' + r.trim().slice(0, 50) : '❌ 빈 응답';
        testResult.style.color = r ? '#4a9' : '#d66';
      } catch (e) { testResult.textContent = '❌ ' + e.message; testResult.style.color = '#d66'; }
      testBtn.disabled = false;
    };
    testRow.appendChild(testBtn); testRow.appendChild(testResult); nd.appendChild(testRow);
    updateTypeBtns();
  }

  // 설정 UI

  function setupUI() {
    const modal = ModalManager.getOrCreateManager('c2');

    modal.createMenu('AI 응답 교정', (m) => {
      m.replaceContentPanel(async (panel) => {
        panel.addBoxedField('', '', {
          onInit: (nd) => {
            setFullWidth(nd);
            nd.appendChild(createToggleRow(
              '응답 교정 켜기',
              'AI 응답 완료 시 로어·메모리와 맞는지 자동 검수함.',
              settings.config.enabled,
              (val) => {
                settings.config.enabled = val;
                settings.save();
                if (val) _needsWarmup = true; // OFF→ON: warmup 플래그
              }
            ));
            nd.appendChild(createToggleRow(
              '자동 반영 (팝업 없음)',
              'ON 시 교정 결과 즉시 반영. OFF 시 팝업 확인.',
              settings.config.autoMode,
              (val) => { settings.config.autoMode = val; settings.save(); }
            ));

            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
            const left = document.createElement('div');
            left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
            const t = document.createElement('div'); t.textContent = '참조 대화 턴 수';
            t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
            const d = document.createElement('div'); d.textContent = '최근 몇 턴을 맥락으로 포함할지 설정 (1 이상 권장).';
            d.style.cssText = 'font-size:11px;color:#888;line-height:1.4;word-break:keep-all;';
            left.appendChild(t); left.appendChild(d);
            const right = document.createElement('div'); right.style.cssText = 'display:flex;align-items:center;';
            const inp = document.createElement('input'); inp.type = 'number';
            inp.value = settings.config.contextTurns || 1; inp.min = 0; inp.max = 20;
            inp.style.cssText = 'width:60px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;box-sizing:border-box;';
            inp.onchange = () => { let v = parseInt(inp.value); if (isNaN(v)) v = 1; settings.config.contextTurns = v; settings.save(); };
            right.appendChild(inp); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);

            nd.appendChild(createToggleRow(
              '로어 필터링: 키워드가 매칭된 로어만 전송',
              'ON: 지정된 턴에서 활성화된 로어 중 키워드 매칭된 것만 전송. OFF: 고정DB는 매칭만, 자동추출DB는 전부.',
              settings.config.refinerLoreMode === 'matchedOnly',
              (val) => { settings.config.refinerLoreMode = val ? 'matchedOnly' : 'hybrid'; settings.save(); }
            ));

            const mtwrap = document.createElement('div');
            mtwrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
            const mtleft = document.createElement('div');
            mtleft.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
            const mtt = document.createElement('div'); mtt.textContent = '키워드 검색 대화 턴 수';
            mtt.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
            const mtd = document.createElement('div'); mtd.textContent = '최근 N개 대화에서 키워드 일치 여부 확인. (필터링 ON: 전체 적용 / OFF: 고정DB에만 적용)';
            mtd.style.cssText = 'font-size:11px;color:#888;line-height:1.4;word-break:keep-all;';
            mtleft.appendChild(mtt); mtleft.appendChild(mtd);
            const mtright = document.createElement('div'); mtright.style.cssText = 'display:flex;align-items:center;';
            const mtinp = document.createElement('input'); mtinp.type = 'number';
            mtinp.value = settings.config.refinerMatchTurns || 5; mtinp.min = 0; mtinp.max = 30;
            mtinp.style.cssText = 'width:60px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;box-sizing:border-box;';
            mtinp.onchange = () => { let v = parseInt(mtinp.value); if (isNaN(v)) v = 5; settings.config.refinerMatchTurns = v; settings.save(); };
            mtright.appendChild(mtinp); mtwrap.appendChild(mtleft); mtwrap.appendChild(mtright); nd.appendChild(mtwrap);

          }
        });

        panel.addBoxedField('', '', {
          onInit: (nd) => {
            setFullWidth(nd);
            const title = document.createElement('div'); title.textContent = 'Gemini / Vertex AI API 설정';
            title.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:8px;';
            nd.appendChild(title);
            createApiInput(settings.config, 'gemini', nd);

            const ml = document.createElement('div'); ml.textContent = '사용 모델';
            ml.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(ml);
            const ms = document.createElement('select');
            ms.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            [
              ['Gemini 3.x', [['3.0 Pro', 'gemini-3-pro-preview'], ['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview'], ['3.1 Flash Lite', 'gemini-3.1-flash-lite-preview']]],
              ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.5 Flash', 'gemini-2.5-flash'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash'], ['2.0 Flash Lite', 'gemini-2.0-flash-lite']]],
              ['기타', [['직접 입력', '_custom']]]
            ].forEach(([g, opts]) => {
              const og = document.createElement('optgroup'); og.label = g;
              opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); });
              ms.appendChild(og);
            });
            ms.value = settings.config.geminiModel || 'gemini-3-flash-preview';
            const ci = document.createElement('input'); ci.value = settings.config.geminiCustomModel || '';
            ci.placeholder = '모델 ID 직접 입력';
            ci.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-top:6px;' + (ms.value === '_custom' ? '' : 'display:none;');
            ci.onchange = () => { settings.config.geminiCustomModel = ci.value; settings.save(); };
            ms.onchange = () => { settings.config.geminiModel = ms.value; settings.save(); ci.style.display = ms.value === '_custom' ? '' : 'none'; };
            nd.appendChild(ms); nd.appendChild(ci);

            const rl = document.createElement('div'); rl.textContent = '추론(Reasoning) 레벨';
            rl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(rl);
            const rs = document.createElement('select');
            rs.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            [['Off','off'],['Minimal (256)','minimal'],['Low (1024)','low'],['Medium (2048)','medium'],['High (4096)','high'],['Budget (Custom)','budget']].forEach(([l,v])=>{
              const o=document.createElement('option');o.value=v;o.textContent=l;rs.appendChild(o);
            });
            rs.value = settings.config.geminiReasoning || 'medium';
            const bl = document.createElement('div'); bl.textContent = '추론 예산 (Budget)';
            bl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;' + (rs.value === 'budget' ? '' : 'display:none;');
            const bi = document.createElement('input'); bi.type = 'number'; bi.value = settings.config.geminiBudget || 2048; bi.min = 0;
            bi.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;' + (rs.value === 'budget' ? '' : 'display:none;');
            rs.onchange = () => { settings.config.geminiReasoning = rs.value; settings.save(); const isB = rs.value === 'budget'; bl.style.display = isB ? '' : 'none'; bi.style.display = isB ? '' : 'none'; };
            bi.onchange = () => { settings.config.geminiBudget = parseInt(bi.value) || 2048; settings.save(); };
            nd.appendChild(rs); nd.appendChild(bl); nd.appendChild(bi);
          }
        });

        panel.addBoxedField('', '', {
          onInit: (nd) => {
            setFullWidth(nd);
            const titleRow = document.createElement('div');
            titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
            const title = document.createElement('div'); title.textContent = '검수 프롬프트';
            title.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
            const resetPromptBtn = document.createElement('button');
            resetPromptBtn.textContent = '기본값 복원';
            resetPromptBtn.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
            titleRow.appendChild(title); titleRow.appendChild(resetPromptBtn);
            nd.appendChild(titleRow);

            const pLbl = document.createElement('div'); pLbl.textContent = 'PASS 키워드';
            pLbl.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; nd.appendChild(pLbl);
            const pInp = document.createElement('input'); pInp.value = settings.config.passKeyword || 'PASS';
            pInp.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;';
            pInp.onchange = () => { settings.config.passKeyword = pInp.value; settings.save(); };
            nd.appendChild(pInp);

            const tLbl = document.createElement('div'); tLbl.textContent = '프롬프트 변수: {lore}, {memory}, {context}, {message}, {passWord}';
            tLbl.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; nd.appendChild(tLbl);
            const ta = document.createElement('textarea'); ta.value = settings.config.customPrompt;
            ta.style.cssText = 'width:100%;height:250px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:11px;font-family:monospace;resize:vertical;box-sizing:border-box;';
            ta.onchange = () => { settings.config.customPrompt = ta.value; settings.save(); };
            resetPromptBtn.onclick = () => { if(confirm('프롬프트를 기본값으로 복원함?')){ ta.value=DEFAULT_PROMPT; settings.config.customPrompt=DEFAULT_PROMPT; settings.save(); } };
            nd.appendChild(ta);

            const clearFpBtn = document.createElement('button');
            clearFpBtn.textContent = '처리 기록 삭제 (큐 막힘 시)';
            clearFpBtn.style.cssText = 'width:100%;padding:8px;margin-top:12px;background:#654;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;';
            clearFpBtn.onclick = () => {
              processedFingerprints.clear();
              _ls.removeItem(_PROCESSED_KEY);
              console.log('[교정기] 처리 기록 삭제 완료');
              if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show('처리 기록 삭제됨 — 다음 응답부터 재검수', { duration: 2000, background: '#654' });
            };
            nd.appendChild(clearFpBtn);

            const resetBtn = document.createElement('button');
            resetBtn.textContent = '모든 설정 및 로그 초기화';
            resetBtn.style.cssText = 'width:100%;padding:10px;margin-top:20px;background:#833;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;';
            resetBtn.onclick = () => {
              if (confirm('모든 설정과 로그를 삭제하고 초기화함?')) {
                _ls.removeItem(_SKEY); _ls.removeItem(_PROCESSED_KEY); alert('초기화 완료. 페이지 새로고침됨.'); location.reload();
              }
            };
            nd.appendChild(resetBtn);
          }
        });
      }, `AI 응답 교정 ${VER}`);
    })
    .createSubMenu('교정 로그', (m) => {
      m.replaceContentPanel((panel) => {
        const logs = getRefinerLogs(getCurUrl());
        if (logs.length === 0) {
          panel.addText('현재 대화방의 교정 기록 없음.');
          return;
        }
        logs.forEach(l => {
          panel.addBoxedField('', '', {
            onInit: (nd) => {
              setFullWidth(nd);

              // 상태 헤더 + 삭제 버튼
              const header = document.createElement('div');
              header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
              const t = document.createElement('div');
              let statusText = '알 수 없음', statusColor = '#888';
              if (l.isPass) { statusText = '✅ 통과'; statusColor = '#4a9'; }
              else if (l.isError) { statusText = '❌ 실패'; statusColor = '#d66'; }
              else { statusText = '✏️ 교정됨'; statusColor = '#ea5'; }
              t.innerHTML = `<span style="color:#aaa;font-size:11px;margin-right:8px;">[${l.time}]</span><span style="color:${statusColor};font-weight:bold;font-size:12px;">${statusText}</span>`;

              const delBtn = document.createElement('button');
              delBtn.textContent = '🗑';
              delBtn.title = '이 로그 삭제';
              delBtn.style.cssText = 'font-size:14px;padding:2px 6px;border-radius:3px;background:transparent;border:1px solid transparent;cursor:pointer;opacity:0.5;transition:opacity .2s;';
              delBtn.onmouseenter = () => { delBtn.style.opacity = '1'; delBtn.style.borderColor = '#555'; };
              delBtn.onmouseleave = () => { delBtn.style.opacity = '0.5'; delBtn.style.borderColor = 'transparent'; };
              delBtn.onclick = () => {
                if (l._id) {
                  removeRefinerLog(getCurUrl(), l._id);
                } else {
                  // 이전 버전 로그 (id 없음) — 시간 기준으로 삭제
                  const url = getCurUrl();
                  let logs = getRefinerLogs(url);
                  const idx = logs.indexOf(l);
                  if (idx !== -1) { logs.splice(idx, 1); settings.config.urlRefinerLogs[url] = logs; settings.save(); }
                }
                // UI에서 제거
                const card = nd.parentElement;
                if (card) card.style.display = 'none';
              };

              header.appendChild(t);
              header.appendChild(delBtn);
              nd.appendChild(header);

              // 교정 이유 (있으면)
              if (l.reason) {
                const reasonBox = document.createElement('div');
                reasonBox.style.cssText = 'font-size:11px;color:#da7;margin-bottom:6px;';
                reasonBox.textContent = `💡 ${l.reason}`;
                nd.appendChild(reasonBox);
              }

              // 원본 (펼치기/접기 + 복사)
              nd.appendChild(createCollapsibleBox('원본 보기', l.original || '', '#555', '원본 복사'));

              // 교정본 (펼치기/접기 + 복사)
              if (l.refined) {
                nd.appendChild(createCollapsibleBox('교정본 보기', l.refined, '#4a9', '교정본 복사'));
              } else if (l.result && l.result !== 'PASS' && l.result !== 'Refined') {
                const resBox = document.createElement('div');
                resBox.style.cssText = 'font-size:11px;color:#d66;word-break:break-all;margin-top:4px;';
                resBox.textContent = `Raw: ${l.result}`;
                nd.appendChild(resBox);
              }
            }
          });
        });
      }, '교정 로그');
    });
  }

  // 부트스트랩

  setTimeout(() => {
    try {
      setupUI();
      console.log(`[교정기] UI 준비 완료 (${VER})`);
    } catch (e) {
      console.error('[교정기] UI 에러:', e);
    }
  }, 500);

  // 모달 메뉴 및 버튼 주입 로직 (ignitor 독립성 확보)
  function __updateModalMenu() {
    const modal = document.getElementById("web-modal");
    if (modal && !document.getElementById("chasm-decentral-menu")) {
      const itemFound = modal.getElementsByTagName("a");
      for (let item of itemFound) {
        if (item.getAttribute("href") === "/setting") {
          const clonedElement = item.cloneNode(true);
          clonedElement.id = "chasm-decentral-menu";
          const textElement = clonedElement.getElementsByTagName("span")[0];
          if(textElement) textElement.innerText = "결정화 캐즘";
          clonedElement.setAttribute("href", "javascript: void(0)");
          clonedElement.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
          };
          item.parentElement?.append(clonedElement);
          break;
        }
      }
    } else if (!document.getElementById("chasm-decentral-menu") && !window.matchMedia("(min-width: 768px)").matches) {
      const selected = document.getElementsByTagName("a");
      for (const element of selected) {
        if (element.getAttribute("href") === "/my-page") {
          const clonedElement = element.cloneNode(true);
          clonedElement.id = "chasm-decentral-menu";
          const textElement = clonedElement.getElementsByTagName("span")[0];
          if(textElement) textElement.innerText = "결정화 캐즘";
          clonedElement.setAttribute("href", "javascript: void(0)");
          clonedElement.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
          };
          element.parentElement?.append(clonedElement);
        }
      }
    }
  }

  async function injectBannerButton() {
    const selected = document.getElementsByClassName("burner-button");
    if (selected && selected.length > 0) return;
    try {
      const isStory = /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname);
      const topPanel = document.getElementsByClassName(isStory ? "css-1c5w7et" : "css-l8r172");
      if (topPanel && topPanel.length > 0) {
        const topContainer = topPanel[0].childNodes[topPanel.length - 1]?.getElementsByTagName("div");
        if (!topContainer || topContainer.length <= 0) return;
        const topList = topContainer[0].children[0].children;
        const top = topList[topList.length - 1];
        if(!top) return;
        const buttonCloned = document.createElement("button");
        buttonCloned.innerHTML = "<p></p>";
        buttonCloned.style.cssText = "margin-right: 10px";
        buttonCloned.className = "burner-button";
        const textNode = buttonCloned.getElementsByTagName("p");
        top.insertBefore(buttonCloned, top.childNodes[0]);
        textNode[0].innerText = "🔥  Chasm Tools";
        buttonCloned.removeAttribute("onClick");
        buttonCloned.addEventListener("click", () => {
          ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
        });
      }
    } catch(e){}
  }

  async function injectInputbutton() {
    const selected = document.getElementsByClassName("burner-input-button");
    if (selected && selected.length > 0) return;
    try {
      const top = document.querySelector('textarea[placeholder="메시지 보내기"]')?.nextElementSibling;
      if (top) {
        const expectedTop = top.children[0]?.children[0];
        if(!expectedTop || !expectedTop.childNodes[0]) return;
        const buttonCloned = expectedTop.childNodes[0].cloneNode(true);
        buttonCloned.className = "burner-input-button " + buttonCloned.className;
        buttonCloned.innerHTML = '<svg width="24px" height="24px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <title>fire_fill</title> <g id="页面-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"> <g id="System" transform="translate(-480.000000, -48.000000)" fill-rule="nonzero"> <g id="fire_fill" transform="translate(480.000000, 48.000000)"> <path d="M24,0 L24,24 L0,24 L0,0 L24,0 Z M12.5934901,23.257841 L12.5819402,23.2595131 L12.5108777,23.2950439 L12.4918791,23.2987469 L12.4918791,23.2987469 L12.4767152,23.2950439 L12.4056548,23.2595131 C12.3958229,23.2563662 12.3870493,23.2590235 12.3821421,23.2649074 L12.3780323,23.275831 L12.360941,23.7031097 L12.3658947,23.7234994 L12.3769048,23.7357139 L12.4804777,23.8096931 L12.4953491,23.8136134 L12.4953491,23.8136134 L12.5071152,23.8096931 L12.6106902,23.7357139 L12.6232938,23.7196733 L12.6232938,23.7196733 L12.6266527,23.7031097 L12.609561,23.275831 C12.6075724,23.2657013 12.6010112,23.2592993 12.5934901,23.257841 L12.5934901,23.257841 Z M12.8583906,23.1452862 L12.8445485,23.1473072 L12.6598443,23.2396597 L12.6498822,23.2499052 L12.6498822,23.2499052 L12.6471943,23.2611114 L12.6650943,23.6906389 L12.6699349,23.7034178 L12.6699349,23.7034178 L12.678386,23.7104931 L12.8793402,23.8032389 C12.8914285,23.8068999 12.9022333,23.8029875 12.9078286,23.7952264 L12.9118235,23.7811639 L12.8776777,23.1665331 C12.8752882,23.1545897 12.8674102,23.1470016 12.8583906,23.1452862 L12.8583906,23.1452862 Z M12.1430473,23.1473072 C12.1332178,23.1423925 12.1221763,23.1452606 12.1156365,23.1525954 L12.1099173,23.1665331 L12.0757714,23.7811639 C12.0751323,23.7926639 12.0828099,23.8018602 12.0926481,23.8045676 L12.108256,23.8032389 L12.3092106,23.7104931 L12.3186497,23.7024347 L12.3186497,23.7024347 L12.3225043,23.6906389 L12.340401,23.2611114 L12.337245,23.2485176 L12.337245,23.2485176 L12.3277531,23.2396597 L12.1430473,23.1473072 Z" id="MingCute" fill-rule="nonzero"> </path> <path d="M11.5144,2.14236 L10.2549,1.38672 L10.0135,2.83553 C9.63231,5.12379 8.06881,7.25037 6.34517,8.74417 C2.96986,11.6694 2.23067,14.8487 3.27601,17.4753 C4.27565,19.987 6.81362,21.7075 9.3895,21.9938 L9.98632,22.0601 C8.51202,21.1585 7.56557,19.0535 7.89655,17.4813 C8.22199,15.9355 9.33405,14.4869 11.4701,13.1519 L12.5472,12.4787 L12.9488,13.6836 C13.1863,14.3963 13.5962,14.968 14.0129,15.5492 C14.2138,15.8294 14.4162,16.1118 14.6018,16.4132 C15.2447,17.4581 15.415,18.6196 14.9999,19.7722 C14.6222,20.8211 13.9985,21.6446 13.1401,22.1016 L14.1105,21.9938 C16.5278,21.7252 18.3031,20.8982 19.4557,19.515 C20.5986,18.1436 20.9999,16.379 20.9999,14.4999 C20.9999,12.7494 20.2812,10.946 19.433,9.44531 C18.4392,7.68697 17.1418,6.22748 15.726,4.8117 C15.481,5.30173 15.5,5.5 14.9953,6.28698 C14.4118,4.73216 13.2963,3.21139 11.5144,2.14236 Z" id="路径" fill="var(--icon_tertiary)"> </path> </g> </g> </g> </g></svg>';
        buttonCloned.removeAttribute("onClick");
        buttonCloned.addEventListener("click", () => {
          ModalManager.getOrCreateManager("c2").display(document.body.getAttribute("data-theme") !== "light");
        });
        expectedTop.insertBefore(buttonCloned, expectedTop.childNodes[0]);
      }
    } catch(e){}
  }

  async function doInjection() {
    if (!/\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname) && !/\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) && !/\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname)) {
      return;
    }
    await injectBannerButton();
    await injectInputbutton();
  }

  function __doModalMenuInit() {
    if (document.c2RefinerModalInit) return;
    document.c2RefinerModalInit = true;

    if(typeof GenericUtil !== 'undefined' && GenericUtil.attachObserver) {
      GenericUtil.attachObserver(document, () => {
        __updateModalMenu();
      });
    } else {
      const observer = new MutationObserver(() => {
        __updateModalMenu();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", doInjection);
      window.addEventListener("load", doInjection);
    } else {
      doInjection();
    }

    setInterval(doInjection, 2000);
  }

  __doModalMenuInit();

})();
