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

  // 메뉴 등록 큐는 로더가 document-start 시점에 이미 만들어둔다.
  // 여기서 register* 를 재정의하면 그 이전에 들어온 등록이 사라지므로 절대 덮어쓰지 않는다.
  // 구버전 로더 호환용으로만 fallback 설치.
  if (!_w.__LoreInj.__menuQueue) _w.__LoreInj.__menuQueue = [];
  if (!_w.__LoreInj.__subMenuQueue) _w.__LoreInj.__subMenuQueue = [];
  if (typeof _w.__LoreInj.registerMenu !== 'function') {
    _w.__LoreInj.registerMenu = (key, cb) => _w.__LoreInj.__menuQueue.push({ key, cb });
  }
  if (typeof _w.__LoreInj.registerSubMenu !== 'function') {
    _w.__LoreInj.registerSubMenu = (key, cb) => _w.__LoreInj.__subMenuQueue.push({ key, cb });
  }

  // UI 모듈에서 호출: 로더 큐에 누적된 모든 등록을 ModalManager에 연결
  _w.__LoreInj.setupSubMenus = function(modal) {
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu 없음');
      return;
    }

    // decentralized-modal v1.0.15는 createSubMenu를 ModalManager에 직접 제공하지 않는다.
    const flatMenuAdapter = {
      createSubMenu: (menuName, menuAction) => modal.createMenu(menuName, menuAction),
      createMenu: (menuName, menuAction) => modal.createMenu(menuName, menuAction)
    };

    const menuQ = _w.__LoreInj.__menuQueue || [];
    const subQ = _w.__LoreInj.__subMenuQueue || [];
    console.log(`[LoreInj:6] setupSubMenus: menu=${menuQ.length}, subMenu=${subQ.length}`);
    menuQ.forEach(({ key, cb }) => {
      try { cb(modal); } catch(e) { console.error(`[LoreInj:6] 메뉴 등록 실패 (${key}):`, e); }
    });
    subQ.forEach(({ key, cb }) => {
      try { cb(flatMenuAdapter); } catch(e) { console.error(`[LoreInj:6] 서브메뉴 등록 실패 (${key}):`, e); }
    });
  };

  _w.__LoreInj.__inject6Loaded = true;
  console.log('[LoreInj:6] Entry point loaded. Awaiting sub-modules...');
})();
