// Settings page registry bridge
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded)) { console.error('[LoreInj:6] inject not loaded'); return; }
  if (_w.__LoreInj.__inject6Loaded) return;

  const L = _w.__LoreInj;

  const PAGE_ORDER = {
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
    prompts: 420,
    'advanced-settings': 430
  };

  const SETTINGS_GROUPS = {
    status: { label: 'Status', order: 10, keys: ['main', 'log', 'session', 'help'], desc: '상태, 로그, 세션 진단을 확인함.' },
    memory: { label: 'Memory', order: 20, keys: ['memory-settings', 'lore', 'file', 'backup', 'snapshot', 'merge'], desc: '로어, 백업, 가져오기, 병합을 관리함.' },
    retrieval: { label: 'Retrieval', order: 30, keys: ['retrieval-settings'], desc: '검색, 회수, 쿨타임 기준을 관리함.' },
    injection: { label: 'Injection', order: 40, keys: ['injection-settings', 'extract', 'refiner'], desc: '삽입, 정리, 추출, 교정을 관리함.' },
    models: { label: 'Models', order: 50, keys: ['model-settings', 'api', 'prompts', 'advanced-settings'], desc: 'API, 모델, 프롬프트, 고급 동작을 관리함.' }
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
