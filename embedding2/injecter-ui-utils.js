// == 인젝터 UI 유틸리티 ==
// 역할: injecter-6 shell 및 패널 모듈 공용 헬퍼
// 의존: ModalManager는 shell 단계에서 확인
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI = _w.__LoreInjUI || {};
  if (UI.__utilsLoaded) return;

  const panelRegistry = UI.__panelRegistry || (UI.__panelRegistry = []);

  function waitFor(testFn, timeoutMs, intervalMs) {
    timeoutMs = timeoutMs || 15000;
    intervalMs = intervalMs || 50;
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        let ok = false;
        try { ok = !!testFn(); } catch (_) {}
        if (ok) return resolve(true);
        if (Date.now() - started >= timeoutMs) return reject(new Error('waitFor timeout'));
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function getLoreInj() {
    return _w.__LoreInj || null;
  }

  function getCore() {
    const L = getLoreInj();
    return L ? L.C : null;
  }

  function getModalManager() {
    return (typeof ModalManager !== 'undefined') ? ModalManager
      : (_w.ModalManager || (typeof window !== 'undefined' && window.ModalManager) || null);
  }

  function installDesignSystemStyle() {
    if (document.getElementById('lore-injector-design-system-style')) return;
    const style = document.createElement('style');
    style.id = 'lore-injector-design-system-style';
    style.textContent = [
      '.lore-panel-box{position:relative;overflow:hidden;}',
      '.lore-panel-box:before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,rgba(159,255,221,.42),transparent);pointer-events:none;}',
      '.lore-panel-box input,.lore-panel-box select,.lore-panel-box textarea{',
      '  border-radius:10px!important;',
      '  border:1px solid #2d3633!important;',
      '  background:#0b0f0e!important;',
      '  color:#d8e5e1!important;',
      '  box-shadow:inset 0 1px 0 rgba(255,255,255,.03)!important;',
      '  transition:border-color .14s ease,box-shadow .14s ease,background-color .14s ease!important;',
      '}',
      '.lore-panel-box input:focus,.lore-panel-box select:focus,.lore-panel-box textarea:focus{',
      '  outline:none!important;',
      '  border-color:#4a9!important;',
      '  box-shadow:0 0 0 3px rgba(68,170,153,.18),inset 0 1px 0 rgba(255,255,255,.04)!important;',
      '}',
      '.lore-panel-box input:disabled,.lore-panel-box textarea:disabled,.lore-panel-box select:disabled{',
      '  cursor:not-allowed!important;',
      '  filter:saturate(.65)!important;',
      '}',
      '.lore-card,.lore-row{border-radius:12px!important;background:linear-gradient(180deg,#111816,#0d1110)!important;border-color:#293632!important;}',
      '.lore-scroll-list::-webkit-scrollbar{width:8px;height:8px;}',
      '.lore-scroll-list::-webkit-scrollbar-thumb{background:#2a3a35;border-radius:999px;}',
      '.lore-scroll-list::-webkit-scrollbar-track{background:#0b0f0e;}',
      '.lore-actions{display:flex;flex-wrap:wrap;gap:8px;}',
      '.lore-action-group{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.lore-action-group-primary,.lore-action-group-secondary,.lore-action-group-danger{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.lore-action-group-secondary{opacity:.92;}',
      '.lore-action-group-danger{margin-left:auto;padding-left:8px;border-left:1px solid #2d3a35;}',
      '.lore-button{max-width:100%;}',
      '@media (max-width: 640px){',
      '  .lore-panel-box{padding:13px 12px!important;border-radius:14px!important;margin-bottom:12px!important;}',
      '  .lore-panel-box input,.lore-panel-box select,.lore-panel-box textarea{width:100%!important;max-width:100%!important;min-width:0!important;font-size:13px!important;}',
      '  .lore-panel-box .lore-actions,.lore-panel-box .lore-action-group,.lore-panel-box .lore-action-group-primary,.lore-panel-box .lore-action-group-secondary,.lore-panel-box .lore-action-group-danger{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;width:100%!important;}',
      '  .lore-panel-box .lore-action-group-danger{margin-left:0!important;padding-left:0!important;border-left:none!important;border-top:1px solid #2d3a35!important;padding-top:8px!important;}',
      '  .lore-panel-box .lore-button{width:100%!important;min-height:38px!important;white-space:normal!important;text-align:center!important;}',
      '  .lore-panel-box .lore-row{flex-direction:column!important;align-items:stretch!important;}',
      '  .lore-panel-box .lore-card{padding:10px!important;}',
      '  .lore-section-desc{margin-left:0!important;}',
      '}',
      '@media (min-width: 900px){',
      '  .lore-panel-box{padding:18px 20px!important;}',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  function setFullWidth(node) {
    installDesignSystemStyle();
    const C = getCore();
    if (C && typeof C.setFullWidth === 'function') {
      C.setFullWidth(node);
    }
    const p = node.parentElement;
    if (p) {
      p.style.display = 'block';
      p.style.padding = '0';
      p.style.border = 'none';
      p.style.background = 'transparent';
    }
    node.classList.add('lore-panel-box');
    node.style.cssText = [
      'width:100%',
      'display:block',
      'position:relative',
      'overflow:hidden',
      'padding:16px 18px',
      'box-sizing:border-box',
      'background:radial-gradient(circle at 0 0,rgba(80,180,150,.11),transparent 34%),linear-gradient(180deg,#141a18,#0d1110)',
      'border:1px solid #293632',
      'border-radius:16px',
      'margin-bottom:14px',
      'box-shadow:0 14px 34px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.035)'
    ].join(';') + ';';
  }

  function reportPanelError(panel, tag, err) {
    const msg = (err && err.message) ? err.message : String(err || 'unknown');
    console.error('[LoreInj:UI] ' + tag + ' render failed:', err);
    try {
      if (panel && typeof panel.addText === 'function') {
        panel.addText(tag + ' failed: ' + msg);
        return;
      }
    } catch (_) {}
    try {
      const box = document.createElement('div');
      box.textContent = tag + ' failed: ' + msg;
      box.style.cssText = 'padding:10px;border:1px solid #633;border-radius:6px;background:#1a0f0f;color:#d99;font-size:12px;line-height:1.5;white-space:pre-wrap;';
      if (panel && panel.appendChild) panel.appendChild(box);
    } catch (_) {}
  }

  function safePanel(tag, renderer) {
    return function(panel) {
      try {
        const result = renderer(panel);
        if (result && typeof result.then === 'function') {
          result.catch(err => reportPanelError(panel, tag, err));
        }
      } catch (err) {
        reportPanelError(panel, tag, err);
      }
    };
  }

  function openPanel(menu, renderer, title, tag) {
    const name = tag || title || 'Panel';
    if (!menu || typeof menu.replaceContentPanel !== 'function') {
      throw new Error('Modal panel API is unavailable');
    }
    return menu.replaceContentPanel(safePanel(name, renderer), title);
  }

  function registerPanel(panel) {
    if (!panel || !panel.id || typeof panel.render !== 'function') {
      console.warn('[LoreInj:UI] invalid panel registration:', panel);
      return;
    }
    const idx = panelRegistry.findIndex(x => x.id === panel.id);
    if (idx >= 0) panelRegistry[idx] = panel;
    else panelRegistry.push(panel);
    panelRegistry.sort((a, b) => (a.order || 100) - (b.order || 100));
  }

  function getPanels() {
    return panelRegistry.slice().sort((a, b) => (a.order || 100) - (b.order || 100));
  }

  function clearPanels() {
    panelRegistry.length = 0;
  }

  function createSection(title, desc) {
    installDesignSystemStyle();
    const wrap = document.createElement('div');
    wrap.className = 'lore-section';
    wrap.style.cssText = 'margin-bottom:14px;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:9px;margin-bottom:6px;';
    const mark = document.createElement('span');
    mark.style.cssText = 'width:7px;height:18px;border-radius:999px;background:linear-gradient(180deg,#9fd,#4a9);box-shadow:0 0 18px rgba(68,170,153,.36);flex:0 0 auto;';
    const t = document.createElement('div');
    t.className = 'lore-section-title';
    t.textContent = title;
    t.style.cssText = [
      'font-size:15px',
      'color:#dff8f1',
      'font-weight:800',
      'letter-spacing:-.012em',
      'line-height:1.3'
    ].join(';') + ';';
    head.appendChild(mark);
    head.appendChild(t);
    wrap.appendChild(head);
    if (desc) {
      const d = document.createElement('div');
      d.className = 'lore-section-desc';
      d.textContent = desc;
      d.style.cssText = 'font-size:12px;color:#9aa8a4;line-height:1.6;margin:5px 0 10px 16px;word-break:keep-all;';
      wrap.appendChild(d);
    }
    return wrap;
  }

  function createNotice(text, tone) {
    installDesignSystemStyle();
    const box = document.createElement('div');
    box.className = 'lore-notice';
    const palette = tone === 'warn'
      ? { border: '#7a5426', color: '#e4bc82', bg: 'linear-gradient(180deg,#22190d,#171107)' }
      : tone === 'error'
        ? { border: '#7d3c3c', color: '#e5a1a1', bg: 'linear-gradient(180deg,#241111,#160b0b)' }
        : { border: '#2d4a43', color: '#cbd8d4', bg: 'linear-gradient(180deg,#101816,#0c1110)' };
    box.textContent = text;
    box.style.cssText = [
      'padding:12px 13px',
      'border:1px solid ' + palette.border,
      'border-radius:12px',
      'background:' + palette.bg,
      'color:' + palette.color,
      'font-size:12px',
      'line-height:1.62',
      'white-space:pre-wrap',
      'word-break:keep-all',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.03)'
    ].join(';') + ';';
    return box;
  }

  function createSummaryGrid(items) {
    installDesignSystemStyle();
    const grid = document.createElement('div');
    grid.className = 'lore-summary-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:10px;margin:10px 0 2px;';
    (items || []).forEach(function(item) {
      const card = document.createElement('div');
      card.className = 'lore-card lore-summary-card';
      card.style.cssText = [
        'padding:12px 13px',
        'border:1px solid #2d3a35',
        'border-radius:14px',
        'background:radial-gradient(circle at 0 0,rgba(159,255,221,.10),transparent 42%),linear-gradient(180deg,#111916,#0d1211)',
        'box-shadow:0 10px 22px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.04)',
        'min-width:0'
      ].join(';') + ';';
      const label = document.createElement('div');
      label.textContent = item.label || '';
      label.style.cssText = 'font-size:11px;color:#8fa19c;line-height:1.35;margin-bottom:5px;';
      const value = document.createElement('div');
      value.textContent = item.value || '';
      value.style.cssText = 'font-size:14px;color:#e2f4ef;font-weight:800;line-height:1.35;word-break:keep-all;';
      card.appendChild(label);
      card.appendChild(value);
      if (item.desc) {
        const desc = document.createElement('div');
        desc.textContent = item.desc;
        desc.style.cssText = 'font-size:11px;color:#9aa8a4;line-height:1.45;margin-top:6px;word-break:keep-all;';
        card.appendChild(desc);
      }
      grid.appendChild(card);
    });
    return grid;
  }

  function createDetailsSection(title, desc, defaultOpen, renderer) {
    installDesignSystemStyle();
    const details = document.createElement('details');
    details.className = 'lore-detail-section';
    details.open = !!defaultOpen;
    details.style.cssText = [
      'margin:2px 0 0',
      'border:1px solid #2d3a35',
      'border-radius:14px',
      'background:radial-gradient(circle at 0 0,rgba(159,255,221,.08),transparent 42%),linear-gradient(180deg,#101715,#0b0f0e)',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.035)',
      'overflow:hidden'
    ].join(';') + ';';

    const summary = document.createElement('summary');
    summary.style.cssText = [
      'display:flex',
      'align-items:flex-start',
      'gap:10px',
      'padding:12px 13px',
      'cursor:pointer',
      'user-select:none',
      'list-style:none',
      'outline:none'
    ].join(';') + ';';

    const mark = document.createElement('span');
    mark.style.cssText = 'width:7px;height:18px;margin-top:1px;border-radius:999px;background:linear-gradient(180deg,#9fd,#4a9);box-shadow:0 0 18px rgba(68,170,153,.30);flex:0 0 auto;';

    const text = document.createElement('div');
    text.style.cssText = 'min-width:0;flex:1;';
    const t = document.createElement('div');
    t.textContent = title || '';
    t.style.cssText = 'font-size:14px;color:#dff8f1;font-weight:800;letter-spacing:-.012em;line-height:1.35;';
    text.appendChild(t);
    if (desc) {
      const d = document.createElement('div');
      d.textContent = desc;
      d.style.cssText = 'font-size:11px;color:#95a6a1;line-height:1.55;margin-top:3px;word-break:keep-all;';
      text.appendChild(d);
    }

    const chev = document.createElement('span');
    chev.textContent = '▾';
    chev.style.cssText = 'color:#8fa19c;font-size:13px;line-height:1.4;transition:transform .14s ease;flex:0 0 auto;margin-top:1px;';
    summary.appendChild(mark);
    summary.appendChild(text);
    summary.appendChild(chev);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'lore-detail-body';
    body.style.cssText = [
      'border-top:1px solid #22302c',
      'padding:12px 13px 13px',
      'display:flex',
      'flex-direction:column',
      'gap:8px'
    ].join(';') + ';';
    details.appendChild(body);
    details.contentBody = body;

    const sync = function() {
      chev.style.transform = details.open ? 'rotate(180deg)' : 'rotate(0deg)';
    };
    details.addEventListener('toggle', sync);
    sync();

    if (renderer) {
      try {
        const result = renderer(body, details);
        if (result && typeof result.then === 'function') {
          result.catch(function(err) { body.appendChild(createNotice('상세 영역 렌더링 실패: ' + String(err && err.message || err), 'error')); });
        }
      } catch (err) {
        body.appendChild(createNotice('상세 영역 렌더링 실패: ' + String(err && err.message || err), 'error'));
      }
    }

    return details;
  }

  function installPulseStatusStyle() {
    if (document.getElementById('lore-pulse-status-style')) return;
    const style = document.createElement('style');
    style.id = 'lore-pulse-status-style';
    style.textContent = [
      '@keyframes lorePulseSoft{0%{opacity:.45}50%{opacity:1}100%{opacity:.45}}',
      '.lore-pulse-status{',
      '  color:#9fd!important;',
      '  display:inline-block;',
      '  line-height:1.25;',
      '  transform:translateY(-2px);',
      '  will-change:opacity;',
      '  animation:lorePulseSoft 1.1s ease-in-out infinite;',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  function setPulseStatus(node, text, tone) {
    if (!node) return;
    installPulseStatusStyle();
    node.classList.add('lore-pulse-status');
    node.textContent = text;
    node.style.color = tone === 'warn' ? '#da8' : tone === 'error' ? '#d66' : '#9fd';
  }

  function clearPulseStatus(node, text, tone) {
    if (!node) return;
    node.classList.remove('lore-pulse-status');
    node.textContent = text || '';
    if (tone) node.style.color = tone === 'error' ? '#d66' : tone === 'warn' ? '#da8' : '#4a9';
  }

  function createActionGroup(primaryNodes, secondaryNodes, dangerNodes) {
    installDesignSystemStyle();
    const wrap = document.createElement('div');
    wrap.className = 'lore-action-group';
    const groups = [
      { cls: 'lore-action-group-primary', nodes: primaryNodes || [] },
      { cls: 'lore-action-group-secondary', nodes: secondaryNodes || [] },
      { cls: 'lore-action-group-danger', nodes: dangerNodes || [] }
    ];
    groups.forEach(function(group) {
      const nodes = Array.isArray(group.nodes) ? group.nodes : [group.nodes];
      const filtered = nodes.filter(Boolean);
      if (!filtered.length) return;
      const box = document.createElement('div');
      box.className = group.cls;
      filtered.forEach(function(node) { box.appendChild(node); });
      wrap.appendChild(box);
    });
    return wrap;
  }

  function createButton(label, opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const btn = document.createElement('button');
    btn.className = 'lore-button' + (opts.kind ? ' lore-button-' + opts.kind : '');
    btn.textContent = label;
    const palette = opts.kind === 'danger'
      ? { bg: 'linear-gradient(180deg,#8a3c3c,#682b2b)', border: '#a14d4d', color: '#fff', shadow: 'rgba(150,60,60,.24)' }
      : opts.kind === 'primary'
        ? { bg: 'linear-gradient(180deg,#2f6e91,#24536f)', border: '#3a87ad', color: '#fff', shadow: 'rgba(60,140,190,.22)' }
        : opts.kind === 'success'
          ? { bg: 'linear-gradient(180deg,#2d7a61,#24634f)', border: '#3c9b7b', color: '#fff', shadow: 'rgba(60,170,130,.22)' }
          : { bg: 'linear-gradient(180deg,#171d1b,#101413)', border: '#33413d', color: '#d5e2de', shadow: 'rgba(0,0,0,.18)' };
    btn.style.cssText = [
      'min-height:' + (opts.compact ? '30px' : '38px'),
      'padding:' + (opts.compact ? '6px 12px' : '10px 16px'),
      'font-size:12px',
      'border-radius:' + (opts.compact ? '9px' : '12px'),
      'cursor:pointer',
      'background:' + palette.bg,
      'color:' + palette.color,
      'border:1px solid ' + palette.border,
      'font-weight:' + (opts.bold ? '800' : '650'),
      'letter-spacing:-.005em',
      'transition:transform .10s ease,box-shadow .14s ease,border-color .14s ease,filter .14s ease,opacity .14s ease',
      'box-shadow:0 8px 18px ' + palette.shadow + ',inset 0 1px 0 rgba(255,255,255,.08)',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'gap:7px',
      'white-space:nowrap',
      'user-select:none'
    ].join(';') + ';';
    btn.addEventListener('mouseenter', function() {
      if (btn.disabled) return;
      btn.style.transform = 'translateY(-1px)';
      btn.style.filter = 'brightness(1.08)';
      btn.style.boxShadow = '0 12px 24px ' + palette.shadow + ',inset 0 1px 0 rgba(255,255,255,.10)';
    });
    btn.addEventListener('mouseleave', function() {
      btn.style.transform = '';
      btn.style.filter = '';
      btn.style.boxShadow = '0 8px 18px ' + palette.shadow + ',inset 0 1px 0 rgba(255,255,255,.08)';
    });
    btn.addEventListener('mousedown', function() {
      if (!btn.disabled) btn.style.transform = 'translateY(0) scale(.985)';
    });
    btn.addEventListener('mouseup', function() {
      if (!btn.disabled) btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('focus', function() {
      btn.style.outline = '2px solid rgba(159,255,221,.42)';
      btn.style.outlineOffset = '2px';
    });
    btn.addEventListener('blur', function() {
      btn.style.outline = '';
      btn.style.outlineOffset = '';
    });
    btn.addEventListener('disabledchange', function() {
      btn.style.opacity = btn.disabled ? '.55' : '';
      btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
    });
    const syncDisabled = function() {
      btn.style.opacity = btn.disabled ? '.55' : '';
      btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
    };
    const obs = new MutationObserver(syncDisabled);
    obs.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
    syncDisabled();
    if (opts.onClick) btn.onclick = opts.onClick;
    return btn;
  }

  function addBox(panel, renderer) {
    const runRenderer = function(nd) {
      setFullWidth(nd);
      try {
        const result = renderer(nd);
        if (result && typeof result.then === 'function') {
          result.catch(function(err) { reportPanelError(nd, 'box', err); });
        }
        return result;
      } catch (err) {
        reportPanelError(nd, 'box', err);
        return null;
      }
    };

    if (panel && typeof panel.addBoxedField === 'function') {
      panel.addBoxedField('', '', { onInit: runRenderer });
      return;
    }

    const nd = document.createElement('div');
    nd.className = 'lore-panel-box';
    if (panel && panel.appendChild) panel.appendChild(nd);
    return runRenderer(nd);
  }

  Object.assign(UI, {
    waitFor,
    getLoreInj,
    getCore,
    getModalManager,
    setFullWidth,
    safePanel,
    openPanel,
    reportPanelError,
    registerPanel,
    getPanels,
    clearPanels,
    createSection,
    createNotice,
    createSummaryGrid,
    createDetailsSection,
    createActionGroup,
    setPulseStatus,
    clearPulseStatus,
    createButton,
    addBox,
    __utilsLoaded: true
  });

  console.log('[LoreInj:UI] utils loaded');
})();