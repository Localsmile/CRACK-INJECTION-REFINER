// injecter-6-sub-log.js: 실행 로그
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = (_w.__LoreEnv && _w.__LoreEnv.kv) || _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subLogLoaded) return;
  
  const { C, settings, getChatKey, getInjLog, getExtLog, clearInjLog, clearExtLog } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  const COLOR = {
    muted: 'var(--li-muted,#748196)',
    soft: 'var(--li-text-soft,#a9b6c7)',
    text: 'var(--li-text,#e7edf5)',
    accent: 'var(--li-accent,#5aa7ff)',
    ok: '#78d5a8',
    warn: '#e7b56f',
    danger: '#ef6b6b',
    line: 'var(--li-line,#2f3b4f)'
  };
  const BTN_GHOST = 'min-height:28px;padding:4px 9px;font-size:11px;border-radius:7px;cursor:pointer;font-weight:800;border:1px solid var(--li-line,#2f3b4f);background:transparent;color:var(--li-text-soft,#a9b6c7);';
  const BTN_DANGER = 'min-height:28px;padding:4px 9px;font-size:11px;border-radius:7px;cursor:pointer;font-weight:800;border:1px solid #8f333f;background:#3a171b;color:#ffc9c9;';
  const LOG_ROW = 'margin-bottom:7px;border-bottom:1px dashed rgba(148,163,184,.16);padding:0 0 7px;font-size:12px;line-height:1.5;';
  const TONE = {
    inject: COLOR.accent,
    extract: COLOR.warn,
    refine: '#f0b86a',
    contradiction: '#d99a6c'
  };
  
  _w.__LoreInj.registerSubMenu('log', function(modal) {
    modal.createSubMenu('실행 로그', (m) => {
      const renderLogs = (panel) => {
        const chatKey = getChatKey();
        const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const shortList = (arr, limit = 3) => (Array.isArray(arr) ? arr : []).map(escHtml).filter(Boolean).slice(0, limit).join(', ');
        const fmtCostUsd = (n) => '$' + (Math.abs(Number(n)) < 0.01 ? Number(n).toFixed(5) : Number(n).toFixed(4));
        const idFromUrl = (url) => {
          const s = String(url || '');
          const m = s.match(/\/(?:episodes|chats|c)\/([a-f0-9]+)/i);
          return m ? m[1] : '';
        };
        const chatLabelMap = (() => {
          const out = {};
          const urlMap = settings.config.urlAutoExtPacks || {};
          for (const [url, packName] of Object.entries(urlMap)) {
            const id = idFromUrl(url);
            if (!id || !packName) continue;
            out['chat:' + id] = packName;
            out[id] = packName;
          }
          return out;
        })();
        const displayChatLabel = (key) => chatLabelMap[key] || (String(key || '').startsWith('chat:') ? String(key).slice(5, 13) : String(key || 'global'));
        const renderCostLine = (i) => {
          const parts = [];
          if (i.model) parts.push(escHtml(i.model));
          if (i.elapsedMs) parts.push((i.elapsedMs / 1000).toFixed(2) + 's');
          if (i.cost) {
            const c = i.cost;
            if (c.isBatchAggregate) {
              if (c.usd != null) parts.push(fmtCostUsd(c.usd) + (c.hasUnknown ? ' <span style="color:' + COLOR.muted + ';">(일부 제외)</span>' : '') + (c.estimated ? ' <span style="color:' + COLOR.soft + ';" title="char/4 추정">~</span>' : ''));
              else if (c.hasUnknown) parts.push('<span style="color:' + COLOR.soft + ';">-</span>');
            } else {
              if (c.usd != null) parts.push(fmtCostUsd(c.usd) + (c.estimated ? ' <span style="color:' + COLOR.soft + ';" title="char/4 추정">~</span>' : ''));
              else parts.push('<span style="color:' + COLOR.soft + ';">-</span>');
            }
          }
          return parts.length ? '<br><span style="font-size:10px;color:' + COLOR.soft + ';">' + parts.join(' · ') + '</span>' : '';
        };
        const iLog = getInjLog(chatKey); const eLog = getExtLog(chatKey); const cLog = JSON.parse(_ls.getItem('lore-contradictions') || '[]'); const rLog = settings.config.urlRefinerLogs?.[chatKey] || [];
  
        const makeLogBox = (title, color, items, renderer) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            const hRow = document.createElement('div'); hRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--li-line,#2f3b4f);margin-bottom:8px;cursor:pointer;gap:10px;';
            const leftWrap = document.createElement('div'); leftWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';
            const arrow = document.createElement('span'); arrow.textContent = '열기'; arrow.style.cssText = 'font-size:10px;color:' + COLOR.muted + ';min-width:24px;';
            const t = document.createElement('div'); t.textContent = `${title} (${items.length})`; t.style.cssText = `font-size:14px;color:${color};font-weight:800;`;
            leftWrap.appendChild(arrow); leftWrap.appendChild(t);
            hRow.appendChild(leftWrap);
            if (items.length > 0) {
              const btn = document.createElement('button');
              btn.textContent = '초기화';
              btn.style.cssText = BTN_DANGER;
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
              listCon.appendChild(Object.assign(document.createElement('div'), { textContent: '기록 없음.', style: 'font-size:12px;color:' + COLOR.soft + ';padding:8px 2px;' }));
            } else {
              items.slice(0, 20).forEach(i => renderer(false, i, listCon));
            }
            nd.appendChild(listCon);
            hRow.onclick = () => {
              const isOpen = listCon.style.display !== 'none';
              listCon.style.display = isOpen ? 'none' : 'block';
              arrow.textContent = isOpen ? '열기' : '접기';
            };
          }});
        };
  
        const renderCostBox = (panel) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            let period = 'all';
            let detailsOpen = false;
  
            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--li-line,#2f3b4f);margin-bottom:8px;flex-wrap:wrap;gap:8px;';
  
            const leftWrap = document.createElement('div');
            leftWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;min-width:0;flex-wrap:wrap;';
            const arrow = document.createElement('span');
            arrow.textContent = '열기'; arrow.style.cssText = 'font-size:10px;color:' + COLOR.muted + ';min-width:24px;';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = 'API 비용'; titleSpan.style.cssText = 'font-size:14px;color:' + COLOR.text + ';font-weight:800;';
            const totalSpan = document.createElement('span');
            totalSpan.style.cssText = 'font-size:14px;color:' + COLOR.accent + ';font-weight:800;';
            const subSpan = document.createElement('span');
            subSpan.style.cssText = 'font-size:11px;color:' + COLOR.soft + ';';
            leftWrap.append(arrow, titleSpan, totalSpan, subSpan);
  
            const rightWrap = document.createElement('div');
            rightWrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';
  
            const periods = [{k:'24h',l:'24h'},{k:'7d',l:'7d'},{k:'30d',l:'30d'},{k:'all',l:'전체'}];
            const periodBtns = {};
            periods.forEach(p => {
              const b = document.createElement('button');
              b.textContent = p.l;
              b.style.cssText = BTN_GHOST;
              b.onclick = (ev) => { ev.stopPropagation(); period = p.k; refresh(); };
              periodBtns[p.k] = b;
              rightWrap.appendChild(b);
            });
  
            const clearBtn = document.createElement('button');
            clearBtn.textContent = '초기화';
            clearBtn.style.cssText = BTN_DANGER + 'margin-left:4px;';
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
              arrow.textContent = detailsOpen ? '접기' : '열기';
            };
  
            const fmtUsd = (n) => '$' + (Math.abs(n) < 0.01 ? n.toFixed(5) : n.toFixed(4));
            const fmtTok = (n) => n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n);
  
            const refresh = () => {
              Object.entries(periodBtns).forEach(([k, b]) => {
                if (k === period) { b.style.background = 'var(--li-accent-bg,#143456)'; b.style.color = 'var(--li-text,#e7edf5)'; b.style.borderColor = 'rgba(90,167,255,.65)'; }
                else { b.style.background = 'transparent'; b.style.color = COLOR.soft; b.style.borderColor = COLOR.line; }
              });
  
              const all = (C.getCostEvents && C.getCostEvents()) || [];
              const now = Date.now();
              const ms = { '24h': 86400000, '7d': 7*86400000, '30d': 30*86400000 }[period];
              const events = ms ? all.filter(e => (now - (e.ts||0)) <= ms) : all;
  
              let totalUsd = 0, totalCalls = events.length, unknownCalls = 0, estCalls = 0;
              const byModel = {}, byFeature = {}, byChat = {};
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
                bump(byChat, e.chatKey || 'global', e);
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
  
              const featureLabels = { autoExtract:'자동추출', batchExtract:'배치추출', temporalExtract:'시간축추출', urlImport:'URL 가져오기', textImport:'텍스트 변환', refine:'교정', rerank:'리랭킹', judge:'판단 AI', embed:'임베딩', apiTest:'API 테스트' };
              const renderTable = (title, bucket, keyLabel, labelMap) => {
                const rows = Object.entries(bucket).sort((a, b) => (b[1].usd - a[1].usd) || (b[1].calls - a[1].calls));
                if (!rows.length) return '';
                let html = '<div style="margin-top:12px;"><div style="font-size:12px;color:' + COLOR.text + ';font-weight:800;margin-bottom:6px;">' + title + '</div>';
                html += '<table style="width:100%;border-collapse:collapse;font-size:11px;color:' + COLOR.soft + ';"><thead><tr style="border-bottom:1px solid ' + COLOR.line + ';color:' + COLOR.muted + ';text-align:left;"><th style="padding:5px 4px;">' + keyLabel + '</th><th style="padding:5px 4px;text-align:right;">호출</th><th style="padding:5px 4px;text-align:right;">입력</th><th style="padding:5px 4px;text-align:right;">출력</th><th style="padding:5px 4px;text-align:right;">USD</th></tr></thead><tbody>';
                for (const [k, v] of rows) {
                  const usdCell = v.unknown === v.calls
                    ? '<span style="color:' + COLOR.soft + ';">-</span>'
                    : (fmtUsd(v.usd) + (v.unknown ? ' <span style="color:' + COLOR.soft + ';font-size:10px;">(+' + v.unknown + ' 제외)</span>' : '') + (v.est ? ' <span style="color:' + COLOR.soft + ';font-size:10px;" title="char/4 추정">~</span>' : ''));
                  const labelText = labelMap && labelMap[k] ? escHtml(labelMap[k]) : escHtml(k);
                  html += '<tr style="border-bottom:1px dashed rgba(148,163,184,.16);"><td style="padding:5px 4px;word-break:break-all;">' + labelText + '</td><td style="padding:5px 4px;text-align:right;">' + v.calls + '</td><td style="padding:5px 4px;text-align:right;color:' + COLOR.muted + ';">' + fmtTok(v.inTok) + '</td><td style="padding:5px 4px;text-align:right;color:' + COLOR.muted + ';">' + fmtTok(v.outTok) + '</td><td style="padding:5px 4px;text-align:right;">' + usdCell + '</td></tr>';
                }
                html += '</tbody></table></div>';
                return html;
              };
  
              if (!events.length) {
                if (cumulOverride) {
                  detailsCon.innerHTML = '<div style="font-size:12px;color:' + COLOR.soft + ';padding:8px;">최근 이벤트 기록 없음. 헤더 합계는 전체 기간 누적치(보존).</div>';
                } else {
                  detailsCon.innerHTML = '<div style="font-size:12px;color:' + COLOR.soft + ';padding:8px;">기록 없음.</div>';
                }
              } else {
                let html = '';
                if (truncated) {
                  html += '<div style="font-size:11px;color:' + COLOR.soft + ';padding:4px 0 8px;">아래 상세는 최근 이벤트 ' + events.length + '건 (전체 ' + totalCalls + '건 중 FIFO 5000 초과분은 헤더 누적치에만 반영).</div>';
                }
                html += renderTable('모델별', byModel, '모델', null);
                html += renderTable('기능별', byFeature, '기능', featureLabels);
                const chatLabels = {};
                Object.keys(byChat).forEach(k => { chatLabels[k] = displayChatLabel(k); });
                html += renderTable('로어팩별', byChat, '로어팩', chatLabels);
                html += '<div style="margin-top:8px;font-size:10px;color:' + COLOR.muted + ';">~ usageMetadata 없어 char/4 추정. 가격 미등록 모델(직접입력 등)은 호출수만 표기하고 USD 합산 제외.</div>';
                detailsCon.innerHTML = html;
              }
            };
  
            refresh();
          }});
        };
  
        renderCostBox(panel);
        makeLogBox('주입 기록', TONE.inject, iLog, (clear, i, nd) => {
          if(clear) { clearInjLog(chatKey); return; }
          const r = document.createElement('div');
          r.style.cssText = LOG_ROW;
          let h = `<span style="color:${COLOR.text};font-size:12px;font-weight:800;">${i.turn}턴 (${i.time})</span>`;
          if(i.totalChars && i.maxChars) {
            const pct = Math.round(i.totalChars / i.maxChars * 100);
            const color = pct > 80 ? COLOR.danger : pct > 60 ? COLOR.warn : COLOR.ok;
            h += `<br><span style="font-size:11px;color:${color};font-weight:bold;">총 ${i.totalChars}/${i.maxChars}자 (${pct}%)</span>`;
            h += ` <span style="font-size:10px;color:${COLOR.soft};">유저 ${i.userInputChars||0} + 주입 ${i.injectedChars||0}</span>`;
          }
          if(i.sections) {
            const s = i.sections; const parts = [];
            if(s.scene) parts.push(`씬 ${s.scene}`);
            if(s.firstEnc) parts.push(`첫만남 ${s.firstEnc}`);
            if(s.reunion) parts.push(`재회 ${s.reunion}`);
            if(s.honor) parts.push(`호칭 ${s.honor}`);
            if(s.temporalRecall) parts.push(`시간축 ${s.temporalRecall}`);
            if(s.lore) parts.push(`로어 ${s.lore}`);
            if(parts.length) h += `<br><span style="font-size:10px;color:${COLOR.accent};">내역: ${parts.join(' / ')}</span>`;
          }
          if(i.temporalInjection && (i.temporalInjection.source || i.temporalInjection.chars || (i.temporalInjection.eventIds||[]).length)) {
            const ti = i.temporalInjection;
            if (ti.source && ti.source !== 'none') {
              const src = ti.source === 'judge' ? '판단AI' : (ti.source === 'deterministic' ? '규칙기반' : escHtml(ti.source));
              const ids = shortList(ti.eventIds, 4);
              h += `<br><span style="font-size:10px;color:${COLOR.accent};">시간축: ${src} / ${escHtml(ti.mode||'')} / ${escHtml(ti.level||'')} / ${ti.chars||0}자${ids?' / ID '+ids:''}</span>`;
            }
            const actions = Array.isArray(ti.compressionActions) ? ti.compressionActions : [];
            const drops = Array.isArray(ti.droppedEventIds) ? ti.droppedEventIds : [];
            if(actions.length || drops.length) {
              const aTxt = actions.slice(0, 3).map(a => `${escHtml(a.action||'')} ${escHtml(a.from||'')} -> ${escHtml(a.to||'')}`).join(', ');
              const dTxt = shortList(drops, 3);
              h += `<br><span style="font-size:10px;color:${COLOR.warn};">압축: ${aTxt || '없음'}${dTxt?' / 드롭 '+dTxt:''}</span>`;
            }
          }
          if(i.temporalJudge && (i.temporalJudge.reason || i.temporalJudge.mode || i.temporalJudge.error)) {
            const tj = i.temporalJudge;
            const state = tj.error ? ('오류 ' + escHtml(tj.error)) : `${tj.recall ? '회상' : '미회상'} ${escHtml(tj.mode||'')}`;
            h += `<br><span style="font-size:10px;color:#c9a7dc;">판단: ${state}${tj.reason?' - '+escHtml(tj.reason):''}</span>`;
            const _tjQ = tj.query || {};
            const _tjQParts = [];
            if (Array.isArray(_tjQ.participants) && _tjQ.participants.length) _tjQParts.push('인물 ' + shortList(_tjQ.participants, 3));
            if (Array.isArray(_tjQ.actions) && _tjQ.actions.length) _tjQParts.push('행동 ' + shortList(_tjQ.actions, 3));
            if (Array.isArray(_tjQ.locations) && _tjQ.locations.length) _tjQParts.push('장소 ' + shortList(_tjQ.locations, 2));
            if (_tjQParts.length) h += `<br><span style="font-size:10px;color:#c2a4b8;">쿼리: ${_tjQParts.join(' / ')}</span>`;
          }
          {
            const optParts = [];
            if(i.bundled) optParts.push(`<span style="color:${COLOR.ok};">번들 ${i.bundled}</span>`);
            if(i.deltaSkipped) optParts.push(`<span style="color:${COLOR.warn};">스킵 ${i.deltaSkipped}</span>`);
            if(optParts.length) h += `<br><span style="font-size:10px;color:${COLOR.soft};">최적화: ${optParts.join(' / ')}</span>`;
          }
          if(i.budget) h += `<br><span style="font-size:10px;color:${COLOR.soft};">로어예산 ${i.used||0}/${i.budget}${i.level?' ('+i.level+')':''}</span>`;
          h += `<br><span style="font-size:11px;color:${COLOR.soft};">${i.count>0?i.count+'개: '+i.matched.join(', '):i.note||'매치없음'}</span>`;
          r.innerHTML = h; nd.appendChild(r);
        });
        makeLogBox('추출 기록', TONE.extract, eLog, (clear, i, nd) => { if(clear) clearExtLog(chatKey); else { const r = document.createElement('div'); r.style.cssText = LOG_ROW; r.innerHTML = `<span style="color:${i.status==='실패'?COLOR.danger:i.status==='성공'?COLOR.ok:COLOR.text};font-weight:800;">[${i.time}] ${i.isManual?'수동':'자동'} - ${i.status} (${i.count||0}개)</span>${i.api?`<br><span style="font-size:10px;color:${COLOR.accent};">API: ${i.api.status}${i.api.error?' | '+i.api.error:''}</span>`:''}${renderCostLine(i)}`; nd.appendChild(r); } });
        makeLogBox('교정 기록', TONE.refine, rLog, (clear, i, nd) => { if(clear){ settings.config.urlRefinerLogs[chatKey]=[]; settings.save(); } else { const r = document.createElement('div'); r.style.cssText = LOG_ROW; r.innerHTML = `<span style="color:${i.isPass?COLOR.ok:i.isError?COLOR.danger:TONE.refine};font-weight:800;">[${i.time}] ${i.isPass?'통과':i.isError?'에러':'교정됨'}</span>${i.reason?`<br><span style="font-size:11px;color:${COLOR.warn};">${i.reason}</span>`:''}${renderCostLine(i)}`; nd.appendChild(r); } });
        makeLogBox('모순 기록', TONE.contradiction, cLog, (clear, i, nd) => { if(clear) _ls.removeItem('lore-contradictions'); else { const r = document.createElement('div'); r.style.cssText = LOG_ROW; r.innerHTML = `<span style="color:${TONE.contradiction};font-weight:800;">${i.name}</span><br><span style="color:${COLOR.danger};">"${i.oldStatus}" -> "${i.newStatus}"</span><br><span style="font-size:10px;color:${COLOR.soft};">${new Date(i.time).toLocaleString()} (~${i.turn}턴)</span>`; nd.appendChild(r); } });
      };
      m.replaceContentPanel(renderLogs, '로그 조회');
    });
  });
  
  _w.__LoreInj.__subLogLoaded = true;
})();
