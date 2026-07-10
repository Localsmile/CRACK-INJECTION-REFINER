# Runtime and Data Contracts

This file defines the runtime contracts needed to recreate the same behavior.

## Userscript Contract

The universal bundle metadata targets:

- `https://crack.wrtn.ai/stories/*/episodes/*`
- `https://crack.wrtn.ai/characters/*/chats/*`
- `https://crack.wrtn.ai/u/*/c/*`

It requires:

- Dexie 4.2.1
- `GM_addStyle`
- `GM_xmlhttpRequest`
- `unsafeWindow`
- `@sandbox raw`
- `@run-at document-start`
- Connect permissions for Google, Firebase, WRTN/Crack APIs, and wildcard fallback.

`document-start` is important because the WebSocket `send` wrapper must be installed before the app sends chat payloads.

## Dexie Database

Database name: `lore-injector`.

Current schema version: 10.

Tables:

- `entries`
- `packs`
- `snapshots`
- `embeddings`
- `workingMemory`
- `encounters`
- `entryVersions`
- `cleanupQueue`

### `entries`

Important indexes:

- `++id`
- `name`
- `type`
- `packName`
- `project`
- `rootId`
- `isCurrentArc`
- `createdTurn`
- `updatedTurn`
- `lastMentionedTurn`
- `eventTurn`
- `sceneId`
- `arcId`
- `realTimestamp`
- multi-entry `entities`, `subjects`, `objects`, `locations`, `promises`, `triggers`

Typical general lore entry:

```json
{
  "id": 1,
  "type": "character|identity|location|item|event|concept|setting|rel|relationship|prom|promise",
  "name": "Entity Name",
  "packName": "Pack Name",
  "enabled": true,
  "triggers": ["Name", "A&&B", "~fuzzy"],
  "summary": {
    "full": "Self-contained continuity record.",
    "compact": "Compact continuity state.",
    "micro": "Name=current state"
  },
  "inject": {
    "full": "Short direct injection text.",
    "compact": "Shorter direct injection text.",
    "micro": "Name=status"
  },
  "embed_text": "keyword cluster for search",
  "state": "current state",
  "detail": {},
  "timeline": {
    "eventTurn": 0,
    "relativeOrder": "current|past|foreshadow",
    "sceneLabel": "",
    "observedRecency": "recent|old|unknown"
  },
  "entities": [],
  "subjects": [],
  "objects": [],
  "locations": [],
  "promises": [],
  "imp": 5,
  "sur": 5,
  "emo": 5,
  "gs": 15,
  "src": "ax|im|us|sh",
  "source": "auto_extracted|imported|user_stated|temporal_extracted|shard_split",
  "ts": 0,
  "lastUpdated": 0
}
```

Relationship and promise entries may add:

- `parties`
- `call`
- `callState`
- `callDelta`
- `callHistory`
- `cond`
- `eventHistory`
- `arc`

Anchored entries use:

```json
{ "anchor": true }
```

Anchors protect summary, state, detail, call, inject, condition, scores, timeline, entities, and arc during automatic merge. Only trigger/event/call append paths should be allowed where source code explicitly permits them.

### `timeline_event` Entries

Timeline entries are distinct from generic lore:

```json
{
  "type": "timeline_event",
  "eventId": "te_<hash>",
  "title": "Short event title",
  "name": "Stable recall handle",
  "when": {
    "turnStart": 0,
    "turnEnd": 0,
    "relative": "past|current|foreshadow",
    "anchor": "RP-understandable time anchor",
    "inferredOrder": "",
    "confidence": 0.8
  },
  "participants": [],
  "location": "",
  "actions": [],
  "emotions": {},
  "summary": {
    "full": "Self-contained event memory.",
    "compact": "Event + consequence + hook.",
    "micro": "Handle=current meaning"
  },
  "hooks": [],
  "linkedLore": [],
  "recallTriggers": [],
  "triggers": [],
  "imp": 6,
  "emo": 5,
  "sur": 6,
  "gs": 17,
  "timelineSchemaVersion": 1,
  "compressionState": "compact"
}
```

Timeline events use `eventId`, `when.anchor`, and type-specific matching. They must not be merged into normal lore entries.

### `packs`

```json
{
  "name": "Pack Name",
  "entryCount": 0,
  "project": ""
}
```

### `snapshots`

```json
{
  "id": 1,
  "packName": "Pack Name",
  "timestamp": 0,
  "label": "자동 저장",
  "type": "auto|manual",
  "data": [],
  "dataGzip": "optional base64url gzip payload",
  "dataEncoding": "gzip|empty"
}
```

Maximum retained snapshots per pack: 3. Existing plain rows remain readable; sufficiently large new or migrated rows may store gzip data instead.

### `embeddings`

Current embedding rows include:

- `entryId`
- `packName`
- `model`
- `field`
- `sourceHash`
- `entryUpdatedAt`
- `schemaVersion`
- unique compound `[entryId+field]`
- `vector`
- `taskType`
- `textLength`

Supported fields:

- `summary`
- `condition`

Embeddings are stale if:

- The entry no longer exists.
- The pack changed.
- The model changed.
- The field source hash changed.
- Schema version is old.
- Gemini `embedding-001` task type is not `RETRIEVAL_DOCUMENT` for document embeddings.

### `workingMemory`

Keyed by URL:

```json
{
  "url": "/characters/.../chats/...",
  "scene": "",
  "emotion": "",
  "activeChars": [],
  "lastAction": "",
  "turn": 0,
  "updatedAt": 0
}
```

### `encounters`

Tracks first meetings and reunions:

- `char1`
- `char2`
- unique `[char1+char2]`
- `firstMetTurn`
- `lastSeenTurn`
- `totalEncounters`
- `lastSeenAt`

### `entryVersions`

Append-only safety snapshots before destructive entry updates:

```json
{
  "id": 1,
  "entryId": 1,
  "ts": 0,
  "turn": 0,
  "reason": "extract_merge|extract_patch|temporal_patch|pre_restore",
  "snapshot": {}
}
```

Maximum retained versions per entry: 20.

### `cleanupQueue`

Stores pending injected-message cleanup tasks:

```json
{
  "id": "hash",
  "chatKey": "chat:<id>",
  "chatId": "<id>",
  "messageId": null,
  "turn": 0,
  "cleanupAfterTurns": 8,
  "createdAt": 0,
  "completedAt": 0,
  "status": "pending|tracked|done|failed|stale",
  "position": "before|after",
  "originalText": "",
  "injectedText": "",
  "finalText": "",
  "originalHash": "",
  "injectedHash": "",
  "finalHash": "",
  "linkAttempts": 0,
  "cleanupAttempts": 0
}
```

## localStorage Contracts

Main settings:

- `lore-injector-v5`

Other important keys:

- `lore-injector-v5-backups`
- `lore-injector-last-save-error`
- `lore-local-migration-version`
- `lore-local-migration-status`
- `lore-turn-counters`
- `lore-last-mention`
- `lore-contradictions`
- `lore-hybrid-stats`
- `lore-recent-injections:<chatKey>`
- `lore-fe-recent-<chatKey>`
- Legacy cleanup key: `lore-injection-cleanup-v1`
- Refiner processed keys: `speech-refiner-processed:<chatId>`
- Legacy refiner key: `speech-refiner-processed`
- Legacy refiner settings key: `speech-refiner-v1`

## Stable Chat State Keys

The code prefers `chat:<id>`.

Fallbacks:

- Current path.
- Current URL from `C.getCurUrl()`.
- Legacy URL entries that contain the chat ID.

Per-chat maps include:

- `urlPacks`
- `urlDisabledEntries`
- `urlAutoExtPacks`
- `urlCooldownMaps`
- `urlExtLogs`
- `urlInjLogs`
- `urlRefinerLogs`
- `urlTurnCounters`

A refactor must read legacy keys and migrate values to the stable `chat:<id>` key when discovered.

## Settings Contract

Default settings are defined in `injecter-3.js`. Major groups:

- Injection: `enabled`, `position`, `prefix`, `suffix`, `scanRange`, `scanOffset`, `maxEntries`, `cooldownEnabled`, `cooldownTurns`, cleanup settings.
- Extraction: `autoExtEnabled`, `autoExtTurns`, scan/offset/retry settings, prompt templates, patch mode, DB digest limit.
- API: provider type, provider credentials, per-feature models, thinking/reasoning settings, token budgets.
- Timeline: extraction, retrieval, compression, judge model, judge prompt/schema.
- Storage/UI: templates, active packs, disabled entries, turn/cooldown/log maps.
- Search: `embeddingEnabled`, `embeddingModel`, `embeddingWeight`, active char detection, decay, periodic recall.
- Refiner: enable flags, model, prompt, topics, context turns, lore mode, match turns.
- Migration: local migration version and status.

Settings save has a quota recovery path: it prunes log maps and retries. This behavior should be preserved.
