// ==UserScript==
// @name        크랙 유저노트 로어북
// @namespace   crack-usernote-lorebook
// @version     1.0.0
// @description 유저노트 로어북 - 모달 내부 삽입형
// @author      로컬AI
// @license     MIT
// @match       https://crack.wrtn.ai/*
// @require     https://cdn.jsdelivr.net/npm/dexie@4.2.1/dist/dexie.min.js
// @require     https://cdn.jsdelivr.net/gh/milkyway0308/crystallized-chasm@crack-shared-core@v1.0.0/crack/libraries/crack-shared-core.js
// @grant       GM_addStyle
// @run-at      document-idle
// ==/UserScript==

(function(){
'use strict';
const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
if (_w.__NLB) return;
_w.__NLB = '1.0.0';

const MODAL_CLS_POOL = ['css-4wk9gd', 'css-1y4t25r', 'css-aeatjm', 'css-1o991gc'];

// DB
const db = new Dexie('nlb-lorebook-v4');
db.version(1).stores({
	entries: '++id,priority',
	templates: '++id,name,type'
});

// 채팅방별 설정
const _ls = _w.localStorage;
const CFG_DEF = { activeTemplateId: null, autoSwap: true, scanRange: 4 };
function loadCfg(cid){ try { const r = _ls.getItem('nlb4-cfg-' + cid); return r ? { ...CFG_DEF, ...JSON.parse(r) } : { ...CFG_DEF }; } catch(e){ return { ...CFG_DEF }; } }
function saveCfg(cid, c){ try { _ls.setItem('nlb4-cfg-' + cid, JSON.stringify(c)); } catch(e){} }
function patchCfg(cid, patch){ const c = loadCfg(cid); Object.assign(c, patch); saveCfg(cid, c); return c; }

function getChatId(){
	try { if (typeof _w.__LoreCore !== 'undefined' && _w.__LoreCore.getCurrentChatId) return _w.__LoreCore.getCurrentChatId(); } catch(e){}
	try { if (typeof CrackUtil !== 'undefined') { const c = CrackUtil.path().chatRoom(); if (c) return c; } } catch(e){}
	const m = location.pathname.match(/\/(?:chats|episodes)\/[a-f0-9]+\/([a-f0-9]+)/);
	if (m) return m[1];
	const m2 = location.pathname.match(/\/(?:chats|episodes)\/([a-f0-9]+)/);
	return m2 ? m2[1] : null;
}

// fetch 캐처로 토큰 수집
let _capturedToken = '';
const _origFetch = _w.fetch;
_w.fetch = async function(...a){
	try {
		const u = typeof a[0] === 'string' ? a[0] : a[0]?.url || '';
		if (u.includes('crack-api.wrtn.ai') || u.includes('contents-api.wrtn.ai')){
			const h = a[1]?.headers || {};
			const t = h['Authorization'] || h['authorization'] || '';
			if (t) _capturedToken = t.replace('Bearer ', '');
		}
	} catch(e){}
	return _origFetch.apply(this, a);
};
function getToken(){
	try { if (typeof CrackUtil !== 'undefined'){ const t = CrackUtil.cookie().getAuthToken(); if (t) return t; } } catch(e){}
	return _capturedToken;
}

// 대화 로그
async function fetchLogs(chatId, n){
	if (!chatId) return [];
	try {
		if (typeof CrackUtil === 'undefined') return [];
		const items = await CrackUtil.chatRoom().extractLogs(chatId, { maxCount: n });
		if (items instanceof Error || !Array.isArray(items)) return [];
		return items.map(m => ({ role: m.role, message: m.content || '' }));
	} catch(e){ return []; }
}

// 트리거 매칭
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

// 턴 / 유지
function getTurn(c){ return parseInt(_ls.getItem('nlb4-turn-' + c) || '0'); }
function incTurn(c){ const n = getTurn(c) + 1; _ls.setItem('nlb4-turn-' + c, String(n)); return n; }
function loadHolds(c){ try { return JSON.parse(_ls.getItem('nlb4-hold-' + c) || '{}'); } catch(e){ return {}; } }
function saveHolds(c, h){ _ls.setItem('nlb4-hold-' + c, JSON.stringify(h)); }
function setHold(c, eid, dur){ const h = loadHolds(c); h[eid] = getTurn(c) + dur; saveHolds(c, h); }
function isHeld(c, eid){ const h = loadHolds(c); return !!(h[eid] && h[eid] > getTurn(c)); }
function holdLeft(c, eid){ const h = loadHolds(c); return h[eid] ? Math.max(0, h[eid] - getTurn(c)) : 0; }
function cleanHolds(c){ const h = loadHolds(c); const t = getTurn(c); let ch = false; for (const k in h) if (h[k] <= t){ delete h[k]; ch = true; } if (ch) saveHolds(c, h); }

const cLen = s => [...s].length;

// 빌더
async function buildNote(chatId, userInput, isExtend){
	const cfg = loadCfg(chatId);
	const budget = isExtend ? 2000 : 500;
	const tpl = cfg.activeTemplateId ? await db.templates.get(cfg.activeTemplateId) : null;

	if (!tpl) return { note: '', included: [], skipped: [], chars: 0, budget, isExtend, alwaysChars: 0, templateType: null };

	if (tpl.type === 'preset'){
		const text = tpl.presetContent || '';
		const cut = [...text].slice(0, budget).join('');
		return { note: cut, included: [], skipped: [], chars: cLen(cut), budget, isExtend, alwaysChars: 0, templateType: 'preset' };
	}

	const alwaysText = tpl.alwaysContent || '';
	const entries = (await db.entries.bulkGet(tpl.entryIds || [])).filter(e => e && e.enabled !== false);

	let scanText = userInput || '';
	if (cfg.scanRange > 0){
		const logs = await fetchLogs(chatId, cfg.scanRange * 2);
			scanText += ' ' + logs.map(m => m.message || '').join(' ');
	}

	cleanHolds(chatId);
	const held = entries.filter(e => isHeld(chatId, e.id));
	const heldSet = new Set(held.map(e => e.id));
	const fresh = entries.filter(e => !heldSet.has(e.id) && matchTriggers(scanText, e.triggers));
	for (const e of fresh){ if (e.holdTurns > 0) setHold(chatId, e.id, e.holdTurns); }
	held.sort((a, b) => (a.priority || 999) - (b.priority || 999));
	fresh.sort((a, b) => (a.priority || 999) - (b.priority || 999));

	let note = alwaysText;
	let rem = budget - cLen(alwaysText);
	const included = [], skipped = [];
	const tryAdd = (e, reason) => {
		const ct = e.content || '';
		const need = cLen(ct) + (note.length ? 1 : 0);
		if (need > rem){ skipped.push({ id: e.id, name: e.name, reason }); return false; }
		note += (note.length ? '\n' : '') + ct;
		rem -= need;
		included.push({ id: e.id, name: e.name, reason });
		return true;
	};
	for (const e of held) tryAdd(e, 'hold');
	for (const e of fresh) tryAdd(e, 'trigger');

	return { note, included, skipped, chars: cLen(note), budget, isExtend, alwaysChars: cLen(alwaysText), templateType: 'lorebook' };
}

// PATCH
async function patchNoteAPI(chatId, content, isExtend){
	const token = getToken(); if (!token) return false;
	try {
		const r = await _origFetch('https://crack-api.wrtn.ai/crack-gen/v3/chats/' + chatId, {
			method: 'PATCH', credentials: 'include',
			headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
			body: JSON.stringify({ userNote: { content, isExtend: !!isExtend } })
		});
		return r.ok;
	} catch(e){ return false; }
}

// React 쓰기
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

function readIsExtend(modal){ const ta = modal.querySelector('textarea'); return ta ? ta.maxLength > 500 : false; }

// 전송 시 스왑
const _cache = { note: null, cid: null };
let _swapping = false;

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
		const modal = findModal();
		const isExtend = modal ? readIsExtend(modal) : false;
		const r = await buildNote(cid, userInput, isExtend);
		if (r.note === _cache.note && cid === _cache.cid){ _swapping = false; return; }
		const ok = await patchNoteAPI(cid, r.note, r.isExtend);
		if (ok){ _cache.note = r.note; _cache.cid = cid; }
		_w.dispatchEvent(new CustomEvent('nlb:swapped', { detail: r }));
	} catch(e){ console.error('[NLB] swap', e); }
	_swapping = false;
}

// WS 인터셉트
const _origSend = _w.WebSocket.prototype.send;
_w.WebSocket.prototype.send = function(data){
	const ws = this;
	if (typeof data === 'string' && data.length > 10){
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

// 스타일
GM_addStyle(`
	.nlb-root { margin-top: 14px; padding: 12px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: rgba(255,255,255,0.02); font-size: 13px; color: inherit; }
	.nlb-root * { box-sizing: border-box; }
	.nlb-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
	.nlb-bar-title { font-weight: 600; display: flex; align-items: baseline; gap: 6px; flex: 1; min-width: 0; }
	.nlb-bar-title .tplname { font-weight: 400; opacity: 0.6; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.nlb-btn { padding: 5px 11px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: inherit; font-size: 12px; cursor: pointer; font-family: inherit; line-height: 1.3; }
	.nlb-btn:hover { background: rgba(255,255,255,0.08); }
	.nlb-btn-pri { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.22); }
	.nlb-btn-pri:hover { background: rgba(255,255,255,0.2); }
	.nlb-btn-danger:hover { background: rgba(220,80,80,0.15); border-color: rgba(220,80,80,0.35); }
	.nlb-input, .nlb-textarea { width: 100%; padding: 7px 9px; border: 1px solid rgba(255,255,255,0.12); border-radius: 5px; background: rgba(0,0,0,0.25); color: inherit; font-size: 13px; font-family: inherit; }
	.nlb-input:focus, .nlb-textarea:focus { outline: none; border-color: rgba(255,255,255,0.3); }
	.nlb-textarea { resize: vertical; min-height: 100px; line-height: 1.5; }
	.nlb-textarea.large { min-height: 160px; }
	.nlb-sec { margin-bottom: 12px; }
	.nlb-sec-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
	.nlb-sec-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; opacity: 0.65; flex: 1; }
	.nlb-entry { padding: 0; margin-bottom: 5px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 5px; overflow: hidden; }
	.nlb-entry-head { padding: 8px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
	.nlb-entry-head:hover { background: rgba(255,255,255,0.03); }
	.nlb-entry-caret { font-size: 10px; opacity: 0.6; width: 10px; flex-shrink: 0; transition: transform .15s; }
	.nlb-entry.open .nlb-entry-caret { transform: rotate(90deg); }
	.nlb-entry-name { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.nlb-entry-meta { font-size: 11px; opacity: 0.55; }
	.nlb-entry-body { display: none; padding: 0 10px 10px; border-top: 1px dashed rgba(255,255,255,0.08); }
	.nlb-entry.open .nlb-entry-body { display: block; padding-top: 8px; }
	.nlb-entry-body > * + * { margin-top: 6px; }
	.nlb-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.nlb-row label { font-size: 12px; opacity: 0.7; }
	.nlb-status { font-size: 12px; opacity: 0.75; padding: 8px 0 0; border-top: 1px solid rgba(255,255,255,0.08); margin-top: 10px; line-height: 1.6; }
	.nlb-status .hl { font-weight: 600; opacity: 1; }
	.nlb-status .warn { color: #e8b86e; display: block; margin-top: 4px; }
	.nlb-status .over { color: #e57373; display: block; margin-top: 4px; }
	.nlb-toggle { position: relative; width: 32px; height: 18px; display: inline-block; flex-shrink: 0; }
	.nlb-toggle input { opacity: 0; width: 0; height: 0; }
	.nlb-toggle-sl { position: absolute; inset: 0; background: rgba(255,255,255,0.15); border-radius: 9px; cursor: pointer; transition: .15s; }
	.nlb-toggle-sl:before { content: ''; position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #fff; left: 2px; top: 2px; transition: .15s; }
	.nlb-toggle input:checked + .nlb-toggle-sl { background: rgba(120,200,140,0.6); }
	.nlb-toggle input:checked + .nlb-toggle-sl:before { left: 16px; }
	.nlb-tpl-pop { position: fixed; z-index: 999999; background: #1a1a22; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 0 10px 10px; width: 320px; max-width: calc(100vw - 24px); max-height: 60vh; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; box-shadow: 0 8px 32px rgba(0,0,0,0.6); color: #eee; }
	.nlb-tpl-pop.nlb-pop-mobile { left: 12px !important; right: 12px; top: auto !important; bottom: 12px; width: auto; max-width: none; max-height: 70vh; }
	.nlb-pop-head { position: sticky; top: 0; margin: 0 -10px 8px; padding: 8px 10px; background: #1a1a22; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; gap: 8px; z-index: 1; }
	.nlb-pop-head-title { flex: 1; font-size: 12px; font-weight: 600; opacity: 0.8; }
	.nlb-pop-close { width: 26px; height: 26px; padding: 0; font-size: 16px; line-height: 1; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; }
	.nlb-pop-close:hover { background: rgba(255,255,255,0.1); }
	.nlb-tpl-group { margin-bottom: 10px; }
	.nlb-tpl-item { padding: 6px 8px; font-size: 13px; display: flex; gap: 6px; align-items: center; border-radius: 4px; }
	.nlb-tpl-item:hover { background: rgba(255,255,255,0.05); }
	.nlb-tpl-item.active { background: rgba(255,255,255,0.1); }
	.nlb-tpl-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	@media (max-width: 640px){
		.nlb-entry-name { font-size: 14px; }
		.nlb-btn { padding: 7px 12px; font-size: 13px; }
	}
`);

// DOM 헬퍼
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

// 디바운스
function debounce(fn, ms){
	let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// 채팅 입력창
function findComposer(){
	const modal = findModalInternal();
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
function readComposer(){
	const c = findComposer(); if (!c) return '';
	return c.value !== undefined ? c.value : (c.textContent || '');
}
function findModalInternal(){
	for (const k of MODAL_CLS_POOL){
		const f = document.getElementsByClassName(k);
		if (f.length > 0) return f[0];
	}
	return null;
}

function findModal(){
	for (const k of MODAL_CLS_POOL){
		const f = document.getElementsByClassName(k);
		if (f.length > 0) return f[0];
	}
	return null;
}

// 글자수 한도
function currentBudget(){ const m = findModal(); return m && readIsExtend(m) ? 2000 : 500; }
function enforceLen(ta, max){
	if (max < 0) max = 0;
	if (ta.maxLength !== max) ta.maxLength = max;
	const arr = [...ta.value];
	if (arr.length > max) writeTextarea(ta, arr.slice(0, max).join(''));
}
function applyLimits(){
	if (!ctx.root) return;
	const budget = currentBudget();
	if (ctx.alwaysTa) enforceLen(ctx.alwaysTa, budget);
	if (ctx.presetTa) enforceLen(ctx.presetTa, budget);
	if (ctx.trigSection){
		const aLen = ctx.alwaysTa ? cLen(ctx.alwaysTa.value) : 0;
		const entryMax = Math.max(0, budget - aLen);
		for (const card of ctx.trigSection.children){
			const cta = card.querySelector('textarea.nlb-textarea');
			if (cta) enforceLen(cta, entryMax);
		}
	}
}

// 공유 컨텍스트
const ctx = { root: null, chatId: null, trigSection: null, platformTa: null, alwaysTa: null, presetTa: null };

async function renderPanel(root, chatId){
	root.innerHTML = '';
	ctx.root = root;
	ctx.chatId = chatId;
	ctx.trigSection = null;
	ctx.alwaysTa = null;
	ctx.presetTa = null;

	const cfg = loadCfg(chatId);
	const tpl = cfg.activeTemplateId ? await db.templates.get(cfg.activeTemplateId) : null;

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

	if (!tpl){
		root.appendChild(h('div', { cls: 'nlb-status' }, '활성 템플릿 없음. [템플릿]에서 선택 또는 생성.'));
		mirrorToPlatform();
		return;
	}

	if (tpl.type === 'preset'){ renderPreset(tpl); mirrorToPlatform(); return; }

	// 상시 로어 (단일 textarea)
	const alwaysSec = h('div', { cls: 'nlb-sec' });
	alwaysSec.appendChild(h('div', { cls: 'nlb-sec-title' }, '상시 로어'));
	const alwaysTa = h('textarea', { cls: 'nlb-textarea', placeholder: '항상 상단에 들어갈 내용. 템플릿당 1개' });
	alwaysTa.value = tpl.alwaysContent || '';
	ctx.alwaysTa = alwaysTa;
	const saveAlways = debounce(async (v) => {
		await db.templates.update(tpl.id, { alwaysContent: v });
		updateStatus();
	}, 250);
	alwaysTa.oninput = () => saveAlways(alwaysTa.value);
	alwaysSec.appendChild(alwaysTa);
	root.appendChild(alwaysSec);

	// 트리거 로어
	const trigSec = h('div', { cls: 'nlb-sec' });
	const head = h('div', { cls: 'nlb-sec-head' });
	head.appendChild(h('div', { cls: 'nlb-sec-title' }, '트리거 로어'));
	head.appendChild(h('button', { cls: 'nlb-btn', onclick: () => addEntry(tpl) }, '추가'));
	trigSec.appendChild(head);
	const trigList = h('div', { cls: 'nlb-trig-list' });
	const entries = (await db.entries.bulkGet(tpl.entryIds || [])).filter(Boolean).sort((a, b) => (a.priority || 999) - (b.priority || 999));
	if (!entries.length) trigList.appendChild(emptyNote());
	for (const e of entries) trigList.appendChild(renderCard(e, tpl));
	trigSec.appendChild(trigList);
	ctx.trigSection = trigList;
	root.appendChild(trigSec);

	// 상태줄
	const status = h('div', { cls: 'nlb-status', id: 'nlb-status' });
	root.appendChild(status);

	updateStatus();
	root.addEventListener('input', applyLimits);
	applyLimits();
}

function emptyNote(){ return h('div', { cls: 'nlb-trig-empty', style: 'font-size:12px;opacity:0.5;padding:4px 0' }, '없음'); }

function renderPreset(tpl){
	const sec = h('div', { cls: 'nlb-sec' });
	sec.appendChild(h('div', { cls: 'nlb-sec-title' }, '프리셋 내용'));
	const ta = h('textarea', { cls: 'nlb-textarea large', placeholder: '그대로 주입될 내용' });
	ta.value = tpl.presetContent || '';
	ctx.presetTa = ta;
	const save = debounce(async (v) => { await db.templates.update(tpl.id, { presetContent: v }); updateStatus(); }, 250);
	ta.oninput = () => save(ta.value);
	sec.appendChild(ta);
	ctx.root.appendChild(sec);
	ctx.root.appendChild(h('div', { cls: 'nlb-status' }, '전송 시마다 자동 주입됨.'));
}

function renderCard(e, tpl){
	const card = h('div', { cls: 'nlb-entry' });
	card._entryId = e.id;
	const head = h('div', { cls: 'nlb-entry-head' });
	head.appendChild(h('span', { cls: 'nlb-entry-caret' }, '>'));
	head.appendChild(tog(e.enabled !== false, async (v) => { await db.entries.update(e.id, { enabled: v }); updateStatus(); }));
	head.appendChild(h('span', { cls: 'nlb-entry-name' }, e.name || '(이름 없음)'));
	const metaText = buildMeta(e);
	const metaEl = h('span', { cls: 'nlb-entry-meta' }, metaText);
	head.appendChild(metaEl);
	head.appendChild(h('button', { cls: 'nlb-btn nlb-btn-danger', onclick: (ev) => { ev.stopPropagation(); deleteEntry(e, tpl, card); } }, '삭제'));
	head.onclick = (ev) => { if (ev.target.closest('button, input, label')) return; card.classList.toggle('open'); };
	card.appendChild(head);

	const body = h('div', { cls: 'nlb-entry-body' });
	const nameInp = h('input', { cls: 'nlb-input', placeholder: '이름', value: e.name || '' });
	const trigInp = h('input', { cls: 'nlb-input', placeholder: '키워드 (쉼표 OR, && AND)', value: (e.triggers || []).join(', ') });
	const contTa = h('textarea', { cls: 'nlb-textarea', placeholder: '삽입될 내용' });
	contTa.value = e.content || '';
	const metaRow = h('div', { cls: 'nlb-row' });
	metaRow.appendChild(h('label', {}, '우선순위'));
	const prioInp = h('input', { cls: 'nlb-input', type: 'number', min: '1', value: String(e.priority || 1), style: 'width:70px' });
	metaRow.appendChild(prioInp);
	metaRow.appendChild(h('label', {}, '유지 턴'));
	const holdInp = h('input', { cls: 'nlb-input', type: 'number', min: '0', value: String(e.holdTurns || 0), style: 'width:70px' });
	metaRow.appendChild(holdInp);

	// 자동 저장
	const saveNow = async () => {
		const patch = {
			name: nameInp.value.trim() || '(이름 없음)',
			triggers: trigInp.value.split(',').map(s => s.trim()).filter(Boolean),
			content: contTa.value,
			priority: parseInt(prioInp.value) || 1,
			holdTurns: parseInt(holdInp.value) || 0
		};
		await db.entries.update(e.id, patch);
		Object.assign(e, patch);
		head.querySelector('.nlb-entry-name').textContent = patch.name;
		metaEl.textContent = buildMeta(e);
		updateStatus();
	};
	const saveDeb = debounce(saveNow, 300);
	[nameInp, trigInp, contTa, prioInp, holdInp].forEach(el => {
		el.addEventListener('input', saveDeb);
		el.addEventListener('blur', saveNow);
	});

	body.appendChild(nameInp);
	body.appendChild(trigInp);
	body.appendChild(contTa);
	body.appendChild(metaRow);
	card.appendChild(body);
	return card;
}

function buildMeta(e){
	const parts = [cLen(e.content || '') + '자'];
	parts.push('우선 ' + (e.priority || 1));
	if (e.holdTurns > 0) parts.push('유지 ' + e.holdTurns + '턴');
	if (ctx.chatId){
		const left = holdLeft(ctx.chatId, e.id);
		if (left > 0) parts.push('잔여 ' + left + '턴');
	}
	return parts.join(' · ');
}

async function addEntry(tpl){
	// 다음 우선순위
	const existing = (await db.entries.bulkGet(tpl.entryIds || [])).filter(Boolean);
	const nextPrio = existing.length ? Math.max(...existing.map(e => e.priority || 1)) + 1 : 1;
	const id = await db.entries.add({
		name: '새 로어', triggers: [], content: '',
		priority: nextPrio, holdTurns: 0, enabled: true
	});
	const newEntry = await db.entries.get(id);
	await db.templates.update(tpl.id, { entryIds: [...(tpl.entryIds || []), id] });

	// DOM에 새 카드만 추가
	const list = ctx.trigSection;
	if (list){
		const empty = list.querySelector('.nlb-trig-empty');
		if (empty) empty.remove();
		const card = renderCard(newEntry, tpl);
		card.classList.add('open');
		list.appendChild(card);
		const nameInp = card.querySelector('input.nlb-input');
		if (nameInp){ nameInp.focus(); nameInp.select(); }
	}
	updateStatus();
}

async function deleteEntry(e, tpl, cardEl){
	if (!confirm((e.name || '(이름 없음)') + ' 삭제?')) return;
	await db.entries.delete(e.id);
	await db.templates.update(tpl.id, { entryIds: (tpl.entryIds || []).filter(x => x !== e.id) });
	const list = ctx.trigSection;
	cardEl.remove();
	if (list && !list.children.length) list.appendChild(emptyNote());
	updateStatus();
}

// 상태 갱신
async function updateStatus(){
	const statusEl = ctx.root && ctx.root.querySelector('#nlb-status');
	await mirrorToPlatform();
	if (!statusEl) return;
	if (!ctx.chatId) return;
	const modal = findModal();
	const isExtend = modal ? readIsExtend(modal) : false;
	const r = await buildNote(ctx.chatId, readComposer(), isExtend);
	statusEl.innerHTML = '';
	if (r.templateType !== 'lorebook'){ return; }
	const used = r.alwaysChars;
	const remain = r.budget - used;
	const l1 = h('div', {},
		'상시 ', h('span', { cls: 'hl' }, r.alwaysChars + '자'),
		' / ', h('span', { cls: 'hl' }, r.budget + '자 한도')
	);
	const l2 = h('div', {},
		'트리거 가용 ', h('span', { cls: 'hl' }, Math.max(0, remain) + '자'),
		' · 현재 매칭 ', h('span', { cls: 'hl' }, String(r.included.length))
	);
	statusEl.appendChild(l1);
	statusEl.appendChild(l2);
	if (remain < 0) statusEl.appendChild(h('span', { cls: 'over' }, '한도 초과. 상시가 ' + (-remain) + '자 넘침'));
	if (r.skipped.length) statusEl.appendChild(h('span', { cls: 'warn' }, '공간부족 제외: ' + r.skipped.map(s => s.name).join(', ')));
}

// 플랫폼 textarea 미러링
async function mirrorToPlatform(){
	if (!ctx.chatId) return;
	const modal = findModal();
	if (!modal) return;
	const ta = modal.querySelector('textarea');
	if (!ta) return;
	const isExtend = ta.maxLength > 500;
	const r = await buildNote(ctx.chatId, readComposer(), isExtend);
	writeTextarea(ta, r.note);
}

// 템플릿 팝오버
let _pop = null;
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

	const cfg = loadCfg(ctx.chatId);
	const tpls = await db.templates.toArray();
	const lore = tpls.filter(t => t.type !== 'preset');
	const preset = tpls.filter(t => t.type === 'preset');

	const renderGroup = (title, list) => {
		const g = h('div', { cls: 'nlb-tpl-group' });
		g.appendChild(h('div', { cls: 'nlb-sec-title' }, title));
		if (!list.length) g.appendChild(h('div', { style: 'font-size:12px;opacity:0.5;padding:4px 0' }, '없음'));
		for (const t of list){
			const item = h('div', { cls: 'nlb-tpl-item' + (t.id === cfg.activeTemplateId ? ' active' : '') });
			item.appendChild(h('span', { cls: 'nlb-tpl-name' }, t.name));
			item.appendChild(h('button', { cls: 'nlb-btn', onclick: () => {
				patchCfg(ctx.chatId, { activeTemplateId: t.id });
				pop.remove(); _pop = null; renderPanel(ctx.root, ctx.chatId);
			} }, '적용'));
			item.appendChild(h('button', { cls: 'nlb-btn', onclick: async () => {
				const nm = prompt('새 이름', t.name);
				if (!nm || !nm.trim()) return;
				await db.templates.update(t.id, { name: nm.trim() });
				pop.remove(); _pop = null;
				if (cfg.activeTemplateId === t.id) renderPanel(ctx.root, ctx.chatId);
				openTplPop(anchor);
			} }, '이름'));
			item.appendChild(h('button', { cls: 'nlb-btn nlb-btn-danger', onclick: async () => {
				if (!confirm(t.name + ' 삭제?')) return;
				await db.templates.delete(t.id);
				if (cfg.activeTemplateId === t.id) patchCfg(ctx.chatId, { activeTemplateId: null });
				pop.remove(); _pop = null; openTplPop(anchor);
			} }, '삭제'));
			g.appendChild(item);
		}
		pop.appendChild(g);
	};

	renderGroup('로어북 템플릿', lore);
	renderGroup('프리셋 템플릿', preset);

	const addWrap = h('div', { style: 'border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; margin-top: 4px' });
	addWrap.appendChild(h('div', { cls: 'nlb-sec-title' }, '새 템플릿'));
	const nameInp = h('input', { cls: 'nlb-input', placeholder: '이름' });
	addWrap.appendChild(nameInp);
	const typeRow = h('div', { cls: 'nlb-row', style: 'margin-top: 6px' });
	const makeCreate = (kind, label) => h('button', { cls: 'nlb-btn nlb-btn-pri', onclick: async () => {
		const nm = nameInp.value.trim(); if (!nm) return;
		const payload = kind === 'preset' ? { name: nm, type: 'preset', presetContent: '' } : { name: nm, type: 'lorebook', alwaysContent: '', entryIds: [] };
		const id = await db.templates.add(payload);
		patchCfg(ctx.chatId, { activeTemplateId: id });
		pop.remove(); _pop = null; renderPanel(ctx.root, ctx.chatId);
	} }, label);
	typeRow.appendChild(makeCreate('lorebook', '로어북으로'));
	typeRow.appendChild(makeCreate('preset', '프리셋으로'));
	addWrap.appendChild(typeRow);
	pop.appendChild(addWrap);

	document.body.appendChild(pop);
	_pop = pop;
	setTimeout(() => {
		const off = (e) => { if (!pop.contains(e.target) && e.target !== anchor){ pop.remove(); _pop = null; document.removeEventListener('click', off); } };
		document.addEventListener('click', off);
	}, 0);
}

// 도움말
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
		['템플릿 종류', [
			'로어북 — 키워드 기반 동적 주입(키워드북과 동일)',
			'프리셋 — 고정 텍스트를 매 전송 시 그대로 주입'
		]],
		['상시 로어', [
			'템플릿당 1개. 항상 유저노트 상단에 삽입됨',
			'예: 트리거를 위한 별도 규칙 작성 등'
		]],
		['트리거 로어', [
			'키워드가 최근 대화에 등장할 때만 삽입됨',
			'여러 개 등록 가능'
		]],
		['키워드 문법', [
			'쉼표 = OR. 두 키워드 중 하나라도 있으면 매칭',
			'&& = AND. 양쪽 키워드 모두 있어야 매칭',
			'예: "에리, 붕어빵" → 에리나 붕어빵 중 하나만 출력되어도 됨',
			'예: "에리&&붕어빵" → 에리과 붕어빵 둘 다 출력되어야함',
			'조합: "에리&&붕어빵, 붕어빵&&슈크림" → (에리+붕어빵) 또는 (붕어빵+슈크림)'
		]],
		['유지 턴', [
			'0 — 그 턴에만 반영. 키워드가 사라지면 다음 턴에 주입 안 됨 (크랙 키워드북과 동일)',
			'1 — 매칭 후 1턴 강제 유지 (키워드 사라져도 유지)',
			'5 — 매칭 후 5턴 강제 유지',
			'상황별 권장: 일반적 = 0 / 오래 유지해야하면 = 3~5'
		]],
		['우선순위', [
			'낮을수록 먼저 삽입. 1이 최우선',
			'글자수 한도 초과 시 낮은 우선순위 제외됨'
		]],
		['글자수 한도', [
			'기본 500자. 크랙 "유저노트 2000자 확장" 토글 켜면 2000자',
			'입력칸 최대길이도 자동 조정됨(잘림)'
		]],
		['두 가지 토글 (헷갈리기 쉬움)', [
			'상단 바 "자동" — 로어북 전체 스위치. OFF면 로어북 템플릿은 아무것도 주입 안 됨 (프리셋 템플릿은 무관)',
			'엔트리 카드 좌측 — 해당 트리거 로어 1개만 on/off. 임시로 끄고 싶을 때',
			'둘 다 ON이어야 해당 엔트리가 매칭 대상이 됨'
		]],
		['삽입/저장 시점', [
			'메시지를 전송할 때마다 최신 설정으로 자동 PATCH됨',
			'유저노트창을 열지 않아도 적용됨',
			'크랙의 "저장/등록" 버튼은 고이 필요없음. 그냥 X로 닫아도 됨'
		]],
		['예시', [
			'에리와 붕어빵: 키워드 "에리&&붕어빵" 유지 5, 슈크림빵에 대한 찬양 내용 → 5턴간 붕어빵 찬양 내용이 살아있음'
		]]
	];

	for (const [title, lines] of sections){
		const sec = h('div', { style: 'margin-bottom: 10px' });
		sec.appendChild(h('div', { cls: 'nlb-sec-title' }, title));
		for (const line of lines){
			sec.appendChild(h('div', { style: 'font-size: 12px; margin-bottom: 3px; line-height: 1.5; opacity: 0.85' }, line));
		}
		pop.appendChild(sec);
	}

	document.body.appendChild(pop);
	_pop = pop;
	setTimeout(() => {
		const off = (e) => { if (!pop.contains(e.target) && e.target !== anchor){ pop.remove(); _pop = null; document.removeEventListener('click', off); } };
		document.addEventListener('click', off);
	}, 0);
}

function injectIntoModal(modal){
	if (modal.querySelector('.nlb-root')) return;
	const chatId = getChatId(); if (!chatId) return;
	const ta = modal.getElementsByTagName('textarea')[0]; if (!ta) return;

	// 읽기전용 미러
	ta.readOnly = true;
	ta.style.minHeight = '160px';
	ta.style.maxHeight = '30vh';
	ta.style.opacity = '0.85';
	ta.placeholder = '지금 유저노트. 자동 반영. 수정 불가.';

	const root = h('div', { cls: 'nlb-root' });
	if (ta.nextSibling) ta.parentElement.insertBefore(root, ta.nextSibling);
	else ta.parentElement.appendChild(root);

	ctx.platformTa = ta;
	// maxLength 감시
	const extObs = new MutationObserver(() => applyLimits());
	extObs.observe(ta, { attributes: true, attributeFilter: ['maxlength'] });
	renderPanel(root, chatId);

	const onSwap = () => { if (document.body.contains(root)) updateStatus(); };
	_w.addEventListener('nlb:swapped', onSwap);
}

function closePop(){ if (_pop){ _pop.remove(); _pop = null; } }
function setup(){
	const modal = findModal();
	if (modal) injectIntoModal(modal);
	// 모달 사라지면 팝오버도 같이 제거 (모바일 유저노트 닫힘 잔존 방지)
	if (!modal && _pop) closePop();
	if (ctx.root && !document.body.contains(ctx.root)){ ctx.root = null; closePop(); }
}
function start(){
	setup();
	const obs = new MutationObserver(() => setup());
	obs.observe(document.body, { childList: true, subtree: true });
	// 모바일 방향 전환/리사이즈 시 팝오버 위치 재조정 대신 닫기
	window.addEventListener('resize', () => { if (_pop) closePop(); });
	console.log('[NLB] v1.0.0 loaded');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
})();
