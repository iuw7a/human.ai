import { execFile } from "child_process";

const PS = "powershell.exe";

function runPs(script: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      PS,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-Command", script],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || err.message || "").toString().slice(0, 500);
          reject(new Error(`controller failed: ${msg}`));
          return;
        }
        resolve(stdout.toString());
      }
    );
  });
}

const USER32 = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class U32 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@;
`;

const VK: Record<string, number> = {
  enter: 0x0d, escape: 0x1b, esc: 0x1b, tab: 0x09, backspace: 0x08,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  delete: 0x2e, insert: 0x2d, win: 0x5b, space: 0x20,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
  f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
};

function escPs(s: string): string {
  return s.replace(/'/g, "''").slice(0, 4000);
}

function num(n: unknown, fallback: number, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export interface ScreenBounds {
  width: number;
  height: number;
}

/** Current real cursor position (read-only, moves nothing). */
export async function cursorPos(): Promise<{ x: number; y: number }> {
  const out = await runPs(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct Pt { public int X; public int Y; }
public static class Cur {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Pt p);
}
"@;
$p = New-Object Pt;
[Cur]::GetCursorPos([ref]$p) | Out-Null;
Write-Output "$($p.X) $($p.Y)";`);
  const m = out.trim().match(/(\d+)\s+(\d+)/);
  if (!m) return { x: 0, y: 0 };
  return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
}

/** Screen size of the primary display (cached — size rarely changes). */
let boundsCache: { width: number; height: number; at: number } | null = null;
export async function screenBounds(force = false): Promise<ScreenBounds> {
  if (!force && boundsCache && Date.now() - boundsCache.at < 5 * 60 * 1000) {
    return { width: boundsCache.width, height: boundsCache.height };
  }
  const out = await runPs(`
Add-Type -AssemblyName System.Windows.Forms;
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
Write-Output "$($b.Width) $($b.Height)";`);
  const m = out.trim().match(/(\d+)\s+(\d+)/);
  if (!m) throw new Error("Could not read screen bounds.");
  boundsCache = { width: parseInt(m[1], 10), height: parseInt(m[2], 10), at: Date.now() };
  return { width: boundsCache.width, height: boundsCache.height };
}

/** Bounds + cursor in ONE PowerShell spawn (saves ~1-2s per step vs two calls). */
export async function screenState(): Promise<{ width: number; height: number; cx: number; cy: number }> {
  const b = await screenBounds();
  const out = await runPs(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct Pt { public int X; public int Y; }
public static class Cur {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Pt p);
}
"@;
$p = New-Object Pt;
[Cur]::GetCursorPos([ref]$p) | Out-Null;
Write-Output "$($p.X) $($p.Y)";`);
  const m = out.trim().match(/(\d+)\s+(\d+)/);
  return {
    width: b.width,
    height: b.height,
    cx: m ? parseInt(m[1], 10) : -1,
    cy: m ? parseInt(m[2], 10) : -1,
  };
}

/**
 * Screenshot (JPEG base64) + REAL screen bounds for coordinate mapping.
 * No downscaling: measurement showed it costs ~0.65s per capture but saves
 * almost no vision tokens — direct capture is faster overall.
 */
export async function captureScreen(quality = 50): Promise<{ base64: string; width: number; height: number }> {
  const b = await screenBounds();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const shot = require("screenshot-desktop") as (opts?: {
    format?: string;
    quality?: number;
  }) => Promise<Buffer>;
  const buf: Buffer = await shot({ format: "jpg", quality });
  if (!buf || buf.length < 1000) throw new Error("Screenshot capture failed.");
  return { base64: buf.toString("base64"), width: b.width, height: b.height };
}

export async function mouseMove(x: number, y: number): Promise<void> {
  const b = await screenBounds();
  const cx = num(x, 0, 0, b.width - 1);
  const cy = num(y, 0, 0, b.height - 1);
  await runPs(`${USER32}\n[U32]::SetCursorPos(${cx}, ${cy}) | Out-Null`);
}

async function mouseClick(button: "left" | "right" | "middle", x?: number, y?: number): Promise<void> {
  let prefix = "";
  if (x !== undefined && y !== undefined) {
    const b = await screenBounds();
    prefix = `[U32]::SetCursorPos(${num(x, 0, 0, b.width - 1)}, ${num(y, 0, 0, b.height - 1)}) | Out-Null; `;
  }
  const flags =
    button === "left" ? "0x0002, 0x0004" : button === "right" ? "0x0008, 0x0010" : "0x0020, 0x0040";
  const [down, up] = flags.split(", ");
  await runPs(
    `${USER32}\n${prefix}[U32]::mouse_event(${down}, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60; [U32]::mouse_event(${up}, 0, 0, 0, [UIntPtr]::Zero)`
  );
}

export async function mouseScroll(dx: number, dy: number): Promise<void> {
  const d = num(dy, 0, -2000, 2000);
  // vertical wheel first, then horizontal via axis flag
  await runPs(`${USER32}\n[U32]::mouse_event(0x0800, 0, 0, ${d}, [UIntPtr]::Zero)`);
  const h = num(dx, 0, -2000, 2000);
  if (h !== 0) {
    await runPs(`${USER32}\n[U32]::mouse_event(0x1000, 0, 0, ${h}, [UIntPtr]::Zero)`);
  }
}

/** Type text via SendKeys (STA). Never logged by callers. */
export async function typeText(text: string): Promise<number> {
  const safe = escPs(text);
  if (!safe) return 0;
  await runPs(
    `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safe}')`,
    30000
  );
  return safe.length;
}

export async function pressKey(key: string): Promise<void> {
  const k = key.trim().toLowerCase();
  if (VK[k] !== undefined) {
    const vk = VK[k];
    await runPs(
      `${USER32}\n[U32]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 50; [U32]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero)`
    );
    return;
  }
  if (/^[a-z0-9]$/i.test(k)) {
    await typeText(k);
    return;
  }
  throw new Error(`Unsupported key: ${key}`);
}

/** Open an app via Win key + search + Enter. */
export async function openApp(name: string): Promise<void> {
  const safe = escPs(name).slice(0, 120);
  if (!safe) throw new Error("App name required.");
  await runPs(
    `${USER32}\n[U32]::keybd_event(91, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 120; [U32]::keybd_event(91, 0, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 700; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safe}'); Start-Sleep -Milliseconds 900; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')`,
    30000
  );
}

/** Hotkey combo, e.g. ["ctrl","alt","t"] or ["win","r"]. */
export async function hotkey(keys: string[]): Promise<void> {
  const norm = keys.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 4);
  if (norm.length === 0) throw new Error("No keys provided.");
  const mods: number[] = [];
  const main: number[] = [];
  for (const k of norm) {
    if (k === "ctrl" || k === "control") mods.push(0xa2);
    else if (k === "shift") mods.push(0xa0);
    else if (k === "alt") mods.push(0xa4);
    else if (k === "win") mods.push(0x5b);
    else if (VK[k] !== undefined) main.push(VK[k]);
    else if (/^[a-z0-9]$/i.test(k)) main.push(k.toUpperCase().charCodeAt(0));
    else throw new Error(`Unsupported key in combo: ${k}`);
  }
  if (main.length === 0) throw new Error("Combo needs a main key.");
  const down = [...mods, ...main].map((v) => `[U32]::keybd_event(${v}, 0, 0, [UIntPtr]::Zero);`).join(" ");
  const up = [...main, ...mods].reverse().map((v) => `[U32]::keybd_event(${v}, 0, 2, [UIntPtr]::Zero);`).join(" ");
  await runPs(`${USER32}\n${down} Start-Sleep -Milliseconds 80; ${up}`);
}

export { mouseClick, VK };
