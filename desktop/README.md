# Human AI — native Windows desktop app

Real native WinForms app (one 52 KB `HumanAI.exe`, .NET Framework — preinstalled
on Windows 10/11). No Electron, no WebView, no `npm` needed at runtime.

## Install (end user)

```
Download → unzip → double-click desktop\setup.cmd → Login → Setup → Use
```

`setup.cmd` copies the exe to `%LOCALAPPDATA%\HumanAI\Desktop`, creates a
Start Menu shortcut, optionally enables autostart, and launches the app.

## First launch

1. **Login** — the app shows a code (`1234-5678`) and opens
   `https://usehuman.de/desktop/approve?code=…`. Log in on the website, press
   **Connect**. No passwords ever enter the desktop app.
2. **Setup** — your name, your AI's name, color, language, voice options.
   Finish creates the companion bot + key on the server.
3. **Dynamic Island** — small pill at the top of the screen. Click to expand
   into chat. Mic, send, states, tasks plan line, recent chats, tray icon.

## Build (developer)

```
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

Uses `csc.exe` from .NET Framework (ships with Windows). Output:
`desktop\dist\HumanAI.exe`. C# 4 language level (no `async`, no `?.`).

## Data & security

- `%APPDATA%\HumanAI\desktop\config.json` — non-secret settings.
- `%APPDATA%\HumanAI\desktop\key.dat` — companion API key, DPAPI-encrypted
  (Windows user account). Never logged, never in chat history.
- `HumanAI.exe --reset` wipes local desktop data.

## Manual checks

- Microphone: Windows Settings → Privacy → Microphone → allow desktop apps.
  If blocked, the island shows “Mic unavailable”.
- Backend needs `supabase/desktop_device.sql` run once (device codes table).
- Dev servers: point the login screen's Website field at
  `http://localhost:3000` (or :3001/:3002) for local testing.

## Uninstall

Quit the app (tray → Quit), delete `%LOCALAPPDATA%\HumanAI\Desktop`, remove
the Start Menu shortcut and the `HKCU\...\Run\HumanAI` value if set.
Revoke the key any time on the website (Bot → Desktop → keys).
