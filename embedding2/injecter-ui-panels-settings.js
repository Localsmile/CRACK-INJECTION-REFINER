// == 인젝터 UI 패널 — Settings ==
// 역할: 기본 설정과 빠른 프리셋
// 의존: injecter-ui-utils.js, injecter-2.js settings
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:settings] UI utils not loaded');
    return;
  }
  if (UI.__settingsPanelLoaded) return;

  function getRuntime() {
    return _w.__LoreInj || {};
  }

  function saveSettings(settings) {
    if (settings && typeof settings.save === 'function') settings.save();
  }

  function makeToggle(nd, title, desc, value, onChange) {
    const C = UI.getCore();
    if (C && typeof C.createToggleRow === 'function') {
      nd.appendChild(C.createToggleRow(title, desc, value, onChange));
      return;
    }

    const row = document.createElement('label');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;cursor:pointer;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div');
    d.textContent = desc || '';
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    left.appendChild(t);
    left.appendChild(d);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    cb.style.cssText = 'accent-color:#4a9;';
    cb.onchange = function() { onChange(cb.checked); };

    row.appendChild(left);
    row.appendChild(cb);
    nd.appendChild(row);
  }

  function makeSelectRow(nd, title, desc, value, options, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;margin-bottom:8px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div');
    d.textContent = desc || '';
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    left.appendChild(t);
    left.appendChild(d);

    const sel = document.createElement('select');
    sel.style.cssText = 'width:180px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
    options.forEach(function(opt) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = function() { onChange(sel.value); };

    row.appendChild(left);
    row.appendChild(sel);
    nd.appendChild(row);
  }

  function makeNumberRow(nd, title, desc, value, min, max, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;margin-bottom:8px;';
    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div');
    t.textContent = title;
    t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div');
    d.textContent = desc || '';
    d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    left.appendChild(t);
    left.appendChild(d);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:90px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
    input.onchange = function() {
      const n = parseInt(input.value, 10);
      if (!isNaN(n)) onChange(n);
    };

    row.appendChild(left);
    row.appendChild(input);
    nd.appendChild(row);
  }

  function applyPreset(settings, defaultSettings, preset) {
    settings.config = JSON.parse(JSON.stringify(defaultSettings || {}));
    Object.assign(settings.config, preset.config);
    saveSettings(settings);
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
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createNotice('Settings are not loaded yet. Reload the page after all injector modules are available.', 'error'));
        });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('요약', '현재 설정 흐름'));
        if (UI.createSummaryGrid) {
          nd.appendChild(UI.createSummaryGrid([
            { label: '로어 주입', value: settings.config.enabled !== false ? '켜짐' : '꺼짐' },
            { label: '의미 검색', value: settings.config.embeddingEnabled ? '켜짐' : '꺼짐' },
            { label: '자동 추출', value: settings.config.autoExtEnabled ? '켜짐' : '꺼짐' }
          ]));
        }
      });

      const PRESETS = {
        beginner: {
          name: '기본',
          desc: '일반 RP용 균형 설정입니다. 자동 추출은 켜고 리랭커는 끕니다.',
          config: {
            enabled: true,
            embeddingEnabled: true,
            embeddingWeight: 0.35,
            autoExtEnabled: true,
            autoExtTurns: 8,
            autoExtIncludeDb: true,
            autoExtIncludePersona: true,
            autoEmbedOnExtract: true,
            scanOffset: 3,
            maxEntries: 4,
            cooldownTurns: 8,
            loreBudgetChars: 300,
            loreBudgetMax: 500,
            decayEnabled: true,
            activeCharDetection: true,
            activeCharBoostEnabled: true,
            honorificMatrixEnabled: true,
            firstEncounterWarning: true,
            importanceGating: true,
            importanceThreshold: 12,
            pendingPromiseBoost: true,
            rerankEnabled: false,
            useCompressedFormat: false,
            compressionMode: 'full',
            strictMatch: true,
            similarityMatch: true
          }
        },
        minimal: {
          name: '가벼움',
          desc: 'API 사용량을 줄입니다. 필요할 때 수동 추출을 쓰는 설정입니다.',
          config: {
            enabled: true,
            embeddingEnabled: true,
            embeddingWeight: 0.35,
            autoExtEnabled: false,
            autoEmbedOnExtract: true,
            scanOffset: 2,
            maxEntries: 3,
            cooldownTurns: 6,
            loreBudgetChars: 250,
            loreBudgetMax: 400,
            decayEnabled: true,
            activeCharDetection: true,
            activeCharBoostEnabled: true,
            honorificMatrixEnabled: true,
            firstEncounterWarning: false,
            importanceGating: true,
            importanceThreshold: 12,
            rerankEnabled: false,
            useCompressedFormat: false,
            compressionMode: 'full',
            strictMatch: true,
            similarityMatch: true
          }
        },
        advanced: {
          name: '정밀',
          desc: 'API를 더 사용하지만 리랭커와 응답 교정을 함께 켭니다.',
          config: {
            enabled: true,
            embeddingEnabled: true,
            embeddingWeight: 0.4,
            autoExtEnabled: true,
            autoExtTurns: 5,
            autoExtIncludeDb: true,
            autoExtIncludePersona: true,
            autoEmbedOnExtract: true,
            scanOffset: 3,
            maxEntries: 5,
            cooldownTurns: 8,
            loreBudgetChars: 400,
            loreBudgetMax: 700,
            decayEnabled: true,
            activeCharDetection: true,
            activeCharBoostEnabled: true,
            honorificMatrixEnabled: true,
            firstEncounterWarning: true,
            importanceGating: true,
            importanceThreshold: 10,
            pendingPromiseBoost: true,
            rerankEnabled: true,
            refinerEnabled: true,
            refinerLoreMode: 'semantic',
            useCompressedFormat: false,
            compressionMode: 'full',
            strictMatch: true,
            similarityMatch: true
          }
        }
      };

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('빠른 설정', '현재 로어 데이터는 유지. 선택한 프리셋의 옵션만 적용'));

        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:10px;';
        Object.keys(PRESETS).forEach(function(key) {
          const preset = PRESETS[key];
          const btn = document.createElement('button');
          btn.className = 'lore-card';
          btn.style.cssText = [
            'padding:13px 14px',
            'min-height:88px',
            'font-size:12px',
            'border-radius:14px',
            'cursor:pointer',
            'border:1px solid #2d3a35',
            'background:radial-gradient(circle at 0 0,rgba(159,255,221,.10),transparent 42%),linear-gradient(180deg,#14201d,#101413)',
            'color:#ccc',
            'display:flex',
            'flex-direction:column',
            'gap:7px',
            'text-align:left',
            'align-items:flex-start',
            'justify-content:flex-start',
            'box-shadow:0 10px 24px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.05)',
            'transition:background-color .12s ease,border-color .12s ease,transform .08s ease,box-shadow .12s ease'
          ].join(';') + ';';
          const name = document.createElement('div');
          name.textContent = preset.name;
          name.style.cssText = 'font-weight:700;color:#9fd;font-size:14px;';
          const desc = document.createElement('div');
          desc.textContent = preset.desc;
          desc.style.cssText = 'font-size:11px;color:#aaa;line-height:1.45;word-break:keep-all;';
          btn.appendChild(name);
          btn.appendChild(desc);
          btn.onmouseenter = function(){ btn.style.borderColor = '#4a9'; btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = '0 14px 28px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.07)'; };
          btn.onmouseleave = function(){ btn.style.borderColor = '#2d3a35'; btn.style.transform = ''; btn.style.boxShadow = '0 10px 24px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.05)'; };
          btn.onclick = function() {
            if (!confirm('[' + preset.name + '] 프리셋 적용?')) return;
            applyPreset(settings, defaultSettings, preset);
            alert('프리셋 적용 완료. 새로고침 후 전체 모듈에 반영');
          };
          row.appendChild(btn);
        });
        nd.appendChild(row);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('기본 동작'));

        makeToggle(nd, '로어 주입', '채팅 중 관련 로어를 프롬프트에 자동으로 넣습니다.', settings.config.enabled !== false, function(v) {
          settings.config.enabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, '자동 압축', '입력 공간이 부족할 때 로어 문장을 자동으로 짧게 줄입니다.', settings.config.useCompressedFormat !== false, function(v) {
          settings.config.useCompressedFormat = v;
          saveSettings(settings);
        });

        makeSelectRow(nd, '압축 방식', '자동은 필요한 만큼만 줄이고, 전체는 사람이 읽기 가장 쉽습니다.', settings.config.compressionMode || 'auto', [
          { value: 'auto', label: '자동' },
          { value: 'full', label: '전체' },
          { value: 'compact', label: '간결' },
          { value: 'micro', label: '초압축' }
        ], function(v) {
          settings.config.compressionMode = v;
          saveSettings(settings);
        });

        makeSelectRow(nd, '삽입 위치', '사용자 메시지 기준으로 로어를 어디에 넣을지 정합니다.', settings.config.position || 'after', [
          { value: 'before', label: '메시지 앞' },
          { value: 'after', label: '메시지 뒤' }
        ], function(v) {
          settings.config.position = v;
          saveSettings(settings);
        });
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('검색과 연속성'));

        makeToggle(nd, '의미 기반 검색', '정확한 단어뿐 아니라 의미가 비슷한 로어도 찾습니다.', !!settings.config.embeddingEnabled, function(v) {
          settings.config.embeddingEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, '검색 데이터 자동 생성', '추출 후 가능한 경우 임베딩 검색 데이터를 만듭니다.', settings.config.autoEmbedOnExtract !== false, function(v) {
          settings.config.autoEmbedOnExtract = v;
          saveSettings(settings);
        });

        makeToggle(nd, '후보 재정렬', 'LLM으로 검색 결과 중 장면에 가장 맞는 로어를 다시 고릅니다.', !!settings.config.rerankEnabled, function(v) {
          settings.config.rerankEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, '시간 감쇠', '오랫동안 나오지 않았지만 중요한 로어를 다시 떠올리게 합니다.', settings.config.decayEnabled !== false, function(v) {
          settings.config.decayEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, '호칭 매트릭스', '관계별 호칭 정보를 짧게 프롬프트에 포함합니다.', settings.config.honorificMatrixEnabled !== false, function(v) {
          settings.config.honorificMatrixEnabled = v;
          saveSettings(settings);
        });

        makeToggle(nd, '연속성 힌트', '첫 만남, 재회, 관계 변화 같은 서사 연속성을 추적합니다.', settings.config.firstEncounterWarning !== false, function(v) {
          settings.config.firstEncounterWarning = v;
          saveSettings(settings);
        });

        makeNumberRow(nd, '최대 로어 수', '한 메시지에 넣을 최대 로어 항목 수입니다.', settings.config.maxEntries || 4, 1, 12, function(v) {
          settings.config.maxEntries = v;
          saveSettings(settings);
        });

        makeNumberRow(nd, '반복 방지 턴', '같은 로어가 너무 자주 반복되지 않게 합니다.', settings.config.cooldownTurns || 8, 0, 50, function(v) {
          settings.config.cooldownTurns = v;
          saveSettings(settings);
        });
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('문제 해결', '설정이 꼬였을 때 기본값으로 되돌림. 로어 DB와 팩 데이터는 삭제 안 됨.'));
        const reset = UI.createButton('전체 설정 초기화', { kind: 'danger', bold: true });
        reset.onclick = function() {
          if (!confirm('전체 설정을 기본값으로 초기화할까요? 로어 DB와 팩 데이터는 삭제 안 됨.')) return;
          settings.config = JSON.parse(JSON.stringify(defaultSettings || {}));
          saveSettings(settings);
          alert('설정 초기화 완료. 로어 DB와 팩 데이터는 유지. 새로고침 후 반영.');
          location.reload();
        };
        nd.appendChild(reset);
      });
    }
  });

  UI.__settingsPanelLoaded = true;
  console.log('[LoreInj:UI] settings panel loaded');
})();