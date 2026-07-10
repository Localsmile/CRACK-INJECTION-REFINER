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
      _statusBadge.style.cssText = 'position:fixed;bottom:calc(env(safe-area-inset-bottom, 0px) + 118px);right:20px;z-index:2147483646;background:#1a1a1a;border:1px solid #333;border-radius:20px;padding:8px 16px;font-size:12px;color:#ccc;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;font-family:inherit;transition:opacity .3s;opacity:0;pointer-events:none;';
      _statusDot = document.createElement('span');
      _statusDot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:lore-pulse 1s infinite;flex-shrink:0;';
      _statusLabel = document.createElement('span');
      _statusBadge.appendChild(_statusDot);
      _statusBadge.appendChild(_statusLabel);
    }
    // body가 아직 없거나 분리된 경우에도 다시 mount. 최소한 documentElement에라도 붙인다.
    var mountTarget = document.body || document.documentElement;
    if (mountTarget && _statusBadge.parentNode !== mountTarget) {
      try { mountTarget.appendChild(_statusBadge); } catch (_) {}
    }
    if (_statusLabel && _statusLabel.textContent !== text) _statusLabel.textContent = text;
    if (_statusBadge.style.opacity !== '1') _statusBadge.style.opacity = '1';
    if (_statusBadge.style.pointerEvents !== 'auto') _statusBadge.style.pointerEvents = 'auto';
    if (_statusAutoHideTimer) { clearTimeout(_statusAutoHideTimer); _statusAutoHideTimer = null; }
    if (text === '에리가 응답 기다리는 중') {
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

  function ensureLoreModalStyles() {
    if (document.getElementById('lore-inj-modal-style')) return;
    const style = document.createElement('style');
    style.id = 'lore-inj-modal-style';
    style.textContent = `
      .lore-inj-modal {
        --decentral-active-item:#2f8f78;
        --decentral-active-text:#48b69a;
        --decentral-background-active-item:rgba(47,143,120,.14);
      }
      .lore-inj-modal .decentral-modal { width:min(1080px,96vw); height:min(780px,84vh); max-height:92vh; border:1px solid var(--decentral-border); box-shadow:0 18px 60px rgba(0,0,0,.38); }
      .lore-inj-modal .decentral-menu-container { width:184px; min-width:184px; padding:14px 10px; }
      .lore-inj-modal .decentral-menu-element { font-size:13px; padding:10px 9px; }
      .lore-inj-modal .decentral-sub-menu-element { font-size:12px; padding:7px 8px; margin-left:8px; }
      .lore-inj-modal .decentral-menu-element[active="true"]:before,
      .lore-inj-modal .decentral-sub-menu-element[active="true"]:before { background:#2f8f78; }
      .lore-inj-modal .decentral-modal-title-container { min-height:54px; padding:10px 16px; box-sizing:border-box; }
      .lore-inj-modal .decentral-modal-title-icon { width:24px; height:24px; padding:0 10px 0 0; }
      .lore-inj-modal .decental-modal-title-text { margin:0; font-size:15px; font-weight:700; letter-spacing:0; }
      .lore-inj-modal .decentral-grid { gap:4px; grid-row-gap:4px; padding:10px 14px 20px; box-sizing:border-box; }
      .lore-inj-modal .decentral-grid-element,
      .lore-inj-modal .decentral-grid-element-long { padding:4px; }
      .lore-inj-modal .decentral-boxed-field { border-radius:4px; }
      .lore-inj-modal input,
      .lore-inj-modal textarea,
      .lore-inj-modal select { min-height:34px; border-radius:4px !important; border-color:rgba(127,127,127,.38) !important; letter-spacing:0; }
      .lore-inj-modal textarea { line-height:1.5; }
      .lore-inj-modal button { min-height:32px; border-radius:4px !important; letter-spacing:0; }
      .lore-inj-modal input:focus,
      .lore-inj-modal textarea:focus,
      .lore-inj-modal select:focus,
      .lore-inj-modal button:focus-visible { outline:2px solid #3c9ed0 !important; outline-offset:1px; }
      .lore-inj-modal details { border-radius:4px !important; }
      @media (max-width:700px) {
        .lore-inj-modal .decentral-modal { width:100%; height:100%; max-width:none; max-height:none; min-height:0; border:0; border-radius:0; }
        .lore-inj-modal .decentral-grid { grid-template-columns:minmax(0,1fr); padding:8px 10px 24px; }
        .lore-inj-modal .decentral-grid-element,
        .lore-inj-modal .decentral-grid-element-long,
        .lore-inj-modal .decentral-grid-element-long-semi-flat,
        .lore-inj-modal .decentral-grid-element-long-flat { grid-column:1; min-width:0; }
        .lore-inj-modal .decentral-mobile-menu-container { max-height:calc(100vh - 54px); padding:10px; box-sizing:border-box; }
        .lore-inj-modal input,
        .lore-inj-modal textarea,
        .lore-inj-modal select,
        .lore-inj-modal button { max-width:100%; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
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

  function createApiInput(config, prefix, nd, onChange, opts = {}) {
    const triggerSave = () => { if (typeof onChange === 'function') onChange(); };
    const apiTypeKey = prefix + 'ApiType';
    const keyKey = prefix === 'gemini' ? 'geminiKey' : prefix + 'Key';
    const jsonKey = prefix + 'VertexJson';
    const locKey = prefix + 'VertexLocation';
    const projKey = prefix + 'VertexProjectId';
    const fbScriptKey = prefix + 'FirebaseScript';
    const fbEmbKey = prefix + 'FirebaseEmbedKey';
    const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
    const btnKey = document.createElement('button');
    const btnVertex = document.createElement('button');
    const btnFirebase = document.createElement('button');
    const keyArea = document.createElement('div');
    const vertexArea = document.createElement('div');
    const firebaseArea = document.createElement('div');
    const curMode = () => config[apiTypeKey] || 'key';
    const sty = (on) => `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${on ? '#285' : '#444'};background:${on ? '#285' : 'transparent'};color:${on ? '#fff' : '#ccc'};`;
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
    if (!opts.hideModeSelector) nd.appendChild(typeRow);
    // key 모드
    const ki = document.createElement('input'); ki.type = 'password';
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
    // firebase 모드 — firebaseConfig 덩어리 붙여넣기 + 임베딩용 Gemini 키
    const fbNote = document.createElement('div');
    fbNote.textContent = 'Firebase SDK. Firebase 콘솔 > 프로젝트 설정 > 웹 앱의 firebaseConfig = {...} 덩어리를 그대로 붙여넣으면 됨';
    fbNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:6px;line-height:1.4;';
    firebaseArea.appendChild(fbNote);
    const fbTa = document.createElement('textarea');
    fbTa.value = config[fbScriptKey] || '';
    fbTa.placeholder = 'const firebaseConfig = {\n  apiKey: "...",\n  projectId: "...",\n  ...\n};';
    fbTa.style.cssText = S + 'height:120px;font-family:monospace;resize:vertical;margin-bottom:8px;';
    fbTa.onchange = () => { config[fbScriptKey] = fbTa.value; triggerSave(); };
    firebaseArea.appendChild(fbTa);
    const fbEmbNote = document.createElement('div');
    fbEmbNote.textContent = '의미 검색용 Gemini API Key. Firebase 방식은 검색 준비용 별도 키 필요. Google AI Studio에서 무료 키 발급 가능.';
    fbEmbNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;line-height:1.4;';
    firebaseArea.appendChild(fbEmbNote);
    const fbEmbInput = document.createElement('input'); fbEmbInput.type = 'password';
    fbEmbInput.value = config.autoExtGeminiEmbedKey || config[fbEmbKey] || ''; fbEmbInput.placeholder = 'AIzaSy...';
    fbEmbInput.setAttribute('autocomplete', 'off');
    fbEmbInput.style.cssText = S + '-webkit-text-security:disc;';
    fbEmbInput.onchange = () => {
      const val = fbEmbInput.value.trim();
      config.autoExtGeminiEmbedKey = val;
      config[fbEmbKey] = val;
      triggerSave();
    };
    firebaseArea.appendChild(fbEmbInput);
    nd.appendChild(firebaseArea);
    updateBtns();
  }

  Object.assign(C, {
    showStatusBadge, hideStatusBadge,
    setFullWidth, createToggleRow, createApiInput, ensureLoreModalStyles,
    __uiLoaded: true
  });
  console.log('[LoreCore:ui] loaded');
})();
