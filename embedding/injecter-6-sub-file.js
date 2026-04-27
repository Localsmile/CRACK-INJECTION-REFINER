// injecter / sub-file — 로어 관리 (파일)
// 역할: JSON 가져오기/내보내기, 팩 활성화/비활성화, 임베딩 생성, 삭제
// 의존: injecter-3 (settings, db, C, setPackEnabled)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-file] settings 미로드'); return; }
  if (_w.__LoreInj.__subFileLoaded) return;

  const { C, db, settings, setPackEnabled } = _w.__LoreInj;

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  _w.__LoreInj.registerSubMenu('file', function(modal) {
    modal.createSubMenu('로어 관리 (파일)', (m) => {
      const renderPackUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div'); title.textContent = '로어 가져오기'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
          const nameInput = document.createElement('input'); nameInput.placeholder = '로어 이름'; nameInput.style.cssText = 'flex:1;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;'; row.appendChild(nameInput);
          const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json'; fileInput.style.display = 'none';
          const importBtn = document.createElement('button'); importBtn.textContent = 'JSON 파일 가져오기'; importBtn.style.cssText = 'padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;white-space:nowrap;'; importBtn.onclick = () => fileInput.click();
          fileInput.onchange = async (ev) => {
            const file = ev.target.files[0]; if (!file) return;
            const packName = nameInput.value.trim() || file.name.replace('.json', '');
            try {
              const text = await file.text(); const data = JSON.parse(text); const arr = Array.isArray(data) ? data : [data]; let count = 0;
              for (const e of arr) { if (!e.name) continue; if (!e.triggers) e.triggers = [e.name]; e.packName = packName; e.project = settings.config.activeProject || ''; const existing = await db.entries.where('name').equals(e.name).first(); if (existing) { await db.entries.update(existing.id, e); } else { await db.entries.add(e); count++; } }
              const totalCount = await db.entries.where('packName').equals(packName).count(); let pack = await db.packs.get(packName); if (pack) await db.packs.update(packName, { entryCount: totalCount }); else await db.packs.put({ name: packName, entryCount: totalCount, project: settings.config.activeProject || '' });
              await setPackEnabled(packName, true); alert(arr.length + '개 항목 처리 완료 (신규 ' + count + '개)'); m.replaceContentPanel(renderPackUI, '파일 관리');
            } catch (err) { alert('가져오기 실패: ' + err.message); } fileInput.value = '';
          };
          row.appendChild(fileInput); row.appendChild(importBtn); nd.appendChild(row);

          const manualLbl = document.createElement('div'); manualLbl.textContent = '또는 직접 JSON 입력'; manualLbl.style.cssText = 'font-size:12px;color:#888;margin:12px 0 4px;'; nd.appendChild(manualLbl);
          const manualTa = document.createElement('textarea'); manualTa.placeholder = '[{"name":"이름","triggers":["키워드"],"type":"character","summary":"설명","detail":{}}]'; manualTa.style.cssText = 'width:100%;height:100px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;'; nd.appendChild(manualTa);
          const manualBtnRow = document.createElement('div'); manualBtnRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
          const manualBtn = document.createElement('button'); manualBtn.textContent = '수동 추가'; manualBtn.style.cssText = 'padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:1px solid #285;font-weight:bold;';
          manualBtn.onclick = async () => {
            const pn = nameInput.value.trim() || '수동추가';
            try {
              const txt = manualTa.value.trim(); if (!txt) { alert('JSON을 입력할 것.'); return; }
              const data = JSON.parse(txt); const arr = Array.isArray(data) ? data : [data]; let cnt = 0;
              for (const e of arr) { if (!e.name) continue; if (!e.triggers) e.triggers = [e.name]; e.packName = pn; e.project = settings.config.activeProject || ''; const ex = await db.entries.where('name').equals(e.name).first(); if (ex) { await db.entries.update(ex.id, e); } else { await db.entries.add(e); cnt++; } }
              const tc = await db.entries.where('packName').equals(pn).count(); let pk = await db.packs.get(pn); if (pk) await db.packs.update(pn, { entryCount: tc }); else await db.packs.put({ name: pn, entryCount: tc, project: settings.config.activeProject || '' });
              await setPackEnabled(pn, true); alert(arr.length + '개 처리 (신규 ' + cnt + '개)'); manualTa.value = ''; m.replaceContentPanel(renderPackUI, '파일 관리');
            } catch (err) { alert('JSON 파싱 실패: ' + err.message); }
          };
          manualBtnRow.appendChild(manualBtn); nd.appendChild(manualBtnRow);
        }});

        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const packs = await db.packs.toArray();
          if (!packs.length) { const empty = document.createElement('div'); empty.textContent = '등록된 팩이 없습니다.'; empty.style.cssText = 'color:#666;text-align:center;padding:20px;font-size:12px;'; nd.appendChild(empty); return; }
          const curUrl = C.getCurUrl(); const enabledPacks = settings.config.urlPacks?.[curUrl] || [];
          for (const pack of packs) {
            const packDiv = document.createElement('div'); packDiv.style.cssText = 'margin-bottom:8px;border:1px solid #333;border-radius:4px;overflow:hidden;';
            const header = document.createElement('div'); header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#111;';
            const leftSide = document.createElement('div'); leftSide.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;';
            const isEnabled = enabledPacks.includes(pack.name);
            const swWrap = document.createElement('div'); swWrap.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;';
            const swLabel = document.createElement('span'); swLabel.textContent = isEnabled ? 'ON' : 'OFF'; swLabel.style.cssText = 'font-size:10px;font-weight:bold;width:20px;text-align:center;color:' + (isEnabled ? '#4a7' : '#777') + ';';
            const sw = document.createElement('div'); sw.style.cssText = 'width:24px;height:12px;border-radius:6px;background:' + (isEnabled ? '#285' : '#444') + ';position:relative;';
            const dot = document.createElement('div'); dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;top:2px;left:' + (isEnabled ? '14px' : '2px') + ';transition:left .2s;';
            sw.appendChild(dot); swWrap.appendChild(swLabel); swWrap.appendChild(sw);
            swWrap.onclick = async () => { const curEnabled = (settings.config.urlPacks?.[C.getCurUrl()] || []).includes(pack.name); await setPackEnabled(pack.name, !curEnabled); const nowEnabled = (settings.config.urlPacks?.[C.getCurUrl()] || []).includes(pack.name); swLabel.textContent = nowEnabled ? 'ON' : 'OFF'; swLabel.style.color = nowEnabled ? '#4a7' : '#777'; sw.style.background = nowEnabled ? '#285' : '#444'; dot.style.left = nowEnabled ? '14px' : '2px'; };
            leftSide.appendChild(swWrap);
            const nameEl = document.createElement('span'); nameEl.textContent = pack.name + ' (' + (pack.entryCount || 0) + '개)'; nameEl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;'; leftSide.appendChild(nameEl);
            header.appendChild(leftSide);
            const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:6px;';
            const B = 'font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
            const exportBtn = document.createElement('button'); exportBtn.textContent = '내보내기'; exportBtn.style.cssText = B;
            exportBtn.onclick = async () => { const entries = await db.entries.where('packName').equals(pack.name).toArray(); if (!entries.length) { alert('항목 없음.'); return; } const clean = entries.map(({ id, packName, project, enabled, ...rest }) => rest); const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = pack.name + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
            const embBtn = document.createElement('button'); embBtn.textContent = '임베딩'; embBtn.style.cssText = B + 'color:#4a9;border-color:#264;'; embBtn.onclick = async () => { const apiType = settings.config.autoExtApiType || 'key'; const miss = apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseEmbedKey : !settings.config.autoExtKey; if (miss) { alert(apiType === 'firebase' ? '임베딩용 Gemini API 키 필요.' : 'API 설정 필요.'); return; } if (!confirm('[' + pack.name + '] 임베딩 생성?')) return; embBtn.disabled = true; const orig = embBtn.textContent; try { const cnt = await C.embedPack(pack.name, { apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }, (done, total) => { embBtn.textContent = done + '/' + total; }); embBtn.textContent = 'OK' + cnt; setTimeout(() => { embBtn.textContent = orig; embBtn.disabled = false; }, 2000); } catch (e) { embBtn.textContent = 'X'; embBtn.disabled = false; alert('실패:' + e.message); } };
            const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.cssText = B + 'color:#a55;border-color:#633;';
            delBtn.onclick = async () => { if (!confirm('[' + pack.name + '] 삭제?')) return; const es = await db.entries.where('packName').equals(pack.name).toArray(); for (const e of es) await db.embeddings.where('entryId').equals(e.id).delete(); await db.entries.where('packName').equals(pack.name).delete(); await db.packs.delete(pack.name); m.replaceContentPanel(renderPackUI, '파일 관리'); };
            actions.appendChild(exportBtn); actions.appendChild(embBtn); actions.appendChild(delBtn); header.appendChild(actions); packDiv.appendChild(header); nd.appendChild(packDiv);
          }
        }});
      };
      m.replaceContentPanel(renderPackUI, '파일 관리');
    });
  });

  _w.__LoreInj.__subFileLoaded = true;
})();
