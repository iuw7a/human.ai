@echo off
rem Human AI desktop installer — double-click, no terminal knowledge needed.
setlocal
set HERE=%~dp0
set SRC=%HERE%dist
set DST=%LOCALAPPDATA%\HumanAI\Desktop

if not exist "%SRC%\HumanAI.exe" (
  echo HumanAI.exe missing - building it now...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%build.ps1"
)
if not exist "%SRC%\HumanAI.exe" (
  echo.
  echo Build failed. Make sure the full HumanAI folder was downloaded.
  pause
  exit /b 1
)

mkdir "%DST%" 2>nul
copy /y "%SRC%\HumanAI.exe" "%DST%\" >nul
if errorlevel 1 (
  echo Copy failed. Close Human AI if it is running, then retry.
  pause
  exit /b 1
)

rem Start Menu shortcut via VBScript (no powershell quoting issues)
set VBS=%TEMP%\humanai-shortcut.vbs
echo Set s = CreateObject("WScript.Shell")>"%VBS%"
echo Set l = s.CreateShortcut(s.SpecialFolders("Programs") ^& "\Human AI.lnk")>>"%VBS%"
echo l.TargetPath = s.ExpandEnvironmentStrings("%%LOCALAPPDATA%%") ^& "\HumanAI\Desktop\HumanAI.exe">>"%VBS%"
echo l.WorkingDirectory = s.ExpandEnvironmentStrings("%%LOCALAPPDATA%%") ^& "\HumanAI\Desktop">>"%VBS%"
echo l.Save>>"%VBS%"
cscript //nologo "%VBS%" >nul
del "%VBS%" 2>nul

set /p AUTO="Start with Windows? [Y/n] "
if /i "%AUTO%"=="n" goto launch
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v HumanAI /t REG_SZ /d "%DST%\HumanAI.exe" /f >nul

:launch
echo.
echo Installed to %DST%. Starting Human AI...
start "" "%DST%\HumanAI.exe"
endlocal
