// crack-lore-core / ui-list-controls 모듈
// 역할: 목록 검색, 필터, 액션 UI 헬퍼
// 의존: core-ui, core-ui-layout 권장
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiListControlsLoaded) return;

  const style = C.uiStyle || function(obj) {
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v + ';')
      .join('');
  };

  const T = C.UI_THEME || {
    color: {
      border: '#333',
      panel: '#111',
      panel2: '#1a1a1a',
      text: '#ccc',
      textMuted: '#888',
      accent: '#4a9',
      danger: '#d66'
    },
    space: { xs:'4px', sm:'6px', md:'8px', lg:'12px' },
    radius: { sm:'3px', md:'4px', lg:'6px' },
    font: { xs:'10px', sm:'11px', md:'12px', lg:'13px' }
  };

  function createListToolbar(opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'lore-ui-list-toolbar';
    wrap.style.cssText = style({
      display: 'flex',
      flexDirection: 'column',
      gap: T.space.md,
      width: '100%',
      boxSizing: 'border-box',
      marginBottom: opts.marginBottom || T.space.lg
    });
    return wrap;
  }

  function createSearchInput(opts = {}) {
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = opts.placeholder || '검색어 입력';
    input.value = opts.value || '';
    input.className = 'lore-ui-search-input';
    input.style.cssText = style({
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      padding: '8px 10px',
      border: '1px solid ' + T.color.border,
      borderRadius: T.radius.md,
      background: '#0a0a0a',
      color: T.color.text,
      fontSize: T.font.md,
      outline: 'none'
    });
    if (opts.onInput) input.oninput = () => opts.onInput(input.value);
    return input;
  }

  function createFilterRow(opts = {}) {
    const row = document.createElement('div');
    row.className = 'lore-ui-filter-row';
    row.style.cssText = style({
      display: 'flex',
      alignItems: 'center',
      gap: T.space.sm,
      flexWrap: 'wrap',
      width: '100%',
      boxSizing: 'border-box'
    });
    return row;
  }

  function createFilterSelect(opts = {}) {
    const select = document.createElement('select');
    select.className = 'lore-ui-filter-select';
    select.style.cssText = style({
      flex: opts.flex || '1 1 120px',
      minWidth: opts.minWidth || '110px',
      maxWidth: '100%',
      boxSizing: 'border-box',
      padding: '6px 8px',
      border: '1px solid ' + T.color.border,
      borderRadius: T.radius.md,
      background: '#0a0a0a',
      color: T.color.text,
      fontSize: T.font.sm
    });

    (opts.options || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });

    if (opts.value !== undefined) select.value = opts.value;
    if (opts.onChange) select.onchange = () => opts.onChange(select.value);
    return select;
  }

  function createCountLabel(text) {
    const label = document.createElement('div');
    label.className = 'lore-ui-count-label';
    label.textContent = text || '';
    label.style.cssText = style({
      fontSize: T.font.sm,
      color: T.color.textMuted,
      lineHeight: '1.4'
    });
    return label;
  }

  function createCompactActionButton(label, opts = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'lore-ui-compact-action-button';
    const tone = opts.tone || 'default';

    const colorMap = {
      default: { color: T.color.text, border: '#555', background: 'transparent' },
      primary: { color: '#fff', border: '#258', background: '#258' },
      accent: { color: T.color.accent, border: '#264', background: 'transparent' },
      danger: { color: T.color.danger, border: '#633', background: 'transparent' },
      muted: { color: T.color.textMuted, border: '#444', background: 'transparent' }
    };
    const colors = colorMap[tone] || colorMap.default;

    button.style.cssText = style({
      minHeight: '32px',
      padding: opts.padding || '5px 10px',
      fontSize: T.font.sm,
      borderRadius: T.radius.sm,
      background: colors.background,
      border: '1px solid ' + colors.border,
      color: colors.color,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      boxSizing: 'border-box'
    });

    if (opts.title) button.title = opts.title;
    if (opts.onClick) button.onclick = opts.onClick;
    return button;
  }

  function createEmptyState(message, detail) {
    const box = document.createElement('div');
    box.className = 'lore-ui-empty-state';
    box.style.cssText = style({
      padding: '18px 12px',
      border: '1px dashed ' + T.color.border,
      borderRadius: T.radius.lg,
      background: '#0f0f0f',
      color: T.color.textMuted,
      fontSize: T.font.md,
      textAlign: 'center',
      lineHeight: '1.6',
      boxSizing: 'border-box'
    });

    const msg = document.createElement('div');
    msg.textContent = message || '표시할 항목이 없습니다.';
    box.appendChild(msg);

    if (detail) {
      const sub = document.createElement('div');
      sub.textContent = detail;
      sub.style.cssText = style({
        marginTop: T.space.xs,
        color: '#666',
        fontSize: T.font.sm
      });
      box.appendChild(sub);
    }

    return box;
  }

  Object.assign(C, {
    createListToolbar,
    createSearchInput,
    createFilterRow,
    createFilterSelect,
    createCountLabel,
    createCompactActionButton,
    createEmptyState,
    __uiListControlsLoaded: true
  });

  console.log('[LoreCore:ui-list-controls] loaded');
})();