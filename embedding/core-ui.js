// crack-lore-core / ui 모듈
// 역할: 상태 배지, 토글/입력 UI 헬퍼
// 의존: 없음 (kernel 이후면 로드 순서 무관)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiLoaded) return;

  // 상태 배지
  var _statusBadge = null;
  var _pulseStyleAdded = false;
  var _statusLabel = null;
  var _statusDot = null;
  var _statusAutoHideTimer = null;
  function humanizeStatusText(text) {
    var s = String(text || '');
    var map = [
      [/Local migration check complete\.?/i, '저장 데이터 점검 완료'],
      [/Local migration failed:?/i, '저장 데이터 점검 실패:'],
      [/local migration/i, '저장 데이터 정리'],
      [/stale embedding/i, '검색 준비 갱신 필요'],
      [/queued for refine/i, '응답 교정 대기 중'],
      [/\bqueued\b/i, '대기 중'],
      [/\brefining\b/i, '응답 교정 중'],
      [/\bidle\b/i, '대기 중'],
      [/0초 전/g, '방금 전']
    ];
    map.forEach(function (pair) { s = s.replace(pair[0], pair[1]); });
    return s;
  }
  function showStatusBadge(text) {
    if (_w.__LoreInj && _w.__LoreInj.settings && _w.__LoreInj.settings.config && _w.__LoreInj.settings.config.statusBadgeEnabled === false) {
      hideStatusBadge();
      return;
    }
    if (!_pulseStyleAdded) {
      try {
        var head = document.head || document.getElementsByTagName('head')[0];
        if (head) {
          var style = document.createElement('style');
          style.id = 'lore-pulse-style';
          style.textContent = '@keyframes lore-pulse{0%,100%{opacity:1}50%{opacity:.3}}';
          head.appendChild(style);
          _pulseStyleAdded = true;
        }
      } catch (_) {}
    }
    if (!_statusBadge) {
      _statusBadge = document.createElement('div');
      _statusBadge.id = 'lore-status-badge';
      // z-index는 host 모달(흐히 999999)을 넘기도록 정수 상한구간으로 설정.
      _statusBadge.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom, 0px) + 118px);right:18px;z-index:2147483646;background:rgba(18,19,22,.94);border:1px solid var(--li-line,#343840);border-radius:999px;padding:8px 14px;font-size:12px;color:var(--li-text,#f3f4f6);box-shadow:0 12px 30px rgba(0,0,0,.32);display:flex;align-items:center;gap:8px;font-family:inherit;transition:opacity .25s;opacity:0;pointer-events:none;max-width:min(360px,calc(100vw - 36px));';
      _statusDot = document.createElement('span');
      _statusDot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--li-accent,#8ab4ff);animation:lore-pulse 1s infinite;flex-shrink:0;';
      _statusLabel = document.createElement('span');
      _statusLabel.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      _statusBadge.appendChild(_statusDot);
      _statusBadge.appendChild(_statusLabel);
    }
    // body가 아직 없거나 분리된 경우에도 다시 mount. 최소한 documentElement에라도 붙인다.
    var mountTarget = document.body || document.documentElement;
    if (mountTarget && _statusBadge.parentNode !== mountTarget) {
      try { mountTarget.appendChild(_statusBadge); } catch (_) {}
    }
    var labelText = humanizeStatusText(text);
    if (_statusLabel && _statusLabel.textContent !== labelText) _statusLabel.textContent = labelText;
    if (_statusBadge.style.opacity !== '1') _statusBadge.style.opacity = '1';
    if (_statusBadge.style.pointerEvents !== 'auto') _statusBadge.style.pointerEvents = 'auto';
    if (_statusAutoHideTimer) { clearTimeout(_statusAutoHideTimer); _statusAutoHideTimer = null; }
    if (labelText === '에리가 응답 기다리는 중') {
      _statusAutoHideTimer = setTimeout(function () {
        if (_statusLabel && _statusLabel.textContent === '에리가 응답 기다리는 중') hideStatusBadge();
      }, 45000);
    }
    // host CSP/sandbox에서 @keyframes가 묵살될 경우를 대비한 JS 펄스 폴백 (500ms toggle).
    if (_statusDot && !_statusDot.__pulseTimer) {
      var __on = true;
      _statusDot.__pulseTimer = setInterval(function () {
        __on = !__on;
        try { _statusDot.style.opacity = __on ? '1' : '0.35'; } catch (_) {}
      }, 500);
    }
  }
  function hideStatusBadge() {
    if (_statusAutoHideTimer) { clearTimeout(_statusAutoHideTimer); _statusAutoHideTimer = null; }
    if (_statusBadge) { _statusBadge.style.opacity = '0'; _statusBadge.style.pointerEvents = 'none'; }
    if (_statusDot && _statusDot.__pulseTimer) {
      try { clearInterval(_statusDot.__pulseTimer); } catch (_) {}
      _statusDot.__pulseTimer = null;
      try { _statusDot.style.opacity = '1'; } catch (_) {}
    }
  }

  // 설정 UI 헬퍼
  const UI = {
    field: 'width:100%;min-height:40px;padding:9px 11px;border:1px solid var(--li-line,#343840);border-radius:8px;background:var(--li-bg,#101113);color:var(--li-text,#f3f4f6);font-size:13px;line-height:1.45;box-sizing:border-box;outline:none;',
    sectionTitle: 'font-size:14px;color:var(--li-text,#f3f4f6);font-weight:700;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--li-line,#343840);letter-spacing:0;',
    subtle: 'font-size:12px;color:var(--li-text-soft,#b8bec8);line-height:1.55;word-break:keep-all;',
    label: 'font-size:13px;color:var(--li-text,#f3f4f6);font-weight:700;letter-spacing:0;'
  };

  function setFullWidth(node) {
    const p = node.parentElement;
    if (p && p.classList && p.classList.contains('lore-v2-content')) {
      node.style.cssText = 'width:100%;display:block;padding:4px 0;box-sizing:border-box;background:transparent;border:none;margin-bottom:14px;';
      node.innerHTML = '';
      return;
    }
    if (p) {
      p.style.display = 'block'; p.style.padding = '0';
      p.style.border = 'none'; p.style.background = 'transparent';
      Array.from(p.children).forEach(c => { if (c !== node) c.style.display = 'none'; });
    }
    node.style.cssText = 'width:100%;display:block;padding:4px 0;box-sizing:border-box;background:transparent;border:none;margin-bottom:14px;';
    node.innerHTML = '';
  }

  function createToggleRow(title, desc, isChecked, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:16px;width:100%;margin-bottom:12px;padding:12px 0;border-bottom:1px solid rgba(148,163,184,.10);';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title;
    t.style.cssText = UI.label;
    const d = document.createElement('div'); d.textContent = desc;
    d.style.cssText = UI.subtle;
    left.appendChild(t); left.appendChild(d);
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const swLabel = document.createElement('span');
    swLabel.textContent = isChecked ? 'ON' : 'OFF';
    swLabel.style.cssText = 'font-size:11px;color:var(--li-text-soft,#a9b6c7);font-weight:700;width:24px;text-align:center;';
    const sw = document.createElement('div');
    sw.style.cssText = `width:38px;height:22px;border-radius:999px;cursor:pointer;background:${isChecked ? 'var(--li-accent,#8ab4ff)' : 'var(--li-surface-3,#272a2f)'};position:relative;flex-shrink:0;border:1px solid ${isChecked ? 'rgba(138,180,255,.65)' : 'var(--li-line,#343840)'};`;
    const dot = document.createElement('div');
    dot.style.cssText = `width:16px;height:16px;border-radius:50%;background:white;position:absolute;top:2px;left:${isChecked ? '19px' : '3px'};transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.35);`;
    sw.appendChild(dot);
    sw.onclick = () => {
      isChecked = !isChecked; onChange(isChecked);
      swLabel.textContent = isChecked ? 'ON' : 'OFF';
      sw.style.background = isChecked ? 'var(--li-accent,#8ab4ff)' : 'var(--li-surface-3,#272a2f)';
      sw.style.borderColor = isChecked ? 'rgba(138,180,255,.65)' : 'var(--li-line,#343840)';
      dot.style.left = isChecked ? '19px' : '3px';
    };
    right.appendChild(swLabel); right.appendChild(sw);
    wrap.appendChild(left); wrap.appendChild(right);
    return wrap;
  }

  function createSectionTitle(title, desc) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:10px;';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = UI.sectionTitle;
    wrap.appendChild(t);
    if (desc) {
      const d = document.createElement('div');
      d.textContent = desc;
      d.style.cssText = UI.subtle + 'margin-top:-2px;';
      wrap.appendChild(d);
    }
    return wrap;
  }

  function createMetricGrid(items) {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;';
    const nodes = {};
    (items || []).forEach((item) => {
      const c = document.createElement('div');
      c.style.cssText = 'border:1px solid var(--li-line,#343840);border-radius:8px;padding:12px;background:var(--li-surface-2,#202226);min-width:0;';
      const l = document.createElement('div');
      l.textContent = item.label || '';
      l.style.cssText = 'font-size:10px;color:var(--li-muted,#858c98);margin-bottom:5px;';
      const v = document.createElement('div');
      v.textContent = item.value || '';
      v.style.cssText = 'font-size:13px;font-weight:700;color:' + (item.ok ? 'var(--li-accent-strong,#c7d2fe)' : 'var(--li-warn,#d97706)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      c.appendChild(l);
      c.appendChild(v);
      grid.appendChild(c);
      if (item.key) nodes[item.key] = v;
    });
    return { grid, nodes };
  }

  function createSelectRow(label, value, options, onChange, opts) {
    opts = opts || {};
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:14px;width:100%;margin-bottom:10px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = UI.label;
    left.appendChild(l);
    if (opts.desc) {
      const d = document.createElement('div');
      d.textContent = opts.desc;
      d.style.cssText = UI.subtle;
      left.appendChild(d);
    }
    const sel = document.createElement('select');
    sel.style.cssText = UI.field + 'width:' + (opts.width || '220px') + ';';
    (options || []).forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = () => { if (typeof onChange === 'function') onChange(sel.value, sel); };
    row.appendChild(left);
    row.appendChild(sel);
    return { row, select: sel };
  }

  function createSegmentedRow(label, desc, value, options, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;gap:14px;margin-bottom:10px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div');
    t.textContent = label;
    t.style.cssText = UI.label;
    const d = document.createElement('div');
    d.textContent = desc || '';
    d.style.cssText = UI.subtle;
    left.appendChild(t);
    if (desc) left.appendChild(d);
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;';
    const buttons = [];
    const update = () => {
      buttons.forEach((btn) => {
        const on = btn.__value === value;
        btn.style.cssText = `padding:8px 13px;min-height:36px;font-size:12px;border-radius:8px;cursor:pointer;border:1px solid ${on ? 'rgba(138,180,255,.62)' : 'var(--li-line,#343840)'};background:${on ? 'var(--li-accent-bg,rgba(138,180,255,.13))' : 'var(--li-surface-3,#272a2f)'};color:${on ? 'var(--li-text,#f3f4f6)' : 'var(--li-text-soft,#b8bec8)'};font-weight:600;`;
      });
    };
    (options || []).forEach((opt) => {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.__value = opt.value;
      btn.onclick = () => {
        value = opt.value;
        if (typeof onChange === 'function') onChange(value);
        update();
      };
      buttons.push(btn);
      right.appendChild(btn);
    });
    update();
    wrap.appendChild(left);
    wrap.appendChild(right);
    return wrap;
  }

  function createActionButton(label, tone) {
    const btn = document.createElement('button');
    const styles = {
      primary: 'background:var(--li-accent-bg,rgba(138,180,255,.13));color:var(--li-text,#f3f4f6);border:1px solid rgba(138,180,255,.65);',
      success: 'background:rgba(129,140,248,.13);color:var(--li-text,#f3f4f6);border:1px solid rgba(129,140,248,.45);',
      danger: 'background:rgba(220,38,38,.12);color:#fecaca;border:1px solid rgba(220,38,38,.45);',
      ghost: 'background:var(--li-surface-3,#272a2f);color:var(--li-text-soft,#b8bec8);border:1px solid var(--li-line,#343840);'
    };
    btn.textContent = label;
    btn.style.cssText = 'min-height:36px;padding:8px 13px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0;' + (styles[tone || 'ghost'] || styles.ghost);
    return btn;
  }

  function createApiInput(config, prefix, nd, onChange) {
    const triggerSave = () => { if (typeof onChange === 'function') onChange(); };
    const apiTypeKey = prefix + 'ApiType';
    const keyKey = prefix === 'gemini' ? 'geminiKey' : prefix + 'Key';
    const jsonKey = prefix + 'VertexJson';
    const locKey = prefix + 'VertexLocation';
    const projKey = prefix + 'VertexProjectId';
    const fbScriptKey = prefix + 'FirebaseScript';
    const fbEmbKey = prefix + 'FirebaseEmbedKey';
    const S = UI.field;
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
    const btnKey = document.createElement('button');
    const btnVertex = document.createElement('button');
    const btnFirebase = document.createElement('button');
    const keyArea = document.createElement('div');
    const vertexArea = document.createElement('div');
    const firebaseArea = document.createElement('div');
    const curMode = () => config[apiTypeKey] || 'key';
    const sty = (on) => `min-height:32px;padding:7px 12px;font-size:12px;border-radius:8px;cursor:pointer;font-weight:800;border:1px solid ${on ? 'rgba(138,180,255,.65)' : 'var(--li-line,#343840)'};background:${on ? 'var(--li-accent-bg,rgba(138,180,255,.13))' : 'transparent'};color:${on ? 'var(--li-text,#f3f4f6)' : 'var(--li-text-soft,#b8bec8)'};`;
    const updateBtns = () => {
      const m = curMode();
      btnKey.style.cssText = sty(m === 'key');
      btnVertex.style.cssText = sty(m === 'vertex');
      btnFirebase.style.cssText = sty(m === 'firebase');
      keyArea.style.display = m === 'key' ? '' : 'none';
      vertexArea.style.display = m === 'vertex' ? '' : 'none';
      firebaseArea.style.display = m === 'firebase' ? '' : 'none';
    };
    btnKey.textContent = 'API Key';
    btnVertex.textContent = 'Vertex AI (JSON)';
    btnFirebase.textContent = 'Firebase';
    btnKey.onclick = () => { config[apiTypeKey] = 'key'; updateBtns(); triggerSave(); };
    btnVertex.onclick = () => { config[apiTypeKey] = 'vertex'; updateBtns(); triggerSave(); };
    btnFirebase.onclick = () => { config[apiTypeKey] = 'firebase'; updateBtns(); triggerSave(); };
    typeRow.appendChild(btnKey); typeRow.appendChild(btnVertex); typeRow.appendChild(btnFirebase);
    nd.appendChild(typeRow);
    // key 모드
    const ki = document.createElement('input'); ki.type = 'text';
    ki.value = config[keyKey] || ''; ki.placeholder = 'AIzaSy...';
    ki.setAttribute('autocomplete', 'off');
    ki.style.cssText = S + '-webkit-text-security:disc;';
    ki.onchange = () => {
      const val = ki.value.trim();
      if (val.startsWith('{') && val.includes('client_email')) {
        config[apiTypeKey] = 'vertex'; config[jsonKey] = val;
        ki.value = ''; updateBtns(); triggerSave(); return;
      }
      config[keyKey] = val;
      triggerSave();
    };
    keyArea.appendChild(ki); nd.appendChild(keyArea);
    // vertex 모드
    const jta = document.createElement('textarea');
    jta.value = config[jsonKey] || '';
    jta.placeholder = '{ "type": "service_account", ... }';
    jta.style.cssText = S + 'height:100px;font-family:monospace;resize:vertical;';
    jta.onchange = () => { config[jsonKey] = jta.value; triggerSave(); };
    vertexArea.appendChild(jta);
    const locRow = document.createElement('div');
    locRow.style.cssText = 'display:flex;gap:12px;margin-top:8px;';
    const locInput = document.createElement('input');
    locInput.value = config[locKey] || 'global';
    locInput.placeholder = 'Location'; locInput.style.cssText = S;
    locInput.onchange = () => { config[locKey] = locInput.value || 'global'; triggerSave(); };
    const projInput = document.createElement('input');
    projInput.value = config[projKey] || '';
    projInput.placeholder = 'Project ID'; projInput.style.cssText = S;
    projInput.onchange = () => { config[projKey] = projInput.value; triggerSave(); };
    const ld = document.createElement('div'); ld.style.flex = '1'; ld.appendChild(locInput);
    const pd = document.createElement('div'); pd.style.flex = '1'; pd.appendChild(projInput);
    locRow.appendChild(ld); locRow.appendChild(pd);
    vertexArea.appendChild(locRow); nd.appendChild(vertexArea);
    // firebase 모드: firebaseConfig 덩어리 붙여넣기 + 임베딩용 Gemini 키
    const fbNote = document.createElement('div');
    fbNote.textContent = 'Firebase SDK. Firebase 콘솔 > 프로젝트 설정 > 웹 앱의 firebaseConfig = {...} 덩어리를 그대로 붙여넣으면 됨';
    fbNote.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:6px;line-height:1.45;';
    firebaseArea.appendChild(fbNote);
    const fbTa = document.createElement('textarea');
    fbTa.value = config[fbScriptKey] || '';
    fbTa.placeholder = 'const firebaseConfig = {\n  apiKey: "...",\n  projectId: "...",\n  ...\n};';
    fbTa.style.cssText = S + 'height:120px;font-family:monospace;resize:vertical;margin-bottom:8px;';
    fbTa.onchange = () => { config[fbScriptKey] = fbTa.value; triggerSave(); };
    firebaseArea.appendChild(fbTa);
    const fbEmbNote = document.createElement('div');
    fbEmbNote.textContent = '의미 검색용 Gemini API Key. Firebase 방식은 검색 준비용 별도 키 필요. Google AI Studio에서 무료 키 발급 가능.';
    fbEmbNote.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:4px;line-height:1.45;';
    firebaseArea.appendChild(fbEmbNote);
    const fbEmbInput = document.createElement('input'); fbEmbInput.type = 'text';
    fbEmbInput.value = config[fbEmbKey] || ''; fbEmbInput.placeholder = 'AIzaSy...';
    fbEmbInput.setAttribute('autocomplete', 'off');
    fbEmbInput.style.cssText = S + '-webkit-text-security:disc;';
    fbEmbInput.onchange = () => { config[fbEmbKey] = fbEmbInput.value.trim(); triggerSave(); };
    firebaseArea.appendChild(fbEmbInput);
    nd.appendChild(firebaseArea);
    updateBtns();
  }

  Object.assign(C, {
    showStatusBadge, hideStatusBadge,
    humanizeStatusText,
    UI, setFullWidth, createToggleRow, createSectionTitle, createMetricGrid,
    createSelectRow, createSegmentedRow, createActionButton, createApiInput,
    __uiLoaded: true
  });
  console.log('[LoreCore:ui] loaded');
})();
