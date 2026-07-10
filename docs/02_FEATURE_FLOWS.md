# Feature Flows

This document explains how each major feature runs from event to storage/writeback.

## 1. Bootstrap Flow

1. Userscript loads at `document-start`.
2. Vendor modules become available.
3. `core-kernel.js` creates `__LoreCore`, Dexie schema, API wrappers, settings helpers.
4. Other `core-*` modules extend `__LoreCore`.
5. Refiner modules create `__LoreRefiner`.
6. `injecter-1.js` installs WebSocket/fetch interceptors and exposes `window.__loreRegister(fn)`.
7. `injecter-2.js` installs prompt constants, schemas, and OOC formats.
8. `injecter-3.js` loads settings, performs local migration on chat routes, initializes refiner runtime, and exposes settings utilities.
9. `injecter-4.js` exposes extraction functions.
10. `injecter-5.js` registers the final `inject(userInput)` function with `__loreRegister`.
11. `injecter-6.js` installs menu registration queues.
12. Submenu modules register UI callbacks.
13. `injecter-6-ui.js` waits for readiness, mounts the modal menus, and inserts the entry button.

## 2. Message Interception Flow

### WebSocket Path

Source: `injecter-1.js`.

1. Wrap `window.WebSocket.prototype.send`.
2. For string frames, find the first `[` and parse the JSON tail.
3. Match Socket.IO-style array:

```json
["send", { "message": "user text" }]
```

4. Skip if message contains `OOC:`.
5. Call registered async injection function.
6. If changed, replace `arr[1].message`.
7. Rebuild `prefix + JSON.stringify(arr)` and send through original WebSocket.
8. On any parse/injection error, send original data.

### Fetch Fallback Path

Source: `injecter-1.js`.

1. Wrap `window.fetch`.
2. Only inspect POST requests whose URL includes `/messages`, `/chat`, or `wrtn.ai`.
3. Clone/read JSON body.
4. Try message fields in order:
   - Latest `body.messages[i]` where `role === "user"` and `content` is string.
   - Top-level `content`, `message`, `text`, `prompt`, `query`.
   - Nested `body.variables.content|message|text|prompt|query`.
5. Skip field if it already contains `OOC:`.
6. Call injection function.
7. Replace request body only if changed.
8. Continue with original fetch.

## 3. Injection Flow

Source: `injecter-5.js`.

Input: original user message.

Output: original message or message with OOC lore block inserted before/after.

Steps:

1. Return original text if global injection is disabled.
2. Resolve current URL and stable chat key.
3. Increment the per-chat turn counter.
4. Schedule cleanup of older injected messages.
5. If automatic extraction is enabled and turn count hits `autoExtTurns`, schedule `runAutoExtract(false)`.
6. Resolve active packs for this chat.
7. Load entries for active packs from Dexie.
8. Remove disabled entries.
9. Fetch recent logs. Count is `max(20, scanRange * 3)`.
10. Build embedding API options for search.
11. Build search config from settings.
12. Run `C.hybridSearch`.
13. Add deterministic temporal recall candidates through `C.resolveTemporalRecall`.
14. Optionally run temporal recall judge.
15. Optionally run LLM rerank.
16. Apply cooldown filtering.
17. Optionally apply delta skip.
18. Build timeline recall plan.
19. Exclude timeline events from normal lore section.
20. Pick top normal lore entries up to `maxEntries`.
21. If no normal lore and no timeline recall text, log and return original.
22. Check the 2,000 character max input guard.
23. Build supplemental sections:
   - Honorific matrix.
   - First encounter warning.
   - Reunion tags.
   - Current scene tag.
   - Temporal hints.
   - Temporal recall block.
24. Update working memory.
25. Call `C.planInjectionBudget`.
26. If planner returns no injection, log and return original.
27. Record entry mentions and cooldown turns.
28. Update hybrid stats and recent injection records.
29. Log injection metadata.
30. Build final message:
   - `before`: `injected + "\n\n" + userInput`
   - `after`: `userInput + "\n\n" + injected`
31. Queue cleanup task for later server PATCH.
32. Return final message.

## 4. Search Flow

Source: `core-search.js` and `core-memory.js`.

### Trigger Scan

Input pool:

- User input.
- Recent messages from `scanRange`, offset by `scanOffset`.

Trigger types:

- Plain trigger: substring match, with stricter word-boundary logic for non-CJK text when strict mode is enabled.
- Compound trigger: `A&&B`; all parts must be present.
- Fuzzy trigger: `~pattern`; uses bigram similarity when `similarityMatch === true`.

### Embedding Search

Runs only when:

- `embeddingEnabled` is true.
- An embedding API key or Vertex/Firebase embedding configuration exists.
- `C.embedText` exists.

Steps:

1. Query text is user input plus recent tail, capped at 2,000 chars.
2. Query task type is `RETRIEVAL_QUERY` for Gemini embedding models.
3. Load stored embeddings for enabled entries.
4. Reject stale/wrong pack/wrong hash embeddings.
5. Score by cosine similarity.
6. Condition embeddings get a 1.2 boost.
7. Only scores above threshold contribute.

### Score Composition

The base score blends:

- Trigger score.
- Embedding score.

Then adds or adjusts:

- Reinjection score based on last mentioned turn.
- First-time mention boost.
- Shard penalty for inactive arcs.
- Active character boost/penalty for character/identity entries.
- Entity graph overlap.
- Relationship graph score.
- Temporal recency.
- Unresolved priority.
- Maintenance recall.
- Timeline recall score.
- Anchor boost when periodic recall is enabled.

### LLM Rerank

If enabled:

1. Truncate candidates.
2. Render candidate summaries.
3. Ask configured model for 1-5 scores.
4. Blend LLM score with hybrid score.
5. Keep anchor entries even if LLM score is low.
6. If all candidates are dropped, keep original hybrid order.

## 5. Injection Budget Flow

Source: `core-format.js`.

Main planner: `planInjectionBudget`.

Hard limit: 2,000 final characters.

Budget procedure:

1. Measure user input.
2. Measure wrapper overhead from prefix/suffix.
3. Reserve space for critical sections in this order:
   - Scene tag.
   - Temporal recall block.
   - First encounter block.
   - Reunion tags.
   - Honorific matrix.
   - Temporal hints.
4. Use remaining chars up to `loreBudgetMax` for normal lore.
5. Group entries by entity unless `bundleByEntity === false`.
6. Sort by priority.
7. Try preferred level:
   - High priority: full.
   - Medium priority: compact.
   - Low priority: micro.
8. Downgrade or drop entries that do not fit.
9. If final message still exceeds 2,000 chars, reduce lore budget.
10. If still too long, keep only critical sections.
11. If still too long, cancel injection.

The final injected text is:

```text

<prefix>
<critical sections>
<lore lines>
<suffix>
```

## 6. Injection Cleanup Flow

Source: `injecter-5.js`.

Purpose: keep chat history clean by removing injected OOC blocks from the user messages stored on the server after a configured number of turns.

Steps:

1. After sending an injected message, create a cleanup queue item.
2. Save queue in Dexie `cleanupQueue`; fallback to `localStorage` if needed.
3. Later, fetch recent raw logs.
4. Link cleanup items to actual server message IDs by exact final text match.
5. Count user turns after the injected message.
6. When enough turns passed, fetch the message by ID.
7. Safely remove injected text:
   - Exact full-message match restores original text.
   - Partial removal allowed only if both original and injected blocks are found and resulting hash matches original.
8. PATCH server message with original text.
9. Mark cleanup item done, failed, or stale.

Failure is non-fatal and logged.

## 7. Extraction Flow

Source: `injecter-4.js`.

### Automatic or Manual Extraction

Entry: `runAutoExtract(isManual)`.

1. Serializes concurrent extraction through `_extQ`.
2. Shows status badge.
3. Calls `_doExtract`.
4. If turns accumulated while running, runs again.

### `_doExtract`

1. Validate generation API settings.
2. Fetch recent logs:
   - `(autoExtScanRange + pendingTurns + autoExtOffset) * 2`
3. Drop the latest offset window.
4. Convert messages to `role: message` text.
5. If enabled, build existing lore digest for the current auto-extract pack.
6. If enabled, fetch persona name and prepend user persona instruction.
7. Select active template and provider-specific prompt.
8. Add output mode:
   - Patch mode: add/patch operations.
   - Full mode: full updated entries.
9. Build API options for feature `autoExtract`.
10. Call model.
11. Parse JSON loosely.
12. If parsing fails, make one JSON repair request.
13. Normalize result items.
14. If required, call the temporal extractor and stage its patches/events without writing.
15. After every required API result is valid, snapshot the complete target pack state.
16. Commit general entries, temporal patches, and temporal events.
17. Restore entries, pack metadata, embeddings, entry versions, snapshots, and auto-pack state if any commit step fails.
18. Auto-generate derived embeddings after the logical commit succeeds.
19. Log the committed result.
20. Manual mode shows an alert summary.

### Batch Extraction

Entry: `runBatchExtract(opts)`.

1. Fetch all logs.
2. Split into batches by turns, with overlap.
3. For each batch:
   - Build prompt.
   - Call model.
   - Parse and repair.
   - Stage results in memory.
   - Retry failed batch locally.
   - Optionally stage timeline extraction per batch.
4. Commit all staged results only after every required batch succeeds.
5. Restore the complete pack state if collection or commit fails.
6. Aggregate costs and results.
7. Auto-embed final pack if enabled.
8. Return report.

## 8. Merge Flow

Source: `injecter-4.js`.

Entry: `mergeExtractedData(entries, url)`.

1. Resolve auto-extract pack name.
2. Ensure pack exists.
3. Create snapshot before merge if pack already exists.
4. Normalize each item:
   - `op: patch` goes to patch path.
   - `op: add` unwraps `entry`.
   - Full object goes to normal merge path.
5. Normalize lore entry through `C.normalizeLoreEntry`.
6. Compute gate score `gs = imp + sur + emo`.
7. If importance gating is enabled and score is below threshold, skip.
8. For timeline events, compute stable event ID.
9. Find existing entry:
   - Timeline: match `eventId`, or name plus `when.anchor`.
   - Normal: exact name/type, then fuzzy existing matcher by parties/triggers/entities.
10. If existing:
   - Save entry version.
   - Detect contradiction on relationship/promise status changes.
   - Merge triggers, inject, state, call, callState, timeline, entities.
   - Append call history.
   - Append unique event history.
   - Shard old event history if more than 30 events.
   - Merge details by type.
   - Protect anchored narrative fields by restoring snapshots.
   - Restore timeline union fields for timeline events.
   - Normalize temporal graph.
   - If signature unchanged, skip write.
   - Invalidate embeddings.
   - Put entry.
11. If new:
   - Set pack/project/enabled/source/timestamps.
   - Normalize call/history/timeline graph.
   - Put entry.
12. Update pack count and activate pack when any entry changed.

## 9. Import Flow

Source: `core-importer.js`.

### Text Import

1. Split source text into chunks by `importChunkSize`.
2. Select provider-specific prompt.
3. For DeepSeek, use object shape `{"entries":[...]}`.
4. Call model for each chunk.
5. Parse JSON and normalize entries.
6. Create/enable pack.
7. Add entries with source `imported`.
8. Record import report on `C.__lastImportReport`.

### URL Import

1. Fetch URL text through:
   - GM direct request.
   - Browser fetch.
   - Public proxy fallbacks.
2. Strip scripts/styles and HTML tags.
3. Pass extracted text to text import.
4. Emit progress events for UI.

### JSON Import

1. Accept array of entries.
2. Normalize each entry.
3. Create/update pack.
4. Add imported entries.

## 10. Embedding Flow

Source: `core-embedding.js`.

1. Build embedding text from summary, inject, state, entities, timeline, event history, hooks, and call state.
2. Compute source hash.
3. Check existing embedding row by `[entryId+field]`.
4. If model, hash, pack, schema, and task type are fresh, reuse.
5. Generate summary embedding.
6. Generate condition embedding if condition text exists.
7. Store metadata and vector.

Pack embedding uses batches of 5 when possible and falls back to per-entry embedding on batch failure.

## 11. Refiner Flow

Sources: `refiner-observer.js`, `refiner-queue.js`, `refiner-core.js`, `refiner-dom.js`.

1. Observer watches DOM mutations and polls every 3 seconds.
2. On new assistant message:
   - Warmup skips the current existing message.
   - Then waits until content length is stable for more than 4 seconds.
3. Queue deduplicates by message ID or text fingerprint.
4. Worker calls `refineMessage`.
5. Refiner collects:
   - Active lore from active packs.
   - Relevant lore by semantic search or trigger fallback.
   - Platform memory through `fetchAllMemories`.
   - Recent dialogue with injected OOC stripped from user messages.
   - Call-state continuity context.
6. Build prompt from selected refiner template.
7. Call configured generation provider with feature `refine`.
8. Interpret result:
   - PASS keyword or `{ "pass": true }`: log pass and stop.
   - `{ "replacements": [...] }`: replace exact substrings.
   - `{ "refined_text": "..." }`: use full refined text.
9. If auto mode:
   - PATCH latest assistant message on server.
10. If manual mode:
   - Show confirmation modal.
   - User can keep original or apply edited refined text.
11. After server success, update visible UI:
   - Try React store/fiber mutation.
   - Try DOM markdown refresh.
   - Try native edit/cancel rerender nudge.
   - Show reload action if stale.
