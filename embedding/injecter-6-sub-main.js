// injecter / sub-main — 메인 설정 패널
// 역할: 빠른 설정, 인젝션 토글, 검색/감지, 주입 위치, 출력 포맷
// 의존: injecter-3 (settings, db, C, OOC_FORMATS)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-main] settings 미로드'); return; }
  if (_w.__LoreInj.__subMainLoaded) return;

  const { C, db, _ls, settings, OOC_FORMATS } = _w.__LoreInj;

  _w.__LoreInj.registerMenu = _w.__LoreInj.registerMenu || function() {};

  _w.__LoreInj.registerMenu('main', function(modal) {
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
              settings.config = JSON.parse(JSON.stringify(_w.__LoreInj.defaultSettings)); Object.assign(settings.config, preset.config); settings.save();
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
          resetBtn.onclick = () => {
            if (!confirm('설정 초기화? API 설정값과 DB/로어 팩 활성화는 유지됩니다.')) return;
            if (_w.__LoreInj.resetSettingsKeepApi) _w.__LoreInj.resetSettingsKeepApi();
            else {
              const keep = {
                autoExtApiType: settings.config.autoExtApiType,
                autoExtKey: settings.config.autoExtKey,
                autoExtVertexJson: settings.config.autoExtVertexJson,
                autoExtVertexLocation: settings.config.autoExtVertexLocation,
                autoExtVertexProjectId: settings.config.autoExtVertexProjectId,
                autoExtFirebaseScript: settings.config.autoExtFirebaseScript,
                autoExtFirebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
                embeddingModel: settings.config.embeddingModel
              };
              _ls.removeItem('lore-injector-v5');
              Object.assign(settings.config, keep);
              settings.save();
            }
            location.reload();
          }; nd.appendChild(resetBtn);
        }});
      }, '메인 설정');
    });
  });

  _w.__LoreInj.__subMainLoaded = true;
})();
