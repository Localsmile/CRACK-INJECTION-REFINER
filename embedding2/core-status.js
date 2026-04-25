// crack-lore-core / status 모듈
// 역할: 상태 배지 단일화, 우선순위 관리, 깜빡임 없는 진행 표시
// 의존: 없음. core-ui 이후 로드하면 기존 showStatusBadge/hideStatusBadge를 안전하게 대체함.
(function () {
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__statusLoaded) return;

  const DEFAULT_OWNER = 'legacy';
  const DEFAULT_PRIORITY = 1;
  const PRIORITY = {
    legacy: 1,
    inject: 2,
    extract: 3,
    refiner: 4,
    error: 10
  };

  let badge = null;
  let dot = null;
  let label = null;
  let styleAdded = false;
  let current = null;
  let hideTimer = null;

  function now() {
    return Date.now();
  }

  function getPriority(owner, options) {
    if (options && typeof options.priority === 'number') return options.priority;
    return PRIORITY[owner] || DEFAULT_PRIORITY;
  }

  function isExpired(state) {
    return !!(state && state.expiresAt && state.expiresAt <= now());
  }

  function canReplace(owner, priority) {
    if (!current || !current.visible) return true;
    if (isExpired(current)) return true;
    if (current.owner === owner) return true;
    return priority >= current.priority;
  }

  function addStyles() {
    if (styleAdded) return;
    styleAdded = true;

    const style = document.createElement('style');
    style.id = 'lore-status-style';
    style.textContent = [
      '@keyframes lore-status-pulse{',
      '0%{box-shadow:0 0 0 0 rgba(68,170,153,.35);}',
      '70%{box-shadow:0 0 0 7px rgba(68,170,153,0);}',
      '100%{box-shadow:0 0 0 0 rgba(68,170,153,0);}',
      '}',
      '#lore-status-badge{',
      'position:fixed;',
      'right:20px;',
      'bottom:70px;',
      'z-index:999998;',
      'display:flex;',
      'align-items:center;',
      'gap:8px;',
      'max-width:min(420px,calc(100vw - 40px));',
      'box-sizing:border-box;',
      'padding:8px 14px;',
      'border:1px solid #333;',
      'border-radius:999px;',
      'background:#1a1a1a;',
      'color:#ccc;',
      'font-size:12px;',
      'line-height:1.4;',
      'font-family:inherit;',
      'box-shadow:0 4px 14px rgba(0,0,0,.4);',
      'opacity:0;',
      'transform:translateY(4px);',
      'transition:opacity .18s ease,transform .18s ease;',
      'pointer-events:none;',
      '}',
      '#lore-status-badge[data-visible="true"]{',
      'opacity:1;',
      'transform:translateY(0);',
      '}',
      '#lore-status-badge .lore-status-dot{',
      'display:inline-block;',
      'width:8px;',
      'height:8px;',
      'border-radius:999px;',
      'background:#4a9;',
      'flex:0 0 auto;',
      'animation:lore-status-pulse 1.4s ease-out infinite;',
      '}',
      '#lore-status-badge .lore-status-label{',
      'overflow:hidden;',
      'text-overflow:ellipsis;',
      'white-space:nowrap;',
      '}',
      '@media (max-width:520px){',
      '#lore-status-badge{',
      'left:50%;',
      'right:auto;',
      'bottom:calc(16px + env(safe-area-inset-bottom));',
      'transform:translate(-50%,4px);',
      'max-width:calc(100vw - 24px);',
      '}',
      '#lore-status-badge[data-visible="true"]{',
      'transform:translate(-50%,0);',
      '}',
      '}',
      '@media (prefers-reduced-motion:reduce){',
      '#lore-status-badge{transition:none;}',
      '#lore-status-badge .lore-status-dot{animation:none;}',
      '}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureBadge() {
    if (badge && document.body && document.body.contains(badge)) return badge;
    if (!document.body) return null;

    addStyles();

    badge = document.createElement('div');
    badge.id = 'lore-status-badge';
    badge.setAttribute('data-visible', 'false');

    dot = document.createElement('span');
    dot.className = 'lore-status-dot';

    label = document.createElement('span');
    label.className = 'lore-status-label';

    badge.appendChild(dot);
    badge.appendChild(label);
    document.body.appendChild(badge);

    return badge;
  }

  function applyVisible(visible) {
    const node = ensureBadge();
    if (!node) return;
    node.setAttribute('data-visible', visible ? 'true' : 'false');
    node.style.pointerEvents = visible ? 'auto' : 'none';
  }

  function setText(text) {
    const node = ensureBadge();
    if (!node || !label) return;
    const next = String(text || '');
    if (label.textContent !== next) label.textContent = next;
  }

  function scheduleAutoHide(owner, ttl) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!ttl || ttl <= 0) return;

    hideTimer = setTimeout(function () {
      if (current && current.owner === owner && isExpired(current)) {
        status.hide(owner);
      }
    }, ttl + 30);
  }

  const status = {
    show: function (owner, text, options) {
      owner = owner || DEFAULT_OWNER;
      options = options || {};
      const priority = getPriority(owner, options);
      const ttl = typeof options.ttl === 'number' ? options.ttl : 0;

      if (!canReplace(owner, priority)) return false;

      current = {
        owner: owner,
        text: String(text || ''),
        priority: priority,
        visible: true,
        startedAt: now(),
        expiresAt: ttl > 0 ? now() + ttl : 0
      };

      setText(current.text);
      applyVisible(true);
      scheduleAutoHide(owner, ttl);
      return true;
    },

    update: function (owner, text) {
      owner = owner || DEFAULT_OWNER;
      if (!current || current.owner !== owner || !current.visible) {
        return status.show(owner, text, { priority: getPriority(owner) });
      }
      current.text = String(text || '');
      setText(current.text);
      return true;
    },

    hide: function (owner) {
      owner = owner || DEFAULT_OWNER;
      if (current && current.owner !== owner && !isExpired(current)) return false;

      current = null;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      applyVisible(false);
      return true;
    },

    clear: function () {
      current = null;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      applyVisible(false);
      return true;
    },

    get: function () {
      if (!current) return null;
      return Object.assign({}, current);
    }
  };

  C.status = status;

  C.showStatusBadge = function (text) {
    return status.show(DEFAULT_OWNER, text, { priority: DEFAULT_PRIORITY });
  };

  C.hideStatusBadge = function () {
    return status.hide(DEFAULT_OWNER);
  };

  C.__statusLoaded = true;

})();