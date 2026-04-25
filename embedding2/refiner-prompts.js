// crack-lore-refiner / prompts 모듈
// 역할: 응답 교정 프롬프트와 호칭 교정 민감도 규칙 관리
(function () {
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  if (_w.__LoreRefinerPrompts) return;

  const PROMPT_VERSION = 'v1.4.1-context-honorific';

  const HONORIFIC_RULES = {
    low: `HONORIFIC CHECK:
Check address terms only when the speaker and listener are explicit.
Do not correct an address term only because it differs from the latest stored term.
Read [Recent Context] first.
Allow temporary changes caused by anger, distance, public setting, teasing, quoting, disguise, memory issues, or deliberate tone shift.
Flag only when the term is clearly impossible under [Lore] and [Recent Context].`,

    normal: `HONORIFIC CHECK:
Check address terms only when the speaker and listener are explicit.
Read [Recent Context] first.
If the address term conflicts with [Lore], decide whether the recent scene gives a natural reason.
Allow anger, distance, public setting, teasing, quoting, disguise, memory issues, or deliberate tone shift.
Suggest a correction only when the term is clearly unsupported or confusing.`,

    high: `HONORIFIC CHECK:
Check address terms when the speaker and listener are explicit.
Read [Recent Context] first.
If the term differs from [Lore], actively verify whether the recent scene justifies the change.
Allow contextual changes, but flag likely unsupported regressions or mismatches.`
  };

  function getHonorificRule(config) {
    const key = (config && config.refinerHonorificSensitivity) || 'low';
    return HONORIFIC_RULES[key] || HONORIFIC_RULES.low;
  }

  const BASE_FULL_PROMPT = `You are a Continuity Checker.

## Scope
You receive:
- [Lore]: partial character/world data
- [Summaries]: memory snapshots
- [Recent Context]: last N turns of dialogue
- [New Speech]: the latest generated response

## Rule
Flag an error ONLY when [New Speech] directly contradicts a fact explicitly stated in [Lore], [Summaries], or [Recent Context].
If the recent context reasonably explains the change, do not flag it.

## What Counts as an Error
1. EXPLICIT FACTUAL CONTRADICTION
2. PRESENCE / ABSENCE CONTRADICTION
3. NICKNAME / TITLE MISMATCH
4. STATE CONTRADICTION
5. PROMISE / ARC CONTRADICTION
6. REUNION VIOLATION: Characters who already know each other behave as strangers without contextual reason.
7. {honorificRule}
8. USER IMPERSONATION: The assistant narrated the user's character's actions, decisions, dialogue, or internal thoughts without explicit prior input.
   Allowed: describing visible cues observed from the user's character.
   Not allowed: inventing the user's character's thoughts, choices, or spoken lines.

## Truncation Repair
A) SENTENCE TRUNCATION: Complete only the final interrupted sentence.
B) STATUS BLOCK TRUNCATION: Restore a truncated or missing final status block only when [Recent Context] contains a clear complete prior block.

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found:
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`;

  const TEMPLATES = {
    full: {
      name: '전체 검수 (맥락 우선)',
      desc: '모순, 끊김, 호칭을 최근 맥락 기준으로 확인합니다.',
      turnHint: 1,
      prompt: BASE_FULL_PROMPT
    },
    repairOnly: {
      name: '단순 끊김 복구',
      desc: '텍스트나 상태창의 끊김만 빠르게 복구합니다.',
      turnHint: 0,
      prompt: `You are a Text Repair Checker.

## Rule
Only fix truncation in [New Speech]. Do not check logic.

## Truncation Repair
A) Complete only the final interrupted sentence.
B) Restore a missing or truncated final status block only when [Recent Context] contains a complete prior block.

## Output Format
Reason MUST be in Korean.
No truncation found:
{passWord}

Truncation fixed:
{"reason":"끊김 복구","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Recent Context]:
{context}

[New Speech]:
{message}`
    },
    logicOnly: {
      name: '설정 모순 검수',
      desc: '저장된 설정과 최근 맥락을 기준으로 명확한 모순만 확인합니다.',
      turnHint: 1,
      prompt: `You are a Continuity Logic Checker.

## Rule
Flag only direct contradictions against [Lore], [Summaries], or [Recent Context].
If recent context explains the change, do not flag it.

## Honorific Rule
{honorificRule}

## Output Format
Reason MUST be in Korean.
No logical contradictions:
{passWord}

Contradictions found:
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

  function buildPrompt(promptTemplate, config) {
    return String(promptTemplate || BASE_FULL_PROMPT)
      .replace('{honorificRule}', getHonorificRule(config));
  }

  const DEFAULT_PROMPT = buildPrompt(BASE_FULL_PROMPT, { refinerHonorificSensitivity: 'low' });

  const TOPICS = {
    factual:       { label: '명시적 사실 모순',  desc: '저장된 설정이나 최근 맥락과 정면으로 충돌합니다.', group: 'logic' },
    presence:      { label: '존재/부재 모순',    desc: '없어야 할 대상이 등장하거나 있어야 할 대상이 사라집니다.', group: 'logic' },
    nickname:      { label: '호칭 불일치',       desc: '화자와 청자가 명확할 때만 호칭을 확인합니다.', group: 'logic' },
    state:         { label: '상태 모순',         desc: '부상, 사망, 위치, 상태 정보가 충돌합니다.', group: 'logic' },
    promise:       { label: '약속/흐름 모순',    desc: '확정된 약속이나 직전 흐름을 어깁니다.', group: 'logic' },
    reunion:       { label: '관계 흐름 위반',    desc: '이미 아는 사이가 근거 없이 처음 만난 것처럼 행동합니다.', group: 'logic' },
    honorific:     { label: '호칭 맥락 확인',    desc: '최근 맥락으로 설명되지 않는 호칭만 확인합니다.', group: 'logic' },
    impersonation: { label: '사용자 행동 대리',  desc: '사용자 캐릭터의 행동, 선택, 생각, 대사를 대신 만듭니다.', group: 'logic' },
    truncSentence:    { label: '문장 끊김 복구', desc: '마지막 문장이 잘렸을 때만 보완합니다.', group: 'repair' },
    truncStatusBlock: { label: '상태창 복구',    desc: '최근 맥락에 완성본이 있을 때만 상태창을 복구합니다.', group: 'repair' }
  };

  const LOGIC_BLOCKS = {
    factual:       'EXPLICIT FACTUAL CONTRADICTION: Flag only direct contradiction against [Lore], [Summaries], or [Recent Context].',
    presence:      'PRESENCE / ABSENCE CONTRADICTION: Flag impossible appearance or disappearance only when explicit.',
    nickname:      'NICKNAME / TITLE MISMATCH: Check only when speaker and listener are explicit.',
    state:         'STATE CONTRADICTION: Flag impossible injury, death, location, condition, or status changes.',
    promise:       'PROMISE / ARC CONTRADICTION: Flag violation of confirmed promises or immediately established flow.',
    reunion:       'RELATION FLOW VIOLATION: Characters who already know each other should not act like strangers unless context explains it.',
    honorific:     '{honorificRule}',
    impersonation: 'USER IMPERSONATION: Do not invent the user character\'s actions, choices, dialogue, or inner thoughts. Visible cues are allowed.'
  };

  const REPAIR_BLOCKS = {
    truncSentence: 'SENTENCE TRUNCATION: Complete only the final interrupted sentence.',
    truncStatusBlock: 'STATUS BLOCK TRUNCATION: Restore a final status block only when [Recent Context] contains a clear complete prior block.'
  };

  function buildDynamicPrompt(topics, config) {
    topics = topics || {};
    const logicKeys = ['factual','presence','nickname','state','promise','reunion','honorific','impersonation'].filter(k => topics[k]);
    const repairKeys = ['truncSentence','truncStatusBlock'].filter(k => topics[k]);

    if (!logicKeys.length && !repairKeys.length) {
      return 'You are a Continuity Checker. All checks are disabled. Always output {passWord}.\\n\\n[New Speech]:\\n{message}';
    }

    let prompt = `You are a Continuity Checker.

## Scope
You receive [Lore], [Summaries], [Recent Context], and [New Speech].

## Rule
Flag an error only when [New Speech] directly contradicts explicit information.
Read [Recent Context] before suggesting any correction.
If the recent context reasonably explains the change, do not flag it.`;

    if (logicKeys.length) {
      prompt += '\\n\\n## Logic Checks\\n' + logicKeys.map(k => LOGIC_BLOCKS[k]).join('\\n');
    }

    if (repairKeys.length) {
      prompt += '\\n\\n## Repair Checks\\n' + repairKeys.map(k => REPAIR_BLOCKS[k]).join('\\n');
    }

    prompt += `

## Output Format
Reason MUST be in Korean.
No issues/repairs needed:
{passWord}

Issues found:
{"reason":"교정 이유","replacements":[{"from":"원문의 정확한 부분","to":"수정본"}]}

[Lore]:
{lore}

[Summaries]:
{memory}

[Recent Context]:
{context}

[New Speech]:
{message}`;

    return prompt;
  }

  _w.__LoreRefinerPrompts = {
    PROMPT_VERSION,
    HONORIFIC_RULES,
    TEMPLATES,
    TOPICS,
    DEFAULT_PROMPT,
    getHonorificRule,
    buildPrompt,
    buildDynamicPrompt
  };


})();