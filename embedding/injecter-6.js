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
  const MENU_GROUPS = [
    { id: 'home', name: '홈', keys: ['main'], direct: true },
    { id: 'lore', name: '로어 관리', keys: ['lore', 'file', 'merge', 'snapshot'], labels: ['목록', '로어팩 관리', '중복 정리', '복원 지점'] },
    { id: 'extract', name: '로어 추출/변환', keys: ['extract'], direct: true },
    { id: 'backup', name: '백업', keys: ['backup'], direct: true },
    { id: 'refiner', name: '응답 교정', keys: ['refiner'], direct: true },
    { id: 'connection', name: 'API 설정', keys: ['api'], labels: ['연결 및 모델', '프롬프트'] },
    { id: 'activity', name: '활동', keys: ['log', 'session'], labels: ['실행 기록', '현재 대화 상태'] },
    { id: 'help', name: '도움말', keys: ['help'], direct: true }
  ];

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
    const screens = new Map();
    const capture = ({ key, cb }, kind) => {
      const rows = [];
      const adapter = {
        createMenu: (name, action) => { rows.push({ name, action }); return adapter; },
        createSubMenu: (name, action) => { rows.push({ name, action }); return adapter; }
      };
      try { cb(adapter); screens.set(key, rows); }
      catch (e) {
        console.error(`[LoreInj:6] ${kind} 화면 수집 실패 (${key}):`, e);
        _w.__LoreInj?.markFailed?.((kind === 'menu' ? 'menu:' : 'submenu:') + key, e);
      }
    };
    menuQ.forEach(item => capture(item, 'menu'));
    subQ.forEach(item => capture(item, 'submenu'));

    for (const group of MENU_GROUPS) {
      const regKey = 'group:' + group.id;
      if (registered.has(regKey)) continue;
      const rows = [];
      group.keys.forEach((key, keyIndex) => {
        const captured = screens.get(key) || [];
        captured.forEach((screen, screenIndex) => rows.push({
          ...screen,
          label: (group.labels && group.labels[keyIndex + screenIndex]) || screen.name
        }));
      });
      if (!rows.length) continue;
      try {
        if (group.direct && rows.length === 1) {
          modal.createMenu(group.name, rows[0].action);
        } else {
          const parent = modal.createMenu(group.name, rows[0].action);
          if (!parent || typeof parent.createSubMenu !== 'function') throw new Error('nested menu API missing');
          rows.forEach(row => parent.createSubMenu(row.label, row.action));
        }
        registered.add(regKey);
      } catch (e) {
        console.error(`[LoreInj:6] 메뉴 그룹 등록 실패 (${group.id}):`, e);
        _w.__LoreInj?.markFailed?.('menu-group:' + group.id, e);
      }
    }
    _w.__LoreInj.__menuOrder = {
      groups: MENU_GROUPS.map(group => group.id),
      menu: menuQ.map(x => x.key),
      subMenu: subQ.map(x => x.key)
    };
    console.log(`[LoreInj:6] setupSubMenus: groups=${MENU_GROUPS.length}, screens=${menuQ.length + subQ.length}`, _w.__LoreInj.__menuOrder);
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
