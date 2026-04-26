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
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid #333;padding-bottom:8px;margin-bottom:8px;';
      const t = document.createElement('div');
      t.textContent = title + ' (' + items.length + ')';
      t.style.cssText = 'font-size:14px;color:' + color + ';font-weight:bold;';
      const clear = UI.createButton('Clear', { compact: true, kind: items.length ? 'danger' : '' });
      clear.disabled = !items.length;
      clear.onclick = function(){ if (confirm('Clear ' + title + '?')) { clearFn(); location.reload(); } };
      header.appendChild(t);
      header.appendChild(clear);
      nd.appendChild(header);

      if (!items.length) {
        nd.appendChild(UI.createNotice('No records.', 'info'));
        return;
      }

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;';
      items.slice(0, 30).forEach(function(item) {
        const row = document.createElement('div');
        row.style.cssText = 'border-bottom:1px dashed #222;padding:6px 0;font-size:12px;color:#ccc;line-height:1.5;';
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

      addLogSection(panel, 'Injection', '#4a9', inj, function(){ if (R.clearInjLog) R.clearInjLog(chatKey); }, function(item, row) {
        row.textContent = (item.time || '') + ' turn ' + (item.turn || '?') + ' / ' + (item.count || 0) + ' entries / ' + ((item.matched || []).join(', ') || item.note || 'no match');
      });

      addLogSection(panel, 'Extraction', '#da8', ext, function(){ if (R.clearExtLog) R.clearExtLog(chatKey); }, function(item, row) {
        row.textContent = '[' + (item.time || '') + '] ' + (item.isManual ? 'manual' : 'auto') + ' / ' + (item.status || '?') + ' / ' + (item.count || 0) + ' entries' + (item.error ? ' / ' + item.error : '');
      });

      addLogSection(panel, 'Refiner', '#ea5', ref, function(){
        if (!settings.config.urlRefinerLogs) settings.config.urlRefinerLogs = {};
        settings.config.urlRefinerLogs[chatKey] = [];
        save(settings);
      }, function(item, row) {
        row.textContent = '[' + (item.time || '') + '] ' + (item.isPass ? 'PASS' : item.isError ? 'ERROR' : 'REFINED') + (item.reason ? ' / ' + item.reason : '');
      });

      addLogSection(panel, 'Contradictions', '#d96', contradictions, function(){ _ls.removeItem('lore-contradictions'); }, function(item, row) {
        row.textContent = (item.name || '?') + ': ' + (item.oldStatus || '') + ' -> ' + (item.newStatus || '') + ' / ' + (item.time ? new Date(item.time).toLocaleString() : '');
      });
    }
  });

  UI.registerPanel({
    id: 'session',
    label: '세션 관리',
    title: '세션 관리',
    order: 85,
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
        nd.appendChild(UI.createSection('Session state', 'Current chat turn, active packs, and cooldown state.'));
        nd.appendChild(UI.createNotice(
          'Chat key: ' + chatKey + '\n' +
          'Turn counter: ' + turnCounter + '\n' +
          'Active packs: ' + (activePacks.length ? activePacks.join(', ') : 'none') + '\n' +
          'Active entries: ' + entries.length,
          entries.length ? 'info' : 'warn'
        ));

        const reset = UI.createButton('Reset session state', { kind: 'danger', bold: true });
        reset.onclick = function() {
          if (!confirm('Reset cooldown, last mention, and turn counter for this chat?')) return;

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
          alert('Session state reset.');
          location.reload();
        };
        const row = document.createElement('div');
        row.style.cssText = 'margin-top:10px;';
        row.appendChild(reset);
        nd.appendChild(row);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Cooldown entries'));
        const ids = Object.keys(cooldown || {});
        if (!ids.length) {
          nd.appendChild(UI.createNotice('No cooldown entries.', 'info'));
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
          const btn = UI.createButton('Reset', { compact: true });
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