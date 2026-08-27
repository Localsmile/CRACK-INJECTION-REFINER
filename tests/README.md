# Regression tests

Install the pinned test-only dependencies, then run all regressions:

```sh
npm ci --prefix tests --ignore-scripts
node tests/run-regressions.js
```

Storage tests use Dexie 4.2.1 (the distribution version) with isolated in-memory
IndexedDB factories. They do not connect to the browser or call any provider API.
They cover release v10 upgrades, reopening trial v11 data with duplicate pairs
across chats, preservation of every table, chat isolation, and failed-read UI and
backup behavior. The old v10-on-v11 failure is reproduced before testing the fix.
