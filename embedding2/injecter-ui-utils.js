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

  function setFullWidth(node) {
    const C = getCore();
    if (C && typeof C.setFullWidth === 'function') {
      C.setFullWidth(node);
      return;
    }
    const p = node.parentElement;
    if (p) {
      p.style.display = 'block';
      p.style.padding = '0';
      p.style.border = 'none';
      p.style.background = 'transparent';
    }
    node.style.cssText = 'width:100%;display:block;padding:10px 14px;box-sizing:border-box;background:transparent;border:none;margin-bottom:12px;';
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
    const wrap = document.createElement('div');
    wrap.className = 'lore-section';
    wrap.style.cssText = 'margin-bottom:12px;';
    const t = document.createElement('div');
    t.className = 'lore-section-title';
    t.textContent = title;
    t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #333;';
    wrap.appendChild(t);
    if (desc) {
      const d = document.createElement('div');
      d.className = 'lore-section-desc';
      d.textContent = desc;
      d.style.cssText = 'font-size:12px;color:#888;line-height:1.6;margin-bottom:8px;word-break:keep-all;';
      wrap.appendChild(d);
    }
    return wrap;
  }

  function createNotice(text, tone) {
    const box = document.createElement('div');
    box.className = 'lore-notice';
    const border = tone === 'warn' ? '#642' : tone === 'error' ? '#633' : '#333';
    const color = tone === 'warn' ? '#da8' : tone === 'error' ? '#d99' : '#ccc';
    const bg = tone === 'warn' ? '#1f160a' : tone === 'error' ? '#1a0f0f' : '#111';
    box.textContent = text;
    box.style.cssText = 'padding:10px;border:1px solid ' + border + ';border-radius:6px;background:' + bg + ';color:' + color + ';font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:keep-all;';
    return box;
  }

  function createButton(label, opts) {
    opts = opts || {};
    const btn = document.createElement('button');
    btn.className = 'lore-button' + (opts.kind ? ' lore-button-' + opts.kind : '');
    btn.textContent = label;
    const bg = opts.kind === 'danger' ? '#833' : opts.kind === 'primary' ? '#258' : opts.kind === 'success' ? '#285' : 'transparent';
    const border = opts.kind ? bg : '#555';
    const color = opts.kind ? '#fff' : '#ccc';
    btn.style.cssText = 'padding:' + (opts.compact ? '4px 10px' : '8px 14px') + ';font-size:12px;border-radius:4px;cursor:pointer;background:' + bg + ';color:' + color + ';border:1px solid ' + border + ';font-weight:' + (opts.bold ? 'bold' : 'normal') + ';';
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
    createButton,
    addBox,
    __utilsLoaded: true
  });

  console.log('[LoreInj:UI] utils loaded');
})();