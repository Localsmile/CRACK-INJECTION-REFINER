// crack-lore-core / pricing 모듈
// 역할: Gemini API 호출 비용 산정, 비용 이벤트 로깅 + 제공/조회/초기화
// 의존: kernel 만 (localStorage 사용)
// 가격 기준: 2026년 5월 시점 Gemini Developer API 공시 단가 (USD per 1M tokens)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:pricing] kernel 미로드'); return; }
  if (C.__pricingLoaded) return;

  // USD per 1M tokens.
  // longIn / longOut / longThreshold가 있으면 contextLen > threshold일 때만 교체 단가 적용.
  const PRICING = {
    'gemini-3.1-pro-preview':        { in: 2.00,  out: 12.00, longIn: 4.00,  longOut: 18.00, longThreshold: 200000 },
    'gemini-3-pro-preview':          { in: 2.00,  out: 12.00, longIn: 4.00,  longOut: 18.00, longThreshold: 200000 },
    'gemini-3.1-flash-lite-preview': { in: 0.25,  out: 1.50 },
    'gemini-3-flash-preview':        { in: 0.50,  out: 3.00 },
    'gemini-2.5-pro':                { in: 1.25,  out: 10.00, longIn: 2.50,  longOut: 15.00, longThreshold: 200000 },
    'gemini-2.5-flash':              { in: 0.30,  out: 2.50 },
    'gemini-2.5-flash-lite':         { in: 0.10,  out: 0.40 },
    'gemini-2.0-flash':              { in: 0.10,  out: 0.40 },
    'gemini-2.0-flash-lite':         { in: 0.075, out: 0.30 },
    'gemini-embedding-001':          { in: 0.15,  out: 0 },
    // v1.4.0-test.38 B9 fix: gemini-embedding-2-preview 등 신규 임베딩 변종 prefix 폴백.
    // 구체 모델이 등록되지 않으면 이 단가를 쓴다. (Google embedding 계열은 동일 단가 유지)
    'gemini-embedding':              { in: 0.15,  out: 0 }
  };

  function normalizeModel(model) {
    let m = String(model || '').trim().toLowerCase();
    if (!m) return '';
    if (m.startsWith('models/')) m = m.slice(7);
    m = m.replace(/^(tuned-|ft-)/, '');
    return m;
  }

  function getPricing(model) {
    const m = normalizeModel(model);
    if (!m) return null;
    if (PRICING[m]) return PRICING[m];
    // 정확 매칭 실패 시 prefix 매칭 (긴 키 우선). 예: 'gemini-2.5-flash-09-2024' → 'gemini-2.5-flash'
    const keys = Object.keys(PRICING).sort((a, b) => b.length - a.length);
    for (const k of keys) if (m.startsWith(k)) return PRICING[k];
    return null;
  }

  function computeCost(model, inTok, outTok, contextLen) {
    const p = getPricing(model);
    if (!p) return null;
    const i = Math.max(0, Number(inTok) || 0);
    const o = Math.max(0, Number(outTok) || 0);
    const ctx = Math.max(i, Number(contextLen) || 0);
    let inRate = p.in, outRate = p.out;
    if (p.longThreshold && ctx > p.longThreshold) {
      if (p.longIn != null) inRate = p.longIn;
      if (p.longOut != null) outRate = p.longOut;
    }
    return (i * inRate + o * outRate) / 1e6;
  }

  // === 이벤트 로깅 ===
  const STORAGE_KEY = 'lore-api-cost-log';
  const MAX_EVENTS = 5000;
  let _cache = null;

  // v1.4.0-test.38 B15 fix: FIFO 5000 초과 시 전체 관점 누적 합계 손실 방지.
  // 이벤트는 기간 필터용, 누적은 "전체 기간" 합계용으로 분리.
  const CUMUL_KEY = 'lore-api-cost-cumulative';
  let _cumulCache = null;
  function _loadCumul() {
    if (_cumulCache) return _cumulCache;
    try {
      const raw = _w.localStorage.getItem(CUMUL_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      _cumulCache = (obj && typeof obj === 'object') ? obj : {};
    } catch (_) { _cumulCache = {}; }
    return _cumulCache;
  }
  function _persistCumul() {
    try { _w.localStorage.setItem(CUMUL_KEY, JSON.stringify(_cumulCache)); } catch (_) {}
  }

  function _loadAll() {
    if (_cache) return _cache;
    try {
      const raw = _w.localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      _cache = Array.isArray(arr) ? arr : [];
    } catch (_) { _cache = []; }
    return _cache;
  }

  function _persist() {
    try { _w.localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache)); } catch (_) {}
  }

  function recordApiCost(ev) {
    if (!ev || typeof ev !== 'object') return null;
    const events = _loadAll();
    const inTok = Math.max(0, Number(ev.inTok) || 0);
    const outTok = Math.max(0, Number(ev.outTok) || 0);
    const rawModel = String(ev.model || '');
    const model = normalizeModel(rawModel) || rawModel;
    const contextLen = Number(ev.contextLen) || inTok;
    const usd = computeCost(rawModel, inTok, outTok, contextLen);
    const unknown = usd == null;
    const rec = {
      ts: Number(ev.ts) || Date.now(),
      chatKey: String(ev.chatKey || 'global'),
      feature: String(ev.feature || 'unknown'),
      model,
      inTok, outTok,
      usd: unknown ? null : usd,
      unknown,
      estimated: !!ev.estimated
    };
    events.push(rec);
    // FIFO drop
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    _persist();

    // 누적 통계 (FIFO drop 무관하게 전체 기간 보존)
    const cumul = _loadCumul();
    cumul.usd = (Number(cumul.usd) || 0) + (Number(rec.usd) || 0);
    cumul.count = (Number(cumul.count) || 0) + 1;
    if (rec.unknown) cumul.unknownCount = (Number(cumul.unknownCount) || 0) + 1;
    if (rec.estimated) cumul.estimatedCount = (Number(cumul.estimatedCount) || 0) + 1;
    if (!cumul.firstTs || rec.ts < cumul.firstTs) cumul.firstTs = rec.ts;
    if (!cumul.lastTs || rec.ts > cumul.lastTs) cumul.lastTs = rec.ts;
    cumul.byFeature = cumul.byFeature || {};
    const bf = cumul.byFeature[rec.feature] = cumul.byFeature[rec.feature] || { usd: 0, count: 0 };
    bf.usd += Number(rec.usd) || 0; bf.count++;
    cumul.byModel = cumul.byModel || {};
    const bm = cumul.byModel[rec.model] = cumul.byModel[rec.model] || { usd: 0, count: 0 };
    bm.usd += Number(rec.usd) || 0; bm.count++;
    _persistCumul();

    return rec;
  }

  function getCumulativeCost() {
    const c = _loadCumul();
    return {
      usd: Number(c.usd) || 0,
      count: Number(c.count) || 0,
      unknownCount: Number(c.unknownCount) || 0,
      estimatedCount: Number(c.estimatedCount) || 0,
      firstTs: c.firstTs || null,
      lastTs: c.lastTs || null,
      byFeature: c.byFeature || {},
      byModel: c.byModel || {}
    };
  }

  function clearCumulativeCost() {
    _cumulCache = {};
    try { _w.localStorage.removeItem(CUMUL_KEY); } catch (_) {}
  }

  function getCostEvents() {
    return _loadAll().slice();
  }

  function clearCostEvents() {
    _cache = [];
    try { _w.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  Object.assign(C, {
    PRICING, computeCost, recordApiCost, getCostEvents, clearCostEvents, normalizeModel,
    getCumulativeCost, clearCumulativeCost,
    __pricingLoaded: true
  });
  console.log('[LoreCore:pricing] loaded');
})();
