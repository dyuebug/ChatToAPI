@echo off
setlocal

rem Windows CMD and Explorer entry point.
if "%~1"=="" goto :interactiveMenu
if /I "%~1"=="start" (
    start "ChatToAPI start" /min powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\chattoapi.ps1" %* >nul 2>&1
    exit /b 0
)
if /I "%~1"=="restart" (
    start "ChatToAPI restart" /min powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\chattoapi.ps1" %* >nul 2>&1
    exit /b 0
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\chattoapi.ps1" %*
set "exitCode=%ERRORLEVEL%"
endlocal & exit /b %exitCode%

:interactiveMenu
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\chattoapi.ps1" menu
set "exitCode=%ERRORLEVEL%"
endlocal & exit /b %exitCode%
