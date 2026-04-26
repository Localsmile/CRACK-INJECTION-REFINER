// == 인젝터 UI 패널 — Logs + Session ==
// 역할: 실행 기록과 세션 상태
// 의존: injecter-ui-utils.js, injecter-2/4/5.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:logs] UI utils not loaded');
    return;
  }
  if (UI.__logsPanelLoaded) return;

  function L() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  function addLogSection(panel, title, color, items, clearFn, renderItem) {
    UI.addBox(panel, function(nd) {
      const sourceItems = Array.isArray(items) ? items : [];
      const detail = UI.createDetailsSection
        ? UI.createDetailsSection(title + ' (' + sourceItems.length + ')', '최근 기록을 필요할 때만 펼쳐서 확인합니다.', false)
        : null;
      if (detail) {
        nd.appendChild(detail);
        nd = detail.contentBody || detail;
      } else {
        nd.appendChild(UI.createSection(title + ' (' + sourceItems.length + ')'));
      }

      const actions = document.createElement('div');
      actions.className = 'lore-actions';
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px;';
      const clear = UI.createButton('비우기', { compact: true, kind: sourceItems.length ? 'danger' : '' });
      clear.disabled = !sourceItems.length;
      clear.onclick = function(){ if (confirm(title + '을(를) 비울까요?')) { clearFn(); location.reload(); } };
      actions.appendChild(clear);
      nd.appendChild(actions);

      if (!sourceItems.length) {
        nd.appendChild(UI.createNotice('기록 없음', 'info'));
        return;
      }

      const list = document.createElement('div');
      list.className = 'lore-scroll-list';
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;';
      sourceItems.slice(0, 30).forEach(function(item) {
        const row = document.createElement('div');
        row.className = 'lore-card';
        row.style.cssText = 'border:1px solid #26332f;border-radius:10px;background:#0f1413;padding:8px 9px;font-size:12px;color:#ccc;line-height:1.5;word-break:break-all;';
        renderItem(item, row);
        list.appendChild(row);
      });
      nd.appendChild(list);
    });
  }

  UI.registerPanel({
    id: 'logs',
    label: '기록',
    title: '기록',
    order: 80,
    render: function(panel) {
      const R = L();
      const settings = R.settings;
      const _ls = R._ls || localStorage;
      const chatKey = R.getChatKey ? R.getChatKey() : location.href;
      const inj = R.getInjLog ? R.getInjLog(chatKey) : [];
      const ext = R.getExtLog ? R.getExtLog(chatKey) : [];
      const ref = settings && settings.config && settings.config.urlRefinerLogs ? (settings.config.urlRefinerLogs[chatKey] || []) : [];
      let contradictions = [];
      try { contradictions = JSON.parse(_ls.getItem('lore-contradictions') || '[]'); } catch(_){}

      addLogSection(panel, '주입 기록', '#4a9', inj, function(){ if (R.clearInjLog) R.clearInjLog(chatKey); }, function(item, row) {
        row.textContent = (item.time || '') + ' turn ' + (item.turn || '?') + ' / ' + (item.count || 0) + ' entries / ' + ((item.matched || []).join(', ') || item.note || 'no match');
      });

      addLogSection(panel, '추출 기록', '#da8', ext, function(){ if (R.clearExtLog) R.clearExtLog(chatKey); }, function(item, row) {
        row.textContent = '[' + (item.time || '') + '] ' + (item.isManual ? 'manual' : 'auto') + ' / ' + (item.status || '?') + ' / ' + (item.count || 0) + ' entries' + (item.error ? ' / ' + item.error : '');
      });

      addLogSection(panel, '응답 교정 기록', '#ea5', ref, function(){
        if (!settings.config.urlRefinerLogs) settings.config.urlRefinerLogs = {};
        settings.config.urlRefinerLogs[chatKey] = [];
        save(settings);
      }, function(item, row) {
        row.textContent = '[' + (item.time || '') + '] ' + (item.isPass ? 'PASS' : item.isError ? 'ERROR' : 'REFINED') + (item.reason ? ' / ' + item.reason : '');
      });

      addLogSection(panel, '충돌 기록', '#d96', contradictions, function(){ _ls.removeItem('lore-contradictions'); }, function(item, row) {
        row.textContent = (item.name || '?') + ': ' + (item.oldStatus || '') + ' -> ' + (item.newStatus || '') + ' / ' + (item.time ? new Date(item.time).toLocaleString() : '');
      });
    }
  });

  UI.registerPanel({
    id: 'session',
    label: '세션 관리',
    title: '세션 관리',
    order: 90,
    render: async function(panel) {
      const R = L();
      const C = R.C;
      const db = R.db;
      const settings = R.settings;
      const _ls = R._ls || localStorage;
      if (!settings || !settings.config || !db) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Settings or database are not loaded.', 'error')); });
        return;
      }

      const chatKey = R.getChatKey ? R.getChatKey() : location.href;
      const turnCounter = R.getTurnCounter ? R.getTurnCounter(chatKey) : 0;
      const cooldown = R.getCooldownMap ? R.getCooldownMap(chatKey) : {};
      const curUrl = C && C.getCurUrl ? C.getCurUrl() : location.href;
      const activePacks = (settings.config.urlPacks && settings.config.urlPacks[curUrl]) || [];
      const entries = activePacks.length ? (await db.entries.toArray()).filter(e => activePacks.includes(e.packName)) : [];

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('세션 상태', '현재 채팅 턴, 활성 팩, 쿨다운 상태를 확인합니다.'));
        nd.appendChild(UI.createNotice(
          '채팅 키: ' + chatKey + '\n' +
          '턴 카운터: ' + turnCounter + '\n' +
          '활성 팩: ' + (activePacks.length ? activePacks.join(', ') : '없음') + '\n' +
          '활성 항목: ' + entries.length,
          entries.length ? 'info' : 'warn'
        ));

        const reset = UI.createButton('세션 상태 초기화', { kind: 'danger', bold: true });
        reset.onclick = function() {
          if (!confirm('이 채팅의 쿨다운, 마지막 언급, 턴 카운터를 초기화할까요?')) return;

          if (settings.config.urlCooldownMaps && settings.config.urlCooldownMaps[chatKey]) {
            delete settings.config.urlCooldownMaps[chatKey];
          }

          try {
            const lastMention = JSON.parse(_ls.getItem('lore-last-mention') || '{}');
            if (lastMention[chatKey]) delete lastMention[chatKey];
            _ls.setItem('lore-last-mention', JSON.stringify(lastMention));
          } catch(_){}

          try {
            const turnCounters = JSON.parse(_ls.getItem('lore-turn-counters') || '{}');
            if (turnCounters[chatKey]) delete turnCounters[chatKey];
            _ls.setItem('lore-turn-counters', JSON.stringify(turnCounters));
          } catch(_){}

          save(settings);
          alert('세션 상태를 초기화했습니다.');
          location.reload();
        };
        const row = document.createElement('div');
        row.style.cssText = 'margin-top:10px;';
        row.appendChild(reset);
        nd.appendChild(row);
      });

      UI.addBox(panel, function(nd) {
        const cooldownHost = nd;
        if (UI.createDetailsSection) {
          const detail = UI.createDetailsSection('쿨다운 항목', '현재 채팅에서 잠시 제외된 로어 항목입니다.', false);
          cooldownHost.appendChild(detail);
          nd = detail.contentBody || detail;
        } else {
          nd.appendChild(UI.createSection('쿨다운 항목'));
        }
        const ids = Object.keys(cooldown || {});
        if (!ids.length) {
          nd.appendChild(UI.createNotice('쿨다운 항목 없음', 'info'));
          return;
        }

        const byId = {};
        entries.forEach(e => { byId[e.id] = e; });
        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;';
        ids.forEach(function(id) {
          const entry = byId[id];
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:center;border:1px solid #333;border-radius:6px;background:#111;padding:8px;';
          const text = document.createElement('div');
          text.textContent = (entry ? '[' + (entry.type || 'entity') + '] ' + entry.name : id) + ' / last turn ' + cooldown[id];
          text.style.cssText = 'font-size:12px;color:#ccc;word-break:break-all;';
          const btn = UI.createButton('초기화', { compact: true });
          btn.onclick = function() {
            if (settings.config.urlCooldownMaps && settings.config.urlCooldownMaps[chatKey]) {
              delete settings.config.urlCooldownMaps[chatKey][id];
              save(settings);
              row.remove();
            }
          };
          row.appendChild(text);
          row.appendChild(btn);
          list.appendChild(row);
        });
        nd.appendChild(list);
      });
    }
  });

  UI.__logsPanelLoaded = true;
  console.log('[LoreInj:UI] logs and session panels loaded');
})();