// == 인젝터 UI 패널 — Extraction ==
// 역할: 자동/수동/일괄 대화 정리 설정
// 의존: injecter-ui-utils.js, injecter-4.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:extract] UI utils not loaded');
    return;
  }
  if (UI.__extractPanelLoaded) return;

  function L() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  function toggle(nd, title, desc, value, onChange) {
    const C = UI.getCore();
    if (C && C.createToggleRow) {
      nd.appendChild(C.createToggleRow(title, desc, value, onChange));
      return;
    }
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;cursor:pointer;';
    const text = document.createElement('div'); text.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc; d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!value; cb.style.cssText = 'accent-color:#4a9;';
    cb.onchange = function(){ onChange(cb.checked); };
    text.appendChild(t); text.appendChild(d); row.appendChild(text); row.appendChild(cb); nd.appendChild(row);
  }

  function numberInput(nd, label, key, defaultVal, min, max, settings) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;';
    const l = document.createElement('div');
    l.textContent = label;
    l.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;';
    const input = document.createElement('input');
    input.type = 'number';
    input.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:90px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
    input.onchange = function() {
      const v = parseInt(input.value, 10);
      if (!isNaN(v)) { settings.config[key] = v; save(settings); }
    };
    row.appendChild(l);
    row.appendChild(input);
    nd.appendChild(row);
  }

  UI.registerPanel({
    id: 'extract',
    label: '추출',
    title: '추출',
    order: 60,
    render: function(panel) {
      const R = L();
      const C = R.C;
      const settings = R.settings;
      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Settings are not loaded yet.', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('요약', '현재 추출 상태'));
        if (UI.createSummaryGrid) {
          const packName = settings.config.autoExtPack || 'Captured lore';
          const tpl = typeof settings.getActiveTemplate === 'function' ? settings.getActiveTemplate() : null;
          nd.appendChild(UI.createSummaryGrid([
            { label: '자동 추출', value: settings.config.autoExtEnabled ? '켜짐' : '꺼짐' },
            { label: '저장 팩', value: packName },
            { label: '프롬프트', value: tpl && tpl.name ? tpl.name : '기본 프롬프트' }
          ]));
        }
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('추출 설정', '최근 대화를 읽어 중요한 사실을 로어 항목으로 저장합니다.'));

        toggle(nd, '자동 추출', '몇 턴마다 대화를 읽고 유용한 사실을 저장합니다.', !!settings.config.autoExtEnabled, function(v){
          settings.config.autoExtEnabled = v;
          save(settings);
        });
        toggle(nd, '기존 로어와 비교', '중복 생성을 줄이기 위해 현재 로어를 함께 참고합니다.', settings.config.autoExtIncludeDb !== false, function(v){
          settings.config.autoExtIncludeDb = v;
          save(settings);
        });
        toggle(nd, '페르소나 이름 포함', '추출 항목이 올바른 캐릭터명을 쓰도록 사용자 페르소나 이름을 함께 보냅니다.', settings.config.autoExtIncludePersona !== false, function(v){
          settings.config.autoExtIncludePersona = v;
          save(settings);
        });
        toggle(nd, '검색 데이터 자동 생성', 'API 설정이 가능하면 추출 후 임베딩을 생성합니다.', settings.config.autoEmbedOnExtract !== false, function(v){
          settings.config.autoEmbedOnExtract = v;
          save(settings);
        });

        numberInput(nd, '추출 주기 N턴', 'autoExtTurns', 8, 1, 50, settings);
        numberInput(nd, '읽을 최근 턴 수', 'autoExtScanRange', 6, 1, 50, settings);
        numberInput(nd, '최신 턴 제외 수', 'autoExtOffset', 3, 0, 30, settings);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('저장할 팩', '현재 페이지에서 추출한 로어를 이 팩에 저장합니다.'));

        const packInput = document.createElement('input');
        packInput.placeholder = 'Captured lore';
        packInput.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
        nd.appendChild(packInput);

        if (R.getAutoExtPackForUrl && C && C.getCurUrl) {
          R.getAutoExtPackForUrl(C.getCurUrl()).then(function(name){ packInput.value = name; });
        } else {
          packInput.value = settings.config.autoExtPack || 'Captured lore';
        }

        packInput.onchange = function() {
          const value = packInput.value.trim() || 'Captured lore';
          settings.config.autoExtPack = value;
          if (R.setAutoExtPackForUrl && C && C.getCurUrl) R.setAutoExtPackForUrl(C.getCurUrl(), value);
          save(settings);
        };
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('수동 추출', '현재 설정으로 추출을 한 번 실행합니다.'));

        const btn = UI.createButton('수동 추출 실행', { kind: 'success', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runAutoExtract) { alert('추출 모듈을 아직 불러오지 못했습니다.'); return; }
          if (!confirm('지금 수동 추출을 실행할까요?')) return;
          btn.disabled = true;
          const orig = btn.textContent;
          const start = Date.now();
          btn.textContent = '실행 중';
          if (UI.setPulseStatus) UI.setPulseStatus(status, '에리가 대화를 읽는 중..');
          else status.textContent = '에리가 대화를 읽는 중..';
          try {
            await R.runAutoExtract(true);
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, '완료 (' + Math.floor((Date.now() - start) / 1000) + '초)', 'info');
            else status.textContent = '완료 (' + Math.floor((Date.now() - start) / 1000) + '초)';
          } catch(e) {
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, '실패: ' + String(e.message || e).slice(0, 100), 'error');
            else status.textContent = '실패: ' + String(e.message || e).slice(0, 100);
          } finally {
            btn.textContent = orig;
            btn.disabled = false;
          }
        };
        nd.appendChild(btn);
        nd.appendChild(status);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('일괄 추출', '긴 기존 채팅을 여러 묶음으로 처리합니다. API 호출이 많이 발생할 수 있습니다.'));

        numberInput(nd, '묶음당 턴 수', 'batchExtTurnsPerBatch', 50, 10, 200, settings);
        numberInput(nd, '겹칠 턴 수', 'batchExtOverlap', 5, 0, 50, settings);
        numberInput(nd, '묶음당 재시도', 'batchExtMaxAttempts', 3, 1, 10, settings);

        const btn = UI.createButton('일괄 추출 실행', { kind: 'primary', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runBatchExtract) { alert('일괄 추출 모듈을 아직 불러오지 못했습니다.'); return; }
          if (!confirm('일괄 추출을 실행할까요? API 호출이 많이 발생할 수 있습니다.')) return;
          btn.disabled = true;
          const orig = btn.textContent;
          const started = Date.now();
          btn.textContent = '실행 중';
          if (UI.setPulseStatus) UI.setPulseStatus(status, '에리가 채팅 기록을 불러오는 중..');
          else status.textContent = '에리가 채팅 기록을 불러오는 중..';
          try {
            const report = await R.runBatchExtract({
              turnsPerBatch: settings.config.batchExtTurnsPerBatch || 50,
              overlap: settings.config.batchExtOverlap !== undefined ? settings.config.batchExtOverlap : 5,
              maxAttempts: settings.config.batchExtMaxAttempts || 3,
              onProgress: function(ev) {
                if (ev.phase === 'batch') {
                  if (UI.setPulseStatus) UI.setPulseStatus(status, '에리가 ' + ev.index + '/' + ev.total + ' 묶음 처리 중..');
                  else status.textContent = '에리가 ' + ev.index + '/' + ev.total + ' 묶음 처리 중..';
                }
              }
            });
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, '완료: ' + report.totalBatches + '묶음 / 성공 ' + report.ok + ' / 빈 결과 ' + report.empty + ' / 실패 ' + report.failed + ' / 병합 ' + report.entriesAdded, report.failed ? 'warn' : 'info');
            else status.textContent = '완료: ' + report.totalBatches + '묶음 / 성공 ' + report.ok + ' / 빈 결과 ' + report.empty + ' / 실패 ' + report.failed + ' / 병합 ' + report.entriesAdded;
          } catch(e) {
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, '실패: ' + String(e.message || e).slice(0, 100), 'error');
            else status.textContent = '실패: ' + String(e.message || e).slice(0, 100);
          } finally {
            btn.textContent = orig;
            btn.disabled = false;
          }
        };
        nd.appendChild(btn);
        nd.appendChild(status);
      });

      UI.addBox(panel, function(nd) {
        const promptHost = nd;
        if (UI.createDetailsSection) {
          const detail = UI.createDetailsSection('프롬프트 설정', '자주 쓰지 않는 추출 스키마와 프롬프트 템플릿입니다. 필요할 때만 펼쳐서 확인합니다.', false);
          promptHost.appendChild(detail);
          nd = detail.contentBody || detail;
        } else {
          nd.appendChild(UI.createSection('프롬프트 설정', '자주 쓰지 않는 추출 스키마와 프롬프트 템플릿입니다. 실행 설정 아래에 둡니다.'));
        }

        if (typeof settings.getActiveTemplate !== 'function') {
          nd.appendChild(UI.createNotice('템플릿 설정을 불러올 수 없습니다. injecter-3.js 설정 모듈을 확인하세요.', 'error'));
          return;
        }

        const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:10px;font-family:monospace;resize:vertical;';
        const top = document.createElement('div');
        top.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;';

        const tplSelect = document.createElement('select');
        tplSelect.style.cssText = 'flex:1;min-width:180px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
        const newBtn = UI.createButton('새 템플릿', { kind: 'primary', compact: true });
        const renameBtn = UI.createButton('이름 변경', { compact: true });
        const delBtn = UI.createButton('삭제', { kind: 'danger', compact: true });
        const resetBtn = UI.createButton('기본값 복구', { compact: true });

        top.appendChild(tplSelect);
        top.appendChild(newBtn);
        top.appendChild(renameBtn);
        top.appendChild(delBtn);
        top.appendChild(resetBtn);
        nd.appendChild(top);

        const note = document.createElement('div');
        note.style.cssText = 'font-size:11px;color:#888;line-height:1.5;margin-bottom:10px;word-break:keep-all;';
        note.textContent = '기본 템플릿은 코드 기준이라 직접 수정하지 않습니다. 새 템플릿을 만든 뒤 수정하세요. 유저 템플릿은 버전이 바뀌어도 유지됩니다. {schema}, {context}, {entries} 자리표시자는 지우면 안 됨.';
        nd.appendChild(note);

        function makeLabel(text) {
          const label = document.createElement('div');
          label.textContent = text;
          label.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;margin:10px 0 4px;';
          return label;
        }

        const schemaLabel = makeLabel('스키마(JSON)');
        const taSchema = document.createElement('textarea');
        taSchema.style.cssText = S + 'height:150px;';
        const withoutLabel = makeLabel('프롬프트 — 기존 로어 미포함');
        const taWithout = document.createElement('textarea');
        taWithout.style.cssText = S + 'height:170px;';
        const withLabel = makeLabel('프롬프트 — 기존 로어 포함');
        const taWith = document.createElement('textarea');
        taWith.style.cssText = S + 'height:190px;';

        nd.appendChild(schemaLabel);
        nd.appendChild(taSchema);
        nd.appendChild(withoutLabel);
        nd.appendChild(taWithout);
        nd.appendChild(withLabel);
        nd.appendChild(taWith);

        function getTemplates() {
          if (!Array.isArray(settings.config.templates)) settings.config.templates = [];
          if (!settings.config.templates.length && R.DEFAULT_AUTO_EXTRACT_SCHEMA) {
            settings.config.templates.push({
              id: 'default',
              name: '기본 프롬프트',
              isDefault: true,
              schema: R.DEFAULT_AUTO_EXTRACT_SCHEMA,
              promptWithoutDb: R.DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB || '',
              promptWithDb: R.DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB || ''
            });
            settings.config.activeTemplateId = 'default';
            save(settings);
          }
          return settings.config.templates;
        }

        function activeTemplate() {
          let tpl = settings.getActiveTemplate();
          if (!tpl) {
            const list = getTemplates();
            tpl = list.find(t => t.id === settings.config.activeTemplateId) || list[0];
          }
          return tpl;
        }

        function renderTemplates() {
          const templates = getTemplates();
          tplSelect.innerHTML = '';
          templates.forEach(tpl => {
            const opt = document.createElement('option');
            opt.value = tpl.id;
            opt.textContent = tpl.name + (tpl.isDefault ? ' (기본)' : '');
            tplSelect.appendChild(opt);
          });

          const tpl = activeTemplate();
          if (!tpl) return;
          tplSelect.value = tpl.id;
          const locked = !!tpl.isDefault;
          renameBtn.style.display = locked ? 'none' : '';
          delBtn.style.display = locked ? 'none' : '';
          resetBtn.style.display = locked ? 'none' : '';
          taSchema.disabled = locked;
          taWithout.disabled = locked;
          taWith.disabled = locked;
          taSchema.style.opacity = locked ? '.65' : '1';
          taWithout.style.opacity = locked ? '.65' : '1';
          taWith.style.opacity = locked ? '.65' : '1';
          taSchema.value = tpl.schema || '';
          taWithout.value = tpl.promptWithoutDb || '';
          taWith.value = tpl.promptWithDb || '';
        }

        function updateActiveField(key, value) {
          const templates = getTemplates();
          const id = settings.config.activeTemplateId || 'default';
          const idx = templates.findIndex(t => t.id === id);
          if (idx < 0 || templates[idx].isDefault) return;
          templates[idx][key] = value;
          save(settings);
        }

        tplSelect.onchange = function() {
          settings.config.activeTemplateId = tplSelect.value;
          save(settings);
          renderTemplates();
        };

        newBtn.onclick = function() {
          const name = prompt('새 템플릿 이름:', '내 추출 프롬프트');
          if (!name) return;
          const base = activeTemplate();
          const id = 'tpl_' + Date.now();
          getTemplates().push({
            id,
            name: name.trim(),
            isDefault: false,
            schema: base ? (base.schema || '') : '',
            promptWithoutDb: base ? (base.promptWithoutDb || '') : '',
            promptWithDb: base ? (base.promptWithDb || '') : ''
          });
          settings.config.activeTemplateId = id;
          save(settings);
          renderTemplates();
        };

        renameBtn.onclick = function() {
          const tpl = activeTemplate();
          if (!tpl || tpl.isDefault) return;
          const name = prompt('템플릿 이름:', tpl.name);
          if (!name) return;
          tpl.name = name.trim();
          save(settings);
          renderTemplates();
        };

        delBtn.onclick = function() {
          const tpl = activeTemplate();
          if (!tpl || tpl.isDefault) return;
          if (!confirm('[' + tpl.name + '] 템플릿을 삭제할까요?')) return;
          settings.config.templates = getTemplates().filter(t => t.id !== tpl.id);
          settings.config.activeTemplateId = 'default';
          save(settings);
          renderTemplates();
        };

        resetBtn.onclick = function() {
          const tpl = activeTemplate();
          if (!tpl || tpl.isDefault) return;
          const def = getTemplates().find(t => t.isDefault);
          if (!def) return;
          if (!confirm('[' + tpl.name + '] 내용을 기본 프롬프트로 되돌릴까요?')) return;
          tpl.schema = def.schema || '';
          tpl.promptWithoutDb = def.promptWithoutDb || '';
          tpl.promptWithDb = def.promptWithDb || '';
          save(settings);
          renderTemplates();
        };

        taSchema.onchange = function(){ updateActiveField('schema', taSchema.value); };
        taWithout.onchange = function(){ updateActiveField('promptWithoutDb', taWithout.value); };
        taWith.onchange = function(){ updateActiveField('promptWithDb', taWith.value); };

        renderTemplates();
      });
    }
  });

  UI.__extractPanelLoaded = true;
  console.log('[LoreInj:UI] extraction panel loaded');
})();