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
            if(s.lore) parts.push(`로어 ${s.lore}`);
            if(parts.length) h += `<br><span style="font-size:10px;color:#69b;">내역: ${parts.join(' / ')}</span>`;
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
        makeLogBox('추출 기록', '#da8', eLog, (clear, i, nd) => { if(clear) clearExtLog(chatKey); else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:${i.status==='실패'?'#d66':i.status==='성공'?'#4a9':'#ccc'}">[${i.time}] ${i.isManual?'수동':'자동'} - ${i.status} (${i.count||0}개)</span>${i.api?`<br><span style="font-size:10px;color:#69b;">API: ${i.api.status}${i.api.error?' | '+i.api.error:''}</span>`:''}`; nd.appendChild(r); } });
        makeLogBox('교정 기록', '#ea5', rLog, (clear, i, nd) => { if(clear){ settings.config.urlRefinerLogs[chatKey]=[]; settings.save(); } else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:${i.isPass?'#4a9':i.isError?'#d66':'#ea5'};">[${i.time}] ${i.isPass?'✅ 통과':i.isError?'❌ 에러':'✏️ 교정됨'}</span>${i.reason?`<br><span style="font-size:11px;color:#da7;">💡 ${i.reason}</span>`:''}`; nd.appendChild(r); } });
        makeLogBox('모순 기록', '#d96', cLog, (clear, i, nd) => { if(clear) _ls.removeItem('lore-contradictions'); else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:#d96;font-weight:bold;">${i.name}</span><br><span style="color:#a55;">"${i.oldStatus}" → "${i.newStatus}"</span><br><span style="font-size:10px;color:#888;">${new Date(i.time).toLocaleString()} (~${i.turn}턴)</span>`; nd.appendChild(r); } });
      };
      m.replaceContentPanel(renderLogs, '로그 조회');
    });
  });
  
  _w.__LoreInj.__subLogLoaded = true;
})();
