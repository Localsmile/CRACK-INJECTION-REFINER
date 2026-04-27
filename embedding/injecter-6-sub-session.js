// injecter-6-sub-session.js: 세션 상태 관리
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subSessionLoaded) return;
  
  const { C, db, settings, getChatKey, getTurnCounter, getCooldownMap, isEntryEnabledForUrl } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  
  _w.__LoreInj.registerSubMenu('session', function(modal) {
    modal.createSubMenu('세션 상태 관리', (m) => {
      const renderSessionStatus = async (panel) => {
        const chatKey = getChatKey();
        const turnCounter = getTurnCounter(chatKey);
        const cMap = getCooldownMap(chatKey);
        const urlPacks = settings.config.urlPacks?.[C.getCurUrl()] || [];
  
        let allEntries = [];
        if (urlPacks.length > 0) {
          const all = await db.entries.toArray();
          allEntries = all.filter(e => urlPacks.includes(e.packName) && isEntryEnabledForUrl(e));
        }
  
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
  
          const headerRow = document.createElement('div');
          headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #333;padding-bottom:8px;';
          const title = document.createElement('div');
          title.textContent = `현재 세션 상태 (턴: ${turnCounter})`;
          title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;';
  
          const clearAllBtn = document.createElement('button');
          clearAllBtn.textContent = '세션 전체 초기화';
          clearAllBtn.style.cssText = 'padding:6px 12px;font-size:11px;border-radius:4px;cursor:pointer;background:#833;color:#fff;border:none;font-weight:bold;';
          clearAllBtn.onclick = () => {
            if(confirm('이 채팅방의 모든 쿨다운, 시간감쇠(망각) 점수 및 턴 수를 초기화할 것?')) {
              if(settings.config.urlCooldownMaps) delete settings.config.urlCooldownMaps[chatKey];
              const lastMentionStr = _ls.getItem('lore-last-mention');
              if (lastMentionStr) {
                const lastMention = JSON.parse(lastMentionStr);
                if(lastMention[chatKey]) delete lastMention[chatKey];
                _ls.setItem('lore-last-mention', JSON.stringify(lastMention));
              }
              const turnCountersStr = _ls.getItem('lore-turn-counters');
              if (turnCountersStr) {
                const turnCounters = JSON.parse(turnCountersStr);
                if(turnCounters[chatKey]) delete turnCounters[chatKey];
                _ls.setItem('lore-turn-counters', JSON.stringify(turnCounters));
              }
              settings.save();
              m.replaceContentPanel(renderSessionStatus, '세션 상태 관리');
            }
          };
          headerRow.appendChild(title);
          headerRow.appendChild(clearAllBtn);
          nd.appendChild(headerRow);
  
          if (!allEntries.length) {
            const empty = document.createElement('div');
            empty.textContent = '현재 활성화된 로어가 없습니다.';
            empty.style.cssText = 'color:#888;font-size:12px;text-align:center;padding:10px;';
            nd.appendChild(empty);
            return;
          }
  
          const lastMentionMap = JSON.parse(_ls.getItem('lore-last-mention') || '{}')[chatKey] || {};
          const statusList = [];
  
          for (const e of allEntries) {
            let cooldownRem = 0;
            const lastInj = cMap[e.id];
            if (lastInj !== undefined) {
              const elap = turnCounter - lastInj;
              cooldownRem = Math.max(0, settings.config.cooldownTurns - elap);
            }
  
            const lastMent = lastMentionMap[e.id] || 0;
            const turnsSince = turnCounter - lastMent;
            let reinjScore = 0;
            if (settings.config.decayEnabled) {
               reinjScore = C.calcReinjectionScore(turnsSince, e.type, settings.config);
            }
  
            if (cooldownRem > 0 || reinjScore > 0.1 || turnsSince > 0) {
              statusList.push({
                id: e.id, name: e.name, type: e.type, pack: e.packName,
                cooldownRem, turnsSince, reinjScore
              });
            }
          }
  
          statusList.sort((a,b) => b.reinjScore - a.reinjScore);
  
          if (statusList.length === 0) {
            const empty2 = document.createElement('div');
            empty2.textContent = '표시할 상태(쿨다운/점수)가 없습니다.';
            empty2.style.cssText = 'color:#888;font-size:12px;text-align:center;padding:10px;';
            nd.appendChild(empty2);
            return;
          }
  
          const listContainer = document.createElement('div');
          listContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;';
  
          for (const st of statusList) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:8px 12px;';
  
            const info = document.createElement('div');
            info.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
            const nameEl = document.createElement('div');
            nameEl.textContent = `[${st.type}] ${st.name}`;
            nameEl.style.cssText = 'font-size:13px;font-weight:bold;color:#ccc;';
  
            const statText = document.createElement('div');
            statText.style.cssText = 'font-size:11px;color:#888;display:flex;gap:12px;';
  
            let cdStr = st.cooldownRem > 0 ? `<span style="color:#d66;">⏳ 쿨다운 ${st.cooldownRem}턴 남음</span>` : `<span style="color:#4a9;">✅ 쿨다운 완료</span>`;
            let decayStr = '';
            if (settings.config.decayEnabled) {
              const p = Math.round(st.reinjScore * 100);
              const pColor = p > 70 ? '#d66' : (p > 40 ? '#da8' : '#888');
              decayStr = `<span>망각: ${st.turnsSince}턴 경과 (재주입 점수: <span style="color:${pColor}">${p}%</span>)</span>`;
            }
            statText.innerHTML = cdStr + decayStr;
  
            info.appendChild(nameEl);
            info.appendChild(statText);
  
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '리셋';
            resetBtn.style.cssText = 'padding:4px 10px;font-size:11px;border-radius:4px;cursor:pointer;background:transparent;border:1px solid #555;color:#ccc;';
            resetBtn.onclick = () => {
              if (settings.config.urlCooldownMaps?.[chatKey]) {
                delete settings.config.urlCooldownMaps[chatKey][st.id];
              }
              const allMentions = JSON.parse(_ls.getItem('lore-last-mention') || '{}');
              if (allMentions[chatKey] && allMentions[chatKey][st.id]) {
                delete allMentions[chatKey][st.id];
                _ls.setItem('lore-last-mention', JSON.stringify(allMentions));
              }
              settings.save();
              m.replaceContentPanel(renderSessionStatus, '세션 상태 관리');
            };
  
            row.appendChild(info);
            row.appendChild(resetBtn);
            listContainer.appendChild(row);
          }
          nd.appendChild(listContainer);
        }});
      };
      m.replaceContentPanel(renderSessionStatus, '세션 상태 조회');
    });
  });
  
  _w.__LoreInj.__subSessionLoaded = true;
})();
