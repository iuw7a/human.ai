import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSession, pageState, screenshot } from "@/lib/agent/browser";
import { logAgentRun } from "@/lib/agent/runlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/agent/approve {sessionId, approved} — resolve a pending approval. */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const { sessionId, approved } = (await req.json()) as {
      sessionId?: string;
      approved?: boolean;
    };
    const s = getSession(sessionId ?? "", user.id);
    if (!s) return Response.json({ error: "Session not found." }, { status: 404 });
    const pending = s.pendingApproval;
    if (!pending) return Response.json({ error: "No pending approval." }, { status: 400 });
    s.pendingApproval = null;

    if (!approved) {
      s.history.push({
        n: s.history.length + 1,
        action: "approval rejected",
        observation: "Human rejected the proposed action. Choose a safe alternative or finish.",
        ok: true,
        at: new Date().toISOString(),
      });
      await logAgentRun(user.id, s.id, s.goal, "active", s.history);
      const shot = await screenshot(s);
      return Response.json({ ok: true, rejected: true, message: "Rejected. The agent will choose another path.", screenshot: shot });
    }

    // Approved: record the grant; the agent emits the concrete action on the next step.
    s.history.push({
      n: s.history.length + 1,
      action: `approval granted: ${(pending.args.action as string ?? "").slice(0, 200)}`,
      observation: "Human approved. Proceed with the approved action carefully.",
      ok: true,
      at: new Date().toISOString(),
    });
    await logAgentRun(user.id, s.id, s.goal, "active", s.history);
    const [after, shot] = await Promise.all([pageState(s), screenshot(s)]);
    return Response.json({
      ok: true,
      message: "Approved. Continuing…",
      url: after.url,
      title: after.title,
      screenshot: shot,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Approval failed." },
      { status: 500 }
    );
  }
}
