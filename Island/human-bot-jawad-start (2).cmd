@echo off
rem Human Bot Desktop autostart launcher for jawad
rem Copy this file next to human-bot-jawad.ps1 and place a shortcut in shell:startup.
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "& '%~dp0human-bot-jawad.ps1'"
