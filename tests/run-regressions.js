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
      if (/\/responses$/i.test(String(opts.url || ''))) payload = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"entries":[]}' }] }], usage: { input_tokens: 10, output_tokens: 4 } };
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

  assert(C.estimateTextTokens('안녕하세요') >= 4, 'CJK token estimate is unexpectedly low');
  assert(C.estimateTextTokens('hello world') >= 2, 'Latin token estimate is unexpectedly low');

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

  vm.runInContext(read('embedding/core-importer.js'), context, { filename: 'core-importer.js' });
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
  const extraction = read('embedding/injecter-4.js');
  const normalStart = extraction.indexOf('async function _doExtract');
  const batchStart = extraction.indexOf('const BATCH_RETRY_STORAGE_KEY');
  const normalPath = extraction.slice(normalStart, batchStart);
  assert(normalPath.includes('collectTemporalExtractItems'), 'normal extraction does not stage temporal results');
  assert(!normalPath.includes('runTemporalExtractPass({'), 'normal extraction still uses the write-first temporal path');
  assert(normalPath.indexOf('collectTemporalExtractItems') < normalPath.indexOf('snapshotPackState'), 'pack snapshot occurs before all required API calls finish');
  assert(normalPath.includes('restorePackState(rollbackState)'), 'normal extraction rollback is missing');
  assert(normalPath.includes('A dedicated scene-memory pass will run'), 'general and dedicated scene extraction are not coordinated');
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
  assert(settings.includes('LEGACY.some(p => norm(p) === n)'), 'custom prompt migration is not exact-match guarded');
  assert(settings.includes("'autoExtOpenAIFormat'"), 'OpenAI transport format is not preserved by API-only settings reset');

  const menu = read('embedding/injecter-6.js');
  for (const label of ['홈', '로어 관리', '로어 추출/변환', '백업', '응답 교정', 'API 설정', '활동', '도움말']) {
    assert(menu.includes(`name: '${label}'`), `menu group missing: ${label}`);
  }
  assert(!menu.includes('flatMenuAdapter'), 'flat menu adapter is still active');

  const refinerDom = read('embedding/refiner-dom.js');
  const refinerCore = read('embedding/refiner-core.js');
  const injectionSource = read('embedding/injecter-5.js');
  assert(refinerDom.includes("exactButton(document, '수정')"), 'native response-edit fallback does not open the current message editor');
  assert(refinerDom.includes("exactButton(document, '수정 완료')"), 'native response-edit fallback does not submit the corrected message');
  assert(refinerDom.includes('haystack.includes(expected)'), 'response visibility still relies on a partial unchanged suffix');
  assert(refinerCore.includes('await R.nudgeMessageNativeRender(serverMessageId, serverText, originalForDom)'), 'response correction does not await visible native fallback');
  assert(injectionSource.includes('refreshCleanedMessageInDOM(currentText, clean.text, item.messageId)'), 'successful cleanup does not refresh the visible user message');
  assert(injectionSource.includes('(body === full || safeMatch.ok) && msgId'), 'cleanup queue reconciliation still requires byte-identical message text');

  const apiUi = read('embedding/injecter-6-sub-api.js');
  assert(apiUi.includes('{ hideModeSelector: true }'), 'duplicate provider selector is still visible in API settings');
  assert(apiUi.includes("['Anthropic Messages (/v1/messages)', 'anthropic_messages']"), 'Anthropic Messages format selector is missing');
  assert(apiUi.includes("['Responses (/responses)', 'responses']"), 'Responses format selector is missing');
  assert(apiUi.includes("['커스텀 (입력한 전체 URL 사용)', 'custom']"), 'custom full-URL format selector is missing');
  assert(apiUi.includes("autoExtOpenAIFormat || 'custom'"), 'custom full-URL format is not the new-install UI default');
  assert(apiUi.includes('추출 항목 체크는 커스텀 프롬프트에도 동일하게 적용됩니다.'), 'custom prompt and extraction-scope behavior is not explained');
  assert(!apiUi.includes('지시문'), 'developer-facing instruction terminology remains in API UI');

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
  const mainUi = read('embedding/injecter-6-sub-main.js');
  assert(mainUi.includes("extractRemaining + '턴 남음'"), 'home does not show turns remaining until automatic extraction');

  const platform = read('embedding/core-platform.js');
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
  assert(!backup.includes("title.textContent = '저장 공간 정리'") && !backup.includes('사용하지 않는 데이터 정리'), 'storage cleanup UI is still present');
  assert(!settings.includes('deletePackData, cleanupUnusedLoreStorage,'), 'manual storage cleanup remains publicly exposed');

  const fileUi = read('embedding/injecter-6-sub-file.js');
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

  const refinerQueue = read('embedding/refiner-queue.js');
  const refinerObserver = read('embedding/refiner-observer.js');
  const refinerUi = read('embedding/injecter-6-sub-refiner.js');
  assert(!refinerQueue.includes('queued for refine') && !refinerQueue.includes('calling refiner api'), 'raw refiner queue status is user-visible');
  assert(!refinerObserver.includes('stable assistant response'), 'raw observer status is user-visible');
  assert(refinerUi.includes("queued: '교정 대기'"), 'refiner state labels are not localized');
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
  testPromptContract();
  testSourceContracts();
  await testMenuRuntime();
  process.stdout.write('Regression tests passed.\n');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
