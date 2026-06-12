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
    log: 20,
    session: 30,
    help: 40,
    'memory-settings': 100,
    lore: 110,
    file: 120,
    backup: 130,
    snapshot: 140,
    merge: 150,
    'retrieval-settings': 200,
    'injection-settings': 300,
    extract: 310,
    refiner: 320,
    'model-settings': 400,
    api: 410,
    'advanced-settings': 420
  };
  const MENU_GROUPS = {
    status: { label: 'Status', order: 10, keys: ['main', 'log', 'session', 'help'], desc: '상태, 로그, 세션 진단을 확인함.' },
    memory: { label: 'Memory', order: 20, keys: ['memory-settings', 'lore', 'file', 'backup', 'snapshot', 'merge'], desc: '로어, 백업, 가져오기, 병합을 관리함.' },
    retrieval: { label: 'Retrieval', order: 30, keys: ['retrieval-settings'], desc: '검색, 회수, 쿨타임 기준을 관리함.' },
    injection: { label: 'Injection', order: 40, keys: ['injection-settings', 'extract', 'refiner'], desc: '삽입, 정리, 추출, 교정을 관리함.' },
    models: { label: 'Models', order: 50, keys: ['model-settings', 'api', 'advanced-settings'], desc: 'API, 모델, 고급 동작을 관리함.' }
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

  function mountQueuedMenus() {
    const menuQ = stableMenuQueue(_w.__LoreInj.__menuQueue || [], 'm');
    const subQ = stableMenuQueue(_w.__LoreInj.__subMenuQueue || [], 's');
    if (_w.__LoreInj.__LoreSettingsShell && typeof _w.__LoreInj.__LoreSettingsShell.mountQueues === 'function') {
      _w.__LoreInj.__LoreSettingsShell.mountQueues(menuQ, subQ, MENU_GROUPS, KEY_TO_GROUP);
    }
    const groupedSubQ = subQ.map(item => ({ ...item, groupKey: KEY_TO_GROUP[item.key] || 'status' }));
    _w.__LoreInj.__menuOrder = {
      menu: menuQ.map(x => x.key),
      groups: groupedSubQ.map(x => x.groupKey + ':' + x.key)
    };
    console.log(`[LoreInj:6] setupSubMenus: menu=${menuQ.length}, subMenu=${subQ.length}`, _w.__LoreInj.__menuOrder);
  }

  function scheduleMenuRemount() {
    const L = _w.__LoreInj;
    if (L.__menuRemountTimer) return;
    L.__menuRemountTimer = setTimeout(() => {
      L.__menuRemountTimer = 0;
      mountQueuedMenus();
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

  // UI 모듈에서 호출: 로더 큐에 누적된 모든 등록을 native settings shell에 연결.
  _w.__LoreInj.setupSubMenus = function() {
    mountQueuedMenus();
  };

  _w.__LoreInj.__inject6Loaded = true;
  console.log('[LoreInj:6] Entry point loaded. Awaiting sub-modules...');
})();
