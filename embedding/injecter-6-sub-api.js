// injecter-6-sub-api.js: API 설정
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subApiLoaded) return;

  const { C, settings } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  // Firebase 사전 워밍업 — 첨 실호출의 SDK import + initializeApp 비용을 백그라운드로 분리. 실패해도 조용히 넘김.
  if (settings.config.autoExtApiType === 'firebase' && settings.config.autoExtFirebaseScript && C.warmupFirebase) {
    C.warmupFirebase(settings.config.autoExtFirebaseScript, settings.config.autoExtModel || 'gemini-3-flash-preview').catch(() => {});
  }

  const FIELD_STYLE = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';

  function addSelect(nd, label, value, groups, onChange, opts = {}) {
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;';
    nd.appendChild(l);
    const sel = document.createElement('select');
    sel.style.cssText = FIELD_STYLE;
    groups.forEach(([g, items]) => {
      const og = document.createElement('optgroup');
      og.label = g;
      items.forEach(([text, val]) => {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = text;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = value;
    nd.appendChild(sel);
    let customInput = null;
    if (opts.customKey) {
      customInput = document.createElement('input');
      customInput.value = settings.config[opts.customKey] || '';
      customInput.placeholder = '모델명 직접 입력';
      customInput.style.cssText = FIELD_STYLE + 'margin-top:6px;' + (sel.value === '_custom' ? '' : 'display:none;');
      customInput.onchange = () => { settings.config[opts.customKey] = customInput.value; settings.save(); if (opts.onCustomChange) opts.onCustomChange(customInput.value); };
      nd.appendChild(customInput);
    }
    sel.onchange = () => {
      onChange(sel.value);
      if (customInput) customInput.style.display = sel.value === '_custom' ? '' : 'none';
      if (opts.onAfterChange) opts.onAfterChange(sel.value, customInput);
    };
    return { sel, customInput };
  }

  function addPromptArea(nd, label, value, onChange, opts = {}) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:12px 0 4px;';
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;';
    row.appendChild(l);
    if (opts.reset) {
      const btn = document.createElement('button');
      btn.textContent = '기본값 복구';
      btn.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:3px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
      row.appendChild(btn);
      btn.onclick = () => {
        if (!confirm(label + ' 기본값 복구?')) return;
        ta.value = opts.reset();
        onChange(ta.value);
      };
    }
    nd.appendChild(row);
    const ta = document.createElement('textarea');
    ta.value = value || '';
    ta.style.cssText = FIELD_STYLE + 'height:' + (opts.height || 140) + 'px;font-family:monospace;resize:vertical;margin-bottom:10px;';
    ta.onchange = () => onChange(ta.value);
    nd.appendChild(ta);
    return ta;
  }

  function addSimpleInput(nd, label, value, onChange, opts = {}) {
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;';
    nd.appendChild(l);
    const inp = document.createElement('input');
    inp.type = opts.type || 'text';
    inp.value = value || '';
    inp.placeholder = opts.placeholder || '';
    inp.style.cssText = FIELD_STYLE;
    inp.onchange = () => onChange(inp.value);
    nd.appendChild(inp);
    return inp;
  }

  function getGeminiEmbedKeyValue() {
    return settings.config.autoExtGeminiEmbedKey || settings.config.autoExtFirebaseEmbedKey || '';
  }

  function setGeminiEmbedKeyValue(value) {
    const val = String(value || '').trim();
    settings.config.autoExtGeminiEmbedKey = val;
    settings.config.autoExtFirebaseEmbedKey = val;
    settings.save();
  }

  function addGeminiEmbeddingKeyInput(nd, opts = {}) {
    if (opts.note) {
      const note = document.createElement('div');
      note.textContent = opts.note;
      note.style.cssText = 'font-size:11px;color:#d96;margin:8px 0;line-height:1.4;';
      nd.appendChild(note);
    }
    return addSimpleInput(nd, opts.label || '의미 검색용 Gemini API 키', getGeminiEmbedKeyValue(), setGeminiEmbedKeyValue, { placeholder: 'AIza...', type: 'password' });
  }

  function addOpenAIModelInput(nd, label, modelKey, customKey, opts = {}) {
    return addSimpleInput(nd, label, settings.config[customKey] || '', (v) => {
      settings.config[modelKey] = '_custom';
      settings.config[customKey] = String(v || '').trim();
      settings.save();
    }, { placeholder: opts.placeholder || 'openrouter/model-name 또는 로컬 모델명' });
  }

  function addFeatureThinkingControls(nd) {
    const apiType = settings.config.autoExtApiType || 'key';
    const isOpenAI = apiType === 'openai';
    const isDeepSeek = apiType === 'deepseek';
    const details = document.createElement('details');
    details.style.cssText = 'margin:12px 0;border:1px solid #292929;border-radius:6px;padding:8px;background:#080808;';
    const summary = document.createElement('summary');
    summary.textContent = isOpenAI ? '기능별 추론 강도' : (isDeepSeek ? '기능별 DeepSeek 추론 설정' : '기능별 Gemini 생각 설정');
    summary.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;cursor:pointer;';
    details.appendChild(summary);
    const note = document.createElement('div');
    note.textContent = isOpenAI
      ? '기본값은 추론 파라미터를 보내지 않음. 설정을 켠 경우 호환 서버가 거부하면 자동으로 빼고 재시도함.'
      : (isDeepSeek
        ? '기본값은 위 DeepSeek 추론 설정을 따름. 기능별로 끄거나 High/Max를 따로 지정할 수 있음.'
        : 'Gemini 모델별 지원값에 맞춰 적용함. 맞지 않는 모델에는 생각 설정을 보내지 않음.');
    note.style.cssText = 'font-size:10px;color:#888;margin:8px 0;line-height:1.4;';
    details.appendChild(note);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:minmax(88px,1fr) minmax(120px,1.2fr) minmax(70px,.7fr);gap:6px;align-items:center;';
    details.appendChild(grid);
    const opts = isOpenAI
      ? [['기본값', 'default'], ['보내지 않음', 'off'], ['None', 'none'], ['Minimal', 'minimal'], ['Low', 'low'], ['Medium', 'medium'], ['High', 'high'], ['XHigh', 'xhigh'], ['Max', 'max']]
      : (isDeepSeek
        ? [['기본값', 'default'], ['끄기', 'off'], ['High', 'high'], ['Max', 'max']]
        : [['기본값', 'default'], ['끄기(2.5)', 'off'], ['최소', 'minimal'], ['낮음', 'low'], ['보통', 'medium'], ['높음', 'high'], ['예산', 'budget']]);
    const rows = [
      ['로어 추출/변환', 'autoExt'],
      ['전체 추출', 'batchExt'],
      ['장면 기억', 'temporalExtract'],
      ['지식 변환', 'import'],
      ['후보 재정렬', 'rerank'],
      ['장면 판단', 'temporalRecallJudge'],
      ['응답 교정', 'refiner'],
      ['로어 병합', 'merge']
    ];
    rows.forEach(([label, key]) => {
      const reasonKey = isOpenAI ? (key + 'OpenAIReasoning') : (isDeepSeek ? (key + 'DeepSeekReasoning') : (key + 'Reasoning'));
      const budgetKey = key + 'Budget';
      const lab = document.createElement('div');
      lab.textContent = label;
      lab.style.cssText = 'font-size:11px;color:#aaa;';
      const sel = document.createElement('select');
      sel.style.cssText = FIELD_STYLE + 'padding:4px 6px;font-size:11px;';
      opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); });
      sel.value = isDeepSeek && key === 'autoExt'
        ? (settings.config.autoExtDeepSeekThinking === false ? 'off' : (settings.config.autoExtDeepSeekReasoning || 'high'))
        : (settings.config[reasonKey] || (isOpenAI ? 'off' : (key === 'autoExt' ? (settings.config.autoExtReasoning || 'medium') : 'default')));
      const budget = document.createElement('input');
      budget.type = 'number';
      budget.min = '-1';
      budget.step = '256';
      budget.value = settings.config[budgetKey] || (key === 'autoExt' ? (settings.config.autoExtBudget || 2048) : 1024);
      budget.style.cssText = FIELD_STYLE + 'padding:4px 6px;font-size:11px;' + ((sel.value === 'budget' && !isOpenAI && !isDeepSeek) ? '' : 'visibility:hidden;');
      sel.onchange = () => {
        if (isDeepSeek && key === 'autoExt') {
          settings.config.autoExtDeepSeekThinking = sel.value !== 'off';
          if (sel.value === 'high' || sel.value === 'max') settings.config.autoExtDeepSeekReasoning = sel.value;
        } else {
          settings.config[reasonKey] = sel.value;
        }
        budget.style.visibility = (sel.value === 'budget' && !isOpenAI && !isDeepSeek) ? 'visible' : 'hidden';
        settings.save();
      };
      budget.onchange = () => { settings.config[budgetKey] = parseInt(budget.value, 10) || 0; settings.save(); };
      grid.appendChild(lab); grid.appendChild(sel); grid.appendChild(budget);
    });
    nd.appendChild(details);
  }

  function ensureApiModelDefaults() {
    if (typeof _w.__LoreInj.normalizeApiModelDefaults === 'function') {
      _w.__LoreInj.normalizeApiModelDefaults(settings.config);
      settings.save();
    }
  }

  function getGenerationModelGroups() {
    const apiType = settings.config.autoExtApiType || 'key';
    if (apiType === 'deepseek') {
      return [
        ['DeepSeek V4', [['V4 Flash', 'deepseek-v4-flash'], ['V4 Pro', 'deepseek-v4-pro']]]
      ];
    }
    if (apiType === 'openai') {
      return [
        ['OpenAI 호환', [['직접 입력', '_custom']]]
      ];
    }
    return [
      ['Gemini 3.x', [['3.5 Flash', 'gemini-3.5-flash'], ['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]],
      ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.0 Flash', 'gemini-2.0-flash']]]
    ];
  }

  function getLightModelGroups() {
    const apiType = settings.config.autoExtApiType || 'key';
    if (apiType === 'deepseek') {
      return [
        ['DeepSeek V4', [['V4 Flash', 'deepseek-v4-flash'], ['V4 Pro', 'deepseek-v4-pro']]]
      ];
    }
    if (apiType === 'openai') {
      return [
        ['OpenAI 호환', [['직접 입력', '_custom']]]
      ];
    }
    return [
      ['Gemini 3.x', [['3.1 Flash Lite', 'gemini-3.1-flash-lite-preview'], ['3.5 Flash', 'gemini-3.5-flash'], ['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]],
      ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.5 Flash', 'gemini-2.5-flash'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash']]]
    ];
  }

  function renderPromptSettings(panel) {
    if (settings.ensureDeepSeekTemplateFields && settings.ensureDeepSeekTemplateFields()) settings.save();
    let renderDeepSeekOptions = null;
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div');
      title.textContent = '공통 로어 추출 프롬프트';
      title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;';
      nd.appendChild(title);
      const note = document.createElement('div');
      note.textContent = 'Gemini, OpenAI 호환, DeepSeek 공통으로 쓸 수 있는 로어 추출 템플릿. DeepSeek 전용 프롬프트를 켜면 DeepSeek만 아래 전용 템플릿을 사용함.';
      note.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;';
      nd.appendChild(note);
      const scopeNote = document.createElement('div');
      scopeNote.textContent = '추출 항목 체크는 커스텀 프롬프트에도 동일하게 적용됩니다. 저장한 프롬프트와 JSON 구조 뒤에 이번 실행의 선택 항목과 필요한 출력 구조가 추가되므로, 커스텀 프롬프트에서 체크 항목을 다시 나열할 필요가 없습니다.';
      scopeNote.style.cssText = 'font-size:11px;color:#8bc;margin:-2px 0 10px;padding:7px 8px;border:1px solid #234;background:#091116;border-radius:4px;line-height:1.5;';
      nd.appendChild(scopeNote);

      const tplHeader = document.createElement('div'); tplHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      const tplTitle = document.createElement('div'); tplTitle.textContent = '템플릿'; tplTitle.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;';
      const newTplBtn = document.createElement('button'); newTplBtn.textContent = '+ 새 템플릿'; newTplBtn.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:3px;background:#258;border:none;color:#fff;cursor:pointer;';
      tplHeader.appendChild(tplTitle); tplHeader.appendChild(newTplBtn); nd.appendChild(tplHeader);

      const tplSelectWrap = document.createElement('div'); tplSelectWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:center;';
      const tplSelect = document.createElement('select'); tplSelect.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
      const tplRenameBtn = document.createElement('button'); tplRenameBtn.textContent = '이름 변경'; tplRenameBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
      const tplDelBtn = document.createElement('button'); tplDelBtn.textContent = '삭제'; tplDelBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #d66;color:#d66;cursor:pointer;';
      const tplResetBtn = document.createElement('button'); tplResetBtn.textContent = '초기화'; tplResetBtn.style.cssText = 'font-size:11px;padding:4px 8px;border-radius:3px;background:transparent;border:1px solid #285;color:#4a9;cursor:pointer;margin-left:auto;';
      tplSelectWrap.appendChild(tplSelect); tplSelectWrap.appendChild(tplRenameBtn); tplSelectWrap.appendChild(tplDelBtn); tplSelectWrap.appendChild(tplResetBtn); nd.appendChild(tplSelectWrap);

      const promptStyle = FIELD_STYLE + 'height:150px;font-family:monospace;resize:vertical;margin-bottom:12px;';
      const mkLabel = (txt) => { const l = document.createElement('div'); l.textContent = txt; l.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(l); };
      mkLabel('로어 출력 구조(JSON)');
      const taSchema = document.createElement('textarea'); taSchema.style.cssText = promptStyle; nd.appendChild(taSchema);
      mkLabel('새 로어 추출 프롬프트');
      const ta1 = document.createElement('textarea'); ta1.style.cssText = promptStyle; nd.appendChild(ta1);
      mkLabel('기존 로어 참고 프롬프트');
      const ta2 = document.createElement('textarea'); ta2.style.cssText = promptStyle; nd.appendChild(ta2);

      const renderTplOptions = () => {
        tplSelect.innerHTML = '';
        (settings.config.templates || []).forEach(t => { const opt = document.createElement('option'); opt.value = t.id; opt.textContent = t.name + (t.isDefault ? ' (기본)' : ''); tplSelect.appendChild(opt); });
        tplSelect.value = settings.config.activeTemplateId || 'default';
        const activeTpl = settings.getActiveTemplate();
        tplRenameBtn.style.display = activeTpl.isDefault ? 'none' : 'block';
        tplDelBtn.style.display = activeTpl.isDefault ? 'none' : 'block';
        taSchema.value = activeTpl.schema; taSchema.disabled = activeTpl.isDefault;
        ta1.value = activeTpl.promptWithoutDb; ta1.disabled = activeTpl.isDefault;
        ta2.value = activeTpl.promptWithDb; ta2.disabled = activeTpl.isDefault;
        if (renderDeepSeekOptions) renderDeepSeekOptions();
      };
      newTplBtn.onclick = () => { const name = prompt('새 템플릿 이름:'); if (!name) return; const newId = 'tpl_' + Date.now(); const active = settings.getActiveTemplate(); settings.config.templates.push({ id: newId, name, isDefault: false, schema: active.schema, promptWithoutDb: active.promptWithoutDb, promptWithDb: active.promptWithDb, deepSeekPromptWithoutDb: active.deepSeekPromptWithoutDb, deepSeekPromptWithDb: active.deepSeekPromptWithDb, deepSeekTemporalExtractPrompt: active.deepSeekTemporalExtractPrompt, deepSeekImportPrompt: active.deepSeekImportPrompt }); settings.config.activeTemplateId = newId; settings.save(); renderTplOptions(); };
      tplResetBtn.onclick = () => {
        const activeTpl = settings.getActiveTemplate();
        if (activeTpl.isDefault) { alert('기본 프롬프트는 직접 수정할 수 없습니다. 복제한 뒤 수정해 주세요.'); return; }
        if (!confirm('[' + activeTpl.name + '] 내용을 기본 프롬프트로 되돌릴까요?')) return;
        const defaultTpl = (settings.config.templates || []).find(t => t.isDefault);
        if (!defaultTpl) return;
        const idx = settings.config.templates.findIndex(t => t.id === activeTpl.id);
        if (idx === -1) return;
        settings.config.templates[idx].schema = defaultTpl.schema;
        settings.config.templates[idx].promptWithoutDb = defaultTpl.promptWithoutDb;
        settings.config.templates[idx].promptWithDb = defaultTpl.promptWithDb;
        settings.config.templates[idx].deepSeekPromptWithoutDb = defaultTpl.deepSeekPromptWithoutDb;
        settings.config.templates[idx].deepSeekPromptWithDb = defaultTpl.deepSeekPromptWithDb;
        settings.config.templates[idx].deepSeekTemporalExtractPrompt = defaultTpl.deepSeekTemporalExtractPrompt;
        settings.config.templates[idx].deepSeekImportPrompt = defaultTpl.deepSeekImportPrompt;
        settings.save(); renderTplOptions();
      };
      tplSelect.onchange = () => { settings.config.activeTemplateId = tplSelect.value; settings.save(); renderTplOptions(); };
      tplRenameBtn.onclick = () => { const activeTpl = settings.getActiveTemplate(); if (activeTpl.isDefault) return; const newName = prompt('템플릿 이름:', activeTpl.name); if (newName) { const idx = settings.config.templates.findIndex(t => t.id === activeTpl.id); if (idx !== -1) { settings.config.templates[idx].name = newName.trim(); settings.save(); renderTplOptions(); } } };
      tplDelBtn.onclick = () => { const activeId = settings.config.activeTemplateId; const activeTpl = settings.getActiveTemplate(); if (activeTpl.isDefault) return; if (confirm('[' + activeTpl.name + '] 프롬프트를 삭제할까요?')) { settings.config.templates = settings.config.templates.filter(t => t.id !== activeId); settings.config.activeTemplateId = 'default'; settings.save(); renderTplOptions(); } };
      const saveTpl = (key, val) => { const id = settings.config.activeTemplateId; const idx = (settings.config.templates || []).findIndex(t => t.id === id); if (idx !== -1 && !settings.config.templates[idx].isDefault) { settings.config.templates[idx][key] = val; settings.save(); } };
      taSchema.onchange = () => saveTpl('schema', taSchema.value);
      ta1.onchange = () => saveTpl('promptWithoutDb', ta1.value);
      ta2.onchange = () => saveTpl('promptWithDb', ta2.value);
      renderTplOptions();
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div');
      title.textContent = '장면/변환/판단 프롬프트';
      title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;';
      nd.appendChild(title);
      const note = document.createElement('div');
      note.textContent = '로어 추출 외에 실제 API 호출에서 쓰는 프롬프트. 기본값으로 돌릴 수 있고, JSON 구조는 프롬프트 작성 시 참고용으로 그대로 확인 가능함.';
      note.style.cssText = 'font-size:11px;color:#888;line-height:1.4;margin-bottom:8px;';
      nd.appendChild(note);
      const details = document.createElement('details');
      details.style.cssText = 'border:1px solid #292929;border-radius:6px;padding:8px;background:#080808;';
      const summary = document.createElement('summary');
      summary.textContent = '고급 프롬프트 편집';
      summary.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;cursor:pointer;';
      details.appendChild(summary);
      const body = document.createElement('div');
      body.style.cssText = 'margin-top:8px;';
      details.appendChild(body);
      nd.appendChild(details);
      const defaults = _w.__LoreInj.defaultSettings || {};
      addPromptArea(body, '중요 장면 추출 프롬프트', settings.config.temporalExtractPrompt || defaults.temporalExtractPrompt || '', (v) => {
        settings.config.temporalExtractPrompt = v; settings.save();
      }, { height: 170, reset: () => defaults.temporalExtractPrompt || '' });
      addPromptArea(body, '중요 장면 출력 구조(JSON)', settings.config.temporalExtractSchema || defaults.temporalExtractSchema || '', (v) => {
        settings.config.temporalExtractSchema = v; settings.save();
      }, { height: 150, reset: () => defaults.temporalExtractSchema || '' });
      addPromptArea(body, '지식 변환 프롬프트', settings.config.importPrompt || defaults.importPrompt || '', (v) => {
        settings.config.importPrompt = v; settings.save();
      }, { height: 190, reset: () => defaults.importPrompt || '' });
      addPromptArea(body, '지식 변환 출력 구조(JSON)', settings.config.importSchema || defaults.importSchema || '', (v) => {
        settings.config.importSchema = v; settings.save();
      }, { height: 150, reset: () => defaults.importSchema || '' });
      addPromptArea(body, '과거 장면 판단 프롬프트', settings.config.temporalRecallJudgePrompt || defaults.temporalRecallJudgePrompt || '', (v) => {
        settings.config.temporalRecallJudgePrompt = v; settings.save();
      }, { height: 150, reset: () => defaults.temporalRecallJudgePrompt || '' });
      addPromptArea(body, '과거 장면 판단 출력 구조(JSON)', settings.config.temporalRecallJudgeSchema || defaults.temporalRecallJudgeSchema || '', (v) => {
        settings.config.temporalRecallJudgeSchema = v; settings.save();
      }, { height: 120, reset: () => defaults.temporalRecallJudgeSchema || '' });
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div');
      title.textContent = 'DeepSeek 전용 프롬프트';
      title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;';
      nd.appendChild(title);
      const note = document.createElement('div');
      note.textContent = 'DeepSeek에서 JSON 객체 출력을 더 강하게 요구할 때 쓰는 전용값. 끄면 DeepSeek도 위 공통 프롬프트를 사용하고, JSON 객체 보정은 호출 직전에 자동으로 붙음.';
      note.style.cssText = 'font-size:11px;color:#888;line-height:1.4;margin-bottom:8px;';
      nd.appendChild(note);
      nd.appendChild(C.createToggleRow('DeepSeek 전용 프롬프트 사용', '끄면 로어 추출, 중요 장면, 지식 변환도 공통 프롬프트를 사용함.', settings.config.deepSeekPromptOverridesEnabled !== false, (v) => { settings.config.deepSeekPromptOverridesEnabled = v; settings.save(); }));
      const dsDetails = document.createElement('details');
      dsDetails.style.cssText = 'border:1px solid #292929;border-radius:6px;padding:8px;background:#080808;margin-top:8px;';
      const dsSummary = document.createElement('summary');
      dsSummary.textContent = 'DeepSeek 전용값 편집';
      dsSummary.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;cursor:pointer;';
      dsDetails.appendChild(dsSummary);
      const dsBody = document.createElement('div');
      dsBody.style.cssText = 'margin-top:8px;';
      dsDetails.appendChild(dsBody);
      nd.appendChild(dsDetails);
      const defaults = _w.__LoreInj.defaultSettings || {};
      addPromptArea(dsBody, 'DeepSeek JSON 응답 보정 프롬프트', settings.config.deepSeekJsonSystemPrompt || defaults.deepSeekJsonSystemPrompt || '', (v) => {
        settings.config.deepSeekJsonSystemPrompt = v; settings.save();
      }, { height: 90, reset: () => defaults.deepSeekJsonSystemPrompt || '' });
      const saveDeepSeekTpl = (key, val) => {
        const id = settings.config.activeTemplateId || 'default';
        const idx = (settings.config.templates || []).findIndex(t => t.id === id);
        if (idx !== -1 && !settings.config.templates[idx].isDefault) {
          settings.config.templates[idx][key] = val;
          settings.save();
        }
      };
      const ds1 = addPromptArea(dsBody, '새 로어 추출 전체 프롬프트', '', (v) => {
        saveDeepSeekTpl('deepSeekPromptWithoutDb', v);
      }, { height: 190, reset: () => defaults.deepSeekPromptWithoutDb || '' });
      const ds2 = addPromptArea(dsBody, '기존 로어 참고 전체 프롬프트', '', (v) => {
        saveDeepSeekTpl('deepSeekPromptWithDb', v);
      }, { height: 230, reset: () => defaults.deepSeekPromptWithDb || '' });
      const ds3 = addPromptArea(dsBody, '중요 장면 전체 프롬프트', '', (v) => {
        saveDeepSeekTpl('deepSeekTemporalExtractPrompt', v);
      }, { height: 190, reset: () => defaults.deepSeekTemporalExtractPrompt || '' });
      const ds4 = addPromptArea(dsBody, '지식 변환 전체 프롬프트', '', (v) => {
        saveDeepSeekTpl('deepSeekImportPrompt', v);
      }, { height: 190, reset: () => defaults.deepSeekImportPrompt || '' });
      renderDeepSeekOptions = () => {
        const activeTpl = settings.getActiveTemplate();
        if (!activeTpl) return;
        ds1.value = activeTpl.deepSeekPromptWithoutDb || defaults.deepSeekPromptWithoutDb || '';
        ds2.value = activeTpl.deepSeekPromptWithDb || defaults.deepSeekPromptWithDb || '';
        ds3.value = activeTpl.deepSeekTemporalExtractPrompt || defaults.deepSeekTemporalExtractPrompt || '';
        ds4.value = activeTpl.deepSeekImportPrompt || defaults.deepSeekImportPrompt || '';
        ds1.disabled = ds2.disabled = ds3.disabled = ds4.disabled = !!activeTpl.isDefault;
      };
      renderDeepSeekOptions();
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div');
      title.textContent = '후보 재정렬/응답 교정 프롬프트';
      title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;';
      nd.appendChild(title);
      addPromptArea(nd, '후보 재정렬 프롬프트', settings.config.rerankPrompt || C.DEFAULTS.rerankPrompt, (v) => { settings.config.rerankPrompt = v; settings.save(); }, { height: 110, reset: () => C.DEFAULTS.rerankPrompt });
      addPromptArea(nd, '응답 교정 프롬프트', settings.config.refinerCustomPrompt || '', (v) => { settings.config.refinerCustomPrompt = v; settings.config.refinerUseDynamic = false; settings.save(); }, { height: 180 });
      const note = document.createElement('div');
      note.textContent = '응답 교정 항목은 응답 교정 화면에서도 선택할 수 있습니다.';
      note.style.cssText = 'font-size:11px;color:#888;line-height:1.4;';
      nd.appendChild(note);
    }});
  }
  
  _w.__LoreInj.registerSubMenu('api', function(modal) {
    modal.createSubMenu('API 설정', (m) => {
      m.replaceContentPanel((panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          ensureApiModelDefaults();
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = 'API 연결'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const apiSummary = document.createElement('div');
          const apiTypeLabel = (settings.config.autoExtApiType || 'key') === 'deepseek' ? 'DeepSeek' : (settings.config.autoExtApiType || 'key') === 'openai' ? 'OpenAI 호환' : (settings.config.autoExtApiType || 'key') === 'vertex' ? 'Vertex JSON' : (settings.config.autoExtApiType || 'key') === 'firebase' ? 'Firebase' : 'Gemini API Key';
          apiSummary.textContent = '현재 방식: ' + apiTypeLabel + ' · 추출, 변환, 장면 판단, 후보 재정렬, 응답 교정, 병합 호출이 이 연결을 사용함.';
          apiSummary.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;';
          nd.appendChild(apiSummary);
          const providerLabel = document.createElement('div'); providerLabel.textContent = 'API 종류'; providerLabel.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(providerLabel);
          const providerSel = document.createElement('select'); providerSel.style.cssText = FIELD_STYLE;
          [['Gemini API Key', 'key'], ['Firebase', 'firebase'], ['Vertex JSON', 'vertex'], ['DeepSeek', 'deepseek'], ['OpenAI 호환', 'openai']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; providerSel.appendChild(o); });
          providerSel.value = settings.config.autoExtApiType || 'key';
          providerSel.onchange = () => {
            settings.config.autoExtApiType = providerSel.value;
            if (typeof _w.__LoreInj.normalizeApiModelDefaults === 'function') _w.__LoreInj.normalizeApiModelDefaults(settings.config);
            settings.save();
            alert('API 방식을 변경했습니다. 다른 메뉴를 열었다가 API 설정 화면으로 돌아오면 해당 설정을 입력할 수 있습니다.');
          };
          nd.appendChild(providerSel);
          if ((settings.config.autoExtApiType || 'key') === 'deepseek') {
            addSimpleInput(nd, 'DeepSeek API 키', settings.config.autoExtDeepSeekKey || '', (v) => { settings.config.autoExtDeepSeekKey = v; settings.save(); }, { placeholder: 'sk-...', type: 'password' });
            nd.appendChild(C.createToggleRow('DeepSeek 추론 사용', '끄면 빠르고 저렴하게 호출함. 켜면 V4 추론 모드 사용함.', settings.config.autoExtDeepSeekThinking !== false, (v) => { settings.config.autoExtDeepSeekThinking = v; settings.save(); }));
            const dsl = document.createElement('div'); dsl.textContent = 'DeepSeek 추론 강도'; dsl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(dsl);
            const dss = document.createElement('select'); dss.style.cssText = FIELD_STYLE;
            [['High', 'high'], ['Max', 'max']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; dss.appendChild(o); });
            dss.value = settings.config.autoExtDeepSeekReasoning || 'high';
            dss.onchange = () => { settings.config.autoExtDeepSeekReasoning = dss.value; settings.save(); };
            nd.appendChild(dss);
            addGeminiEmbeddingKeyInput(nd, { note: '의미 검색 준비에는 Gemini API 키를 별도로 사용함.' });
          } else if ((settings.config.autoExtApiType || 'key') === 'openai') {
            addSimpleInput(nd, 'OpenAI 호환 URL', settings.config.autoExtOpenAIBaseUrl || '', (v) => { settings.config.autoExtOpenAIBaseUrl = v; settings.save(); }, { placeholder: '커스텀: https://.../v1/chat/completions' });
            addSimpleInput(nd, 'OpenAI 호환 API 키', settings.config.autoExtOpenAIKey || '', (v) => { settings.config.autoExtOpenAIKey = v; settings.save(); }, { placeholder: 'sk-...', type: 'password' });
            const formatLabel = document.createElement('div'); formatLabel.textContent = 'API 형식'; formatLabel.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(formatLabel);
            const formatSel = document.createElement('select'); formatSel.style.cssText = FIELD_STYLE;
            [['커스텀 (입력한 전체 URL 사용)', 'custom'], ['Chat Completions (/chat/completions)', 'chat_completions'], ['Responses (/responses)', 'responses'], ['Anthropic Messages (/v1/messages)', 'anthropic_messages']].forEach(([label, value]) => {
              const option = document.createElement('option'); option.value = value; option.textContent = label; formatSel.appendChild(option);
            });
            formatSel.value = settings.config.autoExtOpenAIFormat || 'custom';
            formatSel.onchange = () => { settings.config.autoExtOpenAIFormat = formatSel.value; settings.save(); };
            nd.appendChild(formatSel);
            const formatNote = document.createElement('div'); formatNote.textContent = '커스텀은 입력한 URL을 그대로 호출함. 나머지 형식은 필요한 API 경로를 자동으로 붙임. Anthropic 공식 주소에서는 전용 인증 헤더를 사용함.'; formatNote.style.cssText = 'font-size:10px;color:#777;line-height:1.45;margin-top:4px;'; nd.appendChild(formatNote);
            addGeminiEmbeddingKeyInput(nd, { note: '의미 검색 준비에는 OpenAI 호환 API가 아니라 Gemini API 키를 별도로 사용함.' });
          } else {
            C.createApiInput(settings.config, 'autoExt', nd, () => settings.save(), { hideModeSelector: true });
            const apiTypeNow = settings.config.autoExtApiType || 'key';
            if (apiTypeNow === 'key') {
              addGeminiEmbeddingKeyInput(nd, { note: '의미 검색 준비용 키. 비워두면 위 Gemini API 키를 같이 사용함.' });
            } else if (apiTypeNow === 'vertex') {
              addGeminiEmbeddingKeyInput(nd, { note: '선택 사항. 비워두면 Vertex 설정으로 검색 준비를 실행함.' });
            }
          }
  
          const testRow = document.createElement('div'); testRow.style.cssText = 'margin:12px 0 16px;display:flex;gap:8px;align-items:center;';
          const testBtn = document.createElement('button'); testBtn.textContent = '생성 API 테스트';
          testBtn.style.cssText = 'padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;';
          const testResult = document.createElement('span'); testResult.style.cssText = 'font-size:12px;color:#888;word-break:break-all;';
          testBtn.onclick = async () => {
            const apiType = settings.config.autoExtApiType || 'key';
            const missing = _w.__LoreInj.getApiMissingReason ? _w.__LoreInj.getApiMissingReason(settings.config, 'generate') : (apiType === 'deepseek' ? (!settings.config.autoExtDeepSeekKey && 'DeepSeek API 키 필요.') : apiType === 'openai' ? ((!settings.config.autoExtOpenAIBaseUrl || !settings.config.autoExtOpenAIKey) && 'OpenAI 호환 설정 필요.') : apiType === 'vertex' ? (!settings.config.autoExtVertexJson && 'Vertex JSON 필요.') : apiType === 'firebase' ? (!settings.config.autoExtFirebaseScript && 'Firebase 설정 필요.') : (!settings.config.autoExtKey && 'API 키 필요.'));
            if (missing) { alert(missing); return; }
            testBtn.disabled = true; testResult.textContent = '테스트 중...';
            try {
              const fallbackModel = _w.__LoreInj.getGenerationFallbackModel ? _w.__LoreInj.getGenerationFallbackModel(settings.config) : (((settings.config.autoExtApiType || 'key') === 'deepseek') ? 'deepseek-v4-flash' : ((settings.config.autoExtApiType || 'key') === 'openai' ? '' : 'gemini-3-flash-preview'));
              const testModel = settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : (settings.config.autoExtModel || fallbackModel);
              const testOpts = _w.__LoreInj.buildGenerationApiOpts
                ? _w.__LoreInj.buildGenerationApiOpts({ model: testModel, maxRetries: 0, responseMimeType: 'application/json', maxOutputTokens: 512 }, { feature: 'autoExtract', chatKey: 'global' })
                : { apiType: settings.config.autoExtApiType, key: settings.config.autoExtKey, deepSeekKey: settings.config.autoExtDeepSeekKey, openAIBaseUrl: settings.config.autoExtOpenAIBaseUrl, openAIKey: settings.config.autoExtOpenAIKey, openAIFormat: settings.config.autoExtOpenAIFormat || 'custom', vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation, vertexProjectId: settings.config.autoExtVertexProjectId, firebaseScript: settings.config.autoExtFirebaseScript, model: testModel, maxRetries: 0, responseMimeType: 'application/json', maxOutputTokens: 512, costContext: { feature: 'autoExtract', chatKey: 'global' } };
              const r = await C.callGeminiApi('Return exactly one JSON object: {"ok":true}', testOpts);
              testResult.textContent = r.text ? '성공: ' + r.text.trim().slice(0, 50) : '실패: ' + r.error; testResult.style.color = r.text ? '#4a9' : '#d66';
            } catch(e) { testResult.textContent = '오류: ' + e.message; testResult.style.color = '#d66'; }
            testBtn.disabled = false;
          };
          testRow.appendChild(testBtn); testRow.appendChild(testResult); nd.appendChild(testRow);
  
          const modelHead = document.createElement('div'); modelHead.textContent = '모델 선택'; modelHead.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin:14px 0 8px;padding-top:10px;border-top:1px solid #333;'; nd.appendChild(modelHead);
          const modelNote = document.createElement('div'); modelNote.textContent = (settings.config.autoExtApiType || 'key') === 'openai'
            ? 'OpenAI 호환은 기능별 모델명을 직접 입력함. 같은 API 키로 OpenRouter, Ollama 등 여러 모델을 나눠 쓸 수 있음.'
            : 'API를 쓰는 기능별 모델을 여기서 한 번에 관리합니다. 프롬프트 내용은 API 설정 > 프롬프트에서 수정합니다.';
          modelNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;'; nd.appendChild(modelNote);
          const isDeepSeekApi = (settings.config.autoExtApiType || 'key') === 'deepseek';
          const isOpenAIApi = (settings.config.autoExtApiType || 'key') === 'openai';
          const deepSeekDefault = 'deepseek-v4-flash';
          if (isOpenAIApi) {
            addOpenAIModelInput(nd, '로어 추출/변환 모델', 'autoExtModel', 'autoExtCustomModel');
            addOpenAIModelInput(nd, '후보 재정렬 모델', 'rerankModel', 'rerankCustomModel', { placeholder: '비워두면 로어 추출/변환 모델 사용' });
            addOpenAIModelInput(nd, '과거 장면 판단 모델', 'temporalRecallJudgeModel', 'temporalRecallJudgeCustomModel', { placeholder: '비워두면 로어 추출/변환 모델 사용' });
            addOpenAIModelInput(nd, '응답 교정 모델', 'refinerModel', 'refinerCustomModel', { placeholder: '비워두면 로어 추출/변환 모델 사용' });
          } else {
            addSelect(nd, '로어 추출/변환 모델', settings.config.autoExtModel || (isDeepSeekApi ? deepSeekDefault : 'gemini-3-flash-preview'), getGenerationModelGroups(), (v) => { settings.config.autoExtModel = v; settings.save(); }, { customKey: 'autoExtCustomModel' });
            addSelect(nd, '후보 재정렬 모델', settings.config.rerankModel || (isDeepSeekApi ? deepSeekDefault : ''), getLightModelGroups(), (v) => { settings.config.rerankModel = v; settings.save(); }, { customKey: 'rerankCustomModel' });
            addSelect(nd, '과거 장면 판단 모델', settings.config.temporalRecallJudgeModel || (isDeepSeekApi ? deepSeekDefault : ''), getLightModelGroups(), (v) => { settings.config.temporalRecallJudgeModel = v; settings.save(); }, { customKey: 'temporalRecallJudgeCustomModel' });
            addSelect(nd, '응답 교정 모델', settings.config.refinerModel !== undefined ? settings.config.refinerModel : (isDeepSeekApi ? deepSeekDefault : ''), getLightModelGroups(), (v) => { settings.config.refinerModel = v; settings.save(); }, { customKey: 'refinerCustomModel' });
          }

          addFeatureThinkingControls(nd);
        }});
      }, '연결 및 모델');
    });

    modal.createSubMenu('프롬프트 관리', (m) => {
      m.replaceContentPanel((panel) => renderPromptSettings(panel), '프롬프트');
    });
  });
  
  _w.__LoreInj.__subApiLoaded = true;
})();
