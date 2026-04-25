// crack-lore-core / ui-navigation 모듈
// 역할: 설정 화면 및 목록 화면 내비게이션 헬퍼
// 의존: core-ui 권장
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiNavigationLoaded) return;

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
      text: '#ccc',
      textMuted: '#888',
      accent: '#4a9'
    },
    space: { xs:'4px', sm:'6px', md:'8px', lg:'12px' },
    radius: { sm:'3px', md:'4px', lg:'6px' },
    font: { xs:'10px', sm:'11px', md:'12px', lg:'13px' }
  };

  function createSegmentRow(opts = {}) {
    const row = document.createElement('div');
    row.className = 'lore-ui-segment-row';
    row.style.cssText = style({
      display: 'flex',
      alignItems: 'center',
      gap: opts.gap || T.space.sm,
      flexWrap: 'wrap',
      width: '100%',
      boxSizing: 'border-box',
      marginBottom: opts.marginBottom || T.space.md
    });
    return row;
  }

  function createSegmentButton(label, opts = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'lore-ui-segment-button';
    const active = !!opts.active;

    button.style.cssText = style({
      minHeight: '32px',
      padding: opts.padding || '5px 10px',
      border: '1px solid ' + (active ? T.color.accent : T.color.border),
      borderRadius: T.radius.lg,
      background: active ? '#163326' : 'transparent',
      color: active ? T.color.accent : T.color.text,
      fontSize: T.font.sm,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      boxSizing: 'border-box'
    });

    if (opts.title) button.title = opts.title;
    if (opts.onClick) button.onclick = opts.onClick;
    return button;
  }

  function createShortcutRow(items = [], opts = {}) {
    const row = createSegmentRow(opts);
    row.className += ' lore-ui-shortcut-row';

    items.forEach(item => {
      const btn = createSegmentButton(item.label, {
        title: item.title,
        active: item.active,
        onClick: item.onClick || (() => {
          if (item.target) C.scrollToSection(item.target);
        })
      });
      row.appendChild(btn);
    });

    return row;
  }

  function createSectionAnchor(id) {
    const anchor = document.createElement('div');
    anchor.className = 'lore-ui-section-anchor';
    anchor.dataset.sectionId = id || '';
    anchor.style.cssText = style({
      position: 'relative',
      top: '-8px',
      height: '1px',
      width: '1px',
      overflow: 'hidden'
    });
    return anchor;
  }

  function scrollToSection(target) {
    if (!target) return false;

    let el = null;
    if (typeof target === 'string') {
      el = document.querySelector('[data-section-id="' + target + '"]') || document.getElementById(target);
    } else if (target.nodeType === 1) {
      el = target;
    }

    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (_) {
      el.scrollIntoView();
    }
    return true;
  }

  function createBreadcrumb(parts = []) {
    const wrap = document.createElement('div');
    wrap.className = 'lore-ui-breadcrumb';
    wrap.style.cssText = style({
      display: 'flex',
      alignItems: 'center',
      gap: T.space.xs,
      flexWrap: 'wrap',
      color: T.color.textMuted,
      fontSize: T.font.sm,
      lineHeight: '1.4',
      marginBottom: T.space.md
    });

    parts.forEach((part, idx) => {
      const item = document.createElement('span');
      item.textContent = part;
      item.style.cssText = style({
        color: idx === parts.length - 1 ? T.color.text : T.color.textMuted
      });
      wrap.appendChild(item);

      if (idx < parts.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = '/';
        sep.style.cssText = style({ color: '#555' });
        wrap.appendChild(sep);
      }
    });

    return wrap;
  }

  function createSmallDivider(opts = {}) {
    const line = document.createElement('div');
    line.className = 'lore-ui-small-divider';
    line.style.cssText = style({
      height: '1px',
      width: '100%',
      background: opts.color || T.color.border,
      margin: opts.margin || T.space.md + ' 0',
      opacity: opts.opacity || '.8'
    });
    return line;
  }

  Object.assign(C, {
    createSegmentRow,
    createSegmentButton,
    createShortcutRow,
    createSectionAnchor,
    scrollToSection,
    createBreadcrumb,
    createSmallDivider,
    __uiNavigationLoaded: true
  });

  console.log('[LoreCore:ui-navigation] loaded');
})();