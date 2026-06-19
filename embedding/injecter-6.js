// Settings page registry bridge
(function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  if (_w.__LoreInj.__inject6Loaded) return;

  const L = _w.__LoreInj;

  const PAGE_ORDER = {
    main: 10,
    extract: 20,
    'knowledge-text': 30,
    'knowledge-file': 31,
    'knowledge-url': 32,
    'injection-settings': 100,
    'retrieval-settings': 110,
    'memory-settings': 120,
    file: 130,
    merge: 150,
    backup: 200,
    refiner: 300,
    api: 400,
    prompts: 410,
    log: 500,
    session: 510,
    snapshot: 520,
    help: 530
  };

  const SETTINGS_GROUPS = {
    quick: { label: '빠른 설정', order: 10, keys: ['main'], desc: '최근 응답 재검수, 상태, 추천 설정, 로어 목록을 빠르게 처리함.' },
    extract: { label: '추출', order: 20, keys: ['extract'], desc: '최근 대화와 전체 로그를 로어로 정리함.' },
    knowledge: { label: '지식 변환', order: 30, keys: ['knowledge-text', 'knowledge-file', 'knowledge-url'], desc: '텍스트, 파일, URL을 로어팩으로 변환함.' },
    injection: { label: '로어 삽입 설정', order: 40, keys: ['injection-settings', 'retrieval-settings', 'memory-settings', 'file', 'merge'], desc: '삽입 기준, 검색, 전체 로어팩, 중복 정리를 관리함.' },
    backup: { label: '백업/동기화', order: 50, keys: ['backup'], desc: '파일과 서버 백업을 수동으로 저장하거나 복원함.' },
    refiner: { label: '응답 교정', order: 60, keys: ['refiner'], desc: 'AI 응답 검수, 자동 반영, 상태 표시를 관리함.' },
    models: { label: 'API와 프롬프트', order: 70, keys: ['api', 'prompts'], desc: 'API 키, 모델, 프롬프트를 관리함.' },
    diagnostics: { label: '진단/도움말', order: 80, keys: ['log', 'session', 'snapshot', 'help'], desc: '실행 로그, 세션 상태, 스냅샷, 기능 안내를 확인함.' }
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
