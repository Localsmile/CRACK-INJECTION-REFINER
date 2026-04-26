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

  function toggle(nd, title, desc, value, onChange, help) {
    const sw = UI.createSwitch ? UI.createSwitch(!!value, onChange, title) : null;
    if (sw) {
      nd.appendChild(UI.createSettingRow(title, desc, sw, help));
      return;
    }
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    cb.onchange = function(){ onChange(cb.checked); };
    nd.appendChild(UI.createSettingRow(title, desc, cb, help));
  }

  function numberInput(nd, label, key, defaultVal, min, max, settings, help) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:90px;padding:6px 8px;text-align:center;';
    input.onchange = function() {
      const v = parseInt(input.value, 10);
      if (!isNaN(v)) { settings.config[key] = v; save(settings); }
    };
    nd.appendChild(UI.createSettingRow(label, '', input, help));
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
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('설정을 아직 불러오지 못했음', 'error')); });
        return;
      }

      let packSummaryValue = null;
      let packInputNode = null;
      const curUrl = C && C.getCurUrl ? C.getCurUrl() : location.href;

      function setDisplayedPackName(name) {
        const safeName = name || '자동추출';
        if (packSummaryValue) packSummaryValue.textContent = safeName;
        if (packInputNode) packInputNode.value = safeName;
      }

      async function resolveCurrentPackName() {
        if (R.getAutoExtPackForUrl && C && C.getCurUrl) return await R.getAutoExtPackForUrl(curUrl);
        return settings.config.autoExtPack || '자동추출';
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('요약', '현재 추출 상태'));
        const tpl = typeof settings.getActiveTemplate === 'function' ? settings.getActiveTemplate() : null;
        const grid = document.createElement('div');
        grid.className = 'lore-summary-grid';
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:10px;margin:10px 0 2px;';

        function card(label, value) {
          const box = document.createElement('div');
          box.className = 'lore-card lore-summary-card';
          box.style.cssText = 'padding:12px 13px;min-width:0;';
          const l = document.createElement('div');
          l.textContent = label;
          l.style.cssText = 'font-size:11px;color:var(--lore-sub);line-height:1.35;margin-bottom:5px;';
          const v = document.createElement('div');
          v.textContent = value;
          v.style.cssText = 'font-size:14px;color:var(--lore-text);font-weight:800;line-height:1.35;word-break:keep-all;';
          box.appendChild(l);
          box.appendChild(v);
          grid.appendChild(box);
          return v;
        }

        card('자동 추출', settings.config.autoExtEnabled ? '작동' : '중지');
        packSummaryValue = card('저장 팩', '불러오는 중');
        card('프롬프트', tpl && tpl.name ? tpl.name : '기본 프롬프트');
        nd.appendChild(grid);

        resolveCurrentPackName().then(setDisplayedPackName).catch(function() {
          setDisplayedPackName(settings.config.autoExtPack || '자동추출');
        });
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('추출 설정', '최근 대화를 읽어 중요한 사실을 로어 항목으로 저장'));

        toggle(nd, '자동 추출', '정해둔 턴마다 최근 대화를 읽고 새 로어 후보를 저장', !!settings.config.autoExtEnabled, function(v){
          settings.config.autoExtEnabled = v;
          save(settings);
        }, '켜면 대화가 일정 턴 쌓일 때마다 자동으로 추출 실행.\n예: 추출 주기 8턴이면 약 8턴마다 최근 대화를 읽고 저장할 내용이 있는지 확인.\n끄면 자동 실행은 멈추고, 아래 수동 추출 버튼으로만 실행.');

        toggle(nd, '기존 로어와 비교', '이미 저장된 내용과 비교해 중복 저장을 줄임', settings.config.autoExtIncludeDb !== false, function(v){
          settings.config.autoExtIncludeDb = v;
          save(settings);
        }, '켜면 새 내용이 기존 로어와 같은지 함께 확인.\n예: 이미 “에리는 슈크림 붕어빵 선호”가 있으면 비슷한 항목을 새로 만들 확률 감소.\n끄면 빠르지만 중복 항목이 늘 수 있음.');

        toggle(nd, '페르소나 이름 포함', '추출 요청에 사용자 페르소나 이름을 함께 전달', settings.config.autoExtIncludePersona !== false, function(v){
          settings.config.autoExtIncludePersona = v;
          save(settings);
        }, '켜면 대화 속 인물 이름을 더 안정적으로 구분.\n예: 사용자 페르소나와 상대 캐릭터 이름이 모두 나오는 장면에서 관계 항목이 엉뚱하게 묶이는 일을 줄임.');

        toggle(nd, '검색 데이터 자동 생성', '추출 뒤 의미 검색용 데이터를 바로 생성', settings.config.autoEmbedOnExtract !== false, function(v){
          settings.config.autoEmbedOnExtract = v;
          save(settings);
        }, '켜면 새로 저장한 로어가 의미 기반 검색에 곧바로 들어감.\n예: 로어에는 “슈크림 붕어빵”, 대화에는 “크림 붕어빵”만 나와도 찾기 쉬워짐.\nAPI 호출이 추가로 발생.');

        numberInput(nd, '추출 주기 N턴', 'autoExtTurns', 8, 1, 50, settings, '자동 추출을 켰을 때 몇 턴마다 실행할지 결정.\n예: 5면 자주 저장해 최신 변화에 민감. 12면 호출은 줄지만 반영이 늦음.');
        numberInput(nd, '읽을 최근 턴 수', 'autoExtScanRange', 6, 1, 50, settings, '한 번 실행할 때 뒤에서 몇 턴을 읽을지 결정.\n예: 6이면 최근 6턴만 읽음. 길게 잡으면 맥락은 늘지만 API 입력도 커짐.');
        numberInput(nd, '최신 턴 제외 수', 'autoExtOffset', 3, 0, 30, settings, '아직 진행 중인 최신 대화를 일부 건너뜀.\n예: 3이면 방금 나온 3턴은 제외하고 그 앞의 안정된 내용만 저장 후보로 봄.');
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('저장할 팩', '현재 페이지에서 추출한 로어를 이 팩에 저장', '요약의 저장 팩과 같은 값.\n이름을 바꾸면 현재 대화의 추출 결과만 해당 팩에 저장.\n전체 설정 초기화 뒤에도 현재 페이지 기준으로 다시 계산해 표시.'));

        const packInput = document.createElement('input');
        packInput.placeholder = '자동추출';
        packInput.style.cssText = 'width:100%;padding:6px 8px;box-sizing:border-box;';
        packInputNode = packInput;
        nd.appendChild(packInput);

        resolveCurrentPackName().then(setDisplayedPackName).catch(function() {
          setDisplayedPackName(settings.config.autoExtPack || '자동추출');
        });

        packInput.onchange = function() {
          const value = packInput.value.trim() || '자동추출';
          settings.config.autoExtPack = value;
          if (R.setAutoExtPackForUrl && C && C.getCurUrl) R.setAutoExtPackForUrl(curUrl, value);
          save(settings);
          setDisplayedPackName(value);
        };
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('수동 추출', '최근 대화 한 묶음을 지금 바로 읽어 로어 후보를 저장', '현재 화면의 최근 대화를 설정값대로 한 번 처리.\n자동 추출을 꺼도 사용 가능.\n예: 중요한 장면이 끝난 직후 눌러서 방금 확정된 관계 변화나 약속만 저장.'));

        const btn = UI.createButton('수동 추출 실행', { kind: 'success', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runAutoExtract) { alert('추출 모듈을 아직 불러오지 못함'); return; }
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
        nd.appendChild(UI.createSection('일괄 추출', '긴 대화 기록을 여러 묶음으로 나눠 반복 처리', '수동으로 누르는 실행형 추출이라는 점은 수동 추출과 같음.\n차이는 범위. 수동 추출은 최근 한 묶음, 일괄 추출은 오래 쌓인 기록을 여러 묶음으로 나눠 처리.\nAPI 호출이 많이 발생할 수 있음.'));

        numberInput(nd, '묶음당 턴 수', 'batchExtTurnsPerBatch', 50, 10, 200, settings, '일괄 추출에서 한 번에 읽을 턴 수.\n예: 50이면 50턴씩 끊어 처리. 크게 잡으면 맥락은 넓지만 실패 가능성과 비용이 늘어남.');
        numberInput(nd, '겹칠 턴 수', 'batchExtOverlap', 5, 0, 50, settings, '묶음 사이에 일부 턴을 겹쳐 읽음.\n예: 5면 1번 묶음 끝 5턴을 2번 묶음 앞에도 포함. 경계에서 중요한 사건이 잘리는 문제를 줄임.');
        numberInput(nd, '묶음당 재시도', 'batchExtMaxAttempts', 3, 1, 10, settings, '한 묶음 처리 실패 시 다시 시도할 횟수.\n예: 3이면 같은 묶음을 최대 3번까지 재시도. 높이면 안정성은 늘지만 오래 걸림.');

        const btn = UI.createButton('일괄 추출 실행', { kind: 'primary', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runBatchExtract) { alert('일괄 추출 모듈을 아직 불러오지 못함'); return; }
          if (!confirm('일괄 추출을 실행할까요? API 호출이 많이 발생할 수 있음')) return;
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
          const detail = UI.createDetailsSection('프롬프트 설정', '추출 스키마와 프롬프트 템플릿. 필요할 때만 펼쳐서 확인', false, null, '기본 템플릿은 코드 기준 읽기 전용.\n직접 바꾸려면 새 템플릿을 만든 뒤 수정.\n{schema}, {context}, {entries}는 실행 때 실제 내용으로 바뀌는 자리라 지우면 안 됨.');
          promptHost.appendChild(detail);
          nd = detail.contentBody || detail;
        } else {
          nd.appendChild(UI.createSection('프롬프트 설정', '자주 쓰지 않는 추출 스키마와 프롬프트 템플릿. 실행 설정 아래에 배치'));
        }

        if (typeof settings.getActiveTemplate !== 'function') {
          nd.appendChild(UI.createNotice('템플릿 설정을 불러올 수 없음. injecter-3.js 설정 모듈 확인 필요', 'error'));
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
        note.textContent = '기본 템플릿은 코드 기준 읽기 전용. 새 템플릿을 만든 뒤 수정 가능. 유저 템플릿은 버전이 바뀌어도 유지. {schema}, {context}, {entries} 자리표시자는 지우면 안 됨.';
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