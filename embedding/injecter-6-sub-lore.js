// injecter / sub-lore — 로어 관리 (목록)
// 역할: 팩별 엔트리 목록, 수정/삭제/앵커/이력
// 의존: injecter-3 (settings, db, C, isEntryEnabledForUrl, setEntryEnabled)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-lore] settings 미로드'); return; }
  if (_w.__LoreInj.__subLoreLoaded) return;

  const { C, db, settings, isEntryEnabledForUrl, setEntryEnabled } = _w.__LoreInj;

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  _w.__LoreInj.registerSubMenu('lore', function(modal) {
    modal.createSubMenu('로어 관리 (목록)', (m) => {
      const renderPanel = async (panel) => {
        const _url = C.getCurUrl(); const activePacks = settings.config.urlPacks?.[_url] || [];
        if (!activePacks.length) { panel.addText('활성화된 팩이 없습니다. 파일 탭에서 활성화하세요.'); return; }
        const entries = await db.entries.toArray();
        const filtered = entries.filter(e => activePacks.includes(e.packName));
        if (!filtered.length) { panel.addText('활성 항목 없음.'); return; }
        const byPack = {}; filtered.forEach(e => { (byPack[e.packName] = byPack[e.packName] || []).push(e); });

        for (const [pk, items] of Object.entries(byPack)) {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd); nd.style.cssText += 'background:#1a1a1a;border:1px solid #333;border-radius:4px;margin-bottom:12px;';
            const headerRow = document.createElement('div'); headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #333;padding-bottom:6px;cursor:pointer;';

            const curUrl = C.getCurUrl();
            const disabledEntries = settings.config.urlDisabledEntries?.[curUrl] || [];
            const allItemsEnabled = items.every(e => !disabledEntries.includes(e.id));

            const pkSw = document.createElement('div'); pkSw.style.cssText = 'width:28px;height:14px;border-radius:7px;background:' + (allItemsEnabled ? '#285' : '#444') + ';position:relative;cursor:pointer;flex-shrink:0;margin-right:8px;';
            const pkDot = document.createElement('div'); pkDot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#fff;position:absolute;top:2px;left:' + (allItemsEnabled ? '16px' : '2px') + ';transition:left .2s;';
            pkSw.appendChild(pkDot);

            pkSw.onclick = async (ev) => {
                ev.stopPropagation();
                const newState = !allItemsEnabled;
                const ud = JSON.parse(JSON.stringify(settings.config.urlDisabledEntries || {}));
                ud[curUrl] = ud[curUrl] || [];
                const itemIds = items.map(e => e.id);
                if (newState) { ud[curUrl] = ud[curUrl].filter(id => !itemIds.includes(id)); }
                else { for (const id of itemIds) { if (!ud[curUrl].includes(id)) ud[curUrl].push(id); } }
                settings.config.urlDisabledEntries = ud; settings.save();
                m.replaceContentPanel(renderPanel, '로어 관리');
            };

            const title = document.createElement('div'); title.style.cssText = 'font-size:14px;font-weight:bold;color:#ccc;flex:1;'; title.textContent = pk + ' (' + items.length + '개)';
            const arrow = document.createElement('span'); arrow.textContent = '▼'; arrow.style.cssText = 'font-size:12px;color:#888;';
            headerRow.appendChild(pkSw); headerRow.appendChild(title); headerRow.appendChild(arrow); nd.appendChild(headerRow);

            items.sort((a,b) => (a.type||'').localeCompare(b.type||''));
            const listContainer = document.createElement('div'); listContainer.style.cssText = 'display:none;flex-direction:column;gap:0;';
            let isExpanded = false;
            headerRow.onclick = () => { isExpanded = !isExpanded; listContainer.style.display = isExpanded ? 'flex' : 'none'; arrow.textContent = isExpanded ? '▲' : '▼'; };

            for (const e of items) {
              const row = document.createElement('div'); row.style.cssText = 'padding:8px 0;border-bottom:1px solid #222;display:flex;flex-direction:column;';
              const header = document.createElement('div'); header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
              const left = document.createElement('div'); left.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';
              const isEnabled = isEntryEnabledForUrl(e);
              const swWrap = document.createElement('div'); swWrap.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;background:#111;padding:2px 8px;border-radius:12px;border:1px solid #333;flex-shrink:0;';
              const swLabel = document.createElement('span'); swLabel.textContent = isEnabled ? 'ON' : 'OFF'; swLabel.style.cssText = 'font-size:10px;font-weight:bold;width:20px;text-align:center;color:' + (isEnabled ? '#4a7' : '#777') + ';';
              const sw = document.createElement('div'); sw.style.cssText = 'width:24px;height:12px;border-radius:6px;background:' + (isEnabled ? '#285' : '#444') + ';position:relative;';
              const dot = document.createElement('div'); dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;top:2px;left:' + (isEnabled ? '14px' : '2px') + ';transition:left .2s;';
              sw.appendChild(dot); swWrap.appendChild(swLabel); swWrap.appendChild(sw);
              swWrap.onclick = (ev) => { ev.stopPropagation(); const ns = !isEntryEnabledForUrl(e); setEntryEnabled(e, ns); swLabel.textContent = ns ? 'ON' : 'OFF'; swLabel.style.color = ns ? '#4a7' : '#777'; sw.style.background = ns ? '#285' : '#444'; dot.style.left = ns ? '14px' : '2px'; };
              const nameSpan = document.createElement('span'); nameSpan.textContent = '[' + e.type + '] ' + e.name; nameSpan.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;cursor:pointer;flex:1;';

              const embStatusSpan = document.createElement('span'); embStatusSpan.style.cssText = 'margin-left:6px;font-size:10px;padding:1px 4px;border-radius:3px;';
              const updateEmbStatus = async () => { try { const emb = await db.embeddings.where({entryId: e.id, field: 'summary'}).first() || await db.embeddings.where('entryId').equals(e.id).first(); if (emb) { const ch = C.embeddingSourceHash ? C.embeddingSourceHash(e, emb.field || 'summary') : (emb.hash || ''); const targetModel = settings.config.embeddingModel || 'gemini-embedding-001'; if((emb.sourceHash||emb.hash)===ch && (!emb.packName || emb.packName===e.packName)){ const needsRegen=(emb.model && emb.model !== targetModel) || (emb.schemaVersion && emb.schemaVersion < 2) || (emb.taskType!=='RETRIEVAL_DOCUMENT'&&targetModel.includes('embedding-001')); if(needsRegen){embStatusSpan.textContent='재생성';embStatusSpan.style.background='#3a3a1a';embStatusSpan.style.color='#d96';}else{embStatusSpan.textContent='임베딩';embStatusSpan.style.background='#1a3a2a';embStatusSpan.style.color='#4a9';} }else{embStatusSpan.textContent='변경됨';embStatusSpan.style.background='#3a3a1a';embStatusSpan.style.color='#d96';} }else{embStatusSpan.textContent='미임베딩';embStatusSpan.style.background='#2a2a2a';embStatusSpan.style.color='#888';} }catch(ex){} };
              updateEmbStatus();
              nameSpan.appendChild(embStatusSpan); left.appendChild(swWrap); left.appendChild(nameSpan);

              const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;';
              const B = 'font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
              const embGenBtn = document.createElement('button'); embGenBtn.textContent = '임베딩'; embGenBtn.style.cssText = B + 'color:#4a9;border-color:#264;';
              embGenBtn.onclick = async (ev) => { ev.stopPropagation(); embGenBtn.disabled = true; embGenBtn.textContent = '...'; try { await C.ensureEmbedding(e, { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }); embGenBtn.textContent = 'OK'; updateEmbStatus(); } catch (err) { embGenBtn.textContent = 'X'; alert('실패:' + err.message); } setTimeout(() => { embGenBtn.textContent = '임베딩'; embGenBtn.disabled = false; }, 1500); };
              const copyBtn = document.createElement('button'); copyBtn.textContent = '복사'; copyBtn.style.cssText = B + 'color:#4a9;border-color:#264;'; copyBtn.onclick = (ev) => { ev.stopPropagation(); const clean = {...e}; delete clean.id; delete clean.packName; delete clean.project; delete clean.enabled; navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(() => alert('복사됨.')).catch(() => alert('실패')); };
              const editBtn = document.createElement('button'); editBtn.textContent = '수정'; editBtn.style.cssText = B + 'color:#88c;border-color:#446;';
              const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.cssText = B + 'color:#a55;border-color:#633;';
              const histBtn = document.createElement('button'); histBtn.textContent = '이력'; histBtn.style.cssText = B + 'color:#da8;border-color:#642;';
              const anchorBtn = document.createElement('button');
              const _renderAnchor = () => { const on = !!e.anchor; anchorBtn.textContent = on ? '앵커' : '앵커'; anchorBtn.title = on ? '앵커 해제 — 자동 추출 병합 시 보호 해제됨' : '앵커 지정 — summary/state/detail/call/inject 자동 덮어쓰기 차단, 재주입 우선도 최대'; anchorBtn.style.cssText = B + (on ? 'color:#fc4;border-color:#963;background:#2a1a00;' : 'color:#777;border-color:#444;'); };
              _renderAnchor();
              anchorBtn.onclick = async (ev) => { ev.stopPropagation(); e.anchor = !e.anchor; try { await db.entries.put(e); _renderAnchor(); } catch(err) { alert('앵커 토글 실패: ' + err.message); e.anchor = !e.anchor; _renderAnchor(); } };
              right.appendChild(embGenBtn); right.appendChild(copyBtn); right.appendChild(histBtn); right.appendChild(anchorBtn); right.appendChild(editBtn); right.appendChild(delBtn);
              header.appendChild(left); header.appendChild(right); row.appendChild(header);

              // 버전 이력 패널
              const historyContainer = document.createElement('div');
              historyContainer.style.cssText = 'display:none;margin-top:8px;padding:8px;background:#0a0a0a;border:1px solid #222;border-radius:4px;';
              histBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (historyContainer.style.display !== 'none') { historyContainer.style.display = 'none'; return; }
                historyContainer.innerHTML = '<div style="font-size:11px;color:#888;">불러오는 중...</div>';
                historyContainer.style.display = 'block';
                try {
                  if (!C.getEntryVersions) { historyContainer.innerHTML = '<div style="font-size:11px;color:#d66;">버전 이력 기능 미로드.</div>'; return; }
                  const versions = await C.getEntryVersions(e.id);
                  if (!versions || !versions.length) { historyContainer.innerHTML = '<div style="font-size:11px;color:#888;">저장된 버전 없음.</div>'; return; }
                  historyContainer.innerHTML = '';
                  const hdr = document.createElement('div'); hdr.textContent = versions.length + '개 버전 (최신순)'; hdr.style.cssText = 'font-size:11px;color:#da8;margin-bottom:6px;font-weight:bold;'; historyContainer.appendChild(hdr);
                  for (const v of versions) {
                    const vrow = document.createElement('div'); vrow.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;padding:4px 0;border-bottom:1px dashed #222;gap:8px;';
                    const info = document.createElement('div'); info.style.cssText = 'font-size:11px;color:#aaa;flex:1;min-width:0;';
                    const sumPrev = (v.snapshot && v.snapshot.summary) ? String(v.snapshot.summary).slice(0, 80) : '';
                    const stPrev = (v.snapshot && (v.snapshot.state || v.snapshot.detail?.current_status)) ? ' / state: ' + (v.snapshot.state || v.snapshot.detail?.current_status) : '';
                    info.innerHTML = '<span style="color:#ccc;">' + new Date(v.ts).toLocaleString() + '</span> <span style="color:#69b;">[' + (v.reason||'auto') + ']</span><br><span style="font-size:10px;color:#888;word-break:break-all;">' + (sumPrev || '(요약 없음)') + stPrev + '</span>';
                    const vbtns = document.createElement('div'); vbtns.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';
                    const resBtn = document.createElement('button'); resBtn.textContent = '복원'; resBtn.style.cssText = 'padding:3px 8px;font-size:10px;border-radius:3px;background:#258;color:#fff;border:none;cursor:pointer;';
                    resBtn.onclick = async (ev2) => {
                      ev2.stopPropagation();
                      if (!confirm('이 버전으로 복원? 현재 상태는 자동 백업됨.')) return;
                      try { const restored = await C.restoreEntryVersion(v.id); Object.assign(e, restored); nameSpan.textContent = '[' + e.type + '] ' + e.name; nameSpan.appendChild(embStatusSpan); alert('복원됨.'); historyContainer.style.display = 'none'; }
                      catch(err) { alert('실패: ' + err.message); }
                    };
                    vbtns.appendChild(resBtn); vrow.appendChild(info); vrow.appendChild(vbtns); historyContainer.appendChild(vrow);
                  }
                } catch(err) { historyContainer.innerHTML = '<div style="font-size:11px;color:#d66;">오류: ' + err.message + '</div>'; }
              };
              row.appendChild(historyContainer);

              const editContainer = document.createElement('div'); editContainer.style.cssText = 'display:none;margin-top:8px;flex-direction:column;gap:8px;';
              const ta = document.createElement('textarea'); ta.style.cssText = 'width:100%;height:200px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;';
              const editableObj = {...e}; delete editableObj.id; delete editableObj.packName; delete editableObj.project; delete editableObj.enabled; ta.value = JSON.stringify(editableObj, null, 2);
              const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;';
              const saveBtn = document.createElement('button'); saveBtn.textContent = '저장'; saveBtn.style.cssText = B + 'background:#285;border-color:#285;color:#fff;';
              const cancelBtn = document.createElement('button'); cancelBtn.textContent = '닫기'; cancelBtn.style.cssText = B;
              btnRow.appendChild(cancelBtn); btnRow.appendChild(saveBtn); editContainer.appendChild(ta); editContainer.appendChild(btnRow); row.appendChild(editContainer);

              const toggleEdit = () => { editContainer.style.display = editContainer.style.display === 'none' ? 'flex' : 'none'; };
              nameSpan.onclick = toggleEdit; editBtn.onclick = toggleEdit; cancelBtn.onclick = toggleEdit;
              saveBtn.onclick = async () => { try { const parsed = JSON.parse(ta.value); const updated = {...e, ...parsed}; await db.entries.put(updated); try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(updated.id); } catch(_){} alert('수정됨. 임베딩은 변경됨으로 표시되며 필요 시 재생성하세요.'); Object.assign(e, updated); nameSpan.textContent = '[' + updated.type + '] ' + updated.name; nameSpan.appendChild(embStatusSpan); updateEmbStatus(); toggleEdit(); } catch (err) { alert('JSON 오류: ' + err.message); } };
              delBtn.onclick = async () => { if (confirm('[' + e.name + '] 삭제?')) { await db.entries.delete(e.id); try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(ex){} const count = await db.entries.where('packName').equals(e.packName).count(); await db.packs.update(e.packName, { entryCount: count }); row.remove(); title.textContent = pk + ' (' + count + '개)'; } };
              listContainer.appendChild(row);
            }
            nd.appendChild(listContainer);
          }});
        }
      };
      m.replaceContentPanel(renderPanel, '로어 목록 관리');
    });
  });

  _w.__LoreInj.__subLoreLoaded = true;
})();
