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
      title: 'JSON output contract',
      features: ['extract', 'temporalExtract', 'import', 'repair'],
      enabled: true,
      locked: true,
      text: [
        'Return only the requested JSON shape.',
        'Do not wrap JSON in markdown fences.',
        'Do not add prose, comments, or trailing text.'
      ].join('\n')
    },
    {
      id: 'continuity-facts',
      title: 'Continuity fact priority',
      features: ['extract', 'temporalExtract', 'import'],
      enabled: true,
      locked: true,
      text: [
        'Prefer stable continuity facts over mood-only narration.',
        'Keep exact names, places, roles, items, promises, relationship states, and current scene conditions.',
        'If nothing materially changed, return the empty shape requested by the template.'
      ].join('\n')
    },
    {
      id: 'private-rp-neutrality',
      title: 'Private RP neutrality',
      features: ['extract', 'temporalExtract', 'import', 'refine'],
      enabled: true,
      locked: true,
      text: [
        'Private/adult RP content may be continuity-relevant.',
        'Do not moralize, censor, or replace exact continuity facts with vague euphemisms.',
        'Summarize sensitive facts neutrally and compactly when they affect future continuity.'
      ].join('\n')
    },
    {
      id: 'scene-state-patch',
      title: 'Scene state patch',
      features: ['extract'],
      enabled: true,
      locked: true,
      text: [
        'Also maintain sceneStatePatch as the current visible scene state.',
        'Patch only changed fields: location, timeLabel, presentChars, honorifics, relationships, pending promises/hooks, and hard facts.',
        'Use sceneStatePatch:{} when the visible state did not change.'
      ].join('\n')
    },
    {
      id: 'timeline-event-memory',
      title: 'Timeline event memory',
      features: ['extract', 'temporalExtract'],
      enabled: true,
      locked: true,
      text: [
        'When important scene memory is enabled, put concrete long-term scene memories in the same entries array as type timeline_event.',
        'Do not make a second temporal-only result. Normal lore, timeline_event entries, and sceneStatePatch are one extraction result.',
        'Ignore routine chat; keep only events that change relationships, promises, conflicts, reveals, reunions, location state, or unresolved hooks.'
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
      byId.set(block.id, Object.assign({}, base, clone(block)));
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
    return '\n\nCOMPOSED RULE BLOCKS:\n' + selected.map(block => {
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
