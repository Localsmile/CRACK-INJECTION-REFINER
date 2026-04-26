// == 인젝터 UI 패널 — API + Help ==
// 역할: API 설정과 기능 안내
// 의존: injecter-ui-utils.js, core-ui.js, injecter-2.js settings
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

  function makeSelect(nd, title, value, groups, onChange) {
    const label = document.createElement('div');
    label.textContent = title;
    label.style.cssText = 'font-size:12px;color:#999;margin:10px 0 4px;';
    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
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
    nd.appendChild(label);
    nd.appendChild(sel);
    return sel;
  }

  function makeTextArea(nd, title, value, onChange) {
    const label = document.createElement('div');
    label.textContent = title;
    label.style.cssText = 'font-size:12px;color:#999;margin:10px 0 4px;';
    const ta = document.createElement('textarea');
    ta.value = value || '';
    ta.style.cssText = 'width:100%;height:110px;padding:8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;font-family:monospace;resize:vertical;';
    ta.onchange = function(){ onChange(ta.value); };
    nd.appendChild(label);
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
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('설정을 아직 불러오지 못했습니다.', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Gemini / Vertex AI API', '추출, 후보 재정렬, 변환, 응답 교정에 이 API 설정을 사용합니다.'));
        if (C && typeof C.createApiInput === 'function') {
          C.createApiInput(settings.config, 'autoExt', nd, function(){ save(settings); });
        } else {
          nd.appendChild(UI.createNotice('API 입력 도구를 불러오지 못했습니다. core-ui.js를 확인하세요.', 'error'));
        }

        const row = document.createElement('div');
        row.style.cssText = 'margin:12px 0 16px;display:flex;gap:8px;align-items:center;';
        const btn = UI.createButton('API 연결 테스트', { kind: 'primary' });
        const result = document.createElement('span');
        result.style.cssText = 'font-size:12px;color:#888;word-break:break-all;';
        btn.onclick = async function() {
          if (!C || !C.callGeminiApi) { alert('API 호출 도구를 불러오지 못했습니다.'); return; }
          const apiType = settings.config.autoExtApiType || 'key';
          const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript : !settings.config.autoExtKey;
          if (missing) { alert(apiType === 'vertex' ? 'Vertex JSON이 필요합니다.' : apiType === 'firebase' ? 'Firebase 설정이 필요합니다.' : 'API 키가 필요합니다.'); return; }
          btn.disabled = true;
          result.textContent = '테스트 중';
          result.style.color = '#888';
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
            result.style.color = r.text ? '#4a9' : '#d66';
          } catch(e) {
            result.textContent = '오류: ' + e.message;
            result.style.color = '#d66';
          }
          btn.disabled = false;
        };
        row.appendChild(btn);
        row.appendChild(result);
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
        ], function(v){ settings.config.autoExtModel = v; save(settings); customModel.style.display = v === '_custom' ? '' : 'none'; });

        const customModel = document.createElement('input');
        customModel.value = settings.config.autoExtCustomModel || '';
        customModel.placeholder = '직접 입력 모델명';
        customModel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-top:6px;' + ((settings.config.autoExtModel || '') === '_custom' ? '' : 'display:none;');
        customModel.onchange = function(){ settings.config.autoExtCustomModel = customModel.value; save(settings); };
        nd.appendChild(customModel);

        makeSelect(nd, '후보 재정렬 모델', settings.config.rerankModel || 'gemini-3-flash-preview', [
          { label: 'Gemini', options: [
            { label: '3.1 Flash Lite', value: 'gemini-3.1-flash-lite-preview' },
            { label: '3.0 Flash', value: 'gemini-3-flash-preview' },
            { label: '2.5 Flash Lite', value: 'gemini-2.5-flash-lite' }
          ]}
        ], function(v){ settings.config.rerankModel = v; save(settings); });

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
        ], function(v){ settings.config.refinerModel = v; save(settings); refinerCustom.style.display = v === '_custom' ? '' : 'none'; });

        const refinerCustom = document.createElement('input');
        refinerCustom.value = settings.config.refinerCustomModel || '';
        refinerCustom.placeholder = '직접 입력 교정 모델';
        refinerCustom.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-top:6px;' + ((settings.config.refinerModel || '') === '_custom' ? '' : 'display:none;');
        refinerCustom.onchange = function(){ settings.config.refinerCustomModel = refinerCustom.value; save(settings); };
        nd.appendChild(refinerCustom);

        makeTextArea(nd, '후보 재정렬 프롬프트', settings.config.rerankPrompt || (C && C.DEFAULTS ? C.DEFAULTS.rerankPrompt : ''), function(v){ settings.config.rerankPrompt = v; save(settings); });
      });
    }
  });

  UI.registerPanel({
    id: 'help',
    label: '도움말',
    title: '도움말',
    order: 120,
    render: function(panel) {
      const sections = [
        {
          title: '처음 설정',
          body: '1. API 설정에서 연결 방식과 모델 확인\n2. 설정에서 기본 프리셋 선택\n3. 파일에서 크랙 채팅에 쓸 팩 켜기\n4. 추출에서 저장할 팩과 추출 주기 확인\n예시: 에리 채팅을 시작했다면 파일에서 에리 팩만 켜고, 기본 프리셋으로 먼저 동작 확인'
        },
        {
          title: 'API 선택',
          body: 'API Key는 가장 단순한 방식. Vertex는 Google Cloud를 이미 쓸 때 적합. Firebase는 기존 Firebase 설정이 있을 때 선택\n예시: 뤼튼/크랙에서 개인 테스트용으로 쓴다면 API Key부터 확인'
        },
        {
          title: '로어 팩 가져오기',
          body: '파일에서 팩 이름을 적고 JSON 파일이나 붙여넣은 JSON을 가져오기\n예시: 팩 이름을 에리로 만들고, “에리는 슈크림 붕어빵을 좋아함” 같은 항목이 들어간 JSON을 가져오기'
        },
        {
          title: '팩 켜기',
          body: '현재 크랙 채팅에 필요한 팩만 켬\n예시: 에리 채팅에서는 에리 팩만 켜고, 관련 없는 테스트 팩은 끔'
        },
        {
          title: '자동 추출',
          body: '최근 대화에서 중요한 사실을 로어로 저장\n예시: 에리가 슈크림 붕어빵을 좋아한다고 새로 말한 장면은 추출 대상. 단순 인사나 반복 묘사는 제외'
        },
        {
          title: '응답 교정',
          body: 'AI 응답이 로어와 어긋날 때 사용\n예시: 저장된 로어는 “에리는 슈크림 붕어빵을 좋아함”인데 응답에서 팥 붕어빵을 제일 좋아한다고 하면 교정 후보'
        },
        {
          title: '호칭 검사',
          body: 'RP에서는 낮음 권장. 최근 맥락으로 설명되지 않는 직접 호칭 오류만 확인\n예시: 에리가 일부러 거리감을 두는 장면의 말투 변화는 오류로 보지 않기'
        },
        {
          title: '의미 기반 검색',
          body: '정확한 단어가 없어도 비슷한 의미의 로어 검색\n예시: 로어에는 “슈크림 붕어빵”이 있고 대화에는 “크림 들어간 붕어빵”이 나와도 관련 항목 후보로 찾기'
        },
        {
          title: '후보 재정렬',
          body: '검색 결과가 많을 때 장면에 맞는 로어를 다시 고름\n예시: 에리 관련 로어가 많아도 현재 장면이 간식 이야기라면 붕어빵 항목을 우선'
        },
        {
          title: '백업과 복원',
          body: '큰 가져오기, 일괄 추출, 병합 전에는 스냅샷 생성\n예시: 에리 팩을 대량 수정하기 전에 스냅샷을 만들면 이전 상태로 복원 가능'
        },
        {
          title: '기록 확인',
          body: '기록에서 주입, 추출, 응답 교정 결과 확인\n예시: 로어가 안 보이면 파일에서 에리 팩이 ON인지, 기록에서 주입 후보가 잡혔는지 확인'
        },
        {
          title: '문제 해결',
          body: '로어가 안 들어감: 스크립트 켜짐, 팩 켬, 항목 꺼짐 여부 확인\nAPI 실패: API 설정에서 연결 테스트와 모델 확인\n검색이 오래됨: 해당 팩의 검색 데이터 다시 생성'
        },
        {
          title: '마이그레이션 기준',
          body: '사용자 데이터 삭제 금지. 기존 localStorage와 Dexie 데이터 유지\n구형 분할 UI 파일은 참고용으로 보존'
        }
      ];

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('도움말', '크랙에서 에리 로어를 운용하는 기준 예시'));
      });

      sections.forEach(function(section) {
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createSection(section.title));
          nd.appendChild(UI.createNotice(section.body, 'info'));
        });
      });
    }
  });

  UI.__apiHelpPanelLoaded = true;
  console.log('[LoreInj:UI] API and help panels loaded');
})();