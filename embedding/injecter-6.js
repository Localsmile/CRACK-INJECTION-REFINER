// Settings page registry bridge
(function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  if (_w.__LoreInj.__inject6Loaded) return;

  const L = _w.__LoreInj;

  const PAGE_ORDER = {
    extract: 10,
    refiner: 10,
    'injection-settings': 20,
    main: 40,
    lore: 100,
    file: 110,
    backup: 120,
    snapshot: 130,
    merge: 140,
    'memory-settings': 150,
    'retrieval-settings': 200,
    api: 300,
    prompts: 310,
    log: 400,
    session: 410,
    help: 420
  };

  const SETTINGS_GROUPS = {
    work: { label: '자주 쓰는 작업', order: 10, keys: ['extract', 'injection-settings', 'main'], desc: '추출 실행과 삽입 기준을 바로 관리함.' },
    refiner: { label: '응답 교정', order: 20, keys: ['refiner'], desc: 'AI 응답 검수, 자동 반영, 상태 표시를 관리함.' },
    memory: { label: '로어와 백업', order: 30, keys: ['lore', 'file', 'backup', 'snapshot', 'merge', 'memory-settings'], desc: '로어팩, 파일, 서버/파일 백업을 관리함.' },
    retrieval: { label: '검색과 회수', order: 40, keys: ['retrieval-settings'], desc: '의미 검색, 오래된 정보 회수, 쿨타임을 조정함.' },
    models: { label: 'API와 프롬프트', order: 50, keys: ['api', 'prompts'], desc: 'API 키, 모델, 프롬프트를 관리함.' },
    diagnostics: { label: '진단과 도움말', order: 60, keys: ['log', 'session', 'help'], desc: '실행 로그, 세션 상태, 기능 안내를 확인함.' }
  };

  const KEY_TO_GROUP = Object.entries(SETTINGS_GROUPS).reduce((acc, [groupKey, group]) => {
    group.keys.forEach(key => { acc[key] = groupKey; });
    return acc;
  }, {});

  function groupMetaForKey(key, opts) {
    const groupId = opts && opts.group ? opts.group : (KEY_TO_GROUP[key] || key);
    const group = SETTINGS_GROUPS[groupId] || { label: groupId, desc: '', order: 1000 };
    return { id: groupId, label: group.label || groupId, desc: group.desc || '', order: group.order || 1000 };
  }

  function registerSettingsPage(key, label, render, opts) {
    if (!key || typeof render !== 'function') return;
    const meta = groupMetaForKey(key, opts || {});
    const spec = {
      key,
      label: label || key,
      render,
      rootId: meta.id,
      rootLabel: meta.label,
      rootDesc: meta.desc,
      rootOrder: meta.order,
      order: (opts && opts.order != null) ? opts.order : (PAGE_ORDER[key] ?? 1000)
    };
    const shell = L.__LoreSettingsShell;
    if (shell && typeof shell.registerPage === 'function') {
      shell.registerPage(spec);
    } else {
      L.__settingsPageQueue = L.__settingsPageQueue || [];
      const idx = L.__settingsPageQueue.findIndex(page => page.key === key);
      if (idx >= 0) L.__settingsPageQueue[idx] = spec;
      else L.__settingsPageQueue.push(spec);
    }
    L.__settingsPageOrder = L.__settingsPageOrder || [];
    const orderKey = meta.id + ':' + key;
    if (!L.__settingsPageOrder.includes(orderKey)) {
      L.__settingsPageOrder.push(orderKey);
      L.__settingsPageOrder.sort((a, b) => {
        const ak = a.split(':').pop();
        const bk = b.split(':').pop();
        const ao = PAGE_ORDER[ak] ?? 1000;
        const bo = PAGE_ORDER[bk] ?? 1000;
        if (ao !== bo) return ao - bo;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    }
  }

  function flushSettingsPages() {
    const shell = L.__LoreSettingsShell;
    if (!shell || typeof shell.registerPage !== 'function') return;
    const queued = (L.__settingsPageQueue || []).slice().sort((a, b) => (a.order || 1000) - (b.order || 1000));
    queued.forEach(page => shell.registerPage(page));
    L.__settingsPageQueue = [];
    if (queued.length) L.__settingsPageOrder = queued.map(page => page.rootId + ':' + page.key);
    if (queued.length) console.log('[LoreInj:6] settings pages registered:', L.__settingsPageOrder);
  }

  Object.assign(L, {
    registerSettingsPage,
    setupSettingsPages: flushSettingsPages,
    __settingsMenuGroups: SETTINGS_GROUPS,
    __settingsKeyToGroup: KEY_TO_GROUP,
    __settingsPageOrder: []
  });

  L.__inject6Loaded = true;
  console.log('[LoreInj:6] Settings page bridge loaded');
})();
