// injecter / sub-merge — 로어 병합 (중복 정리)
// 역할: 임베딩 유사도로 중복 후보 탐색, 병합 전략 (최장/LLM)
// 의존: injecter-3 (settings, db, C)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-merge] settings 미로드'); return; }
  if (_w.__LoreInj.__subMergeLoaded) return;

  const { C, db, settings } = _w.__LoreInj;

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  _w.__LoreInj.registerSubMenu('merge', function(modal) {
    modal.createSubMenu('로어 병합 (중복 정리)', (m) => {
      const renderMerge = async (panel) => {
        const state = _w.__loreMergeState || (_w.__loreMergeState = { threshold: 0.88, maxChars: 1200, groups: null });

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '중복 로어 병합'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:4px;'; nd.appendChild(t);
          const d = document.createElement('div'); d.innerHTML = '임베딩 유사도로 중복 후보를 찾아 그룹별 수동 승인. 핵심 정보 보존과 비대화 방지를 위해 글자수 상한·타입 경고 적용.<br><span style="color:#da8;">※ 현재 페이지에서 활성화(ON)된 팩의 엔트리만 대상 — 다른 페이지나 비활성 팩의 로어는 건드리지 않음.</span>'; d.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.5;'; nd.appendChild(d);

          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px;margin-bottom:8px;align-items:center;';
          const mk = (label, getter, setter, min, max, step) => {
            const f = document.createElement('div'); f.style.flex = '1';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; i.value = getter(); i.min = min; i.max = max; i.step = step;
            i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            i.onchange = () => { const v = parseFloat(i.value); if (!isNaN(v)) setter(v); };
            f.appendChild(l); f.appendChild(i); return f;
          };
          row.appendChild(mk('유사도 임계값', () => state.threshold, v => state.threshold = v, 0.7, 0.99, 0.01));
          row.appendChild(mk('최대 글자수 (summary)', () => state.maxChars, v => state.maxChars = v, 200, 3000, 50));
          nd.appendChild(row);

          const runBtn = document.createElement('button'); runBtn.textContent = '병합 후보 찾기';
          runBtn.style.cssText = 'width:100%;padding:10px;background:#258;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;';
          const runStatus = document.createElement('div'); runStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;';
          runBtn.onclick = async () => {
            runBtn.disabled = true; runBtn.textContent = '검색 중...';
            try {
              const _url = C.getCurUrl(); const activePacks = settings.config.urlPacks?.[_url] || [];
              const entries = (await db.entries.toArray()).filter(e => activePacks.includes(e.packName));
              if (entries.length < 2) { runStatus.textContent = '활성 엔트리 2개 미만.'; runStatus.style.color = '#d66'; return; }
              const embs = await db.embeddings.where('entryId').anyOf(entries.map(e => e.id)).toArray();
              const embMap = {}; for (const eb of embs) if (eb.field === 'summary') embMap[eb.entryId] = eb.vector;
              const withEmb = entries.filter(e => embMap[e.id]);
              if (withEmb.length < 2) { runStatus.textContent = '임베딩 있는 엔트리 2개 미만. 먼저 파일 탭에서 임베딩 생성 필요.'; runStatus.style.color = '#d66'; return; }
              const cos = (a, b) => { let d = 0, na = 0, nb = 0; const L = Math.min(a.length, b.length); for (let i = 0; i < L; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / ((Math.sqrt(na) * Math.sqrt(nb)) || 1); };
              const parent = {}; const find = x => parent[x] === x ? x : (parent[x] = find(parent[x])); const uni = (a, b) => { parent[find(a)] = find(b); };
              withEmb.forEach(e => parent[e.id] = e.id);
              const pairs = [];
              for (let i = 0; i < withEmb.length; i++) {
                for (let j = i + 1; j < withEmb.length; j++) {
                  const s = cos(embMap[withEmb[i].id], embMap[withEmb[j].id]);
                  if (s >= state.threshold) { pairs.push({ a: withEmb[i].id, b: withEmb[j].id, sim: s }); uni(withEmb[i].id, withEmb[j].id); }
                }
              }
              const groupMap = {}; withEmb.forEach(e => { const r = find(e.id); (groupMap[r] = groupMap[r] || []).push(e); });
              const groups = Object.values(groupMap).filter(g => g.length >= 2).map(g => {
                const ids = new Set(g.map(e => e.id));
                const maxSim = pairs.filter(p => ids.has(p.a) && ids.has(p.b)).reduce((m, p) => Math.max(m, p.sim), 0);
                return { entries: g, sim: maxSim };
              }).sort((a, b) => b.sim - a.sim);
              state.groups = groups;
              runStatus.textContent = groups.length > 0 ? '후보 ' + groups.length + '개 그룹 발견.' : '임계값 이상 후보 없음.';
              runStatus.style.color = groups.length > 0 ? '#4a9' : '#888';
              m.replaceContentPanel(renderMerge, '로어 병합');
            } catch(e) { runStatus.textContent = '실패: ' + e.message; runStatus.style.color = '#d66'; }
            runBtn.textContent = '병합 후보 찾기'; runBtn.disabled = false;
          };
          nd.appendChild(runBtn); nd.appendChild(runStatus);

          const bulkRow = document.createElement('div'); bulkRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:10px;padding:8px;background:#111;border:1px solid #333;border-radius:4px;';
          const bulkLbl = document.createElement('div'); bulkLbl.textContent = '일괄 모드 변경'; bulkLbl.style.cssText = 'font-size:11px;color:#888;white-space:nowrap;';
          const bulkSel = document.createElement('select'); bulkSel.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;';
          [['', '-- 선택하여 모든 그룹에 일괄 적용 --'], ['keep-longest', '가장 긴 항목 유지 + 키워드 합집합 (안전)'], ['llm-summarize', 'LLM 요약 병합 (API 호출, 품질↑)']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; bulkSel.appendChild(o); });
          bulkSel.onchange = () => { if (!bulkSel.value) return; const sels = document.querySelectorAll('select.lore-merge-mode-sel'); sels.forEach(s => { s.value = bulkSel.value; }); bulkSel.value = ''; };
          bulkRow.appendChild(bulkLbl); bulkRow.appendChild(bulkSel); nd.appendChild(bulkRow);

          if (C.__lastMergeUndo && C.__lastMergeUndo.originals && C.__lastMergeUndo.originals.length) {
            const undoBtn = document.createElement('button'); undoBtn.textContent = '직전 병합 취소 (' + C.__lastMergeUndo.originals.length + '개 엔트리 복원)';
            undoBtn.style.cssText = 'width:100%;padding:8px;margin-top:10px;background:transparent;color:#da8;border:1px solid #642;border-radius:4px;cursor:pointer;font-size:12px;';
            undoBtn.onclick = async () => {
              if (!confirm('직전 병합을 취소하고 원본 엔트리들을 복원할 것?')) return;
              try {
                const undo = C.__lastMergeUndo;
                if (undo.mergedId !== undefined && undo.mergedId !== null) {
                  await db.entries.delete(undo.mergedId);
                  try { await db.embeddings.where('entryId').equals(undo.mergedId).delete(); } catch(_){}
                }
                for (const snap of undo.originals) { await db.entries.put(snap); }
                const packs = new Set(undo.originals.map(e => e.packName));
                for (const pk of packs) { const cnt = await db.entries.where('packName').equals(pk).count(); await db.packs.update(pk, { entryCount: cnt }); }
                C.__lastMergeUndo = null;
                alert('복원 완료.');
                m.replaceContentPanel(renderMerge, '로어 병합');
              } catch(e) { alert('실패: ' + e.message); }
            };
            nd.appendChild(undoBtn);
          }
        }});

        if (!state.groups) return;
        if (state.groups.length === 0) { panel.addText('후보 없음. 임계값을 낮춰 재시도할 수 있음.'); return; }

        for (const [gi, grp] of state.groups.entries()) {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            nd.style.cssText += 'background:#1a1a1a;border:1px solid #333;border-radius:6px;margin-bottom:12px;padding:10px;';
            const hdr = document.createElement('div'); hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;';
            const title = document.createElement('div'); title.textContent = '그룹 ' + (gi + 1) + ' — ' + grp.entries.length + '개 / 유사도 ' + (grp.sim * 100).toFixed(1) + '%';
            title.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;';
            const types = [...new Set(grp.entries.map(e => e.type))];
            const typeWarn = types.length > 1 ? '타입 불일치: ' + types.join(', ') : '타입: ' + types[0];
            const warn = document.createElement('div'); warn.textContent = typeWarn; warn.style.cssText = 'font-size:10px;color:' + (types.length > 1 ? '#d96' : '#888') + ';';
            hdr.appendChild(title); hdr.appendChild(warn); nd.appendChild(hdr);

            if (types.length > 1) {
              const typeNote = document.createElement('div');
              typeNote.style.cssText = 'margin-bottom:8px;padding:6px 8px;background:#2a1a0a;border:1px solid #642;border-radius:4px;font-size:10px;color:#da8;line-height:1.5;';
              typeNote.innerHTML = '<b>타입이 다를 때의 영향</b><br>• 주입 시 주제별 분류(캐릭터/장소/사건 등)가 무너져 관련 없는 맥락에서 소환될 수 있음<br>• 트리거 키워드가 뒤섞여 오탐 증가<br>• 병합 후에는 한쪽 타입으로 고정되므로 나머지 주제성은 손실';
              nd.appendChild(typeNote);
            }

            for (const e of grp.entries) {
              const row = document.createElement('div'); row.style.cssText = 'padding:6px 0;border-bottom:1px dashed #222;font-size:11px;color:#aaa;';
              const safeSum = String(e.summary || '(요약 없음)').slice(0, 150).replace(/</g, '<');
              row.innerHTML = '<span style="color:#ccc;font-weight:bold;">[' + e.type + '] ' + e.name + '</span> <span style="color:#888;">(' + e.packName + ')</span>' + (e.anchor ? ' <span style="color:#fc4;">앵커</span>' : '') + '<br><span style="font-size:10px;">' + safeSum + '</span>';
              nd.appendChild(row);
            }

            const ctrl = document.createElement('div'); ctrl.style.cssText = 'margin-top:10px;display:flex;gap:8px;align-items:center;';
            const modeSel = document.createElement('select'); modeSel.className = 'lore-merge-mode-sel'; modeSel.style.cssText = 'padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;flex:1;';
            [['keep-longest', '가장 긴 항목 유지 + 키워드 합집합 (안전)'], ['llm-summarize', 'LLM 요약 병합 (API 호출, 품질↑)']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; modeSel.appendChild(o); });
            const previewBtn = document.createElement('button'); previewBtn.textContent = '프리뷰'; previewBtn.style.cssText = 'padding:6px 12px;font-size:11px;border-radius:4px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
            const execBtn = document.createElement('button'); execBtn.textContent = '병합 실행'; execBtn.style.cssText = 'padding:6px 12px;font-size:11px;border-radius:4px;background:#285;border:none;color:#fff;cursor:pointer;font-weight:bold;';
            ctrl.appendChild(modeSel); ctrl.appendChild(previewBtn); ctrl.appendChild(execBtn); nd.appendChild(ctrl);

            const preview = document.createElement('div'); preview.style.cssText = 'margin-top:8px;padding:8px;background:#0a0a0a;border:1px solid #222;border-radius:4px;font-size:11px;color:#ccc;display:none;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;';
            nd.appendChild(preview);

            let mergedDraft = null;

            const mkKeepLongest = (entries) => {
              const sorted = [...entries].sort((a, b) => (b.summary || '').length - (a.summary || '').length);
              const anchored = sorted.find(e => e.anchor);
              const base = JSON.parse(JSON.stringify(anchored || sorted[0]));
              const trigSet = new Set(base.triggers || []);
              for (const e of sorted) {
                if (e.id === base.id) continue;
                (e.triggers || []).forEach(t => trigSet.add(t));
                if (e.detail && typeof e.detail === 'object') base.detail = { ...(e.detail), ...(base.detail || {}) };
                if (e.call && typeof e.call === 'object') base.call = { ...(e.call), ...(base.call || {}) };
              }
              base.triggers = [...trigSet].slice(0, 12);
              return base;
            };

            const mkLlmMerge = async (entries) => {
              const clean = entries.map(({ id, packName, project, enabled, ...rest }) => rest);
              const prompt = '다음은 중복으로 판단된 로어 엔트리들이다. 하나의 로어 JSON으로 병합하라.\n' +
                '원칙:\n1. 핵심 정보는 누락하지 않는다\n2. 불필요한 반복·수식어는 제거한다\n3. summary는 ' + state.maxChars + '자 이내로 반드시 압축한다\n4. triggers는 필수 키워드만 유지 (최대 8개)\n5. detail은 서로 다른 하위 정보를 통합\n6. type은 가장 구체적인 것 유지\n7. 출력은 순수 JSON 객체 하나만.\n\n' +
                '입력:\n' + JSON.stringify(clean, null, 2);
              const res = await C.callGeminiApi(prompt, {
                apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
                vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
                firebaseScript: settings.config.autoExtFirebaseScript, model: settings.config.autoExtModel, maxRetries: 2
              });
              if (!res.text) throw new Error('LLM 응답 없음: ' + (res.error || ''));
              let txt = res.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
              const m1 = txt.match(/\{[\s\S]*\}/); if (m1) txt = m1[0];
              const parsed = JSON.parse(txt);
              const base = JSON.parse(JSON.stringify(entries.find(e => e.anchor) || entries[0]));
              Object.assign(base, parsed);
              return base;
            };

            const buildPreview = async () => {
              preview.style.display = 'block'; preview.textContent = '생성 중...';
              try {
                if (modeSel.value === 'keep-longest') mergedDraft = mkKeepLongest(grp.entries);
                else mergedDraft = await mkLlmMerge(grp.entries);
                const sumLen = (mergedDraft.summary || '').length;
                const over = sumLen > state.maxChars;
                const color = over ? '#d66' : '#4a9';
                preview.innerHTML = '<div style="color:' + color + ';font-weight:bold;margin-bottom:6px;">병합 미리보기 (summary ' + sumLen + '자' + (over ? ' — 상한(' + state.maxChars + ') 초과' : '') + ')</div><pre style="white-space:pre-wrap;margin:0;font-size:11px;color:#ccc;">' + JSON.stringify(mergedDraft, null, 2).replace(/</g, '<') + '</pre>';
              } catch(e) { preview.textContent = 'X ' + e.message; mergedDraft = null; }
            };

            previewBtn.onclick = buildPreview;

            execBtn.onclick = async () => {
              if (!mergedDraft) { await buildPreview(); if (!mergedDraft) return; }
              const sumLen = (mergedDraft.summary || '').length;
              if (sumLen > state.maxChars) { if (!confirm('summary가 상한(' + state.maxChars + '자)을 ' + (sumLen - state.maxChars) + '자 초과. 그래도 적용?')) return; }
              if (types.length > 1) { if (!confirm('타입 불일치 (' + types.join(', ') + '). 계속?')) return; }
              if (!confirm(grp.entries.length + '개 엔트리를 하나로 병합할 것?')) return;
              try {
                const originals = grp.entries.map(e => JSON.parse(JSON.stringify(e)));
                for (const e of grp.entries) { try { if (C.saveEntryVersion) await C.saveEntryVersion(e, 'pre_merge'); } catch(_){} }
                const anchored = grp.entries.find(e => e.anchor);
                const target = anchored || grp.entries[0];
                const toDelete = grp.entries.filter(e => e.id !== target.id);
                const finalEntry = { ...mergedDraft, id: target.id, packName: target.packName, project: target.project };
                await db.entries.put(finalEntry);
                for (const e of toDelete) { await db.entries.delete(e.id); try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(_){} }
                try { await db.embeddings.where('entryId').equals(target.id).delete(); } catch(_){}
                const packs = new Set(grp.entries.map(e => e.packName));
                for (const pk of packs) { const cnt = await db.entries.where('packName').equals(pk).count(); await db.packs.update(pk, { entryCount: cnt }); }
                C.__lastMergeUndo = { mergedId: target.id, originals };
                state.groups = state.groups.filter((_, i) => i !== gi);
                let embedMsg = '';
                try {
                  const apiType = settings.config.autoExtApiType || 'key';
                  const apiOpts = { apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' };
                  const hasApi = apiType === 'vertex' ? !!settings.config.autoExtVertexJson : apiType === 'firebase' ? !!settings.config.autoExtFirebaseEmbedKey : !!settings.config.autoExtKey;
                  if (hasApi) { await C.ensureEmbedding(finalEntry, apiOpts); embedMsg = '임베딩 재생성 완료.'; }
                  else { embedMsg = 'API 미설정 — 파일 탭에서 수동 임베딩 필요.'; }
                } catch(embErr) { embedMsg = '임베딩 재생성 실패: ' + (embErr.message || embErr); }
                alert('병합 완료. ' + embedMsg);
                m.replaceContentPanel(renderMerge, '로어 병합');
              } catch(e) { alert('실패: ' + e.message); }
            };
          }});
        }
      };
      m.replaceContentPanel(renderMerge, '로어 병합');
    });
  });

  _w.__LoreInj.__subMergeLoaded = true;
})();
