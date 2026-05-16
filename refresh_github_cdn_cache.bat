@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REPO=Localsmile/CRACK-INJECTION-REFINER"
set "REF=260517-hybrid-require"
set "ARGS=%*"
set "DRY_RUN=0"
set "NO_HEAD=0"
set "TIMEOUT=30"

echo %ARGS% | findstr /i /c:"--dry-run" >nul && set "DRY_RUN=1"
echo %ARGS% | findstr /i /c:"--no-head" >nul && set "NO_HEAD=1"

for %%A in (%ARGS%) do (
  echo %%A | findstr /i /b /c:"--timeout=" >nul && for /f "tokens=2 delims==" %%B in ("%%A") do set "TIMEOUT=%%B"
)

echo [CRACK Lore Injector] jsDelivr cache refresh
echo Repo: %REPO%@%REF%   timeout=%TIMEOUT%s  no-head=%NO_HEAD%  dry-run=%DRY_RUN%
echo.

set /a OK=0
set /a FAIL=0
set /a TOTAL=0

call :scan "embedding"
call :scan "embedding_pre"

echo.
echo Done. ok=%OK% fail=%FAIL% total=%TOTAL%
echo.
echo Finished.
echo %ARGS% | findstr /i /c:"--no-pause" >nul || pause
if %FAIL% GTR 0 exit /b 2
exit /b 0

:scan
set "ROOT=%~1"
if not exist "%ROOT%" exit /b 0
for /r "%ROOT%" %%F in (*.js *.css *.json *.txt *.md) do call :purge "%%F"
exit /b 0

:purge
set "FULL=%~1"
set "REL=!FULL:%CD%\=!"
set "REL=!REL:\=/!"
set /a TOTAL+=1

set "PURGE=https://purge.jsdelivr.net/gh/%REPO%@%REF%/!REL!"
set "CDN=https://cdn.jsdelivr.net/gh/%REPO%@%REF%/!REL!?v=%RANDOM%%RANDOM%"
set "PURGE_URL=!PURGE!"
set "CDN_URL=!CDN!"
set "TIMEOUT_SEC=%TIMEOUT%"

echo [%TOTAL%] PURGE !REL!
if "%DRY_RUN%"=="1" exit /b 0

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -Uri $env:PURGE_URL -TimeoutSec ([int]$env:TIMEOUT_SEC) | Out-Null; if($env:NO_HEAD -ne '1'){ Invoke-WebRequest -UseBasicParsing -Method Head -Uri $env:CDN_URL -TimeoutSec ([int]$env:TIMEOUT_SEC) | Out-Null }" ^
  >nul 2>nul

if errorlevel 1 (
  echo     FAIL !REL!
  set /a FAIL+=1
) else (
  echo     OK
  set /a OK+=1
)
exit /b 0
