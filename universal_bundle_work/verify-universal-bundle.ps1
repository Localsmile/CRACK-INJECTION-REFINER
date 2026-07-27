param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ManifestPath = (Join-Path $PSScriptRoot 'bundle-manifest.json'),
  [string]$BundlePath = (Join-Path $PSScriptRoot 'dist\erie_crack_inject_universal.user.js')
)

$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$bundle = [System.IO.File]::ReadAllText($BundlePath, [System.Text.Encoding]::UTF8)
$errors = New-Object System.Collections.Generic.List[string]

function Assert-True([bool]$Cond, [string]$Msg) {
  if (!$Cond) { $script:errors.Add($Msg) }
}

Assert-True ($bundle.Contains('// @name        에리의 크랙 로어 인젝터 (Universal)')) 'wrong userscript name'
Assert-True ($bundle.Contains('// @version     ' + $manifest.version)) 'wrong userscript version'
$universalUrl = 'https://cdn.jsdelivr.net/gh/Localsmile/CRACK-INJECTION-REFINER@260727-memory-v2/universal_bundle_work/dist/erie_crack_inject_universal.user.js'
Assert-True ($bundle.Contains('// @updateURL   ' + $universalUrl)) 'missing universal update URL'
Assert-True ($bundle.Contains('// @downloadURL ' + $universalUrl)) 'missing universal download URL'
Assert-True ($bundle.Contains('// @match       https://crack.wrtn.ai/stories/*/episodes/*')) 'missing stories match'
Assert-True ($bundle.Contains('// @match       https://crack.wrtn.ai/characters/*/chats/*')) 'missing characters match'
Assert-True ($bundle.Contains('// @match       https://crack.wrtn.ai/u/*/c/*')) 'missing u/c match'
Assert-True ($bundle.Contains('// @grant       GM_xmlhttpRequest')) 'missing GM_xmlhttpRequest grant'
Assert-True ($bundle.Contains('// @grant       unsafeWindow')) 'missing unsafeWindow grant'
Assert-True ($bundle.Contains('// @sandbox     raw')) 'missing raw sandbox'
Assert-True ($bundle.Contains('nativeContextTokenBudget')) 'adaptive native-context setting missing'
Assert-True ($bundle.Contains('deriveAiMemoryTurns')) 'adaptive reinjection helper missing'
Assert-True ($bundle.Contains('normalizeFactList') -and $bundle.Contains('formatMemoryFactsCompact') -and $bundle.Contains('deriveMemoryMicro')) 'memory fact renderers missing'
Assert-True ($bundle.Contains('mergeMemoryFacts') -and $bundle.Contains('memorySchemaVersion')) 'memory fact normalization or version marker missing'
Assert-True ($bundle.Contains('selectDiverseCandidates') -and $bundle.Contains('workingMemoryMaxAgeTurns')) 'working-memory retrieval or deterministic diversity selection missing'
Assert-True ($bundle.Contains('packWholeSection') -and $bundle.Contains('sectionDrops')) 'whole-item auxiliary budget packing missing'
Assert-True ($bundle.Contains('ambiguous_multi_value_replace')) 'multi-value fact conflict guard missing'
Assert-True ($bundle.Contains('memoryDerivedFullSignature') -and $bundle.Contains('memoryDerivedEmbedSignature')) 'derived Full or embedding synchronization missing'
Assert-True ($bundle.Contains('_retrievalScore')) 'retrieval score is not forwarded to budget planning'
Assert-True ($bundle.Contains('buildLoreBudgetPlan') -and $bundle.Contains('variants') -and $bundle.Contains('downgraded') -and $bundle.Contains('compact') -and $bundle.Contains('micro')) 'global lore budget planner missing'
Assert-True ($bundle.Contains('buildOpenAICompatVariants')) 'bounded OpenAI compatibility helper missing'
Assert-True ($bundle.Contains('anthropic_messages') -and $bundle.Contains('custom') -and $bundle.Contains('openAICompatResponseText')) 'OpenAI-compatible transport adapters missing'
Assert-True ($bundle.Contains('lore-batch-extraction-jobs-v1')) 'resumable batch state missing'
Assert-True ($bundle.Contains('lore-inj-modal')) 'scoped Lore modal styling missing'
Assert-True (!$bundle.Contains('flatMenuAdapter')) 'legacy flat menu adapter remains'
Assert-True ($bundle.Contains('로어 관리') -and $bundle.Contains('로어 추출/변환') -and $bundle.Contains('응답 교정') -and $bundle.Contains('API 설정') -and $bundle.Contains('활동')) 'task-oriented menu groups missing'
Assert-True ($bundle.Contains('선택한 로어 AI 병합') -and $bundle.Contains('유사도 후보 필터') -and -not $bundle.Contains('keep-longest')) 'selected-only AI merge contract missing'
Assert-True ($bundle.Contains('로어 펼쳐보기') -and $bundle.Contains('입력한 전체 URL 사용')) 'pack inspection or custom URL UI missing'
Assert-True ($bundle.Contains('파일 내용을 현재 데이터에 추가') -and $bundle.Contains('현재 데이터를 서버에 백업')) 'backup action wording missing'
Assert-True (-not $bundle.Contains('사용하지 않는 데이터 정리')) 'removed storage cleanup UI remains in bundle'
Assert-True ($bundle.Contains('다음 자동 추출까지') -and $bundle.Contains('턴 남음')) 'automatic extraction countdown missing'

$projectRequireMatches = [regex]::Matches($bundle, '(?m)^// @require\s+https://raw\.githubusercontent\.com/Localsmile/CRACK-INJECTION-REFINER/')
Assert-True ($projectRequireMatches.Count -eq 0) 'project-owned @require lines remain'

foreach ($req in @($manifest.keepExternalRequires)) {
  Assert-True ($bundle.Contains('// @require     ' + $req)) "missing kept external @require: $req"
}

foreach ($rel in @($manifest.modules)) {
  Assert-True (!$bundle.Contains("/* ===== BEGIN $rel ===== */")) "source module comment marker leaked: $rel"
  Assert-True (!$bundle.Contains("/* ===== END $rel ===== */")) "source module comment marker leaked: $rel"
}

$markers = @(
  '__uiLoaded', '__kernelLoaded', '__platformLoaded', '__memoryLoaded', '__formatLoaded',
  '__searchLoaded', '__embeddingLoaded', '__pricingLoaded', '__importerLoaded',
  '__interceptorLoaded', '__constLoaded', '__settingsLoaded', '__extractLoaded',
  '__injectLoaded', '__inject6Loaded', '__subMainLoaded', '__subLoreLoaded',
  '__subMergeLoaded', '__subSnapshotLoaded', '__subFileLoaded', '__subBackupLoaded', '__subExtractLoaded',
  '__subRefinerLoaded', '__subLogLoaded', '__subSessionLoaded', '__subApiLoaded',
  '__subHelpLoaded'
)
foreach ($m in $markers) {
  Assert-True ($bundle.Contains($m)) "missing loaded marker: $m"
}

$menus = @('main','lore','file','backup','extract','merge','snapshot','refiner','log','session','api','help')
foreach ($m in $menus) {
  Assert-True ($bundle.Contains("registerSubMenu('$m'") -or $bundle.Contains("registerSubMenu(`"$m`"") -or $bundle.Contains("registerMenu('$m'") -or $bundle.Contains("registerMenu(`"$m`"")) "missing menu registration: $m"
}

$storageKeys = @(
  'lore-injector-v5',
  'lore-turn-counters',
  'lore-last-mention',
  'lore-recent-injections:',
  'lore-batch-extraction-jobs-v1',
  'urlPacks',
  'urlCooldownMaps'
)
foreach ($k in $storageKeys) {
  Assert-True ($bundle.Contains($k)) "missing storage key: $k"
}

$leakedCommentNeedles = @(
  '역할:',
  '의존:',
  'Phase ',
  'BEGIN embedding/',
  'END embedding/',
  'GENERATED FILE'
)
foreach ($needle in $leakedCommentNeedles) {
  Assert-True (!$bundle.Contains($needle)) "distribution comment text leaked: $needle"
}

if ($errors.Count -gt 0) {
  Write-Error ("Universal bundle verification failed:`n- " + ($errors -join "`n- "))
  exit 1
}

$syntaxOutput = & node --check $BundlePath 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error ("Universal bundle syntax check failed:`n" + ($syntaxOutput -join "`n"))
  exit 1
}

$bundleBytes = (Get-Item -LiteralPath $BundlePath).Length
Assert-True ($bundleBytes -lt 840000) "bundle is too large for reliable userscript injection: $bundleBytes bytes"
if ($errors.Count -gt 0) {
  Write-Error ("Universal bundle verification failed:`n- " + ($errors -join "`n- "))
  exit 1
}

Write-Output 'Universal bundle verification passed.'
Write-Output ("Bundle: $BundlePath")
Write-Output ("Modules: " + @($manifest.modules).Count)
Write-Output ("Bytes: " + $bundleBytes)
