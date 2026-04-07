// ==UserScript==
// @name        AI 응답 교정기
// @namespace   로어-교정기
// @version     1.0.0
// @description 로어·메모리 기반 AI 응답 자동 교정 (Ignitor 연동 스크립트)
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

  const DEFAULT_PROMPT = `You are an RP Continuity Checker & Repair Tool.
RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited RP)

You have NO access to the original RP system prompt — you do NOT know the intended narration style, character voice, or writing conventions.

Your jobs:
1. Detect FACTUAL contradictions between [New Speech] and [Lore] + [Summaries]
2. If the message is truncated mid-sentence (token limit cutoff), complete the last sentence naturally based on context
3. If a status block (e.g. \`\`\` code block) is truncated or missing compared to [Recent Context], restore it from the most recent complete version in context

FIX ONLY:
- Wrong character names, relationships, or nicknames/호칭
- Events that contradict established timeline or arc history
- Broken promises referenced as kept (or vice versa)
- Characters present who shouldn't be, or absent who should be
- Character states (emotional/physical) that contradict current_state records
- Factual details that directly conflict with lore/memory
- Truncated sentences: if the text ends abruptly mid-word or mid-clause, complete it naturally
- Truncated/missing status blocks: if a code block or status display is cut off or absent but present in [Recent Context], restore it

NEVER ALTER:
- Writing style, narration voice, sentence structure, vocabulary
- Character speech patterns or dialogue style
- Markdown formatting, line breaks, structural elements (except to repair truncation)
- Content not directly related to the factual error or truncation
- Tone, mood, or emotional register
- Adding arbitrary metatext that undermines RP immersion

PRINCIPLE: Make the MINIMUM surgical fix. Preserve everything else byte-for-byte.

Output language: reason MUST be in Korean (한국어).
- No issues found → output ONLY: {passWord}
- Issue found → JSON (no markdown code blocks):
{"reason":"교정 이유를 한국어로 간결하게 설명","replacements":[{"from":"원본에서 틀린 부분의 정확한 문장/구절","to":"교정된 문장/구절"}]}

IMPORTANT for replacements:
- Each "from" MUST be an EXACT substring of [New Speech] (copy it character-by-character).
- Each "to" is the corrected version of that exact substring.
- Include ONLY the minimum changed portions — not the whole sentence if only one word changed.
- For truncation repair, use the last incomplete fragment as "from" and the completed version as "to".
- Multiple fixes = multiple objects in the array.

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
    geminiModel: 'gemini-3-flash-preview',
    geminiCustomModel: '',
    geminiReasoning: 'medium',
    geminiBudget: 2048,
    customPrompt: DEFAULT_PROMPT,
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

  function getIgnitorProvider() {
    try {
      if (typeof GenericUtil !== 'undefined' && GenericUtil.refine) {
        return GenericUtil.refine(document).__$igntPlatformProvider || null;
      }
    } catch (e) {
      console.warn('[교정기] GenericUtil 접근 실패:', e);
    }
    return null;
  }

  function getCurrentChatId() {
    let id = null;
    const provider = getIgnitorProvider();
    if (provider) {
      try { id = provider.getCurrentId(); } catch (e) {}
    }
    if (!id) {
      try { id = typeof CrackUtil !== 'undefined' ? CrackUtil.path().chatRoom() : null; } catch (e) {}
    }
    if (!id) {
      const match = window.location.pathname.match(/\/episodes\/([a-f0-9]+)/);
      if (match) id = match[1];
    }
    return id || null;
  }

  async function fetchLogsFallback(fetchCount) {
    let recentMsgs = [];
    const chatId = getCurrentChatId();
    if (chatId) {
      try {
        const items = await CrackUtil.chatRoom().extractLogs(chatId, { maxCount: fetchCount });
        if (!(items instanceof Error) && Array.isArray(items)) {
          recentMsgs = items.map(m => ({
            id: m.content ? m.content.slice(0, 30) : '',
            role: m.role,
            userName: m.userName || '',
            message: m.content
          }));
        }
      } catch (e) { /* ignore */ }
    }

    if (recentMsgs.length === 0) {
      const provider = getIgnitorProvider();
      if (provider) {
        try {
          const fetcher = provider.getFetcher();
          if (fetcher && fetcher.isValid()) {
            const msgs = await fetcher.fetch(fetchCount);
            if (!(msgs instanceof Error)) {
              recentMsgs = msgs.map(m => ({
                id: m.message ? m.message.slice(0, 30) : '',
                role: m.role,
                userName: m.userName || '',
                message: m.message
              }));
            }
          }
        } catch (e) {
          console.warn('[교정기] fetchLogsFallback 예외:', e);
        }
      }
    }
    return recentMsgs;
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
          loreText = activeEntries.map(e => {
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
            const _cid = getCurrentChatId();
            if (!_cid) {
              console.warn('[교정기] 교정 적용 실패: 채팅방 ID를 찾을 수 없음');
              if (typeof ToastifyInjection !== 'undefined') ToastifyInjection.show('서버 수정 실패: 채팅방 인식 불가', { duration: 3000, background: '#a55' });
              return;
            }
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
              // DOM 직접 수정 제거 — popstate로 React 리렌더링에 위임
              // 재교정 방지: 수정된 텍스트의 fingerprint 등록
              const newFp = newText.slice(0, 40);
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
                console.warn('[교정기] 메시지 수정 API 실패:', editResult instanceof Error ? editResult.message : editResult);
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

  function enqueueRefine(text) {
    const fingerprint = text.slice(0, 40);
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
      await refineMessage(item.text);
    } catch (e) {
      console.error('[교정기] 큐 처리 에러:', e);
      hideStatusBadge();
    }

    // 처리 완료 후 fingerprint 등록 (성공/실패 무관 — 무한 재시도 방지)
    processedFingerprints.add(item.fingerprint);
    saveProcessedFingerprints();

    workerBusy = false;

    // 다음 아이템이 있으면 바로 처리
    if (refineQueue.length > 0) {
      console.log(`[교정기] 다음 큐 아이템 처리 시작...`);
      processQueue();
    }
  }

  // 상태 감지

  let lastAssistantMsgId = null;
  let lastMsgLength = 0;
  let idleCount = 0;
  let _pollLogOnce = true;
  let _needsWarmup = true; // OFF→ON 전환 시 기존 메시지 무시용
  let _lastKnownUrl = getCurUrl(); // 채팅방 URL 변경 감지용

  setInterval(async () => {
    if (!settings.config.enabled) {
      if (_pollLogOnce) {
        console.log(`[교정기] 폴링 대기 (enabled: ${settings.config.enabled})`);
        _pollLogOnce = false;
      }
      return;
    }
    _pollLogOnce = true;

    // URL 변경 감지 → 자동 warmup 재설정
    const currentUrl = getCurUrl();
    if (currentUrl !== _lastKnownUrl) {
      console.log('[교정기] 채팅방 변경 감지 → warmup 재설정');
      _lastKnownUrl = currentUrl;
      lastAssistantMsgId = null;
      lastMsgLength = 0;
      idleCount = 0;
      _needsWarmup = true;
    }

    const provider = getIgnitorProvider();
    if (!provider) return;

    let fetcher;
    try { fetcher = provider.getFetcher(); } catch (e) { return; }
    if (!fetcher || !fetcher.isValid()) return;

    try {
      const msgs = await fetchLogsFallback(5);
      if (!msgs || msgs.length === 0) return;

      const lastMsg = msgs[msgs.length - 1];
      const isAssistant = lastMsg && (
        lastMsg.role === 'assistant' || lastMsg.role === 'model' || lastMsg.role === 'bot'
      );
      if (!isAssistant) return;

      const msgId = lastMsg.message ? lastMsg.message.slice(0, 40) : '';

      // Warmup: 현재 메시지를 "이미 본 것"으로 등록하고 실제 처리는 안 함
      // (OFF→ON 전환 시 또는 채팅방 변경 시 자동 트리거)
      if (_needsWarmup) {
        console.log('[교정기] Warmup: 기존 메시지 스냅샷, 새 응답부터 감지 시작');
        lastAssistantMsgId = msgId;
        lastMsgLength = lastMsg.message.length;
        idleCount = 0;
        _needsWarmup = false;
        // fingerprint는 등록하지 않음 — warmup은 상태 스냅샷만 하고, 실제 dedup은 enqueueRefine에서
        return;
      }

      if (msgId !== lastAssistantMsgId) {
        console.log(`[교정기] 새 AI 응답 감지 (길이: ${lastMsg.message.length})`);
        showStatusBadge('AI 응답 수신 대기...');
        lastAssistantMsgId = msgId;
        lastMsgLength = lastMsg.message.length;
        idleCount = 0;
      } else {
        if (lastMsg.message.length === lastMsgLength && lastMsgLength > 0) {
          idleCount++;
          // 약 2초간 길이 변화 없으면 스트리밍 완료로 간주
          if (idleCount === 2) {
            console.log('[교정기] 스트리밍 완료 감지 → 큐에 추가');
            enqueueRefine(lastMsg.message);
            // idleCount를 리셋하지 않음 — 3, 4, 5...로 계속 올라가지만
            // === 2 체크는 다시 매치 안 됨. 새 메시지가 오면 0으로 초기화됨.
          }
        } else {
          lastMsgLength = lastMsg.message.length;
          idleCount = 0;
        }
      }
    } catch (e) {
      console.warn('[교정기] 감지 로직 에러:', e);
    }

    // 큐에 아이템이 남아있으면 주기적으로 처리 시도 (workerBusy 타임아웃 체크 포함)
    if (refineQueue.length > 0) processQueue();
  }, 1000);

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
      const provider = getIgnitorProvider();
      if (provider) {
        console.log('[교정기] ✅ 이그나이터 연결됨');
      } else {
        console.warn('[교정기] ⚠️ Ignitor 미감지. 로드 시 자동 연결됨.');
      }
    } catch (e) {
      console.error('[교정기] UI 에러:', e);
    }
  }, 500);

})();
