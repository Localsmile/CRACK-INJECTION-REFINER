// == 인젝터 모듈 2/6 — 상수 ==
// OOC_FORMATS, 프롬프트 3종, CHANGELOG, VER
(function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  if (_w.__LoreInj.__constLoaded) return;

  const VER = '1.4.0-test';
  const OOC_FORMAT_VERSION = 'v1.4.0-ooc-context-lore';
  const CHANGELOG = [
    '1.4.0-test 최종 정리: 기존 로어를 API 없이 로컬 마이그레이션하고 stale embedding을 자동 정리, 배포용 캐시버스트 갱신 완료',
    '빠른 설정 프리셋 정리: 기본 추천·수동 검색·정밀(리랭커) 중 골라 한 번에 적용 가능. 정밀을 고르면 의미 기반 응답 교정까지 함께 켜짐',
    '도움말 전면 개편: 기능별 접기 구조 + 기능/예시/설정 3단 구성으로 원하는 항목만 펼쳐 볼 수 있음. 상단에 초심자용 빠른 시작 가이드 고정',
    '응답 교정 중복 팝업 수정: 같은 응답에 교정 창이 두 번 뜨던 현상 해결',
    '버전 이력 기능: 자동 추출이 기존 로어를 덮어쓰기 전 자동 백업해 두고, 로어 관리에서 원하는 시점으로 되돌릴 수 있음',
    '앵커 기능: 유저가 확정한 핵심 설정은 자동 추출이 덮어쓰지 못하도록 잠글 수 있음',
    'URL·텍스트 → 로어 변환: 외부 설정 문서 링크나 긴 텍스트를 붙여 넣으면 자동으로 로어 팩으로 정리됨',
    '시간 감쇠·호칭 매트릭스·첫만남 감지 등 서사 연속성 기능 강화',
    '수동 교정 기능 추가 (마지막턴 교정)',
    '좀 더 가벼운 교정 가능',
    '자동 추출·임베딩·재정렬·응답 교정이 하나의 API 키로 공통 동작'
  ];

  const DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB = `You are a Lore Archivist for RP.
Analyze the following conversation log and extract NEW established lore, character developments, relationship changes, and promises/contracts.

RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited RP)

EXTRACTION PRIORITIES (in order of importance):
1. RELATIONSHIP EVENTS: Track ALL significant interactions between characters.
2. PROMISE LIFECYCLE: Track promises/contracts/oaths between characters.
3. CHARACTER STATE: Update each character's current situation.

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if nothing new.
2. NATIVE LANGUAGE: The 'name' and 'triggers' MUST use the exact language of the conversation.
3. EXACT TRIGGERS: Provide 2-4 HIGH-SPECIFICITY triggers that MUST literally appear in RP dialogue or narration.
   PREFER: Proper nouns (character names, unique nicknames, specific place/faction/item/event names).
   AVOID: Abstract concepts (보호/혐오/안내/수컷/냄새/기쁨/슬픔), emotions, generic states, physical descriptors (hair/clothing), common verbs, bare generic roles alone (반장/선생님/전학생 단독).
   COMPOUND (A&&B): BOTH sides MUST be proper nouns. NEVER pair a proper noun with an abstract word. Bad: "보호&&서유", "혐오&&니아". Good: "서유&&니아", "서유&&실습교보재".
   For relationships: use both parties' names bidirectionally (A&&B and B&&A).
4. CONTENT DEPTH: Capture relationship evolution, group dynamics, promises made. If CharA and CharB meet for the first time, briefly describe what happened and their emotions in the relationship's summary to avoid duplicate encounter entries.
5. STATE REPLACEMENT: When a status CHANGES, describe ONLY the current state.
6. SUMMARY QUALITY: Produce summary.full, summary.compact, and summary.micro.
   Bad full: "동맹 관계" Good full: "대한제국과 영국의 상호방위 동맹. 군수물자 지원과 관세 양보를 교환하며 현재 군사 지원 약속이 미해결."
   compact must keep the relation/status/hook. micro must be a stable recall handle + current state.
7. IMPORTANCE GATING: Rate each entry on three axes (1-10):
   - importance: How critical to the ongoing story?
   - surprise: How new vs already-known information?
   - emotional: How emotionally significant?
   Only include entries where (importance + surprise + emotional) >= 12.
   Filter out: routine actions, generic descriptions, already-established facts with no change.
8. HONORIFIC TRACKING (rel only):
   - For each rel, set "parties": ["A","B"].
   - Scan dialogue for VOCATIVE terms (how A actually addressed B).
   - Korean cues: "~아/야/씨/님", "너/당신/자기/여보/오빠/누나".
   - Set "call" to the LATEST term used in this window.
   - If the term differs from prior history, also output "callDelta" with from/to/term/prevTerm/turnApprox.
9. EVENT ACCUMULATION (character/rel/identity only):
   - Significant events are APPENDED to "eventHistory" array, NEVER overwriting prior events.
   - Each event: {turn, summary, imp(1-10), emo(1-10)}
   - Only include events with imp+emo >= 10 (truly memorable).
   - Maximum 3 new events per entry per extraction pass.
   - Summary must be concrete noun-ending Korean for search: "LO와 첫 키스, 카페에서" not "행복한 순간".
   - If no new significant event occurred, OMIT eventHistory for that entry.

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

Schema:
{schema}

Conversation Log:
{context}`;

  const DEFAULT_AUTO_EXTRACT_SCHEMA = `[
  {
    "type": "character|location|item|event|concept|setting",
    "name": "Entity Name",
    "triggers": ["keyword1", "CharName&&keyword2"],
    "summary": {
      "full": "Continuity-safe, self-contained: who/what/why/current state.",
      "compact": "Entity + state + relation/hook preserved.",
      "micro": "Stable recall handle + current state."
    },
    "embed_text": "names aliases relationship terms event causes stakes location unresolved hooks",
    "inject": {
      "full": "derived from summary.full; key facts | max 120 chars",
      "compact": "derived from summary.compact; max 70 chars",
      "micro": "derived from summary.micro; max 35 chars"
    },
    "state": "current situation noun phrase",
    "timeline": { "eventTurn": 0, "relativeOrder": "current|past|foreshadow", "sceneLabel": "", "observedRecency": "recent|old|unknown" },
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
    "summary": {
      "full": "relationship cause + current state + unresolved hook",
      "compact": "relationship state + hook",
      "micro": "A↔B=status"
    },
    "embed_text": "CharA CharB aliases call terms relationship stakes hooks",
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
    "timeline": { "eventTurn": 0, "relativeOrder": "current", "sceneLabel": "", "observedRecency": "recent" },
    "entities": ["CharA", "CharB"],
    "imp": 5, "sur": 5, "emo": 5
  },
  {
    "type": "prom",
    "name": "Promise title",
    "triggers": ["Maker&&keyword", "Target&&keyword"],
    "summary": {
      "full": "who promised what, why it matters, current status, condition",
      "compact": "promise + status + condition",
      "micro": "Maker=status"
    },
    "embed_text": "maker target promise condition stakes",
    "state": "pending|fulfilled|broken|expired|modified",
    "cond": "trigger condition",
    "timeline": { "eventTurn": 0, "relativeOrder": "current", "sceneLabel": "", "observedRecency": "recent" },
    "entities": ["Maker", "Target"],
    "imp": 5, "sur": 5, "emo": 5
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
    "summary": {
      "full": "Self-contained event memory: who, where, what happened, why it matters, what changed, unresolved hook.",
      "compact": "Event + consequence + hook.",
      "micro": "Stable recall handle=current meaning"
    },
    "hooks": ["unresolved hook or future recall reason"],
    "linkedLore": ["related character/relationship/promise/location names"],
    "recallTriggers": ["literal words, aliases, scene cues, memory question cues"],
    "importance": 8,
    "emotional": 8,
    "confidence": 0.8
  }
]`;

  const DEFAULT_TEMPORAL_EXTRACT_PROMPT = `You are a Temporal Memory Extractor for long-form AI RP.
Extract ONLY concrete timeline events from the conversation log.

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
7. SUMMARY LEVELS:
   - summary.full: self-contained event memory.
   - summary.compact: event + consequence + hook.
   - summary.micro: stable recall handle + current meaning.
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

  const DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT = `You are a fast Temporal Recall Judge for an AI RP memory injector.
Return JSON ONLY. Do not write prose outside JSON.

Task:
Decide whether timeline memories should be injected for the next RP response.
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

  const DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB = `You are a Lore Archivist for RP.
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
   AVOID: Abstract concepts (보호/혐오/안내/수컷/냄새/기쁨/슬픔), emotions, generic states, physical descriptors (hair/clothing), common verbs, bare generic roles alone (반장/선생님/전학생 단독).
   COMPOUND (A&&B): BOTH sides MUST be proper nouns. NEVER pair a proper noun with an abstract word. Bad: "보호&&서유", "혐오&&니아". Good: "서유&&니아", "서유&&실습교보재".
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

Schema:
{schema}

Existing Lore Database:
{entries}

Conversation Log:
{context}`;

  const OOC_FORMATS = {
    default: {name: 'OOC (기본)', prefix: '<ooc_lore_context>\nEstablished continuity for the current RP scene. Use these facts naturally as background. Preserve current relationships, states, promises, honorifics, and unresolved hooks. Do not quote this block verbatim.', suffix: '\n</ooc_lore_context>', desc: '현재 로어/시간축 프롬프트에 맞춘 기본값'},
    system: {name: 'System 태그', prefix: '[System: Established world/character facts for this scene. Do not repeat verbatim.]', suffix: '[/System]', desc: 'System 지시 잘 따르는 모델'},
    narrator: {name: '내레이터', prefix: "(Narrator's note: The following are established facts in this story.)", suffix: '(End note)', desc: '소설/내러티브 RP'},
    minimal: {name: '최소', prefix: '/**', suffix: '**/', desc: '토큰 절약'},
    instruction: {name: '직접 지시', prefix: 'Remember these established facts and reflect them naturally:', suffix: '', desc: '명시적 지시형 모델'},
    custom: {name: '커스텀', prefix: '', suffix: '', desc: '직접 입력'}
  };

  Object.assign(_w.__LoreInj, {
    VER, OOC_FORMAT_VERSION, CHANGELOG, OOC_FORMATS,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
    DEFAULT_AUTO_EXTRACT_SCHEMA,
    DEFAULT_TEMPORAL_EXTRACT_PROMPT,
    DEFAULT_TEMPORAL_EXTRACT_SCHEMA,
    DEFAULT_TEMPORAL_RECALL_JUDGE_PROMPT,
    DEFAULT_TEMPORAL_RECALL_JUDGE_SCHEMA,
    __constLoaded: true
  });
  console.log('[LoreInj:2] constants loaded');
})();
