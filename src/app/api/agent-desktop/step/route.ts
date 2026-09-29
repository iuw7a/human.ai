import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDbModel, logAppError } from "@/lib/admin";
import {
  getDesktopSession,
  destroyDesktopSession,
  desktopTaskSteps,
  DESKTOP_MAX_STEPS,
} from "@/lib/desktop/session";
import {
  captureScreen,
  mouseMove,
  mouseClick,
  mouseScroll,
  typeText,
  pressKey,
  openApp,
  hotkey,
  screenState,
} from "@/lib/desktop/control";
import { logAgentRun } from "@/lib/agent/runlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DESKTOP_TOOL_DOCS = `Available actions (reply with EXACTLY ONE JSON object, no other text):
{"action":"mouse_move","x":0-1000,"y":0-1000} — move the real mouse cursor
{"action":"click","x":0-1000,"y":0-1000,"button":"left"|"right"|"middle"} — click at coordinates
{"action":"type","text":"..."} — type with the real keyboard into the focused element (click the field first on a previous step if needed)
{"action":"press","key":"Enter|Escape|Tab|up|down|left|right|..."} — press a key
{"action":"scroll","dx":0,"dy":600} — scroll the mouse wheel (dy positive = down)
{"action":"wait","ms":2000} — wait up to 10000ms
{"action":"screenshot"} — take a fresh look, do nothing else
{"action":"open_app","name":"Notepad"} — open a Windows app via the Start menu
{"action":"hotkey","keys":["ctrl","t"]} — press a key combination
{"action":"request_approval","action":"...","reason":"..."} — STOP and ask the human BEFORE purchases, deleting files/data, sending messages/emails, submitting forms, account/security changes, installing software, or anything irreversible
{"action":"finish","summary":"..."} — end the task with what was accomplished`;

interface DesktopDecision {
  action: string;
  x?: number;
  y?: number;
  button?: string;
  text?: string;
  key?: string;
  dx?: number;
  dy?: number;
  ms?: number;
  name?: string;
  keys?: string[];
  reason?: string;
  summary?: string;
}

function extractJson(raw: string): DesktopDecision | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as DesktopDecision;
    if (typeof o.action !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

const VALID_ACTIONS = new Set([
  "mouse_move", "click", "type", "press", "scroll", "wait",
  "screenshot", "open_app", "hotkey", "request_approval", "finish",
]);

/** Vision decision WITHOUT tools param (the endpoint rejects tools+images together). */
async function decideVision(
  providerModelId: string,
  systemPrompt: string,
  userText: string,
  imageB64: string
): Promise<{ text: string; decision: DesktopDecision | null }> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured on the server.");
  const base = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: providerModelId,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText + "\n<image>" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 400,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`NVIDIA API error ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content ?? "";
  const decision = extractJson(text);
  if (decision && !VALID_ACTIONS.has(decision.action)) return { text, decision: null };
  return { text, decision };
}

const DESKTOP_SYSTEM = `You are the Human AI Desktop Agent. You see the user's REAL Windows desktop as screenshots and control the REAL mouse and keyboard, one action per turn.

COORDINATES
- Screenshots are 0-1000 in both axes. Reply with coordinates in that space for mouse_move/click.
- Click the center of the target element. If unsure between two candidates, prefer the most prominent one.

RULES
- One tool call per turn. After acting you get a fresh screenshot — verify the result before the next step.
- Prefer clicking visible UI over keyboard shortcuts, but open_app works well for launching programs.
- NEVER type passwords or credentials unless the user put them in the goal. Never exfiltrate anything.
- For sensitive actions (purchases, deleting files/data, sending messages/emails, submitting forms, account/security changes, installing software, anything irreversible): call request_approval FIRST and wait. Never do them speculatively.
- If an action fails, look at the new screenshot, try ONE safe alternative (scroll, wait, click a different target), and explain briefly. Never repeat the identical failing action more than twice.
- If what you see already satisfies the goal, call finish immediately with the observed facts — do not keep acting.
- When the goal is done, call finish with a concise summary of what you did and saw.`;

function statusFor(tool: string): string {
  switch (tool) {
    case "mouse_move": return "Moving mouse…";
    case "click": return "Clicking…";
    case "type": return "Typing…";
    case "press":
    case "hotkey": return "Pressing keys…";
    case "scroll": return "Scrolling…";
    case "open_app": return "Opening app…";
    case "wait": return "Waiting…";
    case "screenshot": return "Reading screen…";
    case "finish": return "Task completed";
    default: return "Working…";
  }
}

/** POST /api/agent-desktop/step {sessionId} — one perceive→decide→act cycle on the real desktop. */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const { sessionId } = (await req.json()) as { sessionId?: string };
    const t0 = Date.now();
    const timed = <T extends Record<string, unknown>>(o: T) => ({ ...o, elapsedMs: Date.now() - t0 });
    const s = getDesktopSession(sessionId ?? "", user.id);
    if (!s) return Response.json({ error: "Session not found." }, { status: 404 });
    if (s.stopFlag) {
      await destroyDesktopSession(s);
      return Response.json({ done: true, stopped: true, message: "Stopped by user.", status: s.status });
    }
    if (s.status === "done") {
      return Response.json({ done: true, message: "Task already completed.", status: s.status });
    }
    if (s.pendingApproval) {
      return Response.json({ needsApproval: s.pendingApproval, message: "Human approval required", status: s.status });
    }
    if (desktopTaskSteps(s) >= DESKTOP_MAX_STEPS) {
      s.status = "done";
      await logAgentRun(user.id, s.id, `[desktop] ${s.goal}`, "done", s.history);
      return Response.json({ done: true, message: "Stopped: step limit reached.", status: s.status });
    }
    const recent = s.history.slice(s.taskStart ?? 0).slice(-3);
    if (recent.length === 3 && recent.every((h) => !h.ok)) {
      s.status = "done";
      const message = "Stopped after 3 consecutive failures. Last error: " + recent[2].observation;
      await logAgentRun(user.id, s.id, `[desktop] ${s.goal}`, "done", s.history);
      return Response.json({ done: true, message, status: s.status });
    }

    // 1) Perceive: screenshot. Cursor is tracked locally (refreshed every 5 steps)
    // to skip a PowerShell spawn on most steps.
    const shot = await captureScreen();
    s.screenW = shot.width;
    s.screenH = shot.height;
    if (s.cursorX < 0 || desktopTaskSteps(s) % 5 === 0) {
      try {
        const st = await screenState();
        s.cursorX = st.cx;
        s.cursorY = st.cy;
      } catch {
        // keep last known — cursor is only a hint
      }
    }
    const cursor = { x: s.cursorX, y: s.cursorY };

    // Anti-loop: warn when the exact same action repeats.
    let repeatWarning = "";
    if (s.history.length >= 2) {
      const a = s.history[s.history.length - 1].action;
      const b = s.history[s.history.length - 2].action;
      if (a === b) {
        repeatWarning = `\nWARNING: you just performed "${a}" twice in a row with no visible change. Do NOT repeat it a third time — call finish if the goal is met, or choose a different action.`;
      }
    }

    const historyText = s.history
      .slice(-8)
      .map((h) => `Step ${h.n}: ${h.action} → ${h.ok ? "ok" : "FAILED"}: ${h.observation}`)
      .join("\n");

    const model = await resolveDbModel("human-ai");
    const providerModelId = model?.providerModelId ?? "meta/llama-3.2-11b-vision-instruct";

    // 2) Decide with vision (no tools param: endpoint rejects tools+images).
    const userText =
      `GOAL: ${s.goal}\nSteps so far: ${s.history.length}\n` +
      (historyText ? `RECENT HISTORY:\n${historyText}\n` : "") +
      `Decide the single next action. Screen is ${shot.width}x${shot.height}, coordinates 0-1000. ` +
      (cursor.x >= 0 ? `The real mouse cursor is currently at absolute pixels (${cursor.x}, ${cursor.y}).` : "") +
      repeatWarning +
      `\n\n${DESKTOP_TOOL_DOCS}`;
    let decision = (await decideVision(providerModelId, DESKTOP_SYSTEM, userText, shot.base64)).decision;
    if (!decision) {
      // One inline retry with a strict hint before giving the loop another turn.
      const retry = await decideVision(
        providerModelId,
        DESKTOP_SYSTEM,
        userText + `\n\nYour last reply was not a valid single JSON object. Reply again with ONLY the JSON object, no other text.`,
        shot.base64
      );
      decision = retry.decision;
    }

    if (!decision) {
      s.history.push({
        n: s.history.length + 1,
        action: "invalid response",
        observation: "Model did not return valid JSON. Will retry with a stricter instruction.",
        ok: false,
        at: new Date().toISOString(),
      });
      return Response.json({
        done: false,
        status: "Reading screen…",
        action: "screenshot",
        observation: "Model response was not valid JSON — retrying.",
        ok: false,
        steps: s.history.length,
        screenshot: shot.base64,
      });
    }

    const tc = { name: decision.action, arguments: JSON.stringify(decision) };
    const args: Record<string, unknown> = { ...(decision as unknown as Record<string, unknown>) };
    delete args.action;

    if (tc.name === "finish") {
      s.status = "done";
      const summary = String(args.summary ?? "Task completed.").slice(0, 2000);
      s.history.push({ n: s.history.length + 1, action: "finish", observation: summary, ok: true, at: new Date().toISOString() });
      await logAgentRun(user.id, s.id, `[desktop] ${s.goal}`, "done", s.history);
      return Response.json(timed({ done: true, message: summary, status: s.status, screenshot: shot.base64 }));
    }

    if (tc.name === "request_approval") {
      s.pendingApproval = {
        action: String(args.action ?? "sensitive action").slice(0, 500),
        reason: String(args.reason ?? "").slice(0, 500),
        requestedAt: new Date().toISOString(),
      };
      return Response.json({
        needsApproval: s.pendingApproval,
        message: "Human approval required",
        status: s.status,
        screenshot: shot.base64,
      });
    }

    // Emergency stop re-check immediately before touching the desktop.
    const fresh = getDesktopSession(s.id, user.id);
    if (!fresh || fresh.stopFlag) {
      if (fresh) await destroyDesktopSession(fresh);
      return Response.json({ done: true, stopped: true, message: "Stopped by user.", status: "closed" });
    }

    // 3) Act on the real desktop.
    const sx = (v: unknown) => Math.round(((Number(v) || 0) / 1000) * shot.width);
    const sy = (v: unknown) => Math.round(((Number(v) || 0) / 1000) * shot.height);
    let observation = "";
    let ok = true;
    try {
      switch (tc.name) {
        case "mouse_move":
          await mouseMove(sx(args.x), sy(args.y));
          s.cursorX = sx(args.x);
          s.cursorY = sy(args.y);
          observation = `Moved mouse to (${args.x}, ${args.y}).`;
          break;
        case "click": {
          // mouseClick positions the cursor itself — one spawn instead of two.
          const btn = args.button === "right" || args.button === "middle" ? (args.button as "right" | "middle") : "left";
          await mouseClick(btn, sx(args.x), sy(args.y));
          s.cursorX = sx(args.x);
          s.cursorY = sy(args.y);
          observation = `Clicked (${args.x}, ${args.y}) with ${btn} button.`;
          break;
        }
        case "type": {
          const n = await typeText(String(args.text ?? ""));
          observation = `Typed ${n} chars.`;
          break;
        }
        case "press":
          await pressKey(String(args.key ?? "Enter"));
          observation = `Pressed ${args.key}.`;
          break;
        case "scroll":
          await mouseScroll(Number(args.dx ?? 0) || 0, Number(args.dy ?? 600) || 600);
          observation = `Scrolled.`;
          break;
        case "wait": {
          const ms = Math.min(10000, Math.max(500, Number(args.ms ?? 2000) || 2000));
          await new Promise((r) => setTimeout(r, ms));
          observation = `Waited ${ms}ms.`;
          break;
        }
        case "screenshot":
          observation = "Fresh screenshot below.";
          break;
        case "open_app":
          await openApp(String(args.name ?? ""));
          observation = `Opened ${args.name} via Start menu.`;
          break;
        case "hotkey": {
          const keys = Array.isArray(args.keys) ? args.keys.map(String) : [];
          await hotkey(keys);
          observation = `Pressed ${keys.join("+")}.`;
          break;
        }
        default:
          ok = false;
          observation = `Unknown tool: ${tc.name}.`;
      }
    } catch (e) {
      ok = false;
      observation = `Action failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}`;
    }

    s.consecutiveErrors = ok ? 0 : s.consecutiveErrors + 1;
    s.history.push({
      n: s.history.length + 1,
      action: `${tc.name} ${JSON.stringify(tc.name === "type" ? { ...args, text: `<${String(args.text ?? "").length} chars>` } : args).slice(0, 300)}`,
      observation: observation.slice(0, 2000),
      ok,
      at: new Date().toISOString(),
    });
    // Run history logging in the background — never stall the control loop on it.
    void logAgentRun(user.id, s.id, `[desktop] ${s.goal}`, "active", s.history).catch(() => {});

    // 4) Observe: fresh screenshot.
    const after = await captureScreen();
    return Response.json(timed({
      done: false,
      status: statusFor(tc.name),
      action: tc.name,
      observation,
      ok,
      steps: s.history.length,
      screen: { width: after.width, height: after.height },
      screenshot: after.base64,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent step failed.";
    void logAppError("api/agent-desktop/step", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
