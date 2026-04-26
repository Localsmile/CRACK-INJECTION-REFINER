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
    style.id = 'lore-core-runtime-style';
    style.textContent = [
      '.lore-core-api-row{display:flex;gap:6px;flex-wrap:wrap;}',
      '@media (max-width:768px){#web-modal input,#web-modal select,#web-modal textarea{max-width:100%;box-sizing:border-box;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureStatusBadge() {
    ensureStatusStyle();
    if (_statusBadge) return _statusBadge;
    _statusBadge = document.createElement('div');
    _statusBadge.id = 'lore-status-badge';
    _statusBadge.style.cssText = 'position:fixed;bottom:70px;right:20px;z-index:999998;background:var(--lore-panel,#1a1a1a);border:1px solid var(--lore-line,#333);border-radius:20px;padding:8px 16px;font-size:12px;color:var(--lore-text,#ccc);box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;font-family:inherit;transition:opacity .3s;opacity:0;pointer-events:none;';
    _statusDot = document.createElement('span');
    _statusDot.className = 'lore-status-dot';
    _statusDot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--lore-accent,#4a9);animation:lore-pulse 1s infinite;flex-shrink:0;';
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
      var color = tone === 'error' ? 'var(--lore-danger,#d66)' : (tone === 'warn' ? 'var(--lore-warn,#da8)' : 'var(--lore-accent,#4a9)');
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
    const UI = _w.__LoreInjUI;
    if (UI && UI.createSettingRow && UI.createSwitch) {
      return UI.createSettingRow(title, desc, UI.createSwitch(!!isChecked, onChange, title));
    }
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title;
    t.style.cssText = 'font-size:13px;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc;
    d.style.cssText = 'font-size:11px;line-height:1.4;word-break:keep-all;opacity:.72;';
    left.appendChild(t); left.appendChild(d);
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', isChecked ? 'true' : 'false');
    sw.style.cssText = 'position:relative;width:42px;height:24px;border-radius:999px;border:1px solid currentColor;background:transparent;cursor:pointer;opacity:.9;';
    const dot = document.createElement('span');
    dot.style.cssText = 'position:absolute;top:3px;left:' + (isChecked ? '21px' : '3px') + ';width:16px;height:16px;border-radius:999px;background:currentColor;transition:left .12s ease;';
    sw.appendChild(dot);
    sw.onclick = function() {
      isChecked = !isChecked;
      sw.setAttribute('aria-checked', isChecked ? 'true' : 'false');
      dot.style.left = isChecked ? '21px' : '3px';
      if (onChange) onChange(isChecked);
    };
    wrap.appendChild(left);
    wrap.appendChild(sw);
    return wrap;
  }

  function createApiInput(config, prefix, nd, onChange) {
    const UI = _w.__LoreInjUI;
    const triggerSave = () => { if (typeof onChange === 'function') onChange(); };
    const apiTypeKey = prefix + 'ApiType';
    const keyKey = prefix === 'gemini' ? 'geminiKey' : prefix + 'Key';
    const jsonKey = prefix + 'VertexJson';
    const locKey = prefix + 'VertexLocation';
    const projKey = prefix + 'VertexProjectId';
    const fbScriptKey = prefix + 'FirebaseScript';
    const fbEmbKey = prefix + 'FirebaseEmbedKey';

    const makeButton = (label, kind) => UI && UI.createButton
      ? UI.createButton(label, { compact: true, kind: kind || '' })
      : document.createElement('button');
    const makeInput = (opts) => UI && UI.createInput ? UI.createInput(opts) : Object.assign(document.createElement('input'), { type: opts.type || 'text', value: opts.value || '', placeholder: opts.placeholder || '' });
    const makeTextarea = (opts) => UI && UI.createTextarea ? UI.createTextarea(opts) : Object.assign(document.createElement('textarea'), { value: opts.value || '', placeholder: opts.placeholder || '' });
    const makeField = (title, desc, control) => UI && UI.createField ? UI.createField(title, desc, control) : control;

    const areas = {
      key: document.createElement('div'),
      vertex: document.createElement('div'),
      firebase: document.createElement('div')
    };
    Object.keys(areas).forEach(k => { areas[k].style.cssText = 'display:flex;flex-direction:column;gap:10px;'; });

    const modeRow = document.createElement('div');
    modeRow.className = 'lore-actions lore-core-api-row';
    const btnKey = makeButton('API Key');
    const btnVertex = makeButton('Vertex AI');
    const btnFirebase = makeButton('Firebase');
    const buttons = { key: btnKey, vertex: btnVertex, firebase: btnFirebase };
    const curMode = () => config[apiTypeKey] || 'key';

    function setMode(mode) {
      config[apiTypeKey] = mode;
      updateMode();
      triggerSave();
    }

    function updateMode() {
      const mode = curMode();
      Object.keys(areas).forEach(k => { areas[k].style.display = mode === k ? 'flex' : 'none'; });
      Object.keys(buttons).forEach(k => {
        const active = mode === k;
        buttons[k].setAttribute('aria-pressed', active ? 'true' : 'false');
        buttons[k].style.opacity = active ? '1' : '.72';
        buttons[k].style.borderColor = active ? 'var(--lore-accent)' : 'var(--lore-line)';
      });
    }

    btnKey.onclick = () => setMode('key');
    btnVertex.onclick = () => setMode('vertex');
    btnFirebase.onclick = () => setMode('firebase');
    modeRow.appendChild(btnKey);
    modeRow.appendChild(btnVertex);
    modeRow.appendChild(btnFirebase);
    nd.appendChild(modeRow);

    const keyInput = makeInput({ value: config[keyKey] || '', placeholder: 'AIzaSy...', autocomplete: 'off', secure: true });
    keyInput.onchange = () => {
      const val = keyInput.value.trim();
      if (val.startsWith('{') && val.includes('client_email')) {
        config[apiTypeKey] = 'vertex';
        config[jsonKey] = val;
        keyInput.value = '';
        updateMode();
        triggerSave();
        return;
      }
      config[keyKey] = val;
      triggerSave();
    };
    areas.key.appendChild(makeField('API Key', '가장 단순한 연결 방식. 키는 전체 설정 초기화 후에도 유지', keyInput));

    const vertexJson = makeTextarea({ value: config[jsonKey] || '', placeholder: '{ "type": "service_account", ... }', monospace: true, height: '110px' });
    vertexJson.onchange = () => { config[jsonKey] = vertexJson.value; triggerSave(); };
    const vertexLocation = makeInput({ value: config[locKey] || 'global', placeholder: 'Location' });
    vertexLocation.onchange = () => { config[locKey] = vertexLocation.value || 'global'; triggerSave(); };
    const vertexProject = makeInput({ value: config[projKey] || '', placeholder: 'Project ID' });
    vertexProject.onchange = () => { config[projKey] = vertexProject.value; triggerSave(); };
    areas.vertex.appendChild(makeField('Vertex JSON', '서비스 계정 JSON 전체를 붙여넣기', vertexJson));
    areas.vertex.appendChild(UI && UI.createFormGrid ? UI.createFormGrid([
      makeField('Location', '비워두면 global 사용', vertexLocation),
      makeField('Project ID', 'JSON의 project_id와 다를 때만 입력', vertexProject)
    ]) : vertexLocation);

    const firebaseScript = makeTextarea({
      value: config[fbScriptKey] || '',
      placeholder: 'const firebaseConfig = {\n  apiKey: "...",\n  projectId: "...",\n  ...\n};',
      monospace: true,
      height: '130px'
    });
    firebaseScript.onchange = () => { config[fbScriptKey] = firebaseScript.value; triggerSave(); };
    const firebaseEmbed = makeInput({ value: config[fbEmbKey] || '', placeholder: 'AIzaSy...', autocomplete: 'off', secure: true });
    firebaseEmbed.onchange = () => { config[fbEmbKey] = firebaseEmbed.value.trim(); triggerSave(); };
    areas.firebase.appendChild(makeField('Firebase 설정', '웹 앱의 firebaseConfig 덩어리를 그대로 붙여넣기', firebaseScript));
    areas.firebase.appendChild(makeField('임베딩용 Gemini API Key', 'Firebase SDK는 임베딩을 직접 지원하지 않아 별도 키로 검색 데이터를 생성', firebaseEmbed));

    nd.appendChild(areas.key);
    nd.appendChild(areas.vertex);
    nd.appendChild(areas.firebase);
    updateMode();
  }

  ensureLoreUiKitStyle();

  Object.assign(C, {
    status, showStatusBadge, hideStatusBadge,
    setFullWidth, createToggleRow, createApiInput,
    __uiLoaded: true
  });
  console.log('[LoreCore:ui] loaded');
})();