import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDesktopSession } from "@/lib/desktop/session";
import { captureScreen } from "@/lib/desktop/control";
import { logAgentRun } from "@/lib/agent/runlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/agent-desktop/approve {sessionId, approved} */
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
    const s = getDesktopSession(sessionId ?? "", user.id);
    if (!s) return Response.json({ error: "Session not found." }, { status: 404 });
    if (!s.pendingApproval) return Response.json({ error: "No pending approval." }, { status: 400 });
    s.pendingApproval = null;
    if (!approved) {
      s.history.push({
        n: s.history.length + 1,
        action: "approval rejected",
        observation: "Human rejected the proposed action. Choose a safe alternative or finish.",
        ok: true,
        at: new Date().toISOString(),
      });
      await logAgentRun(user.id, s.id, `[desktop] ${s.goal}`, "active", s.history);
      return Response.json({ ok: true, rejected: true, message: "Rejected. The agent will choose another path." });
    }
    s.history.push({
      n: s.history.length + 1,
      action: "approval granted",
      observation: "Human approved. Proceed with the approved action carefully.",
      ok: true,
      at: new Date().toISOString(),
    });
    await logAgentRun(user.id, s.id, `[desktop] ${s.goal}`, "active", s.history);
    let shot: string | null = null;
    try {
      shot = (await captureScreen()).base64;
    } catch {
      shot = null;
    }
    return Response.json({ ok: true, message: "Approved. Continuing…", screenshot: shot });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Approval failed." },
      { status: 500 }
    );
  }
}
