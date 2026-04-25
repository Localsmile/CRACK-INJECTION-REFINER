// crack-lore-core / ui-theme 모듈
// 역할: UI 색상, 간격, 공통 스타일 토큰
// 의존: 없음
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiThemeLoaded) return;

  const UI_THEME = {
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
    radius: {
      sm: '3px',
      md: '4px',
      lg: '6px',
      pill: '999px'
    },
    space: {
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '12px',
      xl: '16px'
    },
    font: {
      xs: '10px',
      sm: '11px',
      md: '12px',
      lg: '13px',
      xl: '14px'
    }
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

  Object.assign(C, {
    UI_THEME,
    uiStyle,
    __uiThemeLoaded: true
  });
  console.log('[LoreCore:ui-theme] loaded');
})();