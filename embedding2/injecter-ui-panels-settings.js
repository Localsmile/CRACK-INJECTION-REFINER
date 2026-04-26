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

  const HELP = {
    quickPreset: {
      title: '빠른 설정',
      what: 'API 연결값과 로어 데이터는 유지하고 동작 옵션만 한 번에 바꿔요.',
      example: '처음 쓰면 기본, 호출을 아끼려면 가벼움, 교정까지 쓰려면 정밀을 고르면 돼요.',
      recommended: '처음에는 기본을 권장해요.',
      warning: '정밀은 후보 재정렬과 응답 교정을 함께 켜서 API 호출이 늘 수 있어요.',
      result: '선택한 프리셋의 검색·추출·교정 옵션이 저장돼요.'
    },
    loreInjection: {
      title: '로어 주입',
      what: '현재 대화에 켜진 팩에서 관련 로어를 찾아 사용자 메시지에 붙여요.',
      example: '에리 관련 팩이 켜져 있고 대화에 “붕어빵”이 나오면 관련 항목을 후보로 넣어요.',
      recommended: '평소에는 켜 두는 것을 권장해요.',
      warning: '끄면 팩이 켜져 있어도 로어가 메시지에 들어가지 않아요.',
      result: '모델이 저장된 설정을 더 잘 이어 받아요.'
    },
    compression: {
      title: '자동 압축',
      what: '입력 공간이 부족할 때 로어 문장을 짧은 형태로 바꿔요.',
      example: '“에리는 슈크림 붕어빵을 좋아함”을 “에리=슈크림”처럼 줄일 수 있어요.',
      recommended: '긴 대화를 자주 하면 켜 두세요.',
      warning: '너무 짧게 압축하면 뉘앙스가 일부 줄어들 수 있어요.',
      result: '더 많은 항목을 적은 입력 공간에 넣을 수 있어요.'
    },
    compressionMode: {
      title: '압축 방식',
      what: '로어를 얼마나 짧게 넣을지 정해요.',
      example: '전체는 읽기 쉽고, 초압축은 토큰을 가장 많이 아껴요.',
      recommended: '자동 또는 전체부터 시작하세요.',
      warning: '초압축은 모델이 맥락을 덜 풍부하게 받을 수 있어요.',
      result: '주입되는 문장 길이와 정보량이 달라져요.'
    },
    insertPosition: {
      title: '삽입 위치',
      what: '사용자 메시지 앞이나 뒤에 로어를 붙이는 위치를 정해요.',
      example: '메시지 뒤는 자연스럽고, 메시지 앞은 배경 지시를 먼저 읽히고 싶을 때 써요.',
      recommended: '대부분 메시지 뒤를 권장해요.',
      warning: '앞에 넣으면 사용자가 쓴 문장보다 로어가 먼저 보여 모델 반응 톤이 달라질 수 있어요.',
      result: '같은 로어라도 모델이 읽는 순서가 바뀌어요.'
    },
    semanticSearch: {
      title: '의미 기반 검색',
      what: '정확히 같은 단어가 없어도 뜻이 비슷한 로어를 찾는 검색이에요.',
      example: '저장 항목은 “슈크림 붕어빵”인데 대화가 “크림 붕어빵”이어도 잡을 수 있어요.',
      recommended: '검색 데이터가 준비돼 있다면 켜 두세요.',
      warning: '검색 데이터가 없거나 오래되면 기대만큼 작동하지 않아요.',
      result: '키워드만으로 놓치는 항목을 더 넓게 찾을 수 있어요.'
    },
    autoEmbed: {
      title: '검색 데이터 자동 생성',
      what: '새로 추출한 로어에 의미 검색용 데이터를 바로 만들어요.',
      example: '자동 추출 뒤 새 항목이 곧바로 의미 검색 후보에 들어가요.',
      recommended: '의미 기반 검색을 쓴다면 켜 두세요.',
      warning: '임베딩 API 호출이 추가로 발생할 수 있어요.',
      result: '새 항목이 다음 대화부터 더 잘 검색돼요.'
    },
    rerank: {
      title: '후보 재정렬',
      what: '검색된 후보를 LLM으로 한 번 더 골라 지금 장면에 맞는 순서로 정리해요.',
      example: '비슷한 인물 항목이 여러 개일 때 현재 장면과 맞는 항목을 우선해요.',
      recommended: '후보가 많아 헷갈릴 때만 켜세요.',
      warning: '응답 전 API 호출이 추가돼 속도와 비용에 영향을 줘요.',
      result: '관련 없는 로어가 들어갈 확률을 줄여요.'
    },
    cooldown: {
      title: '반복 방지 턴',
      what: '방금 넣은 로어가 바로 반복 주입되지 않도록 쉬는 턴 수를 정해요.',
      example: '8이면 한 번 들어간 항목은 약 8턴 동안 다시 들어가기 어려워요.',
      recommended: '6~10 사이를 권장해요.',
      warning: '0에 가깝게 두면 같은 정보가 자주 반복될 수 있어요.',
      result: '대화가 덜 반복적으로 보여요.'
    },
    decay: {
      title: '시간 감쇠',
      what: '최근에 안 나온 중요 로어가 완전히 묻히지 않도록 점수를 보정해요.',
      example: '초반에 약속한 핵심 설정이 오래 지나도 다시 후보에 오를 수 있어요.',
      recommended: '장기 채팅에서는 켜 두세요.',
      warning: '잡다한 항목까지 중요도가 높으면 오래된 정보가 불필요하게 올라올 수 있어요.',
      result: '오래된 핵심 설정의 재등장 가능성이 올라가요.'
    },
    honorificMatrix: {
      title: '호칭 매트릭스',
      what: '관계별로 서로를 어떻게 부르는지 짧게 포함해요.',
      example: 'A가 B를 “선배”라고 부르던 관계가 “이름”으로 바뀌면 그 차이를 기억해요.',
      recommended: '호칭이나 말투 변화가 중요한 채팅에서는 켜 두세요.',
      warning: '로어에 호칭 데이터가 적으면 효과가 제한돼요.',
      result: '모델이 관계별 호칭을 더 안정적으로 유지해요.'
    },
    continuity: {
      title: '연속성 힌트',
      what: '첫 만남, 재회, 관계 변화처럼 자주 깨지는 연속성 정보를 보조로 넣어요.',
      example: '이미 만난 인물이 다시 처음 만난 것처럼 말하는 문제를 줄여요.',
      recommended: '캐릭터 관계가 누적되는 채팅에서는 켜 두세요.',
      warning: '잘못 추출된 과거 사건이 있으면 그 오류도 같이 참고될 수 있어요.',
      result: '만남·재회·관계 변화의 앞뒤가 더 자연스러워져요.'
    },
    maxEntries: {
      title: '최대 로어 수',
      what: '한 번의 메시지에 넣을 로어 항목 수 상한이에요.',
      example: '4로 두면 관련 후보가 많아도 최대 4개만 들어가요.',
      recommended: '3~5부터 시작하세요.',
      warning: '너무 높으면 메시지가 무거워지고 관련 없는 정보가 섞일 수 있어요.',
      result: '한 번에 전달되는 정보량과 속도가 달라져요.'
    }
  };

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
    const sel = UI.createSelect({ value, options, onChange });
    sel.style.width = '190px';
    nd.appendChild(UI.createSettingRow(title, desc, sel, help));
  }

  function makeNumberRow(nd, title, desc, value, min, max, onChange, help) {
    const input = UI.createInput({ type: 'number', value, min, max });
    input.style.width = '90px';
    input.style.textAlign = 'center';
    input.onchange = function() {
      const n = parseInt(input.value, 10);
      if (!isNaN(n)) onChange(n);
    };
    nd.appendChild(UI.createSettingRow(title, desc, input, help));
  }

  UI.registerPanel({
    id: 'settings',
    label: '기본 설정',
    title: '기본 설정',
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
        nd.appendChild(UI.createSection('빠른 설정', 'API 연결값은 유지. 선택한 프리셋의 동작 옵션만 적용', HELP.quickPreset));
        nd.appendChild(UI.createCardGrid(Object.keys(PRESETS).map(function(key) {
          return { id: key, title: PRESETS[key].name, desc: PRESETS[key].desc, preset: PRESETS[key] };
        }), async function(item) {
          const preset = item.preset;
          const ok = await UI.createConfirmDialog({
            title: '프리셋 적용',
            message: '[' + preset.name + '] 프리셋을 적용할까요?\nAPI 연결값은 유지돼요.',
            confirmLabel: '적용',
            cancelLabel: '취소'
          });
          if (!ok) return;
          applyPreset(settings, defaultSettings, preset);
          await UI.createAlertDialog({ title: '적용 완료', message: '프리셋 적용 완료. 새로고침 후 반영돼요.', tone: 'success' });
        }));
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('기본 동작'));
        makeToggle(nd, '로어 주입', '관련 로어를 메시지에 자동으로 포함', settings.config.enabled !== false, function(v) {
          settings.config.enabled = v; saveSettings(settings);
        }, HELP.loreInjection);

        makeToggle(nd, '자동 압축', '입력 공간이 부족할 때 로어 문장을 짧게 변환', settings.config.useCompressedFormat !== false, function(v) {
          settings.config.useCompressedFormat = v; saveSettings(settings);
        }, HELP.compression);

        makeSelectRow(nd, '압축 방식', '자동은 상황에 맞게, 전체는 읽기 쉬운 형태', settings.config.compressionMode || 'auto', [
          { value: 'auto', label: '자동' },
          { value: 'full', label: '전체' },
          { value: 'compact', label: '간결' },
          { value: 'micro', label: '초압축' }
        ], function(v) { settings.config.compressionMode = v; saveSettings(settings); }, HELP.compressionMode);

        makeSelectRow(nd, '삽입 위치', '사용자 메시지 기준 로어를 넣을 위치', settings.config.position || 'after', [
          { value: 'before', label: '메시지 앞' },
          { value: 'after', label: '메시지 뒤' }
        ], function(v) { settings.config.position = v; saveSettings(settings); }, HELP.insertPosition);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('검색과 연속성'));

        makeToggle(nd, '의미 기반 검색', '정확한 단어뿐 아니라 의미가 비슷한 로어도 검색', !!settings.config.embeddingEnabled, function(v) {
          settings.config.embeddingEnabled = v; saveSettings(settings);
        }, HELP.semanticSearch);

        makeToggle(nd, '검색 데이터 자동 생성', '추출 후 가능한 경우 검색 데이터를 생성', settings.config.autoEmbedOnExtract !== false, function(v) {
          settings.config.autoEmbedOnExtract = v; saveSettings(settings);
        }, HELP.autoEmbed);

        makeToggle(nd, '후보 재정렬', '검색 결과를 LLM으로 한 번 더 골라냄', !!settings.config.rerankEnabled, function(v) {
          settings.config.rerankEnabled = v; saveSettings(settings);
        }, HELP.rerank);

        makeToggle(nd, '시간 감쇠', '오래 안 나온 중요 로어를 다시 떠올리게 함', settings.config.decayEnabled !== false, function(v) {
          settings.config.decayEnabled = v; saveSettings(settings);
        }, HELP.decay);

        makeToggle(nd, '호칭 매트릭스', '관계별 호칭 정보를 짧게 포함', settings.config.honorificMatrixEnabled !== false, function(v) {
          settings.config.honorificMatrixEnabled = v; saveSettings(settings);
        }, HELP.honorificMatrix);

        makeToggle(nd, '연속성 힌트', '첫 만남, 재회, 관계 변화를 추적', settings.config.firstEncounterWarning !== false, function(v) {
          settings.config.firstEncounterWarning = v; saveSettings(settings);
        }, HELP.continuity);

        makeNumberRow(nd, '최대 로어 수', '한 메시지에 넣을 최대 로어 항목 수', settings.config.maxEntries || 4, 1, 12, function(v) {
          settings.config.maxEntries = v; saveSettings(settings);
        }, HELP.maxEntries);

        makeNumberRow(nd, '반복 방지 턴', '같은 로어의 반복 삽입을 막는 턴 수', settings.config.cooldownTurns || 8, 0, 50, function(v) {
          settings.config.cooldownTurns = v; saveSettings(settings);
        }, HELP.cooldown);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('문제 해결', '동작 옵션만 기본값으로 복구. API 키와 로어 DB는 유지'));
        const reset = UI.createButton('전체 설정 초기화', { kind: 'danger', bold: true });
        reset.onclick = async function() {
          const ok = await UI.createConfirmDialog({
            title: '전체 설정 초기화',
            message: '동작 옵션을 기본값으로 되돌릴까요?\nAPI 키와 로어 DB는 유지돼요.',
            danger: true,
            confirmLabel: '초기화',
            cancelLabel: '취소'
          });
          if (!ok) return;
          const api = pickApiConfig(settings.config);
          settings.config = JSON.parse(JSON.stringify(defaultSettings || {}));
          Object.assign(settings.config, api);
          saveSettings(settings);
          await UI.createAlertDialog({ title: '초기화 완료', message: 'API 키와 로어 DB는 유지했어요.', tone: 'success' });
          location.reload();
        };
        nd.appendChild(reset);
      });
    }
  });

  UI.__settingsPanelLoaded = true;
  console.log('[LoreInj:UI] settings panel loaded');
})();