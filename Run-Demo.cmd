@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required.
 pause
 exit /b 1
)
call npm run demo
if errorlevel 1 (
 echo Diagnostic failed. Check Docker, Zetaris and Nightshift. Previous report was not opened.
 pause
 exit /b 1
)
start "" "%~dp0reports\demo.html"
echo Demo completed successfully.
pause
