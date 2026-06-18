// injecter-6-sub-api.js: API 설정
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subApiLoaded) return;
  
  const { C, settings } = _w.__LoreInj;

  // Firebase 사전 워밍업: 첫 실호출의 SDK import + initializeApp 비용을 백그라운드로 분리.
  if (settings.config.autoExtApiType === 'firebase' && settings.config.autoExtFirebaseScript && C.warmupFirebase) {
    C.warmupFirebase(settings.config.autoExtFirebaseScript, settings.config.autoExtModel || 'gemini-3-flash-preview').catch(() => {});
  }

  const FIELD_STYLE = (C.UI && C.UI.field) || 'width:100%;min-height:34px;border-radius:8px;border:1px solid var(--li-line,#2f3b4f);background:#08111d;color:var(--li-text,#e7edf5);padding:8px 10px;font-size:12px;box-sizing:border-box;';
  const BTN_BASE = 'min-height:30px;padding:5px 10px;font-size:11px;border-radius:7px;background:transparent;border:1px solid var(--li-line,#2f3b4f);color:var(--li-text-soft,#a9b6c7);cursor:pointer;font-weight:800;';
  const TONE = {
    muted: 'var(--li-muted,#748196)',
    soft: 'var(--li-text-soft,#a9b6c7)',
    text: 'var(--li-text,#e7edf5)',
    accent: 'var(--li-accent,#5aa7ff)',
    ok: '#78d5a8',
    warn: '#e7b56f',
    danger: '#ef6b6b'
  };

  function addSelect(nd, label, value, groups, onChange, opts = {}) {
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin:10px 0 4px;font-weight:800;';
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
    l.style.cssText = 'font-size:12px;color:var(--li-text-soft,#a9b6c7);font-weight:900;';
    row.appendChild(l);
    if (opts.reset) {
      const btn = document.createElement('button');
      btn.textContent = '기본값 복구';
      btn.style.cssText = BTN_BASE + 'min-height:24px;padding:3px 7px;font-size:10px;color:' + TONE.accent + ';border-color:rgba(90,167,255,.45);';
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
    l.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin:10px 0 4px;font-weight:800;';
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
        ['DeepSeek V4', [['V4 Flash', 'deepseek-v4-flash'], ['V4 Pro', 'deepseek-v4-pro']]],
        ['기타', [['직접 입력', '_custom']]]
      ];
    }
    return [
      ['Gemini 3.x', [['3.5 Flash', 'gemini-3.5-flash'], ['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]],
      ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.0 Flash', 'gemini-2.0-flash']]],
      ['기타', [['직접 입력', '_custom']]]
    ];
  }

  function getLightModelGroups() {
    const apiType = settings.config.autoExtApiType || 'key';
    if (apiType === 'deepseek') {
      return [
        ['기본 LLM과 동일', [['기본 LLM 사용', '']]],
        ['DeepSeek V4', [['V4 Flash', 'deepseek-v4-flash'], ['V4 Pro', 'deepseek-v4-pro']]],
        ['기타', [['직접 입력', '_custom']]]
      ];
    }
    return [
      ['기본 LLM과 동일', [['기본 LLM 사용', '']]],
      ['Gemini 3.x', [['3.1 Flash Lite', 'gemini-3.1-flash-lite-preview'], ['3.5 Flash', 'gemini-3.5-flash'], ['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]],
      ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.5 Flash', 'gemini-2.5-flash'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash']]],
      ['기타', [['직접 입력', '_custom']]]
    ];
  }

  function renderPromptSettings(panel) {
    if (settings.ensureDeepSeekTemplateFields && settings.ensureDeepSeekTemplateFields()) settings.save();
    if (_w.__LoreInj.ensurePromptBlocks && _w.__LoreInj.ensurePromptBlocks(settings.config)) settings.save();
    let renderDeepSeekOptions = null;
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      nd.appendChild(C.createSectionTitle('Gemini 추출 프롬프트', '템플릿 선택은 Gemini와 DeepSeek 프롬프트 세트에 함께 적용됨. 기본 템플릿은 직접 수정 안 됨.'));

      const tplHeader = document.createElement('div'); tplHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      const tplTitle = document.createElement('div'); tplTitle.textContent = '템플릿'; tplTitle.style.cssText = 'font-size:12px;color:var(--li-text-soft,#a9b6c7);font-weight:900;';
      const newTplBtn = C.createActionButton('+ 새 템플릿', 'primary'); newTplBtn.style.fontSize = '11px'; newTplBtn.style.padding = '3px 8px';
      tplHeader.appendChild(tplTitle); tplHeader.appendChild(newTplBtn); nd.appendChild(tplHeader);

      const tplSelectWrap = document.createElement('div'); tplSelectWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:center;';
      const tplSelect = document.createElement('select'); tplSelect.style.cssText = 'flex:1;' + FIELD_STYLE;
      const tplRenameBtn = document.createElement('button'); tplRenameBtn.textContent = '이름 변경'; tplRenameBtn.style.cssText = BTN_BASE + 'color:' + TONE.accent + ';border-color:rgba(90,167,255,.45);';
      const tplDelBtn = document.createElement('button'); tplDelBtn.textContent = '삭제'; tplDelBtn.style.cssText = BTN_BASE + 'color:' + TONE.danger + ';border-color:rgba(239,107,107,.45);';
      const tplResetBtn = document.createElement('button'); tplResetBtn.textContent = '초기화'; tplResetBtn.style.cssText = BTN_BASE + 'color:' + TONE.ok + ';border-color:rgba(120,213,168,.45);margin-left:auto;';
      tplSelectWrap.appendChild(tplSelect); tplSelectWrap.appendChild(tplRenameBtn); tplSelectWrap.appendChild(tplDelBtn); tplSelectWrap.appendChild(tplResetBtn); nd.appendChild(tplSelectWrap);

      const promptStyle = FIELD_STYLE + 'height:150px;font-family:monospace;resize:vertical;margin-bottom:12px;';
      const mkLabel = (txt) => { const l = document.createElement('div'); l.textContent = txt; l.style.cssText = 'font-size:12px;color:var(--li-text-soft,#a9b6c7);font-weight:800;margin-bottom:4px;'; nd.appendChild(l); };
      mkLabel('출력 형식(JSON)');
      const taSchema = document.createElement('textarea'); taSchema.style.cssText = promptStyle; nd.appendChild(taSchema);
      mkLabel('새 로어 추출 지시문');
      const ta1 = document.createElement('textarea'); ta1.style.cssText = promptStyle; nd.appendChild(ta1);
      mkLabel('기존 로어 참고 지시문');
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
        if (activeTpl.isDefault) { alert('기본 템플릿은 수정 불가.'); return; }
        if (!confirm('[' + activeTpl.name + '] 기본 템플릿 내용으로 초기화?')) return;
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
      tplDelBtn.onclick = () => { const activeId = settings.config.activeTemplateId; const activeTpl = settings.getActiveTemplate(); if (activeTpl.isDefault) return; if (confirm('[' + activeTpl.name + '] 템플릿 삭제?')) { settings.config.templates = settings.config.templates.filter(t => t.id !== activeId); settings.config.activeTemplateId = 'default'; settings.save(); renderTplOptions(); } };
      const saveTpl = (key, val) => { const id = settings.config.activeTemplateId; const idx = (settings.config.templates || []).findIndex(t => t.id === id); if (idx !== -1 && !settings.config.templates[idx].isDefault) { settings.config.templates[idx][key] = val; settings.save(); } };
      taSchema.onchange = () => saveTpl('schema', taSchema.value);
      ta1.onchange = () => saveTpl('promptWithoutDb', ta1.value);
      ta2.onchange = () => saveTpl('promptWithDb', ta2.value);
      renderTplOptions();
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      nd.appendChild(C.createSectionTitle('DeepSeek 추출 프롬프트', '선택한 템플릿의 DeepSeek 전용 프롬프트. 자동/수동/전체 추출, 중요 장면 추출, 지식 변환에 사용함.'));
      const defaults = _w.__LoreInj.defaultSettings || {};
      const saveDeepSeekTpl = (key, val) => {
        const id = settings.config.activeTemplateId || 'default';
        const idx = (settings.config.templates || []).findIndex(t => t.id === id);
        if (idx !== -1 && !settings.config.templates[idx].isDefault) {
          settings.config.templates[idx][key] = val;
          settings.save();
        }
      };
      const ds1 = addPromptArea(nd, '새 로어 추출 전체 프롬프트', '', (v) => {
        saveDeepSeekTpl('deepSeekPromptWithoutDb', v);
      }, { height: 190, reset: () => defaults.deepSeekPromptWithoutDb || '' });
      const ds2 = addPromptArea(nd, '기존 로어 참고 전체 프롬프트', '', (v) => {
        saveDeepSeekTpl('deepSeekPromptWithDb', v);
      }, { height: 230, reset: () => defaults.deepSeekPromptWithDb || '' });
      const ds3 = addPromptArea(nd, '중요 장면 전체 프롬프트', '', (v) => {
        saveDeepSeekTpl('deepSeekTemporalExtractPrompt', v);
      }, { height: 190, reset: () => defaults.deepSeekTemporalExtractPrompt || '' });
      const ds4 = addPromptArea(nd, '지식 변환 전체 프롬프트', '', (v) => {
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
      nd.appendChild(C.createSectionTitle('공통 규칙 블록', '추출/변환/교정 프롬프트에 공통으로 붙는 규칙. 전체 템플릿을 복사하지 않고 핵심 규칙만 관리함.'));
      const blocks = _w.__LoreInj.normalizePromptBlocks ? _w.__LoreInj.normalizePromptBlocks(settings.config.promptBlocks) : (settings.config.promptBlocks || []);
      settings.config.promptBlocks = blocks;
      const featureLabel = (features) => {
        const map = { extract: '추출', temporalExtract: '중요 장면', import: '지식 변환', repair: 'JSON 복구', refine: '응답 교정' };
        return (features || []).map(f => map[f] || f).join(', ');
      };
      blocks.forEach((block, idx) => {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid var(--li-line,#2f3b4f);border-radius:10px;padding:10px;margin:10px 0;background:var(--li-surface-2,#101928);';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = block.enabled !== false;
        chk.disabled = !!block.locked;
        chk.onchange = () => { settings.config.promptBlocks[idx].enabled = chk.checked; settings.save(); };
        const title = document.createElement('div');
        title.textContent = block.title || block.id;
        title.style.cssText = 'font-size:12px;font-weight:900;color:var(--li-text,#e7edf5);flex:1;';
        const feat = document.createElement('div');
        feat.textContent = featureLabel(block.features);
        feat.style.cssText = 'font-size:10px;color:var(--li-muted,#748196);';
        head.appendChild(chk);
        head.appendChild(title);
        head.appendChild(feat);
        const ta = document.createElement('textarea');
        ta.value = block.text || '';
        ta.style.cssText = FIELD_STYLE + 'height:86px;font-family:monospace;resize:vertical;';
        ta.onchange = () => { settings.config.promptBlocks[idx].text = ta.value; settings.save(); };
        box.appendChild(head);
        box.appendChild(ta);
        nd.appendChild(box);
      });
      const resetBlocks = document.createElement('button');
      resetBlocks.textContent = '규칙 블록 기본값 복원';
      resetBlocks.style.cssText = BTN_BASE + 'color:' + TONE.ok + ';border-color:rgba(120,213,168,.45);margin-top:4px;';
      resetBlocks.onclick = () => {
        if (!confirm('공통 규칙 블록을 기본값으로 복원?')) return;
        settings.config.promptBlocks = _w.__LoreInj.DEFAULT_PROMPT_BLOCKS ? JSON.parse(JSON.stringify(_w.__LoreInj.DEFAULT_PROMPT_BLOCKS)) : [];
        settings.save();
        alert('복원됨. 프롬프트 관리 화면을 다시 열면 반영됨.');
      };
      nd.appendChild(resetBlocks);
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      nd.appendChild(C.createSectionTitle('후보 준비/응답 교정 프롬프트'));
      addPromptArea(nd, '후보 준비 지시문', settings.config.rerankPrompt || C.DEFAULTS.rerankPrompt, (v) => { settings.config.rerankPrompt = v; settings.save(); }, { height: 110, reset: () => C.DEFAULTS.rerankPrompt });
      addPromptArea(nd, '응답 교정 지시문', settings.config.refinerCustomPrompt || '', (v) => { settings.config.refinerCustomPrompt = v; settings.config.refinerUseDynamic = false; settings.save(); }, { height: 180 });
      const note = document.createElement('div');
      note.textContent = '응답 교정 템플릿/체크박스 선택은 AI 응답 교정 화면에서도 가능함.';
      note.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);line-height:1.5;';
      nd.appendChild(note);
    }});
  }
  
  _w.__LoreInj.registerSettingsPage('api', 'API 설정', (m) => {
      m.replaceContentPanel((panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          ensureApiModelDefaults();
          C.setFullWidth(nd);
          const apiTypeLabel = (settings.config.autoExtApiType || 'key') === 'deepseek' ? 'DeepSeek' : (settings.config.autoExtApiType || 'key') === 'vertex' ? 'Vertex JSON' : (settings.config.autoExtApiType || 'key') === 'firebase' ? 'Firebase' : 'Gemini API Key';
          nd.appendChild(C.createSectionTitle('API 연결', '현재 방식: ' + apiTypeLabel + ' · 추출/정리, 변환, 중요 장면 추출이 이 연결 사용함.'));
          const providerLabel = document.createElement('div'); providerLabel.textContent = 'API 종류'; providerLabel.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin:10px 0 4px;font-weight:800;'; nd.appendChild(providerLabel);
          const providerSel = document.createElement('select'); providerSel.style.cssText = FIELD_STYLE;
          [['Gemini API Key', 'key'], ['Firebase', 'firebase'], ['Vertex JSON', 'vertex'], ['DeepSeek', 'deepseek']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; providerSel.appendChild(o); });
          providerSel.value = settings.config.autoExtApiType || 'key';
          providerSel.onchange = () => {
            settings.config.autoExtApiType = providerSel.value;
            if (typeof _w.__LoreInj.normalizeApiModelDefaults === 'function') _w.__LoreInj.normalizeApiModelDefaults(settings.config);
            settings.save();
            alert('API 종류 변경됨. API 설정 화면 다시 열 것.');
          };
          nd.appendChild(providerSel);
          if ((settings.config.autoExtApiType || 'key') === 'deepseek') {
            addSimpleInput(nd, 'DeepSeek API 키', settings.config.autoExtDeepSeekKey || '', (v) => { settings.config.autoExtDeepSeekKey = v; settings.save(); }, { placeholder: 'sk-...' });
            nd.appendChild(C.createToggleRow('DeepSeek 추론 사용', '끄면 빠르고 저렴하게 호출함. 켜면 V4 추론 모드 사용함.', settings.config.autoExtDeepSeekThinking !== false, (v) => { settings.config.autoExtDeepSeekThinking = v; settings.save(); }));
            const dsl = document.createElement('div'); dsl.textContent = 'DeepSeek 추론 강도'; dsl.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin:10px 0 4px;font-weight:800;'; nd.appendChild(dsl);
            const dss = document.createElement('select'); dss.style.cssText = FIELD_STYLE;
            [['High', 'high'], ['Max', 'max']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; dss.appendChild(o); });
            dss.value = settings.config.autoExtDeepSeekReasoning || 'high';
            dss.onchange = () => { settings.config.autoExtDeepSeekReasoning = dss.value; settings.save(); };
            nd.appendChild(dss);
            const embNote = document.createElement('div'); embNote.textContent = '의미 검색/임베딩은 Gemini API 키 사용함.'; embNote.style.cssText = 'font-size:11px;color:' + TONE.warn + ';margin:8px 0;line-height:1.5;'; nd.appendChild(embNote);
            addSimpleInput(nd, '임베딩용 Gemini API 키', settings.config.autoExtFirebaseEmbedKey || '', (v) => { settings.config.autoExtFirebaseEmbedKey = v; settings.save(); }, { placeholder: 'AIza...' });
          } else {
            C.createApiInput(settings.config, 'autoExt', nd, () => settings.save());
          }
  
          const testRow = document.createElement('div'); testRow.style.cssText = 'margin:12px 0 16px;display:flex;gap:8px;align-items:center;';
          const testBtn = C.createActionButton('API 키 테스트', 'primary'); testBtn.style.padding = '6px 16px';
          const testResult = document.createElement('span'); testResult.style.cssText = 'font-size:12px;color:var(--li-muted,#748196);word-break:break-all;';
          testBtn.onclick = async () => {
            const apiType = settings.config.autoExtApiType || 'key';
            const missing = apiType === 'deepseek' ? !settings.config.autoExtDeepSeekKey : apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript : !settings.config.autoExtKey;
            if (missing) { alert(apiType === 'deepseek' ? 'DeepSeek API 키 필요.' : apiType === 'vertex' ? 'Vertex JSON 필요.' : apiType === 'firebase' ? 'Firebase 설정 필요.' : 'API 키 필요.'); return; }
            testBtn.disabled = true; testResult.textContent = '테스트 중...';
            try {
              const testModel = settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : (settings.config.autoExtModel || (((settings.config.autoExtApiType || 'key') === 'deepseek') ? 'deepseek-v4-flash' : 'gemini-3-flash-preview'));
              const r = await C.callGeminiApi('Say "OK" in one word.', { apiType: settings.config.autoExtApiType, key: settings.config.autoExtKey, deepSeekKey: settings.config.autoExtDeepSeekKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation, vertexProjectId: settings.config.autoExtVertexProjectId, firebaseScript: settings.config.autoExtFirebaseScript, model: testModel, maxRetries: 0, deepSeekThinking: settings.config.autoExtDeepSeekThinking !== false, deepSeekReasoning: settings.config.autoExtDeepSeekReasoning || 'high', costContext: { feature: 'apiTest', chatKey: 'global' } });
              testResult.textContent = r.text ? '성공: ' + r.text.trim().slice(0, 50) : '실패: ' + r.error; testResult.style.color = r.text ? TONE.ok : TONE.danger;
            } catch(e) { testResult.textContent = '오류: ' + e.message; testResult.style.color = TONE.danger; }
            testBtn.disabled = false;
          };
          testRow.appendChild(testBtn); testRow.appendChild(testResult); nd.appendChild(testRow);
  
          const modelSection = C.createSectionTitle('모델 선택', 'API를 쓰는 기능별 모델을 여기서 한 번에 관리함. 프롬프트 내용은 프롬프트 관리 메뉴에서 수정함.');
          modelSection.style.marginTop = '14px';
          nd.appendChild(modelSection);
          const isDeepSeekApi = (settings.config.autoExtApiType || 'key') === 'deepseek';
          const deepSeekDefault = 'deepseek-v4-flash';
          addSelect(nd, '추출/정리용 모델', settings.config.autoExtModel || (isDeepSeekApi ? deepSeekDefault : 'gemini-3-flash-preview'), getGenerationModelGroups(), (v) => { settings.config.autoExtModel = v; settings.save(); }, { customKey: 'autoExtCustomModel' });
          addSelect(nd, '후보 준비 모델', settings.config.rerankModel || (isDeepSeekApi ? deepSeekDefault : ''), getLightModelGroups(), (v) => { settings.config.rerankModel = v; settings.save(); }, { customKey: 'rerankCustomModel' });
          const judgeCtl = addSelect(nd, '과거 장면 판단 모델', settings.config.temporalRecallJudgeModel || (isDeepSeekApi ? deepSeekDefault : ''), getLightModelGroups(), (v) => { settings.config.temporalRecallJudgeModel = v; settings.save(); }, { customKey: 'temporalRecallJudgeCustomModel' });
          addSelect(nd, '응답 교정 모델', settings.config.refinerModel !== undefined ? settings.config.refinerModel : (isDeepSeekApi ? deepSeekDefault : ''), getLightModelGroups(), (v) => { settings.config.refinerModel = v; settings.save(); }, { customKey: 'refinerCustomModel' });
  
          if ((settings.config.autoExtApiType || 'key') !== 'deepseek') {
            const rl = document.createElement('div'); rl.textContent = '생각 깊이'; rl.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin:10px 0 4px;font-weight:800;'; nd.appendChild(rl);
            const rs = document.createElement('select'); rs.style.cssText = FIELD_STYLE;
            [['Off', 'off'], ['Minimal (256)', 'minimal'], ['Low (1024)', 'low'], ['Medium (2048)', 'medium'], ['High (4096)', 'high'], ['Budget (사용자 지정)', 'budget']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; rs.appendChild(o); });
            rs.value = settings.config.autoExtReasoning || 'medium'; nd.appendChild(rs);
            const bl = document.createElement('div'); bl.textContent = '생각 예산'; bl.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:4px;margin-top:8px;' + (rs.value === 'budget' ? '' : 'display:none;');
            const bi = document.createElement('input'); bi.type = 'number'; bi.value = settings.config.autoExtBudget || 2048; bi.style.cssText = FIELD_STYLE + (rs.value === 'budget' ? '' : 'display:none;');
            bi.onchange = () => { settings.config.autoExtBudget = parseInt(bi.value) || 2048; settings.save(); };
            rs.onchange = () => { settings.config.autoExtReasoning = rs.value; settings.save(); const isB = rs.value === 'budget'; bl.style.display = isB ? '' : 'none'; bi.style.display = isB ? '' : 'none'; };
            nd.appendChild(bl); nd.appendChild(bi);
            const jrl = document.createElement('div'); jrl.textContent = '과거 장면 판단 생각 깊이'; jrl.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin:10px 0 4px;font-weight:800;'; nd.appendChild(jrl);
            const jrs = document.createElement('select'); jrs.style.cssText = FIELD_STYLE;
            [['Minimal (권장)', 'minimal'], ['Low', 'low'], ['Medium', 'medium'], ['High', 'high']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; jrs.appendChild(o); });
            jrs.value = settings.config.temporalRecallJudgeReasoning || 'minimal';
            nd.appendChild(jrs);
            const proWarn = document.createElement('div'); proWarn.style.cssText = 'font-size:10px;color:' + TONE.warn + ';margin-top:4px;display:none;'; proWarn.textContent = '주의: Pro 모델은 minimal 미지원. low 이상 권장.'; nd.appendChild(proWarn);
            const refreshProWarn = () => { const m = judgeCtl.sel.value === '_custom' ? (judgeCtl.customInput?.value || '') : judgeCtl.sel.value; proWarn.style.display = (String(m).includes('pro') && jrs.value === 'minimal') ? '' : 'none'; };
            judgeCtl.sel.addEventListener('change', refreshProWarn);
            if (judgeCtl.customInput) judgeCtl.customInput.addEventListener('change', refreshProWarn);
            jrs.onchange = () => { settings.config.temporalRecallJudgeReasoning = jrs.value; settings.save(); refreshProWarn(); };
            refreshProWarn();
          }
        }});
      }, 'API 설정');
  });

  _w.__LoreInj.registerSettingsPage('prompts', '프롬프트 관리', (m) => {
    m.replaceContentPanel((panel) => renderPromptSettings(panel), '프롬프트 관리');
  });
  
  _w.__LoreInj.__subApiLoaded = true;
})();
