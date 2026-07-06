param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$ManifestPath = (Join-Path $PSScriptRoot 'bundle-manifest.json'),
  [string]$OutPath = (Join-Path $PSScriptRoot 'dist\erie_crack_inject_universal.user.js'),
  [switch]$KeepComments
)

$ErrorActionPreference = 'Stop'

function Read-Utf8([string]$Path) {
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $dir = Split-Path -Parent $Path
  if ($dir -and !(Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Strip-BodyComments([string]$JsText) {
  $tmpIn = [System.IO.Path]::GetTempFileName()
  $tmpRunner = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), '.cjs')
  try {
    Write-Utf8NoBom $tmpIn $JsText
    $runner = @'
const fs = require("fs");
const terser = require("terser");
const inputPath = process.argv[2];
const input = fs.readFileSync(inputPath, "utf8");
terser.minify(input, {
  compress: false,
  mangle: false,
  format: {
    comments: false,
    beautify: false,
    ascii_only: false
  }
}).then((result) => {
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.stdout.write(result.code || "");
}).catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
'@
    Write-Utf8NoBom $tmpRunner $runner
    $clean = & node $tmpRunner $tmpIn
    if ($LASTEXITCODE -ne 0) { throw "Terser comment stripping failed with exit code $LASTEXITCODE" }
    return ($clean -join "`n")
  } finally {
    Remove-Item -LiteralPath $tmpIn -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $tmpRunner -Force -ErrorAction SilentlyContinue
  }
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$basePath = Join-Path $Root $manifest.baseScript
$base = Read-Utf8 $basePath

$metaMatch = [regex]::Match($base, '(?s)^// ==UserScript==.*?// ==/UserScript==')
if (!$metaMatch.Success) { throw "UserScript metadata block not found in $($manifest.baseScript)" }

$meta = $metaMatch.Value
$meta = [regex]::Replace($meta, '// @name\s+.*', '// @name        에리의 크랙 로어 인젝터 (Universal)')
$meta = [regex]::Replace($meta, '// @version\s+.*', '// @version     ' + [string]$manifest.version)
$meta = [regex]::Replace($meta, '// @description\s+.*', '// @description 에리를 죽인 크랙을 때린다.')
$meta = [regex]::Replace($meta, '// @updateURL\s+.*\r?\n', '')
$meta = [regex]::Replace($meta, '// @downloadURL\s+.*\r?\n', '')

$requireLines = [regex]::Matches($meta, '(?m)^// @require\s+(.+)$') | ForEach-Object { $_.Groups[1].Value.Trim() }
$keepRequires = @($manifest.keepExternalRequires)
foreach ($req in $requireLines) {
  if ($keepRequires -notcontains $req) {
    $escaped = [regex]::Escape("// @require     $req")
    $meta = [regex]::Replace($meta, "(?m)^$escaped\r?\n?", '')
  }
}

$bootstrap = @"
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  const L = _w.__LoreInj;
  L.chatBootstrapVersion = '$($manifest.version)';
  L.universalBundle = true;

  if (!L.__menuQueue) L.__menuQueue = [];
  if (!L.__subMenuQueue) L.__subMenuQueue = [];
  L.registerMenu = L.registerMenu || function(key, cb) { L.__menuQueue.push({ key, cb }); };
  L.registerSubMenu = L.registerSubMenu || function(key, cb) { L.__subMenuQueue.push({ key, cb }); };

  if (!_w.__LoreInjReady) {
    let resolveReady;
    const p = new Promise(r => { resolveReady = r; });
    p.__resolve = resolveReady;
    _w.__LoreInjReady = p;
  }
})();
"@

$bodyParts = New-Object System.Collections.Generic.List[string]
$bodyParts.Add($bootstrap)

foreach ($rel in @($manifest.modules)) {
  $abs = Join-Path $Root $rel
  if (!(Test-Path -LiteralPath $abs)) { throw "Module missing: $rel" }
  $code = Read-Utf8 $abs
  $bodyParts.Add("`n/* ===== BEGIN $rel ===== */`n$code`n/* ===== END $rel ===== */`n")
}

$requiredCore = @("'__interceptorLoaded'", "'__constLoaded'", "'__settingsLoaded'", "'__extractLoaded'", "'__injectLoaded'", "'__inject6Loaded'") -join ', '
$requiredSubs = @("'__subMainLoaded'", "'__subLoreLoaded'", "'__subMergeLoaded'", "'__subSnapshotLoaded'", "'__subFileLoaded'", "'__subBackupLoaded'", "'__subExtractLoaded'", "'__subRefinerLoaded'", "'__subLogLoaded'", "'__subSessionLoaded'", "'__subApiLoaded'", "'__subHelpLoaded'") -join ', '

$gate = @"

/* ===== BEGIN universal ready gate ===== */
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const L = _w.__LoreInj = _w.__LoreInj || {};
  const TIMEOUT_MS = 45000;
  const POLL_MS = 50;
  const deadline = Date.now() + TIMEOUT_MS;
  const requiredCore = [$requiredCore];
  const requiredSubs = [$requiredSubs];
  const requiredAll = requiredCore.concat(requiredSubs);
  let settled = false;

  function settle(payload) {
    if (settled) return;
    settled = true;
    try { _w.__LoreInjReady.__resolve(payload); } catch (_) {}
    try { _w.dispatchEvent(new CustomEvent('LoreInj:ready', { detail: payload })); } catch (_) {}
  }

  function check() {
    const state = _w.__LoreInj;
    if (!state) {
      if (Date.now() < deadline) return setTimeout(check, POLL_MS);
      settle({ ok: false, reason: 'no-core', missing: ['__LoreInj'], universal: true });
      return;
    }
    const missingCore = requiredCore.filter(k => !state[k]);
    const missingSubs = requiredSubs.filter(k => !state[k]);
    if (missingCore.length === 0 && !state.__gateCoreReadyAt) state.__gateCoreReadyAt = Date.now();
    if (missingCore.length === 0 && missingSubs.length === 0) {
      state.allReady = true;
      state.universalBundle = true;
      console.log('[LoreInj universal ' + (state.VER || L.chatBootstrapVersion) + '] gate passed');
      settle({ ok: true, ver: state.VER || L.chatBootstrapVersion, universal: true });
      return;
    }
    if (Date.now() < deadline) return setTimeout(check, POLL_MS);
    const missing = requiredAll.filter(k => !state[k]);
    console.error('[LoreInj universal] gate timeout:', missing);
    settle({ ok: false, reason: 'timeout', missing, missingCore, missingSubs, universal: true });
  }

  check();
})();
/* ===== END universal ready gate ===== */
"@
$bodyParts.Add($gate)

$body = ($bodyParts -join "`n")
if (!$KeepComments) {
  $body = Strip-BodyComments $body
}

$output = $meta + "`n`n" + $body
Write-Utf8NoBom $OutPath $output

Write-Output "Wrote $OutPath"
Write-Output ("Modules: " + @($manifest.modules).Count)
Write-Output ("Version: " + $manifest.version)
Write-Output ("Body comments: " + ($(if ($KeepComments) { 'kept' } else { 'stripped' })))
