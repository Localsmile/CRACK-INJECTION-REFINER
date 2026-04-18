// == 인젝터 모듈 2/6 — 상수 ==
// OOC_FORMATS, 프롬프트 3종, CHANGELOG, VER
(function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  if (_w.__LoreInj.__constLoaded) return;

  const VER = '1.0.8';
  const CHANGELOG = [
    '빠른 설정 개선: 리랭커 프리셋에 의미 기반 응답 교정(임베딩 모드) 자동 포함',
    '도움말 재구성: 빠른 시작 + 폴딩 섹션 8개(기능/예시/설정 3단 구조)로 스크롤 부하 감소',
    '주입 로그 UI 확장: Bundling/Delta Skip 카운터를 주입 기록 각 항목에 표시(번들/스킵)',
    '리랭커 스코어 보정: 하이브리드·LLM 점수 min-max 정규화 후 블렌딩(기본 5:5), 무관(≤2점) 자동 필터, 앵커 최상위 고정. config로 rerankBlendWeight/rerankMinLlmScore/rerankAnchorBoost/rerankMaxCandidates 노출',
    '추출 프롬프트 강화: 앵커 엔트리 보호 필드 출력 금지 + Slot Preservation 규칙 추가. 변경 없는 슬롯은 생략해 토큰 절약 + 불필요한 덮어쓰기 모순 감소',
    '인젝션 최적화: 동일 주체(활성 캐릭터/당사자) 엔트리를 그룹핑하는 Bundling + 최근 3턴 내 변경 없는 엔트리 재주입 생략하는 Delta Skip 도입. 주입 로그에 deltaSkipped/bundled 카운터 포함',
    '서사 앵커(Narrative Anchor) 도입: 로어 관리 UI에서 엔트리 앵커 지정 가능. 앵커 엔트리는 자동 추출 병합 시 summary/state/detail/call/inject 덮어쓰기 차단(eventHistory/triggers 추가만 허용), 재주입 우선도 최대 고정',
    '서사 무결성 보안: 엔트리 덮어쓰기 전 append-only 버전 백업 자동 기록 (entryVersions 테이블, 최대 20개 유지)',
    '로어 관리 UI에 버전 이력 조회/복원 버튼 추가',
    '주입 로그 확장: 총 글자수/한도 표시 + 섹션별 사용량 내역(씬/첫만남/재회/호칭/로어)',
    '시간 감쇠(Decay) 로직을 통한 오래된 기억 재주입 기능 추가',
    '대화 내 활성 캐릭터 감지 및 연관 로어 부스트/패널티 시스템 도입',
    'Gemini 임베딩을 이용한 시맨틱 하이브리드 검색 구현',
    '외부 텍스트 및 URL을 통한 지식 대량 임포트 및 구조화 기능',
    '인젝터와 교정기(Refiner)의 API 설정 통합 관리',
    '캐릭터 간 관계 기반 호칭 매트릭스 시스템 추가',
    '입력 텍스트 2,000자 제한 극복을 위한 적응형 로어 압축 기능 (UI 선택 추가)',
    '단 한 번도 만난 적 없는 캐릭터 첫 만남 감지 및 개연성 보정 (Unmet 태그)',
    'LLM(Gemini) 기반 검색 결과 재정렬(Reranker) 및 프롬프트 커스텀 기능',
    '모든 프롬프트 설정 창에 기본 템플릿 문구로 되돌리는 \'기본값 복구\' 버튼 추가'
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
6. SUMMARY QUALITY: Write complete, self-contained descriptions for keyword+semantic search.
   Bad: "동맹 관계" Good: "대한제국과 영국의 상호방위 동맹. 군수물자 지원과 관세 양보를 교환."
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

COMPRESSION FORMAT RULES:
- "embed_text": keyword cluster, NOT sentences. Noun/stem forms only. Space-separated. Include character names, locations, concepts, emotional keywords. Max 60 chars.
- "inject": three pre-compressed tiers in the conversation's language.
  - "full": key facts separated by |. Max 50 chars.
  - "compact": essential info only. Max 25 chars.
  - "micro": name=status format. Max 15 chars.
  Symbols: → direction, | separator, / alternatives, [] status tags, = assignment.
- "state": current situation in noun phrases. Max 25 chars. Replace entirely on update.
- Field abbreviations: importance→imp, surprise→sur, emotional→emo.
- Source field is not needed in output (injector adds it).
- Do NOT output: detail, summary, scan_range, background_or_history, relations, last_interaction, attributes. These fields are REMOVED.

Schema:
{schema}

Conversation Log:
{context}`;

  const DEFAULT_AUTO_EXTRACT_SCHEMA = `[
  {
    "type": "character|location|item|event|concept|setting",
    "name": "Entity Name",
    "triggers": ["keyword1", "CharName&&keyword2"],
    "embed_text": "space-separated keyword cluster for semantic search. nouns/stems only. max 60 chars.",
    "inject": {
      "full": "key facts | separated | max 50 chars",
      "compact": "essential only | max 25 chars",
      "micro": "name=status max 15 chars"
    },
    "state": "current situation noun phrases. max 25 chars",
    "eventHistory": [
      {"turn": 12, "summary": "significant event 1 sentence. max 50 chars", "imp": 8, "emo": 9}
    ],
    "imp": 5, "sur": 5, "emo": 5
  },
  {
    "type": "rel",
    "name": "CharA↔CharB",
    "parties": ["CharA", "CharB"],
    "triggers": ["CharA&&CharB", "CharB&&CharA"],
    "embed_text": "CharA CharB relationship-keywords",
    "inject": {
      "full": "CharA→CharB: status|details max 50 chars",
      "compact": "CharA→B: status max 25 chars",
      "micro": "A=status max 15 chars"
    },
    "state": "one-word status",
    "call": {"CharA→CharB": "honorific", "CharB→CharA": "honorific"},
    "callDelta": [{"from":"CharA","to":"CharB","term":"newHonorific","prevTerm":"oldHonorific","turnApprox":0}],
    "imp": 5, "sur": 5, "emo": 5
  },
  {
    "type": "prom",
    "name": "Promise title",
    "triggers": ["Maker&&keyword", "Target&&keyword"],
    "embed_text": "maker target promise keywords",
    "inject": {
      "full": "Maker→Target: promise|status|cond max 50 chars",
      "compact": "Maker→Target[status] max 25 chars",
      "micro": "Maker=status max 15 chars"
    },
    "state": "pending|fulfilled|broken|expired|modified",
    "cond": "trigger condition. max 25 chars",
    "imp": 5, "sur": 5, "emo": 5
  }
]`;

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
7. SUMMARY QUALITY: Write complete, self-contained descriptions for keyword+semantic search.
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
12. SLOT PRESERVATION (non-anchored entries):
    - For each existing entry, compare each slot against the new conversation.
    - If a slot (summary, state, detail.*, call, inject, cond) is unchanged by the new scene, OMIT that slot. Only output slots that ACTUALLY changed or are newly observed.
    - Do not regenerate identical summaries. If new info adds detail, write an APPENDED summary: "<existing kernel> / <new detail>" — keep it concise, max 60 chars.
    - For "state": output only if the status actually changed (e.g. pending→fulfilled, 우호→적대). Stable states are preserved automatically.
    - For "call": output only the pairs that changed or are newly observed; do not repeat unchanged honorifics.
    - This reduces contradictions and saves tokens — trust the DB to retain what you don't output.

COMPRESSION FORMAT RULES:
- "embed_text": keyword cluster, NOT sentences. Noun/stem forms only. Space-separated. Include character names, locations, concepts, emotional keywords. Max 60 chars.
- "inject": three pre-compressed tiers in the conversation's language.
  - "full": key facts separated by |. Max 50 chars.
  - "compact": essential info only. Max 25 chars.
  - "micro": name=status format. Max 15 chars.
  Symbols: → direction, | separator, / alternatives, [] status tags, = assignment.
- "state": current situation in noun phrases. Max 25 chars. Replace entirely on update.
- Field abbreviations: importance→imp, surprise→sur, emotional→emo.
- Source field is not needed in output (injector adds it).
- Do NOT output: detail, summary, scan_range, background_or_history, relations, last_interaction, attributes. These fields are REMOVED.

Schema:
{schema}

Existing Lore Database:
{entries}

Conversation Log:
{context}`;

  const OOC_FORMATS = {
    default: {name: 'OOC (기본)', prefix: '**OOC: Reference — factual background data. Incorporate naturally, never repeat verbatim.', suffix: '**', desc: '대부분 모델'},
    system: {name: 'System 태그', prefix: '[System: Established world/character facts for this scene. Do not repeat verbatim.]', suffix: '[/System]', desc: 'System 지시 잘 따르는 모델'},
    narrator: {name: '내레이터', prefix: "(Narrator's note: The following are established facts in this story.)", suffix: '(End note)', desc: '소설/내러티브 RP'},
    minimal: {name: '최소', prefix: '/**', suffix: '**/', desc: '토큰 절약'},
    instruction: {name: '직접 지시', prefix: 'Remember these established facts and reflect them naturally:', suffix: '', desc: '명시적 지시형 모델'},
    custom: {name: '커스텀', prefix: '', suffix: '', desc: '직접 입력'}
  };

  Object.assign(_w.__LoreInj, {
    VER, CHANGELOG, OOC_FORMATS,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
    DEFAULT_AUTO_EXTRACT_SCHEMA,
    __constLoaded: true
  });
  console.log('[LoreInj:2] constants loaded');
})();
