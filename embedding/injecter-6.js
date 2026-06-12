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
  const MENU_ORDER = {
    main: 10,
    lore: 20,
    file: 30,
    extract: 40,
    merge: 50,
    snapshot: 60,
    backup: 70,
    refiner: 80,
    log: 90,
    session: 100,
    api: 110,
    help: 120
  };
  const MENU_GROUPS = {
    memory: { label: '로어 관리', order: 20, keys: ['lore', 'file', 'merge', 'snapshot', 'backup'], desc: '로어 목록, 파일 가져오기, 전체 백업, 중복 정리를 관리함.' },
    automation: { label: '자동화', order: 40, keys: ['extract', 'refiner'], desc: '대화 정리, 지식 변환, 응답 교정 흐름을 관리함.' },
    api: { label: 'API / 프롬프트', order: 60, keys: ['api'], desc: 'API 연결, 모델 선택, 프롬프트 템플릿을 관리함.' },
    diagnostics: { label: '진단 / 도움말', order: 80, keys: ['log', 'session', 'help'], desc: '실행 로그, 세션 상태, 사용 도움말을 확인함.' }
  };
  const KEY_TO_GROUP = Object.entries(MENU_GROUPS).reduce((acc, [groupKey, group]) => {
    group.keys.forEach(key => { acc[key] = groupKey; });
    return acc;
  }, {});

  function stableMenuQueue(queue, prefix) {
    return (queue || [])
      .map((item, index) => ({ ...item, index }))
      .sort((a, b) => {
        const ak = prefix + ':' + a.key;
        const bk = prefix + ':' + b.key;
        const ao = MENU_ORDER[a.key] ?? 10000;
        const bo = MENU_ORDER[b.key] ?? 10000;
        if (ao !== bo) return ao - bo;
        if (ak !== bk) return ak < bk ? -1 : 1;
        return a.index - b.index;
      });
  }

  function mountQueuedMenus(modal) {
    if (!modal || typeof modal.createMenu !== 'function') return;
    const menuQ = stableMenuQueue(_w.__LoreInj.__menuQueue || [], 'm');
    const subQ = stableMenuQueue(_w.__LoreInj.__subMenuQueue || [], 's');
    const registered = _w.__LoreInj.__registeredMenuKeys = _w.__LoreInj.__registeredMenuKeys || new Set();
    const groupMenus = {};
    const makeGroupMenu = (groupKey) => {
      const group = MENU_GROUPS[groupKey] || MENU_GROUPS.diagnostics;
      if (groupMenus[groupKey]) return groupMenus[groupKey];
      const menu = modal.createMenu(group.label, (m) => {
        m.replaceContentPanel((panel) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            if (_w.__LoreCore && _w.__LoreCore.setFullWidth) _w.__LoreCore.setFullWidth(nd);
            const title = document.createElement('div');
            title.textContent = group.label;
            title.style.cssText = 'font-size:16px;font-weight:700;color:var(--decentral-text);margin-bottom:6px;';
            const desc = document.createElement('div');
            desc.textContent = group.desc;
            desc.style.cssText = 'font-size:12px;color:var(--decentral-text-formal);line-height:1.55;margin-bottom:10px;';
            const hint = document.createElement('div');
            hint.textContent = '왼쪽 하위 메뉴에서 필요한 작업을 선택할 것.';
            hint.style.cssText = 'font-size:12px;color:var(--decentral-active-text);line-height:1.5;';
            nd.appendChild(title); nd.appendChild(desc); nd.appendChild(hint);
          }});
        }, group.label);
      });
      groupMenus[groupKey] = menu;
      return menu;
    };
    const groupedSubQ = subQ.map(item => ({ ...item, groupKey: KEY_TO_GROUP[item.key] || 'diagnostics' }))
      .sort((a, b) => {
        const ga = MENU_GROUPS[a.groupKey]?.order ?? 1000;
        const gb = MENU_GROUPS[b.groupKey]?.order ?? 1000;
        if (ga !== gb) return ga - gb;
        return (MENU_ORDER[a.key] ?? 10000) - (MENU_ORDER[b.key] ?? 10000);
      });
    _w.__LoreInj.__menuOrder = { menu: menuQ.map(x => x.key), groups: groupedSubQ.map(x => x.groupKey + ':' + x.key) };
    console.log(`[LoreInj:6] setupSubMenus: menu=${menuQ.length}, subMenu=${subQ.length}`, _w.__LoreInj.__menuOrder);
    menuQ.forEach(({ key, cb }) => {
      const regKey = 'm:' + key;
      if (registered.has(regKey)) return;
      try { cb(modal); registered.add(regKey); } catch(e) { console.error(`[LoreInj:6] 메뉴 등록 실패 (${key}):`, e); _w.__LoreInj?.markFailed?.('menu:' + key, e); }
    });
    groupedSubQ.forEach(({ key, cb, groupKey }) => {
      const regKey = 's:' + key;
      if (registered.has(regKey)) return;
      try {
        const parentMenu = makeGroupMenu(groupKey);
        const groupAdapter = {
          createSubMenu: (menuName, menuAction) => parentMenu.createSubMenu(menuName, menuAction),
          createMenu: (menuName, menuAction) => parentMenu.createSubMenu(menuName, menuAction)
        };
        cb(groupAdapter);
        registered.add(regKey);
      } catch(e) { console.error(`[LoreInj:6] 서브메뉴 등록 실패 (${key}):`, e); _w.__LoreInj?.markFailed?.('submenu:' + key, e); }
    });
  }

  function scheduleMenuRemount() {
    const L = _w.__LoreInj;
    if (!L.__menuModal || L.__menuRemountTimer) return;
    L.__menuRemountTimer = setTimeout(() => {
      L.__menuRemountTimer = 0;
      mountQueuedMenus(L.__menuModal);
    }, 100);
  }

  function installMenuRegistrars() {
    const L = _w.__LoreInj;
    L.registerMenu = function(key, cb) {
      L.__menuQueue.push({ key, cb });
      scheduleMenuRemount();
    };
    L.registerSubMenu = function(key, cb) {
      L.__subMenuQueue.push({ key, cb });
      scheduleMenuRemount();
    };
  }

  installMenuRegistrars();

  // UI 모듈에서 호출: 로더 큐에 누적된 모든 등록을 ModalManager에 연결
  _w.__LoreInj.setupSubMenus = function(modal) {
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu 없음');
      return;
    }
    _w.__LoreInj.__menuModal = modal;
    mountQueuedMenus(modal);
  };

  _w.__LoreInj.__inject6Loaded = true;
  console.log('[LoreInj:6] Entry point loaded. Awaiting sub-modules...');
})();
