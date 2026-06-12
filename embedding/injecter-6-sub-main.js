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
          beginner: { name: '기본 추천', desc: '의미 검색 + 8턴마다 대화 정리. 일반 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: true, autoExtTurns: 8, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 4, cooldownTurns: 8, injectionCleanupEnabled: true, windowExitChars: 7000, loreBudgetChars: 300, loreBudgetMax: 500, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 12, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
          minimal: { name: '수동 검색', desc: '자동 추출 OFF. 수동 추출만 사용. API 호출 최소.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: false, autoEmbedOnExtract: true, scanOffset: 2, maxEntries: 3, cooldownTurns: 6, injectionCleanupEnabled: true, windowExitChars: 7000, loreBudgetChars: 250, loreBudgetMax: 400, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: false, importanceGating: true, importanceThreshold: 12, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
          advanced: { name: '정밀', desc: '5턴마다 대화 정리 + 후보 재정렬 + 응답 교정. 장문 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.4, autoExtEnabled: true, autoExtTurns: 5, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 5, cooldownTurns: 8, injectionCleanupEnabled: true, windowExitChars: 7000, loreBudgetChars: 400, loreBudgetMax: 700, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 10, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: true, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true, refinerEnabled: true, refinerLoreMode: 'semantic' } }
        };
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createSectionTitle('현재 상태'));
          const cfg = settings.config || {};
          const apiType = cfg.autoExtApiType || 'key';
          const apiReady = apiType === 'deepseek' ? !!cfg.autoExtDeepSeekKey : apiType === 'vertex' ? !!cfg.autoExtVertexJson : apiType === 'firebase' ? !!cfg.autoExtFirebaseScript : !!cfg.autoExtKey;
          const activePacks = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : ((cfg.urlPacks && cfg.urlPacks[C.getCurUrl()]) || []);
          const storageHealth = _w.__LoreInj.getSettingsStorageHealth ? _w.__LoreInj.getSettingsStorageHealth() : { ok: true, configBytes: 0 };
          const envDiag = (_w.__LoreEnv && _w.__LoreEnv.diagnostics) || {};
          const persistLabel = envDiag.persisted === true ? '영구 저장' : (envDiag.persisted === false ? '일반 저장' : '확인 중');
          const platformCaps = (_w.__LorePlatform && _w.__LorePlatform.capabilities) ? _w.__LorePlatform.capabilities() : {};
          const platformDiag = platformCaps.diagnostics || {};
          const platformOk = platformCaps.canReadLogs && platformCaps.canPatch && platformDiag.messageShapeOk !== false;
          const metrics = C.createMetricGrid([
            { key: 'api', label: 'API', value: apiReady ? '설정됨' : '미설정', ok: apiReady },
            { key: 'pack', label: '활성 로어팩', value: activePacks.length ? activePacks.length + '개' : '없음', ok: activePacks.length > 0 },
            { key: 'entry', label: '사용 가능한 로어', value: '확인 중', ok: true },
            { key: 'save', label: '설정 저장', value: settings._lastSaveOk === false ? '실패' : '정상', ok: settings._lastSaveOk !== false },
            { key: 'platform', label: '사이트 연결', value: platformOk ? '정상' : '제한됨', ok: platformOk },
            { key: 'storage', label: '저장 공간', value: storageHealth.ok ? Math.ceil((storageHealth.configBytes || 0) / 1024) + 'KB' : '확인 실패', ok: storageHealth.ok },
            { key: 'storageMode', label: '저장 방식', value: (envDiag.storageMode || 'localStorage') + ' / ' + persistLabel, ok: envDiag.persisted !== false },
            { key: 'extract', label: '자동 대화 정리', value: cfg.autoExtEnabled ? (cfg.autoExtTurns || 8) + '턴마다' : '꺼짐', ok: !!cfg.autoExtEnabled },
            { key: 'semantic', label: '의미 검색', value: cfg.embeddingEnabled ? (cfg.autoEmbedOnExtract !== false ? '켜짐' : '수동 준비') : '꺼짐', ok: !!cfg.embeddingEnabled }
          ]);
          nd.appendChild(metrics.grid);
          db.entries.toArray().then(entries => {
            const active = new Set(activePacks);
            const usable = active.size ? entries.filter(e => active.has(e.packName)).length : 0;
            metrics.nodes.entry.textContent = usable + '개';
            metrics.nodes.entry.style.color = usable ? 'var(--li-accent,#5aa7ff)' : '#e7b56f';
            if (activePacks.length) metrics.nodes.pack.textContent = activePacks.join(', ');
          }).catch(() => { metrics.nodes.entry.textContent = '확인 실패'; metrics.nodes.entry.style.color = '#ef6b6b'; });
        }});
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createSectionTitle('빠른 설정'));
          const row = document.createElement('div'); row.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;';
          if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) row.style.gridTemplateColumns = '1fr';
          for (const [key, preset] of Object.entries(PRESETS)) {
            const btn = document.createElement('button'); btn.style.cssText = 'min-height:88px;padding:12px 13px;font-size:12px;border-radius:10px;cursor:pointer;border:1px solid var(--li-line,#2f3b4f);background:#0c1320;color:var(--li-text-soft,#a9b6c7);display:flex;flex-direction:column;gap:7px;text-align:left;min-width:0;';
            const nm = document.createElement('div'); nm.textContent = preset.name; nm.style.cssText = 'font-weight:800;color:var(--li-text,#e7edf5);font-size:13px;';
            const ds = document.createElement('div'); ds.textContent = preset.desc; ds.style.cssText = 'font-size:11px;color:var(--li-text-soft,#a9b6c7);line-height:1.45;word-break:keep-all;';
            btn.appendChild(nm); btn.appendChild(ds);
            btn.onmouseenter = () => { btn.style.borderColor = 'rgba(90,167,255,.55)'; btn.style.background = '#111c2d'; };
            btn.onmouseleave = () => { btn.style.borderColor = 'var(--li-line,#2f3b4f)'; btn.style.background = '#0c1320'; };
            btn.onclick = () => {
              if (!confirm('[' + preset.name + '] 프리셋 적용?')) return;
              if (_w.__LoreInj.applyPresetKeepState) _w.__LoreInj.applyPresetKeepState(preset.config);
              else { settings.config = JSON.parse(JSON.stringify(_w.__LoreInj.defaultSettings)); Object.assign(settings.config, preset.config); settings.save(); }
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
          nd.appendChild(C.createSelectRow('압축 모드', settings.config.compressionMode || 'auto', [
            { value: 'auto', label: '자동 (공간 맞춤)' },
            { value: 'full', label: '길게' },
            { value: 'compact', label: '짧게' },
            { value: 'micro', label: '아주 짧게' }
          ], (v) => { settings.config.compressionMode = v; settings.save(); }, { width: '160px' }).row);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createSectionTitle('검색 & 감지'));
          nd.appendChild(C.createToggleRow('의미로 찾기', '단어가 달라도 관련 로어 찾음. API/검색 준비 필요.', settings.config.embeddingEnabled, (v) => { settings.config.embeddingEnabled = v; settings.save(); }));
          nd.appendChild(C.createSelectRow('의미 검색 모델', settings.config.embeddingModel || 'gemini-embedding-001', [
            { value: 'gemini-embedding-001', label: 'gemini-embedding-001' },
            { value: 'gemini-embedding-2-preview', label: 'gemini-embedding-2-preview' }
          ], (v) => { settings.config.embeddingModel = v; settings.save(); alert('모델 변경됨. 기존 로어 검색 준비 재실행 필요.'); }, { width: '220px' }).row);

          nd.appendChild(C.createToggleRow('추출 후 검색 준비', '새 로어를 의미 검색용으로 자동 준비함.', settings.config.autoEmbedOnExtract !== false, (v) => { settings.config.autoEmbedOnExtract = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('오래된 정보도 가끔 넣기', '직접 관련이 약해도 중요한 과거 정보를 주기적으로 넣음.', settings.config.periodicRecallEnabled !== false, (v) => { settings.config.periodicRecallEnabled = v; settings.config.decayEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('AI로 후보 다시 고르기', '검색 후보를 AI가 현재 장면 기준으로 다시 정렬함.', settings.config.rerankEnabled || false, (v) => { settings.config.rerankEnabled = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createSegmentedRow('주입 위치', '메시지 기준 로어 삽입 위치.', settings.config.position || 'after', [
            { value: 'before', label: '메시지 앞' },
            { value: 'after', label: '메시지 뒤' }
          ], (v) => { settings.config.position = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createSectionTitle('추가 정보 주입'));
          nd.appendChild(C.createToggleRow('호칭 정보', '캐릭터 간 호칭 정보 함께 전달함.', settings.config.honorificMatrixEnabled !== false, (v) => { settings.config.honorificMatrixEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('첫 만남/재회 관리', '첫 만남/재회 여부 자동 전달함.', settings.config.firstEncounterWarning !== false, (v) => { settings.config.firstEncounterWarning = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createSectionTitle('출력 포맷'));
          const oocSel = document.createElement('select'); oocSel.style.cssText = C.UI.field + 'margin-bottom:12px;';
          for (const [k, v] of Object.entries(OOC_FORMATS)) { const opt = document.createElement('option'); opt.value = k; opt.textContent = v.name + ' — ' + v.desc; oocSel.appendChild(opt); }
          oocSel.value = settings.config.oocFormat || 'custom';
          const pInp = document.createElement('input'); pInp.value = settings.config.prefix || ''; pInp.style.cssText = C.UI.field + 'margin-bottom:12px;';
          pInp.onchange = () => { settings.config.prefix = pInp.value; settings.save(); };
          const sInp = document.createElement('input'); sInp.value = settings.config.suffix || ''; sInp.style.cssText = C.UI.field + 'margin-bottom:20px;';
          sInp.onchange = () => { settings.config.suffix = sInp.value; settings.save(); };
          oocSel.onchange = () => {
            const fmt = OOC_FORMATS[oocSel.value];
            if (fmt && oocSel.value !== 'custom') { pInp.value = fmt.prefix; sInp.value = fmt.suffix; settings.config.prefix = fmt.prefix; settings.config.suffix = fmt.suffix; }
            settings.config.oocFormat = oocSel.value; settings.save();
            pInp.disabled = oocSel.value !== 'custom'; sInp.disabled = oocSel.value !== 'custom';
            pInp.style.opacity = oocSel.value !== 'custom' ? '0.6' : '1'; sInp.style.opacity = oocSel.value !== 'custom' ? '0.6' : '1';
          };
          const applyDefaultBtn = C.createActionButton('새 기본값 적용', 'success');
          applyDefaultBtn.style.margin = '0 0 12px 0';
          applyDefaultBtn.onclick = () => {
            const fmt = OOC_FORMATS.default;
            oocSel.value = 'default';
            pInp.value = fmt.prefix;
            sInp.value = fmt.suffix;
            settings.config.oocFormat = 'default';
            settings.config.prefix = fmt.prefix;
            settings.config.suffix = fmt.suffix;
            settings.config.oocPromptVersion = _w.__LoreInj.OOC_FORMAT_VERSION || settings.config.oocPromptVersion;
            settings.save();
            pInp.disabled = true; sInp.disabled = true;
            pInp.style.opacity = '0.6'; sInp.style.opacity = '0.6';
          };
          nd.appendChild(oocSel); nd.appendChild(pInp); nd.appendChild(sInp); nd.appendChild(applyDefaultBtn);
          const isCustom = (settings.config.oocFormat || 'custom') === 'custom';
          pInp.disabled = !isCustom; sInp.disabled = !isCustom; pInp.style.opacity = isCustom ? '1' : '0.6'; sInp.style.opacity = isCustom ? '1' : '0.6';
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const resetBtn = C.createActionButton('모든 설정 초기화 (DB 유지)', 'danger'); resetBtn.style.width = '100%'; resetBtn.style.marginTop = '18px'; resetBtn.style.padding = '10px';
          resetBtn.onclick = () => {
            if (!confirm('설정 초기화? API 설정값과 DB/로어팩 활성화는 유지됨.')) return;
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
