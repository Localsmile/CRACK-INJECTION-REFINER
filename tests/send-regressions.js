'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = name => fs.readFileSync(path.join(__dirname, '..', 'embedding', name), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function loadTransport() {
  const sent = [], requests = [], timers = new Map();
  let now = 1000, timerId = 0, throwSend = false, throwFetch = false;
  class Socket {
    constructor() { this.readyState = 1; }
    send(frame) { sent.push(frame); if (throwSend) throw new Error('native failure'); }
  }
  const context = {
    console: { log() {}, warn() {}, error() {} },
    WebSocket: Socket, Request, URL, DOMException, AbortController,
    location: { pathname: '/stories/story/episodes/chat', href: 'https://crack.wrtn.ai/stories/story/episodes/chat' },
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (...args) => { requests.push(args); if (throwFetch) throw new Error('network lost after send'); return { ok: true }; },
    addEventListener() {}, document: {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('injecter-1.js'), context);
  vm.runInContext(source('injecter-composer.js'), context);
  return {
    context, sent, requests, timers, socket: new Socket(),
    bridge: context.__LoreInj.sendBridge,
    advance: ms => { now += ms; },
    failSend: () => { throwSend = true; }, failFetch: () => { throwFetch = true; }
  };
}

async function testTransport() {
  const t = loadTransport();
  let calls = 0, commits = 0;
  t.context.__loreRegister(async (text, runtime) => {
    calls++;
    runtime.onCommit(() => { commits++; });
    return text + '\n<ooc_lore_context>memory</ooc_lore_context>';
  });
  const frame = text => '42/v3/chats,7' + JSON.stringify(['send', { chatId: 'chat', message: text }]);
  const job = t.bridge.prepare('a');
  await job.promise;
  t.advance(33000);
  assert.strictEqual(commits, 0, 'preparation advanced bookkeeping before sending');
  t.bridge.arm(job);
  t.socket.send(frame('a'));
  assert.strictEqual(t.sent.length, 1, 'prepared send was not synchronous');
  assert.strictEqual(calls, 1, 'prepared result triggered another injection/API call');
  assert.strictEqual(commits, 1, 'send bookkeeping did not commit exactly once');
  assert(t.sent[0].startsWith('42/v3/chats,7'), 'Socket.IO ACK ID changed');
  assert(t.sent[0].includes('<ooc_lore_context>'), 'prepared lore was lost');

  t.socket.send(frame('b'));
  await flush();
  assert.strictEqual(t.sent.length, 2);
  assert.strictEqual(commits, 2);
  assert.strictEqual(t.timers.size, 0, 'wire fallback leaked its deadline timer');
  t.socket.send('2');
  assert.strictEqual(t.sent.at(-1), '2', 'heartbeat was intercepted');
  t.socket.send(frame('<ooc_lore_context>already prepared</ooc_lore_context>'));
  assert.strictEqual(calls, 2, 'an already injected message was processed again');

  const cancelled = t.bridge.prepare('cancelled');
  await cancelled.promise;
  t.bridge.cancel(cancelled);
  assert.strictEqual(cancelled.effects.length, 0);
  assert.strictEqual(commits, 2);

  const nativeFailure = loadTransport();
  nativeFailure.context.__loreRegister(async s => s + ' lore');
  const ready = nativeFailure.bridge.prepare('a');
  await ready.promise;
  nativeFailure.bridge.arm(ready);
  nativeFailure.failSend();
  assert.throws(() => nativeFailure.socket.send(frame('a')), /native failure/);
  assert.strictEqual(nativeFailure.sent.length, 1, 'native send error replayed the original message');

  const stale = loadTransport();
  let staleCalls = 0;
  stale.context.__loreRegister(async s => { staleCalls++; return s + ' lore'; });
  const staleJob = stale.bridge.prepare('queued');
  await staleJob.promise;
  stale.bridge.arm(staleJob);
  stale.advance(31000);
  stale.socket.send(frame('queued'));
  await flush();
  assert.strictEqual(stale.sent.length, 0, 'expired Socket.IO queue replayed a prepared send');
  assert.strictEqual(staleCalls, 1, 'expired prepared send requested the same lore again');

  for (const reason of ['timeout', 'navigation', 'closed', 'abort']) {
    const delayed = loadTransport();
    let finish, didCommit = false;
    delayed.context.__loreRegister((s, runtime) => new Promise(resolve => {
      finish = () => resolve(s + ' lore');
      runtime.onCommit(() => { didCommit = true; });
    }));
    delayed.socket.send(frame(reason));
    await flush();
    if (reason === 'timeout') delayed.advance(31000);
    if (reason === 'navigation') delayed.context.location.pathname += '/other';
    if (reason === 'closed') delayed.socket.readyState = 3;
    if (reason === 'abort') [...delayed.timers.values()][0].fn();
    finish();
    await flush();
    assert.strictEqual(delayed.sent.length, 0, reason + ' allowed a late/ghost send');
    assert.strictEqual(didCommit, false, reason + ' committed an unsent turn');
  }

  const http = loadTransport();
  let httpCalls = 0, httpCommits = 0;
  http.context.__loreRegister(async (s, runtime) => {
    httpCalls++; runtime.onCommit(() => { httpCommits++; }); return s;
  });
  await http.context.fetch('https://api.provider.example/chat/completions', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'api prompt' }] }) });
  assert.strictEqual(httpCalls, 0, 'provider prompt was mistaken for a Crack chat');
  const body = { messages: [{ role: 'user', content: 'hello' }], message: 'hello', variables: { text: 'hello' } };
  await http.context.fetch('https://crack-api.wrtn.ai/v3/chats', { method: 'POST', body: JSON.stringify(body) });
  assert.strictEqual(httpCalls, 1, 'same logical HTTP message was injected multiple times');
  assert.strictEqual(httpCommits, 1);
  http.failFetch();
  const before = http.requests.length;
  await assert.rejects(http.context.fetch('https://crack-api.wrtn.ai/v3/chats', { method: 'POST', body: JSON.stringify(body) }), /network lost/);
  assert.strictEqual(http.requests.length - before, 1, 'failed HTTP request was replayed');
  assert.strictEqual(httpCommits, 1, 'failed HTTP request committed bookkeeping');

  const serialize = t.context.__LoreInj.serializeComposer;
  assert.strictEqual(serialize({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'first' }, { type: 'hardBreak' }, { type: 'text', text: 'line' }] },
    { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'id', label: 'name' } }, { type: 'mention', attrs: { id: 'id2', label: 'second' } }] }
  ] }), 'first\nline\n\n(shortcut:id:name)/second');
  assert.strictEqual(serialize({ type: 'doc', content: [{ type: 'image' }] }), null, 'unknown editor format was silently changed');
}

async function testDeferredInjection() {
  let turn = 5;
  const writes = [], storage = new Map(), effects = [];
  const entries = [{ id: 1, name: 'promise', type: 'promise', summary: 'memory' }];
  const config = { enabled: true, autoExtEnabled: true, autoExtTurns: 6, embeddingEnabled: true,
    firstEncounterWarning: false, honorificMatrixEnabled: false, cooldownEnabled: true, cooldownTurns: 10,
    timelineRetrievalEnabled: false, pendingPromiseBoost: false };
  const C = { DEFAULTS: {}, getCurUrl: () => 'url', fetchLogs: async () => [],
    charLen: s => s.length, deriveAiMemoryTurns: () => 4,
    hybridSearch: async (input, logs, rows, conf, opts) => {
      assert(opts.signal, 'preparation cancellation did not reach embedding transport');
      return { scored: [{ entry: entries[0], score: 1 }], activeNames: [] };
    },
    updateWorkingMemory: async () => { writes.push('working-memory'); },
    planInjectionBudget: () => ({ injected: '<ooc_lore_context>memory</ooc_lore_context>', included: entries, finalChars: 60 })
  };
  const context = {
    C, console, DOMException, AbortController, settings: { config },
    _ls: { getItem: k => storage.get(k), setItem: (k, v) => { storage.set(k, v); writes.push(k); } },
    db: { entries: { where: () => ({ anyOf: () => ({ toArray: async () => entries }) }), update: async () => { writes.push('entry'); } } },
    getChatKey: () => 'chat', currentChatIdSafe: () => 'chat', getTurnCounter: () => turn,
    incrementTurnCounter: () => ++turn, getCooldownMap: () => ({}),
    setCooldownLastTurn: () => writes.push('cooldown'), recordEntryMention: () => writes.push('mention'),
    addInjLog: () => writes.push('injection-log'), scheduleInjectionCleanup: () => writes.push('cleanup-scheduled'),
    runAutoExtract: () => writes.push('extraction'), setTimeout: fn => { fn(); },
    OOC_FORMATS: { default: { prefix: '', suffix: '' } }, MAX_INPUT_CHARS: 2000,
    runTemporalRecallJudge: async () => null, buildTemporalInjectionPlan: () => ({ text: '', entries: [], entryIds: [] }),
    temporalCandidateId: entry => String(entry.id),
    buildInjectedMessage: (text, lore) => lore + '\n' + text,
    queueInjectionCleanup: () => writes.push('cleanup-queued')
  };
  context._w = { __LoreInj: { getActivePacksForUrl: () => ['pack'], getDisabledEntriesForUrl: () => [] } };
  vm.createContext(context);
  const code = source('injecter-5.js');
  vm.runInContext(code.slice(code.indexOf('  async function inject('), code.indexOf('  if (_w.__loreRegister)')), context);
  const controller = new AbortController();
  const result = await context.inject('input', { signal: controller.signal, onCommit: fn => effects.push(fn) });
  assert(result.includes('memory'));
  assert.strictEqual(turn, 5, 'preflight incremented turn');
  assert.deepStrictEqual(writes, [], 'preflight wrote cooldown/logs/cleanup or started extraction');
  for (const effect of effects) await effect();
  assert.strictEqual(turn, 6);
  for (const expected of ['cooldown', 'mention', 'injection-log', 'cleanup-queued', 'extraction']) assert(writes.includes(expected), 'commit omitted ' + expected);
  controller.abort();
  await assert.rejects(context.inject('cancelled', { signal: controller.signal, onCommit() {} }), /cancelled/);
  assert.strictEqual(turn, 6, 'cancelled preparation advanced turn');
}

module.exports = async function runSendRegressions() {
  await testTransport();
  await testDeferredInjection();
};

if (require.main === module) module.exports().then(() => console.log('Send regressions passed.'), e => { console.error(e); process.exitCode = 1; });
