// lore settings registry
// One source for generated settings controls. Legacy hand-built tabs remain during migration.
(async function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) return;
  if (_w.__LoreInj.__settingsRegistryLoaded) return;

  const { settings } = _w.__LoreInj;
  const TONE = {
    text: 'var(--li-text,#e7edf5)',
    soft: 'var(--li-text-soft,#a9b6c7)',
    muted: 'var(--li-muted,#748196)',
    line: 'var(--li-line,#2f3b4f)',
    panel: '#0f1724',
    accent: 'var(--li-accent,#5aa7ff)'
  };

  const SETTINGS_REGISTRY = [
    { key: 'enabled', type: 'boolean', label: '로어 삽입', help: '대화 전송 전에 관련 로어를 자동으로 붙임.', group: 'injection', level: 'basic' },
    { key: 'position', type: 'select', label: '삽입 위치', help: '로어를 유저 입력 앞 또는 뒤에 붙임.', group: 'injection', level: 'basic', options: [{ value: 'before', label: '입력 앞' }, { value: 'after', label: '입력 뒤' }] },
    { key: 'maxEntries', type: 'number', label: '한 번에 넣을 로어', help: '한 번의 입력에 포함할 로어 최대 개수.', group: 'injection', level: 'basic', min: 1, max: 12, step: 1 },
    { key: 'loreBudgetChars', type: 'number', label: '기본 삽입 문자 수', help: '삽입할 로어의 목표 문자 수.', group: 'injection', level: 'basic', min: 80, max: 1500, step: 10 },
    { key: 'loreBudgetMax', type: 'number', label: '최대 삽입 문자 수', help: '필요할 때 허용할 로어 문자 상한.', group: 'injection', level: 'advanced', min: 120, max: 1800, step: 10 },
    { key: 'stateBlockChars', type: 'number', label: '장면 상태 문자 수', help: '현재 장소, 인물, 미해결 정보를 항상 넣을 최대 문자 수.', group: 'injection', level: 'basic', min: 120, max: 900, step: 10 },
    { key: 'injectionCleanupEnabled', type: 'boolean', label: '삽입 흔적 자동 정리', help: '최근 창을 벗어난 로어 삽입문을 원문에서 제거함.', group: 'injection', level: 'basic', requiresCapability: 'canPatch' },
    { key: 'windowExitChars', type: 'number', label: '정리 기준 문자 수', help: '삽입 뒤 이 문자 수만큼 대화가 지나면 정리 대상.', group: 'injection', level: 'basic', min: 1000, max: 20000, step: 100, requiresCapability: 'canReadLogs' },

    { key: 'embeddingEnabled', type: 'boolean', label: '의미 검색', help: '단어가 달라도 의미가 가까운 로어를 찾음.', group: 'retrieval', level: 'basic' },
    { key: 'embeddingWeight', type: 'number', label: '의미 검색 비중', help: '트리거 검색 대비 의미 검색 영향도.', group: 'retrieval', level: 'advanced', min: 0, max: 1, step: 0.05 },
    { key: 'strictMatch', type: 'boolean', label: '정확한 단어 우선', help: '영문 단어는 단어 경계를 맞춰 검색함.', group: 'retrieval', level: 'basic' },
    { key: 'similarityMatch', type: 'boolean', label: '비슷한 단어 허용', help: '~트리거에 대해 철자가 비슷한 단어도 후보로 봄.', group: 'retrieval', level: 'advanced' },
    { key: 'activeCharDetection', type: 'boolean', label: '활성 인물 감지', help: '최근 대화에 등장한 인물을 우선 고려함.', group: 'retrieval', level: 'basic' },
    { key: 'activeCharBoostEnabled', type: 'boolean', label: '활성 인물 가중', help: '현재 장면 인물과 관련된 로어를 더 잘 뽑음.', group: 'retrieval', level: 'basic' },
    { key: 'periodicRecallEnabled', type: 'boolean', label: '오래된 정보도 가끔 넣기', help: '직접 관련이 약해도 중요한 과거 정보를 주기적으로 넣음.', group: 'retrieval', level: 'basic' },
    { key: 'cooldownEnabled', type: 'boolean', label: '삽입 쿨타임', help: '같은 로어가 너무 자주 반복되지 않게 함.', group: 'retrieval', level: 'basic' },
    { key: 'cooldownTurns', type: 'number', label: '쿨타임 턴 수', help: '같은 로어를 다시 넣기 전 기다릴 유저 턴 수.', group: 'retrieval', level: 'basic', min: 0, max: 30, step: 1 },

    { key: 'autoExtEnabled', type: 'boolean', label: '자동 대화 정리', help: '정해진 간격으로 대화를 읽어 로어를 갱신함.', group: 'memory', level: 'basic' },
    { key: 'autoExtTurns', type: 'number', label: '자동 정리 주기', help: '몇 유저 턴마다 자동 정리를 실행할지 정함.', group: 'memory', level: 'basic', min: 2, max: 100, step: 1 },
    { key: 'autoExtPatchMode', type: 'boolean', label: '변경분만 저장', help: '기존 로어 전체 대신 바뀐 부분만 받아 출력 비용을 줄임.', group: 'memory', level: 'basic' },
    { key: 'autoExtIncludeDb', type: 'boolean', label: '기존 로어 참고', help: '추출 시 현재 로어를 참고해 중복 저장을 줄임.', group: 'memory', level: 'basic' },
    { key: 'temporalExtractEnabled', type: 'boolean', label: '중요 장면 기억', help: '사건, 약속, 관계 변화 등을 별도 장면 기억으로 저장함.', group: 'memory', level: 'basic' },
    { key: 'autoEmbedOnExtract', type: 'boolean', label: '추출 후 임베딩', help: '새 로어를 의미 검색용으로 자동 준비함.', group: 'memory', level: 'advanced' },

    { key: 'autoExtApiType', type: 'select', label: 'API 방식', help: '추출/교정에 사용할 API 연결 방식.', group: 'models', level: 'basic', options: [{ value: 'key', label: 'Gemini API Key' }, { value: 'deepseek', label: 'DeepSeek' }, { value: 'firebase', label: 'Firebase' }, { value: 'vertex', label: 'Vertex JSON' }] },
    { key: 'autoExtModel', type: 'text', label: 'Gemini 추출 모델', help: 'Gemini API 방식에서 사용할 생성 모델.', group: 'models', level: 'advanced' },
    { key: 'deepSeekExtractModel', type: 'select', label: 'DeepSeek 추출 모델', help: 'DeepSeek 방식에서 추출/정리에 사용할 모델.', group: 'models', level: 'basic', options: [{ value: 'deepseek-v4-flash', label: 'V4 Flash' }, { value: 'deepseek-v4-pro', label: 'V4 Pro' }] },
    { key: 'embeddingModel', type: 'text', label: '임베딩 모델', help: '의미 검색 벡터 생성에 사용할 Gemini 임베딩 모델.', group: 'models', level: 'advanced' },
    { key: 'refinerEnabled', type: 'boolean', label: '응답 교정', help: 'AI 응답을 로어 기준으로 검수하고 필요 시 수정함.', group: 'models', level: 'basic', requiresCapability: 'canPatch' },

    { key: 'extractStatusBadgeEnabled', type: 'boolean', label: '상태 배지 표시', help: '추출/교정 진행 상태를 화면에 표시함.', group: 'advanced', level: 'basic' },
    { key: 'rerankEnabled', type: 'boolean', label: 'AI로 후보 다시 고르기', help: '검색된 로어 후보를 모델로 다시 정렬함. 비용과 지연이 늘어남.', group: 'advanced', level: 'advanced' },
    { key: 'deltaSkipEnabled', type: 'boolean', label: '최근 동일 로어 생략', help: '명시적으로 켠 경우에만 최근 동일 로어 재삽입을 줄임.', group: 'advanced', level: 'advanced' }
  ];

  const GROUPS = [
    { id: 'memory', label: '기억 관리' },
    { id: 'retrieval', label: '검색과 회수' },
    { id: 'injection', label: '삽입과 정리' },
    { id: 'models', label: 'API와 모델' },
    { id: 'advanced', label: '고급 동작' }
  ];

  function capabilityOk(def) {
    if (!def.requiresCapability) return { ok: true, reason: '' };
    const caps = _w.__LorePlatform && _w.__LorePlatform.capabilities ? _w.__LorePlatform.capabilities() : {};
    if (caps[def.requiresCapability]) return { ok: true, reason: '' };
    const labels = { canPatch: '메시지 수정 API 사용 불가', canReadLogs: '대화 로그 읽기 불가', canReadSummary: '요약 읽기 미지원' };
    return { ok: false, reason: labels[def.requiresCapability] || '사이트 기능 미지원' };
  }

  function fieldValue(def) {
    const cfg = settings.config || {};
    if (cfg[def.key] !== undefined) return cfg[def.key];
    if (def.type === 'boolean') return false;
    if (def.type === 'number') return def.min || 0;
    return '';
  }

  function saveField(def, value) {
    if (!settings.config) settings.config = {};
    settings.config[def.key] = value;
    settings.save();
  }

  function makeShell(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function renderControl(def, disabled) {
    if (def.type === 'boolean') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = fieldValue(def) !== false;
      input.disabled = disabled;
      input.onchange = () => saveField(def, !!input.checked);
      return input;
    }
    if (def.type === 'select') {
      const select = document.createElement('select');
      (def.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        select.appendChild(o);
      });
      select.value = String(fieldValue(def) || ((def.options && def.options[0] && def.options[0].value) || ''));
      select.disabled = disabled;
      select.onchange = () => saveField(def, select.value);
      return select;
    }
    const input = document.createElement('input');
    input.type = def.type === 'number' ? 'number' : 'text';
    input.value = fieldValue(def);
    if (def.min != null) input.min = String(def.min);
    if (def.max != null) input.max = String(def.max);
    if (def.step != null) input.step = String(def.step);
    input.disabled = disabled;
    input.onchange = () => {
      if (def.type === 'number') {
        const n = Number(input.value);
        if (Number.isFinite(n)) saveField(def, n);
      } else saveField(def, input.value);
    };
    return input;
  }

  function renderSettingsRegistryPanel(panel) {
    panel.addBoxedField('', '', { onInit: (nd) => {
      nd.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
      const intro = makeShell('div', '', '핵심 설정을 한 화면에서 관리함. 기존 세부 탭은 고급 작업과 목록 관리용으로 유지됨.');
      intro.style.cssText = 'color:' + TONE.soft + ';font-size:12px;line-height:1.6;';
      nd.appendChild(intro);

      GROUPS.forEach(group => {
        const defs = SETTINGS_REGISTRY.filter(d => d.group === group.id);
        const section = makeShell('section', '', '');
        section.style.cssText = 'border:1px solid ' + TONE.line + ';border-radius:10px;background:' + TONE.panel + ';padding:12px;';
        const title = makeShell('div', '', group.label);
        title.style.cssText = 'font-size:13px;font-weight:900;color:' + TONE.text + ';margin-bottom:9px;';
        section.appendChild(title);
        defs.forEach(def => {
          const cap = capabilityOk(def);
          const row = makeShell('div', '', '');
          row.style.cssText = 'display:grid;grid-template-columns:minmax(160px, 260px) minmax(160px, 1fr);gap:12px;align-items:center;padding:9px 0;border-top:1px solid rgba(148,163,184,.14);';
          const meta = makeShell('div', '', '');
          const label = makeShell('div', '', def.label);
          label.style.cssText = 'font-size:12px;font-weight:900;color:' + (cap.ok ? TONE.text : TONE.muted) + ';';
          const help = makeShell('div', '', cap.ok ? (def.help || '') : cap.reason);
          help.style.cssText = 'font-size:11px;line-height:1.5;color:' + (cap.ok ? TONE.soft : '#e7b56f') + ';margin-top:3px;word-break:keep-all;';
          meta.appendChild(label);
          meta.appendChild(help);
          const controlWrap = makeShell('div', '', '');
          controlWrap.style.cssText = 'display:flex;justify-content:flex-end;min-width:0;';
          const control = renderControl(def, !cap.ok);
          control.style.cssText = def.type === 'boolean'
            ? 'width:18px;height:18px;accent-color:' + TONE.accent + ';'
            : 'width:100%;max-width:360px;min-height:34px;border-radius:8px;border:1px solid ' + TONE.line + ';background:#08111d;color:' + TONE.text + ';padding:7px 9px;font-size:12px;box-sizing:border-box;';
          controlWrap.appendChild(control);
          row.appendChild(meta);
          row.appendChild(controlWrap);
          section.appendChild(row);
        });
        nd.appendChild(section);
      });
    }});
  }

  _w.__LoreInj.registerMenu = _w.__LoreInj.registerMenu || function() {};
  _w.__LoreInj.registerMenu('registry', function(modal) {
    modal.createMenu('통합 설정', (m) => {
      m.replaceContentPanel(renderSettingsRegistryPanel, '통합 설정');
    });
  });

  Object.assign(_w.__LoreInj, {
    SETTINGS_REGISTRY,
    renderSettingsRegistryPanel,
    __settingsRegistryLoaded: true
  });
})();
