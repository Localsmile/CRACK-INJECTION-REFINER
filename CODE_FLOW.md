# Lore Inject v1 Code Flow Reference

Last updated: 2026-05-14

This document maps the main files, global objects, load gates, and runtime data flow so future changes can start from the right place quickly.

## Global Namespaces

- `unsafeWindow.__LoreCore`
  - Shared core namespace.
  - Created by `embedding/core-kernel.js`.
  - Extended by `core-platform.js`, `core-memory.js`, `core-format.js`, `core-search.js`, `core-embedding.js`, `core-pricing.js`, `core-importer.js`, and `core-ui.js`.

- `unsafeWindow.__LoreInj`
  - Injector namespace.
  - Pre-created by `embedding_pre/erie_crack_inject.user.js` at `document-start`.
  - Extended by `injecter-1.js` through `injecter-6.js` and all `injecter-6-sub-*.js` UI modules.

- `unsafeWindow.__LoreRefiner`
  - AI response refiner namespace.
  - Built by `refiner-prompts.js`, `refiner-dom.js`, `refiner-core.js`, `refiner-queue.js`, `refiner-observer.js`, and `refiner.js`.

## Loader Order

The userscript loader is `embedding_pre/erie_crack_inject.user.js`.

The loader matches `https://crack.wrtn.ai/*` so it can start on the main page and survive SPA navigation into a chat/episode route.

The heavy module stack is loaded dynamically only after a chat/episode route is reached.

Why this is structured this way:

- Metadata `@require` loads before userscript code can check the route, so it burdens the main page.
- The earlier dynamic `GM_xmlhttpRequest` loader caused Tampermonkey runtime permission prompts.
- The current loader uses normal `fetch` from jsDelivr and evaluates one concatenated bundle in the userscript sandbox, preserving access to userscript APIs without using GM requests for module downloads.

Runtime policy:

- On non-chat routes, the loader only watches route changes.
- If the SPA URL later becomes a chat/episode route, the loader fetches and evaluates the heavy module bundle.
- After dynamic evaluation, the ready gate waits for core and submodule flags, then resolves `__LoreInjReady`.

Important loader responsibilities:

1. Creates `__LoreInj` early.
2. Installs `__menuQueue`, `__subMenuQueue`, `registerMenu`, and `registerSubMenu` before submodules can run.
3. Exposes route helpers:
   - `isChatPath`
   - `isHomePath`
   - `onRouteChange`
   - `runWhenChatRoute`
4. Creates `__LoreInjReady`, a Promise that `injecter-6-ui.js` awaits before mounting UI.
5. Keeps `__LoreInjReady` unresolved on non-chat routes so UI bootstrap waits instead of failing.
6. Resets the ready-gate timeout when SPA navigation reaches a chat route.
7. Polls required module flags:
   - Core injector flags: `__interceptorLoaded`, `__constLoaded`, `__settingsLoaded`, `__extractLoaded`, `__injectLoaded`, `__inject6Loaded`
   - UI submodule flags: `__subMainLoaded`, `__subLoreLoaded`, `__subMergeLoaded`, `__subSnapshotLoaded`, `__subFileLoaded`, `__subExtractLoaded`, `__subRefinerLoaded`, `__subLogLoaded`, `__subSessionLoaded`, `__subApiLoaded`, `__subHelpLoaded`
8. Allows a partial UI gate after `SUB_SOFT_WAIT_MS` if all core injector modules are ready but some submodules are missing.

## Core Module Chain

### `core-kernel.js`

Creates `__LoreCore`.

Exports:

- `DEFAULTS`
- `getDB`
- Dexie schema
- `callGeminiApi`
- `embedText`
- `embedTexts`
- `cosineSimilarity`
- `simpleHash`
- network helpers and auth helpers

Dependency role:

- Must load before every other `core-*` module except `core-ui.js` comments say it is order-light, but it still reads `__LoreCore`.

### `core-platform.js`

Adds crack/chasm platform adapters.

Typical exports:

- `getCurUrl`
- `getCurrentChatId`
- `fetchLogs`
- `fetchPersonaName`
- platform memory helpers

Used by:

- `injecter-4.js` for auto extraction context.
- `injecter-5.js` for recent logs and current URL.
- Refiner core for recent assistant/user context.

### `core-memory.js`

Adds memory and temporal graph helpers.

Typical exports:

- `calcReinjectionScore`
- `detectActiveCharacters`
- `isRelatedToActive`
- `recordFirstEncounter`
- `findUnmetPairs`
- `findReunionPairs`
- `updateWorkingMemory`
- `normalizeTemporalGraph`
- `resolveTemporalRecall`
- `isTimelineEvent`
- `stableTimelineEventId`
- honorific matrix helpers

Used by:

- `core-search.js` for scoring.
- `core-format.js` for timeline formatting.
- `injecter-4.js` for extraction merge normalization.
- `injecter-5.js` for insertion-time scene/memory hints.

### `core-search.js`

Adds retrieval and reranking.

Exports:

- `triggerScan(userInput, recentMsgs, entries, config)`
- `hybridSearch(userInput, recentMsgs, entries, config, apiOpts)`
- `smartRerank(query, candidates, recentMsgs, apiOpts, config)`

Runtime flow:

1. Builds a scan pool from user input plus recent messages.
2. Scores literal triggers and compound triggers.
3. Optionally embeds the query and compares stored entry embeddings.
4. Detects active characters.
5. Adds temporal graph, unresolved hook, maintenance, timeline recall, and anchor boosts.
6. Sorts candidates by score.
7. Optionally calls Gemini for LLM reranking.

Primary caller:

- `injecter-5.js` during outgoing user-message injection.

### `core-format.js`

Adds lore serialization and budget planning.

Exports:

- `cfFull`
- `cfCompact`
- `cfMicro`
- `buildTemporalRecallBlock`
- `buildLoreBudgetPlan`
- `planInjectionBudget`
- legacy formatters: `adaptiveFormat`, `assembleInjection`, `budgetFormat`

Primary caller:

- `injecter-5.js` calls `planInjectionBudget` to assemble the final OOC lore block.

### `core-embedding.js`

Adds entry embedding lifecycle management.

Exports:

- `buildEmbeddingText`
- `embeddingSourceHash`
- `cleanupStaleEmbeddings`
- `invalidateEntryEmbeddings`
- `embedEntry`
- `embedPack`

Used by:

- `injecter-4.js` after extraction merge.
- `injecter-6-sub-file.js` for manual embedding actions.
- `injecter-6-sub-merge.js` for duplicate detection and post-merge invalidation.

### `core-importer.js`

Adds URL/text/JSON import into lore entries.

Exports:

- `normalizeLoreEntry`
- `mergeLoreSummary`
- `importFromText`
- `importFromUrl`
- HTML/text extraction helpers

Used by:

- `injecter-4.js` merge normalization.
- `injecter-6-sub-extract.js` URL/text conversion UI.
- `injecter-6-sub-file.js` manual import.

### `core-pricing.js`

Adds cost estimation and local cost logs.

Used by:

- API call logging in extraction, reranking, judge, import, and refiner paths.

### `core-ui.js`

Adds shared small UI helpers.

Typical exports:

- `showStatusBadge`
- `hideStatusBadge`
- `createToggleRow`
- `setFullWidth`
- API input builders

Used by:

- Most `injecter-6-sub-*.js` menu modules.

## Injector Module Chain

### `injecter-1.js`

Interceptors.

Responsibilities:

- Hooks `WebSocket.prototype.send`.
- Hooks `window.fetch`.
- Looks for outgoing user message fields.
- Calls the registered async injector function.
- Exposes `__loreRegister(fn)`.

Main connection:

- `injecter-5.js` registers its `inject(userInput)` function through `__loreRegister`.

### `injecter-2.js`

Constants.

Exports into `__LoreInj`:

- `VER`
- `OOC_FORMAT_VERSION`
- `OOC_FORMATS`
- default extraction prompts
- extraction schemas
- temporal extraction prompts/schemas
- temporal recall judge prompts/schemas

Important note:

- This file must parse cleanly. If it fails, later settings/extract/inject/UI modules cannot reliably initialize.

### `injecter-3.js`

Settings and utility layer.

Responsibilities:

- Waits for `__LoreCore` and constants.
- Defines default settings.
- Loads and migrates settings from localStorage.
- Exposes pack, cooldown, turn counter, injection log, extraction log, snapshot, and entry enable/disable helpers.

Important exports:

- `settings`
- `db`
- `C`
- `R`
- `getChatKey`
- `getTurnCounter`
- `incrementTurnCounter`
- `recordEntryMention`
- `getAutoExtPackForUrl`
- `setAutoExtPackForUrl`
- `isEntryEnabledForUrl`
- `setEntryEnabled`
- `setPackEnabled`
- `addInjLog`
- `addExtLog`
- `createSnapshot`
- `restoreSnapshot`

### `injecter-4.js`

Extraction pipeline.

Responsibilities:

- Merges extracted entries into Dexie.
- Runs automatic extraction from recent chat logs.
- Runs temporal event extraction.
- Handles extraction queueing and extraction status badge.
- Applies patch operations and full-entry merge operations.

Main functions:

- `mergeExtractedData(entries, url)`
- `runAutoExtract(isManual)`
- `_doExtract(isManual)`
- `runBatchExtract(opts)`

Key data flow:

1. Fetch recent logs via `C.fetchLogs`.
2. Build prompt from active template and current settings.
3. Optionally include existing lore database context.
4. Call Gemini through `C.callGeminiApi`.
5. Parse JSON loosely.
6. Merge with `mergeExtractedData`.
7. Optionally refresh embeddings for the affected pack.

### `injecter-5.js`

Insertion pipeline.

Responsibilities:

- Provides `inject(userInput)`.
- Registered into `injecter-1.js` using `__loreRegister`.
- Runs retrieval, scoring, optional temporal judge, optional rerank, cooldown, delta skip, budget planning, and final OOC insertion.

Main flow:

1. Abort if injection is disabled.
2. Increment per-chat turn counter.
3. Trigger automatic extraction every configured number of turns.
4. Load active packs for current URL.
5. Fetch recent logs.
6. Call `C.hybridSearch`.
7. Add deterministic temporal recall candidates.
8. Optionally call temporal recall judge.
9. Optionally call `C.smartRerank`.
10. Apply cooldown and delta skip.
11. Build temporal recall block.
12. Exclude timeline events from generic lore insertion.
13. Build first-encounter, reunion, scene, honorific, and temporal hint sections.
14. Call `C.planInjectionBudget`.
15. Record included entries and logs.
16. Return either `injected + userInput` or `userInput + injected`.

### `injecter-6.js`

Menu registration bridge.

Responsibilities:

- Waits for `__injectLoaded`.
- Preserves pre-installed menu queues.
- Exposes `setupSubMenus(modal)`.
- Registers queued menus into `decentralized-modal`.
- Uses a fixed menu order to prevent random UI menu ordering.
- Replaces `registerMenu` and `registerSubMenu` after startup so late-arriving submodules are queued and remounted into the already-created modal.
- Keeps `__registeredMenuKeys` to prevent duplicate menu creation during remounts.

Menu order:

1. `main`
2. `lore`
3. `file`
4. `extract`
5. `merge`
6. `snapshot`
7. `refiner`
8. `log`
9. `session`
10. `api`
11. `help`

### `injecter-6-ui.js`

UI bootstrap.

Responsibilities:

- Waits for `__LoreInjReady`.
- Skips full UI on non-chat routes and reloads when the SPA later enters a chat route.
- Resolves `ModalManager`.
- Calls `__LoreInj.setupSubMenus(modal)`.
- Injects the "Chasm Tools" entry point into the host UI.
- Exposes boot diagnostics when the loader gate or modal manager fails.

## UI Submenus

- `injecter-6-sub-main.js`
  - Quick settings, injection enable/disable, search mode, scan settings, OOC format.

- `injecter-6-sub-lore.js`
  - Entry list, edit/delete, anchor toggle, version history.
  - Deletes the pack record when the last entry in that pack is removed.

- `injecter-6-sub-file.js`
  - JSON import/export, pack enable/disable, embedding generation, stale embedding cleanup, pack deletion.
  - Reconciles `entryCount` against actual entries and removes empty pack records during render.

- `injecter-6-sub-extract.js`
  - Auto extraction settings, manual extraction, batch extraction, prompt templates, URL/text conversion, temporal judge settings.

- `injecter-6-sub-merge.js`
  - Duplicate detection and merge approval using embedding similarity and optional LLM merge.

- `injecter-6-sub-snapshot.js`
  - Snapshot list, restore, delete.

- `injecter-6-sub-refiner.js`
  - Refiner settings and manual re-check controls.

- `injecter-6-sub-log.js`
  - Injection logs, extraction logs, refiner logs, contradiction logs, cost logs.
  - Cost logs use user-facing feature labels and show chat-grouped costs as lore-pack labels when `urlAutoExtPacks` has a URL-to-pack mapping.

- `injecter-6-sub-session.js`
  - Session state, turn counters, last mentions, cooldown state, migration helpers.

- `injecter-6-sub-api.js`
  - API keys, API mode, models, rerank settings, embedding settings.

- `injecter-6-sub-help.js`
  - Help text and usage descriptions.

## Refiner Flow

### Files

- `refiner-prompts.js`
  - Prompt templates, topic definitions, dynamic prompt builder.

- `refiner-dom.js`
  - Finds assistant message DOM nodes, applies corrected text, opens confirmation UI, refreshes React/SWR state where possible.

- `refiner-core.js`
  - Builds lore/context/memory prompt, calls Gemini, parses correction output, applies corrections.

- `refiner-queue.js`
  - Serializes correction jobs and prevents duplicate processing.

- `refiner-observer.js`
  - Watches new assistant messages and enqueues correction jobs.

- `refiner.js`
  - Entry point that wires all refiner modules together.

### Runtime flow

1. Observer detects a new assistant message.
2. Queue accepts it if it has not been processed.
3. Core gathers recent context and matched lore.
4. Core calls Gemini with the selected refiner prompt.
5. Core parses either pass keyword or JSON correction.
6. DOM module applies the correction automatically or via confirmation UI.
7. Logs are written through injector settings/log structures.

## Main Data Stores

Dexie database name: `lore-injector`

Important tables:

- `entries`
  - Main lore entries.

- `packs`
  - Lore pack metadata.

- `snapshots`
  - Backup snapshots.

- `embeddings`
  - Entry embedding vectors and metadata.

- `workingMemory`
  - Per-URL working memory.

- `encounters`
  - First encounter and reunion tracking.

- `entryVersions`
  - Append-only entry versions for rollback/history.

LocalStorage is also used for:

- User settings.
- Turn counters.
- Last mention maps.
- Recent injection delta-skip records.
- Injection/extraction/refiner logs.
- Cost logs.
- Contradiction logs.

## Outgoing Message Injection Flow

```text
User sends message
  -> injecter-1.js fetch/WebSocket interceptor
  -> __loreRegister-injected function from injecter-5.js
  -> load active packs for current URL
  -> fetch recent logs
  -> core-search.hybridSearch
  -> temporal recall + optional temporal judge
  -> optional smartRerank
  -> cooldown/delta filtering
  -> core-format.planInjectionBudget
  -> injection log update
  -> modified outgoing message
```

## Auto Extraction Flow

```text
Turn counter reaches autoExtTurns or user clicks manual extract
  -> injecter-5.js or UI calls injecter-4.js runAutoExtract
  -> fetch recent logs with offset
  -> build prompt from active template
  -> optionally include existing DB context as stable id digests
  -> Gemini JSON call
  -> parseJsonLoose
  -> mergeExtractedData
  -> normalizeTemporalGraph / normalizeLoreEntry
  -> put/update Dexie entries
  -> invalidate or regenerate embeddings
  -> extraction log update
```

## Patch Mode Contract

`autoExtPatchMode` changes only the expected output format:

- OFF: model returns full updated entries.
- ON: model returns `{"op":"patch","id":...}` for existing entries and `{"op":"add","entry":...}` for genuinely new lore.

Both modes use the same existing-lore digest payload and the same unified schema text. This avoids shifting input token cost when the user is only testing the output-saving mode.

The merge layer still protects existing users:

- No automatic re-extraction is triggered by this change.
- Legacy full-entry output is still accepted by `mergeExtractedData`.
- Incoming `add` entries are checked against existing active-pack entries by type, relationship parties, triggers, and entities before a new row is created.
- If patch mode is ON and the model still returns a full object for an existing entry, the merge layer skips the write when no meaningful new state, trigger, entity, event, call, or timeline data is present.
- Merge counts now mean actual changed rows. Existing rows are compared before and after merge with volatile fields ignored; unchanged rows do not trigger embedding refresh.

## Temporal Extraction Cost Guard

Temporal extraction is a separate Gemini call after the general extraction pass. Patch mode does not automatically reduce this call unless the temporal pass also knows what is already stored.

`runTemporalExtractPass` now:

- Sends compact digests of existing `timeline_event` entries for the active pack.
- Instructs the model to output `[]` for already-recorded scene memories.
- Uses the same input payload for patch ON/OFF and changes only the output instruction.
- ON expects `{"op":"patch","id":...}` for changed existing timeline events and `{"op":"add","entry":...}` for new ones.
- OFF expects full updated `timeline_event` objects.

The earlier same-context API skip was removed because it hid repeated-test cost rather than fixing the extraction contract.

## Manual Extract Completion Alert

Manual extraction now shows the completion alert only after all configured work finishes:

- General extraction.
- Automatic embedding, when enabled and there are changed entries.
- Temporal extraction, when enabled.

The alert no longer blocks temporal extraction or embedding by waiting for user confirmation mid-pipeline.
The alert includes the number of embeddings actually generated, so `0` means the embedding pass was reached but all current embeddings were already fresh.

## UI Bootstrap Flow

```text
userscript document-start on any crack.wrtn.ai route
  -> create __LoreInj queues and __LoreInjReady
  -> if route is not chat: do not load heavy modules
  -> if route becomes chat: fetch module sources from jsDelivr
  -> eval fetched module bundle in the userscript sandbox
  -> submenus call registerMenu/registerSubMenu
  -> loader detects required flags
  -> __LoreInjReady resolves
  -> injecter-6-ui waits for ModalManager
  -> injecter-6.setupSubMenus(modal)
  -> fixed-order menu registration
  -> Chasm Tools entry point injected
```

## Main Settings Status Panel

`injecter-6-sub-main.js` now renders a lightweight status summary before the preset buttons:

- API configured / missing.
- Active lore packs for the current URL.
- Number of usable entries from active packs.
- Auto extraction state.
- Semantic search state.

The panel reads from `settings.config`, `settings.config.urlPacks[C.getCurUrl()]`, and `db.entries`. It does not mutate settings or DB state.

## UI Copy And Settings Grouping

Visible settings copy is intentionally short and beginner-facing. Korean UI text should avoid implementation terms when there is a clear user-facing phrase:

- `timeline_event` is shown as important scene memory.
- `patch mode` is shown as save only changes.
- `temporal judge` is shown as choosing relevant past scenes.
- `embedding` is shown as semantic search or search preparation.

`injecter-6-sub-api.js` keeps the three API routes unchanged:

- API Key uses `autoExtKey`.
- Vertex JSON uses `autoExtVertexJson`, `autoExtVertexLocation`, and `autoExtVertexProjectId`.
- Firebase uses `autoExtFirebaseScript`, plus `autoExtFirebaseEmbedKey` for semantic-search preparation.

The API settings screen groups controls into API connection and model selection, while extraction, conversion, temporal extraction, rerank, and refiner continue to read the same settings keys.

The UI was later tightened so responsibilities are clearer:

- `injecter-6-sub-api.js` owns API connection and all API-model choices.
- Extraction settings no longer render the temporal recall judge model selector; it only controls whether the judge runs and how many candidates/time it may use.
- `injecter-6-sub-api.js` also registers a separate `프롬프트 관리` submenu for prompt editing.
- Prompt editing for extraction templates, candidate rerank, and refiner custom prompt is centralized in `프롬프트 관리`.
- `injecter-6-sub-refiner.js` keeps template/topic controls for refiner behavior, but the prompt textarea is a read-only preview. Free-form prompt editing is done from `프롬프트 관리`.

## Known High-Risk Areas

- Loader partial gate can still mount UI with missing submenus if some submodules fail permanently, but late successful registrations now remount automatically.
- The loader now avoids metadata `@require` for project modules. The main page only runs a lightweight route watcher; the heavy stack loads after a chat/episode route is reached.
- Dynamic module loading uses normal `fetch` from jsDelivr and evaluates the concatenated bundle in the userscript sandbox. It intentionally avoids `GM_xmlhttpRequest` for module downloads to prevent Tampermonkey runtime permission prompts.
- Platform calls must not assume `CrackUtil` is available as an unqualified global after dynamic eval. Use the safe `core-platform.js` helper so chat id, log extraction, persona lookup, and pack naming do not silently fall back to empty values.
- Extraction patch mode depends on stable `id` values being sent to the model.
- Patch-mode full-object fallback must pass through the merge layer. No-op writes are skipped by post-merge content signatures, not by a narrow pre-merge guard, because summary/detail/inject-only changes are valid updates.
- Temporal recall judge is intentionally best-effort. It has a longer timeout and one retry, then falls back to deterministic recall rather than blocking insertion.
- Rerank UI settings must remain connected to `core-search.smartRerank`.
- Multiple defaults exist across `core-kernel.js` and `injecter-3.js`; setting drift is possible.
- `crack-lore-core.user.js` appears to be a legacy single-file bundle and should not be deleted until distribution paths are confirmed.

## User-Facing Terminology Map

Internal names are still kept in code and JSON where they are part of storage or prompt contracts, but settings/help text should prefer beginner-facing terms:

- `embedding` -> semantic search / search preparation.
- `timeline_event` -> important scene memory.
- `patch mode` -> save only changes.
- `temporal judge` -> choose relevant past scenes.
- `reranker` -> re-rank candidates.
- `reasoning level` -> thinking depth.
- `full / compact / micro` -> long / short / very short.

This keeps existing behavior stable while reducing implementation jargon in the UI.
