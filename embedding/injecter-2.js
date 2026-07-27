// == 인젝터 모듈 2/6 — 상수 ==
// OOC_FORMATS, 프롬프트 3종, VER
(function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  if (_w.__LoreInj.__constLoaded) return;

  const VER = '1.4.0.260727.2';
  const AUTO_EXTRACT_PROMPT_VERSION = 'v1.4.0.260727-memory-facts-v1';
  const OOC_FORMAT_VERSION = 'v1.4.0-ooc-reference-soft2';
  function toJsonObjectPrompt(prompt, opts = {}) {
    const empty = opts.empty || '{"entries":[]}';
    const eventOnly = !!opts.eventOnly;
    return String(prompt || '')
      .replace(/JSON ONLY: Output ONLY a valid JSON array\. No markdown\. Empty array \[\] if nothing new\./g, 'JSON ONLY: Output exactly one valid JSON object. No markdown, no prose, no comments. Use top-level shape {"entries":[...]}. Return exactly ' + empty + ' if nothing new.')
      .replace(/JSON ONLY: Output ONLY a valid JSON array\. No markdown\. Empty array \[\] if no meaningful event occurred\./g, 'JSON ONLY: Output exactly one valid JSON object. No markdown, no prose, no comments. Use top-level shape {"entries":[...]}. Return exactly ' + empty + ' if no meaningful event occurred.')
      .replace(/JSON ONLY\. Output a valid JSON array\. No markdown\./g, 'JSON ONLY. Output one valid JSON object with top-level shape {"entries":[...]}. No other text. If empty, return {"entries":[]}.')
      .replace(/Output ONLY a valid JSON array/g, 'Output exactly one valid JSON object with top-level shape {"entries":[...]}')
      .replace(/Empty array \[\]/g, empty)
      .replace(/Schema:\n\{schema\}/g, 'Schema for each object inside entries:\n{schema}')
      .replace(/CRITICAL RULES:\n/g, 'CRITICAL RULES:\n0. STRUCTURE: The response must be one JSON object with an "entries" array. Every extracted ' + (eventOnly ? 'timeline_event' : 'lore entry or patch operation') + ' goes inside entries.\n');
  }
  const FACT_SHAPE_SCHEMA = `{"subject":"exact owner","relation":"attribute or relation","value":"bound value","time":"current|past|future|timeless","polarity":"affirmed|negated|uncertain","condition":"","knownBy":[],"hiddenFrom":[]}`;
  const TIMELINE_SCHEMA = `{ "eventTurn": 0, "relativeOrder": "current|past|foreshadow", "sceneLabel": "", "observedRecency": "recent|old|unknown" }`;
  const EXTRACTION_COVERAGE = `CONTENT COVERAGE:
- Support every RP genre and tone, including everyday life, romance, mystery, horror, action, fantasy, science fiction, and adult/private relationship continuity.
- Record concrete source facts in the conversation's language with detail proportional to future continuity needs.
- Never invent missing motives, dates, relationship labels, or world rules.

EXTRACTION PRIORITIES (in order of importance):
1. IDENTITY AND STATE: names, aliases, forms, roles, goals, knowledge, secrets, injuries, conditions, and current situation.
2. RELATIONSHIPS: dynamics, boundaries, forms of address, private/public state, first meetings, reunions, and meaningful changes.
3. OBLIGATIONS: promises, contracts, debts, duties, conditions, and their current lifecycle.
4. WORLD CONTINUITY: locations, factions, items, ownership, abilities, costs, limits, systems, and genre-specific rules.
5. MAJOR SCENES: reveals, decisions, conflicts, intimacy milestones, victories, losses, and unresolved hooks that may matter later.
6. IMPORTANT LINES: only distinctive source dialogue likely to be deliberately recalled, mirrored, or quoted later. Never force one from ordinary dialogue.`;
  const MEMORY_FORMAT_RULES = `MEMORY FORMAT RULES:
- "summary.full": complete and self-contained continuity record. Do not shorten it for an injection budget.
- "facts": lossless structured facts used to create a dense injection form. Do not omit a fact from facts merely because it already appears in summary.full.
- Fact shape: ${FACT_SHAPE_SCHEMA}.
- "openLoops": unresolved goals, promises, questions, threats, or conflicts. Omit when none.
- Do not output summary.compact, summary.micro, inject, or embed_text. The application derives them from facts.
- "callState": current vocative state. previousTerms are context only, not permanent requirements.
- "timeline": event turn/order/scene/observed recency. Do not invent in-story days.
- "entities": participating characters/places/items.
- "state": current situation in noun phrases. Replace entirely on update.
- Field abbreviations: importance→imp, surprise→sur, emotional→emo.
- Source field is not needed in output (injector adds it).`;

  const DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB = `Extract NEW established continuity facts from the conversation that may matter in later scenes.

${EXTRACTION_COVERAGE}

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if nothing new.
2. REQUIRED CORE: Every entry needs type, name, 2-4 triggers, summary.full, facts, imp, sur, and emo.
3. OPTIONAL MODULES: Add state, openLoops, detail, parties, callState, cond, timeline, entities, or eventHistory only when relevant. Omit an uncertain optional module instead of emitting empty or fabricated fields.
4. NATIVE LANGUAGE: The 'name' and 'triggers' MUST use the exact language of the conversation.
5. EXACT TRIGGERS: Provide 2-4 HIGH-SPECIFICITY triggers that MUST literally appear in RP dialogue or narration.
   PREFER: Proper nouns (character names, unique nicknames, specific place/faction/item/event names).
   AVOID: Abstract notions (신뢰/배신/욕망/암컷/온도/분노/안도), emotions, generic conditions, physical descriptors (eyes/posture), common verbs, generic roles alone (회장/조교/방문객 단독).
   COMPOUND (A&&B): Both operands MUST be proper nouns. Never combine a proper noun with an abstract term. Bad: "배신&&채린", "욕망&&도윤". Good: "채린&&도윤", "채린&&결계석".
   For relationships: use both parties' names bidirectionally (A&&B and B&&A).
6. CONTENT DEPTH: Capture relationship evolution, group dynamics, promises made. If CharA and CharB meet for the first time, briefly describe what happened and their emotions in the relationship's summary to avoid duplicate encounter entries.
7. FACT BINDING:
   - Every fact needs an explicit subject, relation, and value.
   - Keep each attribute attached to its owner. Never put several people and several attributes into one unbound list.
   - Keep relationship direction, quantity, negation, uncertainty, conditions, and who knows or does not know a fact.
   - Use time="current" for the latest state and time="past" for an earlier state that still matters.
8. SUMMARY QUALITY: Produce one self-contained summary.full.
   Bad full: "동맹 관계" Good full: "대한제국과 영국의 상호방위 동맹. 군수물자 지원과 관세 양보를 교환하며 현재 군사 지원 약속이 미해결."
9. IMPORTANCE GATING: Rate each entry on three axes (1-10):
   - importance: How critical to the ongoing story?
   - surprise: How new vs already-known information?
   - emotional: How emotionally significant?
   Only include entries where (importance + surprise + emotional) >= 12.
   Filter out: routine actions, generic descriptions, already-established facts with no change.
10. HONORIFIC TRACKING (rel only):
   - For each rel, set "parties": ["A","B"].
   - Scan dialogue for VOCATIVE terms (how A actually addressed B).
   - Korean cues: "~아/야/씨/님", "너/당신/자기/여보/오빠/누나".
   - Set "call" to the LATEST term used in this window.
   - If the term differs from prior history, also output "callDelta" with from/to/term/prevTerm/turnApprox.
11. EVENT ACCUMULATION (character/rel/identity only):
   - Significant events are APPENDED to "eventHistory" array, NEVER overwriting prior events.
   - Each event: {turn, summary, imp(1-10), emo(1-10)}
   - Only include events with imp+emo >= 10 (truly memorable).
   - Maximum 3 new events per entry per extraction pass.
   - Summary must be concrete noun-ending Korean for search: "LO와 첫 키스, 카페에서" not "행복한 순간".
   - If no new significant event occurred, OMIT eventHistory for that entry.
12. MAJOR SCENE ENTRY: When a scene itself needs independent later recall, output type="timeline_event" with participants, location, actions, hooks, and recallTriggers. Skip this type when the runtime says a dedicated scene-memory pass will handle it.

${MEMORY_FORMAT_RULES}

Schema:
{schema}

Conversation Log:
{context}`;

  const DEFAULT_AUTO_EXTRACT_SCHEMA = `[
  {
    "type": "identity|character|location|faction|item|ability|rule|condition|event|concept|setting|key_quote",
    "name": "Entity Name",
    "triggers": ["keyword1", "CharName&&keyword2"],
    "summary": {"full": "Complete self-contained continuity record."},
    "facts": [
      ${FACT_SHAPE_SCHEMA}
    ],
    "openLoops": ["unresolved goal, promise, question, threat, or conflict"],
    "state": "current situation noun phrase",
    "timeline": ${TIMELINE_SCHEMA},
    "entities": ["characters/places/items involved"],
    "eventHistory": [
      {"turn": 12, "summary": "significant concrete event", "imp": 8, "emo": 9}
    ],
    "imp": 5, "sur": 5, "emo": 5
  },
  {
    "type": "rel",
    "name": "CharA↔CharB",
    "parties": ["CharA", "CharB"],
    "triggers": ["CharA&&CharB", "CharB&&CharA"],
    "summary": {"full": "relationship cause + current state + unresolved hook"},
    "facts": [
      {"subject": "CharA↔CharB", "relation": "relationship", "value": "current bound state", "time": "current", "polarity": "affirmed", "knownBy": ["CharA", "CharB"], "hiddenFrom": []}
    ],
    "openLoops": ["unresolved relationship issue"],
    "state": "one-word status",
    "callState": {
      "CharA→CharB": {
        "currentTerm": "latest vocative",
        "previousTerms": ["older vocative"],
        "tone": "affectionate|hostile|formal|neutral",
        "scope": "scene|stable|private|public",
        "lastChangedTurn": 0,
        "confidence": 0.8,
        "reason": "why this is current"
      }
    },
    "call": {"CharA→CharB": "latest vocative"},
    "callDelta": [{"from":"CharA","to":"CharB","term":"newHonorific","prevTerm":"oldHonorific","turnApprox":0}],
    "timeline": ${TIMELINE_SCHEMA},
    "entities": ["CharA", "CharB"],
    "imp": 5, "sur": 5, "emo": 5
  },
  {
    "type": "prom",
    "name": "Promise title",
    "triggers": ["Maker&&keyword", "Target&&keyword"],
    "summary": {"full": "who promised what, why it matters, current status, condition"},
    "facts": [
      {"subject": "Maker→Target", "relation": "promise", "value": "exact promised action", "time": "current", "polarity": "affirmed", "condition": "trigger condition", "knownBy": ["Maker", "Target"], "hiddenFrom": []}
    ],
    "openLoops": ["unfulfilled promise or consequence"],
    "state": "pending|fulfilled|broken|expired|modified",
    "cond": "trigger condition",
    "timeline": ${TIMELINE_SCHEMA},
    "entities": ["Maker", "Target"],
    "imp": 5, "sur": 5, "emo": 5
  },
  {
    "type": "timeline_event",
    "name": "Stable scene recall handle",
    "title": "Short scene title",
    "triggers": ["participant", "place or unique object"],
    "summary": {"full": "who, where, what changed, consequence, unresolved hook"},
    "facts": [
      {"subject": "exact participant or scene", "relation": "action or consequence", "value": "bound event fact", "time": "past", "polarity": "affirmed", "knownBy": [], "hiddenFrom": []}
    ],
    "openLoops": ["future recall reason"],
    "participants": ["Character"],
    "location": "Place",
    "actions": ["concrete action"],
    "hooks": ["future recall reason"],
    "recallTriggers": ["literal scene cue"],
    "imp": 8, "sur": 6, "emo": 8
  }
]`;

  const DEFAULT_AUTO_EXTRACT_PATCH_SCHEMA = `[
  {
    "op": "add",
    "entry": {
      "type": "identity|character|location|faction|item|ability|rule|condition|event|concept|setting|rel|prom|timeline_event|key_quote",
      "name": "Entity Name",
      "triggers": ["keyword1", "CharA&&CharB"],
      "summary": { "full": "complete self-contained continuity" },
      "facts": [${FACT_SHAPE_SCHEMA}],
      "openLoops": [],
      "state": "current situation",
      "timeline": ${TIMELINE_SCHEMA},
      "entities": [],
      "eventHistory": [{"turn": 0, "summary": "new concrete event", "imp": 8, "emo": 8}],
      "imp": 5, "sur": 5, "emo": 5
    }
  },
  {
    "op": "patch",
    "id": 0,
    "reason": "short reason",
    "set": {
      "state": "",
      "summary": { "full": "" },
      "facts": [],
      "openLoops": [],
      "callState": {},
      "timeline": {},
      "entities": [],
      "cond": ""
    },
    "append": {
      "triggers": [],
      "facts": [],
      "openLoops": [],
      "eventHistory": [{"turn": 0, "summary": "new concrete event", "imp": 8, "emo": 8}],
      "callHistory": [{"turn": 0, "from": "A", "to": "B", "term": "current", "prevTerm": "previous"}]
    }
  }
]`;

  const DEFAULT_TEMPORAL_EXTRACT_SCHEMA = `[
  {
    "type": "timeline_event",
    "title": "Short event title in the conversation language",
    "name": "Same as title unless a better stable recall handle exists",
    "when": {
      "turnStart": 0,
      "turnEnd": 0,
      "relative": "past|current|foreshadow",
      "anchor": "RP-understandable time anchor such as 'after the club camp night', not just a turn number",
      "inferredOrder": "after X before Y, if inferable",
      "confidence": 0.8
    },
    "participants": ["characters involved"],
    "location": "place if known",
    "actions": ["walk", "confession attempt", "promise", "fight", "reunion"],
    "emotions": {
      "Character": ["hesitation", "relief"]
    },
    "summary": {"full": "Self-contained event memory: who, where, what happened, why it matters, what changed, unresolved hook."},
    "facts": [
      {"subject": "exact participant or scene", "relation": "action or consequence", "value": "bound event fact", "time": "past|current|future", "polarity": "affirmed|negated|uncertain", "condition": "", "knownBy": [], "hiddenFrom": []}
    ],
    "hooks": ["unresolved hook or future recall reason"],
    "linkedLore": ["related character/relationship/promise/location names"],
    "recallTriggers": ["literal words, aliases, scene cues, memory question cues"],
    "importance": 8,
    "emotional": 8,
    "confidence": 0.8
  }
]`;

  const DEFAULT_TEMPORAL_EXTRACT_PROMPT = `Extract ONLY concrete timeline events from the conversation log.

Purpose:
- Build event memories that can be recalled even 1000 turns later.
- Do NOT create general character/profile lore here. General lore is extracted by another pass.
- Focus on events that explain current relationship state, promises, emotional changes, conflicts, reunions, reveals, and scene milestones.

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if no meaningful event occurred.
2. EVENT ONLY: Extract timeline_event objects only. Do not output character/rel/promise entries in this pass.
3. NO ROUTINE CHAT: Ignore routine banter, repeated affection with no change, generic descriptions, and facts with no event consequence.
4. TIME ANCHOR QUALITY:
   - turnStart/turnEnd are internal approximate order markers.
   - "when.anchor" must be understandable to the RP model: e.g. "동아리 합숙 다음날 밤", "공원 산책 중", "첫 고백 직후".
   - Never rely on "turn 52" as the only time expression.
   - Do not invent real-world dates or days unless explicitly stated.
5. CAUSAL CONTINUITY:
   - Explain what changed because of the event: relationship, trust, promise, conflict, fear, debt, secret, or unresolved hook.
   - Preserve why the event may matter later.
6. RECALL TRIGGERS:
   - Include literal names, places, actions, nicknames, objects, and user recall cues such as "그때", "기억해", "전에".
   - Include both concrete scene terms and semantic cues.
7. MEMORY FORMAT:
   - Produce one self-contained summary.full.
   - Produce facts with an explicit subject, relation, and value.
   - Keep actions, consequences, knowledge scope, and attributes attached to the correct participant.
   - Do not output summary.compact or summary.micro.
8. PARTICIPANTS AND LINKS:
   - participants: characters directly involved.
   - linkedLore: related relationship/promise/location/event names if obvious.
9. IMPORTANCE GATING:
   - Include only events where importance + emotional >= 10, or events that create/resolve a promise/conflict/relationship change.
10. LANGUAGE:
   - Use the conversation's native language for title, anchor, summaries, hooks, and triggers.

Schema:
{schema}

Conversation Log:
{context}`;

  const DEFAULT_TEMPORAL_RECALL_JUDGE_SCHEMA = `{
  "recall": true,
  "mode": "none|compact_timeline|specific_event|unresolved_hook",
  "wantedDepth": "none|micro|compact|detail",
  "maxChars": 0,
  "eventIds": ["candidate eventId or id"],
  "query": {
    "intent": "explicit_recall|natural_continuity|none",
    "participants": ["names"],
    "actions": ["actions"],
    "locations": ["places"]
  },
  "reason": "short reason in the conversation language"
}`;

  const DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT = `Return JSON ONLY. Do not write prose outside JSON.

Decide whether timeline memories should be included for the next response.
You do NOT write the injection text. You only choose a command.

Rules:
1. If the user explicitly asks about a past event, set recall=true and mode="specific_event".
2. If the current scene naturally connects to a past event, set recall=true and mode="compact_timeline".
3. If only an unresolved promise/conflict/hook matters, set mode="unresolved_hook".
4. If timeline memory is weak, unrelated, or would distract, set recall=false and mode="none".
5. Choose at most 3 eventIds.
6. Keep maxChars realistic under a 2,000 character input budget:
   - none: 0
   - micro: 80-160
   - compact: 160-320
   - detail: 320-600
7. Prefer direct participants/actions/locations over generic importance.
8. Never invent an eventId. Select only from candidates.

Schema:
{schema}

Recent conversation:
{context}

Timeline candidates:
{candidates}`;

  const DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB = `Compare the conversation with the existing lore and extract only NEW or UPDATED continuity facts.

${EXTRACTION_COVERAGE}

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if nothing new.
2. INTEGRATE AND UPDATE: If the entity already exists in the Lore Database, DO NOT duplicate it. Keep the exact same "name".
3. REQUIRED CORE: Every added entry needs type, name, 2-4 triggers, summary.full, facts, imp, sur, and emo.
4. OPTIONAL MODULES: Add state, openLoops, detail, parties, callState, cond, timeline, entities, or eventHistory only when relevant. Omit uncertain optional modules instead of emitting empty or fabricated fields.
5. NATIVE LANGUAGE: The 'name' and 'triggers' MUST use the exact language of the conversation.
6. EXACT TRIGGERS: Provide 2-4 HIGH-SPECIFICITY triggers that MUST literally appear in RP dialogue or narration.
   PREFER: Proper nouns (character names, unique nicknames, specific place/faction/item/event names).
   AVOID: Abstract notions (신뢰/배신/욕망/암컷/온도/분노/안도), emotions, generic conditions, physical descriptors (eyes/posture), common verbs, generic roles alone (회장/조교/방문객 단독).
   COMPOUND (A&&B): Both operands MUST be proper nouns. Never combine a proper noun with an abstract term. Bad: "배신&&채린", "욕망&&도윤". Good: "채린&&도윤", "채린&&결계석".
   For relationships: use both parties' names bidirectionally (A&&B and B&&A).
7. CONTENT DEPTH: Capture relationship evolution, faction dynamics, promises made. If CharA and CharB meet for the first time, briefly describe what happened and their emotions in the relationship's summary to avoid duplicate encounter entries.
8. FACT BINDING:
   - Every fact needs an explicit subject, relation, and value.
   - Keep each attribute attached to its owner. Never put several people and several attributes into one unbound list.
   - Keep relationship direction, quantity, negation, uncertainty, conditions, and who knows or does not know a fact.
   - Use time="current" for the latest state and time="past" for an earlier state that still matters.
9. SUMMARY QUALITY: Produce one self-contained summary.full. Do not shorten it for an injection budget.
10. IMPORTANCE GATING: Rate each entry on three axes (1-10):
   - importance: How critical to the ongoing story?
   - surprise: How new vs already-known information?
   - emotional: How emotionally significant?
   Only include entries where (importance + surprise + emotional) >= 12.
   Filter out: routine actions, generic descriptions, already-established facts with no change.
11. HONORIFIC TRACKING (rel only):
   - For each rel, set "parties": ["A","B"].
   - Scan dialogue for VOCATIVE terms (how A actually addressed B).
   - Korean cues: "~아/야/씨/님", "너/당신/자기/여보/오빠/누나".
   - Set "call" to the LATEST term used in this window.
   - If the term differs from prior history, also output "callDelta" with from/to/term/prevTerm/turnApprox.
12. EVENT ACCUMULATION (character/rel/identity only):
    - CRITICAL: Check existing "eventHistory" for each entity in the DB context. Do NOT duplicate events already recorded.
    - Significant events are APPENDED to "eventHistory" array, NEVER overwriting prior events.
    - Each event: {turn, summary, imp(1-10), emo(1-10)}
    - Only include events with imp+emo >= 10 (truly memorable).
    - Maximum 3 new events per entry per extraction pass.
    - Summary must be concrete noun-ending Korean for search: "LO와 첫 키스, 카페에서" not "행복한 순간".
    - If no new significant event occurred, OMIT eventHistory for that entry.
12A. MAJOR SCENE ENTRY: When a scene itself needs independent later recall, output type="timeline_event" with participants, location, actions, hooks, and recallTriggers. Skip this type when the runtime says a dedicated scene-memory pass will handle it.
13. ANCHOR AWARENESS (CRITICAL — USER-LOCKED NARRATIVE FACTS):
    - Some existing entries have "anchor": true. These are user-locked canonical facts.
    - For anchored entries: NEVER output summary, facts, openLoops, state, detail, call, inject, cond, imp, sur, emo, gs, arc. These fields are PROTECTED and any output will be discarded by the merge layer.
    - You MAY still APPEND new items to eventHistory (if genuinely new and imp+emo >= 10).
    - You MAY add new keywords to triggers.
    - If nothing new qualifies for an anchored entry, OMIT it entirely from output. Do not echo its existing fields.
14. CONTEXT-SAFE MERGE PATCHES (non-anchored entries):
    - The Existing Lore Database can be partial when the DB is large. Never assume omitted old facts are false.
    - For each existing entry, output ONLY changed/new slots; omitted slots are preserved by the merge layer.
    - When updating summary.full, return a complete replacement containing the still-valid existing facts and the new state. Do not concatenate unrelated scene sentences.
    - Return changed current facts in set.facts. The merge layer retains replaced values as past facts.
    - Return independently coexisting new facts in append.facts. Do not use set.facts to add another possession, ability, member, or similar multi-value fact.
    - Return new unresolved items in append.openLoops or a complete current list in set.openLoops.
    - For "state": output only if the status actually changed (e.g. pending→fulfilled, 우호→적대). Stable states are preserved automatically.
    - For "call": output only changed or newly observed pairs. Previous terms are context only, not mandatory future speech.
    - If unsure whether a fact is new or old, output it as eventHistory instead of overwriting summary/state.

${MEMORY_FORMAT_RULES}

{outputMode}

Schema:
{schema}

Existing Lore Database:
{entries}

Conversation Log:
{context}`;

  // Archived only for maintainers. Runtime migration uses the normalized signature below.
  /*
  const LEGACY_AUTO_EXTRACT_PROMPTS_WITH_DB = [
    `You are a Lore Archivist for RP.
Analyze the following conversation log ALONGSIDE the EXISTING Lore Database.
Extract NEW or UPDATED lore, character developments, relationship changes, and promise status updates.

RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited RP)

EXTRACTION PRIORITIES (in order of importance):
1. RELATIONSHIP EVENTS: Track ALL significant interactions.
2. PROMISE LIFECYCLE: If a promise status changed, output the UPDATED entry.
3. CHARACTER STATE: Update current situation.

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if nothing new.
2. INTEGRATE AND UPDATE: If the entity already exists in the Lore Database, DO NOT duplicate it. Keep the exact same "name".
3. NATIVE LANGUAGE: The 'name' and 'triggers' MUST use the exact language of the conversation.
4. EXACT TRIGGERS: Provide 2-4 HIGH-SPECIFICITY triggers that MUST literally appear in RP dialogue or narration.
   PREFER: Proper nouns (character names, unique nicknames, specific place/faction/item/event names).
   AVOID: Abstract notions (신뢰/배신/욕망/암컷/온도/분노/안도), emotions, generic conditions, physical descriptors (eyes/posture), common verbs, generic roles alone (회장/조교/방문객 단독).
   COMPOUND (A&&B): Both operands MUST be proper nouns. Never combine a proper noun with an abstract term. Bad: "배신&&채린", "욕망&&도윤". Good: "채린&&도윤", "채린&&결계석".
   For relationships: use both parties' names bidirectionally (A&&B and B&&A).
5. CONTENT DEPTH: Capture relationship evolution, faction dynamics, promises made. If CharA and CharB meet for the first time, briefly describe what happened and their emotions in the relationship's summary to avoid duplicate encounter entries.
6. STATE REPLACEMENT: For relationship and promise types, describe ONLY the CURRENT state.
7. SUMMARY QUALITY: Produce summary.full, summary.compact, and summary.micro. full must be self-contained; compact keeps relationship/status/hook; micro is only the stable recall handle + current state.
8. IMPORTANCE GATING: Rate each entry on three axes (1-10):
   - importance: How critical to the ongoing story?
   - surprise: How new vs already-known information?
   - emotional: How emotionally significant?
   Only include entries where (importance + surprise + emotional) >= 12.
   Filter out: routine actions, generic descriptions, already-established facts with no change.
9. HONORIFIC TRACKING (rel only):
   - For each rel, set "parties": ["A","B"].
   - Scan dialogue for VOCATIVE terms (how A actually addressed B).
   - Korean cues: "~아/야/씨/님", "너/당신/자기/여보/오빠/누나".
   - Set "call" to the LATEST term used in this window.
   - If the term differs from prior history, also output "callDelta" with from/to/term/prevTerm/turnApprox.
10. EVENT ACCUMULATION (character/rel/identity only):
    - CRITICAL: Check existing "eventHistory" for each entity in the DB context. Do NOT duplicate events already recorded.
    - Significant events are APPENDED to "eventHistory" array, NEVER overwriting prior events.
    - Each event: {turn, summary, imp(1-10), emo(1-10)}
    - Only include events with imp+emo >= 10 (truly memorable).
    - Maximum 3 new events per entry per extraction pass.
    - Summary must be concrete noun-ending Korean for search: "LO와 첫 키스, 카페에서" not "행복한 순간".
    - If no new significant event occurred, OMIT eventHistory for that entry.
11. ANCHOR AWARENESS (CRITICAL — USER-LOCKED NARRATIVE FACTS):
    - Some existing entries have "anchor": true. These are user-locked canonical facts.
    - For anchored entries: NEVER output summary, state, detail, call, inject, cond, imp, sur, emo, gs, arc. These fields are PROTECTED and any output will be discarded by the merge layer.
    - You MAY still APPEND new items to eventHistory (if genuinely new and imp+emo >= 10).
    - You MAY add new keywords to triggers.
    - If nothing new qualifies for an anchored entry, OMIT it entirely from output. Do not echo its existing fields.
12. CONTEXT-SAFE MERGE PATCHES (non-anchored entries):
    - The Existing Lore Database can be partial when the DB is large. Never assume omitted old facts are false.
    - For each existing entry, output ONLY changed/new slots; omitted slots are preserved by the merge layer.
    - If updating summary or inject, preserve the existing kernel and APPEND the new scene detail. Do NOT replace a continuity record with only the latest scene.
    - summary.full must remain self-contained after merge: existing identity/relationship/current state + new detail + unresolved hook.
    - summary.compact must retain relationship/status/hook. summary.micro must remain a stable recall handle + current state.
    - For "state": output only if the status actually changed (e.g. pending→fulfilled, 우호→적대). Stable states are preserved automatically.
    - For "call": output only changed or newly observed pairs. Previous terms are context only, not mandatory future speech.
    - If unsure whether a fact is new or old, output it as eventHistory instead of overwriting summary/state.

SUMMARY AND INJECTION FORMAT RULES:
- "summary" has three semantic levels, not just shorter copies:
  - "full": self-contained continuity record. Include who/what/why/current state and the unresolved hook.
  - "compact": preserve entity, state, relationship, and unresolved hook.
  - "micro": stable recall handle + current state only. Never output a vague teaser.
- "inject" may mirror summary tiers, but it must stay concise enough for later 2,000-char budget planning:
  - "full": key facts separated by |. Target 120 chars.
  - "compact": essential continuity only. Target 70 chars.
  - "micro": name=status format. Target 35 chars.
- "embed_text": keyword cluster, NOT prose. Include names, aliases, relationship terms, event causes, stakes, location, and unresolved hooks.
- "callState": current vocative state. previousTerms are context only, not permanent requirements.
- "timeline": event turn/order/scene/observed recency. Do not invent in-story days.
- "entities": participating characters/places/items.
- "state": current situation in noun phrases. Replace entirely on update.
- Field abbreviations: importance→imp, surprise→sur, emotional→emo.
- Source field is not needed in output (injector adds it).

PATCH OUTPUT MODE WITH EXISTING DB:
- Existing entries are provided as compact digests with stable "id".
- For an existing entry, DO NOT re-output the full object.
- Output {"op":"patch","id":...} only when something changed.
- For unchanged existing entries, output nothing.
- For brand-new lore, output {"op":"add","entry":{...}}.
- Legacy full-entry output is still accepted, but prefer add/patch.
- Patch token rule:
  - Do not repeat unchanged summary.full.
  - Prefer set.state only if state changed.
  - Prefer set.summary.compact/micro only when current state/hook changed.
  - Prefer append.eventHistory for new concrete events.
  - Prefer append.triggers for new literal aliases.
  - If summary.full is unavoidable, keep it under 220 chars.
- Anchored entries:
  - If an existing digest has "anchor": true, do not set protected fields.
  - Only append new triggers/eventHistory/callHistory.

Schema:
{schema}

Existing Lore Database:
{entries}

Conversation Log:
{context}`
  ];
  */
  const LEGACY_AUTO_EXTRACT_PROMPT_SIGNATURES_WITH_DB = ['7055:1e3201f9'];

  const DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB = toJsonObjectPrompt(DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB);
  const DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB = toJsonObjectPrompt(DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB);
  const DEFAULT_DEEPSEEK_TEMPORAL_EXTRACT_PROMPT = toJsonObjectPrompt(DEFAULT_TEMPORAL_EXTRACT_PROMPT, { eventOnly: true });
  const DEFAULT_DEEPSEEK_IMPORT_PROMPT = toJsonObjectPrompt(
    String(_w.__LoreCore?.DEFAULT_IMPORT_PROMPT || 'Convert source to lore.\nJSON ONLY. Output a valid JSON array. No markdown.\nSchema:\n{schema}\nSource:\n{source}').replace(/<br>/g, '\n')
  );

  const OOC_FORMATS = {
    default: {name: '참고 맥락 (기본)', prefix: '<ooc_lore_context>\nReference notes about established continuity that may be relevant to the current scene. Treat them as background facts, not directions for what characters must do or say. Apply only details that fit the immediate context; characters may disagree, refuse, forget, reinterpret, or naturally change these states. Do not mention or quote this block.', suffix: '\n</ooc_lore_context>', desc: '장면에 맞는 사실만 자연스럽게 참고'},
    compact: {name: '간단 참고', prefix: '<ooc_lore_context>\nContinuity reference only; use relevant facts as background without forcing character choices or dialogue.', suffix: '\n</ooc_lore_context>', desc: '짧고 약한 참고 문구'},
    custom: {name: '커스텀', prefix: '', suffix: '', desc: '직접 입력'}
  };

  Object.assign(_w.__LoreInj, {
    VER, OOC_FORMAT_VERSION, OOC_FORMATS,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
    DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB,
    AUTO_EXTRACT_PROMPT_VERSION,
    LEGACY_AUTO_EXTRACT_PROMPT_SIGNATURES_WITH_DB,
    DEFAULT_AUTO_EXTRACT_SCHEMA,
    DEFAULT_AUTO_EXTRACT_PATCH_SCHEMA,
    DEFAULT_TEMPORAL_EXTRACT_PROMPT,
    DEFAULT_DEEPSEEK_TEMPORAL_EXTRACT_PROMPT,
    DEFAULT_TEMPORAL_EXTRACT_SCHEMA,
    DEFAULT_DEEPSEEK_IMPORT_PROMPT,
    DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT,
    DEFAULT_TEMPORAL_RECALL_JUDGE_SCHEMA,
    __constLoaded: true
  });
  console.log('[LoreInj:2] constants loaded');
})();
