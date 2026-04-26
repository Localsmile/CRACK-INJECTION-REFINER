// == 인젝터 UI 패널 — Settings ==
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:settings] UI utils not loaded');
    return;
  }
  if (UI.__settingsPanelLoaded) return;

  const API_KEEP_KEYS = [
    'autoExtApiType','autoExtKey','autoExtVertexJson','autoExtVertexLocation','autoExtVertexProjectId',
    'autoExtFirebaseScript','autoExtFirebaseEmbedKey','autoExtModel','autoExtCustomModel',
    'autoExtReasoning','autoExtBudget',
    'embeddingModel','rerankModel','refinerModel','refinerCustomModel'
  ];

  function getRuntime() { return _w.__LoreInj || {}; }
  function saveSettings(settings) { if (settings && typeof settings.save === 'function') settings.save(); }
  function pickApiConfig(config) {
    const out = {};
    API_KEEP_KEYS.forEach(function(k) {
      if (config && Object.prototype.hasOwnProperty.call(config, k)) out[k] = config[k];
    });
    return out;
  }
  function applyPreset(settings, defaultSettings, preset) {
    const api = pickApiConfig(settings.config);
    settings.config = JSON.parse(JSON.stringify(defaultSettings || {}));
    Object.assign(settings.config, preset.config || {}, api);
    saveSettings(settings);
  }

  function makeToggle(nd, title, desc, value, onChange, help) {
    const sw = UI.createSwitch(!!value, onChange, title);
    nd.appendChild(UI.createSettingRow(title, desc, sw, help));
  }

  function makeSelectRow(nd, title, desc, value, options, onChange, help) {
    const sel = document.createElement('select');
    sel.style.cssText = 'width:190px;padding:6px 8px;';
    options.forEach(function(opt) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = function() { onChange(sel.value); };
    nd.appendChild(UI.createSettingRow(title, desc, sel, help));
  }

  function makeNumberRow(nd, title, desc, value, min, max, onChange, help) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:90px;padding:6px 8px;text-align:center;';
    input.onchange = function() {
      const n = parseInt(input.value, 10);
      if (!isNaN(n)) onChange(n);
    };
    nd.appendChild(UI.createSettingRow(title, desc, input, help));
  }

  UI.registerPanel({
    id: 'settings',
    label: '설정',
    title: '설정',
    order: 30,
    render: function(panel) {
      const L = getRuntime();
      const settings = L.settings;
      const defaultSettings = L.defaultSettings || {};
      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd) { nd.appendChild(UI.createNotice('설정 로드 실패. 새로고침 후 다시 확인', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('요약', '현재 설정 흐름'));
        if (UI.createSummaryGrid) {
          nd.appendChild(UI.createSummaryGrid([
            { label: '로어 주입', value: settings.config.enabled !== false ? '사용' : '중지' },
            { label: '의미 검색', value: settings.config.embeddingEnabled ? '사용' : '중지' },
            { label: '자동 추출', value: settings.config.autoExtEnabled ? '사용' : '중지' }
          ]));
        }
      });

      const PRESETS = {
        beginner: {
          name: '기본',
          desc: '대부분의 채팅에 맞는 균형 설정. 자동 추출은 켜고 후보 재정렬은 끔',
          config: {
            enabled: true, embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: true, autoExtTurns: 8,
            autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3,
            maxEntries: 4, cooldownTurns: 8, loreBudgetChars: 300, loreBudgetMax: 500, decayEnabled: true,
            activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true,
            firstEncounterWarning: true, importanceGating: true, importanceThreshold: 12, pendingPromiseBoost: true,
            rerankEnabled: false, useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true
          }
        },
        minimal: {
          name: '가벼움',
          desc: 'API 사용량을 줄이는 설정. 필요할 때 수동 추출 중심으로 사용',
          config: {
            enabled: true, embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: false, autoEmbedOnExtract: true,
            scanOffset: 2, maxEntries: 3, cooldownTurns: 6, loreBudgetChars: 250, loreBudgetMax: 400,
            decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true,
            firstEncounterWarning: false, importanceGating: true, importanceThreshold: 12, rerankEnabled: false,
            useCompressedFormat: false, compressionMode: 'full', strictMatch: true, similarityMatch: true
          }
        },
        advanced: {
          name: '정밀',
          desc: 'API를 더 쓰는 대신 후보 재정렬과 응답 교정을 함께 사용',
          config: {
            enabled: true, embeddingEnabled: true, embeddingWeight: 0.4, autoExtEnabled: true, autoExtTurns: 5,
            autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3,
            maxEntries: 5, cooldownTurns: 8, loreBudgetChars: 400, loreBudgetMax: 700, decayEnabled: true,
            activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true,
            importanceGating: true, importanceThreshold: 10, pendingPromiseBoost: true, rerankEnabled: true,
            refinerEnabled: true, refinerLoreMode: 'semantic', useCompressedFormat: false, compressionMode: 'full',
            strictMatch: true, similarityMatch: true
          }
        }
      };

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('빠른 설정', 'API 연결값은 유지. 선택한 프리셋의 동작 옵션만 적용', '프리셋은 로어 DB와 팩을 건드리지 않음. API 키, Vertex, Firebase 연결값도 그대로 유지. 기본은 안정적, 가벼움은 호출 절약, 정밀은 검색과 교정 품질 우선'));
        nd.appendChild(UI.createCardGrid(Object.keys(PRESETS).map(function(key) {
          return { id: key, title: PRESETS[key].name, desc: PRESETS[key].desc, preset: PRESETS[key] };
        }), function(item) {
          const preset = item.preset;
          if (!confirm('[' + preset.name + '] 프리셋 적용? API 연결값은 유지')) return;
          applyPreset(settings, defaultSettings, preset);
          alert('프리셋 적용 완료. 새로고침 후 반영');
        }));
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('기본 동작'));
        makeToggle(nd, '로어 주입', '관련 로어를 메시지에 자동으로 포함', settings.config.enabled !== false, function(v) {
          settings.config.enabled = v; saveSettings(settings);
        }, '끄면 팩이 선택돼 있어도 로어가 메시지에 들어가지 않음. 오류 확인이나 원본 응답 비교 때 잠깐 끄는 용도');

        makeToggle(nd, '자동 압축', '입력 공간이 부족할 때 로어 문장을 짧게 변환', settings.config.useCompressedFormat !== false, function(v) {
          settings.config.useCompressedFormat = v; saveSettings(settings);
        }, '켜면 긴 설명 대신 compact/micro 형태를 사용. 대화가 길수록 토큰 절약에 유리');

        makeSelectRow(nd, '압축 방식', '자동은 상황에 맞게, 전체는 읽기 쉬운 형태', settings.config.compressionMode || 'auto', [
          { value: 'auto', label: '자동' },
          { value: 'full', label: '전체' },
          { value: 'compact', label: '간결' },
          { value: 'micro', label: '초압축' }
        ], function(v) { settings.config.compressionMode = v; saveSettings(settings); }, '예: 전체는 “에리는 슈크림 붕어빵 선호”, 초압축은 “에리=슈크림”처럼 줄어듦');

        makeSelectRow(nd, '삽입 위치', '사용자 메시지 기준 로어를 넣을 위치', settings.config.position || 'after', [
          { value: 'before', label: '메시지 앞' },
          { value: 'after', label: '메시지 뒤' }
        ], function(v) { settings.config.position = v; saveSettings(settings); }, '대부분 메시지 뒤가 자연스러움. 모델이 배경 지시를 먼저 읽어야 할 때만 앞 사용');
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('검색과 연속성'));

        makeToggle(nd, '의미 기반 검색', '정확한 단어뿐 아니라 의미가 비슷한 로어도 검색', !!settings.config.embeddingEnabled, function(v) {
          settings.config.embeddingEnabled = v; saveSettings(settings);
        }, '예: 로어에 “슈크림 붕어빵”이 있고 대화에는 “크림 붕어빵”만 나와도 후보로 잡을 수 있음. 검색 데이터 필요');

        makeToggle(nd, '검색 데이터 자동 생성', '추출 후 가능한 경우 검색 데이터를 생성', settings.config.autoEmbedOnExtract !== false, function(v) {
          settings.config.autoEmbedOnExtract = v; saveSettings(settings);
        }, '켜면 새로 추출한 로어도 의미 검색에 바로 들어감. API 호출이 추가로 발생');

        makeToggle(nd, '후보 재정렬', '검색 결과를 LLM으로 한 번 더 골라냄', !!settings.config.rerankEnabled, function(v) {
          settings.config.rerankEnabled = v; saveSettings(settings);
        }, '후보가 많을 때 정확도 상승. 대신 응답 전 API 호출이 늘어남');

        makeToggle(nd, '시간 감쇠', '오래 안 나온 중요 로어를 다시 떠올리게 함', settings.config.decayEnabled !== false, function(v) {
          settings.config.decayEnabled = v; saveSettings(settings);
        }, '중요하지만 최근에 직접 언급되지 않은 설정이 완전히 묻히는 현상을 줄임');

        makeToggle(nd, '호칭 매트릭스', '관계별 호칭 정보를 짧게 포함', settings.config.honorificMatrixEnabled !== false, function(v) {
          settings.config.honorificMatrixEnabled = v; saveSettings(settings);
        }, '캐릭터가 서로를 부르는 방식이 중요한 채팅에서 사용. 예: 이름, 별명, 존칭 변화 추적');

        makeToggle(nd, '연속성 힌트', '첫 만남, 재회, 관계 변화를 추적', settings.config.firstEncounterWarning !== false, function(v) {
          settings.config.firstEncounterWarning = v; saveSettings(settings);
        }, '이미 만난 인물이 다시 첫 만남처럼 반응하는 문제를 줄이는 보조 정보');

        makeNumberRow(nd, '최대 로어 수', '한 메시지에 넣을 최대 로어 항목 수', settings.config.maxEntries || 4, 1, 12, function(v) {
          settings.config.maxEntries = v; saveSettings(settings);
        }, '4면 최대 4개 항목만 들어감. 높이면 정보량은 늘지만 메시지가 무거워짐');

        makeNumberRow(nd, '반복 방지 턴', '같은 로어의 반복 삽입을 막는 턴 수', settings.config.cooldownTurns || 8, 0, 50, function(v) {
          settings.config.cooldownTurns = v; saveSettings(settings);
        }, '8이면 한 번 들어간 로어가 약 8턴 동안 다시 들어가기 어려움. 0은 반복 방지 거의 없음');
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('문제 해결', '동작 옵션만 기본값으로 복구. API 키와 로어 DB는 유지'));
        const reset = UI.createButton('전체 설정 초기화', { kind: 'danger', bold: true });
        reset.onclick = function() {
          if (!confirm('전체 설정을 기본값으로 초기화? API 키와 로어 DB는 유지')) return;
          const api = pickApiConfig(settings.config);
          settings.config = JSON.parse(JSON.stringify(defaultSettings || {}));
          Object.assign(settings.config, api);
          saveSettings(settings);
          alert('초기화 완료. API 키와 로어 DB 유지');
          location.reload();
        };
        nd.appendChild(reset);
      });
    }
  });

  UI.__settingsPanelLoaded = true;
  console.log('[LoreInj:UI] settings panel loaded');
})();