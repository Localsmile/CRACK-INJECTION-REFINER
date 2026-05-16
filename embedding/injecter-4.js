// == 인젝터 모듈 4/6 — 추출 파이프라인 ==
// mergeExtractedData, runAutoExtract, _doExtract, extBadge watchdog
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:4] settings 미로드'); return; }
  if (_w.__LoreInj.__extractLoaded) return;

  const {
    C, db, _ls, settings,
    parseJsonLoose, createSnapshot,
    getChatKey, getTurnCounter,
    getAutoExtPackForUrl,
    addExtLog, setPackEnabled,
    DEFAULT_AUTO_EXTRACT_SCHEMA,
    DEFAULT_AUTO_EXTRACT_PATCH_SCHEMA,
    DEFAULT_TEMPORAL_EXTRACT_PROMPT,
    DEFAULT_TEMPORAL_EXTRACT_SCHEMA
  } = _w.__LoreInj;

  // v1.4.0-test.56: patch ON/OFF must not change the DB context payload. Only output instructions differ.
  const OUTPUT_MODE_PATCH = `OUTPUT MODE: SAVE ONLY CHANGES
- Existing entries are provided as compact digests with stable "id".
- For an existing entry, do NOT re-output the full object.
- Output {"op":"patch","id":...} only when something changed.
- For unchanged existing entries, output nothing.
- If nothing changed at all, return exactly [].
- For brand-new lore, output {"op":"add","entry":{...}}.
- Do not repeat unchanged summary.full.
- Prefer set.state only if state changed.
- Prefer append.eventHistory for new concrete events.
- Prefer append.triggers for new literal aliases.
- If summary.full is unavoidable, keep it under 220 chars.
- Anchored entries: only append new triggers/eventHistory/callHistory.`;

  const OUTPUT_MODE_FULL = `OUTPUT MODE: FULL UPDATED ENTRIES
- Existing entries are provided as compact digests with stable "id".
- For each NEW lore, output the complete entry object.
- For each UPDATED existing entry, output the complete updated entry object and keep the same "name" when possible.
- Do NOT use add/patch op format in this mode.
- For unchanged existing entries, output nothing.
- Anchored entries: only append new triggers and eventHistory.`;

  const UNIFIED_EXTRACT_SCHEMA = `${DEFAULT_AUTO_EXTRACT_SCHEMA}

Patch-mode alternative when OUTPUT MODE asks for SAVE ONLY CHANGES:
${DEFAULT_AUTO_EXTRACT_PATCH_SCHEMA || '[]'}`;

  const TEMPORAL_OUTPUT_MODE_PATCH = `OUTPUT MODE: SAVE ONLY CHANGES
- Existing important scene memories are provided as compact digests with stable "id".
- For an existing scene memory, do NOT re-output the full object.
- Output {"op":"patch","id":...} only when something changed.
- For unchanged existing scene memories, output nothing.
- If nothing changed at all, return exactly [].
- For brand-new important scenes, output {"op":"add","entry":{...}}.
- If the conversation only repeats already stored scene memories, output [].
- Keep patch fields tiny: prefer append.hooks, append.recallTriggers, append.actions, or set.summary.compact/micro only when changed.`;

  const TEMPORAL_OUTPUT_MODE_FULL = `OUTPUT MODE: FULL UPDATED SCENE MEMORIES
- Existing important scene memories are provided as compact digests with stable "id".
- For each NEW important scene, output the complete timeline_event object.
- For each UPDATED existing scene, output the complete updated timeline_event object and keep the same "name" when possible.
- Do NOT use add/patch op format in this mode.
- For unchanged existing scene memories, output nothing.
- If the conversation only repeats already stored scene memories, output [].`;

  const TEMPORAL_PATCH_SCHEMA = `[
  {
    "op": "add",
    "entry": {
      "type": "timeline_event",
      "title": "Short event title",
      "name": "Stable recall handle",
      "when": {"turnStart": 0, "turnEnd": 0, "relative": "past|current|foreshadow", "anchor": "scene/time anchor", "confidence": 0.8},
      "participants": [],
      "location": "",
      "actions": [],
      "summary": {"full": "self-contained event memory", "compact": "event + consequence + hook", "micro": "handle=current meaning"},
      "hooks": [],
      "linkedLore": [],
      "recallTriggers": [],
      "importance": 8,
      "emotional": 8,
      "confidence": 0.8
    }
  },
  {
    "op": "patch",
    "id": 0,
    "reason": "short reason",
    "set": {
      "title": "",
      "name": "",
      "when": {},
      "location": "",
      "summary": {"compact": "", "micro": ""}
    },
    "append": {
      "participants": [],
      "actions": [],
      "hooks": [],
      "linkedLore": [],
      "recallTriggers": []
    }
  }
]`;

  function normalizeEntryForMerge(entry, turn) {
    if (C.normalizeLoreEntry) return C.normalizeLoreEntry(entry, { turn, source: 'auto_extracted' });
    return entry;
  }

  function mergeArrayUnique(a, b) {
    return Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean)));
  }

  function mergeCallState(existing, incoming) {
    if (!incoming || typeof incoming !== 'object') return existing;
    const base = existing && typeof existing === 'object' ? JSON.parse(JSON.stringify(existing)) : {};
    for (const [k, v] of Object.entries(incoming)) {
      if (!base[k]) base[k] = v;
      else if (typeof base[k] === 'object' && typeof v === 'object') base[k] = { ...base[k], ...v };
      else base[k] = v;
    }
    return base;
  }

  function mergeInject(existing, incoming, name, state) {
    if (!incoming || typeof incoming !== 'object') return existing;
    const base = existing && typeof existing === 'object' ? JSON.parse(JSON.stringify(existing)) : {};
    const merged = C.mergeLoreSummary ? C.mergeLoreSummary(base, incoming, name, state) : null;
    return {
      full: merged ? merged.full : (incoming.full || base.full || ''),
      compact: merged ? merged.compact : (incoming.compact || base.compact || ''),
      micro: incoming.micro || base.micro || ''
    };
  }

  function selectExistingForContext(entries, context, limit) {
    const ctx = String(context || '').toLowerCase();
    const lim = limit || 50;
    const scoreOne = (e) => {
      let s = 0;
      const name = String(e.name || '').toLowerCase();
      const hay = [
        e.name,
        ...(e.triggers || []),
        e.embed_text || '',
        ...(e.entities || []),
        ...(e.parties || []),
        ...((e.detail && e.detail.parties) || [])
      ].join(' ').toLowerCase();
      if (name && ctx.includes(name)) s += 120;
      for (const t of (e.triggers || [])) {
        if (!t || t.length < 2) continue;
        const parts = String(t).split('&&').map(p => p.trim().toLowerCase()).filter(Boolean);
        if (parts.length && parts.every(p => ctx.includes(p))) { s += parts.length > 1 ? 80 : 30; break; }
      }
      if (e.anchor) s += 100;
      if (e.isCurrentArc) s += 60;
      if (e.type === 'rel' || e.type === 'relationship' || e.type === 'prom' || e.type === 'promise') s += 30;
      s += (e.imp || 5) + (e.emo || 0) + (e.sur || 0);
      if (e.lastUpdated) s += Math.max(0, 30 - Math.floor((Date.now() - e.lastUpdated) / 86400000));
      if (hay && ctx && hay.split(/\s+/).some(w => w.length >= 2 && ctx.includes(w))) s += 10;
      return s;
    };
    return [...(entries || [])].map(e => ({ e, s: scoreOne(e) })).sort((a,b) => b.s - a.s).slice(0, lim).map(x => x.e);
  }

  function entryDigestForExtract(e) {
    const summary = e.summary && typeof e.summary === 'object'
      ? { compact: e.summary.compact || e.summary.full || '', micro: e.summary.micro || '' }
      : { compact: String(e.summary || e.inject?.compact || '').slice(0, 180), micro: '' };
    const out = {
      id: e.id,
      type: e.type,
      name: e.name,
      state: e.state || e.detail?.status || e.detail?.current_status || '',
      triggers: (e.triggers || []).slice(0, 6),
      summary,
      entities: (e.entities || e.parties || e.detail?.parties || []).slice(0, 8),
      anchor: e.anchor === true ? true : undefined
    };
    if (e.callState) out.callState = e.callState;
    if (Array.isArray(e.eventHistory) && e.eventHistory.length) out.eventHistoryTail = e.eventHistory.slice(-3);
    if (e.type === 'prom' || e.type === 'promise') out.cond = e.cond || e.detail?.condition || '';
    return out;
  }

  function buildExistingLoreContext(entries, context, limit) {
    const selected = selectExistingForContext(entries, context, limit || 20);
    return JSON.stringify(selected.map(entryDigestForExtract), null, 2);
  }

  function normKey(v) {
    return String(v || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function arrOverlapScore(a, b) {
    const aa = new Set((Array.isArray(a) ? a : []).map(normKey).filter(Boolean));
    const bb = new Set((Array.isArray(b) ? b : []).map(normKey).filter(Boolean));
    let n = 0;
    for (const x of aa) if (bb.has(x)) n++;
    return n;
  }

  function stableForCompare(v) {
    if (Array.isArray(v)) return v.map(stableForCompare);
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).sort().forEach(k => {
        if (['id', 'ts', 'lastUpdated', 'lastMigrationAt', 'localMigrationVersion', 'migratedFromVersion', 'gateScore'].includes(k)) return;
        if (k.startsWith('_')) return;
        out[k] = stableForCompare(v[k]);
      });
      return out;
    }
    return v;
  }

  function entryContentSignature(entry) {
    try { return JSON.stringify(stableForCompare(entry || {})); }
    catch (_) { return String(entry && entry.name || '') + '|' + String(entry && entry.type || ''); }
  }

  function entryParties(e) {
    let parties = e.parties || e.entities || e.detail?.parties || [];
    if ((!Array.isArray(parties) || parties.length < 2) && typeof e.name === 'string') {
      if (e.name.includes('↔')) parties = e.name.split('↔').map(s => s.trim()).filter(Boolean);
      else if (e.name.includes('&')) parties = e.name.split('&').map(s => s.trim()).filter(Boolean);
    }
    return Array.isArray(parties) ? parties : [];
  }

  async function findExistingForIncoming(packName, e) {
    const TL_TYPE_MERGE = C.TIMELINE_EVENT_TYPE || 'timeline_event';
    if (!e || !e.name) return null;
    if (e.id != null) {
      const byId = await db.entries.get(e.id);
      if (byId && byId.packName === packName) return byId;
    }
    if (e.type === TL_TYPE_MERGE) return null;
    const candidates = await db.entries.where('packName').equals(packName).and(x => x.type !== TL_TYPE_MERGE).toArray();
    const nName = normKey(e.name);
    const nType = normKey(e.type);
    const eTriggers = e.triggers || [];
    const eEntities = e.entities || e.parties || e.detail?.parties || [];
    const eParties = entryParties(e).map(normKey).sort().join('|');
    let best = null, bestScore = 0;
    for (const x of candidates) {
      const sameType = normKey(x.type) === nType || (['rel','relationship'].includes(nType) && ['rel','relationship'].includes(normKey(x.type))) || (['prom','promise'].includes(nType) && ['prom','promise'].includes(normKey(x.type)));
      if (!sameType) continue;
      let score = 0;
      if (normKey(x.name) === nName) score += 100;
      const xParties = entryParties(x).map(normKey).sort().join('|');
      if (eParties && xParties && eParties === xParties) score += 90;
      score += arrOverlapScore(eTriggers, x.triggers) * 30;
      score += arrOverlapScore(eEntities, x.entities || x.parties || x.detail?.parties) * 20;
      if (nName && (normKey(x.name).includes(nName) || nName.includes(normKey(x.name)))) score += 25;
      if (score > bestScore) { bestScore = score; best = x; }
    }
    return bestScore >= 60 ? best : null;
  }

  function hasMeaningfulPatchModeFullUpdate(existing, incoming) {
    if (!existing || !incoming) return true;
    const newTriggers = arrOverlapScore(incoming.triggers || [], existing.triggers || []) < (incoming.triggers || []).filter(Boolean).length;
    const newEntities = arrOverlapScore(incoming.entities || incoming.parties || incoming.detail?.parties || [], existing.entities || existing.parties || existing.detail?.parties || []) < (incoming.entities || incoming.parties || incoming.detail?.parties || []).filter(Boolean).length;
    const oldState = existing.state || existing.detail?.current_status || existing.detail?.status || existing.detail?.current_state || '';
    const newState = incoming.state || incoming.detail?.current_status || incoming.detail?.status || incoming.detail?.current_state || '';
    if (newState && normKey(newState) !== normKey(oldState)) return true;
    if (incoming.cond !== undefined && normKey(incoming.cond) !== normKey(existing.cond)) return true;
    if (newTriggers || newEntities) return true;
    if (Array.isArray(incoming.callDelta) && incoming.callDelta.length) return true;
    if (Array.isArray(incoming.eventHistory) && incoming.eventHistory.some(ev => {
      const s = String(ev && ev.summary || '').trim();
      return s && !(existing.eventHistory || []).some(x => String(x && x.summary || '').trim() === s);
    })) return true;
    return false;
  }

  function hasMeaningfulTemporalFullUpdate(existing, incoming) {
    if (!existing || !incoming) return true;
    if (incoming.location && normKey(incoming.location) !== normKey(existing.location)) return true;
    const keys = ['participants', 'actions', 'hooks', 'linkedLore', 'recallTriggers'];
    for (const k of keys) {
      const arr = incoming[k] || [];
      if (Array.isArray(arr) && arr.length && arrOverlapScore(arr, existing[k] || []) < arr.filter(Boolean).length) return true;
    }
    const oldAnchor = existing.when?.anchor || '';
    const newAnchor = incoming.when?.anchor || '';
    if (newAnchor && normKey(newAnchor) !== normKey(oldAnchor)) return true;
    return false;
  }

  async function applyExtractPatchOp(op, packName, chatKey) {
    if (!op || op.op !== 'patch' || op.id == null) return 0;
    let existing = await db.entries.get(op.id);
    if (!existing || existing.packName !== packName) return 0;
    const beforeSig = entryContentSignature(existing);

    const anchorGuard = existing.anchor === true;
    try { if (C.saveEntryVersion) await C.saveEntryVersion(existing, 'extract_patch'); } catch (_) {}

    const set = anchorGuard ? {} : (op.set || {});
    const append = op.append || {};

    if (set.state !== undefined) existing.state = set.state;
    if (set.cond !== undefined) existing.cond = set.cond;
    if (set.summary) existing.summary = C.mergeLoreSummary
      ? C.mergeLoreSummary(existing.summary, set.summary, existing.name, set.state || existing.state)
      : { ...(existing.summary || {}), ...set.summary };
    if (set.inject) existing.inject = mergeInject(existing.inject, set.inject, existing.name, set.state || existing.state);
    if (set.callState) existing.callState = mergeCallState(existing.callState, set.callState);
    if (set.timeline) existing.timeline = { ...(existing.timeline || {}), ...set.timeline };
    if (Array.isArray(set.entities)) existing.entities = mergeArrayUnique(existing.entities, set.entities);
    if (set.detail && typeof set.detail === 'object') existing.detail = { ...(existing.detail || {}), ...set.detail };

    if (Array.isArray(append.triggers) && append.triggers.length) {
      existing.triggers = Array.from(new Set([...(existing.triggers || []), ...append.triggers].filter(Boolean)));
    }

    if (Array.isArray(append.eventHistory) && append.eventHistory.length) {
      existing.eventHistory = existing.eventHistory || [];
      for (const ev of append.eventHistory) {
        if (!ev || !ev.summary) continue;
        const norm = String(ev.summary).trim();
        if (!norm || existing.eventHistory.some(x => x.summary === norm)) continue;
        existing.eventHistory.push({
          turn: ev.turn || getTurnCounter(chatKey),
          summary: norm,
          imp: ev.imp || 5,
          emo: ev.emo || 5,
          ts: Date.now()
        });
      }
      existing.eventHistory.sort((a, b) => (a.turn || 0) - (b.turn || 0));
      if (existing.eventHistory.length > 30) existing.eventHistory = existing.eventHistory.slice(-30);
    }

    if (Array.isArray(append.callHistory) && append.callHistory.length) {
      existing.callHistory = existing.callHistory || [];
      for (const h of append.callHistory) {
        if (!h || !h.from || !h.to || !h.term) continue;
        existing.callHistory.push({
          turn: h.turn || getTurnCounter(chatKey),
          from: h.from,
          to: h.to,
          term: h.term,
          prevTerm: h.prevTerm || null,
          ts: Date.now()
        });
      }
      if (existing.callHistory.length > 30) existing.callHistory = existing.callHistory.slice(-30);
    }

    existing.lastUpdated = Date.now();
    try { if (C.normalizeTemporalGraph) existing = C.normalizeTemporalGraph(existing, { currentTurn: getTurnCounter(chatKey), sceneId: chatKey }); } catch (_) {}
    if (entryContentSignature(existing) === beforeSig) return 0;
    try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(existing.id); } catch (_) {}
    await db.entries.put(existing);
    return 1;
  }

  async function applyTemporalPatchOp(op, packName, chatKey) {
    if (!op || op.op !== 'patch' || op.id == null) return 0;
    let existing = await db.entries.get(op.id);
    const TL_TYPE = C.TIMELINE_EVENT_TYPE || 'timeline_event';
    if (!existing || existing.packName !== packName || existing.type !== TL_TYPE) return 0;
    const beforeSig = entryContentSignature(existing);

    try { if (C.saveEntryVersion) await C.saveEntryVersion(existing, 'temporal_patch'); } catch (_) {}
    const set = op.set || {};
    const append = op.append || {};

    if (set.title !== undefined) existing.title = set.title;
    if (set.name !== undefined) existing.name = set.name;
    if (set.when && typeof set.when === 'object') existing.when = { ...(existing.when || {}), ...set.when };
    if (set.location !== undefined) existing.location = set.location;
    if (set.summary) existing.summary = C.mergeLoreSummary
      ? C.mergeLoreSummary(existing.summary, set.summary, existing.name)
      : { ...(existing.summary || {}), ...set.summary };

    const appendArr = (key) => {
      if (Array.isArray(append[key]) && append[key].length) {
        existing[key] = mergeArrayUnique(existing[key], append[key]);
      }
    };
    appendArr('participants');
    appendArr('actions');
    appendArr('hooks');
    appendArr('linkedLore');
    appendArr('recallTriggers');
    if (Array.isArray(append.recallTriggers) && append.recallTriggers.length) {
      existing.triggers = mergeArrayUnique(existing.triggers, append.recallTriggers);
    }

    existing.lastUpdated = Date.now();
    try { if (C.normalizeTemporalGraph) existing = C.normalizeTemporalGraph(existing, { currentTurn: getTurnCounter(chatKey), sceneId: chatKey }); } catch (_) {}
    if (entryContentSignature(existing) === beforeSig) return 0;
    try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(existing.id); } catch (_) {}
    await db.entries.put(existing);
    return 1;
  }

  function normalizeExtractItems(entries) {
    if (entries && !Array.isArray(entries) && Array.isArray(entries.entries)) return entries.entries;
    if (entries && !Array.isArray(entries) && Array.isArray(entries.items)) return entries.items;
    return Array.isArray(entries) ? entries : [];
  }

  function normalizeTemporalCandidates(parsed, limit) {
    let arr = parsed;
    if (arr && !Array.isArray(arr) && Array.isArray(arr.events)) arr = arr.events;
    if (arr && !Array.isArray(arr) && Array.isArray(arr.entries)) arr = arr.entries;
    if (!Array.isArray(arr)) return [];
    const max = Math.max(1, limit || 5);
    const clamp10 = (v, fb) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fb;
      return Math.max(1, Math.min(10, Math.round(n)));
    };
    return arr
      .filter(e => e && typeof e === 'object')
      .filter(e => e.op !== 'patch')
      .map(e => {
        const raw = (e.op === 'add' && e.entry) ? e.entry : e;
        const title = raw.title || raw.name || raw.summary?.micro || raw.summary?.compact || 'timeline event';
        // Phase 11 gate compatibility: derive imp/emo/sur from importance/emotional/surprise/confidence so timeline events pass mergeExtractedData gating.
        const impBase = raw.imp != null ? raw.imp : raw.importance;
        const emoBase = raw.emo != null ? raw.emo : raw.emotional;
        const surBase = raw.sur != null ? raw.sur : (raw.surprise != null ? raw.surprise : (raw.confidence != null ? Number(raw.confidence) * 10 : null));
        const imp = clamp10(impBase, 6);
        const emo = clamp10(emoBase, 5);
        const sur = clamp10(surBase, 6);
        return {
          ...raw,
          type: C.TIMELINE_EVENT_TYPE || 'timeline_event',
          title,
          name: raw.name || title,
          imp, emo, sur,
          gs: imp + emo + sur,
          source: raw.source || 'temporal_extracted'
        };
      })
      .filter(e => e.name)
      .slice(0, max);
  }

  function temporalDigestForExtract(e) {
    const summary = e.summary && typeof e.summary === 'object'
      ? { compact: e.summary.compact || e.summary.full || '', micro: e.summary.micro || '' }
      : { compact: String(e.summary || '').slice(0, 180), micro: '' };
    return {
      id: e.id,
      eventId: e.eventId,
      title: e.title || e.name,
      name: e.name,
      when: e.when ? { anchor: e.when.anchor || '', relative: e.when.relative || '', turnStart: e.when.turnStart || e.timeline?.eventTurn || 0 } : undefined,
      participants: (e.participants || e.entities || []).slice(0, 8),
      location: e.location || '',
      actions: (e.actions || []).slice(0, 6),
      hooks: (e.hooks || []).slice(0, 6),
      recallTriggers: (e.recallTriggers || e.triggers || []).slice(0, 8),
      summary
    };
  }

  function injectTemporalExistingBlock(prompt, existingText, outputModeText) {
    const block = `${outputModeText || ''}

Existing Important Scene Memories:
${existingText}

DEDUP RULE:
- Output [] if the conversation only repeats or overlaps with the existing memories above.
- Do not restate, rename, or re-summarize an existing memory.
- Output only genuinely new important scene memories not already covered above.
`;
    const marker = '\nConversation Log:';
    const idx = prompt.indexOf(marker);
    if (idx >= 0) return prompt.slice(0, idx) + '\n' + block + prompt.slice(idx);
    return prompt + '\n\n' + block;
  }

  async function runTemporalExtractPass(opts = {}) {
    if (settings.config.temporalExtractEnabled === false) return { count: 0, skipped: true };
    const context = opts.context || '';
    const apiOpts = opts.apiOpts || {};
    const url = opts.url || C.getCurUrl();
    const chatKey = opts.chatKey || getChatKey();
    const isManual = !!opts.isManual;
    const msgCount = opts.msgCount || 0;
    const promptTpl = settings.config.temporalExtractPrompt || DEFAULT_TEMPORAL_EXTRACT_PROMPT;
    const baseTemporalSchema = settings.config.temporalExtractSchema || DEFAULT_TEMPORAL_EXTRACT_SCHEMA;
    const schema = `${baseTemporalSchema}

Patch-mode alternative when OUTPUT MODE asks for SAVE ONLY CHANGES:
${TEMPORAL_PATCH_SCHEMA}`;
    if (!promptTpl || !schema || !context) return { count: 0, skipped: true };

    const _tmpModel = (apiOpts && apiOpts.model) || null;
    let apiLog = null, _tmpElapsedMs = 0, _tmpCost = null;
    try {
      const packName = await getAutoExtPackForUrl(url);
      const _patchOn = settings.config.autoExtIncludeDb && settings.config.autoExtPatchMode !== false;
      let existingTemporalText = '[]';
      try {
        const TL_TYPE = C.TIMELINE_EVENT_TYPE || 'timeline_event';
        const existingTemporal = await db.entries.where('packName').equals(packName).and(e => e.type === TL_TYPE).toArray();
        if (existingTemporal.length) {
          existingTemporal.sort((a, b) => (b.lastUpdated || b.ts || 0) - (a.lastUpdated || a.ts || 0));
          existingTemporalText = JSON.stringify(existingTemporal.slice(0, 30).map(temporalDigestForExtract), null, 2);
        }
      } catch (_) {}

      const outputModeText = _patchOn ? TEMPORAL_OUTPUT_MODE_PATCH : TEMPORAL_OUTPUT_MODE_FULL;
      const prompt = injectTemporalExistingBlock(promptTpl.replace('{context}', context).replace('{schema}', schema), existingTemporalText, outputModeText);
      const _tmpT0 = Date.now();
      // v1.4.0-test.41 (B20 fix): 시간축 추출 패스는 'autoExtract'가 아닌 별도 feature로 기록. 이전에는 _doExtract의 apiOpts.costContext가 그대로 전달돼 자동추출 비용과 잡혀 분석 증감.
      const res = await C.callGeminiApi(prompt, { ...apiOpts, responseMimeType: 'application/json', maxRetries: 1, timeoutMs: 120000, maxOutputTokens: _patchOn ? 1024 : null, costContext: { feature: 'temporalExtract', chatKey: chatKey || 'global' } });
      _tmpElapsedMs = Date.now() - _tmpT0;
      _tmpCost = (res && res.cost) || null;
      apiLog = { status: res.status, error: res.error, retries: res.retries };
      if (!res.text) throw new Error('시간축 AI 응답없음 (' + (res.error || '알수없음') + ')');
      const parsed = parseJsonLoose(res.text);
      let patchedCount = 0;
      for (const item of normalizeExtractItems(parsed)) {
        if (item && item.op === 'patch') patchedCount += await applyTemporalPatchOp(item, packName, chatKey);
      }
      const events = normalizeTemporalCandidates(parsed, settings.config.temporalMaxEventsPerPass || 5);
      if (!events.length && patchedCount <= 0) {
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: msgCount, isManual, status: '시간축 추출 내용 없음', api: apiLog, model: _tmpModel, elapsedMs: _tmpElapsedMs, cost: _tmpCost });
        return { count: 0, empty: true };
      }
      const addCount = events.length ? await mergeExtractedData(events, url) : 0;
      const count = patchedCount + addCount;
      let embedMsg = '';
      let embedCount = 0;
      if (count > 0 && settings.config.embeddingEnabled && settings.config.autoEmbedOnExtract !== false) {
        try {
          const epName = await getAutoExtPackForUrl(url);
          extBadgeShow('에리가 시간축 임베딩 갱신 중');
          const embedOpts = { ...apiOpts, model: settings.config.embeddingModel || 'gemini-embedding-001' };
          embedCount = await C.embedPack(epName, embedOpts);
          embedMsg = ' / 임베딩 ' + embedCount + '개 완료';
        } catch(embErr) {
          console.warn('[Lore] 시간축 자동임베딩 실패:', embErr.message);
          embedMsg = ' / 임베딩 실패';
        }
      }
      addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count, msgs: msgCount, isManual, status: '시간축 추출 성공' + embedMsg, api: apiLog, model: _tmpModel, elapsedMs: _tmpElapsedMs, cost: _tmpCost });
      return { count, events };
    } catch (err) {
      console.warn('[Lore:temporal] 추출 실패:', err);
      addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: msgCount, isManual, status: '시간축 추출 실패', error: err.message || String(err), api: apiLog, model: _tmpModel, elapsedMs: _tmpElapsedMs, cost: _tmpCost });
      return { count: 0, error: err.message || String(err) };
    }
  }

  async function mergeExtractedData(entries, url) {
    const packName = await getAutoExtPackForUrl(url);
    const chatKey = getChatKey();
    let ap = [...(settings.config.autoPacks || [])];
    if (!ap.includes(packName)) { ap.push(packName); settings.config.autoPacks = ap; settings.save(); }
    const proj = settings.config.activeProject || '';
    let pack = await db.packs.get(packName);
    if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: proj });
    else await createSnapshot(packName, '자동 병합 전 백업', 'auto');

    let processedCount = 0;
    for (const item of normalizeExtractItems(entries)) {
      if (!item) continue;
      if (item.op === 'patch') {
        processedCount += await applyExtractPatchOp(item, packName, chatKey);
        continue;
      }
      let e = (item.op === 'add' && item.entry) ? item.entry : item;
      if (!e.name) continue;
      e = normalizeEntryForMerge(e, getTurnCounter(chatKey));
      e.gs = (e.imp || 5) + (e.sur || 5) + (e.emo || 5);
      if (settings.config.importanceGating !== false) {
        if (e.gs < (settings.config.importanceThreshold || 12)) continue;
        e.gateScore = e.gs;
      }
      processedCount++;
      const TL_TYPE_MERGE = C.TIMELINE_EVENT_TYPE || 'timeline_event';
      // Phase 12: timeline_event는 stable id / when.anchor / type 매칭으로 분리해 일반 lore와 의도치 않게 합쳐지지 않게 한다.
      if (e.type === TL_TYPE_MERGE && C.stableTimelineEventId && !e.eventId) {
        try { e.eventId = C.stableTimelineEventId(e); } catch(_) {}
      }
      let existing;
      if (e.type === TL_TYPE_MERGE) {
        const _tlId = e.eventId || (C.stableTimelineEventId ? (function(){ try { return C.stableTimelineEventId(e); } catch(_) { return null; } })() : null);
        if (_tlId) {
          existing = await db.entries.where('packName').equals(packName).and(x => {
            if (x.type !== TL_TYPE_MERGE) return false;
            if (x.eventId === _tlId) return true;
            try { return !!(C.stableTimelineEventId && C.stableTimelineEventId(x) === _tlId); } catch(_) { return false; }
          }).first();
        }
        if (!existing) {
          const _wa = e.when && e.when.anchor ? String(e.when.anchor) : '';
          existing = await db.entries.where('packName').equals(packName).and(x => x.type === TL_TYPE_MERGE && x.name === e.name && (_wa ? (x.when && x.when.anchor === _wa) : true)).first();
        }
      } else {
        existing = await db.entries.where('packName').equals(packName).and(x => x.name === e.name && x.type !== TL_TYPE_MERGE).first();
        if (!existing) existing = await findExistingForIncoming(packName, e);
      }
      // Full-object fallback from patch mode is allowed through the normal merge path.
      // The after-merge signature check below skips true no-op updates, while still
      // accepting summary/detail/inject changes that the older pre-merge guard missed.
      // Phase 12: timeline_event union merge backup — 일반 머지 흐름이 단순 spread로 union 필드를 덮어쓰는 것을 방지.
      // Phase 13-fix: anchor 보호된 timeline_event는 union backup도 건너뛴다 (anchor 무결성 우선; participants/hooks 등도 anchor snap이 그대로 보존).
      let _tlMergeBackup = null;
      if (existing && e.type === TL_TYPE_MERGE && existing.anchor !== true) {
        const _mergeArr = (a, b) => Array.from(new Set([...(Array.isArray(a)?a:[]), ...(Array.isArray(b)?b:[])].filter(Boolean)));
        _tlMergeBackup = {
          participants: _mergeArr(existing.participants, e.participants),
          hooks: _mergeArr(existing.hooks, e.hooks),
          recallTriggers: _mergeArr(existing.recallTriggers, e.recallTriggers),
          linkedLore: _mergeArr(existing.linkedLore, e.linkedLore),
          actions: _mergeArr(existing.actions, e.actions),
          when: { ...(existing.when || {}), ...(e.when || {}) }
        };
      }
      if (existing) {
        existing = normalizeEntryForMerge(existing, getTurnCounter(chatKey));
        const _beforeExistingSig = entryContentSignature(existing);
        // 서사 무결성: 덮어쓰기 전 현재 상태 백업 (append-only)
        try { if (C.saveEntryVersion) await C.saveEntryVersion(existing, 'extract_merge'); } catch(ex) {}
        // Narrative Anchor: 앵커 엔트리는 summary/state/detail/call/inject 등 내러티브 필드 보호.
        // 스냅샷 떠놨다가 put 직전 복원. eventHistory/triggers 병합만 허용.
        const _anchorGuard = existing.anchor === true;
        const _anchorSnap = _anchorGuard ? {
          summary: existing.summary,
          state: existing.state,
          detail: existing.detail ? JSON.parse(JSON.stringify(existing.detail)) : undefined,
          call: existing.call ? JSON.parse(JSON.stringify(existing.call)) : undefined,
          callState: existing.callState ? JSON.parse(JSON.stringify(existing.callState)) : undefined,
          callHistory: existing.callHistory ? JSON.parse(JSON.stringify(existing.callHistory)) : undefined,
          inject: existing.inject ? JSON.parse(JSON.stringify(existing.inject)) : undefined,
          timeline: existing.timeline ? JSON.parse(JSON.stringify(existing.timeline)) : undefined,
          entities: existing.entities ? JSON.parse(JSON.stringify(existing.entities)) : undefined,
          cond: existing.cond,
          imp: existing.imp, sur: existing.sur, emo: existing.emo, gs: existing.gs,
          arc: existing.arc ? JSON.parse(JSON.stringify(existing.arc)) : undefined
        } : null;
        if (!_anchorGuard && ['relationship', 'promise', 'rel', 'prom'].includes(e.type)) {
          const oldS = existing.state || existing.detail?.current_status || existing.detail?.status || null;
          const newS = e.state || e.detail?.current_status || e.detail?.status || null;
          if (oldS && newS && oldS !== newS) {
            const cLog = JSON.parse(_ls.getItem('lore-contradictions') || '[]');
            cLog.unshift({ name: e.name, type: e.type, oldStatus: oldS, newStatus: newS, turn: getTurnCounter(chatKey), time: Date.now() });
            if (cLog.length > 50) cLog.length = 50;
            _ls.setItem('lore-contradictions', JSON.stringify(cLog));
          }
        }
        existing.triggers = [...new Set([...(existing.triggers || []), ...(e.triggers || [])])];
        if (e.embed_text) existing.embed_text = e.embed_text;
        if (e.inject) existing.inject = mergeInject(existing.inject, e.inject, existing.name, e.state || existing.state);
        if (e.state !== undefined) existing.state = e.state;
        if (e.call) existing.call = { ...(existing.call || {}), ...e.call };
        if (e.callState) existing.callState = mergeCallState(existing.callState, e.callState);
        if (e.timeline) existing.timeline = { ...(existing.timeline || {}), ...e.timeline };
        if (e.entities) existing.entities = mergeArrayUnique(existing.entities, e.entities);
        if (Array.isArray(e.callDelta) && e.callDelta.length > 0) {
          existing.callHistory = existing.callHistory || [];
          for (const d of e.callDelta) {
            if (!d.from || !d.to || !d.term) continue;
            existing.callHistory.push({
              turn: d.turnApprox || getTurnCounter(chatKey),
              from: d.from, to: d.to, term: d.term,
              prevTerm: d.prevTerm || null, ts: Date.now()
            });
          }
          if (existing.callHistory.length > 30) existing.callHistory = existing.callHistory.slice(-30);
        }
        if (Array.isArray(e.eventHistory) && e.eventHistory.length > 0) {
          existing.eventHistory = existing.eventHistory || [];
          for (const ev of e.eventHistory) {
            if (!ev || !ev.summary) continue;
            const normSum = ev.summary.trim();
            if (existing.eventHistory.some(x => x.summary === normSum)) continue;
            existing.eventHistory.push({
              turn: ev.turn || getTurnCounter(chatKey),
              summary: normSum,
              imp: ev.imp || 5,
              emo: ev.emo || 5,
              ts: Date.now()
            });
          }
          existing.eventHistory.sort((a,b) => (a.turn||0) - (b.turn||0));
          if (existing.eventHistory.length > 30) {
            const oldEvents = existing.eventHistory.slice(0, 20);
            const recentEvents = existing.eventHistory.slice(20);
            const rootId = existing.rootId || existing.id;
            const lastTurn = oldEvents[oldEvents.length - 1]?.turn || 0;
            const firstTurn = oldEvents[0]?.turn || 0;
            const shardEntry = {
              name: `${existing.name} [과거 t${firstTurn}~t${lastTurn}]`,
              type: existing.type,
              packName: existing.packName,
              project: existing.project || '',
              enabled: true,
              triggers: [...(existing.triggers || [])],
              embed_text: existing.embed_text,
              rootId: rootId,
              isCurrentArc: false,
              eventHistory: oldEvents,
              inject: {
                full: `${existing.name}[과거사] ${oldEvents.slice(-2).map(ev => `t${ev.turn}:${ev.summary.slice(0,40)}`).join('|')}`,
                compact: `${existing.name}[과거 ${oldEvents.length}건]`,
                micro: `${existing.name}=과거`
              },
              state: '과거사',
              summary: {
                full: `${existing.name} 과거 이벤트 ${oldEvents.length}건: ${oldEvents.slice(-3).map(ev => `t${ev.turn}:${ev.summary}`).join(' / ')}`,
                compact: `${existing.name} 과거 이벤트 ${oldEvents.length}건`,
                micro: `${existing.name}=과거`
              },
              timeline: { eventTurn: lastTurn, relativeOrder: 'past', sceneLabel: 'archived shard', observedRecency: 'old' },
              entities: existing.entities || existing.parties || existing.detail?.parties || [],
              source: 'shard_split',
              src: 'sh',
              ts: Date.now(),
              lastUpdated: Date.now(),
              imp: existing.imp, emo: existing.emo, sur: existing.sur,
              gs: existing.gs
            };
            await db.entries.put(shardEntry);
            existing.eventHistory = recentEvents;
            existing.rootId = null;
            existing.isCurrentArc = true;
          }
          if (existing.inject && typeof existing.inject === 'object') {
            const base = (existing.inject.full || '').split(' | 최근:')[0];
            const recent = existing.eventHistory.slice(-2).map(ev => `t${ev.turn}:${ev.summary.slice(0,40)}`).join('|');
            existing.inject.full = recent ? base + ' | 최근:' + recent : base;
          }
        }
        if (e.cond !== undefined) existing.cond = e.cond;
        if (e.imp) existing.imp = e.imp;
        if (e.sur) existing.sur = e.sur;
        if (e.emo) existing.emo = e.emo;
        existing.gs = (existing.imp || 5) + (existing.sur || 5) + (existing.emo || 5);
        existing.ts = Date.now();

        if (e.type === 'rel' && Array.isArray(e.arc)) {
          existing.arc = existing.arc || [];
          for (const a of e.arc) {
            const dup = existing.arc.find(x => x.ph === a.ph && x.t === a.t);
            if (dup) Object.assign(dup, a); else existing.arc.push(a);
          }
        }

        if (['relationship', 'promise'].includes(e.type)) {
          if (e.summary) existing.summary = C.mergeLoreSummary ? C.mergeLoreSummary(existing.summary, e.summary, existing.name, e.state || existing.state) : e.summary;
          if (e.detail) {
            existing.detail = existing.detail || {};
            if (e.detail.current_status !== undefined) existing.detail.current_status = e.detail.current_status;
            if (e.detail.status !== undefined) existing.detail.status = e.detail.status;
            if (e.detail.parties) existing.detail.parties = e.detail.parties;
            if (e.detail.condition !== undefined) existing.detail.condition = e.detail.condition;

            if (e.detail.nicknames) {
              existing.detail.nicknames = existing.detail.nicknames || {};
              Object.assign(existing.detail.nicknames, e.detail.nicknames);
            }

            if (Array.isArray(e.detail.arc)) {
              existing.detail.arc = existing.detail.arc || [];
              for (const newArc of e.detail.arc) {
                const dup = existing.detail.arc.find(a => a.phase === newArc.phase && a.approx_turn === newArc.approx_turn);
                if (dup) Object.assign(dup, newArc); else existing.detail.arc.push(newArc);
              }
            }
          }
        } else if (e.type !== 'rel' && e.type !== 'prom') {
          if (e.summary) existing.summary = C.mergeLoreSummary ? C.mergeLoreSummary(existing.summary, e.summary, existing.name, e.state || existing.state) : e.summary;
          if (e.detail) {
            existing.detail = existing.detail || {};
            if (e.detail.current_state !== undefined) existing.detail.current_state = e.detail.current_state;
            if (e.detail.last_interaction !== undefined) existing.detail.last_interaction = e.detail.last_interaction;
            for (const k in e.detail) {
              if (['current_state', 'last_interaction'].includes(k)) continue;
              if (!existing.detail[k]) existing.detail[k] = e.detail[k];
              else if (Array.isArray(e.detail[k])) existing.detail[k] = [...new Set([...(existing.detail[k] || []), ...e.detail[k]])];
              else if (typeof existing.detail[k] === 'string' && typeof e.detail[k] === 'string' && !existing.detail[k].includes(e.detail[k])) existing.detail[k] += ' ' + e.detail[k];
            }
          }
        }
        if (e.gateScore) existing.gateScore = e.gateScore;
        existing.lastUpdated = Date.now();

        if (e.type === 'relationship' || e.type === 'rel') {
          let parties = (e.detail?.parties) || e.parties;
          if ((!parties || parties.length < 2) && typeof e.name === 'string') {
            if (e.name.includes('↔')) parties = e.name.split('↔').map(s => s.trim()).filter(Boolean);
            else if (e.name.includes('&')) parties = e.name.split('&').map(s => s.trim()).filter(Boolean);
          }
          if (parties && parties.length >= 2) {
            const [c1, c2] = parties;
            try { await C.recordFirstEncounter(c1, c2, { turnApprox: getTurnCounter(chatKey), timestamp: Date.now() }); } catch(ex) {}
          }
        }
        // Narrative Anchor: 보호 필드 복원
        if (_anchorSnap) {
          for (const k of Object.keys(_anchorSnap)) {
            if (_anchorSnap[k] === undefined) delete existing[k];
            else existing[k] = _anchorSnap[k];
          }
        }
        // Phase 12: timeline_event 전용 union merge 결과 복원 (일반 머지가 덮어쓴 union 필드 회복).
        if (_tlMergeBackup) {
          if (_tlMergeBackup.participants && _tlMergeBackup.participants.length) existing.participants = _tlMergeBackup.participants;
          if (_tlMergeBackup.hooks && _tlMergeBackup.hooks.length) existing.hooks = _tlMergeBackup.hooks;
          if (_tlMergeBackup.recallTriggers && _tlMergeBackup.recallTriggers.length) existing.recallTriggers = _tlMergeBackup.recallTriggers;
          if (_tlMergeBackup.linkedLore && _tlMergeBackup.linkedLore.length) existing.linkedLore = _tlMergeBackup.linkedLore;
          if (_tlMergeBackup.actions && _tlMergeBackup.actions.length) existing.actions = _tlMergeBackup.actions;
          if (_tlMergeBackup.when && Object.keys(_tlMergeBackup.when).length) existing.when = _tlMergeBackup.when;
        }
        try { if (C.normalizeTemporalGraph) existing = C.normalizeTemporalGraph(existing, { currentTurn: getTurnCounter(chatKey), sceneId: chatKey }); } catch(_) {}
        if (entryContentSignature(existing) === _beforeExistingSig) {
          processedCount--;
          continue;
        }
        try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(existing.id); } catch(_) {}
        await db.entries.put(existing);
      } else {
        e.packName = packName; e.project = proj; e.enabled = true;
        e.src = e.src || (e.source === 'user_stated' ? 'us' : (e.source === 'imported' ? 'im' : 'ax'));
        e.source = e.source || 'auto_extracted';
        e.ts = Date.now();
        e.lastUpdated = e.ts;
        if ((e.type === 'rel' || e.type === 'relationship') && Array.isArray(e.callDelta) && e.callDelta.length > 0) {
          e.callHistory = e.callHistory || [];
          for (const d of e.callDelta) {
            if (!d.from || !d.to || !d.term) continue;
            e.callHistory.push({
              turn: d.turnApprox || getTurnCounter(chatKey),
              from: d.from, to: d.to, term: d.term,
              prevTerm: d.prevTerm || null, ts: Date.now()
            });
          }
        }
        if (Array.isArray(e.eventHistory) && e.eventHistory.length > 0) {
          e.eventHistory = e.eventHistory.filter(ev => ev && ev.summary).map(ev => ({
            turn: ev.turn || getTurnCounter(chatKey),
            summary: ev.summary.trim(),
            imp: ev.imp || 5, emo: ev.emo || 5, ts: Date.now()
          })).sort((a,b) => (a.turn||0) - (b.turn||0));
          if (e.eventHistory.length > 30) e.eventHistory = e.eventHistory.slice(-30);
          if (e.inject && typeof e.inject === 'object') {
            const base = (e.inject.full || '').split(' | 최근:')[0];
            const recent = e.eventHistory.slice(-2).map(ev => `t${ev.turn}:${ev.summary.slice(0,40)}`).join('|');
            e.inject.full = recent ? base + ' | 최근:' + recent : base;
          }
        }
        try { if (C.normalizeTemporalGraph) e = C.normalizeTemporalGraph(e, { currentTurn: getTurnCounter(chatKey), sceneId: chatKey }); } catch(_) {}
        await db.entries.put(e);
      }
    }
    if (processedCount > 0) {
      const count = await db.entries.where('packName').equals(packName).count();
      await db.packs.update(packName, { entryCount: count });
      await setPackEnabled(packName, true);
    }
    return processedCount;
  }

  const _extQ = { running: false, pendingTurns: 0, manualPending: false };
  let _extBadgeMsg = null, _extBadgeWatchdog = null;
  function extBadgeShow(msg) {
    _extBadgeMsg = msg;
    try { C.showStatusBadge(msg); } catch(e){}
    if (_extBadgeWatchdog) return;
    _extBadgeWatchdog = setInterval(() => {
      if (!_extBadgeMsg) return;
      const badge = document.getElementById('lore-status-badge');
      if (badge && badge.style.opacity === '1' && (badge.textContent || '').includes(_extBadgeMsg)) return;
      try { C.showStatusBadge(_extBadgeMsg); } catch(e){}
    }, 1500);
  }
  function extBadgeHide() {
    _extBadgeMsg = null;
    if (_extBadgeWatchdog) { clearInterval(_extBadgeWatchdog); _extBadgeWatchdog = null; }
    try { C.hideStatusBadge(); } catch(e){}
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _extBadgeMsg) { try { C.showStatusBadge(_extBadgeMsg); } catch(e){} }
  });

  async function runAutoExtract(isManual = false) {
    if (_extQ.running) { _extQ.pendingTurns++; if (isManual) _extQ.manualPending = true; return; }
    _extQ.running = true; _extQ.pendingTurns = 0; _extQ.manualPending = false;
    extBadgeShow('에리가 대화 분석 중');
    try { await _doExtract(isManual); }
    finally {
      _extQ.running = false; extBadgeHide();
      if (_extQ.pendingTurns > 0 || _extQ.manualPending) { const nextManual = _extQ.manualPending; setTimeout(() => runAutoExtract(nextManual), 500); }
    }
  }

  async function _doExtract(isManual) {
    const _url = C.getCurUrl(); const chatKey = getChatKey();
    const apiType = settings.config.autoExtApiType || 'key';
    const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson
                  : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript
                  : !settings.config.autoExtKey;
    if (missing) { if (isManual) alert('API 설정 미완료.'); return; }
    const scanR = settings.config.autoExtScanRange || 6; const extraTurns = _extQ.pendingTurns || 0;
    const effectiveRange = scanR + extraTurns; const fetchCount = (effectiveRange + settings.config.autoExtOffset) * 2;
    let recentMsgs = await C.fetchLogs(fetchCount > 0 ? fetchCount : 20);
    if (!recentMsgs.length) { if (isManual) alert('대화 기록 없음.'); return; }
    const offsetCount = settings.config.autoExtOffset * 2;
    if (offsetCount > 0 && recentMsgs.length > offsetCount) recentMsgs = recentMsgs.slice(0, recentMsgs.length - offsetCount);
    const context = recentMsgs.map(m => m.role + ': ' + m.message).join('\n');
    const _patchOn = settings.config.autoExtIncludeDb && settings.config.autoExtPatchMode !== false;
    let entriesText = '[]';
    if (settings.config.autoExtIncludeDb) {
      const packName = await getAutoExtPackForUrl(_url);
      const existingEntries = await db.entries.where('packName').equals(packName).toArray();
      if (existingEntries.length > 0) {
        entriesText = buildExistingLoreContext(existingEntries, context, 20);
      }
    }
    let personaPrefix = '';
    if (settings.config.autoExtIncludePersona) {
      const pName = await C.fetchPersonaName();
      if (pName) personaPrefix = `[User Persona: "${pName}"] All "user" role messages are from this character. Use "${pName}" as the character name, NOT "user".\n\n`;
    }
    const tpl = settings.getActiveTemplate();
    const promptTpl = settings.config.autoExtIncludeDb ? tpl.promptWithDb : tpl.promptWithoutDb;
    const extractSchema = UNIFIED_EXTRACT_SCHEMA || tpl.schema;
    const outputModeText = settings.config.autoExtIncludeDb ? (_patchOn ? OUTPUT_MODE_PATCH : OUTPUT_MODE_FULL) : '';
    const prompt = personaPrefix + promptTpl.replace('{context}', context).replace('{entries}', entriesText).replace('{schema}', extractSchema).replace('{outputMode}', outputModeText);

    const _extModel = settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel;
    let apiLog = null, _extElapsedMs = 0, _extCost = null;
    try {
      const apiOpts = {
        apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
        vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
        firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
        model: _extModel,
        maxRetries: settings.config.autoExtMaxRetries || 1, responseMimeType: 'application/json',
        timeoutMs: 120000,
        maxOutputTokens: _patchOn ? 4096 : null,
        costContext: { feature: 'autoExtract', chatKey: chatKey || 'global' }
      };
      const _extT0 = Date.now();
      const res = await C.callGeminiApi(prompt, apiOpts);
      _extElapsedMs = Date.now() - _extT0;
      _extCost = (res && res.cost) || null;
      apiLog = { status: res.status, error: res.error, retries: res.retries };
      if (!res.text) throw new Error('AI 응답없음 (' + (res.error || '알수없음') + ')');
      const parsed = parseJsonLoose(res.text);
      if (!parsed) throw new Error('JSON 파싱 실패 (응답 스니포: ' + (res.text || '').slice(0, 100) + ')');
      let generalCount = 0;
      let generalStatus = '추출 내용 없음';
      let embedMsg = '';
      let embedCount = 0;
      if (Array.isArray(parsed) && parsed.length > 0) {
        generalCount = await mergeExtractedData(parsed, _url);
        generalStatus = '성공';
        if (generalCount > 0 && settings.config.embeddingEnabled && settings.config.autoEmbedOnExtract !== false) {
          try {
            const epName = await getAutoExtPackForUrl(_url);
            extBadgeShow('에리가 임베딩 갱신 중');
            const embedOpts = { ...apiOpts, model: settings.config.embeddingModel || 'gemini-embedding-001' };
            embedCount = await C.embedPack(epName, embedOpts);
            embedMsg = ' (임베딩 ' + embedCount + '개 완료)';
          } catch(embErr) { console.warn('[Lore] 자동임베딩 실패:', embErr.message); embedMsg = ' (자동 임베딩 실패)'; }
        }
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: generalCount, msgs: recentMsgs.length, isManual, status: generalStatus, api: apiLog, model: _extModel, elapsedMs: _extElapsedMs, cost: _extCost });
      } else {
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: recentMsgs.length, isManual, status: '추출 내용 없음', api: apiLog, model: _extModel, elapsedMs: _extElapsedMs, cost: _extCost });
      }
      let temporalResult = null;
      if (settings.config.temporalExtractEnabled !== false) {
        temporalResult = await runTemporalExtractPass({ context, apiOpts, url: _url, chatKey, isManual, msgCount: recentMsgs.length });
      }
      if (isManual) {
        const temporalMsg = settings.config.temporalExtractEnabled !== false
          ? ' / 중요 장면 ' + ((temporalResult && temporalResult.count) || 0) + '개'
          : '';
        const baseMsg = generalCount > 0
          ? generalCount + '개 로어 추출 및 병합됨'
          : '새로운 일반 로어 없음';
        alert(baseMsg + temporalMsg + embedMsg + '.');
      }
    } catch (err) {
      addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: recentMsgs.length, isManual, status: '실패', error: err.message, api: apiLog, model: _extModel, elapsedMs: _extElapsedMs, cost: _extCost });
      if (isManual) alert('추출 실패: ' + err.message);
    }
  }

  async function runBatchExtract(opts = {}) {
    const turnsPerBatch = opts.turnsPerBatch || 50;
    const overlap = opts.overlap !== undefined ? opts.overlap : 5;
    const maxAttempts = opts.maxAttempts || 3;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const _url = C.getCurUrl(); const chatKey = getChatKey();
    const apiType = settings.config.autoExtApiType || 'key';
    const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson
                  : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript
                  : !settings.config.autoExtKey;
    if (missing) throw new Error('API 설정 미완료');

    extBadgeShow('에리가 전체 로그 가져오는 중');
    const allMsgs = await C.fetchLogs(99999);
    if (!allMsgs || !allMsgs.length) { extBadgeHide(); throw new Error('대화 기록 없음'); }
    const totalMsgs = allMsgs.length;
    const batchMsgSize = Math.max(2, turnsPerBatch * 2);
    const overlapMsgs = Math.max(0, overlap * 2);
    const step = Math.max(1, batchMsgSize - overlapMsgs);
    const batches = [];
    for (let i = 0; i < totalMsgs; i += step) {
      const slice = allMsgs.slice(i, i + batchMsgSize);
      if (slice.length < 2) break;
      batches.push(slice);
      if (i + batchMsgSize >= totalMsgs) break;
    }

    const report = { totalBatches: batches.length, totalMsgs, ok: 0, failed: 0, empty: 0, entriesAdded: 0, batchResults: [] };

    let personaPrefix = '';
    if (settings.config.autoExtIncludePersona) {
      try {
        const pName = await C.fetchPersonaName();
        if (pName) personaPrefix = '[User Persona: "' + pName + '"] All "user" role messages are from this character. Use "' + pName + '" as the character name, NOT "user".\n\n';
      } catch(e) {}
    }
    const tpl = settings.getActiveTemplate();
    const promptTpl = settings.config.autoExtIncludeDb ? tpl.promptWithDb : tpl.promptWithoutDb;

    const _batchModel = settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel;
    let _batchTotalElapsedMs = 0, _batchTotalUsd = 0;
    let _batchHasUnknown = false, _batchHasEstimated = false, _batchCostKnown = false;

    for (let bi = 0; bi < batches.length; bi++) {
      const msgs = batches[bi];
      extBadgeShow('에리가 배치 ' + (bi + 1) + '/' + batches.length + ' 분석 중');
      if (onProgress) { try { onProgress({ phase: 'batch', index: bi + 1, total: batches.length }); } catch(_){} }

      const context = msgs.map(m => m.role + ': ' + m.message).join('\n');
      const _patchOn = settings.config.autoExtIncludeDb && settings.config.autoExtPatchMode !== false;
      let entriesText = '[]';
      if (settings.config.autoExtIncludeDb) {
        const packName = await getAutoExtPackForUrl(_url);
        const existing = await db.entries.where('packName').equals(packName).toArray();
        if (existing.length > 0) {
          entriesText = buildExistingLoreContext(existing, context, 20);
        }
      }
      const extractSchema = UNIFIED_EXTRACT_SCHEMA || tpl.schema;
      const outputModeText = settings.config.autoExtIncludeDb ? (_patchOn ? OUTPUT_MODE_PATCH : OUTPUT_MODE_FULL) : '';
      const prompt = personaPrefix + promptTpl.replace('{context}', context).replace('{entries}', entriesText).replace('{schema}', extractSchema).replace('{outputMode}', outputModeText);

      let ok = false; let status = 'failed'; let lastErr = ''; let rawSnippet = ''; let attempts = 0; let mergedCount = 0;
      for (let attempt = 0; attempt < maxAttempts && !ok; attempt++) {
        attempts++;
        try {
          const apiOpts = {
            apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
            vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
            firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
            model: settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel,
            maxRetries: 0, responseMimeType: 'application/json',
            costContext: { feature: 'batchExtract', chatKey: chatKey || 'global' }
          };
          const _bt0 = Date.now();
          const res = await C.callGeminiApi(prompt, apiOpts);
          _batchTotalElapsedMs += Date.now() - _bt0;
          if (res && res.cost) {
            if (res.cost.usd != null) { _batchTotalUsd += Number(res.cost.usd) || 0; _batchCostKnown = true; }
            else _batchHasUnknown = true;
            if (res.cost.estimated) _batchHasEstimated = true;
          }
          if (!res || !res.text) { lastErr = 'API 응답 없음 (' + ((res && res.error) || '알 수 없음') + ')'; continue; }
          rawSnippet = String(res.text).slice(0, 200);
          const parsed = parseJsonLoose(res.text);
          if (!parsed) { lastErr = 'JSON 파싱 실패 | 응답 스니핏: ' + rawSnippet; continue; }
          if (Array.isArray(parsed) && parsed.length > 0) {
            mergedCount = await mergeExtractedData(parsed, _url);
            report.entriesAdded += mergedCount;
            status = 'ok'; ok = true;
          } else {
            status = 'empty'; ok = true;
          }
        } catch (e) { lastErr = '예외: ' + (e.message || String(e)); }
      }
      if (ok) {
        if (status === 'empty') report.empty++; else report.ok++;
        report.batchResults.push({ batch: bi + 1, status, attempts, entries: mergedCount });
        // Phase 11: per-batch temporal pass so batch extraction also harvests timeline events.
        if (settings.config.temporalExtractEnabled !== false) {
          try {
            const tApiOpts = {
              apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
              vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
              firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
              model: settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel,
              maxRetries: 1, responseMimeType: 'application/json', timeoutMs: 120000,
              maxOutputTokens: _patchOn ? 4096 : null,
              costContext: { feature: 'batchExtract', chatKey: chatKey || 'global' }
            };
            const tres = await runTemporalExtractPass({ context, apiOpts: tApiOpts, url: _url, chatKey, isManual: true, msgCount: msgs.length });
            if (tres && tres.count) {
              report.entriesAdded += tres.count;
              report.batchResults.push({ batch: bi + 1, status: 'temporal_ok', attempts: 1, entries: tres.count });
            } else if (tres && tres.error) {
              report.batchResults.push({ batch: bi + 1, status: 'temporal_failed', attempts: 1, error: tres.error });
            }
          } catch (terr) {
            console.warn('[Lore:batch] 시간축 추출 실패 (배치 ' + (bi + 1) + '):', terr.message || terr);
            report.batchResults.push({ batch: bi + 1, status: 'temporal_failed', attempts: 1, error: terr.message || String(terr) });
          }
        }
      } else {
        report.failed++;
        report.batchResults.push({ batch: bi + 1, status: 'failed', attempts, error: lastErr, rawSnippet });
        console.warn('[Lore:batch] 배치 ' + (bi + 1) + '/' + batches.length + ' 실패 (' + attempts + '회): ' + lastErr);
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: msgs.length, isManual: true, status: '배치 ' + (bi + 1) + '/' + batches.length + ' 실패', error: lastErr, model: _batchModel });
      }
    }

    addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: report.entriesAdded, msgs: totalMsgs, isManual: true, status: '전체 추출 완료 (성공 ' + report.ok + ' / 빈 ' + report.empty + ' / 실패 ' + report.failed + ' / ' + report.totalBatches + '개 배치, 병합 ' + report.entriesAdded + '건)', model: _batchModel, elapsedMs: _batchTotalElapsedMs, cost: { usd: _batchCostKnown ? _batchTotalUsd : null, estimated: _batchHasEstimated, hasUnknown: _batchHasUnknown, isBatchAggregate: true } });

    if (settings.config.embeddingEnabled && settings.config.autoEmbedOnExtract !== false && report.entriesAdded > 0) {
      try {
        const epName = await getAutoExtPackForUrl(_url);
        extBadgeShow('에리가 임베딩 갱신 중');
        const embedOpts = {
          apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
          vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
          firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
          model: settings.config.embeddingModel || 'gemini-embedding-001'
        };
        await C.embedPack(epName, embedOpts);
        report.embedded = true;
      } catch(embErr) {
        console.warn('[Lore:batch] 임베딩 실패:', embErr.message);
        report.embedError = embErr.message;
      }
    }
    extBadgeHide();
    return report;
  }

  Object.assign(_w.__LoreInj, {
    mergeExtractedData, runAutoExtract, runBatchExtract, runTemporalExtractPass,
    extBadgeShow, extBadgeHide,
    __extractLoaded: true
  });
  console.log('[LoreInj:4] extract loaded');
})();
