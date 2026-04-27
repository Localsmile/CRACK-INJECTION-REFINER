// injecter-6.js: 진입점 (서브모듈 등록 수집 + setupSubMenus 공개)
// 역할: 11개 서브모듈(main/lore/merge/snapshot/file/extract/refiner/log/session/api/help) + ui.js 조합
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded)) { console.error('[LoreInj:6] inject 미로드'); return; }
  if (_w.__LoreInj.__inject6Loaded) return;

  // 메뉴 등록 콜백 수집
  const _menuCbs = [];
  const _subMenuCbs = [];
  _w.__LoreInj.registerMenu = function(key, cb) {
    _menuCbs.push({ key, cb });
  };
  _w.__LoreInj.registerSubMenu = function(key, cb) {
    _subMenuCbs.push({ key, cb });
  };

  // UI 모듈에서 호출: 모든 등록된 메뉴를 ModalManager에 연결
  _w.__LoreInj.setupSubMenus = function(modal) {
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu 없음');
      return;
    }

    // decentralized-modal v1.0.15는 createSubMenu를 ModalManager에 직접 제공하지 않는다.
    // 기존 서브모듈들이 modal.createSubMenu(...)를 호출하므로, 이를 최상위 createMenu로
    // 매핑하는 adapter를 넘긴다. 이렇게 해야 빈 root 메뉴만 뜨지 않고 실제 패널들이 표시된다.
    const flatMenuAdapter = {
      createSubMenu: (menuName, menuAction) => modal.createMenu(menuName, menuAction),
      createMenu: (menuName, menuAction) => modal.createMenu(menuName, menuAction)
    };

    _menuCbs.forEach(({ cb }) => {
      try { cb(modal); } catch(e) { console.error(`[LoreInj:6] 메뉴 등록 실패:`, e); }
    });
    _subMenuCbs.forEach(({ cb }) => {
      try { cb(flatMenuAdapter); } catch(e) { console.error(`[LoreInj:6] 서브메뉴 등록 실패:`, e); }
    });
  };

  _w.__LoreInj.__inject6Loaded = true;
  console.log('[LoreInj:6] Entry point loaded. Awaiting sub-modules...');
})();
