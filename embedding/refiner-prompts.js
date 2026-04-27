// refiner / prompts 모듈
// 역할: 프롬프트 템플릿, TOPICS 정의, 동적 프롬프트 빌더, 레거시 프롬프트
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreRefiner = _w.__LoreRefiner || {};
  if (_w.__LoreRefiner.__promptsLoaded) return;

  const PROMPT_VERSION = 'v1.4.0-old-style-simple';

  const TEMPLATES = {
    full: {
      name: "전체 검수 (모순 파악 + 끊김 복구)",
      desc: "로어 모순 파악과 코드블록/문장 끊김 복구를 동시에 수행합니다.",
      turnHint: 1,
      prompt: `You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION
6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뵙겠습니다", unfamiliarity.
7. HONORIFIC REGRESSION: Using an older vocative (per [Call] matrix's "←prev" hint) without an in-story trigger (fight, reveal, reset).
8. USER IMPERSONATION: AI narrated the user's character's actions, decisions, dialogue, or internal thoughts WITHOUT user's explicit prior input.
   Violation examples: "당신은 웃으며 대답했다" when user never said they laughed; "내심 설렘이 일었다" when user expressed no such feeling.
   Allowed: describing physical cues the AI's character OBSERVES in the user (e.g., "당신의 눈빛을 보며"), but NOT internal states the AI cannot know.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION (triple-backtick fenced code blocks \`\`\`...\`\`\` at the END of an assistant message, containing RP stats/HP/variables/scene info):
   Restore truncated/absent status blocks using [Recent Context]. Copy the most recent assistant-side code block verbatim (including the triple backticks). Only update numeric values if [New Speech] explicitly states them.

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`
    },
    repairOnly: {
      name: "단순 끊김 복구 (모순 체크 생략)",
      desc: "모순 체크를 생략하고 텍스트나 상태창의 끊김만 빠르게 복구합니다.",
      turnHint: 0,
      prompt: `You are an RP Text Repair AI.
RATE: PG-13 ~ NC-21

## Rule
Your ONLY job is to fix truncation in the [New Speech]. Do NOT check for factual logic or lore contradictions.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence using [Recent Context] as reference.
B) STATUS BLOCK TRUNCATION (triple-backtick code blocks \`\`\`...\`\`\` at the END of an assistant message):
   If [Recent Context] contains a complete status block and [New Speech] does not, restore it verbatim including the triple backticks.

## Output Format
Reason MUST be in Korean.
No truncation found:
{passWord}

Truncation fixed (no markdown code fences):
{"reason":"끊김 복구","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Recent Context]:
{context}

[New Speech]:
{message}`
    },
    logicOnly: {
      name: "로어 모순 검수 (끊김 복구 생략)",
      desc: "수집된 로어를 바탕으로 엄격하게 논리적 모순만 체크합니다.",
      turnHint: 1,
      prompt: `You are an RP Logic Checker.
RATE: PG-13 ~ NC-21

## Scope
Check [New Speech] against [Lore] and [Summaries] for direct logical or factual contradictions.
Do NOT fix truncated sentences or missing status blocks.

## Output Format
Reason MUST be in Korean.
No logical contradictions:
{passWord}

Contradictions found (no markdown code fences):
{"reason":"모순 설명","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`
    }
  };

  // 주제별 동적 프롬프트 빌더 — 각 검수 항목을 on/off로 선택
  const TOPICS = {
    factual:       { label: '1. 명시적 사실 모순',  desc: '[Lore]·[Summaries]와 정면 충돌',              group: 'logic' },
    presence:      { label: '2. 존재/부재 모순',    desc: '없어야 할 캐릭터가 등장하거나 반대',           group: 'logic' },
    nickname:      { label: '3. 호칭 불일치',       desc: '저장된 호칭·직함과 다른 부름',                 group: 'logic' },
    state:         { label: '4. 상태 모순',         desc: '사망/부상/실종 등 상태 모순',                  group: 'logic' },
    promise:       { label: '5. 약속 모순',         desc: '확정된 약속이나 서사 흐름 위반',               group: 'logic' },
    reunion:       { label: '6. 재회 위반',         desc: '이미 아는 사이가 처음 보는 것처럼 행동',       group: 'logic' },
    honorific:     { label: '7. 호칭 퇴행',         desc: '트리거 없이 이전 호칭으로 회귀',               group: 'logic' },
    impersonation: { label: '8. 유저 사칭',         desc: 'AI가 유저 캐릭터의 행동/생각을 서술',          group: 'logic' },
    truncSentence:    { label: 'A. 문장 끊김 복구', desc: '잘린 마지막 문장 완성',                        group: 'repair' },
    truncStatusBlock: { label: 'B. 상태창 복구',    desc: '코드블록 상태창 끊김/누락 복구',               group: 'repair' },
  };

  const _LOGIC_BLOCKS = {
    factual:       '1. EXPLICIT FACTUAL CONTRADICTION',
    presence:      '2. PRESENCE / ABSENCE CONTRADICTION',
    nickname:      '3. NICKNAME / TITLE MISMATCH',
    state:         '4. STATE CONTRADICTION',
    promise:       '5. PROMISE / ARC CONTRADICTION',
    reunion:       '6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뵙겠습니다", unfamiliarity.',
    honorific:     '7. HONORIFIC REGRESSION: Using an older vocative (per [Call] matrix\'s "←prev" hint) without an in-story trigger (fight, reveal, reset).',
    impersonation: '8. USER IMPERSONATION: AI narrated the user\'s character\'s actions, decisions, dialogue, or internal thoughts WITHOUT user\'s explicit prior input.\n   Violation examples: "당신은 웃으며 대답했다" when user never said they laughed; "내심 설렘이 일었다" when user expressed no such feeling.\n   Allowed: describing physical cues the AI\'s character OBSERVES in the user (e.g., "당신의 눈빛을 보며"), but NOT internal states the AI cannot know.',
  };
  const _REPAIR_BLOCKS = {
    truncSentence:    'A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.',
    truncStatusBlock: 'B) STATUS BLOCK TRUNCATION (triple-backtick fenced code blocks ```...``` at the END of an assistant message, containing RP stats/HP/variables/scene info):\n   Restore truncated/absent status blocks using [Recent Context]. Copy the most recent assistant-side code block verbatim (including the triple backticks). Only update numeric values if [New Speech] explicitly states them.',
  };

  function buildDynamicPrompt(topics) {
    topics = topics || {};
    const logicKeys  = ['factual','presence','nickname','state','promise','reunion','honorific','impersonation'].filter(k => topics[k]);
    const repairKeys = ['truncSentence','truncStatusBlock'].filter(k => topics[k]);
    const hasLogic = logicKeys.length > 0;
    const hasRepair = repairKeys.length > 0;
    if (!hasLogic && !hasRepair) {
      return 'You are an RP Checker. All topics disabled — always output {passWord}.\n\n[New Speech]:\n{message}';
    }
    let p = 'You are an RP Continuity Checker.\nRATE: PG-13 ~ NC-21\n\n## Scope\nYou receive:\n- [Lore]: partial character/world data\n- [Summaries]: memory snapshots\n- [Recent Context]: last N turns of dialogue\n- [New Speech]: the latest AI-generated RP response\n\n## Rule\nFlag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].\n';
    if (hasLogic)  { p += '\n## What Counts as an Error\n'; logicKeys.forEach(k => { p += _LOGIC_BLOCKS[k] + '\n'; }); }
    if (hasRepair) { p += '\n## Truncation Repair\n';        repairKeys.forEach(k => { p += _REPAIR_BLOCKS[k] + '\n'; }); }
    p += '\n## Output Format\nReason MUST be in Korean.\nNo issues/repairs needed:\n{passWord}\n\nIssues found (no markdown code fences):\n{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}\n\n[Lore]:\n{lore}\n\n[Summaries]:\n{memory}\n\n[Recent Context]:\n{context}\n\n[New Speech]:\n{message}';
    return p;
  }

  const DEFAULT_PROMPT = TEMPLATES.full.prompt;

  // LEGACY
  const LEGACY_PROMPTS = [
`You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION
6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뽵겙습니다", unfamiliarity.
7. HONORIFIC REGRESSION: Using an older vocative (per [Call] matrix's "←prev" hint) without an in-story trigger (fight, reveal, reset).
8. USER IMPERSONATION: AI narrated the user's character's actions, decisions, dialogue, or internal thoughts WITHOUT user's explicit prior input.
   Violation examples: "당신은 웃으며 대답했다" when user never said they laughed; "내심 설렴이 일었다" when user expressed no such feeling.
   Allowed: describing physical cues the AI's character OBSERVES in the user (e.g., "당신의 눈빛을 보며"), but NOT internal states the AI cannot know.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION: Restore truncated/absent status blocks using [Recent Context].

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`,
`You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION: Restore truncated/absent status blocks using [Recent Context].

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`,
`You are an RP Continuity Checker.
RATE: PG-13 ~ NC-21

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest AI-generated RP response

## Rule
Flag an error ONLY when [New Speech] DIRECTLY CONTRADICTS a fact explicitly stated in [Lore] or [Summaries].

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION
6. REUNION VIOLATION: Characters who already know each other (per [Lore] rel entries or [Reunion] tag) behaving as strangers — self-introduction, "처음 뵙겠습니다", unfamiliarity.
7. HONORIFIC REGRESSION: Using an older vocative (per [Call] matrix's "←prev" hint) without an in-story trigger (fight, reveal, reset).

## Truncation Repair
A) SENTENCE TRUNCATION: Complete ONLY the final interrupted sentence.
B) STATUS BLOCK TRUNCATION: Restore truncated/absent status blocks using [Recent Context].

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found (no markdown code fences):
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`
  ];

  _w.__LoreRefiner.PROMPT_VERSION = PROMPT_VERSION;
  _w.__LoreRefiner.TEMPLATES = TEMPLATES;
  _w.__LoreRefiner.TOPICS = TOPICS;
  _w.__LoreRefiner.buildDynamicPrompt = buildDynamicPrompt;
  _w.__LoreRefiner.DEFAULT_PROMPT = DEFAULT_PROMPT;
  _w.__LoreRefiner.LEGACY_PROMPTS = LEGACY_PROMPTS;
  _w.__LoreRefiner.__promptsLoaded = true;

})();
