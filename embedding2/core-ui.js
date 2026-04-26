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
  var _statusDot = null;
  var _statusStyleAdded = false;
  var _statusLabel = null;
  var _statusItems = {};
  var _statusCurrentKey = null;
  var _statusPriorities = { refiner: 40, extract: 30, rerank: 20, inject: 10, ui: 5, legacy: 1 };
  var _uiKitStyleAdded = false;

  function ensureStatusStyle() {
    if (_statusStyleAdded) return;
    _statusStyleAdded = true;
    var style = document.createElement('style');
    style.textContent = '@keyframes lore-pulse{0%,100%{opacity:1}50%{opacity:.35}}@media (prefers-reduced-motion: reduce){#lore-status-badge .lore-status-dot{animation:none!important;opacity:1!important;}}';
    document.head.appendChild(style);
  }

  function ensureLoreUiKitStyle() {
    if (_uiKitStyleAdded) return;
    _uiKitStyleAdded = true;
    var style = document.createElement('style');
    style.id = 'lore-ui-kit-style';
    style.textContent = [
      '.lore-panel-box{box-sizing:border-box;max-width:100%;}',
      '.lore-section{box-sizing:border-box;max-width:100%;}',
      '.lore-section-title{font-size:14px;color:#4a9;font-weight:bold;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #333;}',
      '.lore-section-desc{font-size:12px;color:#888;line-height:1.6;margin-bottom:8px;word-break:keep-all;}',
      '.lore-notice{box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;}',
      '.lore-button{min-height:32px;box-sizing:border-box;}',
      '.lore-row{display:flex;gap:10px;align-items:center;max-width:100%;box-sizing:border-box;}',
      '.lore-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}',
      '.lore-grid{display:grid;gap:8px;max-width:100%;box-sizing:border-box;}',
      '.lore-input,.lore-textarea{box-sizing:border-box;max-width:100%;}',
      '.lore-scroll-list{display:flex;flex-direction:column;gap:6px;max-width:100%;overflow:auto;}',
      '.lore-card{box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;}',
      '.lore-card-title{font-size:12px;color:#ccc;font-weight:bold;word-break:break-word;}',
      '.lore-card-desc{font-size:11px;color:#888;line-height:1.5;margin-top:3px;word-break:break-word;}',
      '@media (max-width:768px){',
      '  #web-modal .lore-row,.lore-row{flex-direction:column!important;align-items:stretch!important;}',
      '  #web-modal .lore-actions,.lore-actions{width:100%!important;justify-content:stretch!important;}',
      '  #web-modal .lore-actions button,.lore-actions button{flex:1 1 45%!important;}',
      '  #web-modal button,.lore-button{min-height:36px!important;}',
      '  #web-modal input,#web-modal select,#web-modal textarea{max-width:100%!important;box-sizing:border-box!important;}',
      '  #web-modal textarea,.lore-textarea{min-height:38vh;}',
      '  #web-modal [style*="grid-template-columns"]{grid-template-columns:1fr!important;}',
      '  #web-modal [style*="display:flex"]{flex-wrap:wrap;}',
      '  #web-modal .lore-card{align-items:stretch!important;}',
      '  #web-modal .lore-card .lore-actions{margin-top:6px;}',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureStatusBadge() {
    ensureStatusStyle();
    if (_statusBadge) return _statusBadge;
    _statusBadge = document.createElement('div');
    _statusBadge.id = 'lore-status-badge';
    _statusBadge.style.cssText = 'position:fixed;bottom:70px;right:20px;z-index:999998;background:#1a1a1a;border:1px solid #333;border-radius:20px;padding:8px 16px;font-size:12px;color:#ccc;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;font-family:inherit;transition:opacity .3s;opacity:0;pointer-events:none;';
    _statusDot = document.createElement('span');
    _statusDot.className = 'lore-status-dot';
    _statusDot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:lore-pulse 1s infinite;flex-shrink:0;';
    _statusLabel = document.createElement('span');
    _statusBadge.appendChild(_statusDot);
    _statusBadge.appendChild(_statusLabel);
    document.body.appendChild(_statusBadge);
    return _statusBadge;
  }

  function pickStatusItem() {
    var bestKey = null, best = null;
    Object.keys(_statusItems).forEach(function(key) {
      var item = _statusItems[key];
      if (!item || !item.text) return;
      if (!best || item.priority > best.priority || (item.priority === best.priority && item.updatedAt > best.updatedAt)) {
        bestKey = key; best = item;
      }
    });
    return { key: bestKey, item: best };
  }

  function renderStatus() {
    var picked = pickStatusItem();
    var badge = ensureStatusBadge();
    if (!picked.item) {
      _statusCurrentKey = null;
      if (badge.style.opacity !== '0') badge.style.opacity = '0';
      if (badge.style.pointerEvents !== 'none') badge.style.pointerEvents = 'none';
      return;
    }
    _statusCurrentKey = picked.key;
    if (_statusLabel.textContent !== picked.item.text) _statusLabel.textContent = picked.item.text;
    if (_statusDot) {
      var busy = picked.item.busy !== false;
      var tone = picked.item.tone || 'info';
      var color = tone === 'error' ? '#d66' : (tone === 'warn' ? '#da8' : (tone === 'done' ? '#4a9' : '#4a9'));
      if (_statusDot.style.background !== color) _statusDot.style.background = color;
      var anim = busy ? 'lore-pulse 1s infinite' : 'none';
      if (_statusDot.style.animation !== anim) _statusDot.style.animation = anim;
    }
    if (badge.style.opacity !== '1') badge.style.opacity = '1';
    if (badge.style.pointerEvents !== 'auto') badge.style.pointerEvents = 'auto';
  }

  const status = {
    set: function(owner, text, opts) {
      owner = owner || 'legacy';
      opts = opts || {};
      var prev = _statusItems[owner];
      var nextText = String(text || '');
      if (prev && prev.text === nextText && prev.busy === opts.busy && prev.tone === opts.tone) {
        prev.updatedAt = Date.now();
      } else {
        _statusItems[owner] = {
          text: nextText,
          busy: opts.busy !== false,
          tone: opts.tone || 'info',
          priority: opts.priority != null ? opts.priority : (_statusPriorities[owner] || 0),
          updatedAt: Date.now()
        };
      }
      renderStatus();
      if (opts.ttl && opts.ttl > 0) {
        setTimeout(function() {
          if (_statusItems[owner] && _statusItems[owner].text === nextText) status.clear(owner);
        }, opts.ttl);
      }
    },
    clear: function(owner) {
      owner = owner || 'legacy';
      if (_statusItems[owner]) delete _statusItems[owner];
      renderStatus();
    },
    clearAll: function() {
      _statusItems = {};
      renderStatus();
    },
    current: function() {
      var picked = pickStatusItem();
      return picked.item ? { owner: picked.key, text: picked.item.text } : null;
    }
  };

  function showStatusBadge(text) { status.set('legacy', text, { busy: true }); }
  function hideStatusBadge() { status.clear('legacy'); }

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
    wrap.className = 'lore-row';
    wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc;
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.4;word-break:keep-all;';
    left.appendChild(t); left.appendChild(d);
    const right = document.createElement('div');
    right.className = 'lore-actions';
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
    const fbScriptKey = prefix + 'FirebaseScript';
    const fbEmbKey = prefix + 'FirebaseEmbedKey';
    const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
    const typeRow = document.createElement('div');
    typeRow.className = 'lore-actions';
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
    locRow.className = 'lore-row';
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
    fbEmbNote.textContent = '임베딩용 Gemini API Key(구글 AI 스튜디오에서 발급. 매우 쉬움) — Firebase SDK는 임베딩 미지원이라 별도 키로 우회. embedding-001만 쓸 것';
    fbEmbNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;line-height:1.4;';
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

  ensureLoreUiKitStyle();

  Object.assign(C, {
    status, showStatusBadge, hideStatusBadge,
    setFullWidth, createToggleRow, createApiInput,
    __uiLoaded: true
  });
  console.log('[LoreCore:ui] loaded');
})();