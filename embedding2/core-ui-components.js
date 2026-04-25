// crack-lore-core / ui-components 모듈
// 역할: 공통 UI 컴포넌트 생성 함수
// 의존: core-ui-theme 권장
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiComponentsLoaded) return;

  const T = C.UI_THEME || {
    color: { bg:'#0a0a0a', panel:'#111', panel2:'#1a1a1a', border:'#333', text:'#ccc', textMuted:'#888', primary:'#258', success:'#285', warning:'#d96', danger:'#833', dangerText:'#d66', accent:'#4a9' },
    radius: { sm:'3px', md:'4px', lg:'6px', pill:'999px' },
    space: { xs:'4px', sm:'6px', md:'8px', lg:'12px', xl:'16px' },
    font: { xs:'10px', sm:'11px', md:'12px', lg:'13px', xl:'14px' }
  };
  const style = C.uiStyle || function(obj) {
    return Object.entries(obj).map(([k,v]) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v + ';').join('');
  };

  function createButton(label, opts = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label || '';
    const variant = opts.variant || 'secondary';
    const colors = {
      primary: { bg: T.color.primary, fg: '#fff', border: T.color.primary },
      success: { bg: T.color.success, fg: '#fff', border: T.color.success },
      danger: { bg: T.color.danger, fg: '#fff', border: T.color.danger },
      warning: { bg: 'transparent', fg: T.color.warning, border: '#963' },
      secondary: { bg: 'transparent', fg: T.color.text, border: '#555' },
      ghost: { bg: 'transparent', fg: T.color.textMuted, border: T.color.border }
    };
    const c = colors[variant] || colors.secondary;
    btn.style.cssText = style({
      padding: opts.compact ? '3px 8px' : '8px 14px',
      fontSize: opts.compact ? T.font.sm : T.font.md,
      borderRadius: T.radius.md,
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
    input.style.cssText = style({
      width: '100%',
      padding: '6px 8px',
      border: '1px solid ' + T.color.border,
      borderRadius: T.radius.md,
      background: T.color.bg,
      color: T.color.text,
      fontSize: T.font.md,
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
    ta.style.cssText = style({
      width: '100%',
      height: opts.height || '120px',
      padding: '8px',
      border: '1px solid ' + T.color.border,
      borderRadius: T.radius.md,
      background: T.color.bg,
      color: T.color.text,
      fontSize: T.font.md,
      fontFamily: opts.monospace === false ? 'inherit' : 'monospace',
      resize: 'vertical',
      boxSizing: 'border-box'
    });
    if (opts.onChange) ta.onchange = () => opts.onChange(ta.value, ta);
    return ta;
  }

  function createSelect(options, value, onChange, opts = {}) {
    const sel = document.createElement('select');
    sel.style.cssText = style({
      width: opts.width || '100%',
      padding: '6px 8px',
      border: '1px solid ' + T.color.border,
      borderRadius: T.radius.md,
      background: T.color.bg,
      color: T.color.text,
      fontSize: T.font.md,
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
    el.style.cssText = style({
      fontSize: opts.size || T.font.xl,
      color: opts.color || T.color.accent,
      fontWeight: 'bold',
      marginBottom: T.space.md,
      paddingBottom: opts.divider === false ? '' : T.space.sm,
      borderBottom: opts.divider === false ? '' : '1px solid ' + T.color.border
    });
    return el;
  }

  function createNotice(text, opts = {}) {
    const el = document.createElement('div');
    el.textContent = text || '';
    const type = opts.type || 'info';
    const color = type === 'danger' ? T.color.dangerText : type === 'warning' ? T.color.warning : T.color.textMuted;
    el.style.cssText = style({
      fontSize: T.font.md,
      color,
      background: T.color.panel,
      border: '1px solid ' + T.color.border,
      borderRadius: T.radius.md,
      padding: '8px 10px',
      lineHeight: '1.5',
      wordBreak: 'keep-all'
    });
    return el;
  }

  function createHelpBlock(title, sections) {
    const wrap = document.createElement('div');
    wrap.style.cssText = style({
      width: '100%',
      boxSizing: 'border-box'
    });
    const head = document.createElement('div');
    head.style.cssText = style({
      display: 'flex',
      alignItems: 'center',
      gap: T.space.md,
      cursor: 'pointer',
      padding: '2px 0'
    });
    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = style({ fontSize: T.font.sm, color: T.color.textMuted, width: '10px' });
    const tt = document.createElement('div');
    tt.textContent = title || '';
    tt.style.cssText = style({ fontSize: T.font.lg, color: T.color.accent, fontWeight: 'bold', flex: '1' });
    head.appendChild(arrow);
    head.appendChild(tt);

    const body = document.createElement('div');
    body.style.cssText = style({
      display: 'none',
      padding: '10px 2px 4px 2px',
      borderTop: '1px dashed ' + T.color.border,
      marginTop: T.space.sm,
      width: '100%',
      boxSizing: 'border-box'
    });

    (sections || []).forEach(s => {
      const lbl = document.createElement('div');
      lbl.textContent = s.label || '';
      lbl.style.cssText = style({ fontSize: T.font.sm, color: T.color.textMuted, fontWeight: 'bold', marginTop: '10px', marginBottom: '3px' });
      const txt = document.createElement('div');
      txt.textContent = s.text || '';
      txt.style.cssText = style({ fontSize: T.font.md, color: T.color.text, lineHeight: '1.75', wordBreak: 'keep-all' });
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

  Object.assign(C, {
    createButton,
    createInput,
    createTextarea,
    createSelect,
    createSectionTitle,
    createNotice,
    createHelpBlock,
    __uiComponentsLoaded: true
  });
  console.log('[LoreCore:ui-components] loaded');
})();