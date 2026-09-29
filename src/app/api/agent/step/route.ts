import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDbModel, logAppError } from "@/lib/admin";
import { chatWithToolsFor } from "@/lib/providers/registry";
import {
  getSession,
  pageState,
  screenshot,
  executeBrowserTool,
  taskSteps,
  MAX_STEPS,
} from "@/lib/agent/browser";
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS } from "@/lib/agent/tools";
import { logAgentRun, redactArgs } from "@/lib/agent/runlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function statusFor(tool: string): string {
  switch (tool) {
    case "navigate":
    case "new_tab":
      return "Opening website...";
    case "click":
      return "Clicking...";
    case "type":
      return "Typing...";
    case "wait":
    case "back":
    case "forward":
      return "Waiting for page...";
    case "snapshot":
    case "screenshot":
      return "Reading page...";
    case "switch_tab":
    case "close_tab":
    case "list_tabs":
      return "Managing tabs...";
    case "scroll":
    case "press":
      return "Interacting...";
    case "finish":
      return "Task completed";
    default:
      return "Working...";
  }
}

/** POST /api/agent/step {sessionId} — run exactly ONE perceive→decide→act cycle. */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const { sessionId } = (await req.json()) as { sessionId?: string };
    const t0 = Date.now();
    const s = getSession(sessionId ?? "", user.id);
    if (!s) return Response.json({ error: "Session not found." }, { status: 404 });
    if (s.status === "done") {
      return Response.json({ done: true, message: "Task already completed.", status: s.status });
    }
    if (s.pendingApproval) {
      return Response.json({
        needsApproval: s.pendingApproval,
        message: "Human approval required",
        status: s.status,
      });
    }
    if (taskSteps(s) >= MAX_STEPS) {
      s.status = "done";
      await logAgentRun(user.id, s.id, s.goal, "done", s.history);
      return Response.json({ done: true, message: "Stopped: step limit reached.", status: s.status });
    }
    const recent = s.history.slice(s.taskStart ?? 0).slice(-3);
    if (recent.length === 3 && recent.every((h) => !h.ok)) {
      s.status = "done";
      const message =
        "Stopped after 3 consecutive failures. Last error: " + recent[2].observation;
      await logAgentRun(user.id, s.id, s.goal, "done", s.history);
      return Response.json({ done: true, message, status: s.status });
    }

    // 1) Perceive (structured DOM state, not just screenshots).
    const st = await pageState(s);
    const historyText = s.history
      .slice(-8)
      .map((h) => `Step ${h.n}: ${h.action} → ${h.ok ? "ok" : "FAILED"}: ${h.observation}`)
      .join("\n");

    const model = await resolveDbModel("human-ai");
    const providerModelId = model?.providerModelId ?? "meta/llama-3.2-11b-vision-instruct";

    // 2) Decide (single model call with browser tools).
    const { text, toolCalls } = await chatWithToolsFor(
      model?.provider ?? "nvidia",
      providerModelId,
      [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `GOAL: ${s.goal}\n\nCompleted steps so far: ${s.history.length}\n` +
            (historyText ? `RECENT HISTORY:\n${historyText}\n\n` : "") +
            `CURRENT PAGE:\nURL: ${st.url}\nTitle: ${st.title}\n` +
            `Open tabs: ${st.tabs.map((t) => `${t.index}:${t.title || t.url}`).join(" | ") || "none"}\n` +
            `ACCESSIBILITY SNAPSHOT (use [ref=rN] for interactions):\n${st.snapshot}\n\n` +
            `Decide the single next action toward the goal.`,
        },
      ],
      AGENT_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
    );

    if (toolCalls.length === 0) {
      // Model answered instead of acting → treat as completion.
      s.status = "done";
      s.history.push({
        n: s.history.length + 1,
        action: "finish",
        observation: (text || "Done.").slice(0, 2000),
        ok: true,
        at: new Date().toISOString(),
      });
      await logAgentRun(user.id, s.id, s.goal, "done", s.history);
      const shot = await screenshot(s);
      return Response.json({ done: true, message: text || "Task completed.", status: s.status, screenshot: shot });
    }

    const tc = toolCalls[0];
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.arguments || "{}");
    } catch {
      args = {};
    }

    if (tc.name === "finish") {
      s.status = "done";
      const summary = String(args.summary ?? text ?? "Task completed.").slice(0, 2000);
      s.history.push({ n: s.history.length + 1, action: "finish", observation: summary, ok: true, at: new Date().toISOString() });
      await logAgentRun(user.id, s.id, s.goal, "done", s.history);
      const shot = await screenshot(s);
      return Response.json({ done: true, message: summary, status: s.status, screenshot: shot });
    }

    if (tc.name === "request_approval") {
      s.pendingApproval = {
        tool: "request_approval",
        args: redactArgs(tc.name, args as Record<string, unknown>),
        reason: String(args.reason ?? "").slice(0, 500),
        requestedAt: new Date().toISOString(),
      };
      const shot = await screenshot(s);
      return Response.json({
        needsApproval: {
          action: String(args.action ?? "sensitive action").slice(0, 500),
          reason: String(args.reason ?? "").slice(0, 500),
        },
        message: "Human approval required",
        status: s.status,
        screenshot: shot,
      });
    }

    // 3) Act + 4) Observe.
    const statusMsg = statusFor(tc.name);
    const res = await executeBrowserTool(s, tc.name, args as Record<string, unknown>);
    s.consecutiveErrors = res.ok ? 0 : s.consecutiveErrors + 1;
    s.history.push({
      n: s.history.length + 1,
      action: `${tc.name} ${JSON.stringify(redactArgs(tc.name, args as Record<string, unknown>)).slice(0, 300)}`,
      observation: res.observation.slice(0, 2000),
      ok: res.ok,
      at: new Date().toISOString(),
    });
    // Run history logging in the background — never stall the control loop on it.
    void logAgentRun(user.id, s.id, s.goal, "active", s.history).catch(() => {});
    const [after, shot] = await Promise.all([pageState(s), screenshot(s)]);
    return Response.json({
      done: false,
      status: statusMsg,
      action: tc.name,
      observation: res.observation,
      ok: res.ok,
      url: after.url,
      title: after.title,
      tabs: after.tabs,
      steps: s.history.length,
      screenshot: shot,
      message: text || undefined,
      elapsedMs: Date.now() - t0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent step failed.";
    void logAppError("api/agent/step", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
