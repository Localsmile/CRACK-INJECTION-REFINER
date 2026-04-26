// == 인젝터 UI 패널 — API ==
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:api-help] UI utils not loaded');
    return;
  }
  if (UI.__apiHelpPanelLoaded) return;

  function getRuntime() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  const HELP = {
    connection: {
      title: 'API 연결',
      what: '추출, 변환, 후보 재정렬, 응답 교정에 쓰는 공통 AI 연결값을 설정해요.',
      example: 'API Key 방식은 간단하고, Vertex/Firebase는 이미 해당 환경을 쓰는 경우에 선택해요.',
      recommended: '처음에는 API Key 방식이 가장 쉬워요.',
      warning: '연결값이 없으면 자동 추출, 변환, 교정이 작동하지 않아요.',
      result: '성공적으로 저장되면 여러 기능이 같은 연결값을 사용해요.'
    },
    test: {
      title: 'API 연결 테스트',
      what: '현재 저장된 연결값으로 아주 짧은 요청을 보내 동작 여부를 확인해요.',
      example: '성공하면 “OK” 같은 짧은 응답이 표시돼요.',
      recommended: '키를 바꾼 뒤에는 먼저 테스트하세요.',
      warning: '테스트도 실제 API 호출이에요.',
      result: '자동 추출과 변환을 쓰기 전 연결 문제를 미리 찾을 수 있어요.'
    },
    defaultModel: {
      title: '기본 LLM 모델',
      what: '자동 추출과 텍스트 변환에 기본으로 사용할 모델이에요.',
      example: 'Flash는 빠르고, Pro 계열은 정리 품질에 유리해요.',
      recommended: '속도 우선이면 Flash, 품질 우선이면 Pro를 선택하세요.',
      warning: '모델명은 제공 환경에 따라 바뀔 수 있어요.',
      result: '추출·변환 품질과 속도가 달라져요.'
    },
    rerankModel: {
      title: '후보 재정렬 모델',
      what: '검색 후보가 많을 때 장면에 맞는 항목을 다시 고르는 모델이에요.',
      example: '비슷한 로어가 여러 개일 때 현재 대화와 가장 맞는 항목을 고르게 해요.',
      recommended: '가벼운 모델을 권장해요.',
      warning: '후보 재정렬을 켠 경우 추가 호출이 발생해요.',
      result: '후보 선택 품질과 호출 비용이 달라져요.'
    },
    refinerModel: {
      title: '응답 교정 모델',
      what: 'AI 응답이 저장된 로어와 어긋나는지 검사할 때 쓰는 모델이에요.',
      example: '기본 LLM을 그대로 쓰거나 교정 전용으로 더 정밀한 모델을 지정할 수 있어요.',
      recommended: '처음에는 기본 LLM 사용을 권장해요.',
      warning: '정밀한 모델일수록 느리거나 비용이 커질 수 있어요.',
      result: '교정 판단의 품질과 속도가 달라져요.'
    },
    rerankPrompt: {
      title: '후보 재정렬 프롬프트',
      what: '검색 후보 중 지금 장면에 필요한 항목을 고르는 기준이에요.',
      example: '현재 발화와 관계 있는 항목만 고르도록 지시할 수 있어요.',
      recommended: '대부분 기본값을 유지하세요.',
      warning: '너무 넓게 쓰면 관련 없는 항목도 선택될 수 있어요.',
      result: '후보 재정렬의 판단 기준이 바뀌어요.'
    }
  };

  function labelLine(title, help) {
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;align-items:center;gap:6px;margin:10px 0 4px;';
    const label = document.createElement('div');
    label.textContent = title;
    label.style.cssText = 'font-size:12px;color:#cdd8d3;font-weight:800;';
    line.appendChild(label);
    if (help) line.appendChild(UI.createHelpIcon(title, help));
    return line;
  }

  function makeSelect(nd, title, value, groups, onChange, help) {
    nd.appendChild(labelLine(title, help));
    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:8px;background:#0d0f0e;color:#e3ece8;font-size:12px;box-sizing:border-box;';
    groups.forEach(function(group) {
      const og = document.createElement('optgroup');
      og.label = group.label;
      group.options.forEach(function(item) {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.value = value;
    sel.onchange = function(){ onChange(sel.value); };
    nd.appendChild(sel);
    return sel;
  }

  function makeTextArea(nd, title, value, onChange, help) {
    nd.appendChild(labelLine(title, help));
    const ta = document.createElement('textarea');
    ta.value = value || '';
    ta.style.cssText = 'width:100%;height:110px;padding:8px;border:1px solid #333;border-radius:8px;background:#0d0f0e;color:#e3ece8;font-size:12px;box-sizing:border-box;font-family:monospace;resize:vertical;';
    ta.onchange = function(){ onChange(ta.value); };
    nd.appendChild(ta);
    return ta;
  }

  UI.registerPanel({
    id: 'api',
    label: 'API 설정',
    title: 'API 설정',
    order: 20,
    render: function(panel) {
      const L = getRuntime();
      const C = L.C;
      const settings = L.settings;
      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('설정 로드 실패', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          'API 연결',
          '추출, 후보 재정렬, 변환, 응답 교정에 같은 연결값 사용',
          HELP.connection
        ));
        if (C && typeof C.createApiInput === 'function') {
          C.createApiInput(settings.config, 'autoExt', nd, function(){ save(settings); });
        } else {
          nd.appendChild(UI.createNotice('API 입력 도구 로드 실패. core-ui.js 확인', 'error'));
        }

        const row = document.createElement('div');
        row.style.cssText = 'margin:12px 0 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
        const btn = UI.createButton('API 연결 테스트', { kind: 'primary' });
        const result = document.createElement('span');
        result.style.cssText = 'font-size:12px;color:#9aa5a0;word-break:break-all;';
        btn.onclick = async function() {
          if (!C || !C.callGeminiApi) {
            await UI.createAlertDialog({ title: 'API 테스트 불가', message: 'API 호출 도구를 불러오지 못했어요.', tone: 'error' });
            return;
          }
          const apiType = settings.config.autoExtApiType || 'key';
          const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript : !settings.config.autoExtKey;
          if (missing) {
            await UI.createAlertDialog({
              title: '연결값 필요',
              message: apiType === 'vertex' ? 'Vertex JSON을 먼저 입력하세요.' : apiType === 'firebase' ? 'Firebase 설정을 먼저 입력하세요.' : 'API 키를 먼저 입력하세요.',
              tone: 'warn'
            });
            return;
          }
          btn.disabled = true;
          result.textContent = '테스트 중';
          result.style.color = '#9aa5a0';
          try {
            const r = await C.callGeminiApi('Say OK in one word.', {
              apiType: settings.config.autoExtApiType,
              key: settings.config.autoExtKey,
              vertexJson: settings.config.autoExtVertexJson,
              vertexLocation: settings.config.autoExtVertexLocation,
              vertexProjectId: settings.config.autoExtVertexProjectId,
              firebaseScript: settings.config.autoExtFirebaseScript,
              model: settings.config.autoExtModel,
              maxRetries: 0
            });
            result.textContent = r.text ? '성공: ' + r.text.trim().slice(0, 50) : '실패: ' + r.error;
            result.style.color = r.text ? '#7fd7bd' : '#d36b6b';
          } catch(e) {
            result.textContent = '오류: ' + e.message;
            result.style.color = '#d36b6b';
          }
          btn.disabled = false;
        };
        row.appendChild(btn);
        row.appendChild(result);
        row.appendChild(UI.createHelpIcon('API 연결 테스트', HELP.test));
        nd.appendChild(row);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('모델 설정'));

        makeSelect(nd, '기본 LLM 모델', settings.config.autoExtModel || 'gemini-3-flash-preview', [
          { label: 'Gemini 3.x', options: [
            { label: '3.0 Flash', value: 'gemini-3-flash-preview' },
            { label: '3.1 Pro', value: 'gemini-3.1-pro-preview' }
          ]},
          { label: 'Gemini 2.x', options: [
            { label: '2.5 Pro', value: 'gemini-2.5-pro' },
            { label: '2.0 Flash', value: 'gemini-2.0-flash' }
          ]},
          { label: '기타', options: [{ label: '직접 입력', value: '_custom' }] }
        ], function(v){ settings.config.autoExtModel = v; save(settings); customModel.style.display = v === '_custom' ? '' : 'none'; }, HELP.defaultModel);

        const customModel = document.createElement('input');
        customModel.value = settings.config.autoExtCustomModel || '';
        customModel.placeholder = '직접 입력 모델명';
        customModel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:8px;background:#0d0f0e;color:#e3ece8;font-size:12px;box-sizing:border-box;margin-top:6px;' + ((settings.config.autoExtModel || '') === '_custom' ? '' : 'display:none;');
        customModel.onchange = function(){ settings.config.autoExtCustomModel = customModel.value; save(settings); };
        nd.appendChild(customModel);

        makeSelect(nd, '후보 재정렬 모델', settings.config.rerankModel || 'gemini-3-flash-preview', [
          { label: 'Gemini', options: [
            { label: '3.1 Flash Lite', value: 'gemini-3.1-flash-lite-preview' },
            { label: '3.0 Flash', value: 'gemini-3-flash-preview' },
            { label: '2.5 Flash Lite', value: 'gemini-2.5-flash-lite' }
          ]}
        ], function(v){ settings.config.rerankModel = v; save(settings); }, HELP.rerankModel);

        makeSelect(nd, '응답 교정 모델', settings.config.refinerModel !== undefined ? settings.config.refinerModel : '', [
          { label: '기본값', options: [{ label: '기본 LLM 사용', value: '' }] },
          { label: 'Gemini 3.x', options: [
            { label: '3.0 Flash', value: 'gemini-3-flash-preview' },
            { label: '3.1 Flash Lite', value: 'gemini-3.1-flash-lite-preview' },
            { label: '3.1 Pro', value: 'gemini-3.1-pro-preview' }
          ]},
          { label: 'Gemini 2.x', options: [
            { label: '2.5 Pro', value: 'gemini-2.5-pro' },
            { label: '2.5 Flash', value: 'gemini-2.5-flash' },
            { label: '2.0 Flash', value: 'gemini-2.0-flash' }
          ]},
          { label: '기타', options: [{ label: '직접 입력', value: '_custom' }] }
        ], function(v){ settings.config.refinerModel = v; save(settings); refinerCustom.style.display = v === '_custom' ? '' : 'none'; }, HELP.refinerModel);

        const refinerCustom = document.createElement('input');
        refinerCustom.value = settings.config.refinerCustomModel || '';
        refinerCustom.placeholder = '직접 입력 교정 모델';
        refinerCustom.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:8px;background:#0d0f0e;color:#e3ece8;font-size:12px;box-sizing:border-box;margin-top:6px;' + ((settings.config.refinerModel || '') === '_custom' ? '' : 'display:none;');
        refinerCustom.onchange = function(){ settings.config.refinerCustomModel = refinerCustom.value; save(settings); };
        nd.appendChild(refinerCustom);

        makeTextArea(nd, '후보 재정렬 프롬프트', settings.config.rerankPrompt || (C && C.DEFAULTS ? C.DEFAULTS.rerankPrompt : ''), function(v){ settings.config.rerankPrompt = v; save(settings); }, HELP.rerankPrompt);
      });
    }
  });

  UI.__apiHelpPanelLoaded = true;
  console.log('[LoreInj:UI] API panel loaded');
})();