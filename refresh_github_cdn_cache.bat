@echo off
setlocal

set "REPO=Localsmile/CRACK-INJECTION-REFINER"
set "REF=260513"
set "ARGS=%*"
set "DRY_RUN=0"
set "NO_HEAD=0"
set "THREADS=32"
set "TIMEOUT=10"

echo %ARGS% | findstr /i /c:"--dry-run" >nul && set "DRY_RUN=1"
echo %ARGS% | findstr /i /c:"--no-head" >nul && set "NO_HEAD=1"

for %%A in (%ARGS%) do (
  echo %%A | findstr /i /b /c:"--threads=" >nul && for /f "tokens=2 delims==" %%B in ("%%A") do set "THREADS=%%B"
  echo %%A | findstr /i /b /c:"--timeout=" >nul && for /f "tokens=2 delims==" %%B in ("%%A") do set "TIMEOUT=%%B"
)

echo [CRACK Lore Injector] jsDelivr cache refresh (parallel)
echo Repo: %REPO%@%REF%   threads=%THREADS%  timeout=%TIMEOUT%s  no-head=%NO_HEAD%  dry-run=%DRY_RUN%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Continue';" ^
"$repo=$env:REPO; $ref=$env:REF;" ^
"$dryRun=$env:DRY_RUN -eq '1'; $noHead=$env:NO_HEAD -eq '1';" ^
"$threads=[int]$env:THREADS; if($threads -lt 1){$threads=1}" ^
"$timeoutSec=[int]$env:TIMEOUT; if($timeoutSec -lt 1){$timeoutSec=10}" ^
"$roots=@('embedding','embedding_pre');" ^
"$exts=@('.js','.css','.json','.txt','.md');" ^
"$base=(Get-Location).Path;" ^
"$files=foreach($r in $roots){ if(Test-Path -LiteralPath $r){ Get-ChildItem -LiteralPath $r -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $exts -contains $_.Extension.ToLower() } | ForEach-Object { $_.FullName.Substring($base.Length+1).Replace('\\','/') } } };" ^
"$files=@($files | Sort-Object -Unique);" ^
"if(-not $files.Count){ Write-Host 'No files found.'; exit 1 }" ^
"Write-Host ('Files: ' + $files.Count);" ^
"if($dryRun){ $files | ForEach-Object { Write-Host ('PURGE ' + $_) }; Write-Host 'Dry run done.'; exit 0 }" ^
"Add-Type -AssemblyName System.Net.Http | Out-Null;" ^
"$handler=New-Object System.Net.Http.HttpClientHandler;" ^
"$handler.AutomaticDecompression=[System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate;" ^
"[System.Net.ServicePointManager]::DefaultConnectionLimit=512;" ^
"[System.Net.ServicePointManager]::SecurityProtocol=[System.Net.SecurityProtocolType]::Tls12;" ^
"$client=New-Object System.Net.Http.HttpClient($handler);" ^
"$client.Timeout=[TimeSpan]::FromSeconds($timeoutSec);" ^
"$stamp=(Get-Date).ToString('yyyyMMddHHmmss');" ^
"$iss=[System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault();" ^
"$pool=[runspacefactory]::CreateRunspacePool(1,$threads,$iss,$Host); $pool.Open();" ^
"$jobs=New-Object System.Collections.Generic.List[object];" ^
"$script={ param($client,$purgeUrl,$cdnUrl,$path,$noHead)" ^
"  $r=[ordered]@{ path=$path; ok=$false; err=$null }" ^
"  try {" ^
"    $resp=$client.GetAsync($purgeUrl).GetAwaiter().GetResult(); $resp.Dispose();" ^
"    if(-not $noHead){" ^
"      $req=New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Head,$cdnUrl);" ^
"      $resp2=$client.SendAsync($req).GetAwaiter().GetResult(); $resp2.Dispose();" ^
"    }" ^
"    $r.ok=$true" ^
"  } catch { $r.err=$_.Exception.Message }" ^
"  return [pscustomobject]$r" ^
"};" ^
"foreach($path in $files){" ^
"  $purge='https://purge.jsdelivr.net/gh/'+$repo+'@'+$ref+'/'+$path;" ^
"  $cdn='https://cdn.jsdelivr.net/gh/'+$repo+'@'+$ref+'/'+$path+'?v='+$stamp;" ^
"  $ps=[powershell]::Create().AddScript($script).AddArgument($client).AddArgument($purge).AddArgument($cdn).AddArgument($path).AddArgument($noHead);" ^
"  $ps.RunspacePool=$pool;" ^
"  $jobs.Add([pscustomobject]@{ ps=$ps; handle=$ps.BeginInvoke(); path=$path })" ^
"}" ^
"$ok=0; $fail=0; $done=0; $total=$jobs.Count;" ^
"foreach($j in $jobs){" ^
"  $res=$j.ps.EndInvoke($j.handle); $j.ps.Dispose();" ^
"  $done++;" ^
"  if($res -and $res[0].ok){ $ok++; Write-Host ('[' + $done + '/' + $total + '] OK   ' + $j.path) }" ^
"  else { $fail++; $msg=if($res){ $res[0].err } else { 'unknown' }; Write-Host ('[' + $done + '/' + $total + '] FAIL ' + $j.path + ' :: ' + $msg) -ForegroundColor Red }" ^
"}" ^
"$pool.Close(); $pool.Dispose(); $client.Dispose();" ^
"Write-Host '';" ^
"Write-Host ('Done. ok=' + $ok + ' fail=' + $fail + ' total=' + $total);" ^
"if($fail -gt 0){ exit 2 }"

echo.
echo Finished.
echo %ARGS% | findstr /i /c:"--no-pause" >nul || pause