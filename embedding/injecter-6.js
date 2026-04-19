// == 인젝터 모듈 6/6 — UI ==
// setupUI + 5개 서브메뉴 (메인설정/로어관리/스냅샷/파일/대화추출)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__injectLoaded)) { console.error('[LoreInj:6] inject 미로드'); return; }
  if (_w.__LoreInj.__uiLoaded) return;

  const {
    C, R, db, _ls, settings, defaultSettings, OOC_FORMATS, CHANGELOG,
    getChatKey,
    getAutoExtPackForUrl, setAutoExtPackForUrl,
    getExtLog, addExtLog, clearExtLog,
    getInjLog, addInjLog, clearInjLog,
    isEntryEnabledForUrl, setPackEnabled, setEntryEnabled,
    createSnapshot, restoreSnapshot,
    runAutoExtract,
    getTurnCounter, getCooldownMap // 누락된 유틸리티 함수 추가
  } = _w.__LoreInj;

  const VER = _w.__LoreInj.VER;

  // ModalManager 해결: userscript 스코프 → unsafeWindow → window 순으로 시도
  const MM = (typeof ModalManager !== 'undefined') ? ModalManager
          : (_w.ModalManager || (typeof window !== 'undefined' && window.ModalManager) || null);
  if (!MM) {
    console.error('[LoreInj:6] ModalManager 미로드 — decentralized-modal @require 확인 필요. _w 키:', Object.keys(_w).filter(k => /modal/i.test(k)));
    return;
  }
  console.log('[LoreInj:6] ModalManager 획득. getOrCreateManager 타입:', typeof MM.getOrCreateManager);

  // UI 렌더링
  function setupUI() {
    const modal = MM.getOrCreateManager('c2');
    console.log('[LoreInj:6] modal 인스턴스:', modal, '| createMenu 타입:', typeof modal?.createMenu);
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu 없음. ModalManager API가 예상과 다름. modal 객체:', modal);
      return;
    }

    modal.createMenu('로어 설정', (m) => {
      m.replaceContentPanel(async (panel) => {
        const PRESETS = {
          beginner: { name: '기본 추천', desc: '임베딩 검색 + 8턴 주기 자동 추출. 일반 RP.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: true, autoExtTurns: 8, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 4, cooldownTurns: 8, loreBudgetChars: 300, loreBudgetMax: 500, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 12, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: false, useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true } },
          minimal: { name: '수동 검색', desc: '자동 추출 OFF. 수동 추출만 사용. API 호출 최소.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: false, autoEmbedOnExtract: true, scanOffset: 2, maxEntries: 3, cooldownTurns: 6, loreBudgetChars: 250, loreBudgetMax: 400, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: false, importanceGating: true, importanceThreshold: 12, rerankEnabled: false, useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true } },
          advanced: { name: '정밀 (리랭커)', desc: '자동 추출 5턴 + 재정렬 + 의미 기반 교정까지. 장문 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.4, autoExtEnabled: true, autoExtTurns: 5, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 5, cooldownTurns: 8, loreBudgetChars: 400, loreBudgetMax: 700, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 10, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: true, useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true, refinerEnabled: true, refinerLoreMode: 'semantic' } }
        };
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '빠른 설정'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
          for (const [key, preset] of Object.entries(PRESETS)) {
            const btn = document.createElement('button'); btn.style.cssText = 'padding:10px 14px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid #333;background:#1a1a1a;color:#ccc;display:flex;flex-direction:column;gap:4px;text-align:left;flex:1;min-width:110px;';
            const nm = document.createElement('div'); nm.textContent = preset.name; nm.style.cssText = 'font-weight:bold;color:#4a9;font-size:13px;';
            const ds = document.createElement('div'); ds.textContent = preset.desc; ds.style.cssText = 'font-size:10px;color:#888;';
            btn.appendChild(nm); btn.appendChild(ds);
            btn.onclick = () => {
              if (!confirm('[' + preset.name + '] 프리셋 적용?')) return;
              settings.config = JSON.parse(JSON.stringify(defaultSettings)); Object.assign(settings.config, preset.config); settings.save();
              m.replaceContentPanel((p) => p.addText('새로고침 필요함.'), '설정 갱신 필요');
            };
            row.appendChild(btn);
          }
          nd.appendChild(row);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow('로어 인젝션 활성화', '대화에 설정 정보를 자동 삽입함.', settings.config.enabled, (v) => { settings.config.enabled = v; settings.save(); }));

          nd.appendChild(C.createToggleRow('적응형 로어 압축', '주입 공간 부족 시 텍스트를 자동으로 짧게 줄임.', settings.config.useCompressedFormat !== false, (v) => { settings.config.useCompressedFormat = v; settings.save(); }));
          const cmpWrap = document.createElement('div'); cmpWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-left:10px;';
          const cmpLbl = document.createElement('div'); cmpLbl.textContent = '압축 모드'; cmpLbl.style.cssText = 'font-size:12px;color:#aaa;';
          const cmpSel = document.createElement('select'); cmpSel.style.cssText = 'width:120px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;';
          [{v:'auto', l:'자동 (예산 맞춤)'}, {v:'full', l:'전체 표시 (Full)'}, {v:'compact', l:'요약 (Compact)'}, {v:'micro', l:'최소 (Micro)'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; cmpSel.appendChild(opt); });
          cmpSel.value = settings.config.compressionMode || 'auto';
          cmpSel.onchange = () => { settings.config.compressionMode = cmpSel.value; settings.save(); };
          cmpWrap.appendChild(cmpLbl); cmpWrap.appendChild(cmpSel); nd.appendChild(cmpWrap);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '검색 & 감지'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(t);
          nd.appendChild(C.createToggleRow('임베딩 검색', '의미 기반 검색. API 필요.', settings.config.embeddingEnabled, (v) => { settings.config.embeddingEnabled = v; settings.save(); }));
          const emRow = document.createElement('div'); emRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
          const emL = document.createElement('div'); emL.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const eml1 = document.createElement('div'); eml1.textContent = '임베딩 모델'; eml1.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          emL.appendChild(eml1);
          const emSel = document.createElement('select'); emSel.style.cssText = 'width:200px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'gemini-embedding-001',l:'gemini-embedding-001'},{v:'gemini-embedding-2-preview',l:'gemini-embedding-2-preview'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; emSel.appendChild(opt); });
          emSel.value = settings.config.embeddingModel || 'gemini-embedding-001';
          emSel.onchange = () => { settings.config.embeddingModel = emSel.value; settings.save(); alert('모델 변경됨. 기존 임베딩 재생성 필요.'); };
          emRow.appendChild(emL); emRow.appendChild(emSel); nd.appendChild(emRow);

          nd.appendChild(C.createToggleRow('자동 임베딩 생성', '대화 추출 후 임베딩 갱신.', settings.config.autoEmbedOnExtract !== false, (v) => { settings.config.autoEmbedOnExtract = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('시간 감쇠', '오래된 로어 재주입. 쿨다운 무시.', settings.config.decayEnabled, (v) => { settings.config.decayEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('LLM 재정렬 (Reranker)', 'Gemini로 검색 결과 재정렬.', settings.config.rerankEnabled || false, (v) => { settings.config.rerankEnabled = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;';
          const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const t = document.createElement('div'); t.textContent = '주입 위치'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const d = document.createElement('div'); d.textContent = '메시지 기준 로어 삽입 위치.'; d.style.cssText = 'font-size:11px;color:#888;';
          left.appendChild(t); left.appendChild(d);
          const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;';
          const b1 = document.createElement('button'), b2 = document.createElement('button');
          const updateBtns = () => { const isB = settings.config.position === 'before'; b1.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${isB ? '#285' : '#444'};background:${isB ? '#285' : 'transparent'};color:${isB ? '#fff' : '#ccc'};`; b2.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!isB ? '#285' : '#444'};background:${!isB ? '#285' : 'transparent'};color:${!isB ? '#fff' : '#ccc'};`; };
          b1.textContent = '메시지 앞'; b1.onclick = () => { settings.config.position = 'before'; settings.save(); updateBtns(); };
          b2.textContent = '메시지 뒤'; b2.onclick = () => { settings.config.position = 'after'; settings.save(); updateBtns(); };
          updateBtns(); right.appendChild(b1); right.appendChild(b2); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const tr = document.createElement('div'); tr.textContent = '추가 정보 주입'; tr.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(tr);
          nd.appendChild(C.createToggleRow('호칭 매트릭스', '캐릭터 간 호칭 정보를 압축하여 전달.', settings.config.honorificMatrixEnabled !== false, (v) => { settings.config.honorificMatrixEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('서사 연속성 기능', '첫 만남 블록/재회 태그/호칭 변화 힌트/lastSeen 갱신 등을 일괄 관리.', settings.config.firstEncounterWarning !== false, (v) => { settings.config.firstEncounterWarning = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t1 = document.createElement('div'); t1.textContent = '출력 포맷'; t1.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(t1);
          const oocSel = document.createElement('select'); oocSel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;';
          for (const [k, v] of Object.entries(OOC_FORMATS)) { const opt = document.createElement('option'); opt.value = k; opt.textContent = v.name + ' — ' + v.desc; oocSel.appendChild(opt); }
          oocSel.value = settings.config.oocFormat || 'custom';
          const pInp = document.createElement('input'); pInp.value = settings.config.prefix || ''; pInp.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;';
          pInp.onchange = () => { settings.config.prefix = pInp.value; settings.save(); };
          const sInp = document.createElement('input'); sInp.value = settings.config.suffix || ''; sInp.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:20px;';
          sInp.onchange = () => { settings.config.suffix = sInp.value; settings.save(); };
          oocSel.onchange = () => {
            const fmt = OOC_FORMATS[oocSel.value];
            if (fmt && oocSel.value !== 'custom') { pInp.value = fmt.prefix; sInp.value = fmt.suffix; settings.config.prefix = fmt.prefix; settings.config.suffix = fmt.suffix; }
            settings.config.oocFormat = oocSel.value; settings.save();
            pInp.disabled = oocSel.value !== 'custom'; sInp.disabled = oocSel.value !== 'custom';
            pInp.style.opacity = oocSel.value !== 'custom' ? '0.6' : '1'; sInp.style.opacity = oocSel.value !== 'custom' ? '0.6' : '1';
          };
          nd.appendChild(oocSel); nd.appendChild(pInp); nd.appendChild(sInp);
          const isCustom = (settings.config.oocFormat || 'custom') === 'custom';
          pInp.disabled = !isCustom; sInp.disabled = !isCustom; pInp.style.opacity = isCustom ? '1' : '0.6'; sInp.style.opacity = isCustom ? '1' : '0.6';
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const resetBtn = document.createElement('button'); resetBtn.textContent = '모든 설정 초기화 (DB 유지)'; resetBtn.style.cssText = 'width:100%;padding:10px;margin-top:20px;background:#833;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;';
          resetBtn.onclick = () => { if (confirm('설정 초기화?')) { _ls.removeItem('lore-injector-v5'); location.reload(); } }; nd.appendChild(resetBtn);
        }});
      }, '메인 설정');
    })
    .createSubMenu('로어 관리 (목록)', (m) => {
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
                if (newState) {
                    ud[curUrl] = ud[curUrl].filter(id => !itemIds.includes(id));
                } else {
                    for (const id of itemIds) {
                        if (!ud[curUrl].includes(id)) ud[curUrl].push(id);
                    }
                }
                settings.config.urlDisabledEntries = ud;
                settings.save();
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
              const updateEmbStatus = async () => { try { const emb = await db.embeddings.where({entryId: e.id, field: 'summary'}).first() || await db.embeddings.where('entryId').equals(e.id).first(); if (emb) { let h=0; const s = e.embed_text ? (e.name+' '+e.embed_text) : (e.name+': '+(e.summary||'')); for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0; const ch=h.toString(36); const targetModel = settings.config.embeddingModel || 'gemini-embedding-001'; if(emb.hash===ch){ const needsRegen=(emb.model && emb.model !== targetModel) || (emb.taskType!=='RETRIEVAL_DOCUMENT'&&targetModel.includes('embedding-001')); if(needsRegen){embStatusSpan.textContent='⚠️재생성';embStatusSpan.style.background='#3a3a1a';embStatusSpan.style.color='#d96';}else{embStatusSpan.textContent='⚡임베딩';embStatusSpan.style.background='#1a3a2a';embStatusSpan.style.color='#4a9';} }else{embStatusSpan.textContent='⚠️변경됨';embStatusSpan.style.background='#3a3a1a';embStatusSpan.style.color='#d96';} }else{embStatusSpan.textContent='⭕미임베딩';embStatusSpan.style.background='#2a2a2a';embStatusSpan.style.color='#888';} }catch(ex){} };
              updateEmbStatus();
              nameSpan.appendChild(embStatusSpan); left.appendChild(swWrap); left.appendChild(nameSpan);

              const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;';
              const B = 'font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
              const embGenBtn = document.createElement('button'); embGenBtn.textContent = '임베딩'; embGenBtn.style.cssText = B + 'color:#4a9;border-color:#264;';
              embGenBtn.onclick = async (ev) => { ev.stopPropagation(); embGenBtn.disabled = true; embGenBtn.textContent = '...'; try { await C.ensureEmbedding(e, { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }); embGenBtn.textContent = '✅'; updateEmbStatus(); } catch (err) { embGenBtn.textContent = '❌'; alert('실패:' + err.message); } setTimeout(() => { embGenBtn.textContent = '임베딩'; embGenBtn.disabled = false; }, 1500); };
              const copyBtn = document.createElement('button'); copyBtn.textContent = '복사'; copyBtn.style.cssText = B + 'color:#4a9;border-color:#264;'; copyBtn.onclick = (ev) => { ev.stopPropagation(); const clean = {...e}; delete clean.id; delete clean.packName; delete clean.project; delete clean.enabled; navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(() => alert('복사됨.')).catch(() => alert('실패')); };
              const editBtn = document.createElement('button'); editBtn.textContent = '수정'; editBtn.style.cssText = B + 'color:#88c;border-color:#446;';
              const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.cssText = B + 'color:#a55;border-color:#633;';
              const histBtn = document.createElement('button'); histBtn.textContent = '이력'; histBtn.style.cssText = B + 'color:#da8;border-color:#642;';
              const anchorBtn = document.createElement('button');
              const _renderAnchor = () => { const on = !!e.anchor; anchorBtn.textContent = on ? '⚓앵커' : '앵커'; anchorBtn.title = on ? '앵커 해제 — 자동 추출 병합 시 보호 해제됨' : '앵커 지정 — summary/state/detail/call/inject 자동 덮어쓰기 차단, 재주입 우선도 최대'; anchorBtn.style.cssText = B + (on ? 'color:#fc4;border-color:#963;background:#2a1a00;' : 'color:#777;border-color:#444;'); };
              _renderAnchor();
              anchorBtn.onclick = async (ev) => { ev.stopPropagation(); e.anchor = !e.anchor; try { await db.entries.put(e); _renderAnchor(); } catch(err) { alert('앵커 토글 실패: ' + err.message); e.anchor = !e.anchor; _renderAnchor(); } };
              right.appendChild(embGenBtn); right.appendChild(copyBtn); right.appendChild(histBtn); right.appendChild(anchorBtn); right.appendChild(editBtn); right.appendChild(delBtn);
              header.appendChild(left); header.appendChild(right); row.appendChild(header);

              // 버전 이력 패널 (append-only 백업 조회/복원)
              const historyContainer = document.createElement('div');
              historyContainer.style.cssText = 'display:none;margin-top:8px;padding:8px;background:#0a0a0a;border:1px solid #222;border-radius:4px;';
              histBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (historyContainer.style.display !== 'none') { historyContainer.style.display = 'none'; return; }
                historyContainer.innerHTML = '<div style="font-size:11px;color:#888;">불러오는 중...</div>';
                historyContainer.style.display = 'block';
                try {
                  if (!C.getEntryVersions) { historyContainer.innerHTML = '<div style="font-size:11px;color:#d66;">버전 이력 기능 미로드 (core 재로드 필요).</div>'; return; }
                  const versions = await C.getEntryVersions(e.id);
                  if (!versions || !versions.length) { historyContainer.innerHTML = '<div style="font-size:11px;color:#888;">저장된 버전 없음. 다음 덮어쓰기부터 기록됨.</div>'; return; }
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
                    vbtns.appendChild(resBtn);
                    vrow.appendChild(info); vrow.appendChild(vbtns); historyContainer.appendChild(vrow);
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
              saveBtn.onclick = async () => { try { const parsed = JSON.parse(ta.value); const updated = {...e, ...parsed}; await db.entries.put(updated); alert('수정됨.'); Object.assign(e, updated); nameSpan.textContent = '[' + updated.type + '] ' + updated.name; nameSpan.appendChild(embStatusSpan); updateEmbStatus(); toggleEdit(); } catch (err) { alert('JSON 오류: ' + err.message); } };
              delBtn.onclick = async () => { if (confirm('[' + e.name + '] 삭제?')) { await db.entries.delete(e.id); try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(ex){} const count = await db.entries.where('packName').equals(e.packName).count(); await db.packs.update(e.packName, { entryCount: count }); row.remove(); title.textContent = pk + ' (' + count + '개)'; } };
              listContainer.appendChild(row);
            }
            nd.appendChild(listContainer);
          }});
        }
      };
      m.replaceContentPanel(renderPanel, '로어 목록 관리');
    })
    .createSubMenu('로어 스냅샷 (백업)', (m) => {
      const renderSnapshotUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '스냅샷 복원'; t.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const snaps = await db.snapshots.orderBy('timestamp').reverse().toArray();
          if (!snaps.length) { nd.appendChild(Object.assign(document.createElement('div'), { textContent: '저장된 스냅샷이 없습니다.', style: 'color:#888;font-size:12px;' })); return; }
          const list = document.createElement('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;';
          for (const s of snaps) {
            const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px;background:#1a1a1a;border:1px solid #333;border-radius:4px;';
            const info = document.createElement('div'); info.style.cssText = 'display:flex;flex-direction:column;';
            const sTitle = document.createElement('span'); sTitle.textContent = `[${s.packName}] ${s.label} (${s.data.length}개)`; sTitle.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;';
            const sTime = document.createElement('span'); sTime.textContent = new Date(s.timestamp).toLocaleString(); sTime.style.cssText = 'font-size:10px;color:#888;';
            info.appendChild(sTitle); info.appendChild(sTime);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex;gap:4px;';
            const rBtn = document.createElement('button'); rBtn.textContent = '복원'; rBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:#258;color:#fff;border:none;cursor:pointer;';
            rBtn.onclick = async () => { if (confirm(`[${s.packName}] 팩을 이 시점으로 복원할 것?\\n기존 데이터는 덮어씌워집니다.`)) { await restoreSnapshot(s.id); alert('복원 완료.'); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            const dBtn = document.createElement('button'); dBtn.textContent = '삭제'; dBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:transparent;color:#d66;border:1px solid #d66;cursor:pointer;';
            dBtn.onclick = async () => { if (confirm('삭제?')) { await db.snapshots.delete(s.id); m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리'); } };
            btnWrap.appendChild(rBtn); btnWrap.appendChild(dBtn);
            row.appendChild(info); row.appendChild(btnWrap); list.appendChild(row);
          }
          nd.appendChild(list);
        }});
      };
      m.replaceContentPanel(renderSnapshotUI, '스냅샷 관리');
    })
    .createSubMenu('로어 관리 (파일)', (m) => {
      const renderPackUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div'); title.textContent = '로어 가져오기'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
          const nameInput = document.createElement('input'); nameInput.placeholder = '로어 이름'; nameInput.style.cssText = 'flex:1;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;'; row.appendChild(nameInput);
          const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json'; fileInput.style.display = 'none';
          const importBtn = document.createElement('button'); importBtn.textContent = '📥 JSON 파일 가져오기'; importBtn.style.cssText = 'padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;white-space:nowrap;'; importBtn.onclick = () => fileInput.click();
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
          const manualBtn = document.createElement('button'); manualBtn.textContent = '📋 수동 추가'; manualBtn.style.cssText = 'padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:1px solid #285;font-weight:bold;';
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
            const embBtn = document.createElement('button'); embBtn.textContent = '임베딩'; embBtn.style.cssText = B + 'color:#4a9;border-color:#264;'; embBtn.onclick = async () => { const apiType = settings.config.autoExtApiType || 'key'; if (apiType === 'vertex' ? !settings.config.autoExtVertexJson : !settings.config.autoExtKey) { alert('API 설정 필요.'); return; } if (!confirm('[' + pack.name + '] 임베딩 생성?')) return; embBtn.disabled = true; const orig = embBtn.textContent; try { const cnt = await C.embedPack(pack.name, { apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, model: settings.config.embeddingModel || 'gemini-embedding-001' }, (done, total) => { embBtn.textContent = done + '/' + total; }); embBtn.textContent = '✅' + cnt; setTimeout(() => { embBtn.textContent = orig; embBtn.disabled = false; }, 2000); } catch (e) { embBtn.textContent = '❌'; embBtn.disabled = false; alert('실패:' + e.message); } };
            const delBtn = document.createElement('button'); delBtn.textContent = '삭제'; delBtn.style.cssText = B + 'color:#a55;border-color:#633;';
            delBtn.onclick = async () => { if (!confirm('[' + pack.name + '] 삭제?')) return; const es = await db.entries.where('packName').equals(pack.name).toArray(); for (const e of es) await db.embeddings.where('entryId').equals(e.id).delete(); await db.entries.where('packName').equals(pack.name).delete(); await db.packs.delete(pack.name); m.replaceContentPanel(renderPackUI, '파일 관리'); };
            actions.appendChild(exportBtn); actions.appendChild(embBtn); actions.appendChild(delBtn); header.appendChild(actions); packDiv.appendChild(header); nd.appendChild(packDiv);
          }
        }});
      };
      m.replaceContentPanel(renderPackUI, '파일 관리');
    })
    .createSubMenu('대화 추출 및 변환', (m) => {
      const renderAutoUI = (panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow('자동 대화 추출', '대화를 주기적으로 DB에 추가.', settings.config.autoExtEnabled, (v) => { settings.config.autoExtEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('기존 로어 전송', '전체 JSON 데이터를 함께 보내 중복 방지.', settings.config.autoExtIncludeDb, (v) => { settings.config.autoExtIncludeDb = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('페르소나 정보 전송', '추출 시 페르소나 이름을 같이 보내 정확도 올림.', settings.config.autoExtIncludePersona, (v) => { settings.config.autoExtIncludePersona = v; settings.save(); }));

          const row1 = document.createElement('div'); row1.style.cssText = 'display:flex;gap:12px;margin-bottom:8px;align-items:center;';
          const makeInput = (label, key, defaultVal) => {
            const f = document.createElement('div'); f.style.flex = '1';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; i.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal;
            i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            const saveNum = () => { const v = parseInt(i.value); if (!isNaN(v)) { settings.config[key] = v; settings.save(); } };
            i.oninput = saveNum; i.onchange = saveNum;
            f.appendChild(l); f.appendChild(i); return f;
          };
          row1.appendChild(makeInput('주기(턴)', 'autoExtTurns', 8)); row1.appendChild(makeInput('범위(턴)', 'autoExtScanRange', 6)); row1.appendChild(makeInput('오프셋', 'autoExtOffset', 5));
          nd.appendChild(row1);

          const row2 = document.createElement('div'); row2.style.cssText = 'display:flex;gap:12px;margin-bottom:12px;align-items:center;';
          const f3 = document.createElement('div'); f3.style.flex = '1';
          const l3 = document.createElement('div'); l3.textContent = '저장될 로어명'; l3.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
          const inputWrap = document.createElement('div'); inputWrap.style.cssText = 'display:flex;gap:6px;';
          const i3 = document.createElement('input'); i3.type = 'text';
          getAutoExtPackForUrl(C.getCurUrl()).then(name => i3.value = name);
          i3.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
          const savePackName = () => { const val = i3.value || '자동추출'; settings.config.autoExtPack = val; setAutoExtPackForUrl(C.getCurUrl(), val); };
          i3.oninput = savePackName; i3.onchange = savePackName;
          const s3 = document.createElement('select'); s3.style.cssText = 'width:100px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          db.packs.toArray().then(packs => { const opt = document.createElement('option'); opt.value = ''; opt.textContent = '기존 선택'; s3.appendChild(opt); packs.forEach(p => { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; s3.appendChild(o); }); });
          s3.onchange = () => { if (s3.value) { i3.value = s3.value; settings.config.autoExtPack = s3.value; setAutoExtPackForUrl(C.getCurUrl(), s3.value); s3.value = ''; } };
          inputWrap.appendChild(i3); inputWrap.appendChild(s3); f3.appendChild(l3); f3.appendChild(inputWrap);
          row2.appendChild(f3); nd.appendChild(row2);

          const btnRun = document.createElement('button'); btnRun.textContent = '수동 추출 실행';
          btnRun.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;width:100%;margin-top:10px;';
          const btnStatus = document.createElement('div'); btnStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.4;'; btnStatus.textContent = '';
          btnRun.onclick = async () => {
            if (!confirm('수동 추출 시작?')) return;
            // 현재 입력된 설정 강제 저장 (onchange 미발동 대비)
            settings.save();
            btnRun.disabled = true;
            const origText = btnRun.textContent;
            const startMs = Date.now();
            btnRun.textContent = '에리가 추출 중...';
            btnStatus.textContent = '에리가 대화 분석 중';
            btnStatus.style.color = '#4a9';
            const tick = setInterval(() => {
              const sec = Math.floor((Date.now() - startMs) / 1000);
              btnStatus.textContent = `에리가 대화 분석 중 (${sec}초)`;
            }, 1000);
            try {
              await runAutoExtract(true);
              clearInterval(tick);
              const sec = Math.floor((Date.now() - startMs) / 1000);
              btnStatus.textContent = `에리: 완료 (${sec}초)`;
              btnStatus.style.color = '#4a9';
              setTimeout(() => { btnStatus.textContent = ''; }, 4000);
            } catch(e) {
              clearInterval(tick);
              btnStatus.textContent = '에리: 실패 — ' + (e.message || e).slice(0, 50);
              btnStatus.style.color = '#d66';
            } finally {
              btnRun.textContent = origText;
              btnRun.disabled = false;
            }
          };
          nd.appendChild(btnRun);
          nd.appendChild(btnStatus);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const tplHeader = document.createElement('div'); tplHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
          const tplTitle = document.createElement('div'); tplTitle.textContent = '프롬프트 템플릿 관리'; tplTitle.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;';
          const newTplBtn = document.createElement('button'); newTplBtn.textContent = '+ 새 템플릿'; newTplBtn.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:3px;background:#258;border:none;color:#fff;cursor:pointer;';
          tplHeader.appendChild(tplTitle); tplHeader.appendChild(newTplBtn); nd.appendChild(tplHeader);

          const tplSelectWrap = document.createElement('div'); tplSelectWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:center;';
          const tplSelect = document.createElement('select'); tplSelect.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          const tplRenameBtn = document.createElement('button'); tplRenameBtn.textContent = '이름 변경'; tplRenameBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
          const tplDelBtn = document.createElement('button'); tplDelBtn.textContent = '삭제'; tplDelBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #d66;color:#d66;cursor:pointer;';
          const tplResetBtn = document.createElement('button'); tplResetBtn.textContent = '초기화'; tplResetBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #285;color:#4a9;cursor:pointer;margin-left:auto;';

          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;font-family:monospace;resize:vertical;';
          const lblSchema = document.createElement('div'); lblSchema.textContent = '스키마 (JSON)'; lblSchema.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(lblSchema);
          const taSchema = document.createElement('textarea'); taSchema.style.cssText = S + 'height:150px;'; nd.appendChild(taSchema);
          const lbl1 = document.createElement('div'); lbl1.textContent = '프롬프트 (DB 미포함)'; lbl1.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(lbl1);
          const ta1 = document.createElement('textarea'); ta1.style.cssText = S + 'height:150px;'; nd.appendChild(ta1);
          const lbl2 = document.createElement('div'); lbl2.textContent = '프롬프트 (DB 포함)'; lbl2.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(lbl2);
          const ta2 = document.createElement('textarea'); ta2.style.cssText = S + 'height:150px;'; nd.appendChild(ta2);

          const renderTplOptions = () => {
            tplSelect.innerHTML = '';
            (settings.config.templates || []).forEach(t => { const opt = document.createElement('option'); opt.value = t.id; opt.textContent = t.name + (t.isDefault ? ' (기본)' : ''); tplSelect.appendChild(opt); });
            tplSelect.value = settings.config.activeTemplateId || 'default';
            const activeTpl = settings.getActiveTemplate();
            tplRenameBtn.style.display = activeTpl.isDefault ? 'none' : 'block'; tplDelBtn.style.display = activeTpl.isDefault ? 'none' : 'block';
            taSchema.value = activeTpl.schema; taSchema.disabled = activeTpl.isDefault;
            ta1.value = activeTpl.promptWithoutDb; ta1.disabled = activeTpl.isDefault;
            ta2.value = activeTpl.promptWithDb; ta2.disabled = activeTpl.isDefault;
          };
          tplSelectWrap.appendChild(tplSelect); tplSelectWrap.appendChild(tplRenameBtn); tplSelectWrap.appendChild(tplDelBtn); tplSelectWrap.appendChild(tplResetBtn); nd.insertBefore(tplSelectWrap, lblSchema);

          newTplBtn.onclick = () => { const name = prompt('새 템플릿 이름:'); if (!name) return; const newId = 'tpl_' + Date.now(); const active = settings.getActiveTemplate(); settings.config.templates.push({ id: newId, name, isDefault: false, schema: active.schema, promptWithoutDb: active.promptWithoutDb, promptWithDb: active.promptWithDb }); settings.config.activeTemplateId = newId; settings.save(); renderTplOptions(); };
          tplResetBtn.onclick = () => {
            const activeTpl = settings.getActiveTemplate();
            if (activeTpl.isDefault) { alert('기본 템플릿은 수정 불가 — 초기화 불필요.'); return; }
            if (confirm(`[${activeTpl.name}] 템플릿을 기본 템플릿의 내용으로 덮어씌워 초기화할 것?`)) {
              const defaultTpl = (settings.config.templates || []).find(t => t.isDefault);
              if (defaultTpl) {
                const idx = settings.config.templates.findIndex(t => t.id === activeTpl.id);
                if (idx !== -1) {
                  settings.config.templates[idx].schema = defaultTpl.schema;
                  settings.config.templates[idx].promptWithoutDb = defaultTpl.promptWithoutDb;
                  settings.config.templates[idx].promptWithDb = defaultTpl.promptWithDb;
                  settings.save();
                  renderTplOptions();
                  alert('초기화 완료.');
                }
              }
            }
          };
          tplSelect.onchange = () => { settings.config.activeTemplateId = tplSelect.value; settings.save(); renderTplOptions(); };
          tplRenameBtn.onclick = () => { const activeTpl = settings.getActiveTemplate(); if (activeTpl.isDefault) return; const newName = prompt('템플릿 이름:', activeTpl.name); if (newName) { const idx = settings.config.templates.findIndex(t => t.id === activeTpl.id); if (idx !== -1) { settings.config.templates[idx].name = newName.trim(); settings.save(); renderTplOptions(); } } };
          tplDelBtn.onclick = () => { const activeId = settings.config.activeTemplateId; const activeTpl = settings.getActiveTemplate(); if (activeTpl.isDefault) return; if (confirm('[' + activeTpl.name + '] 템플릿 삭제?')) { settings.config.templates = settings.config.templates.filter(t => t.id !== activeId); settings.config.activeTemplateId = 'default'; settings.save(); renderTplOptions(); } };

          const saveTpl = (key, val) => { const id = settings.config.activeTemplateId; const idx = (settings.config.templates || []).findIndex(t => t.id === id); if (idx !== -1 && !settings.config.templates[idx].isDefault) { settings.config.templates[idx][key] = val; settings.save(); } };
          taSchema.onchange = () => saveTpl('schema', taSchema.value); ta1.onchange = () => saveTpl('promptWithoutDb', ta1.value); ta2.onchange = () => saveTpl('promptWithDb', ta2.value);
          renderTplOptions();
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';
          nd.innerHTML = '<div style="font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;">지식 변환 (URL/텍스트 → 로어)</div>';
          const urlInp = document.createElement('input'); urlInp.type = 'text'; urlInp.placeholder = 'URL 입력'; urlInp.style.cssText = S; nd.appendChild(urlInp);
          const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.placeholder = '팩 이름'; nameInp.style.cssText = S; nd.appendChild(nameInp);
          const rDiv = document.createElement('div'); rDiv.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const urlBtn = document.createElement('button'); urlBtn.textContent = 'URL 변환'; urlBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          urlBtn.onclick = async () => { if (!urlInp.value.trim() || !nameInp.value.trim()) { alert('URL과 팩이름 필요.'); return; } urlBtn.disabled = true; urlBtn.textContent = '변환중...'; try { const cnt = await C.importFromUrl(urlInp.value.trim(), nameInp.value.trim(), { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, model: settings.config.autoExtModel }); rDiv.textContent = '✅ ' + cnt + '개 생성'; await setPackEnabled(nameInp.value.trim(), true); } catch (e) { rDiv.textContent = '❌ ' + e.message; } urlBtn.textContent = 'URL 변환'; urlBtn.disabled = false; };
          nd.appendChild(urlBtn); nd.appendChild(rDiv);
          const t2 = document.createElement('div'); t2.innerHTML = '<div style="font-size:13px;color:#ccc;font-weight:bold;margin-top:16px;margin-bottom:8px;">텍스트 → 로어 팩</div>'; nd.appendChild(t2);
          const ta = document.createElement('textarea'); ta.placeholder = '설정, 소설 텍스트 등'; ta.style.cssText = S + 'height:100px;resize:vertical;'; nd.appendChild(ta);
          const nameInp2 = document.createElement('input'); nameInp2.type = 'text'; nameInp2.placeholder = '팩 이름'; nameInp2.style.cssText = S; nd.appendChild(nameInp2);
          const rDiv2 = document.createElement('div'); rDiv2.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const tBtn = document.createElement('button'); tBtn.textContent = '텍스트 변환'; tBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          tBtn.onclick = async () => { if (!ta.value.trim() || !nameInp2.value.trim()) { alert('입력값 필요.'); return; } tBtn.disabled = true; tBtn.textContent = '변환중...'; try { const cnt = await C.importFromText(ta.value.trim(), nameInp2.value.trim(), { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, model: settings.config.autoExtModel }); rDiv2.textContent = '✅ ' + cnt + '개 생성'; await setPackEnabled(nameInp2.value.trim(), true); } catch (e) { rDiv2.textContent = '❌ ' + e.message; } tBtn.textContent = '텍스트 변환'; tBtn.disabled = false; };
          nd.appendChild(tBtn); nd.appendChild(rDiv2);
        }});
      };
      m.replaceContentPanel(renderAutoUI, '추출/변환 설정');
    })
    .createSubMenu('AI 응답 교정 (Refiner)', (m) => {
      m.replaceContentPanel(async (panel) => {
        if (!R) { panel.addText('Refiner 라이브러리 없음.'); return; }
        // 수동 검수 버튼: 마지막 AI 응답 즉시 재검수 (fingerprint/refinerEnabled 무시)
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '수동 검수'; t.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;margin-bottom:4px;'; nd.appendChild(t);
          const d = document.createElement('div'); d.textContent = '마지막 AI 응답을 지금 즉시 재검수. 이미 처리된 응답도 다시 돌릴 수 있음.'; d.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;'; nd.appendChild(d);
          // 동적 폄태 표시 법 (퍼스 + 단계 텍스트)
          const btnBox = document.createElement('div'); btnBox.style.cssText = 'position:relative;';
          const btn = document.createElement('button'); btn.textContent = '최근 AI 응답 재검수'; btn.style.cssText = 'width:100%;padding:10px;background:#258;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;';
          const statusLine = document.createElement('div'); statusLine.style.cssText = 'font-size:11px;margin-top:6px;text-align:center;line-height:1.4;min-height:16px;display:flex;align-items:center;justify-content:center;gap:6px;color:#888;';
          btnBox.appendChild(btn); btnBox.appendChild(statusLine); nd.appendChild(btnBox);
          // 퍼스 주입 (행정 전용)
          if (!_w.__loreRefinerPulseCss) {
            _w.__loreRefinerPulseCss = true;
            const st = document.createElement('style');
            st.textContent = '@keyframes lore-refiner-pulse{0%,100%{opacity:1}50%{opacity:.3}}';
            document.head.appendChild(st);
          }
          const makeDot = () => { const d = document.createElement('span'); d.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:lore-refiner-pulse 1s infinite;'; return d; };
          btn.onclick = async () => {
            if (!R.manualRefine) { alert('Refiner 버전 낮음. Tampermonkey에서 스크립트 수동 업데이트 필요.'); return; }
            const cid = C.getCurrentChatId();
            if (!cid) { alert('채팅방 감지 실패.'); return; }
            btn.disabled = true;
            const orig = btn.textContent;
            btn.textContent = '검수 실행 중';
            statusLine.innerHTML = '';
            statusLine.appendChild(makeDot());
            const txt = document.createElement('span'); txt.textContent = '대상 탐색'; statusLine.appendChild(txt);
            statusLine.style.color = '#4a9';
            const start = Date.now();
            const phases = ['대상 탐색', '로어 수집', '메모리 수집', 'AI 호출 중', '반영 중'];
            let phaseIdx = 0;
            const tick = setInterval(() => {
              if (phaseIdx < phases.length - 1) phaseIdx++;
              const sec = Math.floor((Date.now() - start) / 1000);
              txt.textContent = `${phases[phaseIdx]} (${sec}초)`;
            }, 1500);
            try {
              const lastBot = await CrackUtil.chatRoom().findLastBotMessage(cid);
              if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error('마지막 AI 응답 없음');
              await R.manualRefine(lastBot.content, lastBot.id);
              clearInterval(tick);
              const sec = Math.floor((Date.now() - start) / 1000);
              statusLine.innerHTML = ''; statusLine.textContent = `완료 (${sec}초)`; statusLine.style.color = '#4a9';
              setTimeout(() => { statusLine.textContent = ''; statusLine.style.color = '#888'; }, 3000);
            } catch(e) {
              clearInterval(tick);
              statusLine.innerHTML = ''; statusLine.textContent = '실패: ' + String(e.message || e).slice(0, 50);
              statusLine.style.color = '#d66';
            } finally {
              btn.textContent = orig;
              btn.disabled = false;
            }
          };
        }});
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow('응답 교정 켜기', 'AI 응답 시 로어 기반 자동 검수.', settings.config.refinerEnabled, (v) => { settings.config.refinerEnabled = v; settings.save(); if(v && R.setNeedsWarmup) R.setNeedsWarmup(); }));
          nd.appendChild(C.createToggleRow('자동 반영 (팝업 없음)', '검수 결과를 팝업 없이 즉시 적용.', settings.config.refinerAutoMode, (v) => { settings.config.refinerAutoMode = v; settings.save(); }));

          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';

          const modeWrap = document.createElement('div'); modeWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
          const modeLbl = document.createElement('div'); modeLbl.textContent = '로어 검색 모드'; modeLbl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const modeSel = document.createElement('select'); modeSel.style.cssText = 'width:160px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'matchedOnly', l:'키워드 매칭만'}, {v:'semantic', l:'임베딩 (의미 검색)'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; modeSel.appendChild(opt); });
          modeSel.value = settings.config.refinerLoreMode || 'matchedOnly';
          modeSel.onchange = () => { settings.config.refinerLoreMode = modeSel.value; settings.save(); };
          modeWrap.appendChild(modeLbl); modeWrap.appendChild(modeSel); nd.appendChild(modeWrap);

          const tplWrap = document.createElement('div'); tplWrap.style.cssText = 'margin-bottom:8px;padding-top:8px;border-top:1px dashed #333;';
          const tplLbl = document.createElement('div'); tplLbl.textContent = '검수 템플릿 선택'; tplLbl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:4px;';
          const tplSel = document.createElement('select'); tplSel.style.cssText = S;
          const tplDesc = document.createElement('div'); tplDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;';

          const customOpt = document.createElement('option'); customOpt.value = 'custom'; customOpt.textContent = '직접 입력 (커스텀)'; tplSel.appendChild(customOpt);
          if (R.TEMPLATES) {
            Object.entries(R.TEMPLATES).forEach(([k, t]) => { const opt = document.createElement('option'); opt.value = k; opt.textContent = t.name; tplSel.appendChild(opt); });
          }
          tplWrap.appendChild(tplLbl); tplWrap.appendChild(tplSel); tplWrap.appendChild(tplDesc); nd.appendChild(tplWrap);

          const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:12px;';
          const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const t = document.createElement('div'); t.textContent = '참조 대화 턴 수'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;'; left.appendChild(t);
          const right = document.createElement('div');
          const inp = document.createElement('input'); inp.type = 'number'; inp.value = settings.config.refinerContextTurns !== undefined ? settings.config.refinerContextTurns : 1; inp.min = 0; inp.max = 20;
          inp.style.cssText = 'width:60px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
          inp.onchange = () => { settings.config.refinerContextTurns = parseInt(inp.value) || 0; settings.save(); };
          right.appendChild(inp); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);

          const tLbl2 = document.createElement('div'); tLbl2.textContent = '프롬프트 ({lore}, {memory}, {context}, {message}, {passWord})'; tLbl2.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; nd.appendChild(tLbl2);
          const ta = document.createElement('textarea'); ta.value = settings.config.refinerCustomPrompt; ta.style.cssText = S + 'height:200px;font-family:monospace;resize:vertical;';
          ta.onchange = () => { settings.config.refinerCustomPrompt = ta.value; settings.save(); tplSel.value = 'custom'; tplDesc.textContent = ''; }; nd.appendChild(ta);

          if (R.TEMPLATES) {
            tplSel.onchange = () => {
              const val = tplSel.value;
              if (val !== 'custom' && R.TEMPLATES[val]) {
                const tpl = R.TEMPLATES[val];
                ta.value = tpl.prompt; settings.config.refinerCustomPrompt = tpl.prompt;
                inp.value = tpl.turnHint; settings.config.refinerContextTurns = tpl.turnHint;
                tplDesc.textContent = tpl.desc;
                settings.save();
              } else {
                tplDesc.textContent = '직접 작성한 프롬프트를 사용합니다.';
              }
            };
            const normalize = (s) => (s||'').trim().replace(/\s+/g, ' ');
            let matched = 'custom';
            const curNorm = normalize(settings.config.refinerCustomPrompt);
            Object.entries(R.TEMPLATES).forEach(([k, t]) => { if (normalize(t.prompt) === curNorm) matched = k; });

            if (matched === 'custom' && !settings.config.refinerCustomPrompt) {
              matched = 'full';
              settings.config.refinerCustomPrompt = R.TEMPLATES.full.prompt;
              settings.config.refinerContextTurns = R.TEMPLATES.full.turnHint;
              ta.value = R.TEMPLATES.full.prompt;
              inp.value = R.TEMPLATES.full.turnHint;
              settings.save();
            }

            tplSel.value = matched;
            if (matched !== 'custom') tplDesc.textContent = R.TEMPLATES[matched].desc;
            else tplDesc.textContent = '직접 작성한 프롬프트를 사용합니다.';
          }

          const clearFpBtn = document.createElement('button'); clearFpBtn.textContent = '처리 기록 큐 초기화'; clearFpBtn.style.cssText = 'width:100%;padding:8px;margin-top:12px;background:#654;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
          clearFpBtn.onclick = () => { R.clearProcessed(); alert('기록 삭제됨'); }; nd.appendChild(clearFpBtn);
        }});
      }, '응답 교정 설정');
    })
    .createSubMenu('실행 로그', (m) => {
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
            // 기본 접힌 상태: 모든 카테고리 동시 노출 시 스왔 발생 방지
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
          // 최적화 카운터 (Stage B에서 도입된 Bundling/Delta Skip)
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
    })
    .createSubMenu('세션 상태 관리', (m) => {
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
    })
    .createSubMenu('API 설정', (m) => {
      m.replaceContentPanel((panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = 'Gemini / Vertex AI API'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          C.createApiInput(settings.config, 'autoExt', nd, () => settings.save());

          // Test Button
          const testRow = document.createElement('div'); testRow.style.cssText = 'margin:12px 0 16px;display:flex;gap:8px;align-items:center;';
          const testBtn = document.createElement('button'); testBtn.textContent = 'API 키 테스트';
          testBtn.style.cssText = 'padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;';
          const testResult = document.createElement('span'); testResult.style.cssText = 'font-size:12px;color:#888;word-break:break-all;';
          testBtn.onclick = async () => {
            const apiType = settings.config.autoExtApiType || 'key';
            const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript : !settings.config.autoExtKey;
            if (missing) { alert(apiType === 'vertex' ? 'Vertex JSON 필요.' : apiType === 'firebase' ? 'Firebase 설정 필요.' : 'API 키 필요.'); return; }
            testBtn.disabled = true; testResult.textContent = '테스트 중...';
            try {
              const r = await C.callGeminiApi('Say "OK" in one word.', { apiType: settings.config.autoExtApiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation, vertexProjectId: settings.config.autoExtVertexProjectId, firebaseScript: settings.config.autoExtFirebaseScript, model: settings.config.autoExtModel, maxRetries: 0 });
              testResult.textContent = r.text ? '✅ 성공: ' + r.text.trim().slice(0, 50) : '❌ 실패: ' + r.error; testResult.style.color = r.text ? '#4a9' : '#d66';
            } catch(e) { testResult.textContent = '❌ 오류: ' + e.message; testResult.style.color = '#d66'; }
            testBtn.disabled = false;
          };
          testRow.appendChild(testBtn); testRow.appendChild(testResult); nd.appendChild(testRow);

          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';

          const ml = document.createElement('div'); ml.textContent = '기본 LLM 모델'; ml.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(ml);
          const ms = document.createElement('select'); ms.style.cssText = S;
          [['Gemini 3.x', [['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]], ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]].forEach(([g, opts]) => { const og = document.createElement('optgroup'); og.label = g; opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); }); ms.appendChild(og); });
          ms.value = settings.config.autoExtModel || 'gemini-3-flash-preview';
          const ci = document.createElement('input'); ci.value = settings.config.autoExtCustomModel || ''; ci.style.cssText = S + 'margin-top:6px;' + (ms.value === '_custom' ? '' : 'display:none;');
          ci.onchange = () => { settings.config.autoExtCustomModel = ci.value; settings.save(); };
          ms.onchange = () => { settings.config.autoExtModel = ms.value; settings.save(); ci.style.display = ms.value === '_custom' ? '' : 'none'; };
          nd.appendChild(ms); nd.appendChild(ci);

          // Reranker Model
          const rml = document.createElement('div'); rml.textContent = '재정렬(Reranker) 모델'; rml.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(rml);
          const rms = document.createElement('select'); rms.style.cssText = S;
          [['Gemini', [['3.1 Flash Lite (추천)', 'gemini-3.1-flash-lite-preview'], ['3.0 Flash', 'gemini-3-flash-preview'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite']]]].forEach(([g, opts]) => { const og = document.createElement('optgroup'); og.label = g; opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); }); rms.appendChild(og); });
          rms.value = settings.config.rerankModel || 'gemini-3-flash-preview';
          rms.onchange = () => { settings.config.rerankModel = rms.value; settings.save(); };
          nd.appendChild(rms);

          // Rerank Prompt
          const rplWrap = document.createElement('div'); rplWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:10px 0 4px;';
          const rpl = document.createElement('div'); rpl.textContent = '재정렬(Reranker) 프롬프트'; rpl.style.cssText = 'font-size:11px;color:#999;';
          const rplBtn = document.createElement('button'); rplBtn.textContent = '기본값 복구'; rplBtn.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:3px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
          rplWrap.appendChild(rpl); rplWrap.appendChild(rplBtn); nd.appendChild(rplWrap);

          const rpta = document.createElement('textarea'); rpta.value = settings.config.rerankPrompt || C.DEFAULTS.rerankPrompt; rpta.style.cssText = S + 'height:100px;font-family:monospace;resize:vertical;';
          rpta.onchange = () => { settings.config.rerankPrompt = rpta.value; settings.save(); }; nd.appendChild(rpta);
          rplBtn.onclick = () => { if(confirm('Reranker 프롬프트를 기본값으로 되돌리시겠습니까?')) { settings.config.rerankPrompt = C.DEFAULTS.rerankPrompt; settings.save(); rpta.value = C.DEFAULTS.rerankPrompt; } };

          // Thinking Settings
          const rl = document.createElement('div'); rl.textContent = '추론(Reasoning) 레벨'; rl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(rl);
          const rs = document.createElement('select'); rs.style.cssText = S;
          [['Off', 'off'], ['Minimal (256)', 'minimal'], ['Low (1024)', 'low'], ['Medium (2048)', 'medium'], ['High (4096)', 'high'], ['Budget (사용자 지정)', 'budget']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; rs.appendChild(o); });
          rs.value = settings.config.autoExtReasoning || 'medium'; nd.appendChild(rs);
          const bl = document.createElement('div'); bl.textContent = '추론 예산 설정'; bl.style.cssText = 'font-size:11px;color:#666;margin-bottom:4px;margin-top:8px;' + (rs.value === 'budget' ? '' : 'display:none;');
          const bi = document.createElement('input'); bi.type = 'number'; bi.value = settings.config.autoExtBudget || 2048; bi.style.cssText = S + (rs.value === 'budget' ? '' : 'display:none;');
          bi.onchange = () => { settings.config.autoExtBudget = parseInt(bi.value) || 2048; settings.save(); };
          rs.onchange = () => { settings.config.autoExtReasoning = rs.value; settings.save(); const isB = rs.value === 'budget'; bl.style.display = isB ? '' : 'none'; bi.style.display = isB ? '' : 'none'; };
          nd.appendChild(bl); nd.appendChild(bi);
        }});
      }, 'API 설정');
    })
    .createSubMenu('도움말', (m) => {
      m.replaceContentPanel((panel) => {
        const addHelp = (title, sections) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;';
            const arrow = document.createElement('span'); arrow.textContent = '▶'; arrow.style.cssText = 'font-size:11px;color:#888;width:10px;';
            const tt = document.createElement('div'); tt.textContent = title; tt.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;flex:1;';
            head.appendChild(arrow); head.appendChild(tt);
            const body = document.createElement('div'); body.style.cssText = 'display:none;padding:10px 2px 4px 2px;border-top:1px dashed #333;margin-top:6px;width:100%;box-sizing:border-box;';
            sections.forEach(s => {
              const lbl = document.createElement('div'); lbl.textContent = s.label; lbl.style.cssText = 'font-size:11px;color:#888;font-weight:bold;margin-top:10px;margin-bottom:3px;letter-spacing:.5px;';
              const txt = document.createElement('div'); txt.textContent = s.text; txt.style.cssText = 'font-size:12px;color:#ccc;line-height:1.75;word-break:keep-all;';
              body.appendChild(lbl); body.appendChild(txt);
            });
            head.onclick = () => { const open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'block'; arrow.textContent = open ? '▶' : '▼'; };
            nd.appendChild(head); nd.appendChild(body);
          }});
        };

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '빠른 시작';
          t.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:6px;';
          const d = document.createElement('div');
          d.innerHTML = '1. API 설정 메뉴에서 Gemini 키 입력함<br>2. 메인 설정 상단 빠른 설정에서 프리셋 고름<br>3. 파일 메뉴에서 로어 팩 가져오거나 대화 추출 실행함<br>4. 필요하면 응답 교정 켜면 됨';
          d.style.cssText = 'font-size:12px;color:#ccc;line-height:1.8;word-break:keep-all;';
          nd.appendChild(t); nd.appendChild(d);
        }});

        addHelp('로어 주입', [
          { label: '기능', text: '대화에 특정 키워드가 나오면 저장된 설정을 AI 프롬프트에 자동으로 끼워 넣음. AI가 세계관과 인물 정보를 잊지 않게 함.' },
          { label: '예시', text: '로어에 "Alice=사과 싫어함" 항목을 저장해두면 대화에 "사과"가 나올 때 해당 설정이 프롬프트에 포함됨. 주입 위치를 "메시지 앞"으로 두면 유저 메시지 직전에 삽입됨.' },
          { label: '설정', text: '메인 설정 > "로어 인젝션 활성화"로 전체 스위치 켬. 주입 위치(앞/뒤)는 같은 화면에서 고름. 적응형 압축은 분량이 많을 때 full → compact → micro 순으로 자동 축약함. OOC 포맷은 AI에게 "이건 배경지식"이라고 알리는 방식으로, 대부분 기본(OOC) 권장. System 태그·내레이터·최소는 모델 특성에 맞춰 골라 씀.' }
        ]);

        addHelp('응답 교정 (Refiner)', [
          { label: '기능', text: 'AI 응답 직후 로어·요약과 모순되는 부분을 찾아 수정안을 만들음. 죽은 캐릭터가 말하거나 설정과 다른 진술이 나오면 다시 씀.' },
          { label: '예시', text: '로어에 "철수=사망"이 있는데 AI가 "철수가 웃으며 말했다"라고 쓰면 해당 문장을 감지해 대체함. 자동 반영을 켜 두면 팝업 없이 즉시 교체됨.' },
          { label: '설정', text: 'AI 응답 교정 메뉴에서 "응답 교정 켜기" 토글. 로어 검색 모드는 "키워드 매칭만"(빠름) 또는 "임베딩"(의미 기반, API 비용 증가) 중 고름. 참조 대화 턴 수는 교정 시 직전 대화 몇 턴을 함께 읽을지 정함(기본 1). 검수 템플릿은 미리 만들어 둔 프롬프트에서 고르거나 직접 작성함. 수동 검수 버튼으로 마지막 AI 응답을 즉시 다시 돌릴 수 있음.' }
        ]);

        addHelp('자동 대화 추출', [
          { label: '기능', text: '일정 턴마다 최근 대화를 분석해 새 설정·관계·약속을 로어 DB에 자동 저장함. 직접 입력하지 않아도 대화에서 드러난 정보가 누적됨.' },
          { label: '예시', text: '대화 중 "니아는 20살이야" 같은 문장이 나오면 다음 추출 주기에 "니아" 항목에 나이가 기록됨. 관계 변화나 약속도 함께 정리됨.' },
          { label: '설정', text: '대화 추출 및 변환 메뉴에서 "자동 대화 추출" 켬. 주기(턴)은 몇 턴마다 실행할지 정하는 값으로 짧을수록 반영이 빠르지만 API 호출이 늘어남(기본 8, 정밀 프리셋은 5). 범위(턴)은 한 번 분석할 때 최근 몇 턴을 볼지 정함(기본 6). 오프셋은 최신 몇 턴을 제외하고 볼지 정하는 값으로, 너무 최신 내용은 아직 확정되지 않았을 수 있어 3턴 정도 띄우는 게 안정적임. "기존 로어 전송"을 켜면 중복 생성이 줄고, "페르소나 정보 전송"은 유저 페르소나 이름을 같이 보내 정확도를 올림. "저장될 로어명"은 결과가 담길 팩 이름임. 수동 추출 실행 버튼으로 즉시 1회 돌릴 수 있음.' }
        ]);

        addHelp('의미 검색과 재정렬 (Reranker)', [
          { label: '기능', text: '임베딩 검색은 키워드가 정확히 일치하지 않아도 뜻이 비슷한 로어를 찾아냄. 재정렬은 찾은 후보들을 LLM이 현재 장면에 맞게 다시 정렬함.' },
          { label: '예시', text: '"강아지"라고 입력해도 "개" 항목이 검색됨. 결과가 10개라면 재정렬이 현재 씬과 가장 관련 있는 5개를 상위로 올림.' },
          { label: '설정', text: '메인 설정 > 검색 & 감지에서 "임베딩 검색"과 "LLM 재정렬"을 각각 토글. 임베딩 모델은 gemini-embedding-001이 안정적이며, 모델 변경 시 기존 임베딩 재생성 필요함. "자동 임베딩 생성"을 켜면 대화 추출 직후 신규 항목이 자동 벡터화됨. Reranker 모델·프롬프트는 API 설정 메뉴에서 바꿀 수 있음(추천: 3.1 Flash Lite). 기존 팩은 파일 메뉴의 "임베딩" 버튼으로 일괄 생성함.' }
        ]);

        addHelp('시간 감쇠·쿨다운·중요도 게이팅', [
          { label: '기능', text: '시간 감쇠는 오래 등장하지 않은 로어의 재주입 우선도를 점차 올려 AI가 잊을 무렵 다시 떠올리게 함. 쿨다운은 같은 항목이 연달아 반복 주입되는 걸 막음. 중요도 게이팅은 중요도+새로움+감정 점수 합이 임계값 미만인 사소한 기록을 걸러냄.' },
          { label: '예시', text: '특정 캐릭터 설정이 10턴 넘게 언급 안 되면 재주입 점수가 올라 다음 주입 후보가 됨. 쿨다운이 8이면 한 번 주입된 로어는 8턴 동안 재주입 안 됨. 임계값이 12면 합계 12 미만 항목은 저장되지 않음.' },
          { label: '설정', text: '메인 설정 > 검색 & 감지 > "시간 감쇠" 토글. 쿨다운 턴 수·중요도 임계값은 프리셋에 포함돼 있음(기본 쿨다운 8·임계값 12, 정밀은 임계값 10으로 더 많이 모음). 현재 쿨다운·재주입 점수는 세션 상태 관리 메뉴에서 확인하고 개별 리셋 가능함.' }
        ]);

        addHelp('호칭과 서사 연속성', [
          { label: '기능', text: '호칭 매트릭스는 캐릭터끼리 서로를 어떻게 부르는지(너·씨·오빠 등)를 관계 항목에 기록해 AI에게 전달함. 서사 연속성은 처음 만난 사이인지 이미 아는 사이인지를 구분해 "처음 뵙겠습니다" 같은 엉뚱한 대사를 줄임.' },
          { label: '예시', text: 'A→B는 "자기", B→A는 "오빠"로 저장돼 있으면 AI가 일관되게 그 호칭을 씀. 이미 만난 캐릭터가 재등장하면 자동으로 재회 태그가 붙음.' },
          { label: '설정', text: '메인 설정 > 추가 정보 주입에서 두 토글 모두 기본 켜짐. 호칭은 자동 추출이 대화에서 탐지한 것을 로어 항목에 기록함 — 필요 시 로어 관리에서 직접 수정함.' }
        ]);

        addHelp('파일과 스냅샷', [
          { label: '기능', text: 'JSON 팩을 가져오거나 내보내 다른 유저와 공유함. 스냅샷은 추출·변경 시점의 팩 상태를 자동 보관해 롤백 지점으로 쓸 수 있음.' },
          { label: '예시', text: '배포된 캐릭터 팩.json을 "JSON 파일 가져오기"로 등록함. 자동 추출이 엉망이 된 것 같으면 스냅샷에서 이전 시점으로 복원함.' },
          { label: '설정', text: '가져오기·내보내기·삭제·팩 임베딩은 로어 관리(파일) 메뉴에서 다룸. JSON을 직접 붙여넣기도 가능함. 스냅샷 목록과 복원은 로어 스냅샷 메뉴. 팩 단위 ON/OFF는 파일 메뉴 상단 스위치로, 개별 항목 ON/OFF는 로어 관리(목록)에서 토글함.' }
        ]);

        addHelp('프롬프트 템플릿 (자동 추출용)', [
          { label: '기능', text: '자동 추출 시 AI에게 보낼 프롬프트를 직접 고치거나 새로 만들 수 있음. 장르·톤에 맞춰 추출 기준을 조정 가능함.' },
          { label: '예시', text: '성인 장르용 템플릿을 복제해 "관계 변화 묘사는 더 구체적으로" 같은 지시를 덧붙여 저장함. 이후 추출은 그 템플릿 기준으로 돌아감.' },
          { label: '설정', text: '대화 추출 및 변환 메뉴 중간의 프롬프트 템플릿 관리에서 "+ 새 템플릿"으로 복제함. 스키마(출력 JSON 구조), "프롬프트(DB 미포함)"(기존 로어를 같이 보내지 않을 때), "프롬프트(DB 포함)"(함께 보낼 때) 세 가지를 편집함. 기본 템플릿은 보호돼 수정 불가이므로 복제 후 편집. 프롬프트 안의 {schema}·{context}·{entries}는 실제 값으로 치환되는 자리표시자이므로 지우면 안 됨. "초기화" 버튼으로 커스텀 템플릿을 기본값 내용으로 되돌림.' }
        ]);

        addHelp('앵커와 버전 이력', [
          { label: '기능', text: '앵커는 유저가 확정한 캠논 항목을 자동 추출의 덮어쓰기로부터 보호함. 버전 이력은 모든 덮어쓰기 직전 상태를 자동 백업해 언제든 되돌릴 수 있게 함.' },
          { label: '예시', text: '"니아=17세"로 앵커 지정해두면 이후 AI가 "18세" 같은 잘못된 서술을 해도 핵심 필드는 유지됨. 자동 추출이 실수로 관계 설정을 지웠다면 이력에서 이전 버전을 복원함.' },
          { label: '설정', text: '로어 관리(목록)에서 각 항목의 "앵커" 버튼으로 지정·해제. "이력" 버튼으로 저장된 버전(최대 20개) 목록을 보고 복원함. 앵커 상태에서도 사건 목록 추가와 키워드(triggers) 확장은 허용돼 서사는 계속 누적됨.' }
        ]);

        addHelp('URL·텍스트 → 로어 변환', [
          { label: '기능', text: '외부 설정 문서(URL)나 붙여넣은 긴 텍스트를 AI가 분석해 로어 팩 구조로 자동 변환함. 대량 임포트에 유용함.' },
          { label: '예시', text: '위키 문서 URL을 입력하면 주요 인물·장소·사건이 항목별로 나뉘 팩으로 생성됨. 소설 본문을 붙여넣으면 등장인물과 관계가 자동 추출됨.' },
          { label: '설정', text: '대화 추출 및 변환 메뉴 아래의 "지식 변환" 영역에서 URL 또는 텍스트와 팩 이름을 입력한 뒤 변환 버튼 누름. 변환에는 자동 추출과 같은 LLM API 키가 쓰임. 변환된 팩은 자동으로 활성화됨.' }
        ]);

        addHelp('빠른 설정 프리셋', [
          { label: '기능', text: '자주 쓰는 설정 묶음을 한 번에 적용함. 기존 설정은 기본값으로 초기화된 뒤 프리셋 값으로 덮임.' },
          { label: '예시', text: '"기본 추천"은 일반 RP용(8턴 추출, 재정렬 꺼짐). "수동 검색"은 API 절약형으로 자동 추출이 꺼져 있음. "정밀(리랭커)"은 5턴 추출 + LLM 재정렬 + 의미 기반 응답 교정까지 한꺼번에 켬.' },
          { label: '설정', text: '메인 설정 최상단의 빠른 설정 카드에서 버튼 선택. 적용 후 새로고침 필요함.' }
        ]);

        addHelp('API 설정 (모델·추론)', [
          { label: '기능', text: 'Gemini 키 또는 Vertex AI JSON을 등록해 자동 추출·임베딩·재정렬·지식 변환·응답 교정에 공통으로 사용함. 기본 LLM 모델과 재정렬 모델, 추론 예산을 분리해 지정 가능함.' },
          { label: '예시', text: '기본 LLM은 Gemini 3.0 Flash로, Reranker는 3.1 Flash Lite로 지정하면 속도와 품질을 함께 확보함. 추론 레벨 Medium(2048 토큰)은 대부분 RP에 충분함.' },
          { label: '설정', text: 'API 설정 메뉴에서 키 입력 후 "API 키 테스트"로 동작 확인함. 기본 LLM·재정렬 모델은 각각 드롭다운에서 고름. 추론 레벨은 Off·Minimal·Low·Medium·High·Budget 중 고르고, Budget을 고르면 토큰 수를 직접 입력함. Reranker 프롬프트는 같은 화면에서 편집 가능하며 "기본값 복구" 버튼으로 되돌림.' }
        ]);

        addHelp('세션 상태와 실행 로그', [
          { label: '기능', text: '현재 채팅방의 턴 수·쿨다운·재주입 점수를 한눈에 보고 개별·일괄 초기화함. 실행 로그는 주입·추출·교정·모순 기록을 분리해 남김.' },
          { label: '예시', text: 'AI가 특정 설정을 반복 참조하면 주입 기록에서 어떤 항목이 몇 번 들어갔는지 확인함. 자동 추출이 실패했다면 추출 기록에서 API 에러를 살핌.' },
          { label: '설정', text: '세션 상태 관리 메뉴에서 항목별 리셋 또는 "세션 전체 초기화"로 일괄 리셋. 실행 로그는 각 카테고리(주입·추출·교정·모순) 상단을 클릭해 펼치거나 "초기화" 버튼으로 지움.' }
        ]);
      }, '기능 안내');
    });
  }

  setupUI();

  // === 모놀리스 원본 DOM 진입점 이식 ===
  // 1) 좌측 설정 메뉴에 "결정화 캐즘" 링크 추가
  function __updateModalMenu() {
    const modal = document.getElementById('web-modal');
    if (modal && !document.getElementById('chasm-decentral-menu')) {
      const itemFound = modal.getElementsByTagName('a');
      for (let item of itemFound) {
        if (item.getAttribute('href') === '/setting') {
          const clonedElement = item.cloneNode(true);
          clonedElement.id = 'chasm-decentral-menu';
          const textElement = clonedElement.getElementsByTagName('span')[0];
          if (textElement) textElement.innerText = '결정화 캐즘';
          clonedElement.setAttribute('href', 'javascript: void(0)');
          clonedElement.onclick = (event) => {
            event.preventDefault(); event.stopPropagation();
            MM.getOrCreateManager('c2').display(document.body.getAttribute('data-theme') !== 'light');
          };
          item.parentElement?.append(clonedElement);
          break;
        }
      }
    }
  }

  // 2) 채팅창 상단 패널에 "🔥 Chasm Tools" 버튼 삽입
  async function injectBannerButton() {
    const selected = document.getElementsByClassName('burner-button');
    if (selected && selected.length > 0) return;
    try {
      const isStory = /\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) || /\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname);
      const topPanel = document.getElementsByClassName(isStory ? 'css-1c5w7et' : 'css-l8r172');
      if (topPanel && topPanel.length > 0) {
        const topContainer = topPanel[0].childNodes[topPanel.length - 1]?.getElementsByTagName('div');
        if (!topContainer || topContainer.length <= 0) return;
        const topList = topContainer[0].children[0].children;
        const top = topList[topList.length - 1];
        if (!top) return;
        const buttonCloned = document.createElement('button');
        buttonCloned.innerHTML = '<p></p>'; buttonCloned.style.cssText = 'margin-right: 10px'; buttonCloned.className = 'burner-button';
        const textNode = buttonCloned.getElementsByTagName('p');
        top.insertBefore(buttonCloned, top.childNodes[0]); textNode[0].innerText = '🔥  Chasm Tools';
        buttonCloned.removeAttribute('onClick');
        buttonCloned.addEventListener('click', () => { MM.getOrCreateManager('c2').display(document.body.getAttribute('data-theme') !== 'light'); });
      }
    } catch(e) {}
  }

  async function doInjection() {
    if (!/\/characters\/[a-f0-9]+\/chats\/[a-f0-9]+/.test(location.pathname) && !/\/stories\/[a-f0-9]+\/episodes\/[a-f0-9]+/.test(location.pathname) && !/\/u\/[a-f0-9]+\/c\/[a-f0-9]+/.test(location.pathname)) return;
    await injectBannerButton();
  }

  function __doModalMenuInit() {
    if (document.c2InjectorModalInit) return;
    document.c2InjectorModalInit = true;
    if (typeof GenericUtil !== 'undefined' && GenericUtil.attachObserver) {
      GenericUtil.attachObserver(document, () => { __updateModalMenu(); });
    } else {
      const observer = new MutationObserver(() => { __updateModalMenu(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', doInjection); window.addEventListener('load', doInjection); } else { doInjection(); }
    setInterval(doInjection, 2000);
  }

  // 3) 변경 로그 팝업 (버전 업데이트 시 1회)
  function showChangelogIfNew() {
    const lastVer = _ls.getItem('lore-injector-last-ver');
    if (lastVer === VER) return;
    const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;justify-content:center;align-items:center;';
    const box = document.createElement('div'); box.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:12px;width:100%;max-width:400px;padding:24px;display:flex;flex-direction:column;gap:16px;color:#eee;';
    const title = document.createElement('div'); title.textContent = '업데이트 완료! (' + VER + ')'; title.style.cssText = 'font-size:16px;font-weight:bold;color:#4a9;text-align:center;';
    const list = document.createElement('ul'); list.style.cssText = 'margin:0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:10px;';
    CHANGELOG.forEach(item => { const li = document.createElement('li'); li.style.fontSize = '13px'; li.style.color = '#ccc'; li.textContent = item; list.appendChild(li); });
    const btn = document.createElement('button'); btn.textContent = '확인'; btn.style.cssText = 'padding:10px;background:#444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;margin-top:8px;';
    btn.onclick = () => { _ls.setItem('lore-injector-last-ver', VER); document.body.removeChild(overlay); };
    box.appendChild(title); box.appendChild(list); box.appendChild(btn); overlay.appendChild(box); document.body.appendChild(overlay);
  }

  // 4) Fallback 기어 버튼: 배너 주입 실패/페이지 구조 변경 시에도 접근 가능
  // 모바일(≤768px)에서는 채팅 전송 버튼과 충돌 가능 → 숨김 (🔥 배너로 대체 진입)
  function ensureGearButton() {
    if (window.innerWidth <= 768) {
      const ex = document.getElementById('lore-inj-gear-btn'); if (ex) ex.remove();
      return;
    }
    if (document.getElementById('lore-inj-gear-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'lore-inj-gear-btn';
    btn.title = 'Lore Injector 설정 (Fallback)';
    btn.textContent = '⚙';
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;width:40px;height:40px;border-radius:50%;background:#258;color:#fff;border:1px solid #1a5;font-size:20px;cursor:pointer;z-index:9998;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:0;opacity:.75;';
    btn.onmouseenter = () => { btn.style.opacity = '1'; btn.style.background = '#369'; };
    btn.onmouseleave = () => { btn.style.opacity = '.75'; btn.style.background = '#258'; };
    btn.onclick = () => {
      try { MM.getOrCreateManager('c2').display(document.body.getAttribute('data-theme') !== 'light'); }
      catch(e) { console.error('[LoreInj:6] display() 실패:', e); alert('모달 열기 실패: ' + (e.message || e)); }
    };
    document.body.appendChild(btn);
  }

  document.getElementById('lore-inj-gear-btn')?.remove();
  showChangelogIfNew();
  __doModalMenuInit();
  /* gear FAB 비활성화 — chasm 텍스트 진입점만 사용 */
  const gearObs = new MutationObserver(() => { /* gear FAB 비활성화 — chasm 텍스트 진입점만 사용 */ });
  gearObs.observe(document.body, { childList: true });
  // 화면 회전/리사이즈 시 모바일 여부 재평가
  window.addEventListener('resize', () => { /* gear FAB 비활성화 — chasm 텍스트 진입점만 사용 */ });

  Object.assign(_w.__LoreInj, { __uiLoaded: true });
  console.log('[LoreInj:6] UI loaded (Chasm Tools banner + gear fallback attached)');
})();
