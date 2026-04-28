// injecter-6-sub-extract.js: 자동 대화 추출 + 배치 추출 + 템플릿 + URL/텍스트 변환
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subExtractLoaded) return;
  
  const { C, db, settings, getAutoExtPackForUrl, setAutoExtPackForUrl, isEntryEnabledForUrl, setPackEnabled } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  
  _w.__LoreInj.registerSubMenu('extract', function(modal) {
    modal.createSubMenu('추출/변환 설정', (m) => {
      m.replaceContentPanel((panel) => {
        // === 자동 대화 추출 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow('자동 대화 추출', '대화를 주기적으로 DB에 추가.', settings.config.autoExtEnabled, (v) => { settings.config.autoExtEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('기존 로어 전송', '전체 JSON 데이터를 함께 보내 중복 방지.', settings.config.autoExtIncludeDb, (v) => { settings.config.autoExtIncludeDb = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('페르소나 정보 전송', '추출 시 페르소나 이름을 같이 보내 정확도 올림.', settings.config.autoExtIncludePersona, (v) => { settings.config.autoExtIncludePersona = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('시간축 이벤트 추출', '별도 패스로 장기 회상용 timeline_event 저장.', settings.config.temporalExtractEnabled !== false, (v) => { settings.config.temporalExtractEnabled = v; settings.save(); }));
  
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
          row1.appendChild(makeInput('주기(턴)', 'autoExtTurns', 8)); row1.appendChild(makeInput('범위(턴)', 'autoExtScanRange', 6)); row1.appendChild(makeInput('오프셋', 'autoExtOffset', 5)); row1.appendChild(makeInput('시간축 최대', 'temporalMaxEventsPerPass', 5));
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
  
        // === 시간축 회상 판정 (Judge AI) ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const jt = document.createElement('div'); jt.textContent = '시간축 회상 판정 (Judge AI)'; jt.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:6px;'; nd.appendChild(jt);
          const jd = document.createElement('div'); jd.textContent = '최근 맥락을 빠르게 분석해 어떤 시간축 이벤트를 삽입할지 결정. 가벼운 모델 + 최소 추론 권장.'; jd.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;'; nd.appendChild(jd);
          nd.appendChild(C.createToggleRow('Judge 사용', '시간축 삽입 결정에 LLM 판정 단계 추가.', settings.config.temporalRecallJudgeEnabled, (v) => { settings.config.temporalRecallJudgeEnabled = v; settings.save(); }));
          const JS = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
          const jml = document.createElement('div'); jml.textContent = 'Judge 모델'; jml.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(jml);
          const jms = document.createElement('select'); jms.style.cssText = JS;
          [['Gemini 3.x (추천)', [['3.1 Flash Lite (기본)', 'gemini-3.1-flash-lite-preview'], ['3.0 Flash', 'gemini-3-flash-preview']]], ['Gemini 2.x', [['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]].forEach(([g, opts]) => { const og = document.createElement('optgroup'); og.label = g; opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); }); jms.appendChild(og); });
          jms.value = settings.config.temporalRecallJudgeModel || 'gemini-3.1-flash-lite-preview';
          const jci = document.createElement('input'); jci.type = 'text'; jci.value = settings.config.temporalRecallJudgeCustomModel || ''; jci.placeholder = '모델명 직접 입력'; jci.style.cssText = JS + 'margin-top:6px;' + (jms.value === '_custom' ? '' : 'display:none;');
          nd.appendChild(jms); nd.appendChild(jci);
          const jrl = document.createElement('div'); jrl.textContent = '추론(Reasoning) 레벨'; jrl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;'; nd.appendChild(jrl);
          const jrs = document.createElement('select'); jrs.style.cssText = JS;
          [['Minimal (권장)', 'minimal'], ['Low', 'low'], ['Medium', 'medium'], ['High', 'high']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; jrs.appendChild(o); });
          jrs.value = settings.config.temporalRecallJudgeReasoning || 'minimal';
          nd.appendChild(jrs);
          const proWarn = document.createElement('div'); proWarn.style.cssText = 'font-size:10px;color:#d96;margin-top:4px;display:none;'; proWarn.textContent = '⚠ Gemini 3.1 Pro는 minimal 미지원 — low 이상 권장.'; nd.appendChild(proWarn);
          const refreshProWarn = () => { const m = jms.value === '_custom' ? (jci.value || '') : jms.value; const isPro = String(m).includes('pro'); const isMinimal = jrs.value === 'minimal'; proWarn.style.display = (isPro && isMinimal) ? '' : 'none'; };
          jms.onchange = () => { settings.config.temporalRecallJudgeModel = jms.value; settings.save(); jci.style.display = jms.value === '_custom' ? '' : 'none'; refreshProWarn(); };
          jci.onchange = () => { settings.config.temporalRecallJudgeCustomModel = jci.value; settings.save(); refreshProWarn(); };
          jrs.onchange = () => { settings.config.temporalRecallJudgeReasoning = jrs.value; settings.save(); refreshProWarn(); };
          refreshProWarn();
          const jrow = document.createElement('div'); jrow.style.cssText = 'display:flex;gap:12px;margin-top:10px;';
          const jmkNum = (label, key, defaultVal, min, max) => { const f = document.createElement('div'); f.style.flex = '1'; const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; const i = document.createElement('input'); i.type = 'number'; i.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal; if (min !== undefined) i.min = min; if (max !== undefined) i.max = max; i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;'; const save = () => { const v = parseInt(i.value); if (!isNaN(v)) { settings.config[key] = v; settings.save(); } }; i.oninput = save; i.onchange = save; f.appendChild(l); f.appendChild(i); return f; };
          jrow.appendChild(jmkNum('타임아웃(ms)', 'temporalRecallJudgeTimeoutMs', 2500, 500, 30000));
          jrow.appendChild(jmkNum('후보 수', 'temporalRecallJudgeCandidateLimit', 6, 1, 30));
          nd.appendChild(jrow);
        }});
  
        // === 전체 로그 일괄 추출 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const bTitle = document.createElement('div'); bTitle.textContent = '전체 로그 일괄 추출'; bTitle.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;'; nd.appendChild(bTitle);
          const bDesc = document.createElement('div'); bDesc.textContent = '긴 기존 대화를 배치로 나눠 한 번에 정리. API 비용 큼 — 초기 마이그레이션용.'; bDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;'; nd.appendChild(bDesc);
  
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
          bRow.appendChild(mkNum('배치 크기(턴)', () => settings.config.batchExtTurnsPerBatch, v => settings.config.batchExtTurnsPerBatch = v, 50));
          bRow.appendChild(mkNum('오버랩(턴)', () => settings.config.batchExtOverlap, v => settings.config.batchExtOverlap = v, 5));
          bRow.appendChild(mkNum('재시도', () => settings.config.batchExtMaxAttempts, v => settings.config.batchExtMaxAttempts = v, 3));
          nd.appendChild(bRow);
  
          const bBtn = document.createElement('button'); bBtn.textContent = '전체 일괄 추출 실행';
          bBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:none;font-weight:bold;width:100%;margin-top:6px;';
          const bStatus = document.createElement('div'); bStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;';
          bBtn.onclick = async () => {
            if (!confirm('전체 로그를 배치로 나눠 분석합니다. API 비용 큼. 계속?')) return;
            settings.save();
            bBtn.disabled = true; const orig = bBtn.textContent; bBtn.textContent = '실행 중...';
            bStatus.textContent = '전체 로그 가져오는 중'; bStatus.style.color = '#4a9';
            const start = Date.now();
            try {
              const report = await _w.__LoreInj.runBatchExtract({
                turnsPerBatch: settings.config.batchExtTurnsPerBatch || 50,
                overlap: settings.config.batchExtOverlap !== undefined ? settings.config.batchExtOverlap : 5,
                maxAttempts: settings.config.batchExtMaxAttempts || 3,
                onProgress: (ev) => {
                  const sec = Math.floor((Date.now() - start) / 1000);
                  if (ev.phase === 'batch') bStatus.textContent = '배치 ' + ev.index + '/' + ev.total + ' 처리 중 (' + sec + '초)';
                }
              });
              const sec = Math.floor((Date.now() - start) / 1000);
              let msg = '완료 (' + sec + '초) — ' + report.totalBatches + '개 배치 / 성공 ' + report.ok + ' / 빈 ' + report.empty + ' / 실패 ' + report.failed + ' / 병합 ' + report.entriesAdded + '건';
              if (report.failed > 0) { msg += ' ⚠️ 실패 상세는 로그 탭'; bStatus.style.color = '#da8'; }
              else { bStatus.style.color = '#4a9'; }
              bStatus.textContent = msg;
            } catch(e) {
              bStatus.textContent = '실패 — ' + (e.message || String(e)).slice(0, 80);
              bStatus.style.color = '#d66';
            } finally {
              bBtn.textContent = orig; bBtn.disabled = false;
            }
          };
          nd.appendChild(bBtn);
          nd.appendChild(bStatus);
        }});
  
        // === 프롬프트 템플릿 관리 ===
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
          const lblSchema = document.createElement('div'); lblSchema.textContent = '스키마 (JSON — summary.full/compact/micro, callState, timeline, entities 포함)'; lblSchema.style.cssText = 'font-size:12px;color:#ccc;margin-bottom:4px;'; nd.appendChild(lblSchema);
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
  
        // === 지식 변환 (URL/텍스트 → 로어) ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';
          nd.innerHTML = '<div style="font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;">지식 변환 (URL/텍스트 → 로어)</div>';
          const urlInp = document.createElement('input'); urlInp.type = 'text'; urlInp.placeholder = 'URL 입력'; urlInp.style.cssText = S; nd.appendChild(urlInp);
          const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.placeholder = '팩 이름'; nameInp.style.cssText = S; nd.appendChild(nameInp);
          const rDiv = document.createElement('div'); rDiv.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const urlBtn = document.createElement('button'); urlBtn.textContent = 'URL 변환'; urlBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          urlBtn.onclick = async () => { if (!urlInp.value.trim() || !nameInp.value.trim()) { alert('URL과 팩이름 필요.'); return; } urlBtn.disabled = true; urlBtn.textContent = '변환중...'; try { const cnt = await C.importFromUrl(urlInp.value.trim(), nameInp.value.trim(), { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, model: settings.config.autoExtModel }); const rpt = C.__lastImportReport; let msg = '✅ ' + cnt + '개 생성'; if (rpt) { if (rpt.failed > 0) { const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || ''; msg += ' ⚠️ 청크 ' + rpt.failed + '/' + rpt.chunks + ' 실패: ' + firstErr.slice(0, 80); } else if (cnt === 0 && rpt.empty === rpt.chunks) { msg = '⚠️ 0개 — 모든 청크(' + rpt.chunks + '개)에서 AI가 추출 가능한 내용 없다고 판단'; } } rDiv.textContent = msg; if (cnt > 0) await setPackEnabled(nameInp.value.trim(), true); } catch (e) { rDiv.textContent = '❌ ' + e.message; } urlBtn.textContent = 'URL 변환'; urlBtn.disabled = false; };
          nd.appendChild(urlBtn); nd.appendChild(rDiv);
          const t2 = document.createElement('div'); t2.innerHTML = '<div style="font-size:13px;color:#ccc;font-weight:bold;margin-top:16px;margin-bottom:8px;">텍스트 → 로어 팩</div>'; nd.appendChild(t2);
          const ta = document.createElement('textarea'); ta.placeholder = '설정, 소설 텍스트 등'; ta.style.cssText = S + 'height:100px;resize:vertical;'; nd.appendChild(ta);
          const nameInp2 = document.createElement('input'); nameInp2.type = 'text'; nameInp2.placeholder = '팩 이름'; nameInp2.style.cssText = S; nd.appendChild(nameInp2);
          const rDiv2 = document.createElement('div'); rDiv2.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const tBtn = document.createElement('button'); tBtn.textContent = '텍스트 변환'; tBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          tBtn.onclick = async () => { if (!ta.value.trim() || !nameInp2.value.trim()) { alert('입력값 필요.'); return; } tBtn.disabled = true; tBtn.textContent = '변환중...'; try { const cnt = await C.importFromText(ta.value.trim(), nameInp2.value.trim(), { apiType: settings.config.autoExtApiType || 'key', key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId, model: settings.config.autoExtModel }); const rpt = C.__lastImportReport; let msg = '✅ ' + cnt + '개 생성'; if (rpt) { if (rpt.failed > 0) { const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || ''; msg += ' ⚠️ 청크 ' + rpt.failed + '/' + rpt.chunks + ' 실패: ' + firstErr.slice(0, 80); } else if (cnt === 0 && rpt.empty === rpt.chunks) { msg = '⚠️ 0개 — 모든 청크(' + rpt.chunks + '개)에서 AI가 추출 가능한 내용 없다고 판단'; } } rDiv2.textContent = msg; if (cnt > 0) await setPackEnabled(nameInp2.value.trim(), true); } catch (e) { rDiv2.textContent = '❌ ' + e.message; } tBtn.textContent = '텍스트 변환'; tBtn.disabled = false; };
          nd.appendChild(tBtn); nd.appendChild(rDiv2);
        }});
      }, '추출/변환 설정');
    });
  });
  
  _w.__LoreInj.__subExtractLoaded = true;
})();
