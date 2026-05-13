// injecter-6-sub-log.js: 실행 로그
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subLogLoaded) return;
  
  const { C, settings, getChatKey, getInjLog, getExtLog, clearInjLog, clearExtLog } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  
  _w.__LoreInj.registerSubMenu('log', function(modal) {
    modal.createSubMenu('실행 로그', (m) => {
      const renderLogs = (panel) => {
        const chatKey = getChatKey();
        const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const shortList = (arr, limit = 3) => (Array.isArray(arr) ? arr : []).map(escHtml).filter(Boolean).slice(0, limit).join(', ');
        const fmtCostUsd = (n) => '$' + (Math.abs(Number(n)) < 0.01 ? Number(n).toFixed(5) : Number(n).toFixed(4));
        const renderCostLine = (i) => {
          const parts = [];
          if (i.model) parts.push(escHtml(i.model));
          if (i.elapsedMs) parts.push((i.elapsedMs / 1000).toFixed(2) + 's');
          if (i.cost) {
            const c = i.cost;
            if (c.isBatchAggregate) {
              if (c.usd != null) parts.push(fmtCostUsd(c.usd) + (c.hasUnknown ? ' <span style="color:#666;">(일부 제외)</span>' : '') + (c.estimated ? ' <span style="color:#888;" title="char/4 추정">~</span>' : ''));
              else if (c.hasUnknown) parts.push('<span style="color:#888;">—</span>');
            } else {
              if (c.usd != null) parts.push(fmtCostUsd(c.usd) + (c.estimated ? ' <span style="color:#888;" title="char/4 추정">~</span>' : ''));
              else parts.push('<span style="color:#888;">—</span>');
            }
          }
          return parts.length ? '<br><span style="font-size:10px;color:#888;">' + parts.join(' · ') + '</span>' : '';
        };
        const iLog = getInjLog(chatKey); const eLog = getExtLog(chatKey); const cLog = JSON.parse(_ls.getItem('lore-contradictions') || '[]'); const rLog = settings.config.urlRefinerLogs?.[chatKey] || [];
  
        const makeLogBox = (title, color, items, renderer) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            const hRow = document.createElement('div'); hRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid #333;margin-bottom:8px;cursor:pointer;';
            const leftWrap = document.createElement('div'); leftWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';
            const arrow = document.createElement('span'); arrow.textContent = '▶'; arrow.style.cssText = 'font-size:11px;color:#888;transition:transform .15s;';
            const t = document.createElement('div'); t.textContent = `${title} (${items.length})`; t.style.cssText = `font-size:14px;color:${color};font-weight:bold;`;
            leftWrap.appendChild(arrow); leftWrap.appendChild(t);
            hRow.appendChild(leftWrap);
            if (items.length > 0) {
              const btn = document.createElement('button');
              btn.textContent = '초기화';
              btn.style.cssText = 'padding:4px 10px;font-size:11px;border-radius:4px;cursor:pointer;background:transparent;color:#d66;border:1px solid #d66;';
              btn.onclick = (ev) => {
                ev.stopPropagation();
                if(confirm('삭제?')) { renderer(true); m.replaceContentPanel(renderLogs, '로그'); }
              };
              hRow.appendChild(btn);
            }
            nd.appendChild(hRow);
            const listCon = document.createElement('div');
            listCon.style.display = 'none';
            if (!items.length) {
              listCon.appendChild(Object.assign(document.createElement('div'), { textContent: '기록 없음.', style: 'font-size:12px;color:#888;' }));
            } else {
              items.slice(0, 20).forEach(i => renderer(false, i, listCon));
            }
            nd.appendChild(listCon);
            hRow.onclick = () => {
              const isOpen = listCon.style.display !== 'none';
              listCon.style.display = isOpen ? 'none' : 'block';
              arrow.textContent = isOpen ? '▶' : '▼';
            };
          }});
        };
  
        const renderCostBox = (panel) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            let period = 'all';
            let detailsOpen = false;
  
            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid #333;margin-bottom:8px;flex-wrap:wrap;gap:8px;';
  
            const leftWrap = document.createElement('div');
            leftWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;min-width:0;flex-wrap:wrap;';
            const arrow = document.createElement('span');
            arrow.textContent = '▶'; arrow.style.cssText = 'font-size:11px;color:#888;transition:transform .15s;';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = 'API 비용'; titleSpan.style.cssText = 'font-size:14px;color:#cc6;font-weight:bold;';
            const totalSpan = document.createElement('span');
            totalSpan.style.cssText = 'font-size:14px;color:#fff;font-weight:bold;';
            const subSpan = document.createElement('span');
            subSpan.style.cssText = 'font-size:11px;color:#888;';
            leftWrap.append(arrow, titleSpan, totalSpan, subSpan);
  
            const rightWrap = document.createElement('div');
            rightWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
  
            const periods = [{k:'24h',l:'24h'},{k:'7d',l:'7d'},{k:'30d',l:'30d'},{k:'all',l:'전체'}];
            const periodBtns = {};
            periods.forEach(p => {
              const b = document.createElement('button');
              b.textContent = p.l;
              b.style.cssText = 'padding:3px 8px;font-size:10px;border-radius:3px;cursor:pointer;background:transparent;border:1px solid #444;color:#aaa;';
              b.onclick = (ev) => { ev.stopPropagation(); period = p.k; refresh(); };
              periodBtns[p.k] = b;
              rightWrap.appendChild(b);
            });
  
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '초기화';
            clearBtn.style.cssText = 'padding:3px 8px;font-size:10px;border-radius:3px;cursor:pointer;background:transparent;color:#d66;border:1px solid #d66;margin-left:4px;';
            clearBtn.onclick = (ev) => {
              ev.stopPropagation();
              if (confirm('전체 API 비용 기록(이벤트 + 전체 기간 누적)을 삭제하시겠습니까?')) {
                if (C.clearCostEvents) C.clearCostEvents();
                if (C.clearCumulativeCost) C.clearCumulativeCost();
                refresh();
              }
            };
            rightWrap.appendChild(clearBtn);
  
            headerRow.append(leftWrap, rightWrap);
            nd.appendChild(headerRow);
  
            const detailsCon = document.createElement('div');
            detailsCon.style.display = 'none';
            nd.appendChild(detailsCon);
  
            leftWrap.onclick = () => {
              detailsOpen = !detailsOpen;
              detailsCon.style.display = detailsOpen ? 'block' : 'none';
              arrow.textContent = detailsOpen ? '▼' : '▶';
            };
  
            const fmtUsd = (n) => '$' + (Math.abs(n) < 0.01 ? n.toFixed(5) : n.toFixed(4));
            const fmtTok = (n) => n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n);
  
            const refresh = () => {
              Object.entries(periodBtns).forEach(([k, b]) => {
                if (k === period) { b.style.background = '#cc6'; b.style.color = '#222'; b.style.borderColor = '#cc6'; }
                else { b.style.background = 'transparent'; b.style.color = '#aaa'; b.style.borderColor = '#444'; }
              });
  
              const all = (C.getCostEvents && C.getCostEvents()) || [];
              const now = Date.now();
              const ms = { '24h': 86400000, '7d': 7*86400000, '30d': 30*86400000 }[period];
              const events = ms ? all.filter(e => (now - (e.ts||0)) <= ms) : all;
  
              let totalUsd = 0, totalCalls = events.length, unknownCalls = 0, estCalls = 0;
              const byModel = {}, byFeature = {}, byPack = {};
              const packForChatKey = (ck) => {
                if (!ck || ck === 'global') return '글로벌';
                const packs = settings.config.urlAutoExtPacks || {};
                if (packs[ck]) return packs[ck];
                const m = String(ck).match(/^chat:([a-f0-9]+)$/);
                if (m) {
                  for (const [url, pack] of Object.entries(packs)) {
                    if (url.indexOf(m[1]) !== -1) return pack;
                  }
                }
                return '글로벌';
              };
              const bump = (bucket, key, e) => {
                if (!bucket[key]) bucket[key] = { calls: 0, usd: 0, unknown: 0, est: 0, inTok: 0, outTok: 0 };
                const b = bucket[key];
                b.calls++;
                b.inTok += Number(e.inTok) || 0;
                b.outTok += Number(e.outTok) || 0;
                if (e.estimated) b.est++;
                if (e.unknown || e.usd == null) b.unknown++;
                else b.usd += Number(e.usd) || 0;
              };
              for (const e of events) {
                if (e.unknown || e.usd == null) unknownCalls++;
                else totalUsd += Number(e.usd) || 0;
                if (e.estimated) estCalls++;
                bump(byModel, e.model || '?', e);
                bump(byFeature, e.feature || '?', e);
                bump(byPack, e.packName || packForChatKey(e.chatKey), e);
              }
  
              // '전체' 기간 헤더는 누적치(getCumulativeCost) 우선, 상세 표는 이벤트 기반.
              const cumul = (period === 'all' && C.getCumulativeCost) ? C.getCumulativeCost() : null;
              const cumulOverride = !!(cumul && Number(cumul.count) > 0);
              const truncated = cumulOverride && Number(cumul.count) > events.length;
              if (cumulOverride) {
                totalUsd = Number(cumul.usd) || 0;
                totalCalls = Number(cumul.count) || 0;
                unknownCalls = Number(cumul.unknownCount) || 0;
                estCalls = Number(cumul.estimatedCount) || 0;
              }
  
              totalSpan.textContent = ' ' + fmtUsd(totalUsd);
              const subParts = [totalCalls + '회'];
              if (unknownCalls) subParts.push('직접입력 ' + unknownCalls + '회 제외');
              if (estCalls) subParts.push('추정 ' + estCalls);
              subSpan.textContent = ' (' + subParts.join(' · ') + ')';
  
              const featureLabels = { autoExtract:'자동추출', batchExtract:'배치추출', temporalExtract:'시간축추출', urlImport:'URL임포트', textImport:'텍스트임포트', refine:'교정', rerank:'리랭킹', judge:'판단AI', embed:'임베딩', apiTest:'API테스트' };
              const renderTable = (title, bucket, keyLabel, labelMap) => {
                const rows = Object.entries(bucket).sort((a, b) => (b[1].usd - a[1].usd) || (b[1].calls - a[1].calls));
                if (!rows.length) return '';
                let html = '<div style="margin-top:10px;"><div style="font-size:12px;color:#cc6;font-weight:bold;margin-bottom:4px;">' + title + '</div>';
                html += '<table style="width:100%;border-collapse:collapse;font-size:11px;color:#ccc;"><thead><tr style="border-bottom:1px solid #333;color:#888;text-align:left;"><th style="padding:3px 4px;">' + keyLabel + '</th><th style="padding:3px 4px;text-align:right;">호출</th><th style="padding:3px 4px;text-align:right;">입력</th><th style="padding:3px 4px;text-align:right;">출력</th><th style="padding:3px 4px;text-align:right;">USD</th></tr></thead><tbody>';
                for (const [k, v] of rows) {
                  const usdCell = v.unknown === v.calls
                    ? '<span style="color:#888;">—</span>'
                    : (fmtUsd(v.usd) + (v.unknown ? ' <span style="color:#888;font-size:10px;">(+' + v.unknown + ' 제외)</span>' : '') + (v.est ? ' <span style="color:#888;font-size:10px;" title="char/4 추정">~</span>' : ''));
                  const labelText = labelMap && labelMap[k] ? escHtml(labelMap[k]) : escHtml(k);
                  html += '<tr style="border-bottom:1px dashed #222;"><td style="padding:3px 4px;word-break:break-all;">' + labelText + '</td><td style="padding:3px 4px;text-align:right;">' + v.calls + '</td><td style="padding:3px 4px;text-align:right;color:#888;">' + fmtTok(v.inTok) + '</td><td style="padding:3px 4px;text-align:right;color:#888;">' + fmtTok(v.outTok) + '</td><td style="padding:3px 4px;text-align:right;">' + usdCell + '</td></tr>';
                }
                html += '</tbody></table></div>';
                return html;
              };
  
              if (!events.length) {
                if (cumulOverride) {
                  detailsCon.innerHTML = '<div style="font-size:12px;color:#888;padding:8px;">최근 이벤트 기록 없음. 헤더 합계는 전체 기간 누적치(보존).</div>';
                } else {
                  detailsCon.innerHTML = '<div style="font-size:12px;color:#888;padding:8px;">기록 없음.</div>';
                }
              } else {
                let html = '';
                if (truncated) {
                  html += '<div style="font-size:11px;color:#888;padding:4px 0 8px;">아래 상세는 최근 이벤트 ' + events.length + '건 (전체 ' + totalCalls + '건 중 FIFO 5000 초과분은 헤더 누적치에만 반영).</div>';
                }
                html += renderTable('모델별', byModel, '모델', null);
                html += renderTable('기능별', byFeature, '기능', featureLabels);
                html += renderTable('팩별', byPack, '팩', null);
                html += '<div style="margin-top:8px;font-size:10px;color:#666;">~ char/4 추정 · 미등록 모델은 호출수만 표기, USD 제외</div>';
                detailsCon.innerHTML = html;
              }
            };
  
            refresh();
          }});
        };
  
        renderCostBox(panel);
        makeLogBox('주입 기록', '#4a9', iLog, (clear, i, nd) => {
          if(clear) { clearInjLog(chatKey); return; }
          const r = document.createElement('div');
          r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;';
          let h = `<span style="color:#ccc;font-size:12px;">${i.turn}턴 (${i.time})</span>`;
          if(i.totalChars && i.maxChars) {
            const pct = Math.round(i.totalChars / i.maxChars * 100);
            const color = pct > 80 ? '#d66' : pct > 60 ? '#da8' : '#4a9';
            h += `<br><span style="font-size:11px;color:${color};font-weight:bold;">총 ${i.totalChars}/${i.maxChars}자 (${pct}%)</span>`;
            h += ` <span style="font-size:10px;color:#888;">유저 ${i.userInputChars||0} + 주입 ${i.injectedChars||0}</span>`;
          }
          if(i.sections) {
            const s = i.sections; const parts = [];
            if(s.scene) parts.push(`씬 ${s.scene}`);
            if(s.firstEnc) parts.push(`첫만남 ${s.firstEnc}`);
            if(s.reunion) parts.push(`재회 ${s.reunion}`);
            if(s.honor) parts.push(`호칭 ${s.honor}`);
            if(s.temporalRecall) parts.push(`시간축 ${s.temporalRecall}`);
            if(s.lore) parts.push(`로어 ${s.lore}`);
            if(parts.length) h += `<br><span style="font-size:10px;color:#69b;">내역: ${parts.join(' / ')}</span>`;
          }
          if(i.temporalInjection && (i.temporalInjection.source || i.temporalInjection.chars || (i.temporalInjection.eventIds||[]).length)) {
            const ti = i.temporalInjection;
            if (ti.source && ti.source !== 'none') {
              const src = ti.source === 'judge' ? '판단AI' : (ti.source === 'deterministic' ? '규칙기반' : escHtml(ti.source));
              const ids = shortList(ti.eventIds, 4);
              h += `<br><span style="font-size:10px;color:#9ad;">시간축: ${src} / ${escHtml(ti.mode||'')} / ${escHtml(ti.level||'')} / ${ti.chars||0}자${ids?' / ID '+ids:''}</span>`;
            }
            const actions = Array.isArray(ti.compressionActions) ? ti.compressionActions : [];
            const drops = Array.isArray(ti.droppedEventIds) ? ti.droppedEventIds : [];
            if(actions.length || drops.length) {
              const aTxt = actions.slice(0, 3).map(a => `${escHtml(a.action||'')} ${escHtml(a.from||'')}→${escHtml(a.to||'')}`).join(', ');
              const dTxt = shortList(drops, 3);
              h += `<br><span style="font-size:10px;color:#da8;">압축: ${aTxt || '없음'}${dTxt?' / 드롭 '+dTxt:''}</span>`;
            }
          }
          if(i.temporalJudge && (i.temporalJudge.reason || i.temporalJudge.mode || i.temporalJudge.error)) {
            const tj = i.temporalJudge;
            const state = tj.error ? ('오류 ' + escHtml(tj.error)) : `${tj.recall ? '회상' : '미회상'} ${escHtml(tj.mode||'')}`;
            h += `<br><span style="font-size:10px;color:#b8a;">판단: ${state}${tj.reason?' — '+escHtml(tj.reason):''}</span>`;
            const _tjQ = tj.query || {};
            const _tjQParts = [];
            if (Array.isArray(_tjQ.participants) && _tjQ.participants.length) _tjQParts.push('인물 ' + shortList(_tjQ.participants, 3));
            if (Array.isArray(_tjQ.actions) && _tjQ.actions.length) _tjQParts.push('행동 ' + shortList(_tjQ.actions, 3));
            if (Array.isArray(_tjQ.locations) && _tjQ.locations.length) _tjQParts.push('장소 ' + shortList(_tjQ.locations, 2));
            if (_tjQParts.length) h += `<br><span style="font-size:10px;color:#a89;">쿼리: ${_tjQParts.join(' / ')}</span>`;
          }
          {
            const optParts = [];
            if(i.bundled) optParts.push(`<span style="color:#9a6;">번들 ${i.bundled}</span>`);
            if(i.deltaSkipped) optParts.push(`<span style="color:#da8;">스킵 ${i.deltaSkipped}</span>`);
            if(optParts.length) h += `<br><span style="font-size:10px;color:#888;">최적화: ${optParts.join(' / ')}</span>`;
          }
          if(i.budget) h += `<br><span style="font-size:10px;color:#888;">로어예산 ${i.used||0}/${i.budget}${i.level?' ('+i.level+')':''}</span>`;
          h += `<br><span style="font-size:11px;color:#888;">${i.count>0?i.count+'개: '+i.matched.join(', '):i.note||'매치없음'}</span>`;
          r.innerHTML = h; nd.appendChild(r);
        });
        makeLogBox('추출 기록', '#da8', eLog, (clear, i, nd) => { if(clear) clearExtLog(chatKey); else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:${i.status==='실패'?'#d66':i.status==='성공'?'#4a9':'#ccc'}">[${i.time}] ${i.isManual?'수동':'자동'} - ${i.status} (${i.count||0}개)</span>${i.api?`<br><span style="font-size:10px;color:#69b;">API: ${i.api.status}${i.api.error?' | '+i.api.error:''}</span>`:''}${renderCostLine(i)}`; nd.appendChild(r); } });
        makeLogBox('교정 기록', '#ea5', rLog, (clear, i, nd) => { if(clear){ settings.config.urlRefinerLogs[chatKey]=[]; settings.save(); } else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:${i.isPass?'#4a9':i.isError?'#d66':'#ea5'};">[${i.time}] ${i.isPass?'통과':i.isError?'에러':'교정됨'}</span>${i.reason?`<br><span style="font-size:11px;color:#da7;">${i.reason}</span>`:''}${renderCostLine(i)}`; nd.appendChild(r); } });
        makeLogBox('모순 기록', '#d96', cLog, (clear, i, nd) => { if(clear) _ls.removeItem('lore-contradictions'); else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:#d96;font-weight:bold;">${i.name}</span><br><span style="color:#a55;">"${i.oldStatus}" → "${i.newStatus}"</span><br><span style="font-size:10px;color:#888;">${new Date(i.time).toLocaleString()} (~${i.turn}턴)</span>`; nd.appendChild(r); } });
      };
      m.replaceContentPanel(renderLogs, '로그 조회');
    });
  });
  
  _w.__LoreInj.__subLogLoaded = true;
})();
