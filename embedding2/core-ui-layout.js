// crack-lore-core / ui-layout 모듈
// 역할: 모바일 안전 레이아웃 헬퍼
// 의존: core-ui-theme 권장
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiLayoutLoaded) return;

  const T = C.UI_THEME || {
    color: { border:'#333', text:'#ccc', textMuted:'#888', panel:'#111' },
    radius: { md:'4px' },
    space: { sm:'6px', md:'8px', lg:'12px' },
    font: { sm:'11px', md:'12px', lg:'13px' }
  };
  const style = C.uiStyle || function(obj) {
    return Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + ':' + v + ';')
      .join('');
  };

  function createResponsiveRow(opts = {}) {
    const row = document.createElement('div');
    row.className = 'lore-ui-responsive-row';
    row.style.cssText = style({
      display: 'flex',
      alignItems: opts.align || 'center',
      justifyContent: opts.justify || 'space-between',
      gap: opts.gap || T.space.md,
      flexWrap: 'wrap',
      width: '100%',
      marginBottom: opts.marginBottom || T.space.md,
      boxSizing: 'border-box'
    });
    return row;
  }

  function createActionRow(opts = {}) {
    const row = document.createElement('div');
    row.className = 'lore-ui-action-row';
    row.style.cssText = style({
      display: 'flex',
      alignItems: 'center',
      justifyContent: opts.justify || 'flex-end',
      gap: opts.gap || T.space.sm,
      flexWrap: 'wrap',
      width: opts.fullWidth ? '100%' : '',
      boxSizing: 'border-box'
    });
    return row;
  }

  function makeMobileSafeSelect(select, width) {
    if (!select) return select;
    select.style.width = width ? 'min(' + width + ', 100%)' : '100%';
    select.style.maxWidth = '100%';
    select.style.boxSizing = 'border-box';
    return select;
  }

  function makeMobileSafeButton(button) {
    if (!button) return button;
    button.style.minHeight = button.style.minHeight || '32px';
    button.style.whiteSpace = button.style.whiteSpace || 'nowrap';
    return button;
  }

  function makeMobileSafeTextarea(textarea) {
    if (!textarea) return textarea;
    textarea.style.maxWidth = '100%';
    textarea.style.boxSizing = 'border-box';
    textarea.style.minHeight = textarea.style.minHeight || '120px';
    return textarea;
  }

  Object.assign(C, {
    createResponsiveRow,
    createActionRow,
    makeMobileSafeSelect,
    makeMobileSafeButton,
    makeMobileSafeTextarea,
    __uiLayoutLoaded: true
  });
  console.log('[LoreCore:ui-layout] loaded');
})();