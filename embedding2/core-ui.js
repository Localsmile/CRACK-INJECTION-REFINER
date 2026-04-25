// crack-lore-core / ui 모듈
// 역할: 상태 배지, 토글/입력 UI 헬퍼, 공통 UI 컴포넌트 호환 레이어
// 의존: 없음 (kernel 이후면 로드 순서 무관)
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiLoaded) return;

  const UI_THEME = C.UI_THEME || {
    color: {
      bg: '#0a0a0a',
      panel: '#111',
      panel2: '#1a1a1a',
      border: '#333',
      borderSoft: '#222',
      text: '#ccc',
      textMuted: '#888',
      primary: '#258',
      success: '#285',
      warning: '#d96',
      danger: '#833',
      dangerText: '#d66',
      accent: '#4a9'
    },
    radius: { sm: '3px', md: '4px', lg: '6px', pill: '999px' },
    space: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
    font: { xs: '10px', sm: '11px', md: '12px', lg: '13px', xl: '14px' }
  };

  function uiStyle(parts) {
    if (!parts) return '';
    if (Array.isArray(parts)) return parts.filter(Boolean).join('');
    if (typeof parts === 'string') return parts;
    return Object.entries(parts)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v + ';')
      .join('');
  }

  function ensureUiStyle() {
    if (C.__uiBaseStyleAdded) return;
    C.__uiBaseStyleAdded = true;
    var style = document.createElement('style');
    style.textContent = [
      '@keyframes lore-pulse{0%,100%{opacity:1}50%{opacity:.3}}',
      '@media(max-width:640px){',
      '#lore-status-badge{left:12px!important;right:12px!important;bottom:calc(76px + env(safe-area-inset-bottom,0px))!important;max-width:none!important;justify-content:center;}',
      '.lore-ui-row-mobile{flex-direction:column!important;align-items:stretch!important;}',
      '.lore-ui-row-mobile>button,.lore-ui-row-mobile>select{width:100%!important;}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // 상태 배지
  var _statusBadge = null;
  var _statusLabel = null;
  function showStatusBadge(text) {
    ensureUiStyle();
    if (!_statusBadge) {
      _statusBadge = document.createElement('div');
      _statusBadge.id = 'lore-status-badge';
      _statusBadge.style.cssText = uiStyle({
        position: 'fixed',
        bottom: '70px',
        right: '20px',
        zIndex: '999998',
        background: UI_THEME.color.panel2,
        border: '1px solid ' + UI_THEME.color.border,
        borderRadius: '20px',
        padding: '8px 16px',
        fontSize: UI_THEME.font.md,
        color: UI_THEME.color.text,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'inherit',
        transition: 'opacity .3s',
        opacity: '0',
        pointerEvents: 'none',
        maxWidth: '360px'
      });
      var dot = document.createElement('span');
      dot.style.cssText = uiStyle({
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: UI_THEME.color.accent,
        animation: 'lore-pulse 1s infinite',
        flexShrink: '0'
      });
      _statusLabel = document.createElement('span');
      _statusLabel.style.cssText = uiStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
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

  // 공통 컴포넌트
  function createButton(label, opts = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label || '';
    const variant = opts.variant || 'secondary';
    const colors = {
      primary: { bg: UI_THEME.color.primary, fg: '#fff', border: UI_THEME.color.primary },
      success: { bg: UI_THEME.color.success, fg: '#fff', border: UI_THEME.color.success },
      danger: { bg: UI_THEME.color.danger, fg: '#fff', border: UI_THEME.color.danger },
      warning: { bg: 'transparent', fg: UI_THEME.color.warning, border: '#963' },
      secondary: { bg: 'transparent', fg: UI_THEME.color.text, border: '#555' },
      ghost: { bg: 'transparent', fg: UI_THEME.color.textMuted, border: UI_THEME.color.border }
    };
    const c = colors[variant] || colors.secondary;
    btn.style.cssText = uiStyle({
      padding: opts.compact ? '3px 8px' : '8px 14px',
      fontSize: opts.compact ? UI_THEME.font.sm : UI_THEME.font.md,
      borderRadius: UI_THEME.radius.md,
      cursor: 'pointer',
      background: c.bg,
      color: c.fg,
      border: '1px solid ' + c.border,
      fontWeight: opts.bold === false ? 'normal' : 'bold',
      width: opts.fullWidth ? '100%' : ''
    });
    if (opts.onClick) btn.onclick = opts.onClick;
    return btn;
  }

  function createInput(opts = {}) {
    const input = document.createElement('input');
    input.type = opts.type || 'text';
    input.value = opts.value || '';
    input.placeholder = opts.placeholder || '';
    input.style.cssText = uiStyle({
      width: '100%',
      padding: '6px 8px',
      border: '1px solid ' + UI_THEME.color.border,
      borderRadius: UI_THEME.radius.md,
      background: UI_THEME.color.bg,
      color: UI_THEME.color.text,
      fontSize: UI_THEME.font.md,
      boxSizing: 'border-box'
    }) + (opts.secret ? '-webkit-text-security:disc;' : '');
    if (opts.onChange) input.onchange = () => opts.onChange(input.value, input);
    if (opts.onInput) input.oninput = () => opts.onInput(input.value, input);
    return input;
  }

  function createTextarea(opts = {}) {
    const ta = document.createElement('textarea');
    ta.value = opts.value || '';
    ta.placeholder = opts.placeholder || '';
    ta.style.cssText = uiStyle({
      width: '100%',
      height: opts.height || '120px',
      padding: '8px',
      border: '1px solid ' + UI_THEME.color.border,
      borderRadius: UI_THEME.radius.md,
      background: UI_THEME.color.bg,
      color: UI_THEME.color.text,
      fontSize: UI_THEME.font.md,
      fontFamily: opts.monospace === false ? 'inherit' : 'monospace',
      resize: 'vertical',
      boxSizing: 'border-box'
    });
    if (opts.onChange) ta.onchange = () => opts.onChange(ta.value, ta);
    return ta;
  }

  function createSelect(options, value, onChange, opts = {}) {
    const sel = document.createElement('select');
    sel.style.cssText = uiStyle({
      width: opts.width || '100%',
      padding: '6px 8px',
      border: '1px solid ' + UI_THEME.color.border,
      borderRadius: UI_THEME.radius.md,
      background: UI_THEME.color.bg,
      color: UI_THEME.color.text,
      fontSize: UI_THEME.font.md,
      boxSizing: 'border-box'
    });
    (options || []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value != null ? o.value : o.v;
      opt.textContent = o.label != null ? o.label : o.l;
      sel.appendChild(opt);
    });
    sel.value = value || '';
    if (onChange) sel.onchange = () => onChange(sel.value, sel);
    return sel;
  }

  function createSectionTitle(text, opts = {}) {
    const el = document.createElement('div');
    el.textContent = text || '';
    el.style.cssText = uiStyle({
      fontSize: opts.size || UI_THEME.font.xl,
      color: opts.color || UI_THEME.color.accent,
      fontWeight: 'bold',
      marginBottom: UI_THEME.space.md,
      paddingBottom: opts.divider === false ? '' : UI_THEME.space.sm,
      borderBottom: opts.divider === false ? '' : '1px solid ' + UI_THEME.color.border
    });
    return el;
  }

  function createNotice(text, opts = {}) {
    const el = document.createElement('div');
    el.textContent = text || '';
    const type = opts.type || 'info';
    const color = type === 'danger' ? UI_THEME.color.dangerText : type === 'warning' ? UI_THEME.color.warning : UI_THEME.color.textMuted;
    el.style.cssText = uiStyle({
      fontSize: UI_THEME.font.md,
      color,
      background: UI_THEME.color.panel,
      border: '1px solid ' + UI_THEME.color.border,
      borderRadius: UI_THEME.radius.md,
      padding: '8px 10px',
      lineHeight: '1.5',
      wordBreak: 'keep-all'
    });
    return el;
  }

  function createHelpBlock(title, sections) {
    const wrap = document.createElement('div');
    wrap.style.cssText = uiStyle({ width: '100%', boxSizing: 'border-box' });
    const head = document.createElement('div');
    head.style.cssText = uiStyle({ display: 'flex', alignItems: 'center', gap: UI_THEME.space.md, cursor: 'pointer', padding: '2px 0' });
    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = uiStyle({ fontSize: UI_THEME.font.sm, color: UI_THEME.color.textMuted, width: '10px' });
    const tt = document.createElement('div');
    tt.textContent = title || '';
    tt.style.cssText = uiStyle({ fontSize: UI_THEME.font.lg, color: UI_THEME.color.accent, fontWeight: 'bold', flex: '1' });
    head.appendChild(arrow);
    head.appendChild(tt);

    const body = document.createElement('div');
    body.style.cssText = uiStyle({
      display: 'none',
      padding: '10px 2px 4px 2px',
      borderTop: '1px dashed ' + UI_THEME.color.border,
      marginTop: UI_THEME.space.sm,
      width: '100%',
      boxSizing: 'border-box'
    });

    (sections || []).forEach(s => {
      const lbl = document.createElement('div');
      lbl.textContent = s.label || '';
      lbl.style.cssText = uiStyle({ fontSize: UI_THEME.font.sm, color: UI_THEME.color.textMuted, fontWeight: 'bold', marginTop: '10px', marginBottom: '3px' });
      const txt = document.createElement('div');
      txt.textContent = s.text || '';
      txt.style.cssText = uiStyle({ fontSize: UI_THEME.font.md, color: UI_THEME.color.text, lineHeight: '1.75', wordBreak: 'keep-all' });
      body.appendChild(lbl);
      body.appendChild(txt);
    });

    head.onclick = () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      arrow.textContent = open ? '▶' : '▼';
    };

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function createConfirm(message, opts = {}) {
    return Promise.resolve(window.confirm(message || opts.message || '계속 진행할까요?'));
  }

  // 설정 UI 헬퍼
  function setFullWidth(node) {
    const p = node.parentElement;
    if (p) {
      p.style.display = 'block'; p.style.padding = '0';
      p.style.border = 'none'; p.style.background = 'transparent';
      Array.from(p.children).forEach(c => { if (c !== node) c.style.display = 'none'; });
    }
    node.style.cssText = uiStyle({
      width: '100%',
      display: 'block',
      padding: '10px 14px',
      boxSizing: 'border-box',
      background: 'transparent',
      border: 'none',
      marginBottom: '12px'
    });
    node.innerHTML = '';
  }

  function createToggleRow(title, desc, isChecked, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = uiStyle({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '10px',
      width: '100%',
      marginBottom: '8px'
    });
    const left = document.createElement('div');
    left.style.cssText = uiStyle({ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '0' });
    const t = document.createElement('div'); t.textContent = title;
    t.style.cssText = uiStyle({ fontSize: UI_THEME.font.lg, color: UI_THEME.color.text, fontWeight: 'bold' });
    const d = document.createElement('div'); d.textContent = desc;
    d.style.cssText = uiStyle({ fontSize: UI_THEME.font.sm, color: UI_THEME.color.textMuted, lineHeight: '1.4', wordBreak: 'keep-all' });
    left.appendChild(t); left.appendChild(d);
    const right = document.createElement('div');
    right.style.cssText = uiStyle({ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0' });
    const swLabel = document.createElement('span');
    swLabel.textContent = isChecked ? 'ON' : 'OFF';
    swLabel.style.cssText = uiStyle({ fontSize: UI_THEME.font.md, color: UI_THEME.color.text, fontWeight: 'bold', width: '22px', textAlign: 'center' });
    const sw = document.createElement('div');
    sw.style.cssText = uiStyle({ width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer', background: isChecked ? UI_THEME.color.success : '#444', position: 'relative', flexShrink: '0' });
    const dot = document.createElement('div');
    dot.style.cssText = uiStyle({ width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px', left: isChecked ? '18px' : '2px', transition: 'left .2s' });
    sw.appendChild(dot);
    sw.onclick = () => {
      isChecked = !isChecked; onChange(isChecked);
      swLabel.textContent = isChecked ? 'ON' : 'OFF';
      sw.style.background = isChecked ? UI_THEME.color.success : '#444';
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
    const typeRow = document.createElement('div');
    typeRow.className = 'lore-ui-row-mobile';
    typeRow.style.cssText = uiStyle({ display: 'flex', gap: '6px', marginBottom: '8px' });
    const btnKey = createButton('API Key', { compact: true, variant: 'secondary' });
    const btnVertex = createButton('Vertex AI (JSON)', { compact: true, variant: 'secondary' });
    const keyArea = document.createElement('div');
    const vertexArea = document.createElement('div');
    const isVertex = () => (config[apiTypeKey] || 'key') === 'vertex';
    const updateBtns = () => {
      const v = isVertex();
      btnKey.style.borderColor = !v ? UI_THEME.color.success : '#444';
      btnKey.style.background = !v ? UI_THEME.color.success : 'transparent';
      btnKey.style.color = !v ? '#fff' : UI_THEME.color.text;
      btnVertex.style.borderColor = v ? UI_THEME.color.success : '#444';
      btnVertex.style.background = v ? UI_THEME.color.success : 'transparent';
      btnVertex.style.color = v ? '#fff' : UI_THEME.color.text;
      keyArea.style.display = v ? 'none' : '';
      vertexArea.style.display = v ? '' : 'none';
    };
    btnKey.onclick = () => { config[apiTypeKey] = 'key'; updateBtns(); triggerSave(); };
    btnVertex.onclick = () => { config[apiTypeKey] = 'vertex'; updateBtns(); triggerSave(); };
    typeRow.appendChild(btnKey); typeRow.appendChild(btnVertex);
    nd.appendChild(typeRow);

    const ki = createInput({ value: config[keyKey] || '', placeholder: 'AIzaSy...', secret: true });
    ki.setAttribute('autocomplete', 'off');
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

    const jta = createTextarea({ value: config[jsonKey] || '', placeholder: '{ "type": "service_account", ... }', height: '100px' });
    jta.onchange = () => { config[jsonKey] = jta.value; triggerSave(); };
    vertexArea.appendChild(jta);

    const locRow = document.createElement('div');
    locRow.className = 'lore-ui-row-mobile';
    locRow.style.cssText = uiStyle({ display: 'flex', gap: '12px', marginTop: '8px' });
    const locInput = createInput({ value: config[locKey] || 'global', placeholder: 'Location' });
    locInput.onchange = () => { config[locKey] = locInput.value || 'global'; triggerSave(); };
    const projInput = createInput({ value: config[projKey] || '', placeholder: 'Project ID' });
    projInput.onchange = () => { config[projKey] = projInput.value; triggerSave(); };
    const ld = document.createElement('div'); ld.style.flex = '1'; ld.appendChild(locInput);
    const pd = document.createElement('div'); pd.style.flex = '1'; pd.appendChild(projInput);
    locRow.appendChild(ld); locRow.appendChild(pd);
    vertexArea.appendChild(locRow); nd.appendChild(vertexArea);
    updateBtns();
  }

  Object.assign(C, {
    UI_THEME, uiStyle,
    showStatusBadge, hideStatusBadge,
    createButton, createInput, createTextarea, createSelect, createSectionTitle, createNotice, createHelpBlock, createConfirm,
    setFullWidth, createToggleRow, createApiInput,
    __uiLoaded: true
  });
  console.log('[LoreCore:ui] loaded');
})();