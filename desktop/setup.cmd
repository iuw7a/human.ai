@echo off
rem Human AI desktop installer — double-click, no terminal knowledge needed.
setlocal
set SRC=%~dp0dist
set DST=%LOCALAPPDATA%\HumanAI\Desktop
if not exist "%SRC%\HumanAI.exe" (
  echo HumanAI.exe not found. Run desktop\build.ps1 first.
  pause
  exit /b 1
)
mkdir "%DST%" 2>nul
copy /y "%SRC%\HumanAI.exe" "%DST%\" >nul
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Human AI.lnk\");$s.TargetPath=\"$env:LOCALAPPDATA\HumanAI\Desktop\HumanAI.exe\";$s.WorkingDirectory=\"$env:LOCALAPPDATA\HumanAI\Desktop\";$s.Save()"
set /p AUTO="Start with Windows? [Y/n] "
if /i "%AUTO%"=="n" goto launch
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v HumanAI /t REG_SZ /d "\"%DST%\HumanAI.exe\"" /f >nul
:launch
echo Installed. Starting Human AI…
start "" "%DST%\HumanAI.exe"
endlocal
