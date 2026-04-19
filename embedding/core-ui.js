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
      var dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:lore-pulse 1s infinite;flex-shrink:0;';
      _statusLabel = document.createElement('span');
      _statusBadge.appendChild(dot);
      _statusBadge.appendChild(_statusLabel);
      document.body.appendChild(_statusBadge);
    }
    if (_statusLabel.textContent !== text) _statusLabel.textContent = text;
    if (_statusBadge.style.opacity !== '1') _statusBadge.style.opacity = '1';
    if (_statusBadge.style.pointerEvents !== 'auto') _statusBadge.style.pointerEvents = 'auto';
  }
  function hideStatusBadge() {
    if (_statusBadge) { _statusBadge.style.opacity = '0'; _statusBadge.style.pointerEvents = 'none'; }
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

  function createApiInput(config, prefix, nd, onChange) {
    const triggerSave = () => { if (typeof onChange === 'function') onChange(); };
    const apiTypeKey = prefix + 'ApiType';
    const keyKey = prefix === 'gemini' ? 'geminiKey' : prefix + 'Key';
    const jsonKey = prefix + 'VertexJson';
    const locKey = prefix + 'VertexLocation';
    const projKey = prefix + 'VertexProjectId';
    const fbKeyKey = prefix + 'FirebaseKey';
    const fbProjKey = prefix + 'FirebaseProjectId';
    const fbLocKey = prefix + 'FirebaseLocation';
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
    // firebase 모드
    const fbNote = document.createElement('div');
    fbNote.textContent = 'Firebase AI Logic REST. 3.x 모델은 location=global 필수. App Check 강제 프로젝트는 동작 불가.';
    fbNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:6px;line-height:1.4;';
    firebaseArea.appendChild(fbNote);
    const fbKi = document.createElement('input'); fbKi.type = 'text';
    fbKi.value = config[fbKeyKey] || ''; fbKi.placeholder = 'Firebase Web API Key (AIzaSy...)';
    fbKi.setAttribute('autocomplete', 'off');
    fbKi.style.cssText = S + '-webkit-text-security:disc;margin-bottom:8px;';
    fbKi.onchange = () => { config[fbKeyKey] = fbKi.value.trim(); triggerSave(); };
    firebaseArea.appendChild(fbKi);
    const fbRow = document.createElement('div');
    fbRow.style.cssText = 'display:flex;gap:12px;';
    const fbProjInput = document.createElement('input');
    fbProjInput.value = config[fbProjKey] || '';
    fbProjInput.placeholder = 'Project ID'; fbProjInput.style.cssText = S;
    fbProjInput.onchange = () => { config[fbProjKey] = fbProjInput.value.trim(); triggerSave(); };
    const fbLocInput = document.createElement('input');
    fbLocInput.value = config[fbLocKey] || 'global';
    fbLocInput.placeholder = 'Location (global 권장)'; fbLocInput.style.cssText = S;
    fbLocInput.onchange = () => { config[fbLocKey] = fbLocInput.value.trim() || 'global'; triggerSave(); };
    const fpd = document.createElement('div'); fpd.style.flex = '1'; fpd.appendChild(fbProjInput);
    const fld = document.createElement('div'); fld.style.flex = '1'; fld.appendChild(fbLocInput);
    fbRow.appendChild(fpd); fbRow.appendChild(fld);
    firebaseArea.appendChild(fbRow);
    nd.appendChild(firebaseArea);
    updateBtns();
  }

  Object.assign(C, {
    showStatusBadge, hideStatusBadge,
    setFullWidth, createToggleRow, createApiInput,
    __uiLoaded: true
  });
  console.log('[LoreCore:ui] loaded');
})();
