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

  // 서브메뉴 등록 콜백 수집
  const _subMenuCbs = [];
  _w.__LoreInj.registerSubMenu = function(key, cb) {
    _subMenuCbs.push({ key, cb });
  };

  // UI 모듈에서 호출: 모든 등록된 서브메뉴를 modal에 연결
  _w.__LoreInj.setupSubMenus = function(modal) {
    if (!modal) {
      console.error('[LoreInj:6] modal 없음');
      return;
    }

    let host = modal;
    if (typeof host.createSubMenu !== 'function') {
      if (typeof modal.createMenu !== 'function') {
        console.error('[LoreInj:6] modal.createMenu 없음');
        return;
      }
      host = modal.createMenu('Lore Injector', (m) => {
        if (m && typeof m.replaceContentPanel === 'function') {
          m.replaceContentPanel((panel) => {
            panel.addTitleText('Lore Injector');
            panel.addText('왼쪽의 하위 메뉴를 선택하세요.');
          }, 'Lore Injector');
        }
      });
    }

    if (!host || typeof host.createSubMenu !== 'function') {
      console.error('[LoreInj:6] createSubMenu 호스트 생성 실패');
      return;
    }

    _subMenuCbs.forEach(({ cb }) => {
      try { cb(host); } catch(e) { console.error(`[LoreInj:6] 서브메뉴 등록 실패:`, e); }
    });
  };

  _w.__LoreInj.__inject6Loaded = true;
  console.log('[LoreInj:6] Entry point loaded. Awaiting sub-modules...');
})();
