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
    modal.createMenu('홈/주입 설정', (m) => {
      m.replaceContentPanel(async (panel) => {
        const PRESETS = {
          beginner: { name: '기본 추천', desc: '의미 검색 + 8턴마다 로어 추출. 일반 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: true, autoExtTurns: 8, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 4, cooldownTurns: 8, injectionCleanupEnabled: true, injectionCleanupTurns: 8, loreBudgetChars: 300, loreBudgetMax: 500, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 12, aiMemoryTurns: 4, adaptiveAiMemory: true, nativeContextTokenBudget: 10000, pendingPromiseBoost: true, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
          minimal: { name: '수동 검색', desc: '자동 추출을 끄고 수동 추출만 사용함. API 호출을 최소화함.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: false, autoEmbedOnExtract: true, scanOffset: 2, maxEntries: 3, cooldownTurns: 6, injectionCleanupEnabled: true, injectionCleanupTurns: 8, loreBudgetChars: 250, loreBudgetMax: 400, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: false, importanceGating: true, importanceThreshold: 12, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
          advanced: { name: '정밀', desc: '5턴마다 로어 추출 + 후보 재정렬 + 응답 교정. 장문 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.4, autoExtEnabled: true, autoExtTurns: 5, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 5, cooldownTurns: 8, injectionCleanupEnabled: true, injectionCleanupTurns: 8, loreBudgetChars: 400, loreBudgetMax: 700, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 10, aiMemoryTurns: 4, adaptiveAiMemory: true, nativeContextTokenBudget: 10000, pendingPromiseBoost: true, rerankEnabled: true, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true, refinerEnabled: true, refinerLoreMode: 'semantic' } }
        };
        const makeNumberField = (label, key, defaultVal, opts = {}) => {
          const f = document.createElement('div'); f.style.flex = '1';
          const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;';
          const i = document.createElement('input'); i.type = 'number';
          i.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal;
          if (opts.min !== undefined) i.min = opts.min;
          if (opts.max !== undefined) i.max = opts.max;
          i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
          const save = () => { const v = parseInt(i.value, 10); if (!isNaN(v)) { settings.config[key] = v; settings.save(); } };
          i.oninput = save; i.onchange = save;
          f.appendChild(l); f.appendChild(i); return f;
        };
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div'); title.textContent = '현재 상태'; title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
          const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;'; nd.appendChild(grid);
          const chip = (label, value, ok) => {
            const c = document.createElement('div');
            c.style.cssText = 'border:1px solid #333;border-radius:6px;padding:8px 10px;background:#111;min-width:0;';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:10px;color:#888;margin-bottom:4px;';
            const v = document.createElement('div'); v.textContent = value; v.style.cssText = 'font-size:12px;font-weight:bold;color:' + (ok ? '#4a9' : '#da8') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            c.appendChild(l); c.appendChild(v); grid.appendChild(c); return v;
          };
          const cfg = settings.config || {};
          const apiType = cfg.autoExtApiType || 'key';
          const apiReady = apiType === 'deepseek' ? !!cfg.autoExtDeepSeekKey : apiType === 'openai' ? (!!cfg.autoExtOpenAIBaseUrl && !!cfg.autoExtOpenAIKey) : apiType === 'vertex' ? !!cfg.autoExtVertexJson : apiType === 'firebase' ? !!cfg.autoExtFirebaseScript : !!cfg.autoExtKey;
          const activePacks = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : ((cfg.urlPacks && cfg.urlPacks[C.getCurUrl()]) || []);
          const storageHealth = _w.__LoreInj.getSettingsStorageHealth ? _w.__LoreInj.getSettingsStorageHealth() : { ok: true, configBytes: 0 };
          chip('API', apiReady ? '설정됨' : '미설정', apiReady);
          const packValue = chip('활성 로어팩', activePacks.length ? activePacks.length + '개' : '없음', activePacks.length > 0);
          const entryValue = chip('사용 가능한 로어', '확인 중', true);
          chip('설정 저장', settings._lastSaveOk === false ? '실패' : '정상', settings._lastSaveOk !== false);
          chip('저장 공간', storageHealth.ok ? Math.ceil((storageHealth.configBytes || 0) / 1024) + 'KB' : '확인 실패', storageHealth.ok);
          const extractInterval = Math.max(1, Number(cfg.autoExtTurns) || 8);
          const extractTurn = _w.__LoreInj.getTurnCounter && _w.__LoreInj.getChatKey ? _w.__LoreInj.getTurnCounter(_w.__LoreInj.getChatKey()) : 0;
          const extractRemainder = ((extractTurn % extractInterval) + extractInterval) % extractInterval;
          const extractRemaining = extractRemainder === 0 ? extractInterval : extractInterval - extractRemainder;
          const autoExtractValue = chip('자동 로어 추출', cfg.autoExtEnabled ? extractInterval + '턴마다 · ' + extractRemaining + '턴 남음' : '꺼짐', !!cfg.autoExtEnabled);
          autoExtractValue.title = cfg.autoExtEnabled ? '현재 ' + extractTurn + '턴 · 다음 자동 추출까지 ' + extractRemaining + '턴' : '자동 로어 추출 꺼짐';
          chip('로어 자동 삽입', cfg.enabled !== false ? '켜짐' : '꺼짐', cfg.enabled !== false);
          chip('의미 검색', cfg.embeddingEnabled ? (cfg.autoEmbedOnExtract !== false ? '켜짐' : '수동 준비') : '꺼짐', !!cfg.embeddingEnabled);
          db.entries.toArray().then(entries => {
            const active = new Set(activePacks);
            const usable = active.size ? entries.filter(e => active.has(e.packName)).length : 0;
            entryValue.textContent = usable + '개';
            entryValue.style.color = usable ? '#4a9' : '#da8';
            if (activePacks.length) packValue.textContent = activePacks.join(', ');
          }).catch(() => { entryValue.textContent = '확인 실패'; entryValue.style.color = '#d66'; });
        }});
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
              if (!confirm('[' + preset.name + '] 설정을 적용할까요?')) return;
              if (_w.__LoreInj.applyPresetKeepState) _w.__LoreInj.applyPresetKeepState(preset.config);
              else { settings.config = JSON.parse(JSON.stringify(_w.__LoreInj.defaultSettings)); Object.assign(settings.config, preset.config); settings.save(); }
              m.replaceContentPanel((p) => p.addText('설정이 적용되었습니다. 홈 화면을 다시 열면 변경된 값이 표시됩니다.'), '설정 적용 완료');
            };
            row.appendChild(btn);
          }
          nd.appendChild(row);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow('로어 자동 삽입', '현재 메시지에 관련 로어를 자동으로 넣음.', settings.config.enabled !== false, (v) => { settings.config.enabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('로어 자동 추출', '일정 턴마다 대화 내용을 로어로 정리함. 수동 추출은 이 설정과 관계없이 실행할 수 있음.', settings.config.autoExtEnabled !== false, (v) => { settings.config.autoExtEnabled = v; settings.save(); }));

          nd.appendChild(C.createToggleRow('남은 공간에 맞추기', '입력 가능한 글자 수에 맞춰 로어 내용을 간결하게 넣음.', settings.config.useCompressedFormat !== false, (v) => { settings.config.useCompressedFormat = v; settings.save(); }));
          const cmpWrap = document.createElement('div'); cmpWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-left:10px;';
          const cmpLbl = document.createElement('div'); cmpLbl.textContent = '삽입 내용 길이'; cmpLbl.style.cssText = 'font-size:12px;color:#aaa;';
          const cmpSel = document.createElement('select'); cmpSel.style.cssText = 'width:120px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;';
          [{v:'auto', l:'자동'}, {v:'full', l:'내용 전체'}, {v:'compact', l:'간결하게'}, {v:'micro', l:'핵심만'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; cmpSel.appendChild(opt); });
          cmpSel.value = settings.config.compressionMode || 'auto';
          cmpSel.onchange = () => { settings.config.compressionMode = cmpSel.value; settings.save(); };
          cmpWrap.appendChild(cmpLbl); cmpWrap.appendChild(cmpSel); nd.appendChild(cmpWrap);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '검색 & 감지'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(t);
          nd.appendChild(C.createToggleRow('의미로 찾기', '단어가 달라도 관련 로어 찾음. API/검색 준비 필요.', settings.config.embeddingEnabled, (v) => { settings.config.embeddingEnabled = v; settings.save(); }));
          const emRow = document.createElement('div'); emRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
          const emL = document.createElement('div'); emL.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const eml1 = document.createElement('div'); eml1.textContent = '의미 검색 모델'; eml1.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          emL.appendChild(eml1);
          const emSel = document.createElement('select'); emSel.style.cssText = 'width:200px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'gemini-embedding-001',l:'gemini-embedding-001'},{v:'gemini-embedding-2',l:'gemini-embedding-2'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; emSel.appendChild(opt); });
          emSel.value = settings.config.embeddingModel || 'gemini-embedding-001';
          emSel.onchange = () => { settings.config.embeddingModel = emSel.value; settings.save(); alert('의미 검색 모델을 변경했습니다. 기존 로어팩의 검색 준비를 다시 실행해 주세요.'); };
          emRow.appendChild(emL); emRow.appendChild(emSel); nd.appendChild(emRow);

          nd.appendChild(C.createToggleRow('추출 후 검색 준비', '새 로어를 의미 검색용으로 자동 준비함.', settings.config.autoEmbedOnExtract !== false, (v) => { settings.config.autoEmbedOnExtract = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('오래된 정보도 가끔 넣기', '직접 관련이 약해도 중요한 과거 정보를 주기적으로 넣음.', settings.config.periodicRecallEnabled !== false, (v) => { settings.config.periodicRecallEnabled = v; settings.config.decayEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('AI로 후보 다시 고르기', '검색 후보를 AI가 현재 장면 기준으로 다시 정렬함.', settings.config.rerankEnabled || false, (v) => { settings.config.rerankEnabled = v; settings.save(); }));
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div'); title.textContent = '주입 제어'; title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(title);
          const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:10px;';
          const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const t = document.createElement('div'); t.textContent = '주입 위치'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const d = document.createElement('div'); d.textContent = '사용자 메시지 기준으로 로어를 넣을 위치.'; d.style.cssText = 'font-size:11px;color:#888;';
          left.appendChild(t); left.appendChild(d);
          const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;';
          const b1 = document.createElement('button'), b2 = document.createElement('button');
          const updateBtns = () => { const isB = settings.config.position === 'before'; b1.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${isB ? '#285' : '#444'};background:${isB ? '#285' : 'transparent'};color:${isB ? '#fff' : '#ccc'};`; b2.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!isB ? '#285' : '#444'};background:${!isB ? '#285' : 'transparent'};color:${!isB ? '#fff' : '#ccc'};`; };
          b1.textContent = '메시지 앞'; b1.onclick = () => { settings.config.position = 'before'; settings.save(); updateBtns(); };
          b2.textContent = '메시지 뒤'; b2.onclick = () => { settings.config.position = 'after'; settings.save(); updateBtns(); };
          updateBtns(); right.appendChild(b1); right.appendChild(b2); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);
          nd.appendChild(C.createToggleRow('삽입 쿨타임 사용', '같은 로어가 너무 자주 들어가지 않게 막음.', settings.config.cooldownEnabled !== false, (v) => { settings.config.cooldownEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('삽입 흔적 자동 정리', '지난 로어 참조문을 나중에 걷어내 대화 기록을 깔끔하게 유지함.', settings.config.injectionCleanupEnabled !== false, (v) => { settings.config.injectionCleanupEnabled = v; settings.save(); }));
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:12px;margin-top:8px;align-items:center;';
          row.appendChild(makeNumberField('삽입 쿨타임(턴)', 'cooldownTurns', 3, { min: 1 }));
          row.appendChild(makeNumberField('한 번에 넣을 로어', 'maxEntries', 3, { min: 1 }));
          row.appendChild(makeNumberField('흔적 정리(턴)', 'injectionCleanupTurns', 8, { min: 1 }));
          nd.appendChild(row);
          const memoryDetails = document.createElement('details');
          memoryDetails.style.cssText = 'margin-top:10px;border-top:1px solid #292929;padding-top:8px;';
          const memorySummary = document.createElement('summary');
          memorySummary.textContent = '재주입 판단';
          memorySummary.style.cssText = 'font-size:12px;color:#aaa;font-weight:bold;cursor:pointer;';
          memoryDetails.appendChild(memorySummary);
          memoryDetails.appendChild(C.createToggleRow('최근 문맥에 맞춰 자동 조절', '플랫폼이 이미 기억할 대화량을 추정해 같은 로어의 재주입 시점을 조절함.', settings.config.adaptiveAiMemory !== false, (v) => { settings.config.adaptiveAiMemory = v; settings.save(); }));
          const memoryRow = document.createElement('div'); memoryRow.style.cssText = 'display:flex;gap:12px;margin-top:8px;align-items:center;';
          memoryRow.appendChild(makeNumberField('최근 문맥 추정(토큰)', 'nativeContextTokenBudget', 10000, { min: 1000, max: 100000 }));
          memoryDetails.appendChild(memoryRow);
          nd.appendChild(memoryDetails);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const tr = document.createElement('div'); tr.textContent = '추가 정보 주입'; tr.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(tr);
          nd.appendChild(C.createToggleRow('호칭 정보', '캐릭터 간 호칭 정보 함께 전달함.', settings.config.honorificMatrixEnabled !== false, (v) => { settings.config.honorificMatrixEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('첫 만남/재회 관리', '첫 만남/재회 여부 자동 전달함.', settings.config.firstEncounterWarning !== false, (v) => { settings.config.firstEncounterWarning = v; settings.save(); }));
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
            if (!confirm('일반 설정을 초기화할까요? API 연결, 로어, 로어팩 활성 상태는 유지됩니다.')) return;
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
                autoExtGeminiEmbedKey: settings.config.autoExtGeminiEmbedKey,
                autoExtDeepSeekKey: settings.config.autoExtDeepSeekKey,
                autoExtOpenAIBaseUrl: settings.config.autoExtOpenAIBaseUrl,
                autoExtOpenAIKey: settings.config.autoExtOpenAIKey,
                embeddingModel: settings.config.embeddingModel
              };
              _ls.removeItem('lore-injector-v5');
              Object.assign(settings.config, keep);
              settings.save();
            }
            location.reload();
          }; nd.appendChild(resetBtn);
        }});
      }, '홈/주입 설정');
    });
  });

  _w.__LoreInj.__subMainLoaded = true;
})();
