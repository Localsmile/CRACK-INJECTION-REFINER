// == 인젝터 모듈 2/6 — 상수 ==
// OOC_FORMATS, 프롬프트 3종, CHANGELOG, VER
(function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  if (_w.__LoreInj.__constLoaded) return;

  const VER = '1.4.47-test';
  const CHANGELOG = [
    'Final pre-test implementation: dashboard completion, search data controls, persistent merge recovery, prompt validation, and modal close resolution fixes',
    'Phase 9: 배포 전 정적 프리플라이트에서 남은 기본 팝업 경로와 editable prompt의 금지 문구를 정리',
    'Phase 8: 단계별 변경 파일 원장과 Phase 9 브라우저 검증 기준을 문서화',
    'Phase 7: 가져오기·삭제·병합·스냅샷 복원 전 자동 백업과 데이터 정규화 가드를 보강',
    'Phase 6: 임베딩 taskType 정합성, stale 무효화, promise/관계 검색 보강, 검색 진단 로그 추가',
    'Phase 5: 주요 설정 도움말을 예시·권장값·주의점·결과 중심의 구조화 도움말로 재작성',
    'Phase 4: 로어 항목 편집을 구조화된 모달 편집기로 교체하고 저장 시 검색 데이터를 갱신 필요 처리',
    'Phase 3: 주요 패널의 브라우저 기본 팝업을 공용 모달·알림 흐름으로 교체',
    'Phase 2: 대시보드·기본 설정·로어 관리 중심으로 메뉴 구조 재편',
    'Phase 1: 공용 UI 헬퍼, core-ui 충돌 제거, 주요 패널 입력/카드의 디자인 시스템 이관',
    '재점검: 기본 교정·변환 프롬프트와 고급/병합 탭의 잔여 금지 문구를 추가 정리',
    '정리: 고급 도구에서 더 이상 호출하지 않는 항목 편집·템플릿 편집 잔여 코드를 제거',
    'UI/UX 개편 21차: 응답 교정·기록·도움말 팝업의 잔여 문구와 스타일 변수를 최종 정리',
    'UI/UX 개편 20차: 로어 탭에 항목 편집·앵커 전환을 옮기고 스냅샷 삭제를 추가',
    'UI/UX 개편 19차: 파일 탭 팩 선택을 상단으로 올리고 로어 탭 활성 팩 빠른 이동을 추가',
    'UI/UX 개편 18차: 전체 설정 초기화 API 보존 범위와 추출 저장 팩 표시를 현재 페이지 기준으로 보정',
    'UI/UX 개편 17차: 공용 설정 행·카드·항목 row 컴포넌트로 주요 탭 렌더 구조를 재작성',
    'UI/UX 개편 16차: 도움말 탭 노출을 줄이고 각 설정 위치의 도움말과 금지 문구를 1차 정리',
    'UI/UX 개편 15차: 파일·팩·중복 병합·고급 도구의 액션 버튼을 주요/보조/위험 그룹으로 분리',
    'UI/UX 개편 14차: 도움말·로어 목록·중복 병합·고급 도구의 작은 영어 잔여 문구와 placeholder를 마감 정리',
    'UI/UX 개편 13차: 고급 도구의 항목 편집·URL/텍스트 변환·템플릿 영역에 남은 영어 문구를 한국어로 정리',
    'UI/UX 개편 12차: 로어·파일·API·응답 교정·중복 병합·고급 도구의 남은 영어 UI 문구를 한국어로 정리',
    'UI/UX 개편 11차: 추출 프롬프트와 기록 목록에 접기 구조를 추가해 자주 쓰는 흐름과 상세 설정을 분리',
    'UI/UX 개편 10차: 시작·설정·추출 탭에 상단 요약 카드를 추가하고, 현재 상태와 다음 행동을 먼저 보이게 정리',
    'UI/UX 개편 9차: 모바일/PC 반응형 규칙을 추가하고, 펄스 상태 문구의 Y축 위치를 위로 보정하며 시작·설정 카드 폭을 화면 크기에 맞게 조정',
    'UI/UX 개편 8차: 공용 카드·버튼·입력폼 디자인을 실제 컴포넌트 단위로 재설계하고, 전체 패널에 적용되는 시각 시스템을 추가',
    'UI/UX 개편 7차: 기본 추출 프롬프트를 코드 기준 읽기 전용으로 되돌리고, 유저 추가 템플릿만 편집 가능하도록 템플릿 정책을 정정',
    'UI/UX 개편 6차: 설정 탭의 메타 안내를 제거하고 전체 설정 초기화 버튼을 복구하며, 기본 추출 프롬프트도 직접 편집 가능하게 조정',
    'UI/UX 개편 5차: 추출 탭 내부 순서를 실행 중심으로 재배치하고, 추출 프롬프트 설정을 하단으로 이동하며 고급 도구의 중복 템플릿 편집 위치를 제거',
    'UI/UX 개편 4차: 펄스 상태 문구를 에리 기준으로 정리하고, API→설정→파일→로어→추출→응답 교정→관리 도구 순서로 메뉴 흐름을 재배치',
    'UI/UX 개편 3차: 공용 카드 디자인과 버튼 배치를 정리하고, 시작 화면을 카드형 동선으로 바꾸며 도움말 예시를 에리·붕어빵 중심으로 재작성',
    'UI/UX 개편 2차: 설정·추출·로어·응답 교정·API·기록 패널의 주요 라벨과 안내문을 한국어 사용자 문구로 정리',
    'UI/UX 개편 1차: 시작 화면을 사용자 작업 순서 중심으로 정리하고, 메뉴명을 한국어 IA로 바꾸며 버튼 hover/focus/active 피드백을 보강',
    'UI 보정: 모달 닫기 X 버튼의 커서/호버/클릭 피드백을 보강하고, 추출 패널에 프롬프트 템플릿 편집 공간을 복구',
    'UI 표시 핫픽스 3: 설정 모달의 /setting 링크를 레거시 방식으로 직접 복제하고, 컨테이너 오탐으로 잘못 삽입된 항목을 제거하며, 채팅 상단 로어 설정 진입점을 추가',
    'UI 표시 핫픽스 2: 외부 entrypoints @require를 제거하고 injecter-6 내부에 설정 메뉴 진입점을 내장해 미업로드 파일로 인한 로더 중단을 방지',
    'UI 진입점 복구: 설정 메뉴 삽입을 전용 entrypoints 모듈로 분리, 메뉴 열림 감지/진단 기록/콘솔 진입 함수를 정리',
    'UI 표시 핫픽스: 레거시와 같은 ModalManager 메뉴 방식 유지, 설정 메뉴에 로어 설정 항목을 더 견고하게 삽입, 플로팅 버튼 없음',
    '배포 후보 정리: 모듈형 로더, 전체 패널 로딩, 런타임 자가진단, 모바일 UI 대응, fetch 주입 범위 축소를 포함한 1.4.9-test 후보',
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

  const DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB = `You are a Lore Archivist for chat continuity.
Analyze the following conversation log and extract NEW established lore, character developments, relationship changes, and promises/contracts.

RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited Chat)

EXTRACTION PRIORITIES (in order of importance):
1. RELATIONSHIP EVENTS: Track ALL significant interactions between characters.
2. PROMISE LIFECYCLE: Track promises/contracts/oaths between characters.
3. CHARACTER STATE: Update each character's current situation.

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if nothing new.
2. NATIVE LANGUAGE: The 'name' and 'triggers' MUST use the exact language of the conversation.
3. EXACT TRIGGERS: Provide 2-4 HIGH-SPECIFICITY triggers that MUST literally appear in dialogue or narration.
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

  const DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB = `You are a Lore Archivist for chat continuity.
Analyze the following conversation log ALONGSIDE the EXISTING Lore Database.
Extract NEW or UPDATED lore, character developments, relationship changes, and promise status updates.

RATE: PG-13 ~ NC-21 (Private Sessions, Unlimited Chat)

EXTRACTION PRIORITIES (in order of importance):
1. RELATIONSHIP EVENTS: Track ALL significant interactions.
2. PROMISE LIFECYCLE: If a promise status changed, output the UPDATED entry.
3. CHARACTER STATE: Update current situation.

CRITICAL RULES:
1. JSON ONLY: Output ONLY a valid JSON array. No markdown. Empty array [] if nothing new.
2. INTEGRATE AND UPDATE: If the entity already exists in the Lore Database, DO NOT duplicate it. Keep the exact same "name".
3. NATIVE LANGUAGE: The 'name' and 'triggers' MUST use the exact language of the conversation.
4. EXACT TRIGGERS: Provide 2-4 HIGH-SPECIFICITY triggers that MUST literally appear in dialogue or narration.
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
    narrator: {name: '내레이터', prefix: "(Narrator's note: The following are established facts in this story.)", suffix: '(End note)', desc: '소설/내러티브 채팅'},
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