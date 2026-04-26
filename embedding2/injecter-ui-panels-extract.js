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

  const HELP = {
    autoExt: {
      title: '자동 추출',
      what: '정해진 턴마다 최근 대화를 읽고 새 로어 후보를 저장해요.',
      example: '추출 주기가 8이면 약 8턴마다 최근 내용을 읽고 저장할 사실을 찾아요.',
      recommended: '중요한 장면을 자주 이어 쓰면 켜 두세요.',
      warning: 'API 호출이 발생하고, 너무 짧은 주기는 불안정한 맥락까지 저장할 수 있어요.',
      result: '새 설정이나 관계 변화가 자동으로 로어 팩에 쌓여요.'
    },
    compareDb: {
      title: '기존 로어와 비교',
      what: '새 후보가 이미 저장된 내용과 겹치는지 함께 확인해요.',
      example: '이미 “에리=슈크림”이 있으면 같은 내용을 새 항목으로 늘리지 않게 도와요.',
      recommended: '대부분 켜 두는 것을 권장해요.',
      warning: '끄면 빠르지만 중복 항목이 늘 수 있어요.',
      result: '로어 DB가 덜 지저분해져요.'
    },
    persona: {
      title: '페르소나 이름 포함',
      what: '추출 요청에 사용자 페르소나 이름을 함께 보내 인물 구분을 돕는 옵션이에요.',
      example: '사용자 페르소나와 상대 캐릭터 이름이 모두 나올 때 관계 항목이 덜 엉켜요.',
      recommended: '인물 관계를 많이 저장한다면 켜 두세요.',
      warning: '페르소나 이름이 잘못 설정돼 있으면 오히려 혼동될 수 있어요.',
      result: '관계·호칭 항목의 주체가 더 안정적으로 잡혀요.'
    },
    extractTurns: {
      title: '추출 주기',
      what: '자동 추출을 몇 턴마다 실행할지 정해요.',
      example: '5는 빠르게 반영, 12는 호출을 줄이는 대신 반영이 늦어요.',
      recommended: '6~10부터 시작하세요.',
      warning: '낮을수록 API 호출이 늘어요.',
      result: '자동 저장 빈도가 달라져요.'
    },
    scanRange: {
      title: '읽을 최근 턴 수',
      what: '한 번 추출할 때 뒤에서 몇 턴을 읽을지 정해요.',
      example: '6이면 최근 6턴만 읽고, 20이면 더 넓은 맥락을 읽어요.',
      recommended: '6~10을 권장해요.',
      warning: '너무 길면 비용이 늘고 오래된 잡음이 섞일 수 있어요.',
      result: '추출 후보의 맥락 폭이 달라져요.'
    },
    offset: {
      title: '최신 턴 제외 수',
      what: '아직 장면이 확정되지 않은 최신 대화를 몇 턴 건너뛸지 정해요.',
      example: '3이면 방금 나온 3턴은 제외하고 그 앞 내용을 저장 후보로 봐요.',
      recommended: '2~4를 권장해요.',
      warning: '0이면 진행 중인 말이 너무 빨리 저장될 수 있어요.',
      result: '확정된 내용 위주로 저장돼요.'
    },
    manual: {
      title: '수동 추출',
      what: '자동 주기와 상관없이 지금 최근 대화를 한 번 저장 후보로 읽어요.',
      example: '중요한 장면이 끝난 직후 눌러 관계 변화나 약속을 바로 저장해요.',
      recommended: '자동 추출을 꺼 둔 사용자에게 특히 유용해요.',
      warning: '현재 설정값과 저장 팩을 그대로 사용해요.',
      result: '한 번의 추출 결과가 지정된 팩에 저장돼요.'
    },
    batch: {
      title: '일괄 추출',
      what: '긴 대화 기록을 여러 묶음으로 나눠 반복 추출해요.',
      example: '오래 진행한 채팅에서 과거 설정을 한 번에 정리할 때 사용해요.',
      recommended: '처음에는 작은 묶음으로 테스트하세요.',
      warning: 'API 호출이 많이 발생하고 오래 걸릴 수 있어요.',
      result: '오래된 대화에서도 로어 후보를 대량으로 만들 수 있어요.'
    },
    prompt: {
      title: '프롬프트 설정',
      what: '추출 스키마와 추출 요청 문장을 확인하거나 사용자 템플릿을 조정해요.',
      example: '{schema}, {context}, {entries}는 실행 때 실제 값으로 바뀌는 자리예요.',
      recommended: '대부분 기본 템플릿을 그대로 쓰세요.',
      warning: '자리표시자를 지우면 추출이 실패하거나 품질이 떨어질 수 있어요.',
      result: '추출 방식과 출력 구조가 달라져요.'
    },
    autoEmbed: {
      title: '검색 데이터 자동 생성',
      what: '추출로 만든 새 항목에 의미 검색용 데이터를 이어서 만들어요.',
      example: '새로 저장한 “슈크림 붕어빵” 항목이 다음 검색부터 의미 기반 후보가 돼요.',
      recommended: '의미 기반 검색을 쓴다면 켜 두세요.',
      warning: '임베딩 API 호출이 추가될 수 있어요.',
      result: '새 항목이 검색 후보로 잡히는 속도가 빨라져요.'
    },
    packName: {
      title: '저장할 팩',
      what: '현재 대화에서 추출한 로어를 어느 팩에 저장할지 정해요.',
      example: '“에리 장기 세션”으로 두면 이 대화의 자동·수동 추출 결과가 그 팩에 들어가요.',
      recommended: '대화나 프로젝트 단위로 알아보기 쉬운 이름을 쓰세요.',
      warning: '이 값은 현재 페이지 기준 매핑이라 다른 대화와 다를 수 있어요.',
      result: '추출 결과가 지정된 팩에 저장되고 요약 카드에도 같은 이름이 보여요.'
    },
    batchTurns: {
      title: '묶음당 턴 수',
      what: '일괄 추출에서 한 번에 읽을 대화 턴 수예요.',
      example: '50이면 50턴씩 끊어서 오래된 기록을 처리해요.',
      recommended: '처음에는 30~50을 권장해요.',
      warning: '너무 크면 실패 가능성과 비용이 늘어요.',
      result: '일괄 추출의 처리 단위가 달라져요.'
    },
    batchOverlap: {
      title: '겹칠 턴 수',
      what: '묶음 경계에서 내용이 잘리지 않도록 앞뒤 묶음에 일부 턴을 겹쳐요.',
      example: '5면 1번 묶음 마지막 5턴이 2번 묶음 앞에도 들어가요.',
      recommended: '3~8을 권장해요.',
      warning: '너무 높으면 같은 내용이 중복 추출될 수 있어요.',
      result: '경계에 걸친 사건을 놓칠 가능성이 줄어요.'
    },
    batchRetry: {
      title: '묶음당 재시도',
      what: '한 묶음 처리 실패 시 다시 시도할 횟수예요.',
      example: '3이면 같은 묶음을 최대 3번까지 다시 시도해요.',
      recommended: '2~3을 권장해요.',
      warning: '높게 두면 실패 시 시간이 길어져요.',
      result: '일괄 추출 안정성과 소요 시간이 함께 늘어요.'
    }
  };

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
    const input = UI.createInput({
      type: 'number',
      value: settings.config[key] !== undefined ? settings.config[key] : defaultVal,
      min,
      max
    });
    input.style.width = '90px';
    input.style.textAlign = 'center';
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
        }, HELP.autoExt);

        toggle(nd, '기존 로어와 비교', '이미 저장된 내용과 비교해 중복 저장을 줄임', settings.config.autoExtIncludeDb !== false, function(v){
          settings.config.autoExtIncludeDb = v;
          save(settings);
        }, HELP.compareDb);

        toggle(nd, '페르소나 이름 포함', '추출 요청에 사용자 페르소나 이름을 함께 전달', settings.config.autoExtIncludePersona !== false, function(v){
          settings.config.autoExtIncludePersona = v;
          save(settings);
        }, HELP.persona);

        toggle(nd, '검색 데이터 자동 생성', '추출 뒤 의미 검색용 데이터를 바로 생성', settings.config.autoEmbedOnExtract !== false, function(v){
          settings.config.autoEmbedOnExtract = v;
          save(settings);
        }, HELP.autoEmbed);

        numberInput(nd, '추출 주기 N턴', 'autoExtTurns', 8, 1, 50, settings, HELP.extractTurns);
        numberInput(nd, '읽을 최근 턴 수', 'autoExtScanRange', 6, 1, 50, settings, HELP.scanRange);
        numberInput(nd, '최신 턴 제외 수', 'autoExtOffset', 3, 0, 30, settings, HELP.offset);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('저장할 팩', '현재 페이지에서 추출한 로어를 이 팩에 저장', HELP.packName));

        const packInput = UI.createInput({ placeholder: '자동추출' });
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
        nd.appendChild(UI.createSection('수동 추출', '최근 대화 한 묶음을 지금 바로 읽어 로어 후보를 저장', HELP.manual));

        const btn = UI.createButton('수동 추출 실행', { kind: 'success', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runAutoExtract) {
            await UI.createAlertDialog({ title: '추출 불가', message: '추출 모듈을 아직 불러오지 못했어요.', tone: 'error' });
            return;
          }
          const ok = await UI.createConfirmDialog({
            title: '수동 추출 실행',
            message: '지금 최근 대화를 한 번 읽고 로어 후보를 저장할까요?',
            confirmLabel: '실행',
            cancelLabel: '취소'
          });
          if (!ok) return;
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
        nd.appendChild(UI.createSection('일괄 추출', '긴 대화 기록을 여러 묶음으로 나눠 반복 처리', HELP.batch));

        numberInput(nd, '묶음당 턴 수', 'batchExtTurnsPerBatch', 50, 10, 200, settings, HELP.batchTurns);
        numberInput(nd, '겹칠 턴 수', 'batchExtOverlap', 5, 0, 50, settings, HELP.batchOverlap);
        numberInput(nd, '묶음당 재시도', 'batchExtMaxAttempts', 3, 1, 10, settings, HELP.batchRetry);

        const btn = UI.createButton('일괄 추출 실행', { kind: 'primary', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;min-height:16px;';
        btn.onclick = async function() {
          if (!R.runBatchExtract) {
            await UI.createAlertDialog({ title: '일괄 추출 불가', message: '일괄 추출 모듈을 아직 불러오지 못했어요.', tone: 'error' });
            return;
          }
          const ok = await UI.createConfirmDialog({
            title: '일괄 추출 실행',
            message: '긴 기록을 여러 묶음으로 처리할까요?\nAPI 호출이 많이 발생할 수 있어요.',
            confirmLabel: '실행',
            cancelLabel: '취소'
          });
          if (!ok) return;
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
          const detail = UI.createDetailsSection('프롬프트 설정', '추출 스키마와 프롬프트 템플릿. 필요할 때만 펼쳐서 확인', false, null, HELP.prompt);
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
          syncPromptStatus();
        }

        function updateActiveField(key, value) {
          const templates = getTemplates();
          const id = settings.config.activeTemplateId || 'default';
          const idx = templates.findIndex(t => t.id === id);
          if (idx < 0 || templates[idx].isDefault) return;
          templates[idx][key] = value;
          save(settings);
        }

        const promptStatus = UI.createInlineStatus('', 'info');
        nd.appendChild(promptStatus);

        function validatePromptTemplate(tpl) {
          if (!tpl) return '템플릿을 찾지 못했어요.';
          try { JSON.parse(tpl.schema || ''); } catch(e) { return '스키마 JSON 오류: ' + e.message; }
          if (!String(tpl.promptWithoutDb || '').includes('{schema}')) return '기존 로어 미포함 프롬프트에 {schema}가 필요해요.';
          if (!String(tpl.promptWithoutDb || '').includes('{context}')) return '기존 로어 미포함 프롬프트에 {context}가 필요해요.';
          if (!String(tpl.promptWithDb || '').includes('{schema}')) return '기존 로어 포함 프롬프트에 {schema}가 필요해요.';
          if (!String(tpl.promptWithDb || '').includes('{entries}')) return '기존 로어 포함 프롬프트에 {entries}가 필요해요.';
          if (!String(tpl.promptWithDb || '').includes('{context}')) return '기존 로어 포함 프롬프트에 {context}가 필요해요.';
          return '';
        }

        function syncPromptStatus() {
          const msg = validatePromptTemplate(activeTemplate());
          promptStatus.setStatus(msg || '프롬프트 자리표시자와 스키마 정상', msg ? 'error' : 'success');
          return !msg;
        }

        function updateActiveFieldWithValidation(key, value) {
          const templates = getTemplates();
          const id = settings.config.activeTemplateId || 'default';
          const idx = templates.findIndex(t => t.id === id);
          if (idx < 0 || templates[idx].isDefault) return;
          const prev = templates[idx][key];
          templates[idx][key] = value;
          const msg = validatePromptTemplate(templates[idx]);
          if (msg) {
            templates[idx][key] = prev;
            promptStatus.setStatus(msg + ' 저장하지 않았어요.', 'error');
            renderTemplates();
            return;
          }
          save(settings);
          promptStatus.setStatus('저장 완료. 프롬프트 구조 정상', 'success');
        }

        tplSelect.onchange = function() {
          settings.config.activeTemplateId = tplSelect.value;
          save(settings);
          renderTemplates();
        };

        newBtn.onclick = async function() {
          const name = await UI.createPromptDialog({
            title: '새 템플릿',
            message: '새 추출 프롬프트 템플릿 이름을 입력하세요.',
            value: '내 추출 프롬프트',
            confirmLabel: '만들기',
            cancelLabel: '취소'
          });
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

        renameBtn.onclick = async function() {
          const tpl = activeTemplate();
          if (!tpl || tpl.isDefault) return;
          const name = await UI.createPromptDialog({
            title: '템플릿 이름 변경',
            value: tpl.name,
            confirmLabel: '저장',
            cancelLabel: '취소'
          });
          if (!name) return;
          tpl.name = name.trim();
          save(settings);
          renderTemplates();
        };

        delBtn.onclick = async function() {
          const tpl = activeTemplate();
          if (!tpl || tpl.isDefault) return;
          const ok = await UI.createConfirmDialog({
            title: '템플릿 삭제',
            message: '[' + tpl.name + '] 템플릿을 삭제할까요?',
            danger: true,
            confirmLabel: '삭제',
            cancelLabel: '취소'
          });
          if (!ok) return;
          settings.config.templates = getTemplates().filter(t => t.id !== tpl.id);
          settings.config.activeTemplateId = 'default';
          save(settings);
          renderTemplates();
        };

        resetBtn.onclick = async function() {
          const tpl = activeTemplate();
          if (!tpl || tpl.isDefault) return;
          const def = getTemplates().find(t => t.isDefault);
          if (!def) return;
          const ok = await UI.createConfirmDialog({
            title: '템플릿 기본값 복구',
            message: '[' + tpl.name + '] 내용을 기본 프롬프트로 되돌릴까요?',
            confirmLabel: '복구',
            cancelLabel: '취소'
          });
          if (!ok) return;
          tpl.schema = def.schema || '';
          tpl.promptWithoutDb = def.promptWithoutDb || '';
          tpl.promptWithDb = def.promptWithDb || '';
          save(settings);
          renderTemplates();
        };

        taSchema.onchange = function(){ updateActiveFieldWithValidation('schema', taSchema.value); };
        taWithout.onchange = function(){ updateActiveFieldWithValidation('promptWithoutDb', taWithout.value); };
        taWith.onchange = function(){ updateActiveFieldWithValidation('promptWithDb', taWith.value); };

        renderTemplates();
      });
    }
  });

  UI.__extractPanelLoaded = true;
  console.log('[LoreInj:UI] extraction panel loaded');
})();