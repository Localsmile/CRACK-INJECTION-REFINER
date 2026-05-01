// ==UserScript==
// @name        크랙 유저노트 로어북
// @namespace   crack-usernote-lorebook
// @version     1.2.0
// @description 유저노트 로어북
// @author      로컴AI
// @match       https://crack.wrtn.ai/*
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.0.0/crack/libraries/crack-shared-core.js
// @grant       GM_addStyle
// @run-at      document-idle
// ==/UserScript==

(function(){
'use strict';

const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
if (_w.__NLB && typeof _w.__NLB === 'string') return;
_w.__NLB = '1.2.7';

// DB
let db;
try {
    db = new Dexie('nlb-lorebook-v4');
    db.version(1).stores({ entries: '++id,priority', templates: '++id,name,type' });
    db.open().catch(() => {});
} catch (e) { return; }

const _ls = _w.localStorage;
const CFG_DEF = { activeTemplateId: null, autoSwap: true, scanRange: 2 };
const NOTE_LIMIT = 2000;
const EXT_WARN_LIMIT = 500;
function loadCfg(cid){ try { const r = _ls.getItem('nlb4-cfg-' + cid); const cfg = r ? { ...CFG_DEF, ...JSON.parse(r) } : { ...CFG_DEF }; if (cfg.scanRange > 2) cfg.scanRange = 2; return cfg; } catch(e){ return { ...CFG_DEF }; } }
function saveCfg(cid, c){ try { _ls.setItem('nlb4-cfg-' + cid, JSON.stringify(c)); } catch(e){} }
function patchCfg(cid, patch){ const c = loadCfg(cid); Object.assign(c, patch); saveCfg(cid, c); return c; }

function getChatId(){
    try { if (typeof _w.__LoreCore !== 'undefined' && _w.__LoreCore.getCurrentChatId){ const o = _w.__LoreCore.getCurrentChatId(); if (o) return o; } } catch(e){}
    try { if (typeof CrackUtil !== 'undefined'){ const c = CrackUtil.path().chatRoom(); if (c) return c; } } catch(e){}
    const m = location.pathname.match(/\/(?:chats|episodes)\/[a-f0-9]+\/([a-f0-9]+)/);
    if (m) return m[1];
    const m2 = location.pathname.match(/\/(?:chats|episodes)\/([a-f0-9]+)/);
    if (m2) return m2[1];
    return null;
}

// 토큰 캐쳐 — fetch 후킹
let _capturedToken = '';
const _origFetch = _w.fetch;
_w.fetch = async function(...a){
    try {
        const u = typeof a[0] === 'string' ? a[0] : a[0]?.url || '';
        if (u.includes('crack-api.wrtn.ai') || u.includes('contents-api.wrtn.ai')){
            const h = a[1]?.headers || {};
            let t = '';
            if (h instanceof Headers) t = h.get('Authorization') || h.get('authorization') || '';
            else t = h['Authorization'] || h['authorization'] || '';
            if (t) _capturedToken = t.replace('Bearer ', '');
        }
    } catch(e){}
    return _origFetch.apply(this, a);
};

function getToken(){
    try { if (typeof CrackUtil !== 'undefined'){ const t = CrackUtil.cookie().getAuthToken(); if (t) return t; } } catch(e){}
    return _capturedToken;
}

async function fetchLogs(chatId, n){
    if (!chatId) return [];
    try {
        if (typeof CrackUtil === 'undefined') return [];
        const items = await CrackUtil.chatRoom().extractLogs(chatId, { maxCount: n });
        if (items instanceof Error || !Array.isArray(items)) return [];
        return items.map(m => ({ role: m.role, message: m.content || '' }));
    } catch(e){ return []; }
}

function norm(s){ return (s || '').normalize('NFC').toLowerCase(); }
function matchTriggers(text, triggers){
    if (!triggers || !triggers.length) return false;
    const low = norm(text);
    for (const t of triggers){
        const parts = t.split('&&').map(p => norm(p.trim())).filter(Boolean);
        if (parts.length && parts.every(p => low.includes(p))) return true;
    }
    return false;
}

function getTurn(c){ return parseInt(_ls.getItem('nlb4-turn-' + c) || '0'); }
function incTurn(c){ const n = getTurn(c) + 1; _ls.setItem('nlb4-turn-' + c, String(n)); return n; }
function loadHolds(c){ try { return JSON.parse(_ls.getItem('nlb4-hold-' + c) || '{}'); } catch(e){ return {}; } }
function saveHolds(c, h){ _ls.setItem('nlb4-hold-' + c, JSON.stringify(h)); }
function setHold(c, eid, dur){ const h = loadHolds(c); h[eid] = getTurn(c) + dur; saveHolds(c, h); }
function isHeld(c, eid){ const h = loadHolds(c); return !!(h[eid] && h[eid] > getTurn(c)); }
function holdLeft(c, eid){ const h = loadHolds(c); return h[eid] ? Math.max(0, h[eid] - getTurn(c)) : 0; }
function cleanHolds(c){ const h = loadHolds(c); const t = getTurn(c); let ch = false; for (const k in h) if (h[k] <= t){ delete h[k]; ch = true; } if (ch) saveHolds(c, h); }

const cLen = s => [...(s || '')].length;

// 노트 빌드 — 단일 템플릿 기준
async function buildNote(chatId, userInput){
    const cfg = loadCfg(chatId);
    const budget = NOTE_LIMIT;
    const tpl = cfg.activeTemplateId ? await db.templates.get(cfg.activeTemplateId) : null;

    if (!tpl) return { note: '', included: [], skipped: [], chars: 0, budget, isExtend: true, alwaysChars: 0, templateType: null, tplId: null };

    if (tpl.type === 'preset'){
        const text = tpl.presetContent || '';
        const cut = [...text].slice(0, budget).join('');
        return { note: cut, included: [], skipped: [], chars: cLen(cut), budget, isExtend: true, alwaysChars: 0, templateType: 'preset', tplId: tpl.id };
    }

    const alwaysText = tpl.alwaysContent || '';
    const entries = (await db.entries.bulkGet(tpl.entryIds || [])).filter(e => e && e.enabled !== false);

    let scanText = userInput || '';
    if (cfg.scanRange > 0){
        // 직전 N개 메시지만 스캔. 기본 2 = 직전 유저 발화 + 직전 AI 발화. 키워드가 그 범위 밖으로 나가면 트리거 빠짐 (유지 턴 0 기준)
        const logs = await fetchLogs(chatId, cfg.scanRange);
        scanText += ' ' + logs.map(m => m.message || '').join(' ');
    }

    cleanHolds(chatId);
    const held = entries.filter(e => isHeld(chatId, e.id));
    const heldSet = new Set(held.map(e => e.id));
    const fresh = entries.filter(e => !heldSet.has(e.id) && matchTriggers(scanText, e.triggers));
    for (const e of fresh){ if (e.holdTurns > 0) setHold(chatId, e.id, e.holdTurns); }
    // 매칭된 모든 트리거를 우선순위 순으로 추가. 한도 초과 시 후순위는 공간부족으로 제외
    const candidates = [...held, ...fresh].sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const alwaysNote = [...alwaysText].slice(0, budget).join('');
    let note = alwaysNote;
    let rem = budget - cLen(alwaysNote);
    const included = [], skipped = [];
    if (cLen(alwaysText) > budget) skipped.push({ id: 'always', name: '상시 로어', reason: 'budget' });
    for (const e of candidates){
        const ct = e.content || '';
        const need = cLen(ct) + (note.length ? 1 : 0);
        const reason = heldSet.has(e.id) ? 'hold' : 'trigger';
        if (need > rem){
            skipped.push({ id: e.id, name: e.name, reason: 'budget' });
        } else {
            note += (note.length ? '\n' : '') + ct;
            rem -= need;
            included.push({ id: e.id, name: e.name, reason });
        }
    }

    return { note, included, skipped, chars: cLen(note), budget, isExtend: true, alwaysChars: cLen(alwaysText), templateType: 'lorebook', tplId: tpl.id };
}

async function patchNoteAPI(chatId, content){
    const token = getToken();
    if (!token) return false;
    try {
        const url = 'https://crack-api.wrtn.ai/crack-gen/v3/chats/' + chatId;
        const r = await _origFetch(url, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userNote: { content, isExtend: true } })
        });
        return r.ok;
    } catch(e){ return false; }
}

function writeTextarea(area, text){
    if (area.value === text) return;
    area.value = text;
    for (const key of Object.keys(area)){
        if (key.startsWith('__reactProps')){
            try { area[key].onChange({ target: { value: text } }); } catch(e){}
            break;
        }
    }
}

const _cache = { note: null, key: null };
let _swapping = false;
function invalidateCache(){ _cache.note = null; _cache.key = null; }

async function doSwap(userInput){
    if (_swapping) return;
    const cid = getChatId(); if (!cid) return;
    const cfg = loadCfg(cid);
    const tpl = cfg.activeTemplateId ? await db.templates.get(cfg.activeTemplateId) : null;
    if (!tpl) return;
    if (tpl.type === 'lorebook' && !cfg.autoSwap) return;

    _swapping = true;
    try {
        incTurn(cid);
        const r = await buildNote(cid, userInput);
        const key = cid + ':' + r.budget + ':' + (r.tplId || 'none');
        if (r.note === _cache.note && key === _cache.key){ _swapping = false; return; }
        const ok = await patchNoteAPI(cid, r.note);
        if (ok){ _cache.note = r.note; _cache.key = key; }
        _w.dispatchEvent(new CustomEvent('nlb:swapped', { detail: r }));
    } catch(e){}
    _swapping = false;
}

// WS 송신 후킹 — 유저 입력
const _origSend = _w.WebSocket.prototype.send;
_w.WebSocket.prototype.send = function(data){
    const ws = this;
    if (typeof data === 'string' && data.length > 10){
        if (!_capturedToken && data.startsWith('40')){
            const ji = data.indexOf('{');
            if (ji > 0){
                try {
                    const obj = JSON.parse(data.slice(ji));
                    if (obj && typeof obj.token === 'string') _capturedToken = obj.token.replace('Bearer ', '');
                } catch(e){}
            }
        }
        const bi = data.indexOf('[');
        if (bi > 0){
            try {
                const arr = JSON.parse(data.slice(bi));
                if (Array.isArray(arr) && arr[0] === 'send' && arr[1] && typeof arr[1].message === 'string' && arr[1].message.length > 0){
                    const msg = arr[1].message;
                    (async () => { try { await doSwap(msg); } catch(e){} _origSend.call(ws, data); })();
                    return;
                }
            } catch(e){}
        }
    }
    return _origSend.call(this, data);
};

// WS 수신 후킹 — AI 발화 (디바운스 후 다음 턴 스숼 재빌드)
let _aiDebounce = null;
function handleSocketIn(data){
    if (typeof data !== 'string') return;
    if (data.length < 4) return;
    if (data[0] !== '4' && data[0] !== '2') return;
    if (!/"(role|content|message|chunk|stream|delta|assistant|character|reply|response|finish)/.test(data)) return;
    clearTimeout(_aiDebounce);
    _aiDebounce = setTimeout(() => { try { doSwap(''); } catch(_){} }, 700);
}

const _origWSAEL = _w.WebSocket.prototype.addEventListener;
_w.WebSocket.prototype.addEventListener = function(type, listener, opts){
    if (type === 'message' && typeof listener === 'function'){
        const wrapped = function(ev){
            try { handleSocketIn(ev && ev.data); } catch(_){}
            return listener.apply(this, arguments);
        };
        return _origWSAEL.call(this, type, wrapped, opts);
    }
    return _origWSAEL.apply(this, arguments);
};

try {
    const omDesc = Object.getOwnPropertyDescriptor(_w.WebSocket.prototype, 'onmessage');
    if (omDesc && omDesc.set){
        Object.defineProperty(_w.WebSocket.prototype, 'onmessage', {
            configurable: true, enumerable: true,
            get(){ return omDesc.get.call(this); },
            set(fn){
                if (typeof fn === 'function'){
                    const wrapped = function(ev){
                        try { handleSocketIn(ev && ev.data); } catch(_){}
                        return fn.apply(this, arguments);
                    };
                    return omDesc.set.call(this, wrapped);
                }
                return omDesc.set.call(this, fn);
            }
        });
    }
} catch(e){}

GM_addStyle(`.nlb-root { margin-top: 14px; padding: 12px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: rgba(255,255,255,0.02); font-size: 13px; color: inherit; max-height: min(78vh, var(--nlb-panel-max, 720px)); overflow-y: auto; overscroll-behavior: contain; } .nlb-root * { box-sizing: border-box; } .nlb-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; } .nlb-bar-title { font-weight: 600; display: flex; align-items: baseline; gap: 6px; flex: 1; min-width: 0; } .nlb-bar-title .tplname { font-weight: 400; opacity: 0.6; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nlb-btn { padding: 5px 11px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: inherit; font-size: 12px; cursor: pointer; font-family: inherit; line-height: 1.3; } .nlb-btn:hover { background: rgba(255,255,255,0.08); } .nlb-btn-pri { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.22); } .nlb-btn-pri:hover { background: rgba(255,255,255,0.2); } .nlb-btn-danger:hover { background: rgba(220,80,80,0.15); border-color: rgba(220,80,80,0.35); } .nlb-input, .nlb-textarea { width: 100%; padding: 7px 9px; border: 1px solid rgba(255,255,255,0.12); border-radius: 5px; background: rgba(0,0,0,0.25); color: inherit; font-size: 13px; font-family: inherit; } .nlb-input:focus, .nlb-textarea:focus { outline: none; border-color: rgba(255,255,255,0.3); } .nlb-textarea { resize: vertical; min-height: 100px; line-height: 1.5; } .nlb-textarea.large { min-height: 160px; } .nlb-sec { margin-bottom: 12px; } .nlb-sec-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; } .nlb-sec-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; opacity: 0.65; flex: 1; } .nlb-entry { padding: 0; margin-bottom: 5px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 5px; overflow: hidden; } .nlb-entry-head { padding: 8px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; } .nlb-entry-head:hover { background: rgba(255,255,255,0.03); } .nlb-entry-caret { font-size: 10px; opacity: 0.6; width: 10px; flex-shrink: 0; transition: transform .15s; } .nlb-entry.open .nlb-entry-caret { transform: rotate(90deg); } .nlb-entry-name { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nlb-entry-meta { font-size: 11px; opacity: 0.55; } .nlb-entry-body { display: none; padding: 0 10px 10px; border-top: 1px dashed rgba(255,255,255,0.08); } .nlb-entry.open .nlb-entry-body { display: block; padding-top: 8px; } .nlb-entry-body > * + * { margin-top: 6px; } .nlb-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .nlb-row label { font-size: 12px; opacity: 0.7; } .nlb-status { font-size: 12px; opacity: 0.75; padding: 0 0 8px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 10px; line-height: 1.6; } .nlb-status .hl { font-weight: 600; opacity: 1; } .nlb-status .warn { color: #e8b86e; display: block; margin-top: 4px; } .nlb-status .over { color: #e57373; display: block; margin-top: 4px; } .nlb-status .need-ext { color: #e8b86e; display: block; margin-top: 4px; } .nlb-charline { font-size: 11px; opacity: 0.62; line-height: 1.4; } .nlb-charline.over { color: #e57373; opacity: 0.95; } .nlb-charline.need-ext { color: #e8b86e; opacity: 0.95; } .nlb-toggle { position: relative; width: 32px; height: 18px; display: inline-block; flex-shrink: 0; } .nlb-toggle input { opacity: 0; width: 0; height: 0; } .nlb-toggle-sl { position: absolute; inset: 0; background: rgba(255,255,255,0.15); border-radius: 9px; cursor: pointer; transition: .15s; } .nlb-toggle-sl:before { content: ''; position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #fff; left: 2px; top: 2px; transition: .15s; } .nlb-toggle input:checked + .nlb-toggle-sl { background: rgba(120,200,140,0.6); } .nlb-toggle input:checked + .nlb-toggle-sl:before { left: 16px; } .nlb-tabs { display: flex; gap: 2px; margin: 0 -10px 8px; padding: 0 10px; border-bottom: 1px solid rgba(255,255,255,0.08); } .nlb-tab { padding: 7px 12px; font-size: 12px; cursor: pointer; border: none; background: transparent; color: inherit; border-bottom: 2px solid transparent; opacity: 0.55; font-family: inherit; } .nlb-tab:hover { opacity: 0.85; } .nlb-tab.active { opacity: 1; border-bottom-color: rgba(255,255,255,0.5); } .nlb-tpl-pop { position: fixed; z-index: 2147483647; pointer-events: auto; background: #1a1a22; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 0 10px 10px; width: 320px; max-width: calc(100vw - 24px); max-height: min(70vh, 560px); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; box-shadow: 0 8px 32px rgba(0,0,0,0.6); color: #eee; } .nlb-tpl-create { position: sticky; bottom: 0; background: #1a1a22; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; z-index: 1; } .nlb-tpl-pop.nlb-pop-mobile { left: 12px !important; right: 12px; top: auto !important; bottom: 12px !important; width: auto; max-width: none; max-height: 70vh; } .nlb-pop-head { position: sticky; top: 0; margin: 0 -10px 8px; padding: 8px 10px; background: #1a1a22; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 8px; z-index: 1; } .nlb-pop-head-title { flex: 1; font-size: 12px; font-weight: 600; opacity: 0.8; } .nlb-pop-close { width: 26px; height: 26px; padding: 0; font-size: 16px; line-height: 1; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; } .nlb-pop-close:hover { background: rgba(255,255,255,0.1); } .nlb-tpl-group { margin-bottom: 10px; } .nlb-tpl-item { padding: 6px 8px; font-size: 13px; display: flex; gap: 6px; align-items: center; border-radius: 4px; flex-wrap: wrap; } .nlb-tpl-item:hover { background: rgba(255,255,255,0.05); } .nlb-tpl-item.active { background: rgba(255,255,255,0.1); } .nlb-tpl-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } @media (max-width: 640px){ .nlb-entry-name { font-size: 14px; } .nlb-btn { padding: 7px 12px; font-size: 13px; } .nlb-tpl-item { padding: 8px; } .nlb-tpl-name { flex-basis: 100%; margin-bottom: 4px; } }`);

function h(tag, attr, ...ch){
    const el = document.createElement(tag);
    if (attr) for (const [k, v] of Object.entries(attr)){
        if (k.startsWith('on')) el[k] = v;
        else if (k === 'cls') el.className = v;
        else if (v !== null && v !== undefined) el.setAttribute(k, v);
    }
    for (const c of ch){
        if (c == null) continue;
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else el.appendChild(c);
    }
    return el;
}
function tog(checked, onChange){
    const wrap = h('label', { cls: 'nlb-toggle' });
    const inp = h('input', { type: 'checkbox' });
    inp.checked = !!checked;
    inp.onchange = () => onChange(inp.checked);
    wrap.appendChild(inp);
    wrap.appendChild(h('span', { cls: 'nlb-toggle-sl' }));
    return wrap;
}
// 모달 탐지 — dialog 조상을 가지는 maxlength 500|2000 textarea
function findModal(){
    const tas = document.querySelectorAll('textarea');
    for (const ta of tas){
        if (!ta.offsetParent) continue;
        if (ta.maxLength !== 500 && ta.maxLength !== 2000) continue;
        const dialog = ta.closest('[role="dialog"], [aria-modal="true"]');
        if (dialog) return dialog;
    }
    return null;
}

function findComposer(){
    const modal = findModal();
    const cands = [...document.querySelectorAll('textarea, [contenteditable="true"]')];
    const vh = window.innerHeight;
    let best = null, bestDist = Infinity;
    for (const el of cands){
        if (modal && modal.contains(el)) continue;
        if (el === ctx.platformTa) continue;
        if (!el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20) continue;
        const dist = Math.abs(vh - r.bottom);
        if (dist < bestDist){ best = el; bestDist = dist; }
    }
    return best;
}
function readComposer(){ const c = findComposer(); if (!c) return ''; return c.value !== undefined ? c.value : (c.textContent || ''); }

function currentBudget(){ return NOTE_LIMIT; }
function releaseLimit(ta){
    if (!ta) return;
    try { ta.removeAttribute('maxlength'); } catch(e){}
}
function applyLimits(){
    if (!ctx.root) return;
    releaseLimit(ctx.alwaysTa);
    releaseLimit(ctx.presetTa);
    if (ctx.trigSection){
        for (const card of ctx.trigSection.children){
            releaseLimit(card.querySelector('textarea.nlb-textarea'));
        }
    }
    refreshAllCardCounts();
}

// 렌더 토큰 + 디스포저 — 템플릿 독립성 보장
let _renderToken = 0;
let _disposers = [];
let _pendingDebounces = new Set();
function cleanupPanel(){
    for (const t of _pendingDebounces){ try { clearTimeout(t); } catch(_){} }
    _pendingDebounces.clear();
    while (_disposers.length){ try { _disposers.pop()(); } catch(_){} }
}
function tokenDebounce(fn, ms, token){
    let t;
    return (...a) => {
        clearTimeout(t);
        _pendingDebounces.delete(t);
        t = setTimeout(() => {
            _pendingDebounces.delete(t);
            if (token !== _renderToken) return;
            fn(...a);
        }, ms);
        _pendingDebounces.add(t);
    };
}

const ctx = { root: null, chatId: null, trigSection: null, platformTa: null, alwaysTa: null, presetTa: null, token: 0 };

async function renderPanel(root, chatId){
    cleanupPanel();
    invalidateCache();
    const token = ++_renderToken;
    ctx.token = token;
    root.innerHTML = '';
    ctx.root = root; ctx.chatId = chatId; ctx.trigSection = null; ctx.alwaysTa = null; ctx.presetTa = null;

    const cfg = loadCfg(chatId);
    const tpl = cfg.activeTemplateId ? await db.templates.get(cfg.activeTemplateId) : null;
    if (token !== _renderToken) return;

    const bar = h('div', { cls: 'nlb-bar' });
    const title = h('div', { cls: 'nlb-bar-title' });
    title.appendChild(h('span', {}, '로어북'));
    title.appendChild(h('span', { cls: 'tplname' }, tpl ? '· ' + tpl.name + ' (' + (tpl.type === 'preset' ? '프리셋' : '로어북') + ')' : '· 선택 안 됨'));
    bar.appendChild(title);
    bar.appendChild(h('button', { cls: 'nlb-btn', onclick: (e) => openTplPop(e.currentTarget) }, '템플릿'));
    bar.appendChild(h('button', { cls: 'nlb-btn', onclick: (e) => openHelpPop(e.currentTarget) }, '도움말'));
    if (tpl && tpl.type === 'lorebook'){
        const autoWrap = h('span', { cls: 'nlb-row' });
        autoWrap.appendChild(h('label', {}, '자동'));
        autoWrap.appendChild(tog(cfg.autoSwap, v => patchCfg(chatId, { autoSwap: v })));
        bar.appendChild(autoWrap);
    }
    root.appendChild(bar);

    const status = h('div', { cls: 'nlb-status', id: 'nlb-status' });
    root.appendChild(status);

    if (!tpl){
        status.textContent = '활성 템플릿 없음. [템플릿]에서 선택 또는 생성.';
        mirrorToPlatform();
        return;
    }
    if (tpl.type === 'preset'){ renderPreset(tpl, token); mirrorToPlatform(); return; }

    const alwaysSec = h('div', { cls: 'nlb-sec' });
    alwaysSec.appendChild(h('div', { cls: 'nlb-sec-title' }, '상시 로어'));
    const alwaysTa = h('textarea', { cls: 'nlb-textarea', placeholder: '항상 상단에 들어갈 내용' });
    alwaysTa.value = tpl.alwaysContent || '';
    ctx.alwaysTa = alwaysTa;
    const saveAlways = tokenDebounce(async (v) => {
        await db.templates.update(tpl.id, { alwaysContent: v });
        if (token !== _renderToken) return;
        invalidateCache();
        updateStatus();
    }, 250, token);
    const liveAlways = tokenDebounce(() => { if (token === _renderToken) updateStatus(); }, 80, token);
    alwaysTa.oninput = () => { saveAlways(alwaysTa.value); liveAlways(); applyLimits(); };
    alwaysSec.appendChild(alwaysTa);
    root.appendChild(alwaysSec);

    const trigSec = h('div', { cls: 'nlb-sec' });
    const head = h('div', { cls: 'nlb-sec-head' });
    head.appendChild(h('div', { cls: 'nlb-sec-title' }, '트리거 로어'));
    head.appendChild(h('button', { cls: 'nlb-btn', onclick: () => addEntry(tpl, token) }, '추가'));
    trigSec.appendChild(head);
    const trigList = h('div', { cls: 'nlb-trig-list' });
    const entries = (await db.entries.bulkGet(tpl.entryIds || [])).filter(Boolean).sort((a, b) => (a.priority || 999) - (b.priority || 999));
    if (token !== _renderToken) return;
    if (!entries.length) trigList.appendChild(emptyNote());
    for (const e of entries) trigList.appendChild(renderCard(e, tpl, token));
    trigSec.appendChild(trigList);
    ctx.trigSection = trigList;
    root.appendChild(trigSec);

    updateStatus();
    applyLimits();
}

function emptyNote(){ return h('div', { cls: 'nlb-trig-empty', style: 'font-size:12px;opacity:0.5;padding:4px 0' }, '없음'); }

function renderPreset(tpl, token){
    const sec = h('div', { cls: 'nlb-sec' });
    sec.appendChild(h('div', { cls: 'nlb-sec-title' }, '프리셋 내용'));
    const ta = h('textarea', { cls: 'nlb-textarea large', placeholder: '그대로 주입될 내용' });
    ta.value = tpl.presetContent || '';
    ctx.presetTa = ta;
    const save = tokenDebounce(async (v) => {
        await db.templates.update(tpl.id, { presetContent: v });
        if (token !== _renderToken) return;
        invalidateCache();
        updateStatus();
    }, 250, token);
    const live = tokenDebounce(() => { if (token === _renderToken) updateStatus(); }, 80, token);
    ta.oninput = () => { save(ta.value); live(); applyLimits(); };
    sec.appendChild(ta);
    ctx.root.appendChild(sec);
    updateStatus();
}

function renderCard(e, tpl, token){
    const card = h('div', { cls: 'nlb-entry' });
    card._entryId = e.id;
    const head = h('div', { cls: 'nlb-entry-head' });
    head.appendChild(h('span', { cls: 'nlb-entry-caret' }, '>'));
    head.appendChild(tog(e.enabled !== false, async (v) => {
        await db.entries.update(e.id, { enabled: v });
        if (token !== _renderToken) return;
        invalidateCache();
        updateStatus();
    }));
    head.appendChild(h('span', { cls: 'nlb-entry-name' }, e.name || '이름 없음'));
    const metaEl = h('span', { cls: 'nlb-entry-meta' }, buildMeta(e));
    head.appendChild(metaEl);
    head.appendChild(h('button', { cls: 'nlb-btn nlb-btn-danger', onclick: (ev) => { ev.stopPropagation(); deleteEntry(e, tpl, card, token); } }, '삭제'));
    head.onclick = (ev) => { if (ev.target.closest('button, input, label')) return; card.classList.toggle('open'); };
    card.appendChild(head);

    const body = h('div', { cls: 'nlb-entry-body' });
    const nameInp = h('input', { cls: 'nlb-input', placeholder: '이름', value: e.name || '' });
    const trigInp = h('input', { cls: 'nlb-input', placeholder: '키워드 (쉼표 OR, && AND)', value: (e.triggers || []).join(', ') });
    const contTa = h('textarea', { cls: 'nlb-textarea', placeholder: '삽입될 내용' });
    contTa.value = e.content || '';
    const charLine = h('div', { cls: 'nlb-charline' });
    const metaRow = h('div', { cls: 'nlb-row' });
    metaRow.appendChild(h('label', {}, '우선순위'));
    const prioInp = h('input', { cls: 'nlb-input', type: 'number', min: '1', value: String(e.priority || 1), style: 'width:70px' });
    metaRow.appendChild(prioInp);
    metaRow.appendChild(h('label', {}, '유지 턴'));
    const holdInp = h('input', { cls: 'nlb-input', type: 'number', min: '0', value: String(e.holdTurns || 0), style: 'width:70px' });
    metaRow.appendChild(holdInp);

    const saveNow = async () => {
        const patch = {
            name: nameInp.value.trim() || '이름 없음',
            triggers: trigInp.value.split(',').map(s => s.trim()).filter(Boolean),
            content: contTa.value,
            priority: parseInt(prioInp.value) || 1,
            holdTurns: parseInt(holdInp.value) || 0
        };
        await db.entries.update(e.id, patch);
        if (token !== _renderToken) return;
        Object.assign(e, patch);
        head.querySelector('.nlb-entry-name').textContent = patch.name;
        metaEl.textContent = buildMeta(e);
        invalidateCache();
        updateStatus();
    };
    const saveDeb = tokenDebounce(saveNow, 300, token);
    const liveMeta = tokenDebounce(() => {
        if (token !== _renderToken) return;
        const draft = { ...e, content: contTa.value, priority: parseInt(prioInp.value) || 1, holdTurns: parseInt(holdInp.value) || 0 };
        metaEl.textContent = buildMeta(draft);
        refreshCardCharLine(card);
        updateStatus();
    }, 80, token);
    [nameInp, trigInp, contTa, prioInp, holdInp].forEach(el => {
        el.addEventListener('input', () => { saveDeb(); liveMeta(); applyLimits(); });
        el.addEventListener('blur', saveNow);
    });

    body.appendChild(nameInp); body.appendChild(trigInp); body.appendChild(contTa); body.appendChild(charLine); body.appendChild(metaRow);
    refreshCardCharLine(card);
    card.appendChild(body);
    return card;
}

function buildMeta(e){
    const parts = [cLen(e.content || '') + '자'];
    parts.push('우선 ' + (e.priority || 1));
    if (e.holdTurns > 0) parts.push('유지 ' + e.holdTurns + '턴');
    if (ctx.chatId){ const left = holdLeft(ctx.chatId, e.id); if (left > 0) parts.push('잔여 ' + left + '턴'); }
    return parts.join(' · ');
}

function buildCardCharText(text){
    const len = cLen(text || '');
    const budget = NOTE_LIMIT;
    const always = ctx.alwaysTa ? cLen(ctx.alwaysTa.value) : 0;
    const avail = Math.max(0, budget - always);
    let msg = '내용 ' + len + '자 / 트리거 가용 ' + avail + '자';
    if (len > avail) msg += ' · 2천자 한도 초과';
    else if (always + len > EXT_WARN_LIMIT) msg += ' · 확장 필요';
    return { msg, over: len > avail, needExt: always + len > EXT_WARN_LIMIT };
}

function refreshCardCharLine(card){
    if (!card) return;
    const line = card.querySelector('.nlb-charline');
    const ta = card.querySelector('textarea.nlb-textarea');
    if (!line || !ta) return;
    const r = buildCardCharText(ta.value);
    line.textContent = r.msg;
    line.classList.toggle('over', r.over);
    line.classList.toggle('need-ext', r.needExt && !r.over);
}

function refreshAllCardCounts(){
    if (!ctx.trigSection) return;
    for (const card of ctx.trigSection.querySelectorAll('.nlb-entry')) refreshCardCharLine(card);
}

async function getTemplateDemand(chatId){
    const cfg = loadCfg(chatId);
    const tpl = cfg.activeTemplateId ? await db.templates.get(cfg.activeTemplateId) : null;
    if (!tpl) return { rawChars: 0, type: null };
    if (tpl.type === 'preset') return { rawChars: cLen(tpl.presetContent || ''), type: 'preset' };
    const entries = (await db.entries.bulkGet(tpl.entryIds || [])).filter(e => e && e.enabled !== false);
    // 상시 + 모든 활성 트리거 내용 합계
    const sumEntries = entries.reduce((sum, e) => sum + cLen(e.content || ''), 0);
    const rawChars = cLen(tpl.alwaysContent || '') + sumEntries;
    return { rawChars, type: 'lorebook' };
}

function appendBudgetWarnings(statusEl, demand){
    if (!demand || !demand.rawChars) return;
    const label = demand.type === 'preset' ? '프리셋 ' + demand.rawChars + '자' : '상시+트리거 ' + demand.rawChars + '자';
    if (demand.rawChars > NOTE_LIMIT){
        statusEl.appendChild(h('span', { cls: 'over' }, label + ' · 2천자 초과. 전송값은 잘리고 저장본은 보존.'));
    } else if (demand.rawChars > EXT_WARN_LIMIT){
        statusEl.appendChild(h('span', { cls: 'need-ext' }, label + ' · 유저노트 확장 필요.'));
    }
}

async function addEntry(tpl, token){
    const existing = (await db.entries.bulkGet(tpl.entryIds || [])).filter(Boolean);
    if (token !== _renderToken) return;
    const nextPrio = existing.length ? Math.max(...existing.map(e => e.priority || 1)) + 1 : 1;
    const id = await db.entries.add({ name: '새 로어', triggers: [], content: '', priority: nextPrio, holdTurns: 0, enabled: true });
    const newEntry = await db.entries.get(id);
    const freshTpl = await db.templates.get(tpl.id);
    const nextIds = [...((freshTpl && freshTpl.entryIds) || []), id];
    await db.templates.update(tpl.id, { entryIds: nextIds });
    tpl.entryIds = nextIds;
    if (token !== _renderToken) return;
    const list = ctx.trigSection;
    if (list){
        const empty = list.querySelector('.nlb-trig-empty'); if (empty) empty.remove();
        const card = renderCard(newEntry, tpl, token); card.classList.add('open'); list.appendChild(card);
        const nameInp = card.querySelector('input.nlb-input'); if (nameInp){ nameInp.focus(); nameInp.select(); }
        list.scrollTop = list.scrollHeight;
    }
    invalidateCache();
    updateStatus();
}

async function deleteEntry(e, tpl, cardEl, token){
    if (!confirm((e.name || '이름 없음') + ' 삭제?')) return;
    await db.entries.delete(e.id);
    await db.templates.update(tpl.id, { entryIds: (tpl.entryIds || []).filter(x => x !== e.id) });
    if (token !== _renderToken) return;
    const list = ctx.trigSection;
    cardEl.remove();
    if (list && !list.children.length) list.appendChild(emptyNote());
    invalidateCache();
    updateStatus();
}

async function updateStatus(){
    const statusEl = ctx.root && ctx.root.querySelector('#nlb-status');
    await mirrorToPlatform();
    if (!statusEl) return;
    if (!ctx.chatId) return;
    const r = await buildNote(ctx.chatId, readComposer());
    const demand = await getTemplateDemand(ctx.chatId);
    refreshAllCardCounts();
    statusEl.innerHTML = '';
    if (r.templateType !== 'lorebook'){
        if (r.templateType === 'preset'){
            statusEl.appendChild(h('div', {}, '프리셋 ', h('span', { cls: 'hl' }, demand.rawChars + '자'), ' / ', h('span', { cls: 'hl' }, r.budget + '자 한도')));
            appendBudgetWarnings(statusEl, demand);
        }
        return;
    }
    const remain = r.budget - r.alwaysChars;
    const l1 = h('div', {}, '상시 ', h('span', { cls: 'hl' }, r.alwaysChars + '자'), ' / ', h('span', { cls: 'hl' }, r.budget + '자 한도'));
    const l2 = h('div', {}, '트리거 가용 ', h('span', { cls: 'hl' }, Math.max(0, remain) + '자'), ' · 현재 매칭 ', h('span', { cls: 'hl' }, String(r.included.length)));
    statusEl.appendChild(l1); statusEl.appendChild(l2);
    if (remain < 0) statusEl.appendChild(h('span', { cls: 'over' }, '한도 초과. 상시가 ' + (-remain) + '자 넘침'));
    if (r.skipped.length) statusEl.appendChild(h('span', { cls: 'warn' }, '공간부족 제외: ' + r.skipped.map(s => s.name).join(', ')));
    appendBudgetWarnings(statusEl, demand);
}

async function mirrorToPlatform(){
    if (!ctx.chatId) return;
    const modal = findModal(); if (!modal) return;
    const ta = modal.querySelector('textarea'); if (!ta) return;
    const r = await buildNote(ctx.chatId, readComposer());
    writeTextarea(ta, r.note);
}

// 팝오버 공통 — dialog 내부에 append + Radix 방어
function mountPopover(pop, anchor, isMobile){
    const _dlg = ctx.root && ctx.root.closest('[role="dialog"], [aria-modal="true"]');
    const _host = _dlg || document.body;
    if (_dlg && !isMobile){
        const mr = _dlg.getBoundingClientRect();
        pop.style.top = ((parseFloat(pop.style.top) || 0) - mr.top) + 'px';
        pop.style.left = ((parseFloat(pop.style.left) || 0) - mr.left) + 'px';
    }
    pop.addEventListener('pointerdown', e => e.stopPropagation(), true);
    pop.addEventListener('mousedown', e => e.stopPropagation(), true);
    pop.addEventListener('focusin', e => e.stopPropagation(), true);
    pop.addEventListener('focusout', e => e.stopPropagation(), true);
    _host.appendChild(pop); _pop = pop;
    setTimeout(() => {
        const off = (e) => {
            if (!pop.contains(e.target) && e.target !== anchor){
                pop.remove(); _pop = null;
                document.removeEventListener('click', off);
                document.removeEventListener('touchend', off);
            }
        };
        document.addEventListener('click', off);
        document.addEventListener('touchend', off);
    }, 0);
}

let _pop = null;
function loadTabPref(){ return _ls.getItem('nlb4-tplpop-tab') || 'lorebook'; }
function saveTabPref(v){ try { _ls.setItem('nlb4-tplpop-tab', v); } catch(_){} }

async function openTplPop(anchor){
    if (_pop){ _pop.remove(); _pop = null; return; }
    const rect = anchor.getBoundingClientRect();
    const isMobile = window.innerWidth <= 640;
    const pop = h('div', { cls: 'nlb-tpl-pop' + (isMobile ? ' nlb-pop-mobile' : '') });
    if (!isMobile){
        pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 400) + 'px';
        pop.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';
    }
    const head = h('div', { cls: 'nlb-pop-head' });
    head.appendChild(h('span', { cls: 'nlb-pop-head-title' }, '템플릿'));
    head.appendChild(h('button', { cls: 'nlb-pop-close', title: '닫기', onclick: () => { pop.remove(); _pop = null; } }, '×'));
    pop.appendChild(head);

    let tab = loadTabPref();
    if (tab !== 'lorebook' && tab !== 'preset') tab = 'lorebook';

    const tabs = h('div', { cls: 'nlb-tabs' });
    const body = h('div', { cls: 'nlb-tpl-body' });
    const tabBtn = (key, label) => {
        const b = h('button', { cls: 'nlb-tab' + (tab === key ? ' active' : ''), onclick: () => { tab = key; saveTabPref(tab); renderBody(); for (const c of tabs.children) c.classList.toggle('active', c._key === key); } }, label);
        b._key = key;
        return b;
    };
    tabs.appendChild(tabBtn('lorebook', '로어북'));
    tabs.appendChild(tabBtn('preset', '프리셋'));
    pop.appendChild(tabs);
    pop.appendChild(body);

    async function renderBody(){
        body.innerHTML = '';
        const cfg = loadCfg(ctx.chatId);
        const tpls = await db.templates.toArray();
        const list = tpls.filter(t => (tab === 'preset' ? t.type === 'preset' : t.type !== 'preset'));

        const group = h('div', { cls: 'nlb-tpl-group' });
        if (!list.length) group.appendChild(h('div', { style: 'font-size:12px;opacity:0.5;padding:4px 0' }, '없음'));
        for (const t of list){
            const item = h('div', { cls: 'nlb-tpl-item' + (t.id === cfg.activeTemplateId ? ' active' : '') });
            item.appendChild(h('span', { cls: 'nlb-tpl-name' }, t.name));
            item.appendChild(h('button', { cls: 'nlb-btn', onclick: () => { patchCfg(ctx.chatId, { activeTemplateId: t.id }); pop.remove(); _pop = null; renderPanel(ctx.root, ctx.chatId); } }, '적용'));
            item.appendChild(h('button', { cls: 'nlb-btn', onclick: async () => {
                const nm = prompt('새 이름', t.name); if (!nm || !nm.trim()) return;
                await db.templates.update(t.id, { name: nm.trim() });
                if (cfg.activeTemplateId === t.id) renderPanel(ctx.root, ctx.chatId);
                renderBody();
            } }, '이름'));
            item.appendChild(h('button', { cls: 'nlb-btn nlb-btn-danger', onclick: async () => {
                if (!confirm(t.name + ' 삭제?')) return;
                await db.templates.delete(t.id);
                if (cfg.activeTemplateId === t.id){ patchCfg(ctx.chatId, { activeTemplateId: null }); renderPanel(ctx.root, ctx.chatId); }
                renderBody();
            } }, '삭제'));
            group.appendChild(item);
        }
        body.appendChild(group);

        const addWrap = h('div', { cls: 'nlb-tpl-create' });
        addWrap.appendChild(h('div', { cls: 'nlb-sec-title' }, tab === 'preset' ? '새 프리셋' : '새 로어북'));
        const nameInp = h('input', { cls: 'nlb-input', placeholder: '이름' });
        addWrap.appendChild(nameInp);
        const row = h('div', { cls: 'nlb-row', style: 'margin-top: 6px' });
        row.appendChild(h('button', { cls: 'nlb-btn nlb-btn-pri', onclick: async () => {
            const nm = nameInp.value.trim(); if (!nm) return;
            const payload = tab === 'preset'
                ? { name: nm, type: 'preset', presetContent: '' }
                : { name: nm, type: 'lorebook', alwaysContent: '', entryIds: [] };
            const id = await db.templates.add(payload);
            patchCfg(ctx.chatId, { activeTemplateId: id });
            pop.remove(); _pop = null; renderPanel(ctx.root, ctx.chatId);
        } }, '만들기'));
        addWrap.appendChild(row);
        body.appendChild(addWrap);
    }
    await renderBody();

    mountPopover(pop, anchor, isMobile);
}

async function openHelpPop(anchor){
    if (_pop){ _pop.remove(); _pop = null; return; }
    const rect = anchor.getBoundingClientRect();
    const isMobile = window.innerWidth <= 640;
    const pop = h('div', { cls: 'nlb-tpl-pop' + (isMobile ? ' nlb-pop-mobile' : '') });
    if (!isMobile){
        pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 500) + 'px';
        pop.style.left = Math.min(rect.left, window.innerWidth - 360) + 'px';
        pop.style.width = '340px';
    }
    const head = h('div', { cls: 'nlb-pop-head' });
    head.appendChild(h('span', { cls: 'nlb-pop-head-title' }, '도움말'));
    head.appendChild(h('button', { cls: 'nlb-pop-close', title: '닫기', onclick: () => { pop.remove(); _pop = null; } }, '×'));
    pop.appendChild(head);

    const sections = [
        ['템플릿 종류', ['로어북 — 키워드 기반 동적 주입', '프리셋 — 고정 텍스트를 매 전송 시 그대로 주입']],
        ['감지 범위', ['유저 입력 + 직전 유저/AI 발화만 스캔. 키워드가 범위 밖이면 트리거 빠짐 (유지 턴으로 강제 유지 가능)']],
        ['상시 로어', ['템플릿당 1개. 항상 유저노트 상단에 삽입됨']],
        ['트리거 로어', ['키워드가 최근 대화에 등장할 때만 삽입됨']],
        ['키워드 문법', ['쉼표 = OR', '&& = AND']],
        ['유지 턴', ['0 = 그 턴만, 1+ = 강제 유지']],
        ['우선순위', ['낮을수록 우선. 한도 초과 시 후순위부터 공간부족으로 제외']],
        ['글자수 한도', ['최대 2,000자. 500자 초과 시 유저노트 확장 필요. 저장본은 자르지 않음']]
    ];
    for (const [title, lines] of sections){
        const sec = h('div', { style: 'margin-bottom: 10px' });
        sec.appendChild(h('div', { cls: 'nlb-sec-title' }, title));
        for (const line of lines) sec.appendChild(h('div', { style: 'font-size: 12px; margin-bottom: 3px; line-height: 1.5; opacity: 0.85' }, line));
        pop.appendChild(sec);
    }

    mountPopover(pop, anchor, isMobile);
}

function injectIntoModal(modal){
    if (modal.querySelector('.nlb-root')) return;
    const chatId = getChatId(); if (!chatId) return;
    const ta = modal.getElementsByTagName('textarea')[0]; if (!ta) return;

    ta.readOnly = true;
    ta.style.minHeight = '120px'; ta.style.maxHeight = '22vh'; ta.style.opacity = '0.85';
    ta.placeholder = '지금 유저노트. 자동 반영. 수정 불가.';

    const root = h('div', { cls: 'nlb-root' });
    if (ta.nextSibling) ta.parentElement.insertBefore(root, ta.nextSibling);
    else ta.parentElement.appendChild(root);

    ctx.platformTa = ta;

    // 다이얼로그 높이 → 패널 max-height 클램프 (단일 외곽 스크롤, 상단 텍스트 영역 실측 반영)
    const dialog = modal.closest('[role="dialog"], [aria-modal="true"]') || modal;
    const updatePanelMax = () => {
        const r = dialog.getBoundingClientRect();
        const taR = ta.getBoundingClientRect();
        const reserved = (taR.height || 0) + 64;
        const panelMax = Math.max(280, Math.min(r.height - reserved, window.innerHeight * 0.78));
        root.style.setProperty('--nlb-panel-max', panelMax + 'px');
    };
    updatePanelMax();
    const ro = new ResizeObserver(updatePanelMax);
    ro.observe(dialog);
    ro.observe(ta);
    window.addEventListener('resize', updatePanelMax);
    _disposers.push(() => { ro.disconnect(); window.removeEventListener('resize', updatePanelMax); });

    // 모바일 키보드 — visualViewport 패딩 + 포커스 스크롤
    const vv = _w.visualViewport;
    if (vv){
        const onVV = () => {
            const pad = Math.max(0, _w.innerHeight - vv.height);
            root.style.paddingBottom = pad + 'px';
        };
        vv.addEventListener('resize', onVV);
        vv.addEventListener('scroll', onVV);
        _disposers.push(() => { vv.removeEventListener('resize', onVV); vv.removeEventListener('scroll', onVV); });
    }
    const onFocus = (ev) => {
        const el = ev.target;
        if (!el || !(el.matches && el.matches('textarea, input'))) return;
        if (!root.contains(el)) return;
        requestAnimationFrame(() => {
            try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch(_){}
        });
    };
    root.addEventListener('focusin', onFocus);
    _disposers.push(() => root.removeEventListener('focusin', onFocus));

    renderPanel(root, chatId);

    const onSwap = () => { if (document.body.contains(root)) updateStatus(); };
    _w.addEventListener('nlb:swapped', onSwap);
    _disposers.push(() => _w.removeEventListener('nlb:swapped', onSwap));
}

function closePop(){ if (_pop){ _pop.remove(); _pop = null; } }

function setup(){
    const modal = findModal();
    if (modal) injectIntoModal(modal);
    if (!modal && _pop) closePop();
    if (ctx.root && !document.body.contains(ctx.root)){ cleanupPanel(); ctx.root = null; closePop(); }
}

function start(){
    setup();
    const obs = new MutationObserver(() => setup());
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => { if (_pop) closePop(); });
    window.addEventListener('orientationchange', () => { if (_pop) closePop(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

})();