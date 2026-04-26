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
      '.lore-ui-input,.lore-ui-textarea,.lore-ui-select{width:100%;border-radius:8px!important;border:1px solid var(--lore-line)!important;background:#0d0f0e!important;color:var(--lore-text)!important;box-shadow:none!important;box-sizing:border-box!important;font-size:12px!important;}',
      '.lore-ui-input,.lore-ui-select{min-height:34px;padding:7px 9px!important;}',
      '.lore-ui-textarea{min-height:110px;padding:9px!important;resize:vertical;font-family:inherit;}',
      '.lore-ui-input:focus,.lore-ui-textarea:focus,.lore-ui-select:focus{outline:none!important;border-color:var(--lore-accent)!important;}',
      '.lore-ui-field{display:flex;flex-direction:column;gap:5px;min-width:0;}',
      '.lore-ui-field-label{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:var(--lore-text);line-height:1.35;}',
      '.lore-ui-field-desc{font-size:11px;color:var(--lore-sub);line-height:1.5;word-break:keep-all;}',
      '.lore-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px;}',
      '.lore-inline-status{font-size:11px;color:var(--lore-sub);line-height:1.5;min-height:16px;white-space:pre-wrap;word-break:keep-all;}',
      '.lore-modal-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;}',
      '.lore-modal-card{width:min(720px,100%);max-height:min(86vh,760px);overflow:auto;border:1px solid var(--lore-line);border-radius:14px;background:var(--lore-panel);color:var(--lore-text);box-shadow:0 18px 60px rgba(0,0,0,.45);}',
      '.lore-modal-card.is-wide{width:min(980px,100%);}',
      '.lore-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--lore-line-soft);}',
      '.lore-modal-title{font-size:15px;font-weight:850;line-height:1.35;color:var(--lore-text);}',
      '.lore-modal-body{padding:15px 16px;display:flex;flex-direction:column;gap:12px;}',
      '.lore-modal-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:13px 16px;border-top:1px solid var(--lore-line-soft);}',
      '.lore-toast-stack{position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;max-width:min(360px,calc(100vw - 36px));}',
      '.lore-toast{border:1px solid var(--lore-line);border-radius:10px;background:var(--lore-surface);color:var(--lore-text);padding:10px 12px;font-size:12px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,.32);}',
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

  function appendHelpLine(parent, label, value, tone) {
    if (!value) return;
    const row = document.createElement('div');
    row.style.cssText = 'border:1px solid var(--lore-line-soft);border-radius:10px;background:var(--lore-surface-soft);padding:9px 10px;';
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:11px;font-weight:850;color:' + (tone === 'warn' ? 'var(--lore-warn)' : 'var(--lore-accent)') + ';line-height:1.35;margin-bottom:4px;';
    const v = document.createElement('div');
    v.textContent = value;
    v.style.cssText = 'font-size:12px;color:var(--lore-text);line-height:1.65;white-space:pre-wrap;word-break:keep-all;';
    row.appendChild(l);
    row.appendChild(v);
    parent.appendChild(row);
  }

  function renderHelpBody(content, help) {
    if (!help || typeof help === 'string') {
      content.textContent = help || '설명 준비 중';
      content.style.whiteSpace = 'pre-wrap';
      return;
    }
    const intro = help.body || help.desc || help.summary || '';
    appendHelpLine(content, '무엇을 바꾸는 설정인가', help.what || intro);
    appendHelpLine(content, '예시', help.example);
    appendHelpLine(content, '권장값', help.recommended);
    appendHelpLine(content, '주의할 점', help.warning, 'warn');
    appendHelpLine(content, '바뀌는 동작', help.result);
    if (Array.isArray(help.steps) && help.steps.length) {
      appendHelpLine(content, '사용 순서', help.steps.map(function(s, i){ return (i + 1) + '. ' + s; }).join('\n'));
    }
    if (!content.childNodes.length) content.textContent = '설명 준비 중';
  }

  function createHelpIcon(title, body) {
    installDesignSystemStyle();
    const helpTitle = (body && typeof body === 'object' && body.title) ? body.title : title;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lore-help-button';
    btn.textContent = '?';
    btn.title = helpTitle || '도움말';
    btn.onclick = function(ev) {
      ev.preventDefault();
      ev.stopPropagation();

      const existing = document.querySelector('.lore-help-popover');
      if (existing) existing.remove();

      const modal = createModal({
        title: helpTitle || '도움말',
        size: 'normal',
        className: 'lore-help-popover',
        closeLabel: '닫기'
      });
      modal.body.style.fontSize = '12px';
      modal.body.style.lineHeight = '1.75';
      modal.body.style.color = 'var(--lore-text)';
      renderHelpBody(modal.body, body);
      modal.open();
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
    box.className = 'lore-notice lore-notice-' + (tone || 'info');
    const palette = tone === 'warn'
      ? { border: 'var(--lore-warn)', color: 'var(--lore-warn)', bg: 'rgba(217,173,104,.08)' }
      : tone === 'error'
        ? { border: 'var(--lore-danger)', color: '#ffd8d8', bg: 'var(--lore-danger-soft)' }
        : { border: 'var(--lore-line)', color: 'var(--lore-text)', bg: 'var(--lore-surface-soft)' };
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

  function createInput(opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const input = document.createElement('input');
    input.className = 'lore-ui-input';
    input.type = opts.type || 'text';
    if (opts.value !== undefined) input.value = opts.value;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step !== undefined) input.step = opts.step;
    if (opts.autocomplete) input.setAttribute('autocomplete', opts.autocomplete);
    if (opts.secure) input.style.webkitTextSecurity = 'disc';
    if (opts.onChange) input.onchange = function(){ opts.onChange(input.value, input); };
    return input;
  }

  function createTextarea(opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const ta = document.createElement('textarea');
    ta.className = 'lore-ui-textarea';
    if (opts.value !== undefined) ta.value = opts.value;
    if (opts.placeholder) ta.placeholder = opts.placeholder;
    if (opts.rows) ta.rows = opts.rows;
    if (opts.monospace) ta.style.fontFamily = 'monospace';
    if (opts.height) ta.style.minHeight = opts.height;
    if (opts.onChange) ta.onchange = function(){ opts.onChange(ta.value, ta); };
    return ta;
  }

  function createSelect(opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const sel = document.createElement('select');
    sel.className = 'lore-ui-select';
    (opts.options || []).forEach(function(item) {
      if (item && item.options) {
        const group = document.createElement('optgroup');
        group.label = item.label || '';
        item.options.forEach(function(child) {
          const opt = document.createElement('option');
          opt.value = child.value;
          opt.textContent = child.label;
          group.appendChild(opt);
        });
        sel.appendChild(group);
      } else {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        sel.appendChild(opt);
      }
    });
    if (opts.value !== undefined) sel.value = opts.value;
    if (opts.onChange) sel.onchange = function(){ opts.onChange(sel.value, sel); };
    return sel;
  }

  function createField(title, desc, control, help) {
    installDesignSystemStyle();
    const field = document.createElement('label');
    field.className = 'lore-ui-field';
    const head = document.createElement('div');
    head.className = 'lore-ui-field-label';
    const text = document.createElement('span');
    text.textContent = title || '';
    head.appendChild(text);
    if (help) head.appendChild(createHelpIcon(title, help));
    field.appendChild(head);
    if (desc) {
      const d = document.createElement('div');
      d.className = 'lore-ui-field-desc';
      d.textContent = desc;
      field.appendChild(d);
    }
    if (control) field.appendChild(control);
    return field;
  }

  function createFormGrid(nodes) {
    installDesignSystemStyle();
    const grid = document.createElement('div');
    grid.className = 'lore-form-grid';
    (nodes || []).filter(Boolean).forEach(function(node) { grid.appendChild(node); });
    return grid;
  }

  function createInlineStatus(initialText, tone) {
    installDesignSystemStyle();
    const node = document.createElement('div');
    node.className = 'lore-inline-status';
    node.setStatus = function(text, nextTone) {
      node.textContent = text || '';
      const t = nextTone || tone || 'info';
      node.style.color = t === 'error' ? 'var(--lore-danger)' : t === 'warn' ? 'var(--lore-warn)' : t === 'success' ? 'var(--lore-accent)' : 'var(--lore-sub)';
    };
    node.setStatus(initialText || '', tone || 'info');
    return node;
  }

  function createModal(opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'lore-modal-overlay' + (opts.className ? ' ' + opts.className : '');
    const card = document.createElement('div');
    card.className = 'lore-modal-card' + (opts.size === 'wide' ? ' is-wide' : '');
    const head = document.createElement('div');
    head.className = 'lore-modal-head';
    const title = document.createElement('div');
    title.className = 'lore-modal-title';
    title.textContent = opts.title || '';
    const close = createButton(opts.closeLabel || '닫기', { compact: true });
    head.appendChild(title);
    head.appendChild(close);
    const body = document.createElement('div');
    body.className = 'lore-modal-body';
    const actions = document.createElement('div');
    actions.className = 'lore-modal-actions';
    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(actions);
    overlay.appendChild(card);
    function dispose(callOnClose) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
      if (callOnClose && opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape' && opts.closeOnEsc !== false) dispose(true);
    }
    close.onclick = function(){ dispose(true); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay && opts.closeOnBackdrop !== false) dispose(true); });
    document.addEventListener('keydown', onKey, true);
    return {
      overlay: overlay,
      card: card,
      body: body,
      actions: actions,
      close: function(){ dispose(false); },
      open: function(){ document.body.appendChild(overlay); return this; }
    };
  }

  function createConfirmDialog(opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
      const modal = createModal({ title: opts.title || '확인', closeLabel: opts.cancelLabel || '취소', size: opts.size });
      if (opts.message) modal.body.appendChild(createNotice(opts.message, opts.danger ? 'warn' : 'info'));
      const cancel = createButton(opts.cancelLabel || '취소', { compact: false });
      const ok = createButton(opts.confirmLabel || '확인', { kind: opts.danger ? 'danger' : 'primary', bold: true });
      cancel.onclick = function(){ modal.close(); resolve(false); };
      ok.onclick = function(){ modal.close(); resolve(true); };
      modal.actions.appendChild(cancel);
      modal.actions.appendChild(ok);
      modal.open();
    });
  }

  function createAlertDialog(opts) {
    opts = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise(function(resolve) {
      const modal = createModal({ title: opts.title || '알림', closeLabel: opts.closeLabel || '닫기', size: opts.size });
      if (opts.message) modal.body.appendChild(createNotice(opts.message, opts.tone || 'info'));
      const ok = createButton(opts.confirmLabel || '확인', { kind: opts.tone === 'error' ? 'danger' : 'primary', bold: true });
      ok.onclick = function(){ modal.close(); resolve(true); };
      modal.actions.appendChild(ok);
      modal.open();
    });
  }

  function confirmDanger(message, title) {
    return createConfirmDialog({ title: title || '확인', message: message, danger: true, confirmLabel: '계속', cancelLabel: '취소' });
  }

  function notify(message, tone, ttl) {
    return createToast(message, tone, ttl);
  }

  function createPromptDialog(opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
      const modal = createModal({ title: opts.title || '입력', closeLabel: opts.cancelLabel || '취소' });
      if (opts.message) modal.body.appendChild(createNotice(opts.message, 'info'));
      const input = opts.multiline ? createTextarea({ value: opts.value || '', placeholder: opts.placeholder || '', height: opts.height || '120px' }) : createInput({ value: opts.value || '', placeholder: opts.placeholder || '' });
      modal.body.appendChild(input);
      const cancel = createButton(opts.cancelLabel || '취소');
      const ok = createButton(opts.confirmLabel || '저장', { kind: 'primary', bold: true });
      cancel.onclick = function(){ modal.close(); resolve(null); };
      ok.onclick = function(){ modal.close(); resolve(input.value); };
      modal.actions.appendChild(cancel);
      modal.actions.appendChild(ok);
      modal.open();
      setTimeout(function(){ try { input.focus(); } catch(_){} }, 0);
    });
  }

  function createToast(message, tone, ttl) {
    installDesignSystemStyle();
    let stack = document.querySelector('.lore-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'lore-toast-stack';
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = 'lore-toast';
    toast.textContent = message || '';
    if (tone === 'error') toast.style.borderColor = 'var(--lore-danger)';
    else if (tone === 'warn') toast.style.borderColor = 'var(--lore-warn)';
    else if (tone === 'success') toast.style.borderColor = 'var(--lore-accent)';
    stack.appendChild(toast);
    setTimeout(function(){ if (toast.parentNode) toast.parentNode.removeChild(toast); }, ttl || 2800);
    return toast;
  }

  function createJsonEditor(opts) {
    installDesignSystemStyle();
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const ta = createTextarea({ value: opts.value || '', height: opts.height || '240px', monospace: true });
    const status = createInlineStatus('', 'info');
    function validate() {
      try {
        const parsed = JSON.parse(ta.value || 'null');
        status.setStatus('JSON 유효', 'success');
        if (opts.onValidate) opts.onValidate(null, parsed);
        return parsed;
      } catch (e) {
        status.setStatus('JSON 오류: ' + e.message, 'error');
        if (opts.onValidate) opts.onValidate(e, null);
        return null;
      }
    }
    ta.addEventListener('input', validate);
    wrap.appendChild(ta);
    wrap.appendChild(status);
    wrap.textarea = ta;
    wrap.status = status;
    wrap.getValue = validate;
    wrap.setValue = function(value) { ta.value = value || ''; validate(); };
    validate();
    return wrap;
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
      ? { bg: 'var(--lore-danger-soft)', border: 'var(--lore-danger)', color: '#ffd8d8' }
      : opts.kind === 'primary'
        ? { bg: 'var(--lore-accent-soft)', border: 'var(--lore-accent)', color: '#eafff8' }
        : opts.kind === 'success'
          ? { bg: 'var(--lore-accent-soft)', border: 'var(--lore-accent)', color: '#eafff8' }
          : { bg: 'var(--lore-surface)', border: 'var(--lore-line)', color: 'var(--lore-text)' };
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
      btn.style.borderColor = 'var(--lore-accent)';
      btn.style.background = opts.kind === 'danger' ? 'var(--lore-danger-soft)' : 'var(--lore-surface-soft)';
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
    createInput,
    createTextarea,
    createSelect,
    createField,
    createFormGrid,
    createInlineStatus,
    createModal,
    createConfirmDialog,
    createAlertDialog,
    confirmDanger,
    createPromptDialog,
    createToast,
    notify,
    createJsonEditor,
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