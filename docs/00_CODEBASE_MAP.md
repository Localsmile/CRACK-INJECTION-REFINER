# CRACK Injection Refiner Codebase Map

This document is based only on the current source tree in `CRACK-INJECTION-REFINER-260629-hotfix`.
It does not rely on previous memory or external web research.

## Product Summary

The project is a userscript system for `https://crack.wrtn.ai` chat pages. It does four large jobs:

1. Intercepts outgoing user messages and injects relevant lore context.
2. Extracts lore and timeline memories from chat logs through external model APIs.
3. Stores, searches, edits, imports, exports, backs up, and restores lore data.
4. Optionally reviews the latest assistant response and patches it if it contradicts lore or memory.

The active modular implementation lives in `embedding/`. Older or bundled artifacts exist in:

- `embedding_pre/`: router/chat userscript entry scripts.
- `universal_bundle_work/`: build scripts, bundle manifest, and generated single-file bundle.
- `BETA/`: older beta userscript snapshots.
- `user_note/`: separate user note lorebook script.
- `LORE_TEST/`: test/sample lore JSON.

For refactoring, treat `embedding/` plus `universal_bundle_work/bundle-manifest.json` as the primary source of truth.

## Load Order

`universal_bundle_work/bundle-manifest.json` defines the current full runtime order:

1. Vendor UI/platform helpers
   - `embedding/vendor/toastify-injection.js`
   - `embedding/vendor/crack-shared-core.js`
   - `embedding/vendor/chasm-shared-core.js`
   - `embedding/vendor/decentralized-modal.js`
2. Lore core modules
   - `core-ui.js`
   - `core-kernel.js`
   - `core-platform.js`
   - `core-memory.js`
   - `core-format.js`
   - `core-search.js`
   - `core-embedding.js`
   - `core-pricing.js`
   - `core-importer.js`
3. Refiner modules
   - `refiner-prompts.js`
   - `refiner-dom.js`
   - `refiner-core.js`
   - `refiner-queue.js`
   - `refiner-observer.js`
   - `refiner.js`
4. Injector runtime modules
   - `injecter-1.js`
   - `injecter-2.js`
   - `injecter-3.js`
   - `injecter-4.js`
   - `injecter-5.js`
   - `injecter-6.js`
5. UI submenu modules
   - `injecter-6-sub-main.js`
   - `injecter-6-sub-lore.js`
   - `injecter-6-sub-merge.js`
   - `injecter-6-sub-snapshot.js`
   - `injecter-6-sub-file.js`
   - `injecter-6-sub-backup.js`
   - `injecter-6-sub-extract.js`
   - `injecter-6-sub-refiner.js`
   - `injecter-6-sub-log.js`
   - `injecter-6-sub-session.js`
   - `injecter-6-sub-api.js`
   - `injecter-6-sub-help.js`
   - `injecter-6-ui.js`

The order matters. Most modules use readiness flags such as `__kernelLoaded`, `__settingsLoaded`, `__extractLoaded`, `__injectLoaded`, and submenu flags. A refactor must preserve equivalent dependency gates, or replace them with one explicit bootstrap orchestrator.

## Main Global Namespaces

### `window.__LoreCore`

Created by `core-kernel.js`. Extended by all `core-*` modules. It owns:

- Constants and defaults.
- Dexie database access.
- API wrappers.
- Chat platform fetch helpers.
- Embedding helpers.
- Memory/ranking utilities.
- Formatting and injection assembly.
- Import/export conversion helpers.
- Cost tracking.
- Shared UI utilities.

### `window.__LoreInj`

Created by injector modules. It owns:

- Userscript version and prompt constants.
- Settings object and default settings.
- URL/chat-state helpers.
- Extraction pipeline.
- Injection pipeline.
- Modal menu registration.
- UI submenu callbacks.
- Feature-level API option builders.

### `window.__LoreRefiner`

Created by refiner modules. It owns:

- Refiner prompts and dynamic prompt builder.
- Assistant response observer.
- Queue/worker state.
- Lore/memory/context collection for response review.
- Server PATCH and DOM refresh helpers.
- Manual/automatic refiner actions.

## Route Model

The supported chat routes are:

- `/characters/<id>/chats/<id>`
- `/stories/<id>/episodes/<id>`
- `/u/<id>/c/<id>`

`embedding_pre/erie_crack_inject.user.js` is a light router. It detects SPA navigation to chat paths and reloads so that the full chat userscript can bootstrap at `document-start`.

## Primary Feature Inventory

### Message Interception

- WebSocket `send` interception for Socket.IO-style `send` events.
- Fetch POST fallback interception for bodies with `messages`, `content`, `message`, `text`, `prompt`, `query`, or matching nested `variables`.
- Injection is skipped when the outgoing message already contains `OOC:`.
- Failures fall back to original outgoing data.

### Lore Injection

- Per-chat active lore pack selection.
- Per-entry disable state.
- Trigger search, fuzzy `~trigger`, compound `A&&B`, and optional embedding search.
- Active character detection and ranking boost/penalty.
- Temporal graph ranking and timeline recall.
- Optional LLM rerank.
- Cooldown filtering.
- Optional delta skip.
- Budgeted context assembly under a 2,000 character outgoing input limit.
- Configurable injection position before or after the user message.
- Optional cleanup of previously injected user messages through server PATCH.

### Lore Extraction

- Automatic extraction every configured number of user turns.
- Manual extraction.
- Batch extraction of full logs.
- General lore extraction.
- Timeline event extraction.
- Patch mode or full-entry mode.
- Existing lore digest context to avoid duplicates.
- Persona name prefix support.
- DeepSeek-specific JSON object mode.
- JSON repair retry.
- Importance gating.
- Anchored entry protection.
- Snapshot before merge.
- Entry version history before overwrite.
- Auto embedding after extraction.

### Lore Storage and Editing

- Dexie tables for entries, packs, snapshots, embeddings, working memory, encounters, entry versions, and cleanup queue.
- JSON file import/export.
- Full backup export/import including settings, localStorage state, embeddings, and conflicts.
- Server backup/sync with password-derived encryption.
- Manual JSON entry input.
- Pack on/off and entry on/off.
- Anchor toggle.
- Per-pack embedding generation and stale embedding cleanup.
- Snapshot restore/delete.
- Similar entry merge.

### API Providers

Generation providers:

- Gemini API Key.
- Firebase Vertex AI script.
- Vertex service account JSON.
- DeepSeek.
- OpenAI-compatible chat/completions server.

Embedding provider:

- Gemini embeddings only in practice.
- When generation uses DeepSeek or OpenAI-compatible, embedding falls back to a separate Gemini embedding key.

### Refiner

- Detects completed assistant responses through MutationObserver and polling.
- Queues one response at a time.
- Collects active lore, platform memories, recent dialogue, and call-state context.
- Calls configured generation provider.
- Accepts PASS, replacement-list, or full refined text JSON.
- Patches the latest assistant message on the server.
- Tries to update visible React UI through store/fiber mutation, direct markdown replacement, native rerender nudges, and finally a reload prompt.

## High-Risk Compatibility Points

Do not lose these during refactor:

- `__loreRegister(fn)` is how interception receives the final injection function.
- Per-chat state should prefer stable `chat:<id>` keys but still read legacy URL keys.
- `lore-injector-v5` settings in localStorage must migrate forward.
- Dexie database name is `lore-injector`.
- Existing entries may use old summary/inject formats and must pass local migration.
- Anchored entries must protect narrative fields during extraction merges.
- Timeline events must not be merged into normal lore by name alone.
- Search embeddings must be invalidated when source content changes.
- Cleanup queue must survive localStorage quota failures by using Dexie `cleanupQueue`.
- Refiner processed fingerprints are stored per chat under `speech-refiner-processed:<chatId>`.

