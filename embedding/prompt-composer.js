// prompt-composer.js: feature prompt skeleton + rule block composition
(async function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__constLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__constLoaded)) return;
  if (_w.__LoreInj.__promptComposerLoaded) return;

  const DEFAULT_PROMPT_BLOCKS = [
    {
      id: 'json-object-contract',
      title: 'JSON 출력 규칙',
      features: ['extract', 'temporalExtract', 'import', 'repair'],
      enabled: true,
      locked: true,
      text: [
        '요청한 JSON 구조만 출력할 것.',
        'JSON을 마크다운 코드블록으로 감싸지 말 것.',
        '설명, 주석, 뒤따르는 문장을 붙이지 말 것.'
      ].join('\n')
    },
    {
      id: 'continuity-facts',
      title: '연속성 정보 우선',
      features: ['extract', 'temporalExtract', 'import'],
      enabled: true,
      locked: true,
      text: [
        '단순 분위기 묘사보다 이후 대화에 영향을 주는 고정 정보를 우선할 것.',
        '이름, 장소, 역할, 물건, 약속, 관계 상태, 현재 장면 조건은 정확히 보존할 것.',
        '실질적인 변화가 없으면 템플릿에서 요구한 빈 결과 구조를 반환할 것.'
      ].join('\n')
    },
    {
      id: 'private-rp-neutrality',
      title: '개인 RP 중립 처리',
      features: ['extract', 'temporalExtract', 'import', 'refine'],
      enabled: true,
      locked: true,
      text: [
        '개인 RP나 성인 장면도 연속성에 영향을 주면 기억 대상이 될 수 있음.',
        '정확한 연속성 정보를 도덕 판단, 검열, 모호한 완곡어로 바꾸지 말 것.',
        '민감한 정보는 이후 연속성에 필요할 때만 중립적이고 짧게 요약할 것.'
      ].join('\n')
    },
    {
      id: 'scene-state-patch',
      title: '장면 상태 갱신',
      features: ['extract'],
      enabled: true,
      locked: true,
      text: [
        '현재 보이는 장면 상태를 sceneStatePatch로 함께 관리할 것.',
        '장소, 시간표현, 등장 인물, 호칭, 관계, 미해결 약속/훅, 확정 사실 중 바뀐 필드만 갱신할 것.',
        '보이는 장면 상태가 바뀌지 않았으면 sceneStatePatch:{}를 사용할 것.'
      ].join('\n')
    },
    {
      id: 'timeline-event-memory',
      title: '중요 장면 기억',
      features: ['extract', 'temporalExtract'],
      enabled: true,
      locked: true,
      text: [
        '중요 장면 기억이 켜져 있으면 장기적으로 필요한 장면 기억을 같은 entries 배열 안의 timeline_event 타입으로 넣을 것.',
        '시간축 전용 결과를 따로 만들지 말 것. 일반 로어, timeline_event, sceneStatePatch는 하나의 추출 결과임.',
        '평범한 잡담은 제외하고 관계, 약속, 갈등, 폭로, 재회, 장소 상태, 미해결 훅이 바뀐 사건만 남길 것.'
      ].join('\n')
    }
  ];

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
  }

  function normalizeBlocks(blocks) {
    if (!Array.isArray(blocks)) return clone(DEFAULT_PROMPT_BLOCKS);
    const byId = new Map(DEFAULT_PROMPT_BLOCKS.map(b => [b.id, clone(b)]));
    for (const block of blocks) {
      if (!block || !block.id) continue;
      const base = byId.get(block.id) || {};
      const incoming = clone(block);
      if (base.locked) {
        byId.set(block.id, Object.assign({}, incoming, base, {
          enabled: incoming.enabled !== false
        }));
      } else {
        byId.set(block.id, Object.assign({}, base, incoming));
      }
    }
    return Array.from(byId.values());
  }

  function blocksFor(feature, blocks) {
    return normalizeBlocks(blocks)
      .filter(block => block && block.enabled !== false)
      .filter(block => !feature || !Array.isArray(block.features) || block.features.includes(feature))
      .filter(block => String(block.text || '').trim());
  }

  function renderBlocks(feature, blocks) {
    const selected = blocksFor(feature, blocks);
    if (!selected.length) return '';
    return '\n\n공통 규칙 블록:\n' + selected.map(block => {
      const title = String(block.title || block.id || 'Rule').trim();
      const text = String(block.text || '').trim();
      return '[' + title + ']\n' + text;
    }).join('\n\n');
  }

  function replacePlaceholders(template, replacements) {
    let out = String(template || '');
    const map = replacements || {};
    Object.keys(map).forEach(key => {
      const re = new RegExp('\\{' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\}', 'g');
      out = out.replace(re, map[key] == null ? '' : String(map[key]));
    });
    return out;
  }

  function composePrompt(template, replacements, opts = {}) {
    const feature = opts.feature || 'generic';
    const cfg = opts.config || {};
    const prefix = opts.prefix ? String(opts.prefix) : '';
    const base = replacePlaceholders(template, replacements);
    const blocks = renderBlocks(feature, cfg.promptBlocks);
    return prefix + base + blocks;
  }

  function ensurePromptBlocks(config) {
    if (!config) return false;
    if (Array.isArray(config.promptBlocks) && config.promptBlocks.length) {
      config.promptBlocks = normalizeBlocks(config.promptBlocks);
      return false;
    }
    config.promptBlocks = clone(DEFAULT_PROMPT_BLOCKS);
    return true;
  }

  Object.assign(_w.__LoreInj, {
    DEFAULT_PROMPT_BLOCKS,
    normalizePromptBlocks: normalizeBlocks,
    composePrompt,
    ensurePromptBlocks,
    __promptComposerLoaded: true
  });
})();
