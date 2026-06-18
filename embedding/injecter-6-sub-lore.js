// injecter / sub-lore - 로어 관리 (목록)
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
  const UI = C.UI || {};
  const FIELD_STYLE = UI.field || 'width:100%;min-height:34px;border-radius:8px;border:1px solid var(--li-line,#2f3b4f);background:#08111d;color:var(--li-text,#e7edf5);padding:8px 10px;box-sizing:border-box;';
  const BTN_BASE = 'min-height:30px;padding:5px 9px;font-size:11px;border-radius:7px;background:transparent;border:1px solid var(--li-line,#2f3b4f);color:var(--li-text-soft,#a9b6c7);cursor:pointer;font-weight:800;';
  const TONE = {
    muted: 'var(--li-muted,#748196)',
    accent: 'var(--li-accent,#5aa7ff)',
    ok: '#78d5a8',
    warn: '#e7b56f',
    danger: '#ef6b6b'
  };

  function toggleStyle(on, w, h, dot) {
    const dw = dot || Math.max(8, h - 4);
    const leftOn = Math.max(2, w - dw - 2);
    return {
      wrap: 'width:' + w + 'px;height:' + h + 'px;border-radius:' + Math.ceil(h / 2) + 'px;background:' + (on ? 'rgba(129,140,248,.24)' : 'rgba(113,113,122,.20)') + ';border:1px solid ' + (on ? 'rgba(129,140,248,.55)' : 'var(--li-line,#3f3f46)') + ';position:relative;cursor:pointer;flex-shrink:0;',
      dot: 'width:' + dw + 'px;height:' + dw + 'px;border-radius:50%;background:' + (on ? 'var(--li-accent-strong,#c7d2fe)' : 'var(--li-muted,#a1a1aa)') + ';position:absolute;top:2px;left:' + (on ? leftOn : 2) + 'px;transition:left .18s,background .18s;'
    };
  }

  function setBadge(el, label, color, bg) {
    el.textContent = label;
    el.style.background = bg;
    el.style.color = color;
  }

  function createLoreListRenderer(menuApi) {
      const renderPanel = async (panel) => {
        const _url = C.getCurUrl(); const activePacks = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(_url) : (settings.config.urlPacks?.[_url] || []);
        if (!activePacks.length) { panel.addText('활성화된 팩이 없습니다. 파일 탭에서 활성화하세요.'); return; }
        const entries = await db.entries.toArray();
        const filtered = entries.filter(e => activePacks.includes(e.packName));
        if (!filtered.length) { panel.addText('활성 항목 없음.'); return; }
        const byPack = {}; filtered.forEach(e => { (byPack[e.packName] = byPack[e.packName] || []).push(e); });
        const autoExpandPacks = filtered.length <= 12 && Object.keys(byPack).length <= 2;

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createSectionTitle('로어 목록', '현재 활성 로어를 관리함. 의미 검색을 쓰려면 임베딩 준비가 필요함.'));
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
          const info = document.createElement('div');
          info.textContent = '활성 로어팩 ' + activePacks.length + '개 / 로어 ' + filtered.length + '개';
          info.style.cssText = 'flex:1;min-width:180px;font-size:12px;color:var(--li-muted,#748196);line-height:1.5;';
          const embAll = document.createElement('button');
          embAll.textContent = '임베딩 일괄 생성';
          embAll.style.cssText = BTN_BASE + 'color:var(--li-accent-strong,#c7d2fe);border-color:rgba(129,140,248,.45);background:rgba(129,140,248,.12);';
          embAll.onclick = async () => {
            const miss = _w.__LoreInj.getApiMissingReason ? _w.__LoreInj.getApiMissingReason(settings.config, 'embed') : '';
            if (miss) { alert('임베딩 API 설정 필요: ' + miss); return; }
            embAll.disabled = true;
            const orig = embAll.textContent;
            try {
              const apiOpts = _w.__LoreInj.buildEmbeddingApiOpts
                ? _w.__LoreInj.buildEmbeddingApiOpts({ model: settings.config.embeddingModel || 'gemini-embedding-001' }, { feature: 'embed', chatKey: 'global' })
                : { apiType: settings.config.autoExtApiType === 'deepseek' ? 'key' : (settings.config.autoExtApiType || 'key'), key: settings.config.autoExtApiType === 'deepseek' ? settings.config.autoExtFirebaseEmbedKey : settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' };
              let ok = 0;
              for (let i = 0; i < filtered.length; i++) {
                embAll.textContent = '임베딩 ' + (i + 1) + '/' + filtered.length;
                await C.ensureEmbedding(filtered[i], apiOpts);
                ok++;
              }
              info.textContent = '임베딩 완료: ' + ok + '개';
              info.style.color = 'var(--li-accent-strong,#c7d2fe)';
              menuApi.replaceContentPanel(renderPanel, '로어 목록 관리');
            } catch (e) {
              info.textContent = '임베딩 실패: ' + String(e.message || e).slice(0, 100);
              info.style.color = 'var(--li-danger,#dc2626)';
            } finally {
              embAll.textContent = orig;
              embAll.disabled = false;
            }
          };
          row.appendChild(info);
          row.appendChild(embAll);
          nd.appendChild(row);
        }});

        for (const [pk, items] of Object.entries(byPack)) {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd); nd.style.cssText += 'background:var(--li-surface-2,#2b2b31);border:1px solid var(--li-line,#3f3f46);border-radius:8px;margin-bottom:12px;';
            const headerRow = document.createElement('div'); headerRow.className = 'lore-v2-pack-row'; headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid var(--li-line,#2f3b4f);padding-bottom:10px;cursor:pointer;gap:10px;';

            const curUrl = _w.__LoreInj.getUrlStateKey ? _w.__LoreInj.getUrlStateKey(C.getCurUrl()) : C.getCurUrl();
            const disabledEntries = _w.__LoreInj.getDisabledEntriesForUrl ? _w.__LoreInj.getDisabledEntriesForUrl(C.getCurUrl()) : (settings.config.urlDisabledEntries?.[curUrl] || []);
            const allItemsEnabled = items.every(e => !disabledEntries.includes(e.id));

            const packToggle = toggleStyle(allItemsEnabled, 32, 18, 12);
            const pkSw = document.createElement('div'); pkSw.style.cssText = packToggle.wrap;
            const pkDot = document.createElement('div'); pkDot.style.cssText = packToggle.dot;
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
                menuApi.replaceContentPanel(renderPanel, '로어 관리');
            };

            const title = document.createElement('div'); title.style.cssText = 'font-size:14px;font-weight:900;color:var(--li-text,#e7edf5);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; title.textContent = pk + ' (' + items.length + '개)';
            const arrow = document.createElement('span'); arrow.textContent = autoExpandPacks ? '▾' : '▸'; arrow.setAttribute('aria-hidden', 'true'); arrow.style.cssText = 'font-size:13px;color:var(--li-muted,#748196);width:16px;text-align:center;line-height:1;flex-shrink:0;';
            headerRow.appendChild(pkSw); headerRow.appendChild(title); headerRow.appendChild(arrow); nd.appendChild(headerRow);

            items.sort((a,b) => (a.type||'').localeCompare(b.type||''));
            const listContainer = document.createElement('div'); listContainer.style.cssText = 'display:' + (autoExpandPacks ? 'flex' : 'none') + ';flex-direction:column;gap:8px;';
            let isExpanded = autoExpandPacks;
            headerRow.onclick = () => { isExpanded = !isExpanded; listContainer.style.display = isExpanded ? 'flex' : 'none'; arrow.textContent = isExpanded ? '▾' : '▸'; };

            for (const e of items) {
              const row = document.createElement('div'); row.className = 'lore-v2-lore-entry'; row.style.cssText = 'padding:10px;border:1px solid var(--li-line,#3f3f46);border-radius:8px;background:var(--li-surface,#232327);display:flex;flex-direction:column;';
              const header = document.createElement('div'); header.className = 'lore-v2-lore-entry-head'; header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;';
              const left = document.createElement('div'); left.style.cssText = 'display:flex;align-items:center;gap:9px;flex:1;min-width:0;';
              const isEnabled = isEntryEnabledForUrl(e);
              const entryToggle = toggleStyle(isEnabled, 28, 14, 10);
              const sw = document.createElement('div'); sw.style.cssText = entryToggle.wrap;
              const dot = document.createElement('div'); dot.style.cssText = entryToggle.dot;
              sw.appendChild(dot);
              sw.title = isEnabled ? '이 로어 사용 중' : '이 로어 꺼짐';
              sw.onclick = (ev) => { ev.stopPropagation(); const ns = !isEntryEnabledForUrl(e); setEntryEnabled(e, ns); const st = toggleStyle(ns, 28, 14, 10); sw.title = ns ? '이 로어 사용 중' : '이 로어 꺼짐'; sw.style.cssText = st.wrap; dot.style.cssText = st.dot; };
              const nameSpan = document.createElement('span'); nameSpan.textContent = '[' + e.type + '] ' + e.name; nameSpan.style.cssText = 'font-size:13px;color:var(--li-text,#e7edf5);font-weight:900;cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

              const embStatusSpan = document.createElement('span'); embStatusSpan.style.cssText = 'margin-left:7px;font-size:10px;padding:2px 6px;border-radius:999px;font-weight:900;';
              const updateEmbStatus = async () => { try { const emb = await db.embeddings.where({entryId: e.id, field: 'summary'}).first() || await db.embeddings.where('entryId').equals(e.id).first(); if (emb) { const ch = C.embeddingSourceHash ? C.embeddingSourceHash(e, emb.field || 'summary') : (emb.hash || ''); const targetModel = settings.config.embeddingModel || 'gemini-embedding-001'; if((emb.sourceHash||emb.hash)===ch && (!emb.packName || emb.packName===e.packName)){ const needsRegen=(emb.model && emb.model !== targetModel) || (emb.schemaVersion && emb.schemaVersion < 2) || (emb.taskType!=='RETRIEVAL_DOCUMENT'&&targetModel.includes('embedding-001')); if(needsRegen){setBadge(embStatusSpan,'재생성',TONE.warn,'rgba(231,181,111,.15)');}else{setBadge(embStatusSpan,'임베딩',TONE.ok,'rgba(120,213,168,.14)');} }else{setBadge(embStatusSpan,'변경됨',TONE.warn,'rgba(231,181,111,.15)');} }else{setBadge(embStatusSpan,'미임베딩',TONE.muted,'rgba(116,129,150,.16)');} }catch(ex){} };
              updateEmbStatus();
              nameSpan.appendChild(embStatusSpan); left.appendChild(sw); left.appendChild(nameSpan);

              const right = document.createElement('div'); right.className = 'lore-v2-lore-actions'; right.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;';
              const B = BTN_BASE;
              const embGenBtn = document.createElement('button'); embGenBtn.textContent = '임베딩'; embGenBtn.style.cssText = B;
              embGenBtn.onclick = async (ev) => { ev.stopPropagation(); embGenBtn.disabled = true; embGenBtn.textContent = '...'; try { const miss = _w.__LoreInj.getApiMissingReason ? _w.__LoreInj.getApiMissingReason(settings.config, 'embed') : ''; if (miss) throw new Error(miss); const apiOpts = _w.__LoreInj.buildEmbeddingApiOpts ? _w.__LoreInj.buildEmbeddingApiOpts({ model: settings.config.embeddingModel || 'gemini-embedding-001' }, { feature: 'embed', chatKey: 'global' }) : { apiType: settings.config.autoExtApiType === 'deepseek' ? 'key' : (settings.config.autoExtApiType || 'key'), key: settings.config.autoExtApiType === 'deepseek' ? settings.config.autoExtFirebaseEmbedKey : settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }; await C.ensureEmbedding(e, apiOpts); embGenBtn.textContent = 'OK'; updateEmbStatus(); } catch (err) { embGenBtn.textContent = 'X'; alert('실패:' + err.message); } setTimeout(() => { embGenBtn.textContent = '임베딩'; embGenBtn.disabled = false; }, 1500); };
              const copyBtn = document.createElement('button'); copyBtn.textContent = '복사'; copyBtn.style.cssText = B; copyBtn.onclick = (ev) => { ev.stopPropagation(); const clean = {...e}; delete clean.id; delete clean.packName; delete clean.project; delete clean.enabled; navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(() => alert('복사됨.')).catch(() => alert('실패')); };
              const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.cssText = B + 'color:' + TONE.danger + ';border-color:rgba(239,107,107,.45);';
              const histBtn = document.createElement('button'); histBtn.textContent = '이력'; histBtn.style.cssText = B;
              const anchorBtn = document.createElement('button');
              const _renderAnchor = () => { const on = !!e.anchor; anchorBtn.textContent = '앵커'; anchorBtn.title = on ? '앵커 해제 - 자동 추출 병합 시 보호 해제됨' : '앵커 지정 - 자동 갱신에서 보호함'; anchorBtn.style.cssText = B + (on ? 'border-color:rgba(129,140,248,.55);background:var(--li-accent-bg,rgba(129,140,248,.14));' : ''); };
              _renderAnchor();
              anchorBtn.onclick = async (ev) => { ev.stopPropagation(); e.anchor = !e.anchor; try { await db.entries.put(e); _renderAnchor(); } catch(err) { alert('앵커 토글 실패: ' + err.message); e.anchor = !e.anchor; _renderAnchor(); } };
              [embGenBtn, copyBtn, delBtn, histBtn, anchorBtn].forEach(btn => btn.classList.add('lore-v2-compact-action'));
              right.appendChild(embGenBtn); right.appendChild(copyBtn); right.appendChild(histBtn); right.appendChild(anchorBtn); right.appendChild(delBtn);
              header.appendChild(left); header.appendChild(right); row.appendChild(header);

              // 버전 이력 패널
              const historyContainer = document.createElement('div');
              historyContainer.style.cssText = 'display:none;margin-top:10px;padding:10px;background:rgba(3,8,15,.62);border:1px solid var(--li-line,#2f3b4f);border-radius:9px;';
              histBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (historyContainer.style.display !== 'none') { historyContainer.style.display = 'none'; return; }
                historyContainer.innerHTML = '<div style="font-size:11px;color:var(--li-muted,#748196);">불러오는 중...</div>';
                historyContainer.style.display = 'block';
                try {
                  if (!C.getEntryVersions) { historyContainer.innerHTML = '<div style="font-size:11px;color:#ef6b6b;">버전 이력 기능 미로드.</div>'; return; }
                  const versions = await C.getEntryVersions(e.id);
                  if (!versions || !versions.length) { historyContainer.innerHTML = '<div style="font-size:11px;color:var(--li-muted,#748196);">저장된 버전 없음.</div>'; return; }
                  historyContainer.innerHTML = '';
                  const hdr = document.createElement('div'); hdr.textContent = versions.length + '개 버전 (최신순)'; hdr.style.cssText = 'font-size:11px;color:' + TONE.warn + ';margin-bottom:8px;font-weight:900;'; historyContainer.appendChild(hdr);
                  for (const v of versions) {
                    const vrow = document.createElement('div'); vrow.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.08);gap:8px;';
                    const info = document.createElement('div'); info.style.cssText = 'font-size:11px;color:var(--li-text-soft,#a9b6c7);flex:1;min-width:0;';
                    const sumPrev = (v.snapshot && v.snapshot.summary) ? String(v.snapshot.summary).slice(0, 80) : '';
                    const stPrev = (v.snapshot && (v.snapshot.state || v.snapshot.detail?.current_status)) ? ' / state: ' + (v.snapshot.state || v.snapshot.detail?.current_status) : '';
                    info.innerHTML = '<span style="color:var(--li-text,#e7edf5);">' + new Date(v.ts).toLocaleString() + '</span> <span style="color:var(--li-accent,#5aa7ff);">[' + (v.reason||'auto') + ']</span><br><span style="font-size:10px;color:var(--li-muted,#748196);word-break:break-all;">' + (sumPrev || '(요약 없음)') + stPrev + '</span>';
                    const vbtns = document.createElement('div'); vbtns.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';
                    const resBtn = document.createElement('button'); resBtn.textContent = '복원'; resBtn.style.cssText = BTN_BASE + 'min-height:26px;padding:4px 8px;font-size:10px;color:#fff;background:var(--li-accent,#5aa7ff);border-color:transparent;';
                    resBtn.onclick = async (ev2) => {
                      ev2.stopPropagation();
                      if (!confirm('이 버전으로 복원? 현재 상태는 자동 백업됨.')) return;
                      try { const restored = await C.restoreEntryVersion(v.id); Object.assign(e, restored); nameSpan.textContent = '[' + e.type + '] ' + e.name; nameSpan.appendChild(embStatusSpan); alert('복원됨.'); historyContainer.style.display = 'none'; }
                      catch(err) { alert('실패: ' + err.message); }
                    };
                    vbtns.appendChild(resBtn); vrow.appendChild(info); vrow.appendChild(vbtns); historyContainer.appendChild(vrow);
                  }
                } catch(err) { historyContainer.innerHTML = '<div style="font-size:11px;color:#ef6b6b;">오류: ' + err.message + '</div>'; }
              };
              row.appendChild(historyContainer);

              const editContainer = document.createElement('div'); editContainer.style.cssText = 'display:none;margin-top:10px;flex-direction:column;gap:8px;';
              const ta = document.createElement('textarea'); ta.style.cssText = FIELD_STYLE + 'height:200px;font-size:12px;font-family:monospace;resize:vertical;';
              const editableObj = {...e}; delete editableObj.id; delete editableObj.packName; delete editableObj.project; delete editableObj.enabled; ta.value = JSON.stringify(editableObj, null, 2);
              const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;';
              const saveBtn = document.createElement('button'); saveBtn.textContent = '저장'; saveBtn.style.cssText = B + 'background:rgba(120,213,168,.18);border-color:rgba(120,213,168,.55);color:' + TONE.ok + ';';
              const cancelBtn = document.createElement('button'); cancelBtn.textContent = '닫기'; cancelBtn.style.cssText = B;
              btnRow.appendChild(cancelBtn); btnRow.appendChild(saveBtn); editContainer.appendChild(ta); editContainer.appendChild(btnRow); row.appendChild(editContainer);

              const toggleEdit = () => { editContainer.style.display = editContainer.style.display === 'none' ? 'flex' : 'none'; };
              nameSpan.onclick = toggleEdit; cancelBtn.onclick = toggleEdit;
              saveBtn.onclick = async () => { try { const parsed = JSON.parse(ta.value); const updated = {...e, ...parsed}; await db.entries.put(updated); try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(updated.id); } catch(_){} alert('수정됨. 임베딩은 변경됨으로 표시되며 필요 시 재생성하세요.'); Object.assign(e, updated); nameSpan.textContent = '[' + updated.type + '] ' + updated.name; nameSpan.appendChild(embStatusSpan); updateEmbStatus(); toggleEdit(); } catch (err) { alert('JSON 오류: ' + err.message); } };
              delBtn.onclick = async () => { if (confirm('[' + e.name + '] 삭제?')) { await db.entries.delete(e.id); try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(ex){} const count = await db.entries.where('packName').equals(e.packName).count(); if (count <= 0) { await db.packs.delete(e.packName); row.remove(); menuApi.replaceContentPanel(renderPanel, '로어 관리'); } else { await db.packs.update(e.packName, { entryCount: count }); row.remove(); title.textContent = pk + ' (' + count + '개)'; } } };
              listContainer.appendChild(row);
            }
            nd.appendChild(listContainer);
          }});
        }
      };
      return renderPanel;
  }

  _w.__LoreInj.renderLoreListPanel = (panel, menuApi) => {
    const renderPanel = createLoreListRenderer(menuApi || { replaceContentPanel: (renderer) => renderer(panel) });
    return renderPanel(panel);
  };

  _w.__LoreInj.registerSettingsPage('lore', '로어 목록', (m) => {
      const renderPanel = createLoreListRenderer(m);
      m.replaceContentPanel(renderPanel, '로어 목록 관리');
  });

  _w.__LoreInj.__subLoreLoaded = true;
})();
