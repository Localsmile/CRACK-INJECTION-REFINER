# 260710 Reliability and UX Audit

> Checkpoint note: this document describes commit `e8ff120`. The later resumable batch extraction, provider-format, and UI contracts are defined in `07_260710_RESUMABLE_EXTRACTION_AND_UI_CONTRACT.md`.

## Purpose

This document is the implementation contract for the 260710 maintenance pass. It is written for future maintainers and coding agents. The baseline is commit `78c686f` on `260706-hotfix`; the immutable pre-change backup is the remote branch `260710-pre-audit-backup`.

The patch must improve reliability and usability without changing the persisted lore schema in a way that breaks existing packs, snapshots, backups, custom prompts, or chat-specific activation state.

## Observed Architecture

- `universal_bundle_work/bundle-manifest.json` is the authoritative runtime order.
- `embedding/core-kernel.js` owns network transport, provider routing, retries, and generation serialization.
- `embedding/injecter-2.js` owns default extraction contracts and schemas.
- `embedding/injecter-3.js` owns persisted settings and compatibility migration.
- `embedding/injecter-4.js` owns extraction, temporal extraction, staging, merge, and rollback.
- `embedding/injecter-5.js` owns retrieval, scoring, injection, and cleanup scheduling.
- `embedding/injecter-6*.js` owns the modal information architecture and controls.
- The bundled `decentralized-modal.js` supports nested menus even though the current adapter flattens every submenu into the top level.

## Runtime Findings

1. Normal extraction commits general lore before the optional temporal pass completes. A temporal failure can therefore leave a partial result despite the all-or-nothing product requirement.
2. Batch extraction stages API outputs and restores the pack on failure. This is the correct reference behavior.
3. Native `fetch` paths do not enforce `timeoutMs`; only `GM_xmlhttpRequest` does.
4. OpenAI-compatible capability probing can produce a Cartesian product of JSON mode, token field, and reasoning style variants.
5. Concurrent identical generation requests are serialized but not coalesced, so two callers can still pay for the same in-flight request.
6. JSON repair makes one additional request only after local parsing fails. This is a justified recovery request and must remain bounded to one repair attempt.
7. Reinjection uses a fixed `aiMemoryTurns` value. The current client does not expose a trustworthy platform context-window value, so a hard-coded claim that the platform uses exactly 10,000 tokens would be unsafe.
8. The trigger scan is intentionally scene-local. Expanding literal trigger scanning to the full platform context would increase stale matches and duplicate injection.
9. The default extraction prompt is detailed but front-loads many optional fields, which increases failure risk on weaker models. It also contains wording that should not be part of the extraction contract.
10. The desktop and mobile modal expose too many top-level destinations even though several screens are naturally subordinate.

## Compatibility Contracts

### Persisted Data

- Keep the Dexie database name, table names, primary keys, and current schema version.
- Keep all existing lore field names and accepted aliases.
- New extraction fields and types must be additive.
- Existing server backups with embeddings must continue to restore. New slim server backups remain embedding-free and rebuild embeddings only for restored active packs.
- Existing snapshots, entry versions, cleanup queue items, active-pack maps, and custom settings remain readable.

### Prompts

- The default template may be refreshed.
- A user-created template must not be overwritten unless it exactly matches a known legacy default.
- The common semantic contract must work for Gemini, DeepSeek, Vertex, Firebase, and OpenAI-compatible providers.
- DeepSeek-specific text is limited to the JSON object envelope and provider mechanics.
- Prompt text must not introduce ethics, censorship, or policy instructions.

### API Calls

- A required multi-call operation succeeds only when every required call succeeds.
- Required results are staged in memory and committed once.
- Any commit failure restores the pack, embeddings, entry versions, snapshots, and automatic-pack state.
- Transient failures are retried with bounded exponential backoff.
- Concurrent byte-equivalent generation requests share one in-flight promise.
- Provider capability fallback is bounded and cached after the first successful shape.
- No automatic GM-XHR-to-native-fetch replay is enabled for paid generation calls because an ambiguous network failure may have reached the provider.

### Retrieval

- Keep the literal/semantic candidate scan scene-local.
- Estimate the platform-visible recent memory from actual recent messages.
- Use the estimate only for reinjection cooldown scoring.
- Keep `aiMemoryTurns` as a manual and legacy fallback.
- Default the target recent-context budget to 10,000 estimated tokens, but label it as a user-adjustable assumption rather than a verified platform guarantee.

## Implementation Work

### 1. Network and Provider Reliability

- Add an abort-aware native fetch timeout wrapper.
- Add exact in-flight generation coalescing before the generation queue.
- Build at most six unique OpenAI-compatible request variants in progressive order.
- Preserve the winning OpenAI-compatible variant cache.
- Export small pure helpers for deterministic regression tests.

### 2. Transactional Extraction

- Replace the normal path's write-first temporal call with `collectTemporalExtractItems`.
- Snapshot the target pack only after every required API response is valid.
- Commit general entries, temporal patches, and temporal events as one logical operation.
- Restore the complete pack state when any write fails.
- Run embeddings only after the logical commit succeeds. Embedding failure remains recoverable because embeddings are derived data.

### 3. Extraction Contract

- Replace the default prompt with a required-core/optional-module contract.
- Keep the current `character`, `location`, `item`, `event`, `concept`, `setting`, `rel`, and `prom` types.
- Add `identity`, `faction`, `ability`, `rule`, `condition`, and `timeline_event` as additive accepted types.
- Cover identities/forms, goals, knowledge asymmetry, secrets, obligations, physical state, relationships, private relationship continuity, abilities and costs, factions, locations, items, ownership, world rules, and major scene milestones.
- Allow a major `timeline_event` in the main extraction pass so useful scene continuity does not always require a second API call.
- Keep the dedicated temporal pass as an optional precision pass.
- Make optional nested fields omittable for weaker models while retaining the required retrieval fields.

### 4. Adaptive Reinjection

- Add a mixed CJK/Latin token estimator.
- Derive effective remembered turns from recent user/assistant pairs under a configurable token target.
- Clamp the result to a conservative range and fall back to `aiMemoryTurns` when message data is absent.
- Pass the derived value only into reinjection scoring.
- Add one compact advanced control under injection settings for the assumed platform recent-context budget.

### 5. Information Architecture and Copy

- Reduce the top-level menu to task-oriented destinations.
- Group lore management, connection/prompt management, and activity screens under nested menus.
- Keep extraction and response review directly accessible.
- Keep the intentional status badge and its branded user-facing voice.
- Replace internal or developer-facing wording in menus, help text, errors, and completion messages with task wording.
- Keep current screen actions and storage keys unchanged.

### 6. Verification and Distribution

- Add deterministic Node regression tests for token estimation, OpenAI variant bounds, menu grouping, prompt compatibility, and transactional extraction markers.
- Extend bundle verification with the new version and invariants.
- Rebuild the universal userscript from the manifest.
- Run source syntax checks, regression tests, bundle verification, and a browser UI smoke test.
- Commit and push only after all required checks pass.

## Out of Scope

- Replacing Dexie or the modal framework.
- Renaming persisted tables or storage keys.
- Rewriting the whole source tree into a new module system.
- Treating embeddings as paid generation work.
- Expanding literal trigger scanning to the complete estimated platform context.
- Installing the rebuilt userscript into the user's browser without the user's action.
