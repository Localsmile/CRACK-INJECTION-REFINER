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
Assert-True ($bundle.Contains('// @match       https://crack.wrtn.ai/stories/*/episodes/*')) 'missing stories match'
Assert-True ($bundle.Contains('// @match       https://crack.wrtn.ai/characters/*/chats/*')) 'missing characters match'
Assert-True ($bundle.Contains('// @match       https://crack.wrtn.ai/u/*/c/*')) 'missing u/c match'
Assert-True ($bundle.Contains('// @grant       GM_xmlhttpRequest')) 'missing GM_xmlhttpRequest grant'
Assert-True ($bundle.Contains('// @grant       unsafeWindow')) 'missing unsafeWindow grant'
Assert-True ($bundle.Contains('// @sandbox     raw')) 'missing raw sandbox'

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

Write-Output 'Universal bundle verification passed.'
Write-Output ("Bundle: $BundlePath")
Write-Output ("Modules: " + @($manifest.modules).Count)
