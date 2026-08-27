# Trial storage compatibility incident

## Confirmed failure

Universal `1.4.0.260827-universal.1` was based on release schema v10. The browser
previously ran the memory-v2 trial using schema v11. Both use `lore-injector`.
This is a storage compatibility failure, independent of the send-ACK issue.

The trial replaces the unique encounter index `[char1+char2]` with
`[chatKey+char1+char2]`, allowing the same pair in separate chats. Opening that
database with the v10 declarations makes Dexie 4.2.1 attempt a schema repair.
Adding the old globally unique index fails when those per-chat records exist:

```text
AbortError: ConstraintError Unable to add key to index '[char1+char2]':
at least one key does not satisfy the uniqueness requirements.
```

The whole Dexie connection fails, not just the encounters table. UI panels
without error handling then appear empty. The attempted repair transaction was
aborted; a native readonly connection confirmed the data remained intact:

| Table | Rows |
| --- | ---: |
| entries | 76 |
| packs | 4 |
| embeddings | 80 |
| snapshots | 10 |
| entryVersions | 83 |
| encounters | 81 |
| cleanupQueue | 19 |
| workingMemory | 15 |

Native IndexedDB version remained 110 (Dexie version 11). No browser storage was
cleared, restored, or rewritten during investigation.

## Repair contract

- Release `.2` includes the exact v11 schema and encounter query helpers already
  used by the trial. Extraction and injection pass the stable chat key.
- Existing v11 databases open without a schema transition. Existing v10 users
  migrate to v11, preserving every table and adding an empty scope to legacy
  encounter rows. Legacy reverse-direction pairs remain readable in that scope.
  Importing an older backup applies the same empty scope to its encounter rows.
- Never deduplicate/delete user records merely to satisfy the obsolete index.
- Failed list reads display a load error, not a blank or empty-list result.
- Merely opening pack management no longer deletes empty packs or rewrites
  their entry counts.
- Failed database reads abort file/server backup generation. They must not be
  converted to empty arrays that can replace a usable backup.
- No database rename, API call, re-embedding, or lore-content migration is used
  to recover access. The previous deployed `260706-hotfix` branch is unchanged.

## Verification

Run `npm ci --prefix tests --ignore-scripts` then `node tests/run-regressions.js`.
The storage suite uses the actual Dexie 4.2.1 library with isolated fake-indexeddb
factories, not an ad hoc database mock. It reproduces the v10-on-v11 failure,
then checks v10 upgrades, v11 reopen without writes/version changes, preservation
of all table contents, per-chat encounter behavior, and list/backup failures.

The corrected `getDB` function was also evaluated against the real browser DB
through a separate guarded connection: any `upgradeneeded` event aborts and
database deletion is forbidden. It opened at v11/native 110 and read all counts
above unchanged, then closed. This verifies the real storage fix without
installing a userscript or replacing the running app connection. The installed
`.1` page still requires the user's `.2` update and reload; that full installed
UI check is not claimed by this read-only probe.
