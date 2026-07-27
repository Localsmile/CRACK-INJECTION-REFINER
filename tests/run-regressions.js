'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { TextEncoder, TextDecoder } = require('util');
const { webcrypto } = require('crypto');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function testSourceSyntax() {
  const pending = [path.join(root, 'embedding')];
  let checked = 0;
  while (pending.length) {
    const current = pending.pop();
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, item.name);
      if (item.isDirectory()) pending.push(absolute);
      else if (item.isFile() && item.name.endsWith('.js') && !item.name.endsWith('.user.js')) {
        new vm.Script(fs.readFileSync(absolute, 'utf8'), { filename: absolute });
        checked++;
      }
    }
  }
  assert(checked >= 30, 'unexpectedly few source modules were syntax checked');
}

function localStorageStub() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    key: (index) => Array.from(data.keys())[index] || null,
    get length() { return data.size; }
  };
}

async function loadKernel(options = {}) {
  let requestCount = 0;
  const requests = [];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextEncoder,
    TextDecoder,
    crypto: webcrypto,
    AbortController,
    URL,
    Blob,
    localStorage: localStorageStub(),
    fetch: (url, opts = {}) => new Promise((resolve, reject) => {
      if (String(url).includes('timeout.test')) {
        if (opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
        return;
      }
      resolve({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) });
    }),
    GM_xmlhttpRequest: (opts) => {
      requestCount++;
      requests.push(opts);
      const scriptedStatuses = Array.isArray(options.gmStatuses) ? options.gmStatuses : [];
      const scriptedStatus = scriptedStatuses.length
        ? scriptedStatuses[Math.min(requestCount - 1, scriptedStatuses.length - 1)]
        : 200;
      let payload = { choices: [{ message: { content: '{"entries":[]}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4 } };
      const scriptedPayloads = Array.isArray(options.gmPayloads) ? options.gmPayloads : [];
      if (scriptedPayloads.length) payload = scriptedPayloads[Math.min(requestCount - 1, scriptedPayloads.length - 1)];
      else if (/\/responses$/i.test(String(opts.url || ''))) payload = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"entries":[]}' }] }], usage: { input_tokens: 10, output_tokens: 4 } };
      else if (/\/messages$/i.test(String(opts.url || ''))) payload = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"entries":[]}' }], usage: { input_tokens: 10, output_tokens: 4 } };
      const timer = setTimeout(() => opts.onload({
        status: scriptedStatus,
        responseText: scriptedStatus >= 200 && scriptedStatus < 300 ? JSON.stringify(payload) : JSON.stringify({ error: { message: 'scripted ' + scriptedStatus } })
      }), 15);
      return { abort: () => { clearTimeout(timer); if (opts.onabort) opts.onabort(); } };
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('embedding/core-kernel.js'), context, { filename: 'core-kernel.js' });
  return { C: context.__LoreCore, context, requests, getRequestCount: () => requestCount };
}

async function testKernelHelpers() {
  const { C, context, requests, getRequestCount } = await loadKernel();
  assert(C && C.__kernelLoaded, 'kernel did not load');
  vm.runInContext(read('embedding/core-format.js'), context, { filename: 'core-format.js' });
  vm.runInContext(read('embedding/core-memory.js'), context, { filename: 'core-memory.js' });
  vm.runInContext(read('embedding/core-search.js'), context, { filename: 'core-search.js' });

  assert(C.estimateTextTokens('안녕하세요') >= 4, 'CJK token estimate is unexpectedly low');
  assert(C.estimateTextTokens('hello world') >= 2, 'Latin token estimate is unexpectedly low');
  assert.strictEqual(C.cosineSim([1, 0], [1]), 0, 'mismatched embedding dimensions should not produce a score');
  assert.strictEqual(C.cosineSim([1, 0], [1, Number.NaN]), 0, 'invalid embedding values should not produce NaN');

  const shortTurns = [];
  for (let i = 0; i < 12; i++) {
    shortTurns.push({ role: 'user', message: '짧은 입력 ' + i });
    shortTurns.push({ role: 'assistant', message: '짧은 답변 ' + i });
  }
  assert.strictEqual(C.deriveAiMemoryTurns(shortTurns, { adaptiveAiMemory: false, aiMemoryTurns: 4 }), 4);
  const adaptiveShort = C.deriveAiMemoryTurns(shortTurns, { nativeContextTokenBudget: 10000, nativeContextMaxTurns: 16 });
  assert(adaptiveShort >= 10, 'adaptive memory should retain many short turns');
  const longTurns = [];
  for (let i = 0; i < 12; i++) {
    longTurns.push({ role: 'user', message: '가'.repeat(1600) });
    longTurns.push({ role: 'assistant', message: '나'.repeat(1600) });
  }
  const adaptiveLong = C.deriveAiMemoryTurns(longTurns, { nativeContextTokenBudget: 10000, nativeContextMinTurns: 3, nativeContextMaxTurns: 16 });
  assert(adaptiveLong >= 3 && adaptiveLong < adaptiveShort, 'long turns should reduce the remembered-turn estimate');

  const budgeted = C.planInjectionBudget({
    userInput: 'u'.repeat(1500), maxInputChars: 2000,
    entries: [{ id: 1, name: 'Lore', type: 'character', summary: { full: 'f'.repeat(900), compact: 'c'.repeat(450), micro: 'm'.repeat(120) }, inject: { full: 'f'.repeat(900), compact: 'c'.repeat(450), micro: 'm'.repeat(120) }, imp: 10 }],
    config: { loreBudgetMax: 900, compressionMode: 'auto' }, prefix: '<ooc_lore_context>', suffix: '</ooc_lore_context>'
  });
  assert(budgeted.finalChars <= 2000, 'injection planner exceeded the 2000-character message limit');
  const noSpace = C.planInjectionBudget({ userInput: 'u'.repeat(1990), maxInputChars: 2000, entries: [], prefix: '<ooc>', suffix: '</ooc>' });
  assert.strictEqual(noSpace.injected, '', 'injection planner should cancel when user input and wrapper leave no room');
  const wholeSection = C.packWholeSection('[시간축 회상]\n- ' + '가'.repeat(100) + '\n- 짧은 사건', 30);
  assert(wholeSection.text.includes('짧은 사건') && !wholeSection.text.includes('...'), 'auxiliary context was truncated instead of packed by whole items');
  const droppedSingleSection = C.packWholeSection('장면=' + '가'.repeat(100), 30);
  assert.strictEqual(droppedSingleSection.text, '', 'an oversized single-line section was partially retained');

  const memoryPool = C.buildScanPool('현재 입력', [], {
    workingMemory: { scene: '[현재 장면: 장소=옥상]', activeChars: ['서윤', '리아'] }
  });
  assert(memoryPool.includes('옥상') && memoryPool.includes('서윤'), 'working memory is not included in deterministic retrieval context');
  const diverse = C.selectDiverseCandidates([
    { entry: { id: 1, name: '서윤', type: 'character', triggers: ['서윤'], entities: ['서윤'] }, score: 1 },
    { entry: { id: 2, name: '서윤', type: 'character', triggers: ['서윤'], entities: ['서윤'] }, score: 0.95 },
    { entry: { id: 3, name: '봉인된 반지', type: 'item', triggers: ['반지'], entities: ['리아'] }, score: 0.8 }
  ], 2);
  assert.deepStrictEqual(Array.from(diverse.map(row => row.entry.id)), [1, 3], 'deterministic diversity selection still allowed a duplicate topic to occupy the next slot');

  const variants = C.buildOpenAICompatVariants(true, 4096, ['nested', 'flat', 'none']);
  assert(variants.length <= 6, 'OpenAI compatibility variants exceeded the hard limit');
  assert.strictEqual(new Set(variants.map(v => JSON.stringify(v))).size, variants.length, 'OpenAI compatibility variants are not unique');
  assert(variants.some(v => !v.withJsonMode && v.reasoningStyle === 'none'), 'conservative OpenAI fallback is missing');
  assert.strictEqual(C.normalizeOpenAICompatUrl('https://api.openai.com/v1', 'responses'), 'https://api.openai.com/v1/responses');
  assert.strictEqual(C.normalizeOpenAICompatUrl('https://api.anthropic.com', 'anthropic_messages'), 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(C.normalizeOpenAICompatFormat('custom'), 'custom');
  assert.strictEqual(C.normalizeOpenAICompatUrl('https://proxy.example/custom/generate?mode=rp', 'custom'), 'https://proxy.example/custom/generate?mode=rp');
  assert.strictEqual(C.openAICompatResponseText({ output: [{ content: [{ type: 'output_text', text: 'responses-ok' }] }] }, 'responses'), 'responses-ok');
  assert.strictEqual(C.openAICompatResponseText({ content: [{ type: 'text', text: 'anthropic-ok' }] }, 'anthropic_messages'), 'anthropic-ok');
  const globalVertex = C.resolveVertexEndpoint('global', 'gemini-2.5-flash');
  assert.strictEqual(globalVertex.host, 'aiplatform.googleapis.com', 'Vertex global location still produces an invalid regional hostname');
  assert.strictEqual(globalVertex.location, 'global', 'Vertex global location was rewritten unexpectedly');
  const regionalVertex = C.resolveVertexEndpoint('us-central1', 'gemini-2.5-flash');
  assert.strictEqual(regionalVertex.host, 'us-central1-aiplatform.googleapis.com', 'Vertex regional hostname is incorrect');
  assert.strictEqual(C.geminiResponseText({ candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: '{"entries":' }, { text: '[]}' }] } }] }), '{"entries":[]}', 'Gemini multipart response was not joined');
  assert(C.geminiEmptyResponseError({ candidates: [{ finishReason: 'MAX_TOKENS' }] }).includes('MAX_TOKENS'), 'Gemini empty response hides the finish reason');
  const responseVariants = C.buildOpenAIFormatVariants('responses', 'prompt', { model: 'm', jsonMode: true, maxOutputTokens: 200, reasoning: 'low' });
  assert(responseVariants.some(body => body.text && body.text.format.type === 'json_object'), 'Responses JSON variant is missing');
  const anthropicVariants = C.buildOpenAIFormatVariants('anthropic_messages', 'prompt', { model: 'm', jsonMode: true, maxOutputTokens: 200 });
  assert.strictEqual(anthropicVariants[0].max_tokens, 200, 'Anthropic max_tokens was not mapped');

  const common = {
    apiType: 'deepseek', deepSeekKey: 'test-key', model: 'test-model',
    responseMimeType: 'application/json', maxRetries: 0, retryOnServerError: false
  };
  const [a, b] = await Promise.all([
    C.callGeminiApi('same prompt', common),
    C.callGeminiApi('same prompt', common)
  ]);
  assert.strictEqual(a.text, b.text, 'coalesced callers received different results');
  assert.strictEqual(getRequestCount(), 1, 'identical concurrent generation calls were not coalesced');

  await Promise.all([
    C.callGeminiApi('different prompt A', common),
    C.callGeminiApi('different prompt B', common)
  ]);
  assert.strictEqual(getRequestCount(), 3, 'distinct prompts were incorrectly coalesced');

  const retryKernel = await loadKernel({ gmStatuses: [503, 200] });
  const retried = await retryKernel.C.callGeminiApi('retry after 503', {
    apiType: 'deepseek', deepSeekKey: 'test-key', model: 'test-model',
    responseMimeType: 'application/json', maxRetries: 0
  });
  assert.strictEqual(retried.text, '{"entries":[]}', 'generation did not recover after a temporary 503');
  assert.strictEqual(retryKernel.getRequestCount(), 2, 'temporary 503 did not perform exactly one bounded retry');

  const hardFailureKernel = await loadKernel({ gmStatuses: [400] });
  const hardFailure = await hardFailureKernel.C.callGeminiApi('do not retry 400', {
    apiType: 'deepseek', deepSeekKey: 'test-key', model: 'test-model',
    responseMimeType: 'application/json', maxRetries: 2
  });
  assert.strictEqual(hardFailure.text, null, 'non-retryable 400 unexpectedly produced output');
  assert.strictEqual(hardFailureKernel.getRequestCount(), 1, 'non-retryable 400 was requested more than once');


  const responsesResult = await C.callGeminiApi('responses prompt', {
    apiType: 'openai', openAIBaseUrl: 'https://api.openai.com/v1', openAIKey: 'test-key', openAIFormat: 'responses',
    model: 'test-model', responseMimeType: 'application/json', maxRetries: 0, retryOnServerError: false
  });
  assert.strictEqual(responsesResult.text, '{"entries":[]}', 'Responses payload text was not parsed');
  const responsesRequest = requests[requests.length - 1];
  assert.strictEqual(responsesRequest.url, 'https://api.openai.com/v1/responses', 'Responses endpoint was not selected');
  assert.strictEqual(JSON.parse(responsesRequest.data).input, 'responses prompt', 'Responses input body was not mapped');

  const anthropicResult = await C.callGeminiApi('anthropic prompt', {
    apiType: 'openai', openAIBaseUrl: 'https://api.anthropic.com', openAIKey: 'test-key', openAIFormat: 'anthropic_messages',
    model: 'test-model', responseMimeType: 'application/json', maxRetries: 0, retryOnServerError: false
  });
  assert.strictEqual(anthropicResult.text, '{"entries":[]}', 'Anthropic Messages payload text was not parsed');
  const anthropicRequest = requests[requests.length - 1];
  assert.strictEqual(anthropicRequest.url, 'https://api.anthropic.com/v1/messages', 'Anthropic Messages endpoint was not selected');
  assert.strictEqual(anthropicRequest.headers['x-api-key'], 'test-key', 'Anthropic x-api-key header is missing');
  assert.strictEqual(anthropicRequest.headers['anthropic-version'], '2023-06-01', 'Anthropic version header is missing');
  assert.strictEqual(JSON.parse(anthropicRequest.data).messages[0].content, 'anthropic prompt', 'Anthropic message body was not mapped');

  const customResult = await C.callGeminiApi('custom prompt', {
    apiType: 'openai', openAIBaseUrl: 'https://proxy.example/custom/generate?mode=rp', openAIKey: 'test-key', openAIFormat: 'custom',
    model: 'test-model', responseMimeType: 'application/json', maxRetries: 0, retryOnServerError: false
  });
  assert.strictEqual(customResult.text, '{"entries":[]}', 'custom full-URL response was not parsed as an OpenAI-compatible response');
  const customRequest = requests[requests.length - 1];
  assert.strictEqual(customRequest.url, 'https://proxy.example/custom/generate?mode=rp', 'custom format modified the user-provided URL');
  assert.strictEqual(JSON.parse(customRequest.data).messages[0].role, 'system', 'custom format lost the Chat Completions-compatible JSON instruction');

  await assert.rejects(
    C.nativeFetchWithTimeout('https://timeout.test', { timeoutMs: 10 }),
    /타임아웃/,
    'native fetch timeout did not abort and classify the request'
  );

  const embedding2Kernel = await loadKernel({
    gmPayloads: [{ embeddings: [{ values: [3, 4] }] }]
  });
  const embedding2Vectors = await embedding2Kernel.C.embedTexts(['찾고 싶은 사건'], {
    apiType: 'key', key: 'ai-studio-key', model: 'gemini-embedding-2',
    taskType: 'RETRIEVAL_QUERY', dimensions: 2, maxRetries: 0
  });
  assert.deepStrictEqual(Array.from(embedding2Vectors[0]), [0.6, 0.8], 'Embedding 2 vector normalization changed');
  const embedding2Request = embedding2Kernel.requests[0];
  assert(String(embedding2Request.url).includes('generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent'), 'Embedding 2 did not use the Gemini Developer API endpoint');
  const embedding2Body = JSON.parse(embedding2Request.data);
  assert.strictEqual(embedding2Body.content.parts[0].text, 'task: search result | query: 찾고 싶은 사건', 'Embedding 2 query instruction is missing');
  assert.strictEqual(embedding2Body.outputDimensionality, 2, 'single embedding request uses the wrong REST dimension field');
  assert(!Object.prototype.hasOwnProperty.call(embedding2Body, 'output_dimensionality'), 'single embedding request still uses the SDK-style snake_case field');
  assert(!Object.prototype.hasOwnProperty.call(embedding2Body, 'taskType'), 'Embedding 2 sent the unsupported taskType field');

  vm.runInContext(read('embedding/core-importer.js'), context, { filename: 'core-importer.js' });
  const boundEntry = C.normalizeLoreEntry({
    type: 'character',
    name: '서윤과 리아',
    summary: { full: '서윤은 금발이고 리아는 갈색 머리다.' },
    facts: [
      { subject: '서윤', relation: '머리', value: '금발', time: 'current', polarity: 'affirmed' },
      { subject: '리아', relation: '머리', value: '갈색', time: 'current', polarity: 'affirmed' }
    ]
  });
  assert(boundEntry.inject.compact.includes('[서윤] 현재.머리=금발'), 'compact memory lost the first attribute owner');
  assert(boundEntry.inject.compact.includes('[리아] 현재.머리=갈색'), 'compact memory lost the second attribute owner');
  assert(!boundEntry.inject.compact.includes('금발,갈색'), 'compact memory flattened separately owned attributes');
  assert.strictEqual(boundEntry.inject.full, '서윤은 금발이고 리아는 갈색 머리다.', 'full memory was rewritten as a compressed form');
  assert.strictEqual(boundEntry.memoryDerivedFull, true, 'derived Full injection is not tracked for later summary updates');
  const refreshedBoundEntry = C.normalizeLoreEntry({
    ...boundEntry,
    summary: { ...boundEntry.summary, full: '서윤은 은발이고 리아는 갈색 머리다.' },
    facts: boundEntry.facts.map(fact => fact.subject === '서윤' ? { ...fact, value: '은발' } : fact)
  });
  assert.strictEqual(refreshedBoundEntry.inject.full, '서윤은 은발이고 리아는 갈색 머리다.', 'derived Full injection stayed stale after summary.full changed');
  assert(refreshedBoundEntry.embed_text.includes('은발') && !refreshedBoundEntry.embed_text.includes('금발'), 'derived embedding text stayed stale after facts changed');
  const manuallyEditedDerived = C.normalizeLoreEntry({
    ...boundEntry,
    inject: { ...boundEntry.inject, full: '나중에 직접 수정한 Full' },
    embed_text: '나중에 직접 수정한 검색 텍스트'
  });
  assert.strictEqual(manuallyEditedDerived.inject.full, '나중에 직접 수정한 Full', 'a later manual Full edit was mistaken for a derived value');
  assert.strictEqual(manuallyEditedDerived.embed_text, '나중에 직접 수정한 검색 텍스트', 'a later manual embedding edit was mistaken for a derived value');
  const explicitFullEntry = C.normalizeLoreEntry({
    type: 'character', name: '서윤',
    summary: { full: '서윤은 금발이다.' },
    inject: { full: '사용자가 직접 정한 Full' },
    embed_text: '사용자가 직접 정한 검색 텍스트',
    facts: [{ subject: '서윤', relation: '머리', value: '금발', time: 'current', polarity: 'affirmed' }]
  });
  assert.strictEqual(explicitFullEntry.inject.full, '사용자가 직접 정한 Full', 'explicit user Full injection was overwritten');
  assert.strictEqual(explicitFullEntry.embed_text, '사용자가 직접 정한 검색 텍스트', 'explicit user embedding text was overwritten');
  const longFull = '완전한 기록 '.repeat(20).trim();
  const renderedFull = C.cfFull({ name: '장문', type: 'character', summary: { full: longFull } });
  assert(renderedFull.includes(longFull) && !renderedFull.includes('...'), 'Full rendering still truncates the complete summary');
  assert(boundEntry.inject.micro.includes('서윤:머리=금발') && boundEntry.inject.micro.includes('리아:머리=갈색'), 'micro memory dropped a separately bound second fact');
  const escapedCompact = C.formatMemoryFactsCompact({
    name: '혼합',
    facts: [{ subject: '서윤', relation: '색상', value: '금발|갈색=혼합', time: 'current', polarity: 'affirmed' }]
  });
  assert(escapedCompact.includes('금발\\|갈색\\=혼합'), 'compact fact delimiters are not escaped');

  const evolvedFacts = C.mergeMemoryFacts(
    [{ subject: '서윤↔리아', relation: '관계', value: '적대', time: 'current', polarity: 'affirmed' }],
    [{ subject: '서윤↔리아', relation: '관계', value: '임시동맹', time: 'current', polarity: 'affirmed' }],
    '서윤↔리아',
    { replaceCurrent: true }
  );
  assert(evolvedFacts.some(fact => fact.value === '적대' && fact.time === 'past'), 'replaced current fact was not retained as history');
  assert(evolvedFacts.some(fact => fact.value === '임시동맹' && fact.time === 'current'), 'new current fact was not stored');
  const additiveFacts = C.mergeMemoryFacts(
    [{ subject: '서윤', relation: '소유', value: '검', time: 'current', polarity: 'affirmed' }],
    [{ subject: '서윤', relation: '소유', value: '반지', time: 'current', polarity: 'affirmed' }],
    '서윤',
    { replaceCurrent: false }
  );
  assert(additiveFacts.some(fact => fact.value === '검' && fact.time === 'current'), 'an additive fact incorrectly replaced an existing value');
  assert(additiveFacts.some(fact => fact.value === '반지' && fact.time === 'current'), 'an additive fact was not stored');
  const guardedConflicts = [];
  const guardedFacts = C.mergeMemoryFacts(
    [
      { subject: '서윤', relation: '소유', value: '검', time: 'current', polarity: 'affirmed' },
      { subject: '서윤', relation: '소유', value: '반지', time: 'current', polarity: 'affirmed' }
    ],
    [{ subject: '서윤', relation: '소유', value: '열쇠', time: 'now', polarity: 'affirmed' }],
    '서윤',
    { replaceCurrent: true, conflicts: guardedConflicts }
  );
  assert(guardedFacts.filter(fact => fact.time === 'current').length === 3, 'ambiguous multi-value replacement deleted existing current facts');
  assert.strictEqual(guardedConflicts[0]?.reason, 'ambiguous_multi_value_replace', 'ambiguous fact replacement was not reported');
  const scopedFacts = C.mergeMemoryFacts(
    [{ subject: '서윤', relation: '정체', value: '왕녀', time: 'current', polarity: 'uncertain', condition: '가면을 쓴 동안', knownBy: ['서윤'], hiddenFrom: ['리아'] }],
    [{ subject: '서윤', relation: '정체', value: '왕녀', time: 'current', polarity: 'affirmed', knownBy: ['리아'] }],
    '서윤',
    { replaceCurrent: true }
  );
  const currentScoped = scopedFacts.find(fact => fact.time === 'current');
  assert.strictEqual(currentScoped.condition, '가면을 쓴 동안', 'an omitted condition erased existing fact scope');
  assert(currentScoped.knownBy.includes('서윤') && currentScoped.knownBy.includes('리아'), 'knowledge expansion erased an existing knower');
  assert(!(currentScoped.hiddenFrom || []).includes('리아'), 'a character remained hidden after becoming a knower');
  assert(scopedFacts.some(fact => fact.time === 'past' && fact.polarity === 'uncertain'), 'a polarity change was not retained as fact history');
  const legacyCompactPatch = C.mergeLoreSummary(
    { full: '완전한 기존 기록', compact: '기존 요약', micro: '기존' },
    { compact: '새 간결 요약' },
    '서윤'
  );
  assert.strictEqual(legacyCompactPatch.full, '완전한 기존 기록', 'a legacy compact-only patch overwrote the complete summary');
  assert.strictEqual(legacyCompactPatch.compact, '새 간결 요약', 'a legacy compact-only patch was not applied');

  const packed = C.buildLoreBudgetPlan([
    { id: 1, name: 'A', type: 'character', score: 1, imp: 10, inject: { full: 'A'.repeat(170), compact: 'A'.repeat(35), micro: 'A=핵심' } },
    { id: 2, name: 'B', type: 'character', score: 0.9, imp: 9, inject: { full: 'B'.repeat(170), compact: 'B'.repeat(35), micro: 'B=핵심' } }
  ], 230, { compressionMode: 'auto', useCompressedFormat: true });
  assert.strictEqual(packed.included.length, 2, 'global budget planning dropped lore before trying compact variants');
  assert(packed.downgraded.length >= 1, 'global budget planning did not downgrade any entry');
  assert(packed.usedChars <= 230, 'global lore packing exceeded its budget');
  assert(packed.variants.some(item => item.name === 'B' && item.level === 'compact'), 'automatic planning did not downgrade the lower-priority lore first');
  const explicitFull = C.buildLoreBudgetPlan([
    { id: 1, name: 'A', type: 'character', score: 1, inject: { full: 'A'.repeat(170), compact: 'short A', micro: 'A' } },
    { id: 2, name: 'B', type: 'character', score: 0.5, inject: { full: 'B'.repeat(170), compact: 'short B', micro: 'B' } }
  ], 230, { compressionMode: 'full', useCompressedFormat: true });
  assert(explicitFull.variants.every(item => item.level === 'full'), 'explicit Full mode silently changed representation');
  assert(explicitFull.downgraded.length === 0 && explicitFull.dropped.length === 1, 'explicit Full mode did not remove only the entry that could not fit');
  const retrievalPriority = C.buildLoreBudgetPlan([
    { id: 1, name: '정적 중요도', type: 'character', _retrievalScore: 0.1, imp: 10, inject: { full: '낮은 검색 점수'.repeat(8) } },
    { id: 2, name: '현재 관련', type: 'character', _retrievalScore: 1, imp: 1, inject: { full: '높은 검색 점수'.repeat(8) } }
  ], 90, { compressionMode: 'full', useCompressedFormat: true });
  assert.strictEqual(retrievalPriority.included[0]?.id, 2, 'actual retrieval score is not used by the final lore budget planner');

  const merged = C.mergeImportedEntries([
    { type: 'character', name: 'A', triggers: ['A'], summary: { full: 'first', compact: 'first', micro: 'A=first' }, imp: 4 },
    { type: 'character', name: 'A', triggers: ['Alias'], summary: { full: 'second', compact: 'second', micro: 'A=second' }, imp: 8 }
  ]);
  assert.strictEqual(merged.length, 1, 'chunk-spanning imported entities were not consolidated');
  assert(merged[0].triggers.includes('A') && merged[0].triggers.includes('Alias'), 'import consolidation lost triggers');
  assert.strictEqual(merged[0].imp, 8, 'import consolidation lost the stronger score');
  const importantLine = C.normalizeLoreEntry({
    type: 'key_quote', name: 'A의 결심', speaker: 'A', quote: '나는 반드시 돌아올게.', context: '출발 직전', meaning: '재회의 약속',
    triggers: ['A', '돌아올게'], summary: { full: 'A가 반드시 돌아오겠다고 약속함.', compact: 'A의 귀환 약속', micro: 'A=귀환 약속' }
  });
  assert(importantLine.embed_text.includes('나는 반드시 돌아올게.'), 'important-line source text is missing from embedding text');
  assert(importantLine.entities.includes('A'), 'important-line speaker is missing from entities');
}

async function testRuntimeCompatibilityHelpers() {
  const encounterKernel = await loadKernel();
  const encounterRows = [];
  let encounterId = 1;
  const encounterTable = {
    where(query) {
      return {
        first: async () => encounterRows.find(row => Object.entries(query).every(([key, value]) => row[key] === value)) || null
      };
    },
    async update(id, patch) {
      const row = encounterRows.find(item => item.id === id);
      if (row) Object.assign(row, patch);
    },
    async put(row) {
      const copy = JSON.parse(JSON.stringify(row));
      if (copy.id == null) copy.id = encounterId++;
      const index = encounterRows.findIndex(item => item.id === copy.id);
      if (index >= 0) encounterRows[index] = copy;
      else encounterRows.push(copy);
      return copy.id;
    }
  };
  encounterKernel.C.getDB = () => ({ encounters: encounterTable });
  vm.runInContext(read('embedding/core-memory.js'), encounterKernel.context, { filename: 'core-memory.js' });
  await encounterKernel.C.recordFirstEncounter('리아', '서윤', { chatKey: 'chat:A', turnApprox: 3 });
  assert(await encounterKernel.C.checkFirstEncounter('서윤', '리아', 'chat:A'), 'same-chat encounter was not found in canonical pair order');
  assert.strictEqual(await encounterKernel.C.checkFirstEncounter('서윤', '리아', 'chat:B'), null, 'encounter state leaked into another chat');
  assert.deepStrictEqual(
    Array.from(await encounterKernel.C.findUnmetPairs(['서윤', '리아'], 'chat:B')).map(pair => Array.from(pair)),
    [['서윤', '리아']],
    'a new chat did not report its own unmet pair'
  );

  const platformKernel = await loadKernel();
  platformKernel.context.CrackUtil = {
    path: () => ({ chatRoom: () => 'room-1' }),
    chatRoom: () => ({
      extractLogs: async () => [
        { content: '사용자 입력', isUser: () => true },
        { message: 'AI 응답', isBot: () => true }
      ]
    })
  };
  vm.runInContext(read('embedding/core-platform.js'), platformKernel.context, { filename: 'core-platform.js' });
  const normalizedLogs = await platformKernel.C.fetchLogs(2);
  assert.deepStrictEqual(
    Array.from(normalizedLogs, row => ({ role: row.role, message: row.message })),
    [{ role: 'user', message: '사용자 입력' }, { role: 'assistant', message: 'AI 응답' }],
    'method-based CrackUtil logs were not normalized'
  );
}

function testPromptContract() {
  const context = { console };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('embedding/injecter-2.js'), context, { filename: 'injecter-2.js' });
  const L = context.__LoreInj;
  const schema = JSON.parse(L.DEFAULT_AUTO_EXTRACT_SCHEMA);
  assert(schema.some(row => row.type === 'timeline_event'), 'main schema does not accept timeline_event');
  assert(schema.some(row => String(row.type).includes('ability') && String(row.type).includes('faction')), 'genre-neutral lore types are missing');
  assert(schema.some(row => String(row.type).includes('key_quote')), 'important-line lore type is missing');
  assert(L.DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB.includes('REQUIRED CORE'), 'weak-model core contract is missing');
  assert(L.DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB.includes('FACT BINDING'), 'owner-bound fact contract is missing');
  assert(schema.every(row => Array.isArray(row.facts)), 'default extraction schema does not require structured facts');
  assert(!L.DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB.includes('summary.full/compact/micro'), 'default extraction still asks the model for three summary variants');
  assert(!L.DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB.startsWith('You are'), 'default extraction begins with unnecessary role metadata');
  assert(Array.from(L.LEGACY_AUTO_EXTRACT_PROMPT_SIGNATURES_WITH_DB || []).includes('7822:83cfc73b'), 'previous Memory V2 DB prompt is not eligible for exact-default migration');
  assert(Array.from(L.LEGACY_AUTO_EXTRACT_PROMPT_SIGNATURES_WITHOUT_DB || []).includes('5830:5a632fb0'), 'previous Memory V2 no-DB prompt is not eligible for exact-default migration');
  assert(L.DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB.includes('same established continuity as facts'), 'Full and structured facts are not required to preserve the same meaning');
  assert(L.DEFAULT_DEEPSEEK_IMPORT_PROMPT.includes('{"entries":[...]}') && L.DEFAULT_DEEPSEEK_IMPORT_PROMPT.includes('{"entries":[]}'), 'DeepSeek import prompt is empty or uses the wrong top-level JSON shape');
  assert(L.DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB.includes('{outputMode}'), 'DB prompt lost the output-mode placeholder');
  const promptText = [
    L.DEFAULT_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    L.DEFAULT_AUTO_EXTRACT_PROMPT_WITH_DB,
    L.DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITHOUT_DB,
    L.DEFAULT_DEEPSEEK_AUTO_EXTRACT_PROMPT_WITH_DB,
    L.DEFAULT_DEEPSEEK_IMPORT_PROMPT
  ].join('\n').toLowerCase();
  assert(!/censor|moralize|ethic/.test(promptText), 'disallowed policy wording leaked into default prompts');
  assert.deepStrictEqual(Array.from(Object.keys(L.OOC_FORMATS)), ['default', 'compact', 'custom'], 'strong OOC wrapper choices were not removed');
  assert(L.OOC_FORMATS.default.prefix.includes('not directions for what characters must do or say'), 'default OOC wrapper still over-directs roleplay behavior');
}

function testSourceContracts() {
  const settingsSource = read('embedding/injecter-3.js');
  assert(settingsSource.includes("apiType === 'vertex' && geminiEmbedKey"), 'Vertex generation does not prefer the separate AI Studio embedding key');
  assert(settingsSource.includes("opts.apiType = 'key';") && settingsSource.includes('opts.key = geminiEmbedKey;'), 'separate embedding key is not routed to the Gemini Developer API');
  assert(settingsSource.includes("cfg.embeddingModel === 'gemini-embedding-2-preview'") && settingsSource.includes("cfg.embeddingModel = 'gemini-embedding-2'"), 'legacy Embedding 2 model setting is not migrated');

  const embeddingUi = read('embedding/injecter-6-sub-main.js');
  assert(embeddingUi.includes("v:'gemini-embedding-2'"), 'stable Gemini Embedding 2 is missing from the UI');
  assert(!embeddingUi.includes("v:'gemini-embedding-2-preview'"), 'retired Gemini Embedding 2 preview remains selectable');

  const extraction = read('embedding/injecter-4.js');
  const normalStart = extraction.indexOf('async function _doExtract');
  const batchStart = extraction.indexOf('const BATCH_RETRY_STORAGE_KEY');
  const normalPath = extraction.slice(normalStart, batchStart);
  assert(normalPath.includes('collectTemporalExtractItems'), 'normal extraction does not stage temporal results');
  assert(!normalPath.includes('runTemporalExtractPass({'), 'normal extraction still uses the write-first temporal path');
  assert(normalPath.indexOf('collectTemporalExtractItems') < normalPath.indexOf('snapshotPackState'), 'pack snapshot occurs before all required API calls finish');
  assert(normalPath.includes('restorePackState(rollbackState)'), 'normal extraction rollback is missing');
  assert(normalPath.includes("mergeExtractedData(parsedItems, _url, { skipSnapshot: true })"), 'general extraction can create a duplicate persisted snapshot');
  assert(normalPath.includes("mergeExtractedData(temporalResult.events, _url, { skipSnapshot: true })"), 'temporal extraction can create a duplicate persisted snapshot');
  assert.strictEqual((normalPath.match(/createSnapshot\(commitPackName, '자동 병합 전 백업', 'auto'\)/g) || []).length, 1, 'one extraction transaction must create exactly one persisted snapshot');
  assert(normalPath.includes('scene memories are extracted separately'), 'general and dedicated scene extraction are not coordinated');
  assert(extraction.includes('set.facts') && extraction.includes('append.openLoops'), 'patch extraction does not expose the structured-memory update path');
  const temporalPatchStart = extraction.indexOf('async function applyTemporalPatchOp');
  const temporalPatchEnd = extraction.indexOf('function isExtractItemObject', temporalPatchStart);
  const temporalPatchPath = extraction.slice(temporalPatchStart, temporalPatchEnd);
  assert(temporalPatchPath.includes('set.facts') && temporalPatchPath.includes('append.facts') && temporalPatchPath.includes('append.openLoops'), 'important-scene patches ignore structured facts or unresolved loops');
  assert(!extraction.includes('prefer append.hooks, append.recallTriggers, append.actions, or set.summary.compact/micro'), 'temporal patch prompt still requests model-generated compact summaries');
  assert(extraction.includes('Return summary.full only when the complete event memory changed.'), 'temporal patch prompt does not preserve the complete-summary contract');
  assert(extraction.includes('isRecognizedExtractResponse(parsed)'), 'structured JSON envelopes are not validated');
  assert(extraction.includes('!!(res && res.text) && !validStructure'), 'JSON repair can run without a provider response body');
  assert(extraction.includes('if (!validStructure) parsed = null'), 'malformed structured output can still be accepted as empty');
  assert(extraction.includes("if (isManual) throw new Error('이미 로어 추출이 진행 중입니다."), 'duplicate manual extraction is still queued while another extraction is running');
  const resumableBatch = extraction.slice(extraction.indexOf('async function runBatchExtractResumable'));
  assert(extraction.includes("const BATCH_RETRY_STORAGE_KEY = 'lore-batch-extraction-jobs-v1'"), 'persistent batch retry state is missing');
  assert(resumableBatch.includes('successfulStages.push'), 'successful batch stages are not preserved independently');
  assert(resumableBatch.includes('onlyBatchIndexes'), 'failed-only retry selection is missing');
  assert(resumableBatch.includes('saveBatchRetryJob(chatKey, job)'), 'failed batch indexes are not persisted');
  assert(resumableBatch.includes('runBatchExtract: runBatchExtractResumable'), 'resumable batch extractor is not the exported runtime path');

  const settings = read('embedding/injecter-3.js');
  assert(settings.includes("const dT = this.config.templates.find(t => t.isDefault || t.id === 'default')"), 'default-template targeting changed');
  assert(settings.includes('(signatures || []).includes(signature(t[key]))'), 'custom prompt migration is not exact-signature guarded');
  assert(settings.includes('LEGACY_TEMPORAL_PROMPT_SIGNATURES') && settings.includes('LEGACY_TEMPORAL_SCHEMA_SIGNATURES'), 'saved default temporal prompts are not migrated without touching edits');
  assert(settings.includes("'autoExtOpenAIFormat'"), 'OpenAI transport format is not preserved by API-only settings reset');
  assert(!settings.includes('persistStorageIfPossible()'), 'persistent storage permission is still requested during settings saves');
  assert(settings.includes('async function requestPersistentStorage()'), 'user-triggered persistent storage request is missing');
  assert(!settings.includes('cleanupStaleEmbeddings(null'), 'startup migration still deletes existing embeddings');
  assert(settings.includes("if (isGemini25)") && settings.includes('thinkingBudget:'), 'Gemini 2.5 thinking-budget behavior was removed');
  assert(settings.includes('arr.slice(0, Math.max(0, maxItems || 20))'), 'settings compaction does not preserve newest-first activity logs');
  assert(settings.match(/up\[curUrl\] = currentActive;/g)?.length >= 2, 'pack toggles can revive stale active-pack settings');

  const kernel = read('embedding/core-kernel.js');
  const coreEmbedding = read('embedding/core-embedding.js');
  const coreMemory = read('embedding/core-memory.js');
  assert(kernel.includes('function enqueueEmbeddingApi') && kernel.includes('embeddingMinGapMs'), 'embedding calls are not globally serialized');
  assert(!kernel.includes('activeMaxOutputTokens'), 'Gemini output limits are still being rewritten internally');
  assert(coreEmbedding.includes('if (isTransientEmbeddingFailure(batchError)) throw batchError'), '429/5xx batch failures still fan out into individual calls');
  assert(coreEmbedding.includes('const EMBED_BATCH_GAP_MS = 1200'), 'embedding batch pacing is too aggressive for low-quota keys');
  assert(coreEmbedding.lastIndexOf('cleanup = await cleanupStaleEmbeddings(packName, apiOpts)') > coreEmbedding.indexOf('await runBatches(pendingConditions'), 'old embeddings are deleted before replacement generation succeeds');
  assert(kernel.includes('const DB_SCHEMA_VERSION = 11') && kernel.includes('&[chatKey+char1+char2]'), 'encounter state is not isolated per chat');
  assert(coreMemory.includes('checkFirstEncounter(char1, char2, chatKey') && coreMemory.includes('payload.chatKey'), 'encounter helpers ignore the current chat scope');

  const menu = read('embedding/injecter-6.js');
  for (const label of ['홈', '로어 관리', '로어 추출/변환', '백업', '응답 교정', 'API 설정', '활동', '도움말']) {
    assert(menu.includes(`name: '${label}'`), `menu group missing: ${label}`);
  }
  assert(!menu.includes('flatMenuAdapter'), 'flat menu adapter is still active');

  const refinerDom = read('embedding/refiner-dom.js');
  const refinerCore = read('embedding/refiner-core.js');
  const injectionSource = read('embedding/injecter-5.js');
  const chatBootstrap = read('embedding_pre/erie_crack_inject_chat.user.js');
  const routerBootstrap = read('embedding_pre/erie_crack_inject.user.js');
  assert(chatBootstrap.includes('260727-memory-v2') && routerBootstrap.includes('260727-memory-v2'), 'bootstrap update paths do not target the new branch');
  assert(!chatBootstrap.includes('260706-hotfix') && !routerBootstrap.includes('260706-hotfix'), 'bootstrap still loads modules from the deployed branch');
  assert(injectionSource.includes('C.getWorkingMemory(_url)') && injectionSource.includes('C.selectDiverseCandidates'), 'live injection does not use working memory and deterministic diversity selection');
  assert(injectionSource.includes('s.entry._retrievalScore = Number(s.score) || 0'), 'retrieval scores are not forwarded to final budget priority');
  assert(injectionSource.includes('if (recentMsgs.length > 0)') && !injectionSource.includes('recentMsgs.length > 0 && config.firstEncounterWarning'), 'scene memory is still coupled to first-encounter management');
  assert(injectionSource.indexOf('findUnmetPairs(activeNames)') < injectionSource.indexOf('recordFirstEncounter(activeNames[i], activeNames[j]'), 'first encounters are recorded before unmet-pair detection');
  assert(injectionSource.indexOf('findReunionPairs(activeNames') < injectionSource.indexOf('recordFirstEncounter(activeNames[i], activeNames[j]'), 'current encounters are recorded before reunion detection');
  assert(refinerDom.includes("exactButton(document, '수정')"), 'native response-edit fallback does not open the current message editor');
  assert(refinerDom.includes("exactButton(document, '수정 완료')"), 'native response-edit fallback does not submit the corrected message');
  assert(refinerDom.includes('haystack.includes(expected)'), 'response visibility still relies on a partial unchanged suffix');
  assert(refinerCore.includes('await R.nudgeMessageNativeRender(serverMessageId, serverText, originalForDom)'), 'response correction does not await visible native fallback');
  assert(injectionSource.includes('refreshCleanedMessageInDOM(currentText, clean.text, item.messageId)'), 'successful cleanup does not refresh the visible user message');
  assert(injectionSource.includes('safeMatch.ok || normalizedMatch'), 'cleanup queue reconciliation still requires byte-identical message text');
  assert(injectionSource.includes("mode: 'tag'"), 'cleanup cannot safely recover from server-normalized whitespace');
  assert(!injectionSource.includes('await db.cleanupQueue.clear()'), 'cleanup queue saves can erase concurrently queued items');
  assert(injectionSource.includes('_cleanupPending = true') && injectionSource.includes("scheduleInjectionCleanup('pending-run', 1000)"), 'overlapping cleanup triggers are still dropped');
  assert(injectionSource.includes('settings.config.injectionCleanupTurns || item.cleanupAfterTurns'), 'current cleanup retention does not apply to existing queue items');
  assert(injectionSource.includes("scheduleInjectionCleanup('fallback-drain', 5000)"), 'fallback cleanup does not drain an eligible backlog');
  assert(injectionSource.includes("scheduleInjectionCleanup('queue-drain', 5000)"), 'tracked cleanup does not drain an eligible backlog');
  assert(injectionSource.includes('CLEANUP_FALLBACK_MAX_EDITS - cleaned') && !injectionSource.includes('CLEANUP_FALLBACK_MAX_EDITS - attempted'), 'failed queue reconciliation can still consume the entire tag-cleanup fallback budget');
  assert(injectionSource.includes("typeof log.isUser === 'function'") && injectionSource.includes('messageRoleOf(logs[i])'), 'cleanup does not support method-based CrackUtil user logs');
  assert(injectionSource.includes('C.findUnmetPairs(activeNames, chatKey)') && injectionSource.includes('C.findReunionPairs(activeNames, turnCounter, 10, chatKey)'), 'live encounter lookup is not scoped to the current chat');

  const interceptor = read('embedding/injecter-1.js');
  assert(interceptor.includes('const _injectInFlight = new Map()') && interceptor.includes('const INJECTION_DEDUPE_MS = 1500') && interceptor.includes('runInjection(original)'), 'adjacent transport hooks can run the same injection twice');

  const search = read('embedding/core-search.js');
  assert(search.includes('eb.model !== model') && search.includes('eb.vector.length !== queryVec.length'), 'hybrid search can compare stale vectors from another model space');

  const platform = read('embedding/core-platform.js');
  assert(platform.includes("typeof log.isUser === 'function'") && platform.includes("typeof log.isBot === 'function'"), 'platform log normalization depends only on role fields');

  const apiUi = read('embedding/injecter-6-sub-api.js');
  assert(apiUi.includes('{ hideModeSelector: true }'), 'duplicate provider selector is still visible in API settings');
  assert(apiUi.includes("['Anthropic Messages (/v1/messages)', 'anthropic_messages']"), 'Anthropic Messages format selector is missing');
  assert(apiUi.includes("['Responses (/responses)', 'responses']"), 'Responses format selector is missing');
  assert(apiUi.includes("['커스텀 (입력한 전체 URL 사용)', 'custom']"), 'custom full-URL format selector is missing');
  assert(apiUi.includes("autoExtOpenAIFormat || 'custom'"), 'custom full-URL format is not the new-install UI default');
  assert(apiUi.includes('추출 항목 체크는 커스텀 프롬프트에도 동일하게 적용됩니다.'), 'custom prompt and extraction-scope behavior is not explained');
  assert(!apiUi.includes('지시문'), 'developer-facing instruction terminology remains in API UI');
  assert(apiUi.includes("{ feature: 'autoExtract', chatKey: 'global' }") && apiUi.includes("responseMimeType: 'application/json'"), 'API test does not exercise the structured generation and reasoning path used by extraction');
  assert(apiUi.includes("featureModel(key).includes('gemini-2.5')") && apiUi.includes("['예산', 'budget']"), 'Gemini 2.5 thinking-budget UI was not preserved');

  const extractionUi = read('embedding/injecter-6-sub-extract.js');
  assert(extractionUi.includes('시간과 생성 API 사용량이 늘어남'), 'extra temporal API call is not disclosed in the UI');
  assert(extractionUi.includes("appendTopicChecklist(nd, 'autoExtractTopics')") && extractionUi.includes("appendTopicChecklist(nd, 'manualExtractTopics')"), 'automatic and manual extraction topics are not separate');
  assert(extractionUi.includes('실패 구간만 다시 시도'), 'persistent failed-batch action is missing');

  const coreUi = read('embedding/core-ui.js');
  assert(coreUi.includes('.lore-inj-modal .decentral-modal'), 'modal styles are not scoped to the Lore UI');
  assert(coreUi.includes('@media (max-width:700px)'), 'mobile modal breakpoint is missing');
  assert(coreUi.includes('grid-template-columns:minmax(0,1fr)'), 'mobile content does not collapse to one column');

  const injection = read('embedding/injecter-5.js');
  assert(injection.includes('deriveAiMemoryTurns(recentMsgs, config)'), 'adaptive reinjection is not wired into injection');
  assert(injection.includes('scanRange: config.scanRange'), 'scene-local trigger scan configuration disappeared');
  assert(injection.includes('turnCounter % settings.config.autoExtTurns === 0'), 'automatic extraction is not scheduled from the chat turn counter');
  assert(injection.includes('maxInputChars: MAX_INPUT_CHARS'), '2000-character injection planner is not used');
  assert(extraction.includes('_extQ.pendingTurns += Math.max(1, Number(settings.config.autoExtTurns) || 1)') && extraction.includes('_doExtract(isManual, carriedTurns)'), 'automatic extraction can leave an unscanned gap while a prior pass is running');
  assert(extraction.includes('if (packWasCreated) await setPackEnabled(packName, true)'), 'automatic extraction re-enables an existing pack against the user selection');
  const featureGenerationSources = [extraction, read('embedding/core-importer.js'), refinerCore, injection, read('embedding/core-search.js'), apiUi];
  assert(featureGenerationSources.every(source => !source.includes('maxOutputTokens')), 'a feature still imposes a separate generation output limit');
  const mainUi = read('embedding/injecter-6-sub-main.js');
  assert(mainUi.includes("extractRemaining + '턴 남음'"), 'home does not show turns remaining until automatic extraction');

  assert(platform.includes('{ maxCount: count, naturalOrder: true }'), 'recent-message order is implicit');

  const importer = read('embedding/core-importer.js');
  assert(importer.includes("db.transaction('rw', db.entries, db.packs"), 'knowledge conversion commit is not transactional');
  assert(importer.includes('mergeImportedEntries(allEntries)'), 'knowledge conversion does not consolidate cross-chunk duplicates');

  const backup = read('embedding/injecter-6-sub-backup.js');
  assert(backup.includes("parts[0] !== 'v1' && parts[0] !== 'v2gzip'"), 'legacy encrypted server backups are no longer accepted');
  assert(backup.includes('includeEmbeddings: false, includeHistory: false, serverSlim: true'), 'new server backups are not slim');
  assert(backup.includes('const packs = Array.from(new Set(((report && report.touchedPacks) || [])'), 'server restore does not limit embedding rebuild to restored packs');
  assert(backup.includes('B.renderLorePackImportSection(nd)'), 'lore-pack import was not moved to Backup');
  assert(backup.includes("makeBtn('파일 내용을 현재 데이터에 추가'"), 'file merge action is still ambiguous');
  assert(backup.includes("makeBtn('파일 기준으로 전체 복원'"), 'file replacement action is still ambiguous');
  assert(backup.includes("makeBtn('현재 데이터를 서버에 백업'"), 'server backup action is still ambiguous');
  assert(backup.includes("makeBtn('선택 백업을 현재 데이터에 추가'"), 'server merge action is still ambiguous');
  assert(backup.includes('기존 백업은 덮어쓰지 않습니다'), 'server backup behavior is not explained');
  assert(backup.includes("makeBtn('기기 저장소 보호 요청'"), 'persistent storage permission has no explicit user action');
  assert(!backup.includes("title.textContent = '저장 공간 정리'") && !backup.includes('사용하지 않는 데이터 정리'), 'storage cleanup UI is still present');
  assert(!settings.includes('deletePackData, cleanupUnusedLoreStorage,'), 'manual storage cleanup remains publicly exposed');

  const fileUi = read('embedding/injecter-6-sub-file.js');
  const backupImport = fileUi.slice(fileUi.indexOf('async function importFullBackup'), fileUi.indexOf('function showBackupImportDialog'));
  assert(fileUi.includes("const CLEAR_ONLY_TABLES = ['cleanupQueue']"), 'full replacement leaves stale injection-cleanup work behind');
  assert(backupImport.includes("await db.transaction('rw', ...transactionTables"), 'backup restore is not atomic');
  assert(backupImport.indexOf("await db.transaction('rw', ...transactionTables") < backupImport.indexOf('applySettingsPolicy(data.settings'), 'settings are changed before database restore commits');
  assert(backupImport.includes('const mappedId = idMap[row.entryId]') && backupImport.includes('if (mappedId == null) continue'), 'merged entry history can attach to an unrelated old entry id');
  assert(backupImport.includes('row.packName = resolved.name'), 'snapshot pack references are not remapped during merge');
  const keepConflictBranch = backupImport.slice(
    backupImport.indexOf("entryConflictMode === 'keep'"),
    backupImport.indexOf('} else {', backupImport.indexOf("entryConflictMode === 'keep'"))
  );
  assert(!keepConflictBranch.includes('touchedPacks.add(entry.packName)'), 'unchanged backup conflicts still trigger pack-wide embedding regeneration');
  assert(fileUi.includes('async function renameLorePack'), 'lore-pack rename is missing');
  assert(fileUi.includes('renamedData.map') || fileUi.includes('data.map(entry => ({ ...entry, packName: newName }))'), 'pack rename does not update snapshot contents');
  assert(fileUi.includes("modal.createSubMenu('로어팩 관리'"), 'lore-pack manager label is missing');
  assert(!fileUi.slice(fileUi.indexOf("modal.createSubMenu('로어팩 관리'")).includes("title.textContent = '로어 가져오기'"), 'lore-pack import is still rendered in the manager');
  assert(fileUi.includes("loreSummary.textContent = '로어 펼쳐보기'"), 'pack manager cannot expand lore entries');
  assert(fileUi.includes("saveEntryBtn.textContent = '저장'"), 'pack manager lore editor is missing');
  assert(fileUi.includes('await db.entries.put(updated)'), 'pack manager does not persist edited lore');

  const snapshotUi = read('embedding/injecter-6-sub-snapshot.js');
  assert(snapshotUi.includes("C.unpackJsonFromStorage(snapshot, 'data', 'dataGzip', 'dataEncoding')"), 'compressed snapshot preview is missing');
  assert(snapshotUi.includes('원본 JSON 보기'), 'snapshot raw detail view is missing');
  assert(settings.includes("db.entries.add({ ...e, packName: snap.packName })"), 'snapshot restore does not enforce the current pack name');

  const mergeUi = read('embedding/injecter-6-sub-merge.js');
  assert(!mergeUi.includes('최대 글자수 (summary)'), 'ambiguous merge character limit is still visible');
  assert(!mergeUi.includes('keep-longest') && !mergeUi.includes('가장 긴 항목 유지'), 'non-AI merge mode is still available');
  assert(mergeUi.includes("previewButton.textContent = 'AI 병합 미리보기'"), 'selected-lore AI merge preview is missing');
  assert(mergeUi.includes('state.selectedIds.has(entry.id)'), 'merge execution is not scoped to selected lore');
  assert(mergeUi.includes("C.createToggleRow('유사도 후보 필터'"), 'optional similarity filter is missing');
  assert(mergeUi.includes("db.transaction('rw', db.entries, db.embeddings, db.packs"), 'selected-lore merge commit is not transactional');
  assert(mergeUi.includes('await reembedPacks(packs'), 'merge does not automatically rebuild affected pack embeddings');
  assert(mergeUi.includes('mergeSummaries(null, draft.summary)'), 'AI merge preview still appends original summaries to the consolidated draft');
  assert(!mergeUi.includes('merged.summary = mergeSummaries(base.summary'), 'AI merge preview can duplicate summary facts');

  const refinerQueue = read('embedding/refiner-queue.js');
  const refinerEntry = read('embedding/refiner.js');
  const refinerObserver = read('embedding/refiner-observer.js');
  const refinerUi = read('embedding/injecter-6-sub-refiner.js');
  assert(!refinerQueue.includes('queued for refine') && !refinerQueue.includes('calling refiner api'), 'raw refiner queue status is user-visible');
  assert(!refinerObserver.includes('stable assistant response'), 'raw observer status is user-visible');
  assert(refinerUi.includes("queued: '교정 대기'"), 'refiner state labels are not localized');
  assert(refinerUi.includes("String(lastBot.role || '').toLowerCase() !== 'assistant'"), 'manual correction does not reject a user-role target');
  assert(refinerQueue.includes('msgId: msgId ||') && refinerQueue.includes('item.msgId'), 'automatic correction loses the assistant message id');
  assert(refinerEntry.includes("R.processQueue, msgId || ''"), 'manual correction loses the assistant message id');
  assert(refinerCore.includes('isAssistantLog(targetLog)') && refinerCore.includes('isUserMessageEcho(correctedText, allMsgsForContext)'), 'correction target/user-echo guards are missing');
  assert(refinerCore.includes('Every replacements.from must be an exact substring of [New Speech]'), 'correction prompt does not isolate the assistant response');
  assert(refinerCore.includes("Core.showStatusBadge('에리: 이상 없음')"), 'PASS no longer shows the non-popup status badge');
  assert(!refinerCore.includes("ToastCallback('에리: 통과'"), 'PASS still creates a popup notification');
  assert(refinerCore.includes("text.toLocaleUpperCase() === String(passWord).trim().toLocaleUpperCase()"), 'refiner PASS detection still accepts partial words such as BYPASS');
  assert(refinerCore.includes("if (!applied) return { handled: false, retryable: true, status: 'apply_failed'"), 'failed automatic correction edits are marked complete');
  assert(refinerQueue.includes('const inFlightFingerprints = new Set()') && refinerQueue.includes('retryAfterByFingerprint'), 'failed refiner calls can be duplicated immediately');
  assert(!refinerQueue.includes('Promise.race(['), 'refiner queue can abandon a live API call and start another one');
  assert(refinerQueue.indexOf('fingerprints.add(item.fingerprint)') > refinerQueue.indexOf('await R.refineMessage'), 'refiner marks a response complete before the API result is known');
  assert(refinerCore.includes("return { handled: false, retryable: true, status: 'error'"), 'refiner failures cannot be retried safely');
  assert(!refinerObserver.includes('R.workerBusy = false; R.Core && R.Core.hideStatusBadge()'), 'refiner watchdog can unlock a request that is still running');
}

async function testMenuRuntime() {
  const action = () => {};
  const subRows = [
    ['lore', ['로어 목록']],
    ['file', ['로어팩 관리']],
    ['extract', ['로어 추출/변환']],
    ['merge', ['로어 병합']],
    ['snapshot', ['스냅샷']],
    ['backup', ['백업/동기화']],
    ['refiner', ['AI 응답 교정']],
    ['log', ['실행 로그']],
    ['session', ['현재 세션']],
    ['api', ['API 설정', '프롬프트 관리']],
    ['help', ['도움말']]
  ];
  const context = {
    console,
    setTimeout,
    clearTimeout,
    document: { readyState: 'complete' },
    __LoreInj: {
      __injectLoaded: true,
      __menuQueue: [{ key: 'main', cb: modal => modal.createMenu('홈/주입 설정', action) }],
      __subMenuQueue: subRows.map(([key, labels]) => ({
        key,
        cb: modal => labels.forEach(label => modal.createSubMenu(label, action))
      }))
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  const boot = vm.runInContext(read('embedding/injecter-6.js'), context, { filename: 'injecter-6.js' });
  if (boot && typeof boot.then === 'function') await boot;

  const top = [];
  const modal = {
    createMenu(name, menuAction) {
      let row = top.find(item => item.name === name);
      if (!row) { row = { name, menuAction, children: [] }; top.push(row); }
      return {
        createSubMenu(childName, childAction) {
          if (!row.children.some(child => child.name === childName)) row.children.push({ name: childName, childAction });
          return this;
        }
      };
    }
  };
  context.__LoreInj.setupSubMenus(modal);
  context.__LoreInj.setupSubMenus(modal);
  assert.deepStrictEqual(top.map(row => row.name), ['홈', '로어 관리', '로어 추출/변환', '백업', '응답 교정', 'API 설정', '활동', '도움말']);
  assert.deepStrictEqual(top.find(row => row.name === '로어 관리').children.map(row => row.name), ['목록', '로어팩 관리', '중복 정리', '복원 지점']);
  assert.deepStrictEqual(top.find(row => row.name === 'API 설정').children.map(row => row.name), ['연결 및 모델', '프롬프트']);
  assert.deepStrictEqual(top.find(row => row.name === '활동').children.map(row => row.name), ['실행 기록', '현재 대화 상태']);
}

async function main() {
  testSourceSyntax();
  await testKernelHelpers();
  await testRuntimeCompatibilityHelpers();
  testPromptContract();
  testSourceContracts();
  await testMenuRuntime();
  process.stdout.write('Regression tests passed.\n');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
