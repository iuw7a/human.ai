import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  createDesktopSession,
  getDesktopSession,
  closeDesktopSession,
} from "@/lib/desktop/session";
import { captureScreen } from "@/lib/desktop/control";
import { logAgentRun } from "@/lib/agent/runlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function portOf(req: NextRequest): number {
  const host = req.headers.get("host") ?? "";
  const m = host.match(/:(\d+)$/);
  return m ? parseInt(m[1], 10) : 3000;
}

/** POST /api/agent-desktop/session {goal, consent} — take control (explicit consent required). */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const { goal, consent } = (await req.json()) as { goal?: string; consent?: boolean };
    if (!goal || !goal.trim()) {
      return Response.json({ error: "A goal is required." }, { status: 400 });
    }
    if (consent !== true) {
      return Response.json(
        { error: "Explicit consent required: pass consent:true to let the agent control this computer." },
        { status: 400 }
      );
    }
    const s = await createDesktopSession(user.id, goal.trim(), portOf(req));
    await logAgentRun(user.id, s.id, `[desktop] ${s.goal}`, "active", []);
    let shot: string | null = null;
    try {
      shot = (await captureScreen()).base64;
    } catch {
      shot = null;
    }
    return Response.json({
      sessionId: s.id,
      goal: s.goal,
      status: s.status,
      overlay: s.overlayOk,
      screenshot: shot,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not start computer session." },
      { status: 500 }
    );
  }
}

/** GET /api/agent-desktop/session?id= — state (ownership enforced). */
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const s = getDesktopSession(id, user.id);
  if (!s) return Response.json({ error: "Session not found." }, { status: 404 });
  return Response.json({
    sessionId: s.id,
    goal: s.goal,
    status: s.status,
    steps: s.history.length,
    pendingApproval: s.pendingApproval,
    overlay: s.overlayOk,
    history: s.history.slice(-20),
  });
}

/** DELETE /api/agent-desktop/session?id= — EMERGENCY STOP: release control + kill overlay. */
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const ok = await closeDesktopSession(id, user.id);
  if (ok) await logAgentRun(user.id, id, "[desktop]", "closed", []);
  return Response.json({ ok });
}
