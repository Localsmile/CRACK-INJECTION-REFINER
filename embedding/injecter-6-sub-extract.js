// injecter-6-sub-extract.js: 자동 대화 추출 + 배치 추출 + 템플릿 + URL/텍스트 변환
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subExtractLoaded) return;
  
  const { C, db, settings, getAutoExtPackForUrl, setAutoExtPackForUrl, setPackEnabled } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  function buildGenerationApiOpts(overrides = {}, costContext = null) {
    if (typeof _w.__LoreInj.buildGenerationApiOpts === 'function') {
      return _w.__LoreInj.buildGenerationApiOpts(overrides, costContext);
    }
    const cfg = settings.config || {};
    const apiType = cfg.autoExtApiType || 'key';
    const model = cfg.autoExtModel === '_custom'
      ? cfg.autoExtCustomModel
      : cfg.autoExtModel;
    const opts = {
      apiType,
      key: apiType === 'openai' ? (cfg.autoExtOpenAIKey || cfg.autoExtKey) : cfg.autoExtKey,
      deepSeekKey: cfg.autoExtDeepSeekKey,
      openAIBaseUrl: cfg.autoExtOpenAIBaseUrl || '',
      openAIKey: cfg.autoExtOpenAIKey || '',
      openAIReasoning: cfg.autoExtOpenAIReasoning || 'off',
      openAIFormat: cfg.autoExtOpenAIFormat || 'custom',
      vertexJson: cfg.autoExtVertexJson,
      vertexLocation: cfg.autoExtVertexLocation || 'global',
      vertexProjectId: cfg.autoExtVertexProjectId,
      firebaseScript: cfg.autoExtFirebaseScript,
      firebaseEmbedKey: cfg.autoExtFirebaseEmbedKey,
      model: model || (apiType === 'openai' ? '' : (apiType === 'deepseek' ? 'deepseek-v4-flash' : 'gemini-3-flash-preview')),
      maxRetries: cfg.autoExtMaxRetries || 1,
      responseMimeType: 'application/json',
      costContext,
      ...overrides
    };
    const reasoning = cfg.importReasoning || cfg.autoExtReasoning || 'medium';
    const budget = Number(cfg.importBudget || cfg.autoExtBudget || 2048);
    const modelName = String(opts.model || '').toLowerCase();
    if (apiType !== 'deepseek' && apiType !== 'openai') {
      if (modelName.includes('gemini-3') && reasoning !== 'off') {
        opts.thinkingConfig = { thinkingLevel: reasoning === 'budget'
          ? (budget >= 4096 ? 'high' : (budget >= 2048 ? 'medium' : (budget >= 1024 ? 'low' : 'minimal')))
          : (['minimal', 'low', 'medium', 'high'].includes(reasoning) ? reasoning : 'medium') };
      } else if (modelName.includes('gemini-2.5')) {
        const budgetMap = { minimal: 512, low: 1024, medium: 2048, high: 4096 };
        if (reasoning === 'off') opts.thinkingConfig = modelName.includes('pro') ? {} : { thinkingBudget: 0 };
        else if (reasoning === 'budget') opts.thinkingConfig = { thinkingBudget: Math.max(-1, Number.isFinite(budget) ? budget : 2048) };
        else if (budgetMap[reasoning] != null) opts.thinkingConfig = { thinkingBudget: budgetMap[reasoning] };
      }
      if (modelName.includes('pro') && opts.thinkingConfig?.thinkingLevel === 'minimal') {
        opts.thinkingConfig.thinkingLevel = 'low';
      }
    }
    return opts;
  }

  async function prepareImportedPackEmbedding(packName, chatKey, setBusy) {
    if (!settings.config.embeddingEnabled) return { skipped: true, reason: '의미 검색이 꺼져 있음' };
    const missing = typeof _w.__LoreInj.getApiMissingReason === 'function'
      ? _w.__LoreInj.getApiMissingReason(settings.config, 'embed')
      : '';
    if (missing) return { skipped: true, reason: missing };
    if (!C || typeof C.embedPack !== 'function') return { skipped: true, reason: '검색 준비 기능을 찾을 수 없음' };
    try {
      setBusy('생성한 로어를 검색 준비 중');
      const opts = typeof _w.__LoreInj.buildEmbeddingApiOpts === 'function'
        ? _w.__LoreInj.buildEmbeddingApiOpts({ model: settings.config.embeddingModel || 'gemini-embedding-001' }, { feature: 'importEmbed', chatKey: chatKey || 'global' })
        : { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, model: settings.config.embeddingModel || 'gemini-embedding-001' };
      const count = await C.embedPack(packName, opts, (done, total) => setBusy('생성한 로어를 검색 준비 중: ' + done + '/' + total));
      return { count };
    } catch (e) {
      return { failed: true, error: e && e.message ? e.message : String(e) };
    }
  }

  function appendEmbeddingResult(message, result) {
    if (!result) return message;
    if (result.failed) return message + ' / 검색 준비 실패: ' + String(result.error || '알 수 없음').slice(0, 80);
    if (result.skipped) return message + ' / 검색 준비 생략: ' + result.reason;
    return message + ' / 검색 준비 ' + (result.count || 0) + '개 완료';
  }

  const EXTRACT_TOPIC_OPTIONS = [
    ['identityState', '인물·현재 상태'],
    ['relationships', '관계 변화'],
    ['interactionStyle', '호칭·말투·대하는 방식'],
    ['obligations', '약속·의무'],
    ['worldContinuity', '세계·장소·물건·능력'],
    ['majorScenes', '중요 장면'],
    ['importantLines', '기억할 대사']
  ];

  function appendTopicChecklist(parent, settingKey) {
    const title = document.createElement('div'); title.textContent = '추출할 항목'; title.style.cssText = 'font-size:11px;color:#999;margin:10px 0 5px;'; parent.appendChild(title);
    const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:5px 10px;margin-bottom:10px;';
    const current = settings.config[settingKey] && typeof settings.config[settingKey] === 'object'
      ? settings.config[settingKey]
      : {};
    for (const [key, label] of EXTRACT_TOPIC_OPTIONS) {
      const row = document.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#aaa;cursor:pointer;min-width:0;';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = current[key] !== false;
      checkbox.onchange = () => {
        const next = { ...(settings.config[settingKey] || {}) };
        next[key] = checkbox.checked;
        settings.config[settingKey] = next;
        settings.save();
      };
      row.appendChild(checkbox); row.appendChild(document.createTextNode(label)); grid.appendChild(row);
    }
    parent.appendChild(grid);
    const note = document.createElement('div'); note.textContent = '기억할 대사는 나중에 다시 인용될 가능성이 뚜렷한 대사만 저장하며, 해당되는 대사가 없으면 만들지 않음.'; note.style.cssText = 'font-size:10px;color:#777;line-height:1.4;margin-top:-4px;margin-bottom:10px;'; parent.appendChild(note);
  }

  function appendSectionTitle(parent, title, description) {
    const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin:4px 0 5px;'; parent.appendChild(h);
    if (description) { const d = document.createElement('div'); d.textContent = description; d.style.cssText = 'font-size:11px;color:#888;line-height:1.45;margin-bottom:8px;'; parent.appendChild(d); }
  }
  
  _w.__LoreInj.registerSubMenu('extract', function(modal) {
    modal.createSubMenu('로어 추출/변환', (m) => {
      m.replaceContentPanel((panel) => {
        // === 자동/수동 로어 추출 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          appendSectionTitle(nd, '자동 추출', '설정한 주기마다 최근 대화에서 선택한 항목을 로어로 저장함.');
          nd.appendChild(C.createToggleRow('자동 로어 추출', '정해진 턴마다 대화를 로어에 추가함.', settings.config.autoExtEnabled, (v) => { settings.config.autoExtEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('자동 추출에서 중요 장면 정밀 분석', '중요 장면을 선택한 경우 전용 API 호출을 한 번 더 실행함. 시간과 생성 API 사용량이 늘어남.', settings.config.temporalExtractAutoEnabled === true, (v) => { settings.config.temporalExtractAutoEnabled = v; settings.save(); }));
          appendTopicChecklist(nd, 'autoExtractTopics');

          const row1 = document.createElement('div'); row1.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px;align-items:center;';
          const makeInput = (label, key, defaultVal) => {
            const f = document.createElement('div'); f.style.minWidth = '0';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; i.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal;
            i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            const saveNum = () => { const v = parseInt(i.value); if (!isNaN(v)) { settings.config[key] = v; settings.save(); } };
            i.oninput = saveNum; i.onchange = saveNum;
            f.appendChild(l); f.appendChild(i); return f;
          };
          row1.appendChild(makeInput('실행 주기(턴)', 'autoExtTurns', 8)); row1.appendChild(makeInput('읽을 대화(턴)', 'autoExtScanRange', 6)); row1.appendChild(makeInput('최근 제외(턴)', 'autoExtOffset', 3));
          nd.appendChild(row1);

          const divider = document.createElement('div'); divider.style.cssText = 'border-top:1px solid #333;margin:12px 0;'; nd.appendChild(divider);
          appendSectionTitle(nd, '수동 추출', '버튼을 누를 때만 별도의 범위와 항목으로 최근 대화를 추출함.');
          nd.appendChild(C.createToggleRow('수동 추출에서 중요 장면 정밀 분석', '중요 장면을 선택한 경우 일반 추출 뒤 전용 분석을 한 번 더 실행함.', settings.config.temporalExtractEnabled !== false, (v) => { settings.config.temporalExtractEnabled = v; settings.save(); }));
          appendTopicChecklist(nd, 'manualExtractTopics');
          const manualRow = document.createElement('div'); manualRow.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:12px;';
          manualRow.appendChild(makeInput('읽을 대화(턴)', 'manualExtScanRange', 5)); manualRow.appendChild(makeInput('최근 제외(턴)', 'manualExtOffset', 3)); nd.appendChild(manualRow);

          const sharedDivider = document.createElement('div'); sharedDivider.style.cssText = 'border-top:1px solid #333;margin:12px 0;'; nd.appendChild(sharedDivider);
          appendSectionTitle(nd, '공통 저장 방식', '자동 추출과 수동 추출이 함께 사용하는 중복 방지와 저장 설정.');
          nd.appendChild(C.createToggleRow('기존 로어 참고', '저장된 로어를 같이 참고해 중복 저장 줄임.', settings.config.autoExtIncludeDb, (v) => { settings.config.autoExtIncludeDb = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('변경분만 저장', '바뀐 내용만 받아 저장해 비용과 시간을 줄임.', settings.config.autoExtPatchMode !== false, (v) => { settings.config.autoExtPatchMode = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('내 캐릭터 이름 함께 사용', '추출할 때 현재 페르소나 이름을 참고함.', settings.config.autoExtIncludePersona, (v) => { settings.config.autoExtIncludePersona = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('진행 상태 표시', '추출, 전체 대화 추출, 검색 준비 진행 상태를 화면에 띄움. 모바일에서 겹치면 끄기.', settings.config.extractStatusBadgeEnabled !== false, (v) => { settings.config.extractStatusBadgeEnabled = v; settings.save(); if (!v && C.hideStatusBadge) C.hideStatusBadge(); }));

          const row2 = document.createElement('div'); row2.style.cssText = 'display:flex;gap:12px;margin-bottom:12px;align-items:center;';
          const f3 = document.createElement('div'); f3.style.flex = '1';
          const l3 = document.createElement('div'); l3.textContent = '저장할 로어팩'; l3.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
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
  
          const btnRun = document.createElement('button'); btnRun.textContent = '최근 대화에서 로어 추출';
          btnRun.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;width:100%;margin-top:10px;';
          const btnStatus = document.createElement('div'); btnStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.4;'; btnStatus.textContent = '';
          btnRun.onclick = async () => {
            if (!confirm('설정한 범위의 최근 대화에서 로어를 추출할까요?')) return;
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
              await _w.__LoreInj.runAutoExtract(true);
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
  
        // === 과거 장면 불러오기 판단 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const jt = document.createElement('div'); jt.textContent = '과거 장면 불러오기 판단'; jt.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:6px;'; nd.appendChild(jt);
          const jd = document.createElement('div'); jd.textContent = '저장된 장면 기억 중 지금 대화에 필요한 것만 고르는 방식.'; jd.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;'; nd.appendChild(jd);
          nd.appendChild(C.createToggleRow('AI가 참고 장면 고르기', '관련 장면을 한 번 더 추려 정확도를 높임. 시간이 조금 더 걸릴 수 있음.', settings.config.temporalRecallJudgeEnabled, (v) => { settings.config.temporalRecallJudgeEnabled = v; settings.save(); }));
          const jrow = document.createElement('div'); jrow.style.cssText = 'display:flex;gap:12px;margin-top:10px;';
          const jmkNum = (label, key, defaultVal, min, max) => { const f = document.createElement('div'); f.style.flex = '1'; const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; const i = document.createElement('input'); i.type = 'number'; i.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal; if (min !== undefined) i.min = min; if (max !== undefined) i.max = max; i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;'; const save = () => { const v = parseInt(i.value); if (!isNaN(v)) { settings.config[key] = v; settings.save(); } }; i.oninput = save; i.onchange = save; f.appendChild(l); f.appendChild(i); return f; };
          jrow.appendChild(jmkNum('판단 제한 시간(ms)', 'temporalRecallJudgeTimeoutMs', 8000, 1000, 60000));
          jrow.appendChild(jmkNum('검토할 장면 수', 'temporalRecallJudgeCandidateLimit', 6, 1, 30));
          nd.appendChild(jrow);
        }});
  
        // === 전체 대화 추출 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const bTitle = document.createElement('div'); bTitle.textContent = '전체 대화 추출'; bTitle.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;'; nd.appendChild(bTitle);
          const bDesc = document.createElement('div'); bDesc.textContent = '긴 대화를 여러 구간으로 나눠 로어에 저장함. 성공한 구간은 바로 보존하고 실패한 구간만 나중에 다시 시도할 수 있음.'; bDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;'; nd.appendChild(bDesc);
  
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
          bRow.appendChild(mkNum('한 번에 읽을 턴', () => settings.config.batchExtTurnsPerBatch, v => settings.config.batchExtTurnsPerBatch = v, 50));
          bRow.appendChild(mkNum('겹쳐 읽을 턴', () => settings.config.batchExtOverlap, v => settings.config.batchExtOverlap = v, 5));
          bRow.appendChild(mkNum('재시도', () => settings.config.batchExtMaxAttempts, v => settings.config.batchExtMaxAttempts = v, 3));
          nd.appendChild(bRow);
          nd.appendChild(C.createToggleRow('전체 추출에서 중요 장면 정밀 분석', '중요 장면 항목을 선택한 경우 각 대화 구간마다 전용 API 호출을 추가함.', settings.config.temporalExtractBatchEnabled === true, (v) => { settings.config.temporalExtractBatchEnabled = v; settings.save(); }));
  
          const retryJob = typeof _w.__LoreInj.getBatchRetryJob === 'function' ? _w.__LoreInj.getBatchRetryJob() : null;
          const jobBox = document.createElement('div'); jobBox.style.cssText = 'margin:10px 0;padding:9px;border:1px solid ' + (retryJob ? '#642' : '#2d2d2d') + ';border-radius:4px;background:#111;';
          const jobTitle = document.createElement('div'); jobTitle.textContent = '전체 추출 작업 현황'; jobTitle.style.cssText = 'font-size:12px;font-weight:bold;color:#ccc;margin-bottom:4px;'; jobBox.appendChild(jobTitle);
          const jobText = document.createElement('div'); jobText.style.cssText = 'font-size:11px;color:' + (retryJob ? '#da8' : '#777') + ';line-height:1.45;';
          jobText.textContent = retryJob
            ? (retryJob.failedBatchIndexes.length
              ? '다시 시도할 구간 ' + retryJob.failedBatchIndexes.join(', ') + ' / 전체 ' + retryJob.totalBatches + '개 구간 · 마지막 저장 ' + (retryJob.lastEntriesAdded || 0) + '건'
              : '로어 추출은 저장됨 · 검색 준비만 다시 시도 필요')
            : '다시 시도할 실패 구간 없음';
          jobBox.appendChild(jobText);
          nd.appendChild(jobBox);

          const bBtn = document.createElement('button'); bBtn.textContent = '전체 대화에서 로어 추출';
          bBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:none;font-weight:bold;width:100%;margin-top:6px;';
          const bStatus = document.createElement('div'); bStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;';
          const runBatch = async (button, runOpts) => {
            settings.save();
            button.disabled = true; bBtn.disabled = true; const orig = button.textContent; button.textContent = '실행 중...';
            bStatus.textContent = '전체 대화 가져오는 중'; bStatus.style.color = '#4a9';
            const start = Date.now();
            try {
              const report = await _w.__LoreInj.runBatchExtract({
                turnsPerBatch: runOpts.turnsPerBatch || settings.config.batchExtTurnsPerBatch || 50,
                overlap: runOpts.overlap !== undefined ? runOpts.overlap : (settings.config.batchExtOverlap !== undefined ? settings.config.batchExtOverlap : 5),
                maxAttempts: runOpts.maxAttempts || settings.config.batchExtMaxAttempts || 3,
                onlyBatchIndexes: Array.isArray(runOpts.onlyBatchIndexes)
                  ? runOpts.onlyBatchIndexes
                  : (Array.isArray(runOpts.failedBatchIndexes) ? runOpts.failedBatchIndexes : undefined),
                onProgress: (ev) => {
                  const sec = Math.floor((Date.now() - start) / 1000);
                  if (ev.phase === 'batch') bStatus.textContent = '구간 ' + ev.index + '/' + ev.total + ' 처리 중 (' + sec + '초)';
                  else if (ev.phase === 'embedding') bStatus.textContent = '저장한 로어 검색 준비 중 (' + sec + '초)';
                }
              });
              const sec = Math.floor((Date.now() - start) / 1000);
              let msg = '완료 (' + sec + '초) · 이번 실행 ' + report.attemptedBatches + '개 구간 / 내용 있음 ' + report.ok + ' / 변경 없음 ' + report.empty + ' / 저장 ' + report.entriesAdded + '건';
              if (report.failed > 0) { msg += ' / 다시 시도 ' + report.failedBatchIndexes.join(', '); bStatus.style.color = '#da8'; }
              else { bStatus.style.color = '#4a9'; }
              if (report.embedError) msg += ' / 검색 준비 실패: ' + report.embedError.slice(0, 60);
              bStatus.textContent = msg;
            } catch(e) {
              bStatus.textContent = '실패 — ' + (e.message || String(e)).slice(0, 80);
              bStatus.style.color = '#d66';
            } finally {
              button.textContent = orig; button.disabled = false; bBtn.disabled = false;
            }
          };
          bBtn.onclick = async () => {
            if (!confirm('전체 대화를 여러 구간으로 나누어 추출합니다. 오래 걸릴 수 있습니다. 계속할까요?')) return;
            await runBatch(bBtn, {});
          };
          if (retryJob) {
            const retryBtn = document.createElement('button'); retryBtn.textContent = retryJob.failedBatchIndexes.length ? '실패 구간만 다시 시도' : '검색 준비 다시 시도'; retryBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#642;color:#f2d2a0;border:1px solid #864;font-weight:bold;width:100%;margin-top:6px;';
            retryBtn.onclick = async () => {
              const question = retryJob.failedBatchIndexes.length
                ? '실패한 ' + retryJob.failedBatchIndexes.length + '개 구간만 다시 추출할까요?'
                : '저장된 로어의 검색 준비를 다시 시도할까요?';
              if (!confirm(question)) return;
              await runBatch(retryBtn, retryJob);
            };
            nd.appendChild(retryBtn);
          }
          nd.appendChild(bBtn);
          nd.appendChild(bStatus);
        }});
  
        // === 지식 변환 (URL/텍스트 → 로어) ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';
          nd.innerHTML = '<div style="font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;">지식 변환 (URL/텍스트 → 로어)</div>';
          const urlInp = document.createElement('input'); urlInp.type = 'text'; urlInp.placeholder = 'URL 입력'; urlInp.style.cssText = S; nd.appendChild(urlInp);
          const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.placeholder = '팩 이름'; nameInp.style.cssText = S; nd.appendChild(nameInp);
          const rDiv = document.createElement('div'); rDiv.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const urlBtn = document.createElement('button'); urlBtn.textContent = 'URL 변환'; urlBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          urlBtn.onclick = async () => {
            if (!urlInp.value.trim() || !nameInp.value.trim()) { alert('URL과 저장할 로어팩 이름을 입력해 주세요.'); return; }
            urlBtn.disabled = true; urlBtn.textContent = '변환중...';
            const startMs = Date.now();
            let phaseMsg = '에리가 URL 본문 가져오는 중';
            const setBusy = (msg, color = '#4a9') => {
              phaseMsg = msg;
              rDiv.textContent = msg;
              rDiv.style.color = color;
              try { C.showStatusBadge(msg); } catch (_) {}
            };
            const tick = setInterval(() => {
              const sec = Math.floor((Date.now() - startMs) / 1000);
              setBusy(phaseMsg.replace(/\s*\(\d+초\)$/, '') + ` (${sec}초)`);
            }, 1000);
            setBusy(phaseMsg + ' (0초)');
            try {
              const cnt = await C.importFromUrl(urlInp.value.trim(), nameInp.value.trim(), buildGenerationApiOpts({}, { feature: 'urlImport', chatKey: (C.getCurrentChatId && C.getCurrentChatId()) || 'global' }), {
                onProgress: (ev) => {
                  if (!ev) return;
                  switch (ev.phase) {
                    case 'fetch:start':
                      setBusy('에리가 URL 본문 가져오는 중');
                      break;
                    case 'fetch:try': {
                      const methodLabel = ({ 'gm-direct': 'GM 직접 요청', 'fetch': '브라우저 fetch', 'proxy': '공용 프록시' })[ev.method] || ev.method;
                      const suffix = ev.method === 'proxy' ? ` #${ev.attempt}/${ev.total}` : '';
                      const sec = Math.max(1, Math.floor((ev.timeoutMs || 15000) / 1000));
                      setBusy(`에리가 URL 가져오는 중 · ${methodLabel}${suffix} (최대 ${sec}초)`);
                      break;
                    }
                    case 'fetch:done':
                      setBusy(`에리가 URL 본문 받음 · ${((ev.bytes || 0) / 1024).toFixed(1)}KB`);
                      break;
                    case 'parse':
                      setBusy('에리가 HTML 정리 중');
                      break;
                    case 'fetch:fail':
                      setBusy('URL 가져오기 실패 — 모든 경로 컷', '#d66');
                      break;
                    case 'chunk':
                      setBusy(`URL 내용을 로어로 변환 중: 구간 ${ev.chunk}/${ev.total} · 시도 ${ev.attempt}/${ev.maxAttempts}`);
                      break;
                  }
                }
              });
              const rpt = C.__lastImportReport;
              let msg = '✅ ' + cnt + '개 생성';
              if (rpt) {
                if (rpt.failed > 0) {
                  const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || '';
                  msg += ' / 일부 구간 실패 ' + rpt.failed + '/' + rpt.chunks + ': ' + firstErr.slice(0, 80);
                } else if (cnt === 0 && rpt.empty === rpt.chunks) {
                  msg = '0개 - 모든 구간(' + rpt.chunks + '개)에서 저장할 내용을 찾지 못함';
                }
              }
              let embedResult = null;
              if (cnt > 0) {
                await setPackEnabled(nameInp.value.trim(), true);
                embedResult = await prepareImportedPackEmbedding(nameInp.value.trim(), (C.getCurrentChatId && C.getCurrentChatId()) || 'global', setBusy);
              }
              rDiv.textContent = appendEmbeddingResult(msg, embedResult);
              rDiv.style.color = cnt > 0 && !(embedResult && embedResult.failed) ? '#4a9' : '#da8';
            } catch (e) {
              rDiv.textContent = '❌ ' + (e.message || String(e));
              rDiv.style.color = '#d66';
            } finally {
              clearInterval(tick);
              try { C.hideStatusBadge(); } catch (_) {}
              urlBtn.textContent = 'URL 변환'; urlBtn.disabled = false;
            }
          };
          nd.appendChild(urlBtn); nd.appendChild(rDiv);
          const t2 = document.createElement('div'); t2.innerHTML = '<div style="font-size:13px;color:#ccc;font-weight:bold;margin-top:16px;margin-bottom:8px;">텍스트 → 로어 팩</div>'; nd.appendChild(t2);
          const ta = document.createElement('textarea'); ta.placeholder = '설정, 소설 텍스트 등'; ta.style.cssText = S + 'height:100px;resize:vertical;'; nd.appendChild(ta);
          const nameInp2 = document.createElement('input'); nameInp2.type = 'text'; nameInp2.placeholder = '팩 이름'; nameInp2.style.cssText = S; nd.appendChild(nameInp2);
          const rDiv2 = document.createElement('div'); rDiv2.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const tBtn = document.createElement('button'); tBtn.textContent = '텍스트 변환'; tBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          tBtn.onclick = async () => {
            if (!ta.value.trim() || !nameInp2.value.trim()) { alert('변환할 텍스트와 저장할 로어팩 이름을 입력해 주세요.'); return; }
            tBtn.disabled = true; tBtn.textContent = '변환중...';
            const startMs = Date.now();
            let phaseMsg = '에리가 텍스트를 로어로 변환 중';
            const setBusy = (msg, color = '#4a9') => {
              phaseMsg = msg;
              rDiv2.textContent = msg;
              rDiv2.style.color = color;
              try { C.showStatusBadge(msg); } catch (_) {}
            };
            const tick = setInterval(() => {
              const sec = Math.floor((Date.now() - startMs) / 1000);
              setBusy(phaseMsg.replace(/\s*\(\d+초\)$/, '') + ` (${sec}초)`);
            }, 1000);
            setBusy(phaseMsg + ' (0초)');
            try {
              const cnt = await C.importFromText(ta.value.trim(), nameInp2.value.trim(), buildGenerationApiOpts({}, { feature: 'textImport', chatKey: (C.getCurrentChatId && C.getCurrentChatId()) || 'global' }), {
                onProgress: (ev) => {
                  if (ev && ev.phase === 'chunk') {
                    setBusy(`텍스트를 로어로 변환 중: 구간 ${ev.chunk}/${ev.total} · 시도 ${ev.attempt}/${ev.maxAttempts}`);
                  }
                }
              });
              const rpt = C.__lastImportReport;
              let msg = '✅ ' + cnt + '개 생성';
              if (rpt) {
                if (rpt.failed > 0) {
                  const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || '';
                  msg += ' / 일부 구간 실패 ' + rpt.failed + '/' + rpt.chunks + ': ' + firstErr.slice(0, 80);
                } else if (cnt === 0 && rpt.empty === rpt.chunks) {
                  msg = '0개 - 모든 구간(' + rpt.chunks + '개)에서 저장할 내용을 찾지 못함';
                }
              }
              let embedResult = null;
              if (cnt > 0) {
                await setPackEnabled(nameInp2.value.trim(), true);
                embedResult = await prepareImportedPackEmbedding(nameInp2.value.trim(), (C.getCurrentChatId && C.getCurrentChatId()) || 'global', setBusy);
              }
              rDiv2.textContent = appendEmbeddingResult(msg, embedResult);
              rDiv2.style.color = cnt > 0 && !(embedResult && embedResult.failed) ? '#4a9' : '#da8';
            } catch (e) {
              rDiv2.textContent = '❌ ' + (e.message || String(e));
              rDiv2.style.color = '#d66';
            } finally {
              clearInterval(tick);
              try { C.hideStatusBadge(); } catch (_) {}
              tBtn.textContent = '텍스트 변환'; tBtn.disabled = false;
            }
          };
          nd.appendChild(tBtn); nd.appendChild(rDiv2);
        }});
      }, '로어 추출/변환');
    });
  });
  
  _w.__LoreInj.__subExtractLoaded = true;
})();
