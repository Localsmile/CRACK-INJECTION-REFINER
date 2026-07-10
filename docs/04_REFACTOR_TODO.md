# Refactor TODO and Rebuild Plan

> Long-range reference only. This is not a description of the current tree. The 260710 maintenance pass deliberately implements bounded improvements in place; see `05_260710_AUDIT_IMPLEMENTATION_PLAN.md`.

Goal: make the code maintainable, preserve all behavior, and make future UI/UX changes safer.

## Refactor Principles

1. Preserve behavior first.
2. Replace global readiness flags with one bootstrap state machine.
3. Keep runtime contracts explicit.
4. Move user-facing copy into one dictionary.
5. Separate domain logic from UI construction.
6. Use small services with typed input/output contracts.
7. Keep provider-specific API logic behind adapters.
8. Keep storage migrations isolated and testable.

## Proposed Architecture

### Suggested folders

```text
src/
  bootstrap/
    userscript-entry.js
    module-loader.js
    route-gate.js
  platform/
    crack-api.js
    interceptors.js
    chat-logs.js
    dom-entry-button.js
  storage/
    db.js
    settings-store.js
    migrations.js
    backup-codec.js
  api/
    provider-gemini.js
    provider-vertex.js
    provider-firebase.js
    provider-deepseek.js
    provider-openai-compatible.js
    cost-tracker.js
  memory/
    normalize-entry.js
    merge-entry.js
    search.js
    embeddings.js
    timeline.js
    budget-planner.js
    cleanup-queue.js
  extraction/
    prompts.js
    extract-runner.js
    batch-extract-runner.js
    import-runner.js
  injection/
    inject-runner.js
    injected-message-cleanup.js
  refiner/
    observer.js
    queue.js
    refiner-runner.js
    dom-patcher.js
    prompts.js
  ui/
    modal-shell.js
    screens/
    components/
    copy.js
  diagnostics/
    logs.js
    health.js
```

### Service boundaries

#### Interceptor service

Public API:

```js
installInterceptors({ injectMessage })
```

Must preserve:

- WebSocket and fetch paths.
- OOC skip guard.
- Original message fallback on error.

#### Storage service

Public API:

```js
getDB()
loadSettings()
saveSettings(config)
migrateLocalState()
getChatStateKey(url)
```

Must preserve:

- Dexie schema.
- localStorage keys.
- stable `chat:<id>` migration.
- quota recovery save path.

#### API service

Public API:

```js
callGeneration(prompt, options)
embedTexts(texts, options)
recordCost(event)
```

Must preserve:

- Gemini safety settings.
- Vertex JWT flow.
- Firebase warmup/config parsing.
- DeepSeek JSON object mode.
- OpenAI-compatible reasoning retry behavior.
- Cost event shape and cumulative cost keys.

#### Memory service

Public API:

```js
normalizeLoreEntry(entry, context)
mergeExtractedEntries(entries, context)
searchRelevantEntries(query, context)
planInjection(input, candidates, context)
```

Must preserve:

- Summary/inject tiers.
- `imp + sur + emo` gating.
- Anchored entry protection.
- Timeline event separation.
- Event history sharding.
- Entry version snapshots.
- Embedding invalidation.

#### UI service

Public API:

```js
mountEntryButton()
openModal()
registerScreen(key, screen)
```

Must preserve:

- ModalManager integration.
- Existing menu registration order until new UI fully replaces it.
- Non-chat route no-op plus SPA reload behavior.

## Incremental Refactor Plan

### Phase 1: Documentation and behavior locking

- Keep source unchanged.
- Add this documentation set.
- Add smoke checks for module load order and key globals.
- Add fixtures for:
  - WebSocket payload injection.
  - Fetch body injection.
  - Entry normalization.
  - Merge patch.
  - Budget planning.
  - Timeline event normalization.

### Phase 2: Copy extraction

- Create a central `ui/copy.js`.
- Move all user-facing labels, buttons, alerts, and status texts into keys.
- Keep Korean strings initially, but group by screen.
- Add a second English/plain-language map later if desired.
- Replace provider nicknames and developer phrases first.

### Phase 3: Storage isolation

- Move Dexie schema and localStorage settings helpers to one storage module.
- Keep old global exports by assigning wrappers to `__LoreCore` and `__LoreInj`.
- Add migration tests for:
  - Old summary string to tiered summary.
  - Old inject object missing levels.
  - call/callHistory to callState.
  - URL keys to `chat:<id>`.
  - stale embeddings cleanup.

### Phase 4: API adapters

- Split provider calls out of `core-kernel.js`.
- Keep one normalized result shape:

```js
{
  text: "",
  status: 200,
  error: "",
  retries: 0,
  usage: {},
  cost: {}
}
```

- Preserve `callGeminiApi` as a compatibility alias until all callers are moved.

### Phase 5: Extraction service

- Move prompt rendering, JSON parsing/repair, and merge orchestration into `extraction/`.
- Keep model/provider option building separate.
- Add test fixtures for DeepSeek object output and normal array output.

### Phase 6: Injection service

- Move `inject(userInput)` into a pure orchestration function with injected dependencies.
- Move cleanup queue into `memory/cleanup-queue.js`.
- Add tests for:
  - no active packs.
  - cooldown all filtered.
  - over-limit user message.
  - temporal-only injection.
  - cleanup exact restore.
  - cleanup unsafe partial skip.

### Phase 7: Refiner service

- Isolate server PATCH from DOM update.
- Keep React fiber patching as a last-resort adapter with diagnostics.
- Make manual confirmation UI independent from refiner core.

### Phase 8: New task-first UI

- Introduce new top-level IA while keeping old functions as backing actions.
- Hide advanced prompt/schema controls behind Advanced sections.
- Rename labels using the glossary in `03_UI_UX_AUDIT.md`.
- Make destructive operations show clear consequences.

## Behavior-Preservation Checklist

Before replacing old code, verify:

- Outgoing message without relevant lore is unchanged.
- Outgoing message with relevant lore stays below 2,000 chars.
- Position before/after works.
- Active pack and disabled entry state are respected.
- Cooldown works by stable chat key.
- Auto extraction triggers every configured turn count.
- Manual extraction runs even when auto extraction is off.
- Batch extraction handles empty, failed, retry, and temporal sub-results.
- Anchored entries keep protected fields after merge.
- Timeline events are recalled only through temporal flow, not generic lore formatter.
- Embeddings are regenerated only when stale.
- Imported URL/text packs are enabled.
- Full backups restore settings, packs, entries, local state, and optional embeddings.
- Refiner PASS does not patch.
- Refiner replacement patches server and updates visible UI or shows reload action.
- Injection cleanup restores original user message after configured turns.

## Known Refactor Risks

- The current code has broad globals and silent catch blocks. Removing them may surface hidden dependency timing issues.
- DOM/fiber refiner code is tightly coupled to the current Crack/WRTN React internals.
- Fetch interception can touch too many POST bodies because the URL check includes broad `wrtn.ai`.
- Settings are large and may hit localStorage quota if logs grow.
- Provider-specific reasoning options can be rejected by OpenAI-compatible servers; the retry behavior must stay.
- DeepSeek expects JSON object mode in several paths while Gemini paths mostly expect arrays.
- Timeline event scoring is mixed between generic hybrid search and deterministic recall.
- Current UI creation is imperative and duplicated, so copy-only changes can accidentally change behavior if mixed with logic edits.

## Minimum First Implementation Target

For a clean rewrite, implement this minimal vertical slice first:

1. Bootstrap on chat route.
2. Dexie schema and settings load/save.
3. Active pack selection.
4. WebSocket message interception.
5. Trigger-only search.
6. Budget planner.
7. Before/after injection.
8. Injection log.
9. Entry button and one simple modal screen.

Then add, in order:

1. Embedding search.
2. Auto extraction.
3. Import/export.
4. Timeline recall.
5. Cleanup queue.
6. Refiner.
7. Backup/sync.
8. Advanced prompt/model UI.
