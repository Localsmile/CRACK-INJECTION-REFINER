'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Dexie = require('dexie');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'embedding', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const quiet = { log() {}, warn() {}, error() {} };

// Frozen release/trial layouts reproduce the real unique-index conflict.
const V10 = {
  entries: '++id, name, type, packName, project, rootId, isCurrentArc, createdTurn, updatedTurn, lastMentionedTurn, eventTurn, sceneId, arcId, realTimestamp, *entities, *subjects, *objects, *locations, *promises, *triggers',
  packs: 'name, entryCount, project',
  snapshots: '++id, packName, timestamp, type',
  embeddings: '++id, entryId, packName, model, field, sourceHash, entryUpdatedAt, schemaVersion, &[entryId+field]',
  workingMemory: 'url',
  encounters: '++id, &[char1+char2], lastSeenTurn',
  entryVersions: '++id, entryId, ts, turn',
  cleanupQueue: 'id, chatId, chatKey, status, createdAt, completedAt'
};
const V11 = { ...V10, encounters: '++id, chatKey, &[chatKey+char1+char2], lastSeenTurn' };

function environment() {
  const indexedDB = new IDBFactory();
  class TestDexie extends Dexie {
    constructor(name) { super(name, { indexedDB, IDBKeyRange }); }
  }
  const context = {
    Dexie: TestDexie, console: quiet, setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, AbortController, URL,
    localStorage: { getItem: () => null, setItem() {} },
    fetch: () => { throw new Error('Storage tests must not call an API'); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('core-kernel.js'), context);
  vm.runInContext(read('core-memory.js'), context);
  return { TestDexie, core: context.__LoreCore };
}

async function seed(TestDexie, version) {
  const db = new TestDexie('lore-injector');
  db.version(version).stores(version === 10 ? V10 : V11);
  await db.open();
  const rows = {
    entries: [{ id: 7, packName: 'memory', name: 'Promise', type: 'promise', summary: { full: 'Preserve this memory' }, triggers: ['Alice'] }],
    packs: [{ name: 'memory', entryCount: 1 }, { name: 'empty', entryCount: 0 }],
    snapshots: [{ id: 2, packName: 'memory', timestamp: 1, encoding: 'gzip', gzip: 'preserve-opaque-payload' }],
    embeddings: [{ id: 3, entryId: 7, field: 'summary', model: 'gemini-embedding-001', vector: [0.5, 0.25] }],
    workingMemory: [{ url: 'chat:a', scene: 'station' }],
    entryVersions: [{ id: 4, entryId: 7, ts: 1, snapshot: { name: 'Old promise' } }],
    cleanupQueue: [{ id: 'pending', chatId: 'a', chatKey: 'chat:a', status: 'pending', createdAt: 1 }],
    encounters: version === 10
      ? [{ id: 1, char1: 'Bob', char2: 'Alice', firstMetTurn: 2, lastSeenTurn: 3 }]
      : [
        { id: 1, chatKey: 'chat:a', char1: 'Alice', char2: 'Bob', firstMetTurn: 2, lastSeenTurn: 3 },
        { id: 2, chatKey: 'chat:b', char1: 'Alice', char2: 'Bob', firstMetTurn: 5, lastSeenTurn: 9 }
      ]
  };
  for (const [table, values] of Object.entries(rows)) await db.table(table).bulkPut(values);
  return db;
}

async function snapshot(db) {
  const result = {};
  for (const table of db.tables) result[table.name] = await table.toArray();
  return plain(result);
}

async function testReleaseUpgrade() {
  const { TestDexie, core } = environment();
  const previous = await seed(TestDexie, 10);
  const expected = await snapshot(previous);
  previous.close();
  const db = core.getDB();
  try {
    await db.open();
    assert.strictEqual(db.verno, 11);
    expected.encounters = expected.encounters.map(row => ({ ...row, chatKey: '' }));
    assert.deepStrictEqual(await snapshot(db), expected, 'v10 upgrade changed existing lore/history/embeddings');
    assert.strictEqual((await core.checkFirstEncounter('Alice', 'Bob')).id, 1, 'legacy reverse-direction history is no longer readable');
  } finally { db.close(); }
}

async function testTrialReopen() {
  const { TestDexie, core } = environment();
  const previous = await seed(TestDexie, 11);
  const expected = await snapshot(previous);
  const nativeVersion = previous.backendDB().version;
  previous.close();

  const incompatible = new TestDexie('lore-injector');
  incompatible.version(10).stores(V10);
  try {
    await assert.rejects(incompatible.open(), error => /ConstraintError|uniqueness/.test(error.message), 'old release did not reproduce the observed failure');
  } finally { incompatible.close(); }

  const db = core.getDB();
  try {
    await db.open();
    assert.strictEqual(db.backendDB().version, nativeVersion, 'opening trial data changed its native version');
    assert.deepStrictEqual(await snapshot(db), expected, 'trial reopen modified stored data');
    assert.strictEqual((await core.checkFirstEncounter('Bob', 'Alice', 'chat:a')).id, 1);
    assert.strictEqual((await core.checkFirstEncounter('Alice', 'Bob', 'chat:b')).id, 2);
    assert.strictEqual(await core.checkFirstEncounter('Alice', 'Bob', 'chat:c'), null, 'meeting leaked across chats');
    await core.recordFirstEncounter('Bob', 'Alice', { chatKey: 'chat:a', turnApprox: 20 });
    assert.strictEqual((await db.encounters.get(1)).lastSeenTurn, 20);
    assert.deepStrictEqual(await db.encounters.get(2), expected.encounters[1], 'another chat history was overwritten');
    assert.strictEqual(await db.encounters.count(), 2, 'reverse pair created a duplicate');
    assert.deepStrictEqual(plain(await core.findUnmetPairs(['Alice', 'Bob'], 'chat:c')), [['Alice', 'Bob']]);
    assert.strictEqual((await core.findReunionPairs(['Alice', 'Bob'], 25, 10, 'chat:b')).length, 1);
  } finally { db.close(); }
}

async function loadMenu(module, db) {
  const registrations = new Map();
  const context = {
    console: quiet, document: { readyState: 'complete' },
    localStorage: { getItem: () => null },
    __LoreInj: {
      __settingsLoaded: true, db, settings: { config: {}, load() {} },
      C: { getCurUrl: () => 'chat:a', setFullWidth() {} },
      getActivePacksForUrl: () => ['memory'],
      registerSubMenu: (key, callback) => registrations.set(key, callback)
    }
  };
  context.window = context;
  vm.createContext(context);
  await vm.runInContext(read(module), context);
  return { api: context.__LoreInj, registrations };
}

async function testReadFailures() {
  const fail = async () => { throw new Error('IndexedDB open failed'); };
  const db = { packs: { toArray: fail }, entries: { toArray: fail } };
  const file = await loadMenu('injecter-6-sub-file.js', db);
  await assert.rejects(file.api.backupTools.exportFullBackup(), 'a failed DB read produced an empty backup');
  const healthy = await loadMenu('injecter-6-sub-file.js', { packs: { toArray: async () => [] }, entries: { toArray: async () => [] } });
  const empty = await healthy.api.backupTools.exportFullBackup();
  assert.strictEqual(empty.db.entries.length, 0, 'genuinely empty databases must remain exportable');

  for (const [module, key] of [['injecter-6-sub-file.js', 'file'], ['injecter-6-sub-lore.js', 'lore']]) {
    const { registrations } = await loadMenu(module, db);
    let open, render;
    registrations.get(key)({ createSubMenu: (label, callback) => { open = callback; } });
    open({ replaceContentPanel: callback => { render = callback; } });
    const messages = [], pending = [];
    const node = { textContent: '' };
    await render({ addText: text => messages.push(text), addBoxedField: (a, b, opts) => pending.push(opts.onInit(node)) });
    for (const task of pending) await task;
    assert(messages.length || node.textContent, module + ' rendered a blank panel after a read failure');
  }
  const fileSource = read('injecter-6-sub-file.js');
  const listing = fileSource.slice(fileSource.indexOf('const renderPackUI ='), fileSource.indexOf('const curUrl = C.getCurUrl();', fileSource.indexOf('const renderPackUI =')));
  assert(!listing.includes('deletePackData(') && !listing.includes('db.packs.update('), 'opening a pack list mutates storage');
}

async function testLegacyBackupEncounter() {
  const { core } = environment();
  const db = core.getDB();
  try {
    await db.open();
    const { api } = await loadMenu('injecter-6-sub-file.js', db);
    await api.backupTools.importFullBackup({
      schema: 'crack-lore-full-backup', version: 1, settings: {}, localStorage: {},
      db: { entries: [], packs: [], encounters: [{ id: 9, char1: 'Bob', char2: 'Alice', lastSeenTurn: 12 }] }
    }, 'merge');
    assert.strictEqual((await core.checkFirstEncounter('Alice', 'Bob')).lastSeenTurn, 12, 'old backups import unreadable encounter rows');
  } finally { db.close(); }
}

module.exports = async function runStorageRegressions() {
  await testReleaseUpgrade();
  await testTrialReopen();
  await testLegacyBackupEncounter();
  await testReadFailures();
};

if (require.main === module) module.exports().then(() => console.log('Storage regressions passed.'), error => { console.error(error); process.exitCode = 1; });
