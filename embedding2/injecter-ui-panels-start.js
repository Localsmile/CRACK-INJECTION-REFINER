// == 인젝터 UI 패널 — Start Here ==
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:start] UI utils not loaded');
    return;
  }
  if (UI.__startPanelLoaded) return;

  function getRuntime() { return _w.__LoreInj || {}; }

  function openPanelById(id) {
    try {
      const target = UI.getPanels().find(function(p){ return p.id === id; });
      const MM = UI.getModalManager && UI.getModalManager();
      const modal = MM && MM.getOrCreateManager ? MM.getOrCreateManager('c2') : null;
      if (target && modal) UI.openPanel(modal, target.render, target.title || target.label, target.id);
    } catch(e) {
      console.warn('[LoreInj:UI:dashboard] panel open failed:', e && e.message);
    }
  }

  function hasAnyApi(settings) {
    const cfg = settings && settings.config ? settings.config : {};
    const type = cfg.autoExtApiType || 'key';
    if (type === 'vertex') return !!cfg.autoExtVertexJson;
    if (type === 'firebase') return !!cfg.autoExtFirebaseScript;
    return !!cfg.autoExtKey;
  }

  function hasEmbeddingApi(settings) {
    const cfg = settings && settings.config ? settings.config : {};
    const type = cfg.autoExtApiType || 'key';
    if (type === 'firebase') return !!cfg.autoExtFirebaseEmbedKey;
    if (type === 'vertex') return !!cfg.autoExtVertexJson;
    return !!cfg.autoExtKey;
  }

  function latestErrorText(logs) {
    const all = [];
    Object.keys(logs || {}).forEach(function(k) {
      (logs[k] || []).forEach(function(x){ if (x && (x.error || x.isError || /실패|오류/.test(x.status || ''))) all.push(x); });
    });
    if (!all.length) return '최근 오류 없음';
    const item = all[0];
    return String(item.error || item.reason || item.status || '오류').slice(0, 80);
  }

  UI.registerPanel({
    id: 'dashboard',
    label: '대시보드',
    title: '대시보드',
    order: 10,
    render: async function(panel) {
      const L = getRuntime();
      const C = L.C;
      const db = L.db;
      const settings = L.settings;
      const url = C && C.getCurUrl ? C.getCurUrl() : location.href;
      const chatKey = L.getChatKey ? L.getChatKey() : location.href;
      const activePacks = settings && settings.config && settings.config.urlPacks ? (settings.config.urlPacks[url] || []) : [];
      let activeEntries = [];
      let staleEntries = [];
      let packs = [];
      if (db && db.entries) {
        try {
          packs = db.packs ? await db.packs.toArray() : [];
          const all = activePacks.length ? await db.entries.where('packName').anyOf(activePacks).toArray() : [];
          const disabled = new Set(settings && settings.config && settings.config.urlDisabledEntries ? (settings.config.urlDisabledEntries[url] || []) : []);
          activeEntries = all.filter(function(e){ return !disabled.has(e.id); });
          staleEntries = activeEntries.filter(function(e){ return e.searchStale; });
        } catch(e) {}
      }
      const required = ['__interceptorLoaded','__constLoaded','__settingsLoaded','__extractLoaded','__injectLoaded'];
      const missing = required.filter(function(k){ return !L[k]; });
      const panelLabels = UI.getPanels().filter(function(p){ return !p.hidden; }).map(function(p){ return p.label || p.id; });
      const apiReady = hasAnyApi(settings);
      const embReady = hasEmbeddingApi(settings);
      const injLogs = L.getInjLog ? L.getInjLog(chatKey) : [];
      const extLogs = L.getExtLog ? L.getExtLog(chatKey) : [];
      const refLogs = settings && settings.config && settings.config.urlRefinerLogs ? (settings.config.urlRefinerLogs[chatKey] || []) : [];

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          '대시보드',
          '현재 채팅의 연결, 로어, 검색 데이터, 추출 상태를 바로 확인'
        ));

        nd.appendChild(UI.createSummaryGrid([
          { label: '버전', value: L.VER || '?' },
          { label: '로드 상태', value: missing.length ? '확인 필요' : '정상' },
          { label: 'API 연결', value: apiReady ? '준비됨' : '필요' },
          { label: '검색 데이터', value: embReady ? (staleEntries.length ? '갱신 필요' : '사용 가능') : '연결 필요' },
          { label: '현재 팩', value: String(activePacks.length) },
          { label: '활성 항목', value: String(activeEntries.length) },
          { label: '자동 추출', value: settings && settings.config && settings.config.autoExtEnabled ? '작동' : '중지' },
          { label: '최근 오류', value: latestErrorText({ inj: injLogs, ext: extLogs, ref: refLogs }) }
        ]));
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('현재 상태', '실행 전 확인해야 할 항목'));
        nd.appendChild(UI.createNotice([
          '모듈: ' + (missing.length ? '누락 ' + missing.join(', ') : '정상 로드'),
          '사용 가능한 메뉴: ' + panelLabels.join(', '),
          '현재 대화 활성 팩: ' + (activePacks.length ? activePacks.join(', ') : '없음'),
          '검색 데이터 갱신 필요 항목: ' + staleEntries.length,
          '등록된 전체 팩: ' + packs.length
        ].join('\n'), missing.length || staleEntries.length ? 'warn' : 'info'));

        const openApi = UI.createButton('API 설정 열기', { kind: 'primary', onClick: function(){ openPanelById('api'); } });
        const openLore = UI.createButton('로어 관리 열기', { kind: 'primary', onClick: function(){ openPanelById('loreManager'); } });
        const openExtract = UI.createButton('추출 열기', { onClick: function(){ openPanelById('extract'); } });
        const manualExtract = UI.createButton('수동 추출 실행', { kind: 'success', onClick: async function(){
          if (!L.runAutoExtract) return UI.createAlertDialog({ title: '추출 불가', message: '추출 모듈을 불러오지 못했어요.', tone: 'error' });
          await L.runAutoExtract(true);
        }});
        const openLogs = UI.createButton('기록 열기', { onClick: function(){ openPanelById('logs'); } });
        const reload = UI.createButton('새로고침', { onClick: function(){ location.reload(); } });
        nd.appendChild(UI.createActionGroup([openApi, openLore], [openExtract, manualExtract, openLogs, reload], []));
      });
    }
  });

  UI.__startPanelLoaded = true;
  console.log('[LoreInj:UI] start panel loaded');
})();