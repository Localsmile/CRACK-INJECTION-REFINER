// crack-lore-core / ui-settings-layout 모듈
// 역할: 설정 화면 구조 헬퍼
// 의존: core-ui, core-ui-layout 권장
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiSettingsLayoutLoaded) return;

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
      warn: '#da8',
      danger: '#d66'
    },
    space: { xs:'4px', sm:'6px', md:'8px', lg:'12px', xl:'16px' },
    radius: { sm:'3px', md:'4px', lg:'6px' },
    font: { xs:'10px', sm:'11px', md:'12px', lg:'13px', xl:'14px' }
  };

  function createSettingsSection(title, opts = {}) {
    const section = document.createElement('section');
    section.className = 'lore-ui-settings-section';
    section.style.cssText = style({
      width: '100%',
      boxSizing: 'border-box',
      marginBottom: opts.marginBottom || T.space.lg,
      padding: opts.padding || '0'
    });

    const header = document.createElement('div');
    header.style.cssText = style({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: T.space.md,
      marginBottom: T.space.md,
      paddingBottom: T.space.sm,
      borderBottom: '1px solid ' + T.color.border
    });

    const left = document.createElement('div');
    left.style.cssText = style({
      display: 'flex',
      flexDirection: 'column',
      gap: T.space.xs,
      minWidth: '0'
    });

    const h = document.createElement('div');
    h.textContent = title || '설정';
    h.style.cssText = style({
      fontSize: T.font.xl,
      color: T.color.accent,
      fontWeight: 'bold',
      lineHeight: '1.4'
    });
    left.appendChild(h);

    if (opts.description) {
      const d = document.createElement('div');
      d.textContent = opts.description;
      d.style.cssText = style({
        fontSize: T.font.sm,
        color: T.color.textMuted,
        lineHeight: '1.5',
        wordBreak: 'keep-all'
      });
      left.appendChild(d);
    }

    header.appendChild(left);
    section.appendChild(header);
    return section;
  }

  function createSettingDescription(opts = {}) {
    const box = document.createElement('div');
    box.className = 'lore-ui-setting-description';
    box.style.cssText = style({
      padding: opts.padding || '8px 10px',
      border: '1px solid ' + (opts.borderColor || T.color.border),
      borderRadius: T.radius.md,
      background: opts.background || '#0f0f0f',
      color: T.color.text,
      fontSize: T.font.md,
      lineHeight: '1.65',
      wordBreak: 'keep-all',
      boxSizing: 'border-box'
    });

    if (opts.title) {
      const title = document.createElement('div');
      title.textContent = opts.title;
      title.style.cssText = style({
        color: opts.titleColor || T.color.accent,
        fontWeight: 'bold',
        marginBottom: T.space.xs
      });
      box.appendChild(title);
    }

    const lines = [];
    if (opts.summary) lines.push(opts.summary);
    if (opts.when) lines.push('사용: ' + opts.when);
    if (opts.recommend) lines.push('추천: ' + opts.recommend);
    if (opts.caution) lines.push('주의: ' + opts.caution);

    lines.forEach(text => {
      const p = document.createElement('div');
      p.textContent = text;
      box.appendChild(p);
    });

    return box;
  }

  function createSettingsGrid(opts = {}) {
    const grid = document.createElement('div');
    grid.className = 'lore-ui-settings-grid';
    grid.style.cssText = style({
      display: 'grid',
      gridTemplateColumns: opts.columns || 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: opts.gap || T.space.md,
      width: '100%',
      boxSizing: 'border-box'
    });
    return grid;
  }

  function createAdvancedSection(title, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'lore-ui-advanced-section';
    wrap.style.cssText = style({
      border: '1px solid ' + T.color.border,
      borderRadius: T.radius.lg,
      background: '#0f0f0f',
      overflow: 'hidden',
      boxSizing: 'border-box'
    });

    const head = document.createElement('button');
    head.type = 'button';
    head.style.cssText = style({
      width: '100%',
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: T.space.md,
      border: 'none',
      background: T.color.panel,
      color: T.color.text,
      cursor: 'pointer',
      textAlign: 'left',
      boxSizing: 'border-box'
    });

    const label = document.createElement('span');
    label.textContent = title || '고급 설정';
    label.style.cssText = style({
      fontSize: T.font.lg,
      fontWeight: 'bold'
    });

    const arrow = document.createElement('span');
    arrow.textContent = opts.open ? '접기' : '펼치기';
    arrow.style.cssText = style({
      fontSize: T.font.sm,
      color: T.color.textMuted,
      flexShrink: '0'
    });

    const body = document.createElement('div');
    body.style.cssText = style({
      display: opts.open ? 'block' : 'none',
      padding: T.space.lg,
      boxSizing: 'border-box'
    });

    head.appendChild(label);
    head.appendChild(arrow);
    head.onclick = () => {
      const open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      arrow.textContent = open ? '접기' : '펼치기';
    };

    wrap.appendChild(head);
    wrap.appendChild(body);
    wrap.body = body;
    return wrap;
  }

  function createSettingsActionBar(opts = {}) {
    const bar = document.createElement('div');
    bar.className = 'lore-ui-settings-action-bar';
    bar.style.cssText = style({
      display: 'flex',
      justifyContent: opts.justify || 'flex-end',
      alignItems: 'center',
      gap: T.space.sm,
      flexWrap: 'wrap',
      width: '100%',
      boxSizing: 'border-box',
      marginTop: opts.marginTop || T.space.lg,
      paddingTop: opts.paddingTop || T.space.md,
      borderTop: opts.borderTop === false ? '' : '1px solid ' + T.color.border
    });
    return bar;
  }

  function createWarningBlock(message, opts = {}) {
    const box = document.createElement('div');
    box.className = 'lore-ui-warning-block';
    box.textContent = message || '주의가 필요합니다.';
    box.style.cssText = style({
      padding: '8px 10px',
      border: '1px solid ' + (opts.danger ? '#633' : '#654'),
      borderRadius: T.radius.md,
      background: opts.danger ? '#1f1010' : '#1f1a10',
      color: opts.danger ? T.color.danger : T.color.warn,
      fontSize: T.font.sm,
      lineHeight: '1.6',
      wordBreak: 'keep-all',
      boxSizing: 'border-box'
    });
    return box;
  }

  Object.assign(C, {
    createSettingsSection,
    createSettingDescription,
    createSettingsGrid,
    createAdvancedSection,
    createSettingsActionBar,
    createWarningBlock,
    __uiSettingsLayoutLoaded: true
  });

  console.log('[LoreCore:ui-settings-layout] loaded');
})();