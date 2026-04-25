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
  const COPY = _w.__LoreInjCopy || {};
  const LBL = COPY.labels || {};
  const PRESET_COPY = COPY.presets || {};

  // ModalManager 해결: userscript 스코프 → unsafeWindow → window 순으로 시도
  const MM = (typeof ModalManager !== 'undefined') ? ModalManager
          : (_w.ModalManager || (typeof window !== 'undefined' && window.ModalManager) || null);
  if (!MM) {
    console.error('[LoreInj:6] ModalManager 미로드 — decentralized-modal @require 확인 필요. _w 키:', Object.keys(_w).filter(k => /modal/i.test(k)));
    return;
  }
  // UI 렌더링
  function setupUI() {
    const modal = MM.getOrCreateManager('c2');
    if (!modal || typeof modal.createMenu !== 'function') {
      console.error('[LoreInj:6] modal.createMenu 없음. ModalManager API가 예상과 다름. modal 객체:', modal);
      return;
    }

    function reportPanelError(panel, tag, err) {
      const msg = (err && err.message) ? err.message : String(err || 'unknown');
      console.error('[LoreInj:6] ' + tag + ' 렌더 실패:', err);
      try {
        if (panel && typeof panel.addText === 'function') {
          panel.addText(tag + ' 열기 실패: ' + msg);
          return;
        }
      } catch (_) {}
      try {
        const box = document.createElement('div');
        box.textContent = tag + ' 열기 실패: ' + msg;
        box.style.cssText = 'padding:10px;border:1px solid #633;border-radius:6px;background:#1a0f0f;color:#d99;font-size:12px;line-height:1.5;white-space:pre-wrap;';
        if (panel && panel.appendChild) panel.appendChild(box);
      } catch (_) {}
    }

    function safePanel(tag, renderer) {
      return function (panel) {
        try {
          const result = renderer(panel);
          if (result && typeof result.then === 'function') {
            result.catch(function (err) { reportPanelError(panel, tag, err); });
          }
        } catch (err) {
          reportPanelError(panel, tag, err);
        }
      };
    }

    function openPanel(m, renderer, title, tag) {
      const name = tag || title || '패널';
      const replaceContentPanel = m.replaceContentPanel.bind(m);
      return replaceContentPanel(safePanel(name, renderer), title);
    }

    modal.createMenu(LBL.menuTitle || '설정 정보', (m) => {
      openPanel(m, async (panel) => {
        const PRESETS = {
          beginner: { name: PRESET_COPY.beginner?.name || '기본 추천', desc: PRESET_COPY.beginner?.desc || '의미 기반 검색과 자동 정리 함께 사용.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: true, autoExtTurns: 8, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 4, cooldownTurns: 8, loreBudgetChars: 300, loreBudgetMax: 500, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 12, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: false, useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true } },
          minimal: { name: PRESET_COPY.minimal?.name || '가볍게 사용', desc: PRESET_COPY.minimal?.desc || '자동 정리는 끄고 필요할 때만 직접 실행.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: false, autoEmbedOnExtract: true, scanOffset: 2, maxEntries: 3, cooldownTurns: 6, loreBudgetChars: 250, loreBudgetMax: 400, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: false, importanceGating: true, importanceThreshold: 12, rerankEnabled: false, useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true } },
          advanced: { name: PRESET_COPY.advanced?.name || '정밀 모드', desc: PRESET_COPY.advanced?.desc || '검색 결과 한 번 더 고르고 응답 교정까지 사용.', config: { embeddingEnabled: true, embeddingWeight: 0.4, autoExtEnabled: true, autoExtTurns: 5, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 5, cooldownTurns: 8, loreBudgetChars: 400, loreBudgetMax: 700, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 10, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: true, useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true, refinerEnabled: true, refinerLoreMode: 'semantic' } }
        };
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = LBL.quickSettings || '빠른 설정'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
          for (const [key, preset] of Object.entries(PRESETS)) {
            const btn = document.createElement('button'); btn.style.cssText = 'padding:10px 14px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid #333;background:#1a1a1a;color:#ccc;display:flex;flex-direction:column;gap:4px;text-align:left;flex:1;min-width:110px;';
            const nm = document.createElement('div'); nm.textContent = preset.name; nm.style.cssText = 'font-weight:bold;color:#4a9;font-size:13px;';
            const ds = document.createElement('div'); ds.textContent = preset.desc; ds.style.cssText = 'font-size:10px;color:#888;';
            btn.appendChild(nm); btn.appendChild(ds);
            btn.onclick = () => {
              if (!confirm('[' + preset.name + '] ' + (LBL.presetApplyConfirm || '프리셋 적용?'))) return;
              settings.config = JSON.parse(JSON.stringify(defaultSettings)); Object.assign(settings.config, preset.config); settings.save();
              openPanel(m, (p) => p.addText(LBL.settingsRefreshNeeded || '새로고침 필요함.'), LBL.settingsRefreshTitle || '설정 갱신 필요');
            };
            row.appendChild(btn);
          }
          nd.appendChild(row);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow(LBL.enabledTitle || '설정 정보 자동 삽입', LBL.enabledDesc || '대화에 필요한 설정 자동 삽입.', settings.config.enabled, (v) => { settings.config.enabled = v; settings.save(); }));

          nd.appendChild(C.createToggleRow(LBL.compressionTitle || '자동 압축', LBL.compressionDesc || '입력 공간 부족하면 설정 문장 자동 압축.', settings.config.useCompressedFormat !== false, (v) => { settings.config.useCompressedFormat = v; settings.save(); }));
          const cmpWrap = document.createElement('div'); cmpWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-left:10px;';
          const cmpLbl = document.createElement('div'); cmpLbl.textContent = LBL.compressionMode || '압축 방식'; cmpLbl.style.cssText = 'font-size:12px;color:#aaa;';
          const cmpSel = document.createElement('select'); cmpSel.style.cssText = 'width:120px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;';
          [{v:'auto', l:'자동 (예산 맞춤)'}, {v:'full', l:'전체 표시 (Full)'}, {v:'compact', l:'요약 (Compact)'}, {v:'micro', l:'최소 (Micro)'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; cmpSel.appendChild(opt); });
          cmpSel.value = settings.config.compressionMode || 'auto';
          cmpSel.onchange = () => { settings.config.compressionMode = cmpSel.value; settings.save(); };
          cmpWrap.appendChild(cmpLbl); cmpWrap.appendChild(cmpSel); nd.appendChild(cmpWrap);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = LBL.searchSection || '검색과 감지'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(t);
          nd.appendChild(C.createToggleRow(LBL.embeddingSearchTitle || '의미 기반 검색', LBL.embeddingSearchDesc || '단어가 달라도 비슷한 설정 찾음.', settings.config.embeddingEnabled, (v) => { settings.config.embeddingEnabled = v; settings.save(); }));
          const emRow = document.createElement('div'); emRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
          const emL = document.createElement('div'); emL.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const eml1 = document.createElement('div'); eml1.textContent = LBL.embeddingModel || '의미 검색 모델'; eml1.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          emL.appendChild(eml1);
          const emSel = document.createElement('select'); emSel.style.cssText = 'width:200px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'gemini-embedding-001',l:'gemini-embedding-001'},{v:'gemini-embedding-2-preview',l:'gemini-embedding-2-preview'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; emSel.appendChild(opt); });
          emSel.value = settings.config.embeddingModel || 'gemini-embedding-001';
          emSel.onchange = () => { settings.config.embeddingModel = emSel.value; settings.save(); alert(LBL.modelChangedRegenNeeded || '모델 변경됨. 기존 검색 데이터 재생성 필요.'); };
          emRow.appendChild(emL); emRow.appendChild(emSel); nd.appendChild(emRow);

          nd.appendChild(C.createToggleRow(LBL.autoEmbeddingTitle || '검색 데이터 자동 갱신', LBL.autoEmbeddingDesc || '대화에서 설정 찾은 뒤 검색 데이터 갱신.', settings.config.autoEmbedOnExtract !== false, (v) => { settings.config.autoEmbedOnExtract = v; settings.save(); }));
          nd.appendChild(C.createToggleRow(LBL.decayTitle || '오래된 설정 다시 확인', LBL.decayDesc || '오래 안 나온 설정도 필요하면 다시 넣음.', settings.config.decayEnabled, (v) => { settings.config.decayEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow(LBL.rerankTitle || '검색 결과 다시 고르기', LBL.rerankDesc || 'AI가 검색 결과 한 번 더 골라 정확도 높임.', settings.config.rerankEnabled || false, (v) => { settings.config.rerankEnabled = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;';
          const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const t = document.createElement('div'); t.textContent = LBL.insertPositionTitle || '삽입 위치'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const d = document.createElement('div'); d.textContent = LBL.insertPositionDesc || '내 메시지 기준 설정 넣을 위치.'; d.style.cssText = 'font-size:11px;color:#888;';
          left.appendChild(t); left.appendChild(d);
          const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;';
          const b1 = document.createElement('button'), b2 = document.createElement('button');
          const updateBtns = () => { const isB = settings.config.position === 'before'; b1.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${isB ? '#285' : '#444'};background:${isB ? '#285' : 'transparent'};color:${isB ? '#fff' : '#ccc'};`; b2.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!isB ? '#285' : '#444'};background:${!isB ? '#285' : 'transparent'};color:${!isB ? '#fff' : '#ccc'};`; };
          b1.textContent = LBL.insertBefore || '메시지 앞'; b1.onclick = () => { settings.config.position = 'before'; settings.save(); updateBtns(); };
          b2.textContent = LBL.insertAfter || '메시지 뒤'; b2.onclick = () => { settings.config.position = 'after'; settings.save(); updateBtns(); };
          updateBtns(); right.appendChild(b1); right.appendChild(b2); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const tr = document.createElement('div'); tr.textContent = LBL.extraInfoSection || '추가 정보'; tr.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(tr);
          nd.appendChild(C.createToggleRow(LBL.honorificTitle || '호칭 정보', LBL.honorificDesc || '등장인물 사이 호칭 짧게 정리해서 전달.', settings.config.honorificMatrixEnabled !== false, (v) => { settings.config.honorificMatrixEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow(LBL.continuityTitle || '관계 흐름 확인', LBL.continuityDesc || '처음 만남, 재회, 호칭 변화 같은 흐름 함께 확인.', settings.config.firstEncounterWarning !== false, (v) => { settings.config.firstEncounterWarning = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t1 = document.createElement('div'); t1.textContent = LBL.outputFormat || '삽입 문장 형식'; t1.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(t1);
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
          const resetBtn = document.createElement('button'); resetBtn.textContent = LBL.resetSettings || '모든 설정 초기화 (저장된 설정 묶음은 유지)'; resetBtn.style.cssText = 'width:100%;padding:10px;margin-top:20px;background:#833;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;';
          resetBtn.onclick = () => { if (confirm(LBL.resetSettingsConfirm || '설정 초기화?')) { _ls.removeItem('lore-injector-v5'); location.reload(); } }; nd.appendChild(resetBtn);
        }});
      }, LBL.mainSettings || '기본 설정');
    })
    .createSubMenu(LBL.loreListMenu || '설정 목록', (m) => {
      const renderPanel = async (panel) => {
        const _url = C.getCurUrl(); const activePacks = settings.config.urlPacks?.[_url] || [];
        if (!activePacks.length) { panel.addText(LBL.activePackEmpty || '활성화된 파일 없음. 파일 관리에서 사용할 파일 켜기.'); return; }
        const entries = await db.entries.toArray();
        const filtered = entries.filter(e => activePacks.includes(e.packName));
        if (!filtered.length) { panel.addText(LBL.activeEntryEmpty || '사용할 수 있는 항목 없음.'); return; }
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
                openPanel(m, renderPanel, LBL.loreListPanelTitle || '설정 목록 관리');
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
              const updateEmbStatus = async () => { try { const emb = await db.embeddings.where({entryId: e.id, field: 'summary'}).first() || await db.embeddings.where('entryId').equals(e.id).first(); if (emb) { let h=0; const s = e.embed_text ? (e.name+' '+e.embed_text) : (e.name+': '+(e.summary||'')); for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0; const ch=h.toString(36); const targetModel = settings.config.embeddingModel || 'gemini-embedding-001'; if(emb.hash===ch){ const needsRegen=(emb.model && emb.model !== targetModel) || (emb.taskType!=='RETRIEVAL_DOCUMENT'&&targetModel.includes('embedding-001')); if(needsRegen){embStatusSpan.textContent=LBL.embeddingNeedsRegen || '다시 생성 필요';embStatusSpan.style.background='#3a3a1a';embStatusSpan.style.color='#d96';}else{embStatusSpan.textContent=LBL.embeddingReady || '검색 준비됨';embStatusSpan.style.background='#1a3a2a';embStatusSpan.style.color='#4a9';} }else{embStatusSpan.textContent=LBL.embeddingChanged || '내용 변경됨';embStatusSpan.style.background='#3a3a1a';embStatusSpan.style.color='#d96';} }else{embStatusSpan.textContent=LBL.embeddingMissing || '검색 데이터 없음';embStatusSpan.style.background='#2a2a2a';embStatusSpan.style.color='#888';} }catch(ex){} };
              updateEmbStatus();
              nameSpan.appendChild(embStatusSpan); left.appendChild(swWrap); left.appendChild(nameSpan);

              const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;';
              const B = 'font-size:11px;padding:3px 8px;border-radius:3px;background:transparent;border:1px solid #555;color:#ccc;cursor:pointer;';
              const embGenBtn = document.createElement('button'); embGenBtn.textContent = LBL.embeddingAction || '검색 데이터'; embGenBtn.style.cssText = B + 'color:#4a9;border-color:#264;';
              embGenBtn.onclick = async (ev) => { ev.stopPropagation(); embGenBtn.disabled = true; embGenBtn.textContent = LBL.embeddingProcessing || '생성 중'; try { await C.ensureEmbedding(e, { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }); embGenBtn.textContent = LBL.doneText || '완료'; updateEmbStatus(); } catch (err) { embGenBtn.textContent = LBL.failedText || '실패'; alert((LBL.failedText || '실패') + ': ' + err.message); } setTimeout(() => { embGenBtn.textContent = LBL.embeddingAction || '검색 데이터'; embGenBtn.disabled = false; }, 1500); };
              const copyBtn = document.createElement('button'); copyBtn.textContent = LBL.copyAction || '복사'; copyBtn.style.cssText = B + 'color:#4a9;border-color:#264;'; copyBtn.onclick = (ev) => { ev.stopPropagation(); const clean = {...e}; delete clean.id; delete clean.packName; delete clean.project; delete clean.enabled; navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(() => alert(LBL.copyDone || '복사됨.')).catch(() => alert(LBL.copyFailed || '복사 실패.')); };
              const editBtn = document.createElement('button'); editBtn.textContent = LBL.editAction || '수정'; editBtn.style.cssText = B + 'color:#88c;border-color:#446;';
              const delBtn = document.createElement('button'); delBtn.textContent = LBL.deleteAction || '삭제'; delBtn.style.cssText = B + 'color:#a55;border-color:#633;';
              const histBtn = document.createElement('button'); histBtn.textContent = LBL.historyAction || '이력'; histBtn.style.cssText = B + 'color:#da8;border-color:#642;';
              const anchorBtn = document.createElement('button');
              const _renderAnchor = () => { const on = !!e.anchor; anchorBtn.textContent = on ? (LBL.anchorOn || '고정됨') : (LBL.anchorOff || '고정'); anchorBtn.title = on ? (LBL.anchorOnTitle || '고정 해제.') : (LBL.anchorOffTitle || '자동 정리 중 덮어쓰지 않게 고정.'); anchorBtn.style.cssText = B + (on ? 'color:#fc4;border-color:#963;background:#2a1a00;' : 'color:#777;border-color:#444;'); };
              _renderAnchor();
              anchorBtn.onclick = async (ev) => { ev.stopPropagation(); e.anchor = !e.anchor; try { await db.entries.put(e); _renderAnchor(); } catch(err) { alert((LBL.anchorToggleFailed || '고정 변경 실패') + ': ' + err.message); e.anchor = !e.anchor; _renderAnchor(); } };
              right.appendChild(embGenBtn); right.appendChild(copyBtn); right.appendChild(histBtn); right.appendChild(anchorBtn); right.appendChild(editBtn); right.appendChild(delBtn);
              header.appendChild(left); header.appendChild(right); row.appendChild(header);

              // 버전 이력 패널 (append-only 백업 조회/복원)
              const historyContainer = document.createElement('div');
              historyContainer.style.cssText = 'display:none;margin-top:8px;padding:8px;background:#0a0a0a;border:1px solid #222;border-radius:4px;';
              histBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (historyContainer.style.display !== 'none') { historyContainer.style.display = 'none'; return; }
                historyContainer.innerHTML = '<div style="font-size:11px;color:#888;">' + (LBL.loadingText || '불러오는 중') + '...</div>';
                historyContainer.style.display = 'block';
                try {
                  if (!C.getEntryVersions) { historyContainer.innerHTML = '<div style="font-size:11px;color:#d66;">' + (LBL.versionHistoryUnavailable || '버전 이력 기능 로드 실패. 페이지 새로고침 필요.') + '</div>'; return; }
                  const versions = await C.getEntryVersions(e.id);
                  if (!versions || !versions.length) { historyContainer.innerHTML = '<div style="font-size:11px;color:#888;">' + (LBL.noVersionHistory || '저장된 버전 없음. 다음 변경부터 기록됨.') + '</div>'; return; }
                  historyContainer.innerHTML = '';
                  const hdr = document.createElement('div'); hdr.textContent = versions.length + (LBL.versionCountSuffix || '개 버전 (최신순)'); hdr.style.cssText = 'font-size:11px;color:#da8;margin-bottom:6px;font-weight:bold;'; historyContainer.appendChild(hdr);
                  for (const v of versions) {
                    const vrow = document.createElement('div'); vrow.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;padding:4px 0;border-bottom:1px dashed #222;gap:8px;';
                    const info = document.createElement('div'); info.style.cssText = 'font-size:11px;color:#aaa;flex:1;min-width:0;';
                    const sumPrev = (v.snapshot && v.snapshot.summary) ? String(v.snapshot.summary).slice(0, 80) : '';
                    const stPrev = (v.snapshot && (v.snapshot.state || v.snapshot.detail?.current_status)) ? ' / state: ' + (v.snapshot.state || v.snapshot.detail?.current_status) : '';
                    info.innerHTML = '<span style="color:#ccc;">' + new Date(v.ts).toLocaleString() + '</span> <span style="color:#69b;">[' + (v.reason||'auto') + ']</span><br><span style="font-size:10px;color:#888;word-break:break-all;">' + (sumPrev || (LBL.summaryMissing || '(요약 없음)')) + stPrev + '</span>';
                    const vbtns = document.createElement('div'); vbtns.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';
                    const resBtn = document.createElement('button'); resBtn.textContent = LBL.restoreAction || '복원'; resBtn.style.cssText = 'padding:3px 8px;font-size:10px;border-radius:3px;background:#258;color:#fff;border:none;cursor:pointer;';
                    resBtn.onclick = async (ev2) => {
                      ev2.stopPropagation();
                      if (!confirm(LBL.restoreVersionConfirm || '이 버전으로 복원? 현재 상태 자동 백업됨.')) return;
                      try { const restored = await C.restoreEntryVersion(v.id); Object.assign(e, restored); nameSpan.textContent = '[' + e.type + '] ' + e.name; nameSpan.appendChild(embStatusSpan); alert(LBL.restoreDone || '복원됨.'); historyContainer.style.display = 'none'; }
                      catch(err) { alert((LBL.failedText || '실패') + ': ' + err.message); }
                    };
                    vbtns.appendChild(resBtn);
                    vrow.appendChild(info); vrow.appendChild(vbtns); historyContainer.appendChild(vrow);
                  }
                } catch(err) { historyContainer.innerHTML = '<div style="font-size:11px;color:#d66;">' + (LBL.errorPrefix || '오류') + ': ' + err.message + '</div>'; }
              };
              row.appendChild(historyContainer);

              const editContainer = document.createElement('div'); editContainer.style.cssText = 'display:none;margin-top:8px;flex-direction:column;gap:8px;';
              const ta = document.createElement('textarea'); ta.style.cssText = 'width:100%;height:200px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;';
              const editableObj = {...e}; delete editableObj.id; delete editableObj.packName; delete editableObj.project; delete editableObj.enabled; ta.value = JSON.stringify(editableObj, null, 2);
              const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;';
              const saveBtn = document.createElement('button'); saveBtn.textContent = LBL.saveAction || '저장'; saveBtn.style.cssText = B + 'background:#285;border-color:#285;color:#fff;';
              const cancelBtn = document.createElement('button'); cancelBtn.textContent = LBL.closeAction || '닫기'; cancelBtn.style.cssText = B;
              btnRow.appendChild(cancelBtn); btnRow.appendChild(saveBtn); editContainer.appendChild(ta); editContainer.appendChild(btnRow); row.appendChild(editContainer);

              const toggleEdit = () => { editContainer.style.display = editContainer.style.display === 'none' ? 'flex' : 'none'; };
              nameSpan.onclick = toggleEdit; editBtn.onclick = toggleEdit; cancelBtn.onclick = toggleEdit;
              saveBtn.onclick = async () => { try { const parsed = JSON.parse(ta.value); const updated = {...e, ...parsed}; await db.entries.put(updated); alert(LBL.editDone || '수정됨.'); Object.assign(e, updated); nameSpan.textContent = '[' + updated.type + '] ' + updated.name; nameSpan.appendChild(embStatusSpan); updateEmbStatus(); toggleEdit(); } catch (err) { alert((LBL.jsonErrorPrefix || 'JSON 오류') + ': ' + err.message); } };
              delBtn.onclick = async () => { if (confirm('[' + e.name + '] ' + (LBL.deleteEntryConfirm || '삭제?'))) { await db.entries.delete(e.id); try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(ex){} const count = await db.entries.where('packName').equals(e.packName).count(); await db.packs.update(e.packName, { entryCount: count }); row.remove(); title.textContent = pk + ' (' + count + '개)'; } };
              listContainer.appendChild(row);
            }
            nd.appendChild(listContainer);
          }});
        }
      };
      openPanel(m, renderPanel, LBL.loreListPanelTitle || '설정 목록 관리');
    })
    .createSubMenu(LBL.loreMergeMenu || '중복 설정 정리', (m) => {
      const renderMerge = async (panel) => {
        const state = _w.__loreMergeState || (_w.__loreMergeState = { threshold: 0.88, maxChars: 1200, groups: null });

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = LBL.mergeTitle || '중복 설정 병합'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:4px;'; nd.appendChild(t);
          const d = document.createElement('div'); d.innerHTML = (LBL.mergeDesc || '검색 데이터 유사도로 중복 후보를 찾고, 그룹별로 직접 확인한 뒤 병합. 핵심 정보 보존, 글자수 상한, 타입 경고 적용.') + '<br><span style="color:#da8;">' + (LBL.mergeScopeNote || '현재 페이지에서 켠 파일 항목만 대상. 다른 페이지나 꺼진 파일은 건드리지 않음.') + '</span>'; d.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.5;'; nd.appendChild(d);

          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px;margin-bottom:8px;align-items:center;';
          const mk = (label, getter, setter, min, max, step) => {
            const f = document.createElement('div'); f.style.flex = '1';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; i.value = getter(); i.min = min; i.max = max; i.step = step;
            i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            i.onchange = () => { const v = parseFloat(i.value); if (!isNaN(v)) setter(v); };
            f.appendChild(l); f.appendChild(i); return f;
          };
          row.appendChild(mk(LBL.mergeThresholdLabel || '유사도 기준', () => state.threshold, v => state.threshold = v, 0.7, 0.99, 0.01));
          row.appendChild(mk(LBL.mergeMaxCharsLabel || '최대 글자수', () => state.maxChars, v => state.maxChars = v, 200, 3000, 50));
          nd.appendChild(row);

          const runBtn = document.createElement('button'); runBtn.textContent = LBL.mergeFindCandidates || '병합 후보 찾기';
          runBtn.style.cssText = 'width:100%;padding:10px;background:#258;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;';
          const runStatus = document.createElement('div'); runStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;';
          runBtn.onclick = async () => {
            runBtn.disabled = true; runBtn.textContent = (LBL.mergeSearching || '검색 중') + '...';
            try {
              const _url = C.getCurUrl(); const activePacks = settings.config.urlPacks?.[_url] || [];
              const entries = (await db.entries.toArray()).filter(e => activePacks.includes(e.packName));
              if (entries.length < 2) { runStatus.textContent = LBL.mergeTooFewActive || '활성 항목 2개 미만.'; runStatus.style.color = '#d66'; return; }
              const embs = await db.embeddings.where('entryId').anyOf(entries.map(e => e.id)).toArray();
              const embMap = {}; for (const eb of embs) if (eb.field === 'summary') embMap[eb.entryId] = eb.vector;
              const withEmb = entries.filter(e => embMap[e.id]);
              if (withEmb.length < 2) { runStatus.textContent = LBL.mergeTooFewEmbeddings || '검색 데이터 있는 항목 2개 미만. 파일 관리에서 검색 데이터 먼저 생성 필요.'; runStatus.style.color = '#d66'; return; }
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
              runStatus.textContent = groups.length > 0 ? '후보 ' + groups.length + '개 ' + (LBL.mergeGroupsFound || '그룹 발견.') : (LBL.mergeNoCandidates || '기준 이상 후보 없음.');
              runStatus.style.color = groups.length > 0 ? '#4a9' : '#888';
              openPanel(m, renderMerge, LBL.loreMergePanelTitle || '중복 설정 정리');
            } catch(e) { runStatus.textContent = (LBL.failedText || '실패') + ': ' + e.message; runStatus.style.color = '#d66'; }
            runBtn.textContent = LBL.mergeFindCandidates || '병합 후보 찾기'; runBtn.disabled = false;
          };
          nd.appendChild(runBtn); nd.appendChild(runStatus);

          // 일괄 모드 변경 (모든 그룹 select에 동시 적용)
          const bulkRow = document.createElement('div'); bulkRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:10px;padding:8px;background:#111;border:1px solid #333;border-radius:4px;';
          const bulkLbl = document.createElement('div'); bulkLbl.textContent = LBL.mergeBulkMode || '일괄 모드'; bulkLbl.style.cssText = 'font-size:11px;color:#888;white-space:nowrap;';
          const bulkSel = document.createElement('select'); bulkSel.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;';
          [['', LBL.mergeBulkPlaceholder || '모든 그룹에 적용할 방식 선택'], ['keep-longest', LBL.mergeKeepLongest || '가장 긴 항목 유지 + 키워드 합치기'], ['llm-summarize', LBL.mergeLlmSummarize || 'AI 요약 병합']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; bulkSel.appendChild(o); });
          bulkSel.onchange = () => { if (!bulkSel.value) return; const sels = document.querySelectorAll('select.lore-merge-mode-sel'); sels.forEach(s => { s.value = bulkSel.value; }); bulkSel.value = ''; };
          bulkRow.appendChild(bulkLbl); bulkRow.appendChild(bulkSel); nd.appendChild(bulkRow);

          if (C.__lastMergeUndo && C.__lastMergeUndo.originals && C.__lastMergeUndo.originals.length) {
            const undoBtn = document.createElement('button'); undoBtn.textContent = (LBL.mergeUndo || '직전 병합 취소') + ' (' + C.__lastMergeUndo.originals.length + '개 항목 복원)';
            undoBtn.style.cssText = 'width:100%;padding:8px;margin-top:10px;background:transparent;color:#da8;border:1px solid #642;border-radius:4px;cursor:pointer;font-size:12px;';
            undoBtn.onclick = async () => {
              if (!confirm(LBL.mergeUndoConfirm || '직전 병합 취소하고 원본 항목 복원?')) return;
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
                alert(LBL.mergeRestored || '복원 완료.');
                openPanel(m, renderMerge, LBL.loreMergePanelTitle || '중복 설정 정리');
              } catch(e) { alert((LBL.failedText || '실패') + ': ' + e.message); }
            };
            nd.appendChild(undoBtn);
          }
        }});

        if (!state.groups) return;
        if (state.groups.length === 0) { panel.addText(LBL.mergeNoGroups || '후보 없음. 기준을 낮춰 재시도 가능.'); return; }

        for (const [gi, grp] of state.groups.entries()) {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            nd.style.cssText += 'background:#1a1a1a;border:1px solid #333;border-radius:6px;margin-bottom:12px;padding:10px;';
            const hdr = document.createElement('div'); hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;';
            const title = document.createElement('div'); title.textContent = (LBL.mergeGroupLabel || '그룹') + ' ' + (gi + 1) + ' — ' + grp.entries.length + '개 / ' + (LBL.similarityLabel || '유사도') + ' ' + (grp.sim * 100).toFixed(1) + '%';
            title.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;';
            const types = [...new Set(grp.entries.map(e => e.type))];
            const typeWarn = types.length > 1 ? (LBL.typeMismatchPrefix || '타입 불일치') + ': ' + types.join(', ') : (LBL.typeLabelPrefix || '타입') + ': ' + types[0];
            const warn = document.createElement('div'); warn.textContent = typeWarn; warn.style.cssText = 'font-size:10px;color:' + (types.length > 1 ? '#d96' : '#888') + ';';
            hdr.appendChild(title); hdr.appendChild(warn); nd.appendChild(hdr);

            if (types.length > 1) {
              const typeNote = document.createElement('div');
              typeNote.style.cssText = 'margin-bottom:8px;padding:6px 8px;background:#2a1a0a;border:1px solid #642;border-radius:4px;font-size:10px;color:#da8;line-height:1.5;';
              typeNote.innerHTML = '<b>' + (LBL.mergeTypeRiskTitle || '타입 다를 때 영향') + '</b><br>' + (LBL.mergeTypeRiskDesc || '주제별 분류가 흐려질 수 있음. 키워드가 뒤섞이면 관련 없는 상황에서 항목이 들어갈 수 있음. 병합 후 한쪽 타입으로 고정되므로 필요한 경우에만 진행.');
              nd.appendChild(typeNote);
            }

            for (const e of grp.entries) {
              const row = document.createElement('div'); row.style.cssText = 'padding:6px 0;border-bottom:1px dashed #222;font-size:11px;color:#aaa;';
              const safeSum = String(e.summary || (LBL.summaryMissing || '(요약 없음)')).slice(0, 150).replace(/</g, '&lt;');
              row.innerHTML = '<span style="color:#ccc;font-weight:bold;">[' + e.type + '] ' + e.name + '</span> <span style="color:#888;">(' + e.packName + ')</span>' + (e.anchor ? ' <span style="color:#fc4;">' + (LBL.anchoredLabel || '고정됨') + '</span>' : '') + '<br><span style="font-size:10px;">' + safeSum + '</span>';
              nd.appendChild(row);
            }

            const ctrl = document.createElement('div'); ctrl.style.cssText = 'margin-top:10px;display:flex;gap:8px;align-items:center;';
            const modeSel = document.createElement('select'); modeSel.className = 'lore-merge-mode-sel'; modeSel.style.cssText = 'padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;flex:1;';
            [['keep-longest', LBL.mergeKeepLongest || '가장 긴 항목 유지 + 키워드 합치기'], ['llm-summarize', LBL.mergeLlmSummarize || 'AI 요약 병합']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; modeSel.appendChild(o); });
            const previewBtn = document.createElement('button'); previewBtn.textContent = LBL.mergePreview || '미리보기'; previewBtn.style.cssText = 'padding:6px 12px;font-size:11px;border-radius:4px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
            const execBtn = document.createElement('button'); execBtn.textContent = LBL.mergeRun || '병합 실행'; execBtn.style.cssText = 'padding:6px 12px;font-size:11px;border-radius:4px;background:#285;border:none;color:#fff;cursor:pointer;font-weight:bold;';
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
                '원칙:\n' +
                '1. 핵심 정보는 누락하지 않는다 (이름/별칭/관계/상태/약속 등)\n' +
                '2. 불필요한 반복·수식어는 제거한다\n' +
                '3. summary는 ' + state.maxChars + '자 이내로 반드시 압축한다\n' +
                '4. triggers는 필수 키워드만 유지 (최대 8개, 중복 제거)\n' +
                '5. detail은 서로 다른 하위 정보를 통합 (동일 키 충돌 시 더 구체적인 것 우선)\n' +
                '6. type은 가장 구체적인 것 유지\n' +
                '7. 출력은 순수 JSON 객체 하나만. 코드펜스·설명·마크다운 금지.\n\n' +
                '입력:\n' + JSON.stringify(clean, null, 2);
              const res = await C.callGeminiApi(prompt, {
                apiType: settings.config.autoExtApiType || 'key',
                key: settings.config.autoExtKey,
                vertexJson: settings.config.autoExtVertexJson,
                vertexLocation: settings.config.autoExtVertexLocation || 'global',
                vertexProjectId: settings.config.autoExtVertexProjectId,
                firebaseScript: settings.config.autoExtFirebaseScript,
                model: settings.config.autoExtModel,
                maxRetries: 2
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
              preview.style.display = 'block';
              preview.textContent = (LBL.previewGenerating || '생성 중') + '...';
              try {
                if (modeSel.value === 'keep-longest') mergedDraft = mkKeepLongest(grp.entries);
                else mergedDraft = await mkLlmMerge(grp.entries);
                const sumLen = (mergedDraft.summary || '').length;
                const over = sumLen > state.maxChars;
                const color = over ? '#d66' : '#4a9';
                preview.innerHTML = '<div style="color:' + color + ';font-weight:bold;margin-bottom:6px;">' + (LBL.mergePreviewTitle || '병합 미리보기') + ' (summary ' + sumLen + '자' + (over ? ' — 상한(' + state.maxChars + ') 초과' : '') + ')</div><pre style="white-space:pre-wrap;margin:0;font-size:11px;color:#ccc;">' + JSON.stringify(mergedDraft, null, 2).replace(/</g, '&lt;') + '</pre>';
              } catch(e) { preview.textContent = (LBL.failedText || '실패') + ': ' + e.message; mergedDraft = null; }
            };

            previewBtn.onclick = buildPreview;

            execBtn.onclick = async () => {
              if (!mergedDraft) { await buildPreview(); if (!mergedDraft) return; }
              const sumLen = (mergedDraft.summary || '').length;
              if (sumLen > state.maxChars) {
                if (!confirm((LBL.mergeApplyingOverLimit || 'summary가 글자수 상한 초과. 그래도 적용?') + ' (' + state.maxChars + '자 기준, ' + (sumLen - state.maxChars) + '자 초과)')) return;
              }
              if (types.length > 1) {
                if (!confirm((LBL.mergeTypeMismatchConfirm || '타입이 다름. 주제 경계가 무너질 수 있음. 계속?') + ' (' + types.join(', ') + ')')) return;
              }
              if (!confirm(grp.entries.length + (LBL.mergeConfirm || '개 항목을 하나로 병합? 되돌리기 지원.'))) return;
              try {
                const originals = grp.entries.map(e => JSON.parse(JSON.stringify(e)));
                for (const e of grp.entries) { try { if (C.saveEntryVersion) await C.saveEntryVersion(e, 'pre_merge'); } catch(_){} }
                const anchored = grp.entries.find(e => e.anchor);
                const target = anchored || grp.entries[0];
                const toDelete = grp.entries.filter(e => e.id !== target.id);
                const finalEntry = { ...mergedDraft, id: target.id, packName: target.packName, project: target.project };
                await db.entries.put(finalEntry);
                for (const e of toDelete) {
                  await db.entries.delete(e.id);
                  try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(_){}
                }
                try { await db.embeddings.where('entryId').equals(target.id).delete(); } catch(_){}
                const packs = new Set(grp.entries.map(e => e.packName));
                for (const pk of packs) { const cnt = await db.entries.where('packName').equals(pk).count(); await db.packs.update(pk, { entryCount: cnt }); }
                C.__lastMergeUndo = { mergedId: target.id, originals };
                state.groups = state.groups.filter((_, i) => i !== gi);

                // 병합된 엔트리 임베딩 자동 재생성
                let embedMsg = '';
                try {
                  const apiType = settings.config.autoExtApiType || 'key';
                  const apiOpts = { apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' };
                  const hasApi = apiType === 'vertex' ? !!settings.config.autoExtVertexJson : apiType === 'firebase' ? !!settings.config.autoExtFirebaseEmbedKey : !!settings.config.autoExtKey;
                  if (hasApi) {
                    await C.ensureEmbedding(finalEntry, apiOpts);
                    embedMsg = LBL.mergeEmbeddingDone || '검색 데이터 재생성 완료.';
                  } else {
                    embedMsg = LBL.mergeEmbeddingManualNeeded || 'API 미설정 — 파일 관리에서 수동 생성 필요.';
                  }
                } catch(embErr) {
                  embedMsg = (LBL.mergeEmbeddingFailed || '검색 데이터 재생성 실패.') + ': ' + (embErr.message || embErr) + ' — 파일 관리에서 재시도 가능.';
                }
                alert((LBL.mergeComplete || '병합 완료.') + ' ' + embedMsg);
                openPanel(m, renderMerge, LBL.loreMergePanelTitle || '중복 설정 정리');
              } catch(e) { alert((LBL.failedText || '실패') + ': ' + e.message); }
            };
          }});
        }
      };
      openPanel(m, renderMerge, LBL.loreMergePanelTitle || '중복 설정 정리');
    })
    .createSubMenu(LBL.snapshotMenu || '백업 관리', (m) => {
      const renderSnapshotUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = LBL.snapshotRestoreTitle || '백업 복원'; t.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const snaps = await db.snapshots.orderBy('timestamp').reverse().toArray();
          if (!snaps.length) { nd.appendChild(Object.assign(document.createElement('div'), { textContent: LBL.snapshotEmpty || '저장된 백업 없음.', style: 'color:#888;font-size:12px;' })); return; }
          const list = document.createElement('div'); list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;';
          for (const s of snaps) {
            const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px;background:#1a1a1a;border:1px solid #333;border-radius:4px;';
            const info = document.createElement('div'); info.style.cssText = 'display:flex;flex-direction:column;';
            const sTitle = document.createElement('span'); sTitle.textContent = `[${s.packName}] ${s.label} (${s.data.length}개)`; sTitle.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;';
            const sTime = document.createElement('span'); sTime.textContent = new Date(s.timestamp).toLocaleString(); sTime.style.cssText = 'font-size:10px;color:#888;';
            info.appendChild(sTitle); info.appendChild(sTime);
            const btnWrap = document.createElement('div'); btnWrap.style.cssText = 'display:flex;gap:4px;';
            const rBtn = document.createElement('button'); rBtn.textContent = LBL.restoreAction || '복원'; rBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:#258;color:#fff;border:none;cursor:pointer;';
            rBtn.onclick = async () => { if (confirm(`[${s.packName}] ` + (LBL.snapshotRestoreConfirm || '이 시점으로 복원? 기존 데이터 덮어씀.'))) { await restoreSnapshot(s.id); alert(LBL.snapshotRestoreDone || '복원 완료.'); openPanel(m, renderSnapshotUI, LBL.snapshotPanelTitle || '백업 관리'); } };
            const dBtn = document.createElement('button'); dBtn.textContent = LBL.deleteAction || '삭제'; dBtn.style.cssText = 'padding:4px 8px;font-size:11px;border-radius:3px;background:transparent;color:#d66;border:1px solid #d66;cursor:pointer;';
            dBtn.onclick = async () => { if (confirm(LBL.snapshotDeleteConfirm || '백업 삭제?')) { await db.snapshots.delete(s.id); openPanel(m, renderSnapshotUI, LBL.snapshotPanelTitle || '백업 관리'); } };
            btnWrap.appendChild(rBtn); btnWrap.appendChild(dBtn);
            row.appendChild(info); row.appendChild(btnWrap); list.appendChild(row);
          }
          nd.appendChild(list);
        }});
      };
      openPanel(m, renderSnapshotUI, LBL.snapshotPanelTitle || '백업 관리');
    })
    .createSubMenu(LBL.fileMenu || '파일 관리', (m) => {
      const renderPackUI = async (panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div'); title.textContent = LBL.fileImportTitle || '설정 파일 가져오기'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
          const nameInput = document.createElement('input'); nameInput.placeholder = LBL.loreNamePlaceholder || '파일 이름'; nameInput.style.cssText = 'flex:1;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;'; row.appendChild(nameInput);
          const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json'; fileInput.style.display = 'none';
          const importBtn = document.createElement('button'); importBtn.textContent = LBL.importJsonFile || 'JSON 파일 가져오기'; importBtn.style.cssText = 'padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;white-space:nowrap;'; importBtn.onclick = () => fileInput.click();
          fileInput.onchange = async (ev) => {
            const file = ev.target.files[0]; if (!file) return;
            const packName = nameInput.value.trim() || file.name.replace('.json', '');
            try {
              const text = await file.text(); const data = JSON.parse(text); const arr = Array.isArray(data) ? data : [data]; let count = 0;
              for (const e of arr) { if (!e.name) continue; if (!e.triggers) e.triggers = [e.name]; e.packName = packName; e.project = settings.config.activeProject || ''; const existing = await db.entries.where('name').equals(e.name).first(); if (existing) { await db.entries.update(existing.id, e); } else { await db.entries.add(e); count++; } }
              const totalCount = await db.entries.where('packName').equals(packName).count(); let pack = await db.packs.get(packName); if (pack) await db.packs.update(packName, { entryCount: totalCount }); else await db.packs.put({ name: packName, entryCount: totalCount, project: settings.config.activeProject || '' });
              await setPackEnabled(packName, true); alert(arr.length + '개 ' + (LBL.importDone || '항목 처리 완료') + ' (' + (LBL.newItemCount || '새 항목') + ' ' + count + '개)'); openPanel(m, renderPackUI, LBL.fileMenu || '파일 관리');
            } catch (err) { alert((LBL.importFailed || '가져오기 실패.') + ': ' + err.message); } fileInput.value = '';
          };
          row.appendChild(fileInput); row.appendChild(importBtn); nd.appendChild(row);

          const manualLbl = document.createElement('div'); manualLbl.textContent = LBL.manualJsonInput || '또는 JSON 직접 입력'; manualLbl.style.cssText = 'font-size:12px;color:#888;margin:12px 0 4px;'; nd.appendChild(manualLbl);
          const manualTa = document.createElement('textarea'); manualTa.placeholder = LBL.manualJsonPlaceholder || '[{"name":"이름","triggers":["키워드"],"type":"character","summary":"설명","detail":{}}]'; manualTa.style.cssText = 'width:100%;height:100px;background:#0a0a0a;color:#ccc;border:1px solid #333;border-radius:4px;padding:8px;font-size:12px;font-family:monospace;resize:vertical;box-sizing:border-box;'; nd.appendChild(manualTa);
          const manualBtnRow = document.createElement('div'); manualBtnRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';
          const manualBtn = document.createElement('button'); manualBtn.textContent = LBL.manualAddAction || '직접 추가'; manualBtn.style.cssText = 'padding:6px 14px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:1px solid #285;font-weight:bold;';
          manualBtn.onclick = async () => {
            const pn = nameInput.value.trim() || (LBL.defaultManualPackName || '직접 추가');
            try {
              const txt = manualTa.value.trim(); if (!txt) { alert(LBL.jsonRequired || 'JSON 입력 필요.'); return; }
              const data = JSON.parse(txt); const arr = Array.isArray(data) ? data : [data]; let cnt = 0;
              for (const e of arr) { if (!e.name) continue; if (!e.triggers) e.triggers = [e.name]; e.packName = pn; e.project = settings.config.activeProject || ''; const ex = await db.entries.where('name').equals(e.name).first(); if (ex) { await db.entries.update(ex.id, e); } else { await db.entries.add(e); cnt++; } }
              const tc = await db.entries.where('packName').equals(pn).count(); let pk = await db.packs.get(pn); if (pk) await db.packs.update(pn, { entryCount: tc }); else await db.packs.put({ name: pn, entryCount: tc, project: settings.config.activeProject || '' });
              await setPackEnabled(pn, true); alert(arr.length + '개 ' + (LBL.importDone || '항목 처리 완료') + ' (' + (LBL.newItemCount || '새 항목') + ' ' + cnt + '개)'); manualTa.value = ''; openPanel(m, renderPackUI, LBL.fileMenu || '파일 관리');
            } catch (err) { alert((LBL.jsonParseFailed || 'JSON 확인 필요.') + ': ' + err.message); }
          };
          manualBtnRow.appendChild(manualBtn); nd.appendChild(manualBtnRow);
        }});

        panel.addBoxedField('', '', { onInit: async (nd) => {
          C.setFullWidth(nd);
          const packs = await db.packs.toArray();
          if (!packs.length) { const empty = document.createElement('div'); empty.textContent = LBL.registeredPackEmpty || '등록된 파일 없음.'; empty.style.cssText = 'color:#666;text-align:center;padding:20px;font-size:12px;'; nd.appendChild(empty); return; }
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
            const exportBtn = document.createElement('button'); exportBtn.textContent = LBL.exportAction || '내보내기'; exportBtn.style.cssText = B;
            exportBtn.onclick = async () => { const entries = await db.entries.where('packName').equals(pack.name).toArray(); if (!entries.length) { alert(LBL.itemEmpty || '항목 없음.'); return; } const clean = entries.map(({ id, packName, project, enabled, ...rest }) => rest); const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = pack.name + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
            const embBtn = document.createElement('button'); embBtn.textContent = LBL.embeddingAction || '검색 데이터'; embBtn.style.cssText = B + 'color:#4a9;border-color:#264;'; embBtn.onclick = async () => { const apiType = settings.config.autoExtApiType || 'key'; const miss = apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseEmbedKey : !settings.config.autoExtKey; if (miss) { alert(apiType === 'firebase' ? (LBL.embeddingApiKeyRequired || '검색 데이터 생성용 API 키 필요.') : (LBL.apiSettingRequired || 'API 설정 필요.')); return; } if (!confirm('[' + pack.name + '] ' + (LBL.packEmbeddingConfirm || '검색 데이터 생성?'))) return; embBtn.disabled = true; const orig = embBtn.textContent; try { const cnt = await C.embedPack(pack.name, { apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey, model: settings.config.embeddingModel || 'gemini-embedding-001' }, (done, total) => { embBtn.textContent = done + '/' + total; }); embBtn.textContent = (LBL.doneText || '완료') + ' ' + cnt; setTimeout(() => { embBtn.textContent = orig; embBtn.disabled = false; }, 2000); } catch (e) { embBtn.textContent = LBL.failedText || '실패'; embBtn.disabled = false; alert((LBL.failedText || '실패') + ': ' + e.message); } };
            const delBtn = document.createElement('button'); delBtn.textContent = LBL.deleteAction || '삭제'; delBtn.style.cssText = B + 'color:#a55;border-color:#633;';
            delBtn.onclick = async () => { if (!confirm('[' + pack.name + '] ' + (LBL.deleteAction || '삭제') + '?')) return; const es = await db.entries.where('packName').equals(pack.name).toArray(); for (const e of es) await db.embeddings.where('entryId').equals(e.id).delete(); await db.entries.where('packName').equals(pack.name).delete(); await db.packs.delete(pack.name); openPanel(m, renderPackUI, LBL.fileMenu || '파일 관리'); };
            actions.appendChild(exportBtn); actions.appendChild(embBtn); actions.appendChild(delBtn); header.appendChild(actions); packDiv.appendChild(header); nd.appendChild(packDiv);
          }
        }});
      };
      openPanel(m, renderPackUI, LBL.fileMenu || '파일 관리');
    })
    .createSubMenu(LBL.extractMenu || '대화 정리', (m) => {
      const renderAutoUI = (panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow(LBL.autoExtractTitle || '자동 대화 정리', LBL.autoExtractDesc || '대화를 일정 주기마다 읽고 설정 항목으로 저장.', settings.config.autoExtEnabled, (v) => { settings.config.autoExtEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow(LBL.includeDbTitle || '기존 설정 함께 확인', LBL.includeDbDesc || '이미 저장된 JSON을 함께 보내 중복 저장 줄임.', settings.config.autoExtIncludeDb, (v) => { settings.config.autoExtIncludeDb = v; settings.save(); }));
          nd.appendChild(C.createToggleRow(LBL.includePersonaTitle || '캐릭터 이름 함께 확인', LBL.includePersonaDesc || '대화 정리 때 캐릭터 이름도 함께 보내 정확도 높임.', settings.config.autoExtIncludePersona, (v) => { settings.config.autoExtIncludePersona = v; settings.save(); }));

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
          row1.appendChild(makeInput(LBL.extractTurnsLabel || '주기', 'autoExtTurns', 8)); row1.appendChild(makeInput(LBL.extractRangeLabel || '범위', 'autoExtScanRange', 6)); row1.appendChild(makeInput(LBL.extractOffsetLabel || '오프셋', 'autoExtOffset', 5));
          nd.appendChild(row1);

          const row2 = document.createElement('div'); row2.style.cssText = 'display:flex;gap:12px;margin-bottom:12px;align-items:center;';
          const f3 = document.createElement('div'); f3.style.flex = '1';
          const l3 = document.createElement('div'); l3.textContent = LBL.extractPackNameLabel || '저장 파일 이름'; l3.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
          const inputWrap = document.createElement('div'); inputWrap.style.cssText = 'display:flex;gap:6px;';
          const i3 = document.createElement('input'); i3.type = 'text';
          getAutoExtPackForUrl(C.getCurUrl()).then(name => i3.value = name);
          i3.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
          const savePackName = () => { const val = i3.value || '자동추출'; settings.config.autoExtPack = val; setAutoExtPackForUrl(C.getCurUrl(), val); };
          i3.oninput = savePackName; i3.onchange = savePackName;
          const s3 = document.createElement('select'); s3.style.cssText = 'width:100px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          db.packs.toArray().then(packs => { const opt = document.createElement('option'); opt.value = ''; opt.textContent = LBL.selectExistingPack || '기존 파일 선택'; s3.appendChild(opt); packs.forEach(p => { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; s3.appendChild(o); }); });
          s3.onchange = () => { if (s3.value) { i3.value = s3.value; settings.config.autoExtPack = s3.value; setAutoExtPackForUrl(C.getCurUrl(), s3.value); s3.value = ''; } };
          inputWrap.appendChild(i3); inputWrap.appendChild(s3); f3.appendChild(l3); f3.appendChild(inputWrap);
          row2.appendChild(f3); nd.appendChild(row2);

          const btnRun = document.createElement('button'); btnRun.textContent = LBL.manualExtractRun || '수동 정리 실행';
          btnRun.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;width:100%;margin-top:10px;';
          const btnStatus = document.createElement('div'); btnStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.4;'; btnStatus.textContent = '';
          btnRun.onclick = async () => {
            if (!confirm(LBL.manualExtractConfirm || '수동 정리 시작?')) return;
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
          const bTitle = document.createElement('div'); bTitle.textContent = LBL.batchExtractTitle || '전체 대화 일괄 정리'; bTitle.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;'; nd.appendChild(bTitle);
          const bDesc = document.createElement('div'); bDesc.textContent = LBL.batchExtractDesc || '긴 기존 대화를 나눠 한 번에 정리. API 비용 큼 — 초기 이동용.'; bDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;'; nd.appendChild(bDesc);

          const bRow = document.createElement('div'); bRow.style.cssText = 'display:flex;gap:12px;margin-bottom:8px;align-items:center;';
          const mkNum = (label, getter, setter, defaultVal) => {
            const f = document.createElement('div'); f.style.flex = '1';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; const cur = getter(); i.value = (cur !== undefined && cur !== null) ? cur : defaultVal;
            i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            const save = () => { const v = parseInt(i.value); if (!isNaN(v)) { setter(v); settings.save(); } };
            i.oninput = save; i.onchange = save;
            f.appendChild(l); f.appendChild(i); return f;
          };
          bRow.appendChild(mkNum(LBL.batchTurnsLabel || '배치 크기', () => settings.config.batchExtTurnsPerBatch, v => settings.config.batchExtTurnsPerBatch = v, 50));
          bRow.appendChild(mkNum(LBL.batchOverlapLabel || '겹침', () => settings.config.batchExtOverlap, v => settings.config.batchExtOverlap = v, 5));
          bRow.appendChild(mkNum(LBL.batchRetryLabel || '재시도', () => settings.config.batchExtMaxAttempts, v => settings.config.batchExtMaxAttempts = v, 3));
          nd.appendChild(bRow);

          const bBtn = document.createElement('button'); bBtn.textContent = LBL.batchExtractRun || '전체 일괄 정리 실행';
          bBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:none;font-weight:bold;width:100%;margin-top:6px;';
          const bStatus = document.createElement('div'); bStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;';
          bBtn.onclick = async () => {
            if (!confirm(LBL.batchExtractConfirm || '전체 대화를 배치로 나눠 분석. API 비용 큼. 계속?')) return;
            settings.save();
            bBtn.disabled = true; const orig = bBtn.textContent; bBtn.textContent = (LBL.batchRunning || '실행 중') + '...';
            bStatus.textContent = LBL.batchLoadingLogs || '전체 대화 가져오는 중'; bStatus.style.color = '#4a9';
            const start = Date.now();
            try {
              const report = await _w.__LoreInj.runBatchExtract({
                turnsPerBatch: settings.config.batchExtTurnsPerBatch || 50,
                overlap: settings.config.batchExtOverlap !== undefined ? settings.config.batchExtOverlap : 5,
                maxAttempts: settings.config.batchExtMaxAttempts || 3,
                onProgress: (ev) => {
                  const sec = Math.floor((Date.now() - start) / 1000);
                  if (ev.phase === 'batch') bStatus.textContent = (LBL.batchProcessing || '배치 처리 중') + ' ' + ev.index + '/' + ev.total + ' (' + sec + '초)';
                }
              });
              const sec = Math.floor((Date.now() - start) / 1000);
              let msg = (LBL.batchDone || '완료') + ' (' + sec + '초) — ' + report.totalBatches + '개 배치 / 성공 ' + report.ok + ' / 빈 ' + report.empty + ' / 실패 ' + report.failed + ' / 병합 ' + report.entriesAdded + '건';
              if (report.failed > 0) { msg += ' / ' + (LBL.batchFailedDetail || '실패 상세는 로그 탭'); bStatus.style.color = '#da8'; }
              else { bStatus.style.color = '#4a9'; }
              bStatus.textContent = msg;
            } catch(e) {
              bStatus.textContent = (LBL.failedText || '실패') + ' — ' + (e.message || String(e)).slice(0, 80);
              bStatus.style.color = '#d66';
            } finally {
              bBtn.textContent = orig; bBtn.disabled = false;
            }
          };
          nd.appendChild(bBtn);
          nd.appendChild(bStatus);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const tplHeader = document.createElement('div'); tplHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
          const tplTitle = document.createElement('div'); tplTitle.textContent = LBL.templateManagerTitle || '프롬프트 템플릿 관리'; tplTitle.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;';
          const newTplBtn = document.createElement('button'); newTplBtn.textContent = LBL.newTemplateAction || '새 템플릿'; newTplBtn.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:3px;background:#258;border:none;color:#fff;cursor:pointer;';
          tplHeader.appendChild(tplTitle); tplHeader.appendChild(newTplBtn); nd.appendChild(tplHeader);

          const tplSelectWrap = document.createElement('div'); tplSelectWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:center;';
          const tplSelect = document.createElement('select'); tplSelect.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          const tplRenameBtn = document.createElement('button'); tplRenameBtn.textContent = LBL.templateRenameAction || '이름 변경'; tplRenameBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
          const tplDelBtn = document.createElement('button'); tplDelBtn.textContent = LBL.deleteAction || '삭제'; tplDelBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #d66;color:#d66;cursor:pointer;';
          const tplResetBtn = document.createElement('button'); tplResetBtn.textContent = LBL.templateResetAction || '초기화'; tplResetBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #285;color:#4a9;cursor:pointer;margin-left:auto;';

          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;font-family:monospace;resize:vertical;';
          const lblSchema = document.createElement('div'); lblSchema.textContent = LBL.schemaJsonLabel || '스키마 (JSON)'; lblSchema.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(lblSchema);
          const taSchema = document.createElement('textarea'); taSchema.style.cssText = S + 'height:150px;'; nd.appendChild(taSchema);
          const lbl1 = document.createElement('div'); lbl1.textContent = LBL.promptWithoutDbLabel || '프롬프트 (기존 설정 미포함)'; lbl1.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(lbl1);
          const ta1 = document.createElement('textarea'); ta1.style.cssText = S + 'height:150px;'; nd.appendChild(ta1);
          const lbl2 = document.createElement('div'); lbl2.textContent = LBL.promptWithDbLabel || '프롬프트 (기존 설정 포함)'; lbl2.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(lbl2);
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

          newTplBtn.onclick = () => { const name = prompt(LBL.templateNewNamePrompt || '새 템플릿 이름:'); if (!name) return; const newId = 'tpl_' + Date.now(); const active = settings.getActiveTemplate(); settings.config.templates.push({ id: newId, name, isDefault: false, schema: active.schema, promptWithoutDb: active.promptWithoutDb, promptWithDb: active.promptWithDb }); settings.config.activeTemplateId = newId; settings.save(); renderTplOptions(); };
          tplResetBtn.onclick = () => {
            const activeTpl = settings.getActiveTemplate();
            if (activeTpl.isDefault) { alert(LBL.templateDefaultReadonly || '기본 템플릿 수정 불가 — 초기화 불필요.'); return; }
            if (confirm(`[${activeTpl.name}] ` + (LBL.templateResetConfirm || '템플릿을 기본 내용으로 초기화?'))) {
              const defaultTpl = (settings.config.templates || []).find(t => t.isDefault);
              if (defaultTpl) {
                const idx = settings.config.templates.findIndex(t => t.id === activeTpl.id);
                if (idx !== -1) {
                  settings.config.templates[idx].schema = defaultTpl.schema;
                  settings.config.templates[idx].promptWithoutDb = defaultTpl.promptWithoutDb;
                  settings.config.templates[idx].promptWithDb = defaultTpl.promptWithDb;
                  settings.save();
                  renderTplOptions();
                  alert(LBL.templateResetDone || '초기화 완료.');
                }
              }
            }
          };
          tplSelect.onchange = () => { settings.config.activeTemplateId = tplSelect.value; settings.save(); renderTplOptions(); };
          tplRenameBtn.onclick = () => { const activeTpl = settings.getActiveTemplate(); if (activeTpl.isDefault) return; const newName = prompt(LBL.templateRenamePrompt || '템플릿 이름:', activeTpl.name); if (newName) { const idx = settings.config.templates.findIndex(t => t.id === activeTpl.id); if (idx !== -1) { settings.config.templates[idx].name = newName.trim(); settings.save(); renderTplOptions(); } } };
          tplDelBtn.onclick = () => { const activeId = settings.config.activeTemplateId; const activeTpl = settings.getActiveTemplate(); if (activeTpl.isDefault) return; if (confirm('[' + activeTpl.name + '] ' + (LBL.templateDeleteConfirm || '템플릿 삭제?'))) { settings.config.templates = settings.config.templates.filter(t => t.id !== activeId); settings.config.activeTemplateId = 'default'; settings.save(); renderTplOptions(); } };

          const saveTpl = (key, val) => { const id = settings.config.activeTemplateId; const idx = (settings.config.templates || []).findIndex(t => t.id === id); if (idx !== -1 && !settings.config.templates[idx].isDefault) { settings.config.templates[idx][key] = val; settings.save(); } };
          taSchema.onchange = () => saveTpl('schema', taSchema.value); ta1.onchange = () => saveTpl('promptWithoutDb', ta1.value); ta2.onchange = () => saveTpl('promptWithDb', ta2.value);
          renderTplOptions();
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';
          nd.innerHTML = '<div style="font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;">' + (LBL.convertTitle || '지식 변환 (URL/텍스트 → 설정)') + '</div>';
          const urlInp = document.createElement('input'); urlInp.type = 'text'; urlInp.placeholder = LBL.convertUrlPlaceholder || 'URL 입력'; urlInp.style.cssText = S; nd.appendChild(urlInp);
          const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.placeholder = LBL.convertPackPlaceholder || '파일 이름'; nameInp.style.cssText = S; nd.appendChild(nameInp);
          const rDiv = document.createElement('div'); rDiv.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const urlBtn = document.createElement('button'); urlBtn.textContent = LBL.convertUrlAction || 'URL 변환'; urlBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          urlBtn.onclick = async () => { if (!urlInp.value.trim() || !nameInp.value.trim()) { alert(LBL.convertMissingUrlPack || 'URL과 파일 이름 필요.'); return; } urlBtn.disabled = true; urlBtn.textContent = (LBL.convertRunning || '변환 중') + '...'; try { const cnt = await C.importFromUrl(urlInp.value.trim(), nameInp.value.trim(), { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, model: settings.config.autoExtModel }); const rpt = C.__lastImportReport; let msg = cnt + (LBL.convertCreatedSuffix || '개 생성'); if (rpt) { if (rpt.failed > 0) { const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || ''; msg += ' / ' + (LBL.chunkLabel || '청크') + ' ' + rpt.failed + '/' + rpt.chunks + ' ' + (LBL.failedChunkLabel || '실패') + ': ' + firstErr.slice(0, 80); } else if (cnt === 0 && rpt.empty === rpt.chunks) { msg = '0개 — ' + (LBL.convertNoExtractable || '추출 가능한 내용 없음.'); } } rDiv.textContent = msg; if (cnt > 0) await setPackEnabled(nameInp.value.trim(), true); } catch (e) { rDiv.textContent = (LBL.failedText || '실패') + ': ' + e.message; } urlBtn.textContent = LBL.convertUrlAction || 'URL 변환'; urlBtn.disabled = false; };
          nd.appendChild(urlBtn); nd.appendChild(rDiv);
          const t2 = document.createElement('div'); t2.innerHTML = '<div style="font-size:13px;color:#ccc;font-weight:bold;margin-top:16px;margin-bottom:8px;">' + (LBL.convertTextTitle || '텍스트 → 설정 파일') + '</div>'; nd.appendChild(t2);
          const ta = document.createElement('textarea'); ta.placeholder = LBL.convertTextPlaceholder || '설정, 세계관, 캐릭터 설명 등'; ta.style.cssText = S + 'height:100px;resize:vertical;'; nd.appendChild(ta);
          const nameInp2 = document.createElement('input'); nameInp2.type = 'text'; nameInp2.placeholder = LBL.convertPackPlaceholder || '파일 이름'; nameInp2.style.cssText = S; nd.appendChild(nameInp2);
          const rDiv2 = document.createElement('div'); rDiv2.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const tBtn = document.createElement('button'); tBtn.textContent = LBL.convertTextAction || '텍스트 변환'; tBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          tBtn.onclick = async () => { if (!ta.value.trim() || !nameInp2.value.trim()) { alert(LBL.convertMissingTextPack || '텍스트와 파일 이름 필요.'); return; } tBtn.disabled = true; tBtn.textContent = (LBL.convertRunning || '변환 중') + '...'; try { const cnt = await C.importFromText(ta.value.trim(), nameInp2.value.trim(), { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, model: settings.config.autoExtModel }); const rpt = C.__lastImportReport; let msg = cnt + (LBL.convertCreatedSuffix || '개 생성'); if (rpt) { if (rpt.failed > 0) { const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || ''; msg += ' / ' + (LBL.chunkLabel || '청크') + ' ' + rpt.failed + '/' + rpt.chunks + ' ' + (LBL.failedChunkLabel || '실패') + ': ' + firstErr.slice(0, 80); } else if (cnt === 0 && rpt.empty === rpt.chunks) { msg = '0개 — ' + (LBL.convertNoExtractable || '추출 가능한 내용 없음.'); } } rDiv2.textContent = msg; if (cnt > 0) await setPackEnabled(nameInp2.value.trim(), true); } catch (e) { rDiv2.textContent = (LBL.failedText || '실패') + ': ' + e.message; } tBtn.textContent = LBL.convertTextAction || '텍스트 변환'; tBtn.disabled = false; };
          nd.appendChild(tBtn); nd.appendChild(rDiv2);
        }});
      };
      openPanel(m, renderAutoUI, LBL.extractPanelTitle || '대화 정리 설정');
    })
    .createSubMenu(LBL.refinerTitle || '응답 교정', (m) => {
      openPanel(m, async (panel) => {
        if (!R) { panel.addText(LBL.refinerMissing || '응답 교정 모듈 없음.'); return; }
        // 수동 검수 버튼: 마지막 AI 응답 즉시 재검수 (fingerprint/refinerEnabled 무시)
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = LBL.manualRefineTitle || '수동 검수'; t.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;margin-bottom:4px;'; nd.appendChild(t);
          const d = document.createElement('div'); d.textContent = LBL.manualRefineDesc || '마지막 AI 응답 즉시 다시 확인. 이미 처리된 응답도 다시 실행 가능.'; d.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;'; nd.appendChild(d);
          // 단계 텍스트만 표시한다. 깜빡이는 pulse dot은 중복 렌더 시 flicker를 만들 수 있어 제거한다.
          const btnBox = document.createElement('div'); btnBox.style.cssText = 'position:relative;';
          const btn = document.createElement('button'); btn.textContent = LBL.recentRefineAction || '최근 AI 응답 다시 확인'; btn.style.cssText = 'width:100%;padding:10px;background:#258;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;';
          const statusLine = document.createElement('div'); statusLine.style.cssText = 'font-size:11px;margin-top:6px;text-align:center;line-height:1.4;min-height:16px;color:#888;';
          const setManualStatus = (text, color) => { statusLine.textContent = text || ''; statusLine.style.color = color || '#888'; };
          btnBox.appendChild(btn); btnBox.appendChild(statusLine); nd.appendChild(btnBox);
          btn.onclick = async () => {
            if (!R.manualRefine) { alert(LBL.refinerUpdateNeeded || '응답 교정 모듈 버전 낮음. 스크립트 수동 업데이트 필요.'); return; }
            const cid = C.getCurrentChatId();
            if (!cid) { alert(LBL.chatDetectFailed || '채팅방 감지 실패.'); return; }
            btn.disabled = true;
            const orig = btn.textContent;
            btn.textContent = LBL.manualRefineRunning || '검수 실행 중';
            setManualStatus(LBL.manualRefinePhaseFindTarget || '대상 탐색', '#4a9');
            const start = Date.now();
            const phases = [
              LBL.manualRefinePhaseFindTarget || '대상 탐색',
              LBL.manualRefinePhaseCollectSettings || '설정 수집',
              LBL.manualRefinePhaseCollectMemory || '기억 수집',
              LBL.manualRefinePhaseCallAi || 'AI 확인 중',
              LBL.manualRefinePhaseApply || '반영 중'
            ];
            let phaseIdx = 0;
            const tick = setInterval(() => {
              if (phaseIdx < phases.length - 1) phaseIdx++;
              const sec = Math.floor((Date.now() - start) / 1000);
              setManualStatus(`${phases[phaseIdx]} (${sec}초)`, '#4a9');
            }, 1500);
            try {
              const lastBot = await CrackUtil.chatRoom().findLastBotMessage(cid);
              if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error(LBL.manualRefineNoTarget || '마지막 AI 응답 없음');
              await R.manualRefine(lastBot.content, lastBot.id);
              clearInterval(tick);
              const sec = Math.floor((Date.now() - start) / 1000);
              setManualStatus(`완료 (${sec}초)`, '#4a9');
              setTimeout(() => { setManualStatus('', '#888'); }, 3000);
            } catch(e) {
              clearInterval(tick);
              setManualStatus((LBL.failedText || '실패') + ': ' + String(e.message || e).slice(0, 50), '#d66');
            } finally {
              btn.textContent = orig;
              btn.disabled = false;
            }
          };
        }});
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow(LBL.refinerEnableTitle || '응답 교정 켜기', LBL.refinerEnableDesc || 'AI 응답이 저장된 설정과 어긋나는지 확인.', settings.config.refinerEnabled, (v) => { settings.config.refinerEnabled = v; settings.save(); if(v && R.setNeedsWarmup) R.setNeedsWarmup(); }));
          nd.appendChild(C.createToggleRow(LBL.refinerAutoApplyTitle || '자동 적용', LBL.refinerAutoApplyDesc || '확인 창 없이 교정 결과 바로 적용.', settings.config.refinerAutoMode, (v) => { settings.config.refinerAutoMode = v; settings.save(); }));

          const sensitivityWrap = document.createElement('div'); sensitivityWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
          const sensitivityLbl = document.createElement('div'); sensitivityLbl.textContent = LBL.honorificSensitivity || '호칭 교정 민감도'; sensitivityLbl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const sensitivitySel = document.createElement('select'); sensitivitySel.style.cssText = 'width:160px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'low', l:'낮음'}, {v:'normal', l:'보통'}, {v:'high', l:'높음'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; sensitivitySel.appendChild(opt); });
          sensitivitySel.value = settings.config.refinerHonorificSensitivity || 'low';
          sensitivitySel.onchange = () => { settings.config.refinerHonorificSensitivity = sensitivitySel.value; settings.save(); };
          sensitivityWrap.appendChild(sensitivityLbl); sensitivityWrap.appendChild(sensitivitySel); nd.appendChild(sensitivityWrap);

          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';

          const modeWrap = document.createElement('div'); modeWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
          const modeLbl = document.createElement('div'); modeLbl.textContent = LBL.refinerModeTitle || '설정 검색 방식'; modeLbl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const modeSel = document.createElement('select'); modeSel.style.cssText = 'width:160px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'matchedOnly', l: LBL.refinerModeKeyword || '키워드 매칭만'}, {v:'semantic', l: LBL.refinerModeSemantic || '의미 검색'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; modeSel.appendChild(opt); });
          modeSel.value = settings.config.refinerLoreMode || 'matchedOnly';
          modeSel.onchange = () => { settings.config.refinerLoreMode = modeSel.value; settings.save(); };
          modeWrap.appendChild(modeLbl); modeWrap.appendChild(modeSel); nd.appendChild(modeWrap);

          const tplWrap = document.createElement('div'); tplWrap.style.cssText = 'margin-bottom:8px;padding-top:8px;border-top:1px dashed #333;';
          const tplLbl = document.createElement('div'); tplLbl.textContent = LBL.refinerTemplateSelect || '검수 템플릿 선택'; tplLbl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:4px;';
          const tplSel = document.createElement('select'); tplSel.style.cssText = S;
          const tplDesc = document.createElement('div'); tplDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;';

          const customOpt = document.createElement('option'); customOpt.value = 'custom'; customOpt.textContent = LBL.refinerCustomPromptOption || '직접 입력'; tplSel.appendChild(customOpt);
          if (R.TEMPLATES) {
            Object.entries(R.TEMPLATES).forEach(([k, t]) => { const opt = document.createElement('option'); opt.value = k; opt.textContent = t.name; tplSel.appendChild(opt); });
          }
          if (R.TOPICS) {
            const dynOpt = document.createElement('option'); dynOpt.value = 'dynamic'; dynOpt.textContent = LBL.refinerDynamicPromptOption || '주제별 선택'; tplSel.appendChild(dynOpt);
          }
          tplWrap.appendChild(tplLbl); tplWrap.appendChild(tplSel); tplWrap.appendChild(tplDesc); nd.appendChild(tplWrap);

          // 주제별 체크박스 UI (dynamic 모드에서만 표시)
          const topicsWrap = document.createElement('div');
          topicsWrap.style.cssText = 'display:none;margin-bottom:12px;padding:10px;background:#111;border:1px solid #333;border-radius:4px;';
          const topicsHdr = document.createElement('div'); topicsHdr.textContent = LBL.refinerTopicHeader || '검수 주제 선택 — 체크한 항목만 AI에게 요청'; topicsHdr.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed #333;';
          topicsWrap.appendChild(topicsHdr);
          const topicsBody = document.createElement('div'); topicsWrap.appendChild(topicsBody);
          nd.appendChild(topicsWrap);
          const rebuildDynamicPrompt = () => {
            const built = R.buildDynamicPrompt(settings.config.refinerTopics || {}, settings.config);
            settings.config.refinerCustomPrompt = built;
            ta.value = built;
            settings.save();
          };
          const renderTopics = () => {
            if (!settings.config.refinerTopics) {
              const def = {}; Object.keys(R.TOPICS || {}).forEach(k => def[k] = true);
              settings.config.refinerTopics = def;
            }
            topicsBody.innerHTML = '';
            let curGroup = null;
            Object.entries(R.TOPICS || {}).forEach(([k, meta]) => {
              if (meta.group !== curGroup) {
                curGroup = meta.group;
                const gh = document.createElement('div');
                gh.textContent = curGroup === 'logic' ? '— ' + (LBL.refinerLogicGroup || '모순 검수') + ' —' : '— ' + (LBL.refinerRepairGroup || '끊김 복구') + ' —';
                gh.style.cssText = 'font-size:10px;color:#888;margin:6px 0 4px;font-weight:bold;';
                topicsBody.appendChild(gh);
              }
              const row = document.createElement('label');
              row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:5px 0;cursor:pointer;';
              const cb = document.createElement('input'); cb.type = 'checkbox';
              cb.checked = !!settings.config.refinerTopics[k];
              cb.style.cssText = 'margin-top:3px;flex-shrink:0;accent-color:#4a9;';
              const txt = document.createElement('div'); txt.style.flex = '1';
              const lbl = document.createElement('div'); lbl.textContent = meta.label; lbl.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;';
              const dsc = document.createElement('div'); dsc.textContent = meta.desc; dsc.style.cssText = 'font-size:10px;color:#888;line-height:1.4;';
              txt.appendChild(lbl); txt.appendChild(dsc);
              cb.onchange = () => {
                settings.config.refinerTopics[k] = cb.checked;
                rebuildDynamicPrompt();
              };
              row.appendChild(cb); row.appendChild(txt); topicsBody.appendChild(row);
            });
          };

          const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:12px;';
          const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const t = document.createElement('div'); t.textContent = LBL.refinerContextTurns || '참조 대화 턴 수'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;'; left.appendChild(t);
          const right = document.createElement('div');
          const inp = document.createElement('input'); inp.type = 'number'; inp.value = settings.config.refinerContextTurns !== undefined ? settings.config.refinerContextTurns : 1; inp.min = 0; inp.max = 20;
          inp.style.cssText = 'width:60px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
          inp.onchange = () => { settings.config.refinerContextTurns = parseInt(inp.value) || 0; settings.save(); };
          right.appendChild(inp); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);

          const tLbl2 = document.createElement('div'); tLbl2.textContent = (LBL.refinerPromptLabel || '프롬프트') + ' ({lore}, {memory}, {context}, {message}, {passWord})'; tLbl2.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; nd.appendChild(tLbl2);
          const ta = document.createElement('textarea'); ta.value = settings.config.refinerCustomPrompt; ta.style.cssText = S + 'height:200px;font-family:monospace;resize:vertical;';
          ta.onchange = () => { settings.config.refinerCustomPrompt = ta.value; settings.save(); tplSel.value = 'custom'; tplDesc.textContent = ''; }; nd.appendChild(ta);

          if (R.TEMPLATES) {
            tplSel.onchange = () => {
              const val = tplSel.value;
              if (val === 'dynamic') {
                settings.config.refinerUseDynamic = true;
                topicsWrap.style.display = 'block';
                renderTopics();
                rebuildDynamicPrompt();
                tplDesc.textContent = LBL.refinerDynamicDesc || '아래 체크박스로 검수 주제 켜고 끔. 체크한 항목만 프롬프트에 들어감.';
              } else if (val !== 'custom' && R.TEMPLATES[val]) {
                settings.config.refinerUseDynamic = false;
                topicsWrap.style.display = 'none';
                const tpl = R.TEMPLATES[val];
                ta.value = tpl.prompt; settings.config.refinerCustomPrompt = tpl.prompt;
                inp.value = tpl.turnHint; settings.config.refinerContextTurns = tpl.turnHint;
                tplDesc.textContent = tpl.desc;
                settings.save();
              } else {
                settings.config.refinerUseDynamic = false;
                topicsWrap.style.display = 'none';
                tplDesc.textContent = LBL.refinerCustomDesc || '직접 작성한 프롬프트 사용.';
                settings.save();
              }
            };
            const normalize = (s) => (s||'').trim().replace(/\s+/g, ' ');
            let matched = 'custom';
            const curNorm = normalize(settings.config.refinerCustomPrompt);
            Object.entries(R.TEMPLATES).forEach(([k, t]) => { if (normalize(t.prompt) === curNorm) matched = k; });

            if (matched === 'custom' && !settings.config.refinerCustomPrompt && R.TOPICS && R.buildDynamicPrompt) {
              // 기본값: 주제별 선택 (모든 주제 on)
              matched = 'dynamic';
              settings.config.refinerUseDynamic = true;
              const def = {}; Object.keys(R.TOPICS).forEach(k => def[k] = true);
              settings.config.refinerTopics = def;
              settings.config.refinerCustomPrompt = R.buildDynamicPrompt(def);
              settings.config.refinerContextTurns = 1;
              ta.value = settings.config.refinerCustomPrompt;
              inp.value = 1;
              settings.save();
            }

            if (settings.config.refinerUseDynamic && R.TOPICS) matched = 'dynamic';
            tplSel.value = matched;
            if (matched === 'dynamic') {
              topicsWrap.style.display = 'block';
              renderTopics();
              tplDesc.textContent = LBL.refinerDynamicDesc || '아래 체크박스로 검수 주제 켜고 끔. 체크한 항목만 프롬프트에 들어감.';
            } else if (matched !== 'custom') tplDesc.textContent = R.TEMPLATES[matched].desc;
            else tplDesc.textContent = LBL.refinerCustomDesc || '직접 작성한 프롬프트 사용.';
          }

          const clearFpBtn = document.createElement('button'); clearFpBtn.textContent = LBL.refinerClearQueue || '처리 기록 초기화'; clearFpBtn.style.cssText = 'width:100%;padding:8px;margin-top:12px;background:#654;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
          clearFpBtn.onclick = () => { R.clearProcessed(); alert(LBL.refinerQueueCleared || '기록 삭제됨.'); }; nd.appendChild(clearFpBtn);
        }});
      }, LBL.refinerPanelTitle || '응답 교정 설정');
    })
    .createSubMenu(LBL.logMenu || '실행 기록', (m) => {
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
              btn.textContent = LBL.logResetAction || '초기화';
              btn.style.cssText = 'padding:4px 10px;font-size:11px;border-radius:4px;cursor:pointer;background:transparent;color:#d66;border:1px solid #d66;';
              btn.onclick = (ev) => {
                ev.stopPropagation();
                if(confirm(LBL.logDeleteConfirm || '기록 삭제?')) { renderer(true); openPanel(m, renderLogs, LBL.logPanelTitle || '실행 기록'); }
              };
              hRow.appendChild(btn);
            }
            nd.appendChild(hRow);
            const listCon = document.createElement('div');
            // 기본 접힌 상태: 모든 카테고리 동시 노출 시 스왔 발생 방지
            listCon.style.display = 'none';
            if (!items.length) {
              listCon.appendChild(Object.assign(document.createElement('div'), { textContent: LBL.logEmpty || '기록 없음.', style: 'font-size:12px;color:#888;' }));
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

        makeLogBox(LBL.logInjectionTitle || '삽입 기록', '#4a9', iLog, (clear, i, nd) => {
          if(clear) { clearInjLog(chatKey); return; }
          const r = document.createElement('div');
          r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;';
          let h = `<span style="color:#ccc;font-size:12px;">${i.turn}턴 (${i.time})</span>`;
          if(i.totalChars && i.maxChars) {
            const pct = Math.round(i.totalChars / i.maxChars * 100);
            const color = pct > 80 ? '#d66' : pct > 60 ? '#da8' : '#4a9';
            h += `<br><span style="font-size:11px;color:${color};font-weight:bold;">${LBL.totalLabel || '전체'} ${i.totalChars}/${i.maxChars}${LBL.charUnit || '자'} (${pct}%)</span>`;
            h += ` <span style="font-size:10px;color:#888;">${LBL.userInputLabel || '입력'} ${i.userInputChars||0} + ${LBL.injectedLabel || '삽입'} ${i.injectedChars||0}</span>`;
          }
          if(i.sections) {
            const s = i.sections; const parts = [];
            if(s.scene) parts.push(`${LBL.sceneLabel || '장면'} ${s.scene}`);
            if(s.firstEnc) parts.push(`${LBL.firstEncounterLabel || '첫 만남'} ${s.firstEnc}`);
            if(s.reunion) parts.push(`${LBL.reunionLabel || '재회'} ${s.reunion}`);
            if(s.honor) parts.push(`${LBL.honorificLabel || '호칭'} ${s.honor}`);
            if(s.lore) parts.push(`${LBL.settingLabel || '설정'} ${s.lore}`);
            if(parts.length) h += `<br><span style="font-size:10px;color:#69b;">${LBL.logDetailsLabel || '내역'}: ${parts.join(' / ')}</span>`;
          }
          // 최적화 카운터 (Stage B에서 도입된 Bundling/Delta Skip)
          {
            const optParts = [];
            if(i.bundled) optParts.push(`<span style="color:#9a6;">${LBL.bundleLabel || '묶음'} ${i.bundled}</span>`);
            if(i.deltaSkipped) optParts.push(`<span style="color:#da8;">${LBL.skippedLabel || '건너뜀'} ${i.deltaSkipped}</span>`);
            if(optParts.length) h += `<br><span style="font-size:10px;color:#888;">${LBL.logOptimizeLabel || '최적화'}: ${optParts.join(' / ')}</span>`;
          }
          if(i.budget) h += `<br><span style="font-size:10px;color:#888;">${LBL.logBudgetLabel || '예산'} ${i.used||0}/${i.budget}${i.level?' ('+i.level+')':''}</span>`;
          h += `<br><span style="font-size:11px;color:#888;">${i.count>0?i.count+'개: '+i.matched.join(', '):i.note || (LBL.logNoMatch || '매치 없음')}</span>`;
          r.innerHTML = h; nd.appendChild(r);
        });
        makeLogBox(LBL.logExtractionTitle || '정리 기록', '#da8', eLog, (clear, i, nd) => { if(clear) clearExtLog(chatKey); else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:${i.status==='실패'?'#d66':i.status==='성공'?'#4a9':'#ccc'}">[${i.time}] ${i.isManual?'수동':'자동'} - ${i.status} (${i.count||0}개)</span>${i.api?`<br><span style="font-size:10px;color:#69b;">API: ${i.api.status}${i.api.error?' | '+i.api.error:''}</span>`:''}`; nd.appendChild(r); } });
        makeLogBox(LBL.logRefinerTitle || '교정 기록', '#ea5', rLog, (clear, i, nd) => { if(clear){ settings.config.urlRefinerLogs[chatKey]=[]; settings.save(); } else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:${i.isPass?'#4a9':i.isError?'#d66':'#ea5'};">[${i.time}] ${i.isPass?'통과':i.isError?'오류':'교정됨'}</span>${i.reason?`<br><span style="font-size:11px;color:#da7;">이유: ${i.reason}</span>`:''}`; nd.appendChild(r); } });
        makeLogBox(LBL.logContradictionTitle || '모순 기록', '#d96', cLog, (clear, i, nd) => { if(clear) _ls.removeItem('lore-contradictions'); else { const r = document.createElement('div'); r.style.cssText = 'margin-bottom:6px;border-bottom:1px dashed #222;padding-bottom:4px;font-size:12px;'; r.innerHTML = `<span style="color:#d96;font-weight:bold;">${i.name}</span><br><span style="color:#a55;">"${i.oldStatus}" → "${i.newStatus}"</span><br><span style="font-size:10px;color:#888;">${new Date(i.time).toLocaleString()} (~${i.turn}턴)</span>`; nd.appendChild(r); } });
      };
      openPanel(m, renderLogs, LBL.logPanelTitle || '실행 기록');
    })
    .createSubMenu(LBL.sessionMenu || '세션 상태', (m) => {
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
          title.textContent = `${LBL.sessionTitle || '현재 세션 상태'} (턴: ${turnCounter})`;
          title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;';

          const clearAllBtn = document.createElement('button');
          clearAllBtn.textContent = LBL.sessionClearAll || '세션 전체 초기화';
          clearAllBtn.style.cssText = 'padding:6px 12px;font-size:11px;border-radius:4px;cursor:pointer;background:#833;color:#fff;border:none;font-weight:bold;';
          clearAllBtn.onclick = () => {
            if(confirm(LBL.sessionClearConfirm || '이 채팅방의 쿨다운, 시간감쇠 점수, 턴 수 모두 초기화?')) {
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
              openPanel(m, renderSessionStatus, LBL.sessionPanelTitle || '세션 상태 관리');
            }
          };
          headerRow.appendChild(title);
          headerRow.appendChild(clearAllBtn);
          nd.appendChild(headerRow);

          if (!allEntries.length) {
            const empty = document.createElement('div');
            empty.textContent = LBL.sessionNoActiveEntries || '현재 켜진 설정 없음.';
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
              openPanel(m, renderSessionStatus, LBL.sessionPanelTitle || '세션 상태 관리');
            };

            row.appendChild(info);
            row.appendChild(resetBtn);
            listContainer.appendChild(row);
          }
          nd.appendChild(listContainer);
        }});
      };
      openPanel(m, renderSessionStatus, '세션 상태 조회');
    })
    .createSubMenu('API 설정', (m) => {
      openPanel(m, (panel) => {
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

          // Refiner Model — 비워두면 기본 LLM 모델을 따라감
          const rfl = document.createElement('div'); rfl.textContent = '교정(Refiner) 모델'; rfl.style.cssText = 'font-size:11px;color:#999;margin:14px 0 4px;'; nd.appendChild(rfl);
          const rfs = document.createElement('select'); rfs.style.cssText = S;
          [['기본 LLM과 동일', [['(기본 LLM 사용)', '']]], ['Gemini 3.x', [['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Flash Lite', 'gemini-3.1-flash-lite-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]], ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.5 Flash', 'gemini-2.5-flash'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]].forEach(([g, opts]) => { const og = document.createElement('optgroup'); og.label = g; opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); }); rfs.appendChild(og); });
          rfs.value = settings.config.refinerModel !== undefined ? settings.config.refinerModel : '';
          const rfci = document.createElement('input'); rfci.value = settings.config.refinerCustomModel || ''; rfci.placeholder = '모델명 직접 입력'; rfci.style.cssText = S + 'margin-top:6px;' + (rfs.value === '_custom' ? '' : 'display:none;');
          rfci.onchange = () => { settings.config.refinerCustomModel = rfci.value; settings.save(); };
          rfs.onchange = () => { settings.config.refinerModel = rfs.value; settings.save(); rfci.style.display = rfs.value === '_custom' ? '' : 'none'; };
          nd.appendChild(rfs); nd.appendChild(rfci);

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
      openPanel(m, (panel) => {
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

})();
