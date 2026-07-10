# UI and UX Audit

> Historical note: this was the pre-260710 audit. The implemented menu hierarchy and current decisions are documented in `05_260710_AUDIT_IMPLEMENTATION_PLAN.md`. The branded personified status badge is intentional and must be retained.

The current UI is powerful but fragmented. It exposes implementation concepts directly to end users and mixes user-facing actions with developer/debug language.

This document lists the current surfaces and a recommended plain-language information architecture. It is intentionally written as a refactor guide, not a patch.

## Current Entry Points

### On-page entry button

Current:

- Button text: `Lore`
- Title/aria: `로어 인젝터 열기`
- Boot error: `로어 도구 로딩 오류`

Problems:

- Mixed English/Korean.
- `Lore` is short but unclear for non-technical users.
- Error text is not actionable.

Recommended:

- Button: `Memory`
- Tooltip: `Open memory tools`
- Boot error: `Memory tools did not load`
- Error action text: `Refresh the page and try again.`

## Current Menus

Menus are registered in this order:

1. `로어 설정`
2. `로어 관리`
3. `로어 관리 (파일)`
4. `추출/변환 설정`
5. `프롬프트 관리`
6. `백업/동기화`
7. `AI 응답 교정`
8. `실행 로그`
9. `세션 상태 관리`
10. `API 설정`
11. `도움말`
12. `로어 스냅샷 (백업)`
13. `병합`

Problems:

- Menu labels overlap: `로어 관리`, `로어 관리 (파일)`, snapshots, backup, merge are separate but related.
- `프롬프트 관리`, `API 설정`, and extraction settings cross-reference each other.
- Technical terms such as prompt, schema, embedding, rerank, patch mode, digest, cooldown, temporal, migration, and status badge appear directly.
- Users need a task-first UI, not a subsystem-first UI.

## Recommended Information Architecture

Use fewer top-level menus:

1. `Memory`
   - Active packs.
   - Entry list.
   - Entry edit/delete.
   - Anchor.
   - Search preparation status.
2. `Chat Setup`
   - Enable memory for this chat.
   - Select packs.
   - Insert before/after.
   - Basic retrieval strength.
3. `Learn From Chat`
   - Auto learning on/off.
   - Run now.
   - Learn all past messages.
   - Convert URL/text.
4. `Review Replies`
   - Enable reply review.
   - Auto apply or ask first.
   - Review latest reply.
5. `Files and Backup`
   - Import/export pack.
   - Full backup.
   - Restore.
   - Server sync.
   - Snapshots.
6. `Connection`
   - Provider.
   - Keys.
   - Models.
   - Test connection.
   - Advanced prompts collapsed.
7. `Activity`
   - What was inserted.
   - What was learned.
   - Reply review history.
   - Cost.
   - Current chat state.

For developers, add a hidden or advanced `Diagnostics` section instead of scattering internal state through normal screens.

## Copy Principles

Use the user's mental model:

- Memory instead of lore where possible.
- Learn instead of extract.
- Search ready instead of embedding.
- Waiting period instead of cooldown.
- Review instead of refiner.
- Important past scene instead of timeline event.
- Protected memory instead of anchor.
- Connection instead of API provider.

Avoid:

- Internal module names.
- Provider nicknames.
- Debug abbreviations.
- JSON/schema wording in normal paths.
- Warnings that describe implementation but not user action.

## Critical Current Copy Issues

### Personified status text

Examples:

- `에리가 대화 분석 중`
- `에리가 검색 준비 중`
- `에리가 응답 기다리는 중`
- `에리가 딥식이에게 묻는 중`
- `에리가 잼민이에게 묻는 중`

Risk:

- Friendly for the developer, but unclear and brand/persona-dependent for normal users.
- Provider nicknames are especially confusing.

Recommended:

- `Analyzing recent messages`
- `Preparing memory search`
- `Waiting for reply`
- `Reviewing reply`
- `Checking with selected model`

### Technical Korean labels

Current examples:

- `의미 검색`
- `검색 준비`
- `후보 재정렬`
- `패치`
- `스키마`
- `템플릿`
- `호칭 매트릭스`
- `시간축`
- `재주입`
- `쿨타임`

Recommended labels:

- `Meaning search` -> `Find related memories`
- `검색 준비` -> `Prepare search`
- `후보 재정렬` -> `Improve selection`
- `패치` -> `Save only changes`
- `스키마` -> keep only in Advanced
- `템플릿` -> `Instructions`
- `호칭 매트릭스` -> `Names and nicknames`
- `시간축` -> `Past scenes`
- `재주입` -> `Remind the AI again`
- `쿨타임` -> `Wait before repeating`

### Dangerous actions need clearer outcomes

Current buttons:

- `초기화`
- `삭제`
- `정리`
- `세션 전체 초기화`
- `가져오기 실행`

Recommended:

- `Reset settings`
- `Delete pack`
- `Remove old search data`
- `Reset this chat state`
- `Import backup`

Each destructive action should state what remains untouched.

## Screen-by-Screen Audit

### Main Settings

Current responsibilities:

- Status summary.
- Presets.
- Compression mode.
- Search/detection.
- Injection position.
- Extra injected info.
- Output format.
- Reset.

UX issue:

- Too many unrelated controls on one screen.
- Compression and output format are advanced, but placed near basic toggles.

Recommended split:

- Basic:
  - Use memory in this chat.
  - Selected packs.
  - Insert memory before/after my message.
  - How many memories to include.
- Advanced:
  - Format wrapper.
  - Compression.
  - First encounter warnings.
  - Nickname/call-state injection.
  - Past scene reminders.

### Lore Management

Current responsibilities:

- List entries.
- Toggle entry enable.
- Anchor.
- Generate embedding for entry.
- Edit JSON.
- Delete.

UX issue:

- Entry editing exposes raw JSON directly.
- Anchor is not explained at decision point.
- Search status has three states but requires technical knowledge.

Recommended:

- Default card:
  - Name.
  - Type.
  - Short summary.
  - Enabled switch.
  - Protected toggle with tooltip.
  - Search status: `Ready`, `Needs update`, `Not prepared`.
- Edit modes:
  - Simple fields first.
  - Raw JSON in Advanced.

### File Management

Current responsibilities:

- Import JSON file.
- Manual JSON input.
- Pack list.
- Pack export.
- Pack embedding.
- Stale embedding cleanup.
- Delete pack.

UX issue:

- Pack file import and full backup import are in different screens but visually similar.
- Manual JSON input is developer-oriented.

Recommended:

- `Import memory pack`
- `Export memory pack`
- `Manage packs`
- Move manual JSON to `Advanced import`.

### Backup/Sync

Current responsibilities:

- File backup.
- Include settings, local state, embeddings, secrets.
- Server account/register/login.
- Server backup list.
- Push/pull/delete.
- Optional embedding restore.

UX issue:

- File backup and server sync are valuable but visually dense.
- Password/encryption behavior should be explained simply.

Recommended:

- Start with two big actions:
  - `Save backup file`
  - `Restore backup file`
- Then `Sync online` collapsed.
- Secret inclusion should be explicit:
  - `Include API keys in this backup`
  - Default off.

### Extract/Convert Settings

Current responsibilities:

- Auto extraction options.
- Manual extraction.
- Insert cleanup options.
- Past scene judge.
- Batch extraction.
- URL/text conversion.

UX issue:

- Learning controls are mixed with insertion cleanup.
- Past scene judge is advanced but placed in normal path.

Recommended:

- `Learn From Chat` basic:
  - `Learn automatically`
  - `Learn every N messages`
  - `Save to pack`
  - `Learn now`
- `Import Knowledge`:
  - URL.
  - Text.
  - Pack name.
- Advanced:
  - Batch settings.
  - Past scene memory extraction.
  - Recall judge.
  - Cleanup old injected messages.

### API Settings and Prompt Management

Current responsibilities:

- Provider selection.
- Credentials.
- Model selection.
- Reasoning settings.
- API test.
- Prompt/template management.

UX issue:

- Provider details are implementation-heavy.
- Prompt management is powerful but should not be normal-user-facing.

Recommended:

- Connection setup wizard:
  1. Choose provider.
  2. Paste key/config.
  3. Test.
  4. Choose simple model preset.
- Advanced:
  - Per-feature model selection.
  - Reasoning/budget controls.
  - Prompt templates.

### Refiner

Current responsibilities:

- Manual review.
- Auto review.
- Auto apply.
- Lore mode.
- Context turns.
- Prompt topics.

UX issue:

- The name `refiner` is developer-facing.
- Users care whether replies are checked and whether changes are automatic.

Recommended:

- Menu label: `Review Replies`
- Basic:
  - `Check AI replies`
  - `Ask before changing`
  - `Review latest reply`
- Advanced:
  - Matching mode.
  - Context length.
  - Review instruction topics.

### Logs and Session State

Current responsibilities:

- Injection logs.
- Extraction logs.
- Refiner logs.
- Cost table.
- Current session cooldown/score state.
- Migration status.

UX issue:

- Useful for debugging, but not task-first.

Recommended:

- Activity feed with filters:
  - Inserted memory.
  - Learned memory.
  - Reviewed reply.
  - Cost.
- `Current chat state` as a diagnostics panel.

## Suggested User-Facing Glossary

Use these terms consistently:

| Current term | Recommended user term |
| --- | --- |
| Lore | Memory |
| Lore pack | Memory pack |
| Injection | Add memory to message |
| Extraction | Learn from chat |
| Embedding | Search preparation |
| Refiner | Reply review |
| Temporal / timeline | Past scenes |
| Anchor | Protected memory |
| Cooldown | Wait before repeating |
| Rerank | Improve selection |
| OOC format | Message wrapper |
| Patch mode | Save only changes |
| Schema | Output format, Advanced only |
