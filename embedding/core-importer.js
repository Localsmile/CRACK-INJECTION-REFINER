// crack-lore-core / importer 모듈
// 역할: 외부 텍스트/JSON/URL을 로어 엔트리로 변환, 메모리 요약 내 중복 감지
// 의존: kernel.callGeminiApi, kernel.gmFetch, kernel.getDB, kernel.DEFAULTS
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:importer] kernel 미로드'); return; }
  if (C.__importerLoaded) return;
  const { callGeminiApi, gmFetch, getDB, DEFAULTS } = C;

  function clampText(text, max) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!max || text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 1)).trim() + '…';
  }

  function textSignature(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function normalizeSummaryValue(summary, name, state) {
    if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
      const full = clampText(summary.full || summary.compact || summary.micro || '', 0);
      const compact = clampText(summary.compact || full, 180);
      const micro = clampText(summary.micro || (state ? `${name}=${state}` : compact || name), 60);
      return { full, compact, micro };
    }
    const full = clampText(summary || '', 0);
    const compact = clampText(full || state || name || '', 180);
    const micro = clampText(state ? `${name}=${state}` : compact || name || '', 60);
    return { full, compact, micro };
  }

  function mergeText(a, b, max) {
    a = clampText(a || '', max);
    b = clampText(b || '', max);
    if (!a) return b;
    if (!b || a.includes(b)) return a;
    return clampText(a + ' / ' + b, max);
  }

  function mergeLoreSummary(existingSummary, incomingSummary, name, state) {
    const ex = normalizeSummaryValue(existingSummary, name, state);
    const inc = normalizeSummaryValue(incomingSummary, name, state);
    const incomingObject = incomingSummary && typeof incomingSummary === 'object' && !Array.isArray(incomingSummary);
    const hasFull = incomingObject ? !!String(incomingSummary.full || '').trim() : !!String(incomingSummary || '').trim();
    const hasCompact = incomingObject ? !!String(incomingSummary.compact || '').trim() : hasFull;
    const hasMicro = incomingObject ? !!String(incomingSummary.micro || '').trim() : hasFull;
    return {
      full: hasFull ? inc.full : ex.full,
      compact: hasCompact ? inc.compact : ex.compact,
      micro: hasMicro ? inc.micro : ex.micro
    };
  }

  function normalizeMemoryFacts(entry) {
    const facts = C.normalizeFactList ? C.normalizeFactList(entry) : [];
    return facts.map(fact => {
      const rawTime = String(fact.time || 'current').toLowerCase();
      const time = rawTime === 'now' ? 'current'
        : (rawTime === 'previous' ? 'past'
          : (rawTime === 'foreshadow' ? 'future'
            : (rawTime === 'stable' ? 'timeless' : rawTime)));
      return {
        subject: fact.subject,
        relation: fact.relation,
        value: fact.value,
        time,
        polarity: fact.polarity || 'affirmed',
        ...(fact.condition ? { condition: fact.condition } : {}),
        ...(fact.knownBy.length ? { knownBy: fact.knownBy } : {}),
        ...(fact.hiddenFrom.length ? { hiddenFrom: fact.hiddenFrom } : {})
      };
    });
  }

  function memoryFactKey(fact, includeValue = false) {
    const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return [
      norm(fact.subject),
      norm(fact.relation),
      norm(fact.time || 'current'),
      includeValue ? norm(fact.value) : ''
    ].join('|');
  }

  function mergeMemoryFacts(existingFacts, incomingFacts, name, options = {}) {
    const existing = normalizeMemoryFacts({ name, facts: existingFacts });
    const incoming = normalizeMemoryFacts({ name, facts: incomingFacts });
    if (!incoming.length) return existing;
    const out = existing.map(fact => ({ ...fact }));
    const replaceCurrent = options.replaceCurrent === true;

    if (replaceCurrent) {
      const groups = new Map();
      for (const fact of incoming) {
        const currentLike = ['current', 'now', 'future', 'foreshadow'].includes(String(fact.time || '').toLowerCase());
        if (!currentLike) continue;
        const key = memoryFactKey(fact, false);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(fact);
      }
      for (const [key, replacements] of groups) {
        const replValues = new Set(replacements.map(fact => memoryFactKey(fact, true)));
        const currValues = out.filter(fact => memoryFactKey(fact, false) === key);
        const overlaps = currValues.filter(fact => replValues.has(memoryFactKey(fact, true))).length;
        const ambiguous = options.protectMultiValue !== false &&
          currValues.length > 1 && replacements.length < currValues.length && overlaps === 0;
        if (ambiguous) {
          if (Array.isArray(options.conflicts)) {
            options.conflicts.push({
              subject: replacements[0]?.subject || '',
              relation: replacements[0]?.relation || '',
              existingValues: currValues.map(fact => fact.value),
              incomingValues: replacements.map(fact => fact.value),
              reason: 'ambiguous_multi_value_replace'
            });
          }
          continue;
        }
        for (let index = out.length - 1; index >= 0; index--) {
          const old = out[index];
          if (memoryFactKey(old, false) !== key) continue;
          if (replValues.has(memoryFactKey(old, true))) continue;
          out.splice(index, 1);
          const historical = { ...old, time: 'past' };
          const historyKey = memoryFactKey(historical, true);
          if (!out.some(item => memoryFactKey(item, true) === historyKey)) out.push(historical);
        }
      }
    }
    for (const fact of incoming) {
      const exactKey = memoryFactKey(fact, true);
      const index = out.findIndex(item => memoryFactKey(item, true) === exactKey);
      if (index < 0) {
        out.push(fact);
        continue;
      }
      const old = out[index];
      if (old.polarity !== fact.polarity && ['current', 'future'].includes(fact.time)) {
        const historical = { ...old, time: 'past' };
        const historyKey = memoryFactKey(historical, true);
        if (!out.some((item, itemIndex) => itemIndex !== index &&
          memoryFactKey(item, true) === historyKey &&
          item.polarity === historical.polarity &&
          (item.condition || '') === (historical.condition || ''))) {
          out.push(historical);
        }
      }
      const knownBy = Array.from(new Set([...(old.knownBy || []), ...(fact.knownBy || [])].filter(Boolean)));
      const knownSet = new Set(knownBy.map(value => String(value).trim().toLowerCase()));
      const hiddenFrom = Array.from(new Set([...(old.hiddenFrom || []), ...(fact.hiddenFrom || [])].filter(Boolean)))
        .filter(value => !knownSet.has(String(value).trim().toLowerCase()));
      out[index] = {
        ...old,
        ...fact,
        condition: fact.condition || old.condition || '',
        ...(knownBy.length ? { knownBy } : {}),
        ...(hiddenFrom.length ? { hiddenFrom } : {})
      };
      if (!knownBy.length) delete out[index].knownBy;
      if (!hiddenFrom.length) delete out[index].hiddenFrom;
    }

    const seen = new Set();
    return out.filter(fact => {
      const key = [
        memoryFactKey(fact, true),
        fact.polarity || '',
        fact.condition || '',
        ...(fact.knownBy || []),
        ...(fact.hiddenFrom || [])
      ].join('|').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeImportedEntries(entries) {
    const merged = new Map();
    for (const raw of (entries || [])) {
      if (!raw || !raw.name) continue;
      const rawType = String(raw.type || 'concept').toLowerCase();
      const type = rawType === 'relationship' ? 'rel' : (rawType === 'promise' ? 'prom' : rawType);
      const key = type + '|' + String(raw.name).trim().toLowerCase();
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, JSON.parse(JSON.stringify(raw)));
        continue;
      }
      existing.triggers = Array.from(new Set([...(existing.triggers || []), ...(raw.triggers || [])].filter(Boolean)));
      existing.entities = Array.from(new Set([...(existing.entities || []), ...(raw.entities || [])].filter(Boolean)));
      existing.eventHistory = [...(existing.eventHistory || []), ...(raw.eventHistory || [])].filter((event, index, all) => {
        const sig = String(event && (event.summary || event.text) || '').trim().toLowerCase();
        return sig && all.findIndex(candidate => String(candidate && (candidate.summary || candidate.text) || '').trim().toLowerCase() === sig) === index;
      });
      existing.facts = mergeMemoryFacts(existing.facts, raw.facts || raw.memoryFacts, existing.name);
      existing.openLoops = Array.from(new Set([...(existing.openLoops || []), ...(raw.openLoops || [])].map(x => String(x || '').trim()).filter(Boolean)));
      existing.summary = mergeLoreSummary(existing.summary, raw.summary, existing.name, raw.state || existing.state);
      existing.inject = mergeLoreSummary(existing.inject, raw.inject || raw.summary, existing.name, raw.state || existing.state);
      existing.embed_text = mergeText(existing.embed_text, raw.embed_text, 500);
      existing.state = raw.state || existing.state;
      existing.detail = { ...(existing.detail || {}), ...(raw.detail || {}) };
      existing.callState = { ...(existing.callState || {}), ...(raw.callState || {}) };
      existing.timeline = { ...(existing.timeline || {}), ...(raw.timeline || {}) };
      for (const score of ['imp', 'sur', 'emo']) existing[score] = Math.max(Number(existing[score]) || 0, Number(raw[score]) || 0);
    }
    return Array.from(merged.values());
  }

  function normalizeApiOpts(apiOpts = {}) {
    const out = { ...(apiOpts || {}) };
    const liveCfg = _w.__LoreInj && _w.__LoreInj.settings && _w.__LoreInj.settings.config
      ? _w.__LoreInj.settings.config
      : {};

    // URL import and text import must use the exact same API surface as auto extract.
    // Fill any missing field from the live settings snapshot, but never switch apiType implicitly after it is chosen.
    if (!out.apiType && liveCfg.autoExtApiType) out.apiType = liveCfg.autoExtApiType;
    out.apiType = out.apiType || 'key';

    if (!out.key && liveCfg.autoExtKey) out.key = liveCfg.autoExtKey;
    if (!out.vertexJson && liveCfg.autoExtVertexJson) out.vertexJson = liveCfg.autoExtVertexJson;
    if (!out.vertexLocation && liveCfg.autoExtVertexLocation) out.vertexLocation = liveCfg.autoExtVertexLocation;
    if (!out.vertexProjectId && liveCfg.autoExtVertexProjectId) out.vertexProjectId = liveCfg.autoExtVertexProjectId;
    if (!out.firebaseScript && liveCfg.autoExtFirebaseScript) out.firebaseScript = liveCfg.autoExtFirebaseScript;
    if (!out.firebaseEmbedKey && (liveCfg.autoExtGeminiEmbedKey || liveCfg.autoExtFirebaseEmbedKey)) out.firebaseEmbedKey = liveCfg.autoExtGeminiEmbedKey || liveCfg.autoExtFirebaseEmbedKey;
    if (!out.deepSeekKey && liveCfg.autoExtDeepSeekKey) out.deepSeekKey = liveCfg.autoExtDeepSeekKey;
    if (!out.openAIBaseUrl && liveCfg.autoExtOpenAIBaseUrl) out.openAIBaseUrl = liveCfg.autoExtOpenAIBaseUrl;
    if (!out.openAIKey && liveCfg.autoExtOpenAIKey) out.openAIKey = liveCfg.autoExtOpenAIKey;
    if (!out.key && out.apiType === 'openai' && liveCfg.autoExtOpenAIKey) out.key = liveCfg.autoExtOpenAIKey;
    if (!out.openAIReasoning && liveCfg.autoExtOpenAIReasoning) out.openAIReasoning = liveCfg.autoExtOpenAIReasoning;
    if (!out.openAIFormat && liveCfg.autoExtOpenAIFormat) out.openAIFormat = liveCfg.autoExtOpenAIFormat;
    if (out.deepSeekThinking === undefined) out.deepSeekThinking = liveCfg.autoExtDeepSeekThinking !== false;
    if (!out.deepSeekReasoning && liveCfg.autoExtDeepSeekReasoning) out.deepSeekReasoning = liveCfg.autoExtDeepSeekReasoning;
    if (!out.deepSeekJsonSystemPrompt && liveCfg.deepSeekJsonSystemPrompt) out.deepSeekJsonSystemPrompt = liveCfg.deepSeekJsonSystemPrompt;
    if (!out.importPrompt && liveCfg.importPrompt) out.importPrompt = liveCfg.importPrompt;
    if (!out.importSchema && liveCfg.importSchema) out.importSchema = liveCfg.importSchema;
    if (out.deepSeekPromptOverridesEnabled === undefined) out.deepSeekPromptOverridesEnabled = liveCfg.deepSeekPromptOverridesEnabled !== false;
    if (!out.deepSeekImportPrompt && _w.__LoreInj && _w.__LoreInj.settings && _w.__LoreInj.settings.getActiveTemplate) {
      try {
        const activeTpl = _w.__LoreInj.settings.getActiveTemplate();
        if (activeTpl && activeTpl.deepSeekImportPrompt) out.deepSeekImportPrompt = activeTpl.deepSeekImportPrompt;
      } catch (_) {}
    }
    if (!out.deepSeekImportPrompt && liveCfg.deepSeekImportPrompt) out.deepSeekImportPrompt = liveCfg.deepSeekImportPrompt;

    const fallbackModel = out.apiType === 'deepseek' ? 'deepseek-v4-flash' : (out.apiType === 'openai' ? '' : 'gemini-3-flash-preview');
    if (out.model === '_custom') out.model = out.customModel || out.autoExtCustomModel || liveCfg.autoExtCustomModel || fallbackModel;
    if (!out.model) out.model = liveCfg.autoExtModel === '_custom'
      ? (liveCfg.autoExtCustomModel || fallbackModel)
      : (liveCfg.autoExtModel || fallbackModel);

    if (out.apiType === 'firebase' && !out.firebaseScript) {
      throw new Error('Firebase 모드: firebaseScript 설정이 지식 변환 호출에 전달되지 않았습니다.');
    }
    if (out.apiType === 'key' && !out.key) {
      throw new Error('API Key 모드: API 키가 비어 있습니다.');
    }
    if (out.apiType === 'vertex' && !out.vertexJson) {
      throw new Error('Vertex 모드: 서비스 계정 JSON이 비어 있습니다.');
    }
    if (out.apiType === 'deepseek' && !out.deepSeekKey && !out.key) {
      throw new Error('DeepSeek 모드: API 키가 비어 있습니다.');
    }
    if (out.apiType === 'openai') {
      if (!out.openAIBaseUrl) throw new Error('OpenAI 호환 모드: URL이 비어 있습니다.');
      if (!out.openAIKey && !out.key) throw new Error('OpenAI 호환 모드: API 키가 비어 있습니다.');
      if (!out.model) throw new Error('OpenAI 호환 모드: 모델명을 입력해야 합니다.');
      out.key = out.openAIKey || out.key;
    }
    return out;
  }

  function normalizeCallState(entry, turn) {
    const out = entry.callState && typeof entry.callState === 'object' ? JSON.parse(JSON.stringify(entry.callState)) : {};
    if (entry.call && typeof entry.call === 'object') {
      for (const [key, term] of Object.entries(entry.call)) {
        if (!out[key]) out[key] = {};
        if (typeof out[key] === 'string') out[key] = { currentTerm: out[key] };
        out[key].currentTerm = out[key].currentTerm || term;
        out[key].lastChangedTurn = out[key].lastChangedTurn || turn || 0;
      }
    }
    const deltas = Array.isArray(entry.callDelta) ? entry.callDelta : [];
    for (const d of deltas) {
      if (!d || !d.from || !d.to || !d.term) continue;
      const key = `${d.from}→${d.to}`;
      const prev = d.prevTerm ? [d.prevTerm] : [];
      out[key] = {
        currentTerm: d.term,
        previousTerms: prev,
        tone: d.tone || '',
        scope: d.scope || 'scene',
        lastChangedTurn: d.turnApprox || turn || 0,
        confidence: d.confidence != null ? d.confidence : 0.75,
        reason: d.reason || 'observed vocative change'
      };
    }
    return Object.keys(out).length ? out : undefined;
  }

  function normalizeLoreEntry(entry, opts = {}) {
    let e = { ...(entry || {}) };
    const turn = opts.turn || e.timeline?.eventTurn || e.eventTurn || 0;
    if (String(e.type || '').toLowerCase() === (C.TIMELINE_EVENT_TYPE || 'timeline_event') && C.normalizeTimelineEvent) {
      e = C.normalizeTimelineEvent(e, { turn, currentTurn: opts.currentTurn || turn });
    }
    const rawSummary = e.summary;
    const rawInject = e.inject;
    const derivedBefore = e.memoryDerivedCompact === true;
    const facts = normalizeMemoryFacts(e);
    const explicitSummaryCompact = !derivedBefore && !!(rawSummary && typeof rawSummary === 'object' && !Array.isArray(rawSummary) && rawSummary.compact);
    const explicitSummaryMicro = !derivedBefore && !!(rawSummary && typeof rawSummary === 'object' && !Array.isArray(rawSummary) && rawSummary.micro);
    const legacyDerivedFull = facts.length && derivedBefore && rawInject && rawInject.full && (
      rawInject.full === (rawSummary && typeof rawSummary === 'object' ? rawSummary.full : rawSummary) ||
      String(rawInject.full).startsWith(String(rawSummary && typeof rawSummary === 'object' ? rawSummary.full || '' : rawSummary || '') + ' | 최근:')
    );
    const markedDerivedFull = e.memoryDerivedFull === true && (
      !e.memoryDerivedFullSignature ||
      textSignature(rawInject && rawInject.full) === e.memoryDerivedFullSignature
    );
    const derivedFullBefore = markedDerivedFull || legacyDerivedFull;
    const explicitInjectFull = !derivedFullBefore && !!(rawInject && typeof rawInject === 'object' && rawInject.full);
    const explicitInjectCompact = !derivedBefore && !!(rawInject && typeof rawInject === 'object' && rawInject.compact);
    const explicitInjectMicro = !derivedBefore && !!(rawInject && typeof rawInject === 'object' && rawInject.micro);
    if (facts.length) {
      e.facts = facts;
      e.memorySchemaVersion = 2;
    }
    if (Array.isArray(e.openLoops)) e.openLoops = Array.from(new Set(e.openLoops.map(x => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean)));
    e.summary = normalizeSummaryValue(rawSummary, e.name, e.state);
    const derivedCompact = facts.length && C.formatMemoryFactsCompact ? C.formatMemoryFactsCompact(e) : '';
    const derivedMicro = facts.length && C.deriveMemoryMicro ? C.deriveMemoryMicro(e) : '';
    if (derivedCompact && !explicitSummaryCompact) e.summary.compact = derivedCompact;
    if (derivedMicro && !explicitSummaryMicro) e.summary.micro = derivedMicro;
    e.inject = rawInject && typeof rawInject === 'object' ? { ...rawInject } : {};
    e.inject.full = explicitInjectFull ? e.inject.full : e.summary.full;
    if (!explicitInjectFull && e.summary.full) {
      e.memoryDerivedFull = true;
      e.memoryDerivedFullSignature = textSignature(e.inject.full);
    } else {
      delete e.memoryDerivedFull;
      delete e.memoryDerivedFullSignature;
    }
    e.inject.compact = explicitInjectCompact ? e.inject.compact : (derivedCompact || e.summary.compact);
    e.inject.micro = explicitInjectMicro ? e.inject.micro : (derivedMicro || e.summary.micro);
    if (derivedCompact && !explicitSummaryCompact && !explicitInjectCompact) e.memoryDerivedCompact = true;
    const priorEntitiesText = Array.isArray(e.entities) ? e.entities.join(' ') : '';
    if (!Array.isArray(e.entities)) {
      const names = [];
      if (Array.isArray(e.parties)) names.push(...e.parties);
      if (Array.isArray(e.detail?.parties)) names.push(...e.detail.parties);
      if (e.speaker) names.push(e.speaker);
      if (e.name) names.push(...String(e.name).split(/[↔&]/).map(x => x.trim()).filter(Boolean));
      e.entities = Array.from(new Set(names)).filter(Boolean);
    }
    const entities = Array.isArray(e.entities) ? e.entities.join(' ') : '';
    const importantLineText = String(e.type || '').toLowerCase() === 'key_quote'
      ? [e.speaker, e.quote, e.context, e.meaning, (e.recallTriggers || []).join(' '), (e.linkedLore || []).join(' ')].filter(Boolean).join(' ')
      : '';
    const temporalText = String(e.type || '').toLowerCase() === (C.TIMELINE_EVENT_TYPE || 'timeline_event')
      ? [e.title, e.location, (e.actions || []).join(' '), (e.hooks || []).join(' '), (e.recallTriggers || []).join(' '), e.when?.anchor, (e.linkedLore || []).join(' ')].filter(Boolean).join(' ')
      : '';
    const factText = facts.map(fact => [
      fact.subject, fact.relation, fact.value, fact.time, fact.condition,
      ...(fact.knownBy || []), ...(fact.hiddenFrom || [])
    ].filter(Boolean).join(' ')).join(' ');
    const derivedEmbedText = clampText([e.name, temporalText, importantLineText, entities, (e.triggers || []).join(' '), factText, e.summary.full, e.state].filter(Boolean).join(' '), 500);
    const previousDerivedEmbedText = clampText([e.name, temporalText, importantLineText, priorEntitiesText, (e.triggers || []).join(' '), factText, e.summary.full, e.state].filter(Boolean).join(' '), 500);
    const markedDerivedEmbed = e.memoryDerivedEmbed === true && (
      !e.memoryDerivedEmbedSignature ||
      textSignature(e.embed_text) === e.memoryDerivedEmbedSignature
    );
    const legacyDerivedEmbed = facts.length && derivedBefore && (e.embed_text === derivedEmbedText || e.embed_text === previousDerivedEmbedText);
    if (!e.embed_text || markedDerivedEmbed || legacyDerivedEmbed) {
      e.embed_text = derivedEmbedText;
      if (derivedEmbedText) {
        e.memoryDerivedEmbed = true;
        e.memoryDerivedEmbedSignature = textSignature(e.embed_text);
      }
    } else {
      delete e.memoryDerivedEmbed;
      delete e.memoryDerivedEmbedSignature;
    }
    const callState = normalizeCallState(e, turn);
    if (callState) e.callState = callState;
    if (!e.timeline || typeof e.timeline !== 'object') e.timeline = {};
    e.timeline.eventTurn = e.timeline.eventTurn || turn || 0;
    e.timeline.relativeOrder = e.timeline.relativeOrder || 'current';
    e.timeline.sceneLabel = e.timeline.sceneLabel || '';
    e.timeline.observedRecency = e.timeline.observedRecency || 'recent';
    return e;
  }

  const IMPORT_SCHEMA = `[<br>  {<br>    "type": "identity|character|location|faction|item|ability|rule|condition|event|concept|setting|rel|prom|key_quote",<br>    "name": "Entity Name",<br>    "triggers": ["keyword1", "keyword2", "A&&B"],<br>    "summary": {"full": "complete self-contained continuity record"},<br>    "facts": [<br>      {"subject": "exact owner", "relation": "attribute or relation", "value": "bound value", "time": "current|past|future|timeless", "polarity": "affirmed|negated|uncertain", "condition": "", "knownBy": [], "hiddenFrom": []}<br>    ],<br>    "openLoops": ["unresolved goal, promise, question, threat, or conflict"],<br>    "state": "current situation noun phrase",<br>    "timeline": { "eventTurn": 0, "relativeOrder": "current|past|foreshadow", "sceneLabel": "", "observedRecency": "recent|old|unknown" },<br>    "entities": ["characters/places/items involved"],<br>    "parties": ["relationship parties when relevant"],<br>    "callState": {},<br>    "detail": {},<br>    "imp": 5,<br>    "sur": 5,<br>    "emo": 5<br>  }<br>]`;

  const IMPORT_PROMPT_TEMPLATE = `Convert the source material into structured continuity entries.<br><br>RULES:<br>1. JSON ONLY. Output a valid JSON array. No markdown.<br>2. Use the ORIGINAL LANGUAGE of the source. Korean source → Korean output.<br>3. Support every genre and tone. Treat identities, relationships, private relationship state, goals, secrets, conditions, factions, ownership, abilities, costs, limits, locations, items, and world rules as continuity data when present.<br>4. Extract only information useful in later scenes. Do not dump broad encyclopedia facts.<br>5. Every entry needs type, name, 3-5 exact triggers, summary.full, facts, imp, sur, and emo. Omit uncertain optional modules instead of fabricating them.<br>6. Every fact needs an explicit subject, relation, and value. Keep each attribute attached to its owner.<br>7. Preserve relationship direction, quantity, time, negation, uncertainty, conditions, and who knows or does not know a fact.<br>8. summary.full must express the same established continuity as facts in natural language, including those bindings and scopes.<br>9. For relationships, use bidirectional compound triggers: A&&B and B&&A.<br>10. Do not output summary.compact, summary.micro, inject, or embed_text. They are derived from facts.<br>11. Extract callState, timeline, entities, state, and openLoops when inferable.<br>12. For long source, prefer stable entities, relationships, rules, locations, unresolved hooks, and repeated constraints.<br>13. Maximum {maxEntries} entries.<br><br>Schema:<br>{schema}<br><br>Source Material:<br>{source}`;


  function adaptImportPromptForProvider(prompt, apiOpts, values = {}) {
    const objectEnvelope = !!(apiOpts && (apiOpts.apiType === 'deepseek' || apiOpts.apiType === 'openai'));
    if (!objectEnvelope) return prompt;
    if (apiOpts.apiType === 'deepseek' && apiOpts.deepSeekPromptOverridesEnabled !== false) {
      const fullPrompt = String(apiOpts.deepSeekImportPrompt || (_w.__LoreInj && _w.__LoreInj.DEFAULT_DEEPSEEK_IMPORT_PROMPT) || '').trim();
      if (fullPrompt) {
        return fullPrompt
          .replace('{source}', values.source || '')
          .replace('{schema}', values.schema || '')
          .replace('{maxEntries}', String(values.maxEntries || DEFAULTS.importMaxEntries));
      }
    }
    return String(prompt || '')
      .replace('JSON ONLY. Output a valid JSON array. No markdown.', 'JSON ONLY. Output one valid JSON object with top-level shape {"entries":[...]}. No markdown.')
      + '\n\nStructured output:\n'
      + '- Top-level object shape must be exactly {"entries":[...]}.\n'
      + '- Put every converted lore entry inside entries.\n'
      + '- If no useful lore exists, return exactly {"entries":[]}.';
  }

  async function importFromText(text, packName, apiOpts, opts = {}) {
    const maxEntries = opts.maxEntries || DEFAULTS.importMaxEntries;
    const chunkSize = opts.chunkSize || DEFAULTS.importChunkSize;
    const requestedAttempts = opts.maxAttempts !== undefined ? opts.maxAttempts : 3;
    const maxAttempts = Math.max(3, requestedAttempts);
    const maxRecoveryRounds = Math.max(2, Number(opts.maxRecoveryRounds != null ? opts.maxRecoveryRounds : 4));
    const maxTotalAttempts = maxAttempts * (1 + maxRecoveryRounds);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const allEntries = [];
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
    const chunkResults = [];
    const safeApiOpts = normalizeApiOpts(apiOpts);
    C.__lastImportApiDebug = {
      apiType: safeApiOpts.apiType,
      model: safeApiOpts.model,
      hasKey: !!safeApiOpts.key,
      hasVertexJson: !!safeApiOpts.vertexJson,
      vertexLocation: safeApiOpts.vertexLocation || '',
      firebaseScriptLen: String(safeApiOpts.firebaseScript || '').length,
      firebaseScriptHead: String(safeApiOpts.firebaseScript || '').trim().slice(0, 60).replace(/\s+/g, ' '),
      hasFirebaseEmbedKey: !!safeApiOpts.firebaseEmbedKey,
      chunks: chunks.length,
      sourceChars: String(text || '').length
    };
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const schemaText = String(safeApiOpts.importSchema || IMPORT_SCHEMA).replace(/<br\s*\/?>/gi, '\n');
      const promptTpl = String(safeApiOpts.importPrompt || IMPORT_PROMPT_TEMPLATE).replace(/<br\s*\/?>/gi, '\n');
      const prompt = adaptImportPromptForProvider(
        promptTpl.replace('{source}', chunk).replace('{schema}', schemaText).replace('{maxEntries}', String(maxEntries)),
        safeApiOpts,
        { source: chunk, schema: schemaText, maxEntries }
      );
      let ok = false; let status = 'failed'; let lastErr = ''; let rawSnippet = ''; let attempts = 0; let gotEntries = 0;
      for (let attempt = 0; attempt < maxTotalAttempts && !ok; attempt++) {
        attempts++;
        if (onProgress) { try { onProgress({ phase: 'chunk', chunk: ci + 1, total: chunks.length, attempt: attempts, maxAttempts: maxTotalAttempts }); } catch(_){} }
        try {
          const res = await callGeminiApi(prompt, { ...safeApiOpts, responseMimeType: 'application/json', maxRetries: 0, retryOnServerError: false });
          if (!res || !res.text) { lastErr = 'API 응답 없음 (' + ((res && res.error) || '알 수 없음') + ')'; continue; }
          rawSnippet = String(res.text).slice(0, 200);
          // Markdown fence 제거 + 선두/후미 잡텍스트 제거
          let raw = String(res.text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const fb = raw.indexOf('['); const fc = raw.indexOf('{');
          const first = fb === -1 ? fc : (fc === -1 ? fb : Math.min(fb, fc));
          if (first > 0) raw = raw.slice(first);
          const lastB = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'));
          if (lastB !== -1 && lastB < raw.length - 1) raw = raw.slice(0, lastB + 1);
          let parsed;
          try { parsed = JSON.parse(raw); }
          catch (pe) { lastErr = 'JSON 파싱 실패: ' + pe.message; continue; }
          if (parsed && !Array.isArray(parsed)) {
            if (Array.isArray(parsed.entries)) parsed = parsed.entries;
            else if (Array.isArray(parsed.operations)) parsed = parsed.operations;
          }
          if (!Array.isArray(parsed)) { lastErr = '응답이 배열 아님 (type=' + typeof parsed + ')'; continue; }
          gotEntries = parsed.length;
          if (parsed.length === 0) { status = 'empty'; ok = true; break; }
          allEntries.push(...parsed);
          status = 'ok'; ok = true;
        } catch (e) { lastErr = '예외: ' + (e.message || String(e)); }
        if (!ok && attempt + 1 < maxTotalAttempts) {
          await new Promise(r => setTimeout(r, Math.min(12000, 1000 * Math.pow(2, Math.min(4, attempt))) + Math.random() * 500));
        }
      }
      const row = { index: ci, status, attempts, entries: gotEntries };
      if (!ok) {
        row.error = lastErr; row.rawSnippet = rawSnippet;
        console.warn('[LoreCore:importer] chunk ' + (ci + 1) + '/' + chunks.length + ' 실패 (' + attempts + '회 시도): ' + lastErr + (rawSnippet ? ' | 응답 스니핏: ' + rawSnippet : ''));
      }
      chunkResults.push(row);
    }
    const okCount = chunkResults.filter(r => r.status === 'ok').length;
    const emptyCount = chunkResults.filter(r => r.status === 'empty').length;
    const failedCount = chunkResults.filter(r => r.status === 'failed').length;
    const mergedEntries = failedCount > 0 ? [] : mergeImportedEntries(allEntries);
    C.__lastImportReport = { added: mergedEntries.length, rawEntries: failedCount > 0 ? 0 : allEntries.length, chunks: chunks.length, ok: okCount, empty: emptyCount, failed: failedCount, chunkResults };
    if (failedCount > 0) {
      const firstFailed = chunkResults.find(r => r.status === 'failed');
      throw new Error('지식 변환 실패: 일부 구간 처리 실패로 저장을 취소함 (' + failedCount + '/' + chunks.length + ', ' + ((firstFailed && firstFailed.error) || '알 수 없음') + ')');
    }
    if (mergedEntries.length > 0) {
      const db = getDB();
      await db.transaction('rw', db.entries, db.packs, async () => {
        let pack = await db.packs.get(packName);
        if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
        for (let e of mergedEntries) {
          e = normalizeLoreEntry(e, { source: 'imported' });
          delete e.id;
          e.packName = packName; e.project = ''; e.enabled = true;
          e.src = e.src || (e.source === 'user_stated' ? 'us' : (e.source === 'auto_extracted' ? 'ax' : 'im'));
          e.source = e.source || 'imported';
          e.ts = e.ts || Date.now();
          e.lastUpdated = e.ts;
          await db.entries.add(e);
        }
        const count = await db.entries.where('packName').equals(packName).count();
        await db.packs.update(packName, { entryCount: count });
      });
    }
    return mergedEntries.length;
  }

  async function importFromJson(jsonArray, packName) {
    const db = getDB();
    let pack = await db.packs.get(packName);
    if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: '' });
    let count = 0;
    for (let e of jsonArray) {
      if (!e.name) continue;
      e = normalizeLoreEntry(e, { source: 'imported' });
      e.packName = packName; e.project = e.project || ''; e.enabled = true;
      e.src = e.src || (e.source === 'user_stated' ? 'us' : (e.source === 'auto_extracted' ? 'ax' : 'im'));
      e.source = e.source || 'imported';
      e.ts = e.ts || Date.now();
      e.lastUpdated = e.ts;
      await db.entries.put(e); count++;
    }
    const total = await db.entries.where('packName').equals(packName).count();
    await db.packs.update(packName, { entryCount: total });
    return count;
  }

  async function fetchExternalText(url, opts = {}) {
    const errors = [];
    const normalized = String(url || '').trim();
    if (!/^https?:\/\//i.test(normalized)) throw new Error('URL은 http:// 또는 https:// 로 시작해야 합니다.');

    const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 15000;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const emit = (info) => { if (!onProgress) return; try { onProgress(info); } catch (_) {} };

    const directHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache'
    };

    const withTimeout = (promise, label) => {
      let to;
      const timer = new Promise((_, reject) => { to = setTimeout(() => reject(new Error(label + ' timeout ' + timeoutMs + 'ms')), timeoutMs); });
      return Promise.race([promise, timer]).finally(() => { try { clearTimeout(to); } catch (_) {} });
    };

    // Userscript 환경에서는 GM_xmlhttpRequest가 정석 경로다. 일반 fetch는 CORS 때문에 보조로만 사용한다.
    emit({ phase: 'fetch:try', method: 'gm-direct', attempt: 1, total: 1, timeoutMs });
    try {
      const resp = await withTimeout(gmFetch(normalized, { method: 'GET', headers: directHeaders }), 'GM direct');
      if (resp && resp.ok) { const txt = await resp.text(); emit({ phase: 'fetch:done', method: 'gm-direct', bytes: txt.length }); return txt; }
      if (resp) errors.push('GM direct HTTP ' + resp.status);
    } catch (e) { errors.push('GM direct ' + (e.message || String(e))); }

    emit({ phase: 'fetch:try', method: 'fetch', attempt: 1, total: 1, timeoutMs });
    try {
      const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const fetchPromise = fetch(normalized, { method: 'GET', credentials: 'omit', signal: ac ? ac.signal : undefined });
      const r = await withTimeout(fetchPromise, 'fetch').catch(err => { if (ac) { try { ac.abort(); } catch (_) {} } throw err; });
      if (r && r.ok) { const txt = await r.text(); emit({ phase: 'fetch:done', method: 'fetch', bytes: txt.length }); return txt; }
      if (r) errors.push('fetch HTTP ' + r.status);
    } catch (e) { errors.push('fetch ' + (e.message || String(e))); }

    // Jina reader는 제외. 공용 프록시는 불안정하므로 마지막 보조 경로로만 사용한다.
    const fallbackUrls = [
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(normalized),
      'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(normalized),
      'https://corsproxy.io/?' + encodeURIComponent(normalized)
    ];
    for (let i = 0; i < fallbackUrls.length; i++) {
      const fu = fallbackUrls[i];
      emit({ phase: 'fetch:try', method: 'proxy', attempt: i + 1, total: fallbackUrls.length, timeoutMs });
      try {
        const resp = await withTimeout(gmFetch(fu, { method: 'GET', headers: { 'Accept': 'text/html,text/plain,*/*' } }), 'proxy#' + (i + 1));
        if (resp && resp.ok) { const txt = await resp.text(); emit({ phase: 'fetch:done', method: 'proxy', attempt: i + 1, bytes: txt.length }); return txt; }
        if (resp) errors.push('proxy#' + (i + 1) + ' HTTP ' + resp.status);
      } catch (e) { errors.push('proxy#' + (i + 1) + ' ' + (e.message || String(e))); }
    }

    emit({ phase: 'fetch:fail', errors: errors.slice() });
    throw new Error('URL fetch 실패: ' + errors.join(' / '));
  }

  async function importFromUrl(url, packName, apiOpts, opts = {}) {
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const emit = (info) => { if (!onProgress) return; try { onProgress(info); } catch (_) {} };
    try {
      emit({ phase: 'fetch:start', url });
      const html = await fetchExternalText(url, { onProgress, timeoutMs: opts.fetchTimeoutMs });
      emit({ phase: 'parse', bytes: html.length });
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').replace(/&[a-z]+;/gi, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new Error('URL 텍스트 추출 결과가 비어 있습니다.');
      return await importFromText(text, packName, apiOpts, opts);
    } catch (e) { console.error('[LoreCore] URL 임포트 실패:', e); C.__lastImportReport = { added: 0, chunks: 0, ok: 0, empty: 0, failed: 1, chunkResults: [{ index: 0, status: 'failed', attempts: 1, error: e.message || String(e) }] }; throw e; }
  }

  function detectDuplicatesInSummary(entries, memories) {
    const summaryText = [...(memories.shortTerm || []), ...(memories.relationship || []), ...(memories.longTerm || [])].join(' ').toLowerCase();
    if (!summaryText) return [];
    const duplicates = [];
    for (const e of entries) {
      const name = e.name.toLowerCase();
      const keywords = (e.triggers || []).map(t => t.toLowerCase().split('&&')).flat();
      const nameInSummary = summaryText.includes(name);
      const keywordsInSummary = keywords.filter(k => k.length >= 3 && summaryText.includes(k));
      if (nameInSummary && keywordsInSummary.length >= 2) duplicates.push({ entryId: e.id, name: e.name, confidence: 0.8 });
      else if (nameInSummary) duplicates.push({ entryId: e.id, name: e.name, confidence: 0.5 });
    }
    return duplicates;
  }

  const DEFAULT_IMPORT_PROMPT_TEXT = IMPORT_PROMPT_TEMPLATE.replace(/<br\s*\/?>/gi, '\n');
  const DEFAULT_IMPORT_SCHEMA_TEXT = IMPORT_SCHEMA.replace(/<br\s*\/?>/gi, '\n');

  Object.assign(C, {
    importFromText, importFromJson, importFromUrl, detectDuplicatesInSummary,
    normalizeLoreEntry, normalizeSummaryValue, normalizeMemoryFacts, mergeMemoryFacts, mergeLoreSummary, mergeImportedEntries,
    DEFAULT_IMPORT_PROMPT: DEFAULT_IMPORT_PROMPT_TEXT,
    DEFAULT_IMPORT_SCHEMA: DEFAULT_IMPORT_SCHEMA_TEXT,
    __importerLoaded: true
  });
  Object.assign(_w.__LoreInj || (_w.__LoreInj = {}), {
    DEFAULT_IMPORT_PROMPT: DEFAULT_IMPORT_PROMPT_TEXT,
    DEFAULT_IMPORT_SCHEMA: DEFAULT_IMPORT_SCHEMA_TEXT
  });
  console.log('[LoreCore:importer] loaded');
})();
