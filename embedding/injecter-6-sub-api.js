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

  function renderPromptSettings(panel) {
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div');
      title.textContent = '추출 프롬프트';
      title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;';
      nd.appendChild(title);
      const note = document.createElement('div');
      note.textContent = '자동/수동 추출과 지식 변환에서 쓰는 템플릿. 기본 템플릿은 직접 수정 안 됨.';
      note.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;';
      nd.appendChild(note);

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
      };
      newTplBtn.onclick = () => { const name = prompt('새 템플릿 이름:'); if (!name) return; const newId = 'tpl_' + Date.now(); const active = settings.getActiveTemplate(); settings.config.templates.push({ id: newId, name, isDefault: false, schema: active.schema, promptWithoutDb: active.promptWithoutDb, promptWithDb: active.promptWithDb }); settings.config.activeTemplateId = newId; settings.save(); renderTplOptions(); };
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
      const title = document.createElement('div');
      title.textContent = '후보 재정렬/응답 교정 프롬프트';
      title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;';
      nd.appendChild(title);
      addPromptArea(nd, '후보 재정렬 지시문', settings.config.rerankPrompt || C.DEFAULTS.rerankPrompt, (v) => { settings.config.rerankPrompt = v; settings.save(); }, { height: 110, reset: () => C.DEFAULTS.rerankPrompt });
      addPromptArea(nd, '응답 교정 지시문', settings.config.refinerCustomPrompt || '', (v) => { settings.config.refinerCustomPrompt = v; settings.config.refinerUseDynamic = false; settings.save(); }, { height: 180 });
      const note = document.createElement('div');
      note.textContent = '응답 교정 템플릿/체크박스 선택은 AI 응답 교정 화면에서도 가능함.';
      note.style.cssText = 'font-size:11px;color:#888;line-height:1.4;';
      nd.appendChild(note);
    }});
  }
  
  _w.__LoreInj.registerSubMenu('api', function(modal) {
    modal.createSubMenu('API 설정', (m) => {
      m.replaceContentPanel((panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = 'API 연결'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(t);
          const apiSummary = document.createElement('div');
          const apiTypeLabel = (settings.config.autoExtApiType || 'key') === 'vertex' ? 'Vertex JSON' : (settings.config.autoExtApiType || 'key') === 'firebase' ? 'Firebase' : 'API Key';
          apiSummary.textContent = '현재 방식: ' + apiTypeLabel + ' · 추출/정리, 변환, 중요 장면 추출이 이 연결 사용함.';
          apiSummary.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;';
          nd.appendChild(apiSummary);
          C.createApiInput(settings.config, 'autoExt', nd, () => settings.save());
  
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
              const r = await C.callGeminiApi('Say "OK" in one word.', { apiType: settings.config.autoExtApiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation, vertexProjectId: settings.config.autoExtVertexProjectId, firebaseScript: settings.config.autoExtFirebaseScript, model: settings.config.autoExtModel, maxRetries: 0, costContext: { feature: 'apiTest', chatKey: 'global' } });
              testResult.textContent = r.text ? '✅ 성공: ' + r.text.trim().slice(0, 50) : '❌ 실패: ' + r.error; testResult.style.color = r.text ? '#4a9' : '#d66';
            } catch(e) { testResult.textContent = '❌ 오류: ' + e.message; testResult.style.color = '#d66'; }
            testBtn.disabled = false;
          };
          testRow.appendChild(testBtn); testRow.appendChild(testResult); nd.appendChild(testRow);
  
          const modelHead = document.createElement('div'); modelHead.textContent = '모델 선택'; modelHead.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin:14px 0 8px;padding-top:10px;border-top:1px solid #333;'; nd.appendChild(modelHead);
          const modelNote = document.createElement('div'); modelNote.textContent = 'API를 쓰는 기능별 모델을 여기서 한 번에 관리함. 프롬프트 내용은 프롬프트 관리 메뉴에서 수정함.'; modelNote.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;'; nd.appendChild(modelNote);
          addSelect(nd, '추출/정리용 모델', settings.config.autoExtModel || 'gemini-3-flash-preview', [['Gemini 3.x', [['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]], ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]], (v) => { settings.config.autoExtModel = v; settings.save(); }, { customKey: 'autoExtCustomModel' });
          addSelect(nd, '후보 재정렬 모델', settings.config.rerankModel || 'gemini-3-flash-preview', [['Gemini', [['3.1 Flash Lite (추천)', 'gemini-3.1-flash-lite-preview'], ['3.0 Flash', 'gemini-3-flash-preview'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite']]]], (v) => { settings.config.rerankModel = v; settings.save(); });
          const judgeCtl = addSelect(nd, '과거 장면 판단 모델', settings.config.temporalRecallJudgeModel || 'gemini-3.1-flash-lite-preview', [['Gemini 3.x (추천)', [['3.1 Flash Lite (기본)', 'gemini-3.1-flash-lite-preview'], ['3.0 Flash', 'gemini-3-flash-preview']]], ['Gemini 2.x', [['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]], (v) => { settings.config.temporalRecallJudgeModel = v; settings.save(); }, { customKey: 'temporalRecallJudgeCustomModel' });
          addSelect(nd, '응답 교정 모델', settings.config.refinerModel !== undefined ? settings.config.refinerModel : '', [['기본 LLM과 동일', [['기본 LLM 사용', '']]], ['Gemini 3.x', [['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Flash Lite', 'gemini-3.1-flash-lite-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]], ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.5 Flash', 'gemini-2.5-flash'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]], (v) => { settings.config.refinerModel = v; settings.save(); }, { customKey: 'refinerCustomModel' });
  
          const rl = document.createElement('div'); rl.textContent = '생각 깊이'; rl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(rl);
          const rs = document.createElement('select'); rs.style.cssText = FIELD_STYLE;
          [['Off', 'off'], ['Minimal (256)', 'minimal'], ['Low (1024)', 'low'], ['Medium (2048)', 'medium'], ['High (4096)', 'high'], ['Budget (사용자 지정)', 'budget']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; rs.appendChild(o); });
          rs.value = settings.config.autoExtReasoning || 'medium'; nd.appendChild(rs);
          const bl = document.createElement('div'); bl.textContent = '생각 예산'; bl.style.cssText = 'font-size:11px;color:#666;margin-bottom:4px;margin-top:8px;' + (rs.value === 'budget' ? '' : 'display:none;');
          const bi = document.createElement('input'); bi.type = 'number'; bi.value = settings.config.autoExtBudget || 2048; bi.style.cssText = FIELD_STYLE + (rs.value === 'budget' ? '' : 'display:none;');
          bi.onchange = () => { settings.config.autoExtBudget = parseInt(bi.value) || 2048; settings.save(); };
          rs.onchange = () => { settings.config.autoExtReasoning = rs.value; settings.save(); const isB = rs.value === 'budget'; bl.style.display = isB ? '' : 'none'; bi.style.display = isB ? '' : 'none'; };
          nd.appendChild(bl); nd.appendChild(bi);
          const jrl = document.createElement('div'); jrl.textContent = '과거 장면 판단 생각 깊이'; jrl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(jrl);
          const jrs = document.createElement('select'); jrs.style.cssText = FIELD_STYLE;
          [['Minimal (권장)', 'minimal'], ['Low', 'low'], ['Medium', 'medium'], ['High', 'high']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; jrs.appendChild(o); });
          jrs.value = settings.config.temporalRecallJudgeReasoning || 'minimal';
          nd.appendChild(jrs);
          const proWarn = document.createElement('div'); proWarn.style.cssText = 'font-size:10px;color:#d96;margin-top:4px;display:none;'; proWarn.textContent = '주의: Pro 모델은 minimal 미지원. low 이상 권장.'; nd.appendChild(proWarn);
          const refreshProWarn = () => { const m = judgeCtl.sel.value === '_custom' ? (judgeCtl.customInput?.value || '') : judgeCtl.sel.value; proWarn.style.display = (String(m).includes('pro') && jrs.value === 'minimal') ? '' : 'none'; };
          judgeCtl.sel.addEventListener('change', refreshProWarn);
          if (judgeCtl.customInput) judgeCtl.customInput.addEventListener('change', refreshProWarn);
          jrs.onchange = () => { settings.config.temporalRecallJudgeReasoning = jrs.value; settings.save(); refreshProWarn(); };
          refreshProWarn();
        }});
      }, 'API 설정');
    });

    modal.createSubMenu('프롬프트 관리', (m) => {
      m.replaceContentPanel((panel) => renderPromptSettings(panel), '프롬프트 관리');
    });
  });
  
  _w.__LoreInj.__subApiLoaded = true;
})();
