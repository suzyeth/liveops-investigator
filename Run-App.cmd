@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required.
 pause
 exit /b 1
)
echo Starting LiveOps Investigator. Keep this window open; close it to stop.
call npx tsx src/app.ts --open
pause
