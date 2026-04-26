// == 인젝터 UI 유틸리티 ==
// 역할: injecter-6 shell 및 패널 모듈 공용 헬퍼
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

  function getLoreInj() { return _w.__LoreInj || null; }
  function getCore() { const L = getLoreInj(); return L ? L.C : null; }
  function getModalManager() {
    return (typeof ModalManager !== 'undefined') ? ModalManager
      : (_w.ModalManager || (typeof window !== 'undefined' && window.ModalManager) || null);
  }

  function installDesignSystemStyle() {
    if (document.getElementById('lore-injector-design-system-style')) return;
    const style = document.createElement('style');
    style.id = 'lore-injector-design-system-style';
    style.textContent = [
      ':root{',
      '  --lore-bg:#0f1110;--lore-panel:#151816;--lore-surface:#191d1a;--lore-surface-soft:#111412;',
      '  --lore-line:#303832;--lore-line-soft:#252b27;--lore-text:#e7eee9;--lore-sub:#9aa6a0;',
      '  --lore-accent:#7fd7bd;--lore-accent-soft:#203a32;--lore-danger:#d36b6b;--lore-danger-soft:#351d1d;--lore-warn:#d9ad68;',
      '}',
      '.lore-panel-box{position:relative;overflow:hidden;background:var(--lore-panel)!important;border:1px solid var(--lore-line)!important;border-radius:12px!important;box-shadow:none!important;}',
      '.lore-panel-box input,.lore-panel-box select,.lore-panel-box textarea{border-radius:8px!important;border:1px solid var(--lore-line)!important;background:#0d0f0e!important;color:var(--lore-text)!important;box-shadow:none!important;transition:border-color .12s ease,background-color .12s ease!important;}',
      '.lore-panel-box input:focus,.lore-panel-box select:focus,.lore-panel-box textarea:focus{outline:none!important;border-color:var(--lore-accent)!important;}',
      '.lore-panel-box input:disabled,.lore-panel-box textarea:disabled,.lore-panel-box select:disabled{cursor:not-allowed!important;opacity:.58!important;}',
      '.lore-card{border:1px solid var(--lore-line-soft)!important;border-radius:10px!important;background:var(--lore-surface)!important;box-shadow:none!important;}',
      '.lore-row{border:1px solid var(--lore-line-soft)!important;border-radius:10px!important;background:var(--lore-surface-soft)!important;box-shadow:none!important;}',
      '.lore-scroll-list::-webkit-scrollbar{width:8px;height:8px;}',
      '.lore-scroll-list::-webkit-scrollbar-thumb{background:#3a423e;border-radius:999px;}',
      '.lore-scroll-list::-webkit-scrollbar-track{background:#0d0f0e;}',
      '.lore-actions,.lore-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.lore-action-group{display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%;}',
      '.lore-action-group-primary,.lore-action-group-secondary,.lore-action-group-danger{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.lore-action-group-secondary{opacity:.94;}',
      '.lore-action-group-danger{margin-left:auto;padding-left:10px;border-left:1px solid var(--lore-line-soft);}',
      '.lore-button{max-width:100%;}',
      '.lore-help-button{width:24px;height:24px;border-radius:999px;border:1px solid var(--lore-line);background:#111412;color:var(--lore-accent);font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;line-height:1;box-shadow:none;}',
      '.lore-help-button:hover{border-color:var(--lore-accent);background:#17201d;}',
      '.lore-switch{position:relative;width:42px;height:24px;border-radius:999px;border:1px solid var(--lore-line);background:#202522;cursor:pointer;transition:background .12s ease,border-color .12s ease;flex:0 0 auto;}',
      '.lore-switch:before{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:999px;background:#aeb8b3;transition:left .12s ease,background .12s ease;}',
      '.lore-switch.is-on{background:var(--lore-accent-soft);border-color:#4aa386;}',
      '.lore-switch.is-on:before{left:21px;background:var(--lore-accent);}',
      '.lore-switch:focus{outline:2px solid rgba(127,215,189,.35);outline-offset:2px;}',
      '.lore-setting-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;width:100%;padding:12px 0;border-bottom:1px solid var(--lore-line-soft);}',
      '.lore-setting-row:last-child{border-bottom:none;}',
      '.lore-setting-title{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--lore-text);font-weight:800;line-height:1.35;}',
      '.lore-setting-desc{font-size:11px;color:var(--lore-sub);line-height:1.55;word-break:keep-all;margin-top:4px;}',
      '.lore-entry-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 11px;}',
      '.lore-entry-title{font-size:12px;color:var(--lore-text);font-weight:800;line-height:1.4;word-break:break-all;}',
      '.lore-entry-desc{font-size:11px;color:var(--lore-sub);line-height:1.5;margin-top:4px;word-break:break-all;}',
      '.lore-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:10px;}',
      '@media (max-width:640px){',
      '  .lore-panel-box{padding:13px 12px!important;border-radius:12px!important;margin-bottom:12px!important;}',
      '  .lore-panel-box input,.lore-panel-box select,.lore-panel-box textarea{width:100%!important;max-width:100%!important;min-width:0!important;font-size:13px!important;}',
      '  .lore-setting-row,.lore-entry-row{display:flex!important;flex-direction:column!important;align-items:stretch!important;}',
      '  .lore-panel-box .lore-actions,.lore-panel-box .lore-toolbar,.lore-panel-box .lore-action-group,.lore-panel-box .lore-action-group-primary,.lore-panel-box .lore-action-group-secondary,.lore-panel-box .lore-action-group-danger{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;width:100%!important;}',
      '  .lore-panel-box .lore-action-group-danger{margin-left:0!important;padding-left:0!important;border-left:none!important;border-top:1px solid var(--lore-line-soft)!important;padding-top:8px!important;}',
      '  .lore-panel-box .lore-button{width:100%!important;min-height:38px!important;white-space:normal!important;text-align:center!important;}',
      '  .lore-section-desc{margin-left:0!important;}',
      '}',
      '@media (min-width:900px){.lore-panel-box{padding:16px 18px!important;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function setFullWidth(node) {
    installDesignSystemStyle();
    const C = getCore();
    if (C && typeof C.setFullWidth === 'function') C.setFullWidth(node);
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
      'background:var(--lore-panel)',
      'border:1px solid var(--lore-line)',
      'border-radius:12px',
      'margin-bottom:14px',
      'box-shadow:none'
    ].join(';') + ';';
  }

  function reportPanelError(panel, tag, err) {
    const msg = (err && err.message) ? err.message : String(err || 'unknown');
    console.error('[LoreInj:UI] ' + tag + ' render failed:', err);
    try {
      if (panel && typeof panel.addText === 'function') {
        panel.addText(tag + ' 렌더링 실패: ' + msg);
        return;
      }
    } catch (_) {}
    try {
      const box = document.createElement('div');
      box.textContent = tag + ' 렌더링 실패: ' + msg;
      box.style.cssText = 'padding:10px;border:1px solid #633;border-radius:6px;background:#1a0f0f;color:#e2aaaa;font-size:12px;line-height:1.5;white-space:pre-wrap;';
      if (panel && panel.appendChild) panel.appendChild(box);
    } catch (_) {}
  }

  function safePanel(tag, renderer) {
    return function(panel) {
      try {
        const result = renderer(panel);
        if (result && typeof result.then === 'function') result.catch(err => reportPanelError(panel, tag, err));
      } catch (err) {
        reportPanelError(panel, tag, err);
      }
    };
  }

  function openPanel(menu, renderer, title, tag) {
    const name = tag || title || 'Panel';
    if (!menu || typeof menu.replaceContentPanel !== 'function') throw new Error('Modal panel API is unavailable');
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

  function getPanels() { return panelRegistry.slice().sort((a, b) => (a.order || 100) - (b.order || 100)); }
  function clearPanels() { panelRegistry.length = 0; }

  function createHelpIcon(title, body) {
    installDesignSystemStyle();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lore-help-button';
    btn.textContent = '?';
    btn.title = title || '도움말';
    btn.onclick = function(ev) {
      ev.preventDefault();
      ev.stopPropagation();

      const existing = document.querySelector('.lore-help-popover');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'lore-help-popover';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.46);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;';

      const card = document.createElement('div');
      card.style.cssText = 'width:min(520px,100%);max-height:min(72vh,620px);overflow:auto;border:1px solid var(--lore-line);border-radius:12px;background:#141715;color:var(--lore-text);box-shadow:0 18px 60px rgba(0,0,0,.45);';

      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid var(--lore-line-soft);';
      const h = document.createElement('div');
      h.textContent = title || '도움말';
      h.style.cssText = 'font-size:14px;font-weight:800;line-height:1.35;';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '닫기';
      close.style.cssText = 'border:1px solid var(--lore-line);border-radius:8px;background:#171a18;color:var(--lore-text);font-size:12px;padding:6px 10px;cursor:pointer;';
      close.onclick = function(){ overlay.remove(); };
      head.appendChild(h);
      head.appendChild(close);

      const content = document.createElement('div');
      content.style.cssText = 'padding:14px 15px;font-size:12px;line-height:1.75;color:#dbe5e0;white-space:pre-wrap;word-break:keep-all;';
      content.textContent = body || '설명 준비 중';

      card.appendChild(head);
      card.appendChild(content);
      overlay.appendChild(card);
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
      });
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', esc, true);
        }
      }, true);
      document.body.appendChild(overlay);
    };
    return btn;
  }

  function createSection(title, desc, help) {
    installDesignSystemStyle();
    const wrap = document.createElement('div');
    wrap.className = 'lore-section';
    wrap.style.cssText = 'margin-bottom:14px;';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:flex-start;gap:9px;margin-bottom:6px;';
    const mark = document.createElement('span');
    mark.style.cssText = 'width:4px;height:18px;border-radius:999px;background:#7fd7bd;flex:0 0 auto;margin-top:1px;';
    const text = document.createElement('div');
    text.style.cssText = 'min-width:0;flex:1;';
    const t = document.createElement('div');
    t.className = 'lore-section-title';
    t.textContent = title;
    t.style.cssText = 'font-size:15px;color:#e3ece8;font-weight:800;letter-spacing:-.012em;line-height:1.3;';
    text.appendChild(t);
    head.appendChild(mark);
    head.appendChild(text);
    if (help) head.appendChild(createHelpIcon(title, help));
    wrap.appendChild(head);
    if (desc) {
      const d = document.createElement('div');
      d.className = 'lore-section-desc';
      d.textContent = desc;
      d.style.cssText = 'font-size:12px;color:#9aa5a0;line-height:1.6;margin:5px 0 10px 13px;word-break:keep-all;';
      wrap.appendChild(d);
    }
    return wrap;
  }

  function createNotice(text, tone) {
    installDesignSystemStyle();
    const box = document.createElement('div');
    box.className = 'lore-notice';
    const palette = tone === 'warn'
      ? { border: '#6c5733', color: '#e0c38f', bg: '#17140e' }
      : tone === 'error'
        ? { border: '#6d3b3b', color: '#e5aaaa', bg: '#191010' }
        : { border: '#34433f', color: '#d1ddd8', bg: '#111412' };
    box.textContent = text;
    box.style.cssText = [
      'padding:11px 12px',
      'border:1px solid ' + palette.border,
      'border-radius:10px',
      'background:' + palette.bg,
      'color:' + palette.color,
      'font-size:12px',
      'line-height:1.62',
      'white-space:pre-wrap',
      'word-break:keep-all',
      'box-shadow:none'
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
      card.style.cssText = 'padding:12px 13px;border:1px solid #333a36;border-radius:10px;background:#181b19;box-shadow:none;min-width:0;';
      const label = document.createElement('div');
      label.textContent = item.label || '';
      label.style.cssText = 'font-size:11px;color:#9aa5a0;line-height:1.35;margin-bottom:5px;';
      const value = document.createElement('div');
      value.textContent = item.value || '';
      value.style.cssText = 'font-size:14px;color:#e3ece8;font-weight:800;line-height:1.35;word-break:keep-all;';
      card.appendChild(label);
      card.appendChild(value);
      if (item.desc) {
        const desc = document.createElement('div');
        desc.textContent = item.desc;
        desc.style.cssText = 'font-size:11px;color:#9aa5a0;line-height:1.45;margin-top:6px;word-break:keep-all;';
        card.appendChild(desc);
      }
      grid.appendChild(card);
    });
    return grid;
  }

  function createDetailsSection(title, desc, defaultOpen, renderer, help) {
    installDesignSystemStyle();
    const details = document.createElement('details');
    details.className = 'lore-detail-section';
    details.open = !!defaultOpen;
    details.style.cssText = 'margin:2px 0 0;border:1px solid #333a36;border-radius:10px;background:#111412;box-shadow:none;overflow:hidden;';

    const summary = document.createElement('summary');
    summary.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:12px 13px;cursor:pointer;user-select:none;list-style:none;outline:none;';

    const mark = document.createElement('span');
    mark.style.cssText = 'width:4px;height:18px;margin-top:1px;border-radius:999px;background:#7fd7bd;flex:0 0 auto;';

    const text = document.createElement('div');
    text.style.cssText = 'min-width:0;flex:1;';
    const t = document.createElement('div');
    t.textContent = title || '';
    t.style.cssText = 'font-size:14px;color:#e3ece8;font-weight:800;letter-spacing:-.012em;line-height:1.35;';
    text.appendChild(t);
    if (desc) {
      const d = document.createElement('div');
      d.textContent = desc;
      d.style.cssText = 'font-size:11px;color:#9aa5a0;line-height:1.55;margin-top:3px;word-break:keep-all;';
      text.appendChild(d);
    }

    const chev = document.createElement('span');
    chev.textContent = '▾';
    chev.style.cssText = 'color:#9aa5a0;font-size:13px;line-height:1.4;transition:transform .14s ease;flex:0 0 auto;margin-top:1px;';
    summary.appendChild(mark);
    summary.appendChild(text);
    if (help) summary.appendChild(createHelpIcon(title, help));
    summary.appendChild(chev);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'lore-detail-body';
    body.style.cssText = 'border-top:1px solid #262d2a;padding:12px 13px 13px;display:flex;flex-direction:column;gap:8px;';
    details.appendChild(body);
    details.contentBody = body;

    const sync = function() { chev.style.transform = details.open ? 'rotate(180deg)' : 'rotate(0deg)'; };
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
      '@keyframes lorePulseSoft{0%{opacity:.48}50%{opacity:1}100%{opacity:.48}}',
      '.lore-pulse-status{color:#7fd7bd!important;display:inline-block;line-height:1.25;transform:translateY(-2px);will-change:opacity;animation:lorePulseSoft 1.1s ease-in-out infinite;}'
    ].join('');
    document.head.appendChild(style);
  }

  function setPulseStatus(node, text, tone) {
    if (!node) return;
    installPulseStatusStyle();
    node.classList.add('lore-pulse-status');
    node.textContent = text;
    node.style.color = tone === 'warn' ? '#d9ad68' : tone === 'error' ? '#d36b6b' : '#7fd7bd';
  }

  function clearPulseStatus(node, text, tone) {
    if (!node) return;
    node.classList.remove('lore-pulse-status');
    node.textContent = text || '';
    if (tone) node.style.color = tone === 'error' ? '#d36b6b' : tone === 'warn' ? '#d9ad68' : '#7fd7bd';
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

  function createSettingRow(title, desc, control, help) {
    installDesignSystemStyle();
    const row = document.createElement('div');
    row.className = 'lore-setting-row';

    const left = document.createElement('div');
    left.style.cssText = 'min-width:0;flex:1;';
    const head = document.createElement('div');
    head.className = 'lore-setting-title';
    const label = document.createElement('div');
    label.textContent = title || '';
    head.appendChild(label);
    if (help) head.appendChild(createHelpIcon(title, help));
    left.appendChild(head);

    if (desc) {
      const d = document.createElement('div');
      d.className = 'lore-setting-desc';
      d.textContent = desc;
      left.appendChild(d);
    }

    row.appendChild(left);
    if (control) row.appendChild(control);
    return row;
  }

  function createToolbar(nodes) {
    installDesignSystemStyle();
    const row = document.createElement('div');
    row.className = 'lore-toolbar';
    (nodes || []).filter(Boolean).forEach(function(node) { row.appendChild(node); });
    return row;
  }

  function createCardGrid(items, onClick) {
    installDesignSystemStyle();
    const grid = document.createElement('div');
    grid.className = 'lore-card-grid';
    (items || []).forEach(function(item) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lore-card';
      card.style.cssText = 'padding:13px 14px;min-height:88px;font-size:12px;cursor:pointer;color:var(--lore-text);display:flex;flex-direction:column;gap:7px;text-align:left;align-items:flex-start;justify-content:flex-start;';
      const title = document.createElement('div');
      title.textContent = item.title || '';
      title.style.cssText = 'font-weight:800;color:var(--lore-accent);font-size:14px;line-height:1.35;';
      const desc = document.createElement('div');
      desc.textContent = item.desc || '';
      desc.style.cssText = 'font-size:11px;color:var(--lore-sub);line-height:1.45;word-break:keep-all;';
      card.appendChild(title);
      card.appendChild(desc);
      card.onclick = function() { if (onClick) onClick(item); };
      grid.appendChild(card);
    });
    return grid;
  }

  function createEntryRow(opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const row = document.createElement('div');
    row.className = 'lore-row lore-entry-row';

    const left = document.createElement('div');
    left.style.cssText = 'min-width:0;';
    const title = document.createElement('div');
    title.className = 'lore-entry-title';
    title.textContent = opts.title || '';
    left.appendChild(title);
    if (opts.desc) {
      const desc = document.createElement('div');
      desc.className = 'lore-entry-desc';
      desc.textContent = opts.desc;
      left.appendChild(desc);
    }

    row.appendChild(left);
    if (opts.actions) row.appendChild(opts.actions);
    return row;
  }

  function createButton(label, opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const btn = document.createElement('button');
    btn.className = 'lore-button' + (opts.kind ? ' lore-button-' + opts.kind : '');
    btn.textContent = label;
    const palette = opts.kind === 'danger'
      ? { bg: '#3a1e1e', border: '#7a4242', color: '#ffd8d8' }
      : opts.kind === 'primary'
        ? { bg: '#18362f', border: '#4aa386', color: '#eafff8' }
        : opts.kind === 'success'
          ? { bg: '#1d3a30', border: '#4aa386', color: '#eafff8' }
          : { bg: '#171a18', border: '#3a423e', color: '#dbe5e0' };
    btn.style.cssText = [
      'min-height:' + (opts.compact ? '30px' : '38px'),
      'padding:' + (opts.compact ? '6px 12px' : '10px 16px'),
      'font-size:12px',
      'border-radius:8px',
      'cursor:pointer',
      'background:' + palette.bg,
      'color:' + palette.color,
      'border:1px solid ' + palette.border,
      'font-weight:' + (opts.bold ? '800' : '650'),
      'letter-spacing:-.005em',
      'transition:background-color .12s ease,border-color .12s ease,opacity .12s ease',
      'box-shadow:none',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'gap:7px',
      'white-space:nowrap',
      'user-select:none'
    ].join(';') + ';';
    btn.addEventListener('mouseenter', function() {
      if (btn.disabled) return;
      btn.style.borderColor = '#7fd7bd';
      btn.style.background = opts.kind === 'danger' ? '#4a2424' : '#202622';
    });
    btn.addEventListener('mouseleave', function() {
      btn.style.borderColor = palette.border;
      btn.style.background = palette.bg;
    });
    btn.addEventListener('focus', function() { btn.style.outline = '2px solid rgba(127,215,189,.35)'; btn.style.outlineOffset = '2px'; });
    btn.addEventListener('blur', function() { btn.style.outline = ''; btn.style.outlineOffset = ''; });
    const syncDisabled = function() { btn.style.opacity = btn.disabled ? '.55' : ''; btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer'; };
    const obs = new MutationObserver(syncDisabled);
    obs.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
    syncDisabled();
    if (opts.onClick) btn.onclick = opts.onClick;
    return btn;
  }

  function createSwitch(checked, onChange, label) {
    installDesignSystemStyle();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lore-switch' + (checked ? ' is-on' : '');
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    btn.title = label || '토글';
    let value = !!checked;
    btn.onclick = function(ev) {
      ev.preventDefault();
      value = !value;
      btn.classList.toggle('is-on', value);
      btn.setAttribute('aria-checked', value ? 'true' : 'false');
      if (onChange) onChange(value);
    };
    btn.setValue = function(next) {
      value = !!next;
      btn.classList.toggle('is-on', value);
      btn.setAttribute('aria-checked', value ? 'true' : 'false');
    };
    btn.getValue = function() { return value; };
    return btn;
  }

  function addBox(panel, renderer) {
    const runRenderer = function(nd) {
      setFullWidth(nd);
      try {
        const result = renderer(nd);
        if (result && typeof result.then === 'function') result.catch(function(err) { reportPanelError(nd, 'box', err); });
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
    createHelpIcon,
    createActionGroup,
    createSettingRow,
    createToolbar,
    createCardGrid,
    createEntryRow,
    createSwitch,
    setPulseStatus,
    clearPulseStatus,
    createButton,
    addBox,
    __utilsLoaded: true
  });

  console.log('[LoreInj:UI] utils loaded');
})();