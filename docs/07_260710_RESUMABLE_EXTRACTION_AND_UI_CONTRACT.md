# Resumable Extraction and UI Contract

## Purpose

This document is the implementation contract for the post-`e8ff120` 260706 hotfix work. It supersedes the earlier all-or-nothing batch extraction rule while preserving all existing lore, backup, snapshot, prompt, and chat activation data.

## User Outcomes

1. A long extraction run keeps every fully successful conversation segment.
2. Failed segments remain visible after closing the modal or reloading the page.
3. A retry action calls only the unresolved segment indexes.
4. Automatic and manual extraction have separate ranges and topic selections.
5. Important dialogue is optional source evidence, never a required or invented output.
6. Provider transport selection is explicit for OpenAI-compatible endpoints.
7. Lore-pack import lives with backup/restore operations; the lore manager focuses on packs already stored locally.
8. Snapshot contents are inspectable before restore.
9. Duplicate cleanup rebuilds affected embeddings after merge and undo.
10. Duplicate cleanup merges only explicitly selected lore through AI; similarity is an optional candidate filter, not a required merge gate.
11. Pack management lazily exposes each lore entry for inspection and JSON editing.
12. Default OOC wrapping supplies optional continuity reference instead of character-behavior instructions.

## Compatibility Rules

- Existing settings without the new keys read as enabled topic defaults.
- Existing custom prompts and schemas are not overwritten by a fuzzy migration.
- The runtime appends the selected extraction scope and the additive `key_quote` schema to the active prompt at execution time.
- Existing lore types remain valid. `key_quote` is additive and uses the normal generic lore normalization path.
- Existing server backups that contain embeddings remain importable.
- New server backups continue to exclude embeddings and history, then rebuild only restored packs.
- Pack rename updates entries, embeddings, snapshots, automatic extraction targets, settings maps, and the dedicated active-pack map.
- Snapshot restore always applies the snapshot row's current pack name, including snapshots created before a pack rename.

## Resumable Batch State

Storage key: `lore-batch-extraction-jobs-v1`.

The stored object is keyed by stable chat key. It stores only reconstruction metadata:

```json
{
  "chat:<id>": {
    "version": 1,
    "chatKey": "chat:<id>",
    "url": "<chat url>",
    "turnsPerBatch": 50,
    "overlap": 5,
    "maxAttempts": 3,
    "totalBatches": 12,
    "totalMsgs": 984,
    "failedBatchIndexes": [4, 9],
    "batchErrors": [{ "batch": 4, "error": "HTTP 503" }],
    "lastEntriesAdded": 31,
    "updatedAt": 0
  }
}
```

Conversation text and model output are not duplicated into local storage. Retry fetches the current complete log and reconstructs batches using the stored turn size and overlap.

## Batch Commit Boundary

For each selected segment:

1. Build general extraction input.
2. Retry the general generation up to the configured attempt count.
3. When enabled, run the required important-scene pass.
4. Mark the segment successful only when every required call for that segment succeeds.
5. Keep successful segment outputs in memory and continue past failed segments.

After collection:

1. Snapshot the target pack state.
2. Commit every successful segment in one logical operation.
3. Restore the pack state only when the commit itself fails.
4. Rebuild embeddings after the commit.
5. Persist unresolved indexes and return a partial-success report.

An empty but structurally valid response is a successful segment with no changes. A malformed response is a failed segment.

## Extraction Topic Contract

Automatic and manual settings each store these booleans:

- `identityState`
- `relationships`
- `obligations`
- `worldContinuity`
- `majorScenes`
- `importantLines`

`importantLines` permits `type="key_quote"` only when the source contains a distinctive line likely to be recalled, mirrored, or quoted later. The entry keeps speaker, source line, context, meaning, recall triggers, linked lore, summary tiers, and importance scores. Ordinary dialogue must not be promoted to fill this category.

The dedicated temporal call runs only when `majorScenes` is selected and the corresponding automatic, manual, or batch precision option is enabled.

## Provider Transport Contract

`autoExtOpenAIFormat` accepts:

- `custom`: call the user-provided full URL unchanged and use the Chat Completions-compatible body/parser. This is the default for new settings.
- `chat_completions`: append `/chat/completions`, send `messages`, parse `choices[0].message.content`.
- `responses`: append `/responses`, send `input`, parse `output_text` or `output[].content[].text`.
- `anthropic_messages`: append `/messages`, send `messages` and required `max_tokens`, parse `content[].text`.

Except in `custom` mode, official OpenAI and Anthropic host roots receive an inferred `/v1` prefix. Custom mode never appends or removes a path. Anthropic's official host uses `x-api-key` and `anthropic-version: 2023-06-01`; proxy hosts use Bearer authorization. JSON-mode capability fallback remains bounded and the winning request shape is cached by endpoint, model, mode, and format.

## UI Information Architecture

Top-level destinations:

1. Home
2. Lore Management
3. Lore Extraction/Conversion
4. Backup
5. Response Correction
6. API Settings
7. Activity
8. Help

Lore Management contains Lore List, Lore-pack Management, Duplicate Cleanup, and Restore Points. Lore-pack import is rendered in Backup. Lore-pack Management supports chat activation, rename, export, embedding preparation, stale embedding cleanup, delete, lazy lore inspection, and JSON editing. Duplicate Cleanup lists active-pack lore for explicit selection; its similarity threshold only filters candidates and its only merge strategy is AI.

The long-running batch status is embedded in Lore Extraction/Conversion. It is not a toast or transient dialog.

## Verification Gates

- Parse every source module with Node VM.
- Exercise all four OpenAI-compatible request/response formats with mocked transport.
- Assert bounded compatibility variants and exact concurrent-call coalescing.
- Assert additive `key_quote` schema and policy-neutral default prompts.
- Assert persistent failed-index storage and failed-only retry wiring.
- Assert new menu labels and nested destinations.
- Assert pack import placement, pack rename coverage, lazy entry inspection/editing, compressed snapshot inspection, selected-only AI merge, optional similarity filtering, and automatic merge re-embedding.
- Build and verify the universal userscript.
- Perform live browser verification only after the user installs the rebuilt userscript.

## Rollback

The immutable `260710-pre-audit-backup` branch remains the pre-audit baseline. Commit `e8ff120` is the checkpoint immediately before this resumable extraction and UI expansion. Do not overwrite either checkpoint when publishing this work.
