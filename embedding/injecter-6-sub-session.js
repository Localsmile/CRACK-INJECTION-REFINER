// injecter-6-sub-session.js: 세션 상태 관리
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = (_w.__LoreEnv && _w.__LoreEnv.kv) || _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subSessionLoaded) return;
  
  const { C, db, settings, getChatKey, getTurnCounter, getCooldownMap, isEntryEnabledForUrl } = _w.__LoreInj;
  const COLOR = {
    muted: 'var(--li-muted,#748196)',
    soft: 'var(--li-text-soft,#a9b6c7)',
    text: 'var(--li-text,#e7edf5)',
    accent: 'var(--li-accent,#5aa7ff)',
    ok: '#78d5a8',
    warn: '#e7b56f',
    danger: '#ef6b6b'
  };
  const BTN_DANGER = 'min-height:34px;padding:7px 11px;font-size:12px;border-radius:7px;cursor:pointer;font-weight:800;border:1px solid #8f333f;background:#3a171b;color:#ffc9c9;';
  const BTN_GHOST = 'min-height:30px;padding:5px 10px;font-size:11px;border-radius:7px;cursor:pointer;font-weight:800;border:1px solid var(--li-line,#2f3b4f);background:transparent;color:var(--li-text-soft,#a9b6c7);';

  function cooldownTurnIndex(value) {
    if (value && typeof value === 'object') return Number(value.turnIndex || value.turn || 0) || 0;
    return Number(value || 0) || 0;
  }
  
  _w.__LoreInj.registerSettingsPage('session', '세션 상태', (m) => {
      const renderSessionStatus = async (panel) => {
        const chatKey = getChatKey();
        const turnCounter = getTurnCounter(chatKey);
        const cMap = getCooldownMap(chatKey);
        const urlPacks = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : (settings.config.urlPacks?.[C.getCurUrl()] || []);
  
        let allEntries = [];
        let sceneState = null;
        if (urlPacks.length > 0) {
          const all = await db.entries.toArray();
          allEntries = all.filter(e => urlPacks.includes(e.packName) && isEntryEnabledForUrl(e));
        }
        try { if (C.getSceneState) sceneState = await C.getSceneState(chatKey); } catch(_) {}
  
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
  
          const headerRow = document.createElement('div');
          headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--li-line,#2f3b4f);padding-bottom:10px;gap:12px;';
          const titleWrap = document.createElement('div');
          titleWrap.style.cssText = 'min-width:0;';
          const title = document.createElement('div');
          title.textContent = '현재 세션 상태';
          title.style.cssText = 'font-size:14px;color:' + COLOR.text + ';font-weight:800;';
          const sub = document.createElement('div');
          sub.textContent = '서버 기준 상태 / 활성 로어팩 ' + (urlPacks.length || 0) + '개';
          sub.style.cssText = 'font-size:11px;color:' + COLOR.soft + ';margin-top:4px;';
          titleWrap.appendChild(title);
          titleWrap.appendChild(sub);
  
          const clearAllBtn = document.createElement('button');
          clearAllBtn.textContent = '세션 전체 초기화';
          clearAllBtn.style.cssText = BTN_DANGER;
          clearAllBtn.onclick = async () => {
            if(!confirm('이 채팅방의 모든 쿨다운, 시간감쇠(망각) 점수 및 턴 수를 초기화할 것?')) return;
            try {
              const curUrl = C.getCurUrl();
              if(settings.config.urlCooldownMaps) delete settings.config.urlCooldownMaps[chatKey];

              _ls.removeItem('lore-fe-recent-' + chatKey);

              const packs = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(curUrl) : (settings.config.urlPacks?.[curUrl] || []);
              if (packs.length) {
                const entries = await db.entries.where('packName').anyOf(packs).toArray();
                for (const e of entries) {
                  try { await db.entries.update(e.id, { lastMentionedTurn: 0, lastMentionedMsgId: '', lastMentionedAt: 0 }); } catch(_) {}
                }
              }

              try { if (db.workingMemory) await db.workingMemory.delete(curUrl); } catch(_) {}
              settings.save();
              m.replaceContentPanel(renderSessionStatus, '세션 상태 관리');
            } catch (e) {
              console.error('[LoreInj:session] 전체 초기화 실패:', e);
              alert('세션 초기화 실패: ' + (e.message || e));
            }
          };
          headerRow.appendChild(titleWrap);
          headerRow.appendChild(clearAllBtn);
          nd.appendChild(headerRow);

          const mig = settings.config.migrationStatus;
          if (mig && mig.message) {
            const ok = !/failed/i.test(mig.message);
            const migBox = document.createElement('details');
            migBox.style.cssText = `margin-bottom:12px;padding:9px 10px;border-radius:9px;border:1px solid ${ok ? 'rgba(129,140,248,.45)' : 'rgba(220,38,38,.45)'};background:var(--li-surface-2,#2b2b31);color:${COLOR.soft};font-size:11px;line-height:1.5;`;
            const summary = document.createElement('summary');
            summary.textContent = ok ? '저장 데이터 점검 완료' : '저장 데이터 점검 실패';
            summary.style.cssText = 'cursor:pointer;color:' + (ok ? 'var(--li-accent-strong,#c7d2fe)' : COLOR.danger) + ';font-size:12px;font-weight:800;min-height:24px;';
            const detail = document.createElement('div');
            const humanMessage = C.humanizeStatusText ? C.humanizeStatusText(mig.message) : mig.message;
            detail.textContent = `상세: ${humanMessage}\n정리된 로어: ${mig.migratedEntries || 0}개\n갱신 필요 검색 데이터 삭제: ${mig.staleEmbeddingsRemoved || 0}개\n확인 시각: ${mig.checkedAt ? new Date(mig.checkedAt).toLocaleString() : '알 수 없음'}`;
            detail.style.cssText = 'white-space:pre-line;margin-top:8px;color:' + COLOR.soft + ';';
            migBox.appendChild(summary);
            migBox.appendChild(detail);
            nd.appendChild(migBox);
          }

          if (sceneState && sceneState.rev) {
            const stateBox = document.createElement('div');
            stateBox.style.cssText = 'margin-bottom:12px;padding:10px;border-radius:9px;border:1px solid var(--li-line,#2f3b4f);background:#0c1320;color:' + COLOR.soft + ';font-size:11px;line-height:1.55;';
            const parts = [];
            if (sceneState.location) parts.push('장소 ' + sceneState.location);
            if (Array.isArray(sceneState.presentChars) && sceneState.presentChars.length) parts.push('등장 ' + sceneState.presentChars.slice(0, 5).join(', '));
            if (Array.isArray(sceneState.pending) && sceneState.pending.length) parts.push('미해결 ' + sceneState.pending.length + '개');
            if (Array.isArray(sceneState.facts) && sceneState.facts.length) parts.push('고정 사실 ' + sceneState.facts.length + '개');
            stateBox.textContent = '장면 상태 rev ' + sceneState.rev + ': ' + (parts.join(' / ') || '저장된 요약 정보 있음');
            nd.appendChild(stateBox);
          }
  
          if (!allEntries.length) {
            const empty = document.createElement('div');
            empty.textContent = '현재 활성화된 로어가 없습니다.';
            empty.style.cssText = 'color:' + COLOR.soft + ';font-size:12px;text-align:center;padding:14px;border:1px dashed var(--li-line,#2f3b4f);border-radius:9px;';
            nd.appendChild(empty);
            return;
          }
  
          const statusList = [];
  
          for (const e of allEntries) {
            let cooldownRem = 0;
            const lastInj = cMap[e.id];
            if (lastInj !== undefined) {
              const elap = turnCounter - cooldownTurnIndex(lastInj);
              cooldownRem = Math.max(0, settings.config.cooldownTurns - elap);
            }
  
            const lastAt = Number(e.lastMentionedAt || 0);
            const hoursSince = lastAt ? Math.max(0, (Date.now() - lastAt) / 3600000) : null;
            const turnsSince = e.lastMentionedTurn && turnCounter ? Math.max(0, turnCounter - e.lastMentionedTurn) : 0;
            let reinjScore = 0;
            if (settings.config.decayEnabled) {
               reinjScore = turnsSince > 0
                 ? C.calcReinjectionScore(turnsSince, e.type, settings.config)
                 : (hoursSince != null ? Math.min(1, hoursSince / 24) : 0);
            }
  
            if (cooldownRem > 0 || reinjScore > 0.1 || turnsSince > 0 || e.lastMentionedMsgId) {
              const evTurn = e.eventTurn || e.timeline?.eventTurn || e.createdTurn || 0;
              const gap = evTurn ? Math.max(0, turnCounter - evTurn) : null;
              statusList.push({
                id: e.id, name: e.name, type: e.type, pack: e.packName,
                cooldownRem, turnsSince, hoursSince, reinjScore,
                eventTurn: evTurn, gap,
                entities: (C.inferEntryEntities ? C.inferEntryEntities(e) : (e.entities || [])).slice(0, 4)
              });
            }
          }
  
          statusList.sort((a,b) => b.reinjScore - a.reinjScore);
  
          if (statusList.length === 0) {
            const empty2 = document.createElement('div');
            empty2.textContent = '표시할 상태(쿨다운/점수)가 없습니다.';
            empty2.style.cssText = 'color:' + COLOR.soft + ';font-size:12px;text-align:center;padding:14px;border:1px dashed var(--li-line,#2f3b4f);border-radius:9px;';
            nd.appendChild(empty2);
            return;
          }
  
          const listContainer = document.createElement('div');
          listContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:430px;overflow-y:auto;';
  
          for (const st of statusList) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;background:#0c1320;border:1px solid var(--li-line,#2f3b4f);border-radius:9px;padding:10px 12px;gap:12px;';
  
            const info = document.createElement('div');
            info.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:0;';
            const nameEl = document.createElement('div');
            nameEl.textContent = `[${st.type}] ${st.name}`;
            nameEl.style.cssText = 'font-size:13px;font-weight:800;color:' + COLOR.text + ';word-break:break-word;';
  
            const statText = document.createElement('div');
            statText.style.cssText = 'font-size:11px;color:' + COLOR.soft + ';display:flex;gap:10px;flex-wrap:wrap;line-height:1.45;';
  
            let cdStr = st.cooldownRem > 0 ? `<span style="color:${COLOR.danger};">다시 삽입까지 ${st.cooldownRem}턴 남음</span>` : `<span style="color:${COLOR.ok};">다시 삽입 가능</span>`;
            let decayStr = '';
            if (settings.config.decayEnabled) {
              const p = Math.round(st.reinjScore * 100);
              const pColor = p > 70 ? COLOR.danger : (p > 40 ? COLOR.warn : COLOR.soft);
              decayStr = `<span>마지막 삽입 후 ${st.turnsSince}턴 경과 (재삽입 가능성: <span style="color:${pColor}">${p}%</span>)</span>`;
            }
            const timeStr = st.eventTurn ? `<span>기록된 시점 ${st.eventTurn}턴${st.gap != null ? ' / 현재와 ' + st.gap + '턴 차이' : ''}</span>` : '';
            const entStr = st.entities && st.entities.length ? `<span>관련 대상: ${st.entities.join(', ')}</span>` : '';
            statText.innerHTML = [cdStr, decayStr, timeStr, entStr].filter(Boolean).join('');
  
            info.appendChild(nameEl);
            info.appendChild(statText);
  
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '리셋';
            resetBtn.style.cssText = BTN_GHOST;
            resetBtn.onclick = async () => {
              if (settings.config.urlCooldownMaps?.[chatKey]) {
                delete settings.config.urlCooldownMaps[chatKey][st.id];
              }
              try { await db.entries.update(st.id, { lastMentionedTurn: 0, lastMentionedMsgId: '', lastMentionedAt: 0 }); } catch (_) {}
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
  
  _w.__LoreInj.__subSessionLoaded = true;
})();
