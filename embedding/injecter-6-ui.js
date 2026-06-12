// injecter-6-ui.js: UI 진입점 (모달 생성 + DOM 주입 + 기어 버튼)
(async function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = (_w.__LoreEnv && _w.__LoreEnv.kv) || _w.localStorage;

  function isChatPath() {
    const platform = _w.__LorePlatform;
    if (platform && typeof platform.isChatPath === 'function') {
      try { return !!platform.isChatPath(); } catch (_) {}
    }
    const fn = _w.__LoreInj && _w.__LoreInj.isChatPath;
    if (typeof fn === 'function') {
      try { return !!fn(); } catch (_) {}
    }
    return /\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname)
      || /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname)
      || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname);
  }

  function reloadOnSpaChatRoute() {
    if (!_w.__LoreInj || typeof _w.__LoreInj.runWhenChatRoute !== 'function') return;
    _w.__LoreInj.runWhenChatRoute(() => {
      if (_w.__LoreInj.__uiLoaded || _w.__LoreInj.__spaChatReloading) return;
      _w.__LoreInj.__spaChatReloading = true;
      console.log('[LoreInj:6-ui] SPA chat route detected after light boot: reload for full bootstrap');
      setTimeout(() => location.reload(), 50);
    });
  }

  async function showBootErrorBadge(gate) {
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
    if (document.getElementById('lore-inj-boot-error')) return;
    const btn = document.createElement('button');
    btn.id = 'lore-inj-boot-error';
    btn.textContent = 'Lore Injector 로딩 진단';
    btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:999999;background:rgba(58,23,27,.94);color:#ffc9c9;border:1px solid rgba(239,107,107,.55);border-radius:9px;padding:8px 10px;font-size:12px;font-weight:800;box-shadow:0 12px 28px rgba(0,0,0,.38);';
    btn.onclick = () => {
      const L = _w.__LoreInj || {};
      const payload = { gate, moduleStatus: L.moduleStatus || {}, missingSubs: L.missingSubs || [], menuOrder: L.__menuOrder || null, route: L.route || null };
      alert(JSON.stringify(payload, null, 2).slice(0, 3000));
    };
    document.body.appendChild(btn);
  }

  // 1) 로더가 노출한 ready 게이트를 먼저 기다린다 (코어 5 + 서브 11 전원 로드 확인).
  //    게이트가 없으면(구버전 로더) 기존 폴링 로직으로 폴백.
  if (_w.__LoreInjReady && typeof _w.__LoreInjReady.then === 'function') {
    const gate = await _w.__LoreInjReady;
    if (!gate || gate.ok !== true) {
      console.error('[LoreInj:6-ui] ready 게이트 실패, UI 마운트 중단:', gate);
      await showBootErrorBadge(gate);
      return;
    }
  } else {
    const _deadline = Date.now() + 15000;
    const _subs = ['__interceptorLoaded','__constLoaded','__settingsLoaded','__extractLoaded','__injectLoaded','__subMainLoaded','__subLoreLoaded','__subMergeLoaded','__subSnapshotLoaded','__subFileLoaded','__subBackupLoaded','__subExtractLoaded','__subRefinerLoaded','__subLogLoaded','__subSessionLoaded','__subApiLoaded','__subHelpLoaded'];
    while (Date.now() < _deadline) {
      const L = _w.__LoreInj;
      if (L && _subs.every(k => L[k])) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const L = _w.__LoreInj;
    if (!L || !_subs.every(k => L[k])) { console.error('[LoreInj:6-ui] 폴백 대기 타임아웃, UI 마운트 중단'); await showBootErrorBadge({ ok: false, reason: 'fallback-timeout' }); return; }
  }

  if (!isChatPath()) {
    console.log('[LoreInj:6-ui] non-chat route: UI bootstrap skipped');
    reloadOnSpaChatRoute();
    return;
  }

  // 2) 게이트 통과 후 DOM 준비 대기.
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));

  if (_w.__LoreInj.__uiLoaded) return;

  const { C, R, settings } = _w.__LoreInj;
  const VER = _w.__LoreInj.VER;
  const settingsShellReady = _w.__LoreInj.__settingsShellLoaded
    && _w.__LoreInj.__LoreSettingsShell
    && typeof _w.__LoreInj.__LoreSettingsShell.mountQueues === 'function'
    && typeof _w.__LoreInj.__LoreSettingsShell.open === 'function';
  if (!settingsShellReady) {
    console.error('[LoreInj:6-ui] settings shell not ready');
    _w.__LoreInj?.markFailed?.('ui', 'settings shell not ready');
    await showBootErrorBadge({ ok: false, reason: 'settings shell not ready' });
    return;
  }

  function openLoreSettings() {
    const shell = _w.__LoreInj && _w.__LoreInj.__LoreSettingsShell;
    if (shell && typeof shell.open === 'function') {
      shell.open();
      return;
    }
    console.error('[LoreInj:6-ui] settings shell missing');
    showBootErrorBadge({ ok: false, reason: 'settings shell missing' });
  }

  // 메뉴 등록 함수 호출. 새 settings shell이 기존 callback API를 흡수한다.
  if (_w.__LoreInj.setupSubMenus) {
    _w.__LoreInj.setupSubMenus(null);
  }

  function installProductShellStyle() {
    if (document.getElementById('lore-inj-shell-style')) return;
    const css = `
      .lore-launcher-button {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        height: 28px;
        padding: 0 9px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, .32);
        background: rgba(18, 19, 22, .74);
        color: #f3f4f6;
        font-size: 12px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
      }
      .lore-launcher-button:hover {
        background: rgba(36, 39, 44, .92);
        border-color: rgba(138, 180, 255, .52);
      }
      .lore-launcher-button span {
        margin: 0;
        white-space: nowrap;
      }
      .lore-launcher-dot {
        width: 6px;
        height: 6px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #8ab4ff;
        box-shadow: 0 0 0 2px rgba(138,180,255,.16);
      }
    `;
    const style = document.createElement('style');
    style.id = 'lore-inj-shell-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // === DOM 진입점 ===
  // 1) 좌측 설정 메뉴에 Lore Injector 링크 추가
  function __updateModalMenu() {
    const modalEl = document.getElementById('web-modal');
    if (modalEl && !document.getElementById('lore-injector-settings-menu')) {
      const itemFound = modalEl.getElementsByTagName('a');
      for (let item of itemFound) {
        if (item.getAttribute('href') === '/setting') {
          const clonedElement = item.cloneNode(true);
          clonedElement.id = 'lore-injector-settings-menu';
          const textElement = clonedElement.getElementsByTagName('span')[0];
          if (textElement) textElement.innerText = 'Lore Injector';
          clonedElement.setAttribute('href', 'javascript: void(0)');
          clonedElement.onclick = (event) => {
            event.preventDefault(); event.stopPropagation();
            openLoreSettings();
          };
          item.parentElement?.append(clonedElement);
          break;
        }
      }
    }
  }

  // 2) 채팅창 상단 패널에 Lore 버튼 삽입
  async function injectBannerButton() {
    const selected = document.getElementsByClassName('lore-launcher-button');
    if (selected && selected.length > 0) return;
    try {
      const platform = _w.__LorePlatform;
      const mount = platform && typeof platform.getLauncherMount === 'function' ? platform.getLauncherMount() : null;
      if (mount && mount.target) {
        const buttonCloned = document.createElement('button');
        buttonCloned.innerHTML = '<span class="lore-launcher-dot"></span><span>Lore</span>';
        buttonCloned.style.cssText = 'margin-right: 10px';
        buttonCloned.className = 'lore-launcher-button';
        buttonCloned.title = 'Lore Injector';
        mount.target.insertBefore(buttonCloned, mount.before || mount.target.childNodes[0] || null);
        buttonCloned.removeAttribute('onClick');
        buttonCloned.addEventListener('click', openLoreSettings);
      }
    } catch(e) {}
  }

  async function doInjection() {
    if (!/\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname) && !/\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) && !/\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname)) return;
    await injectBannerButton();
  }

  function __doModalMenuInit() {
    if (document.c2InjectorModalInit) return;
    document.c2InjectorModalInit = true;
    // v1.4.0-test.39 B10 fix: body 전역 mutation에 매번 동기 실행되는 비용 회피.
    //   __updateModalMenu는 200ms debounce. 메뉴 DOM 변동은 SPA 라우팅 외 거의 없음.
    let _menuDebounceTimer = 0;
    const _debouncedUpdateMenu = () => {
      if (_menuDebounceTimer) return;
      _menuDebounceTimer = setTimeout(() => { _menuDebounceTimer = 0; __updateModalMenu(); }, 200);
    };
    const Observer = window.MutationObserver || window.WebKitMutationObserver;
    if (Observer && document.body) {
      const observer = new Observer(_debouncedUpdateMenu);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', doInjection); window.addEventListener('load', doInjection); } else { doInjection(); }
    setInterval(doInjection, 2000);
  }

  installProductShellStyle();
  document.getElementById('lore-inj-gear-btn')?.remove();
  __doModalMenuInit();

  Object.assign(_w.__LoreInj, { __uiLoaded: true });
  console.log('[LoreInj:6-ui] UI loaded (Lore launcher attached)');
})();
