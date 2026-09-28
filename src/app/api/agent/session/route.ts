import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createSession, getSession, closeSession, pageState, screenshot } from "@/lib/agent/browser";
import { logAgentRun } from "@/lib/agent/runlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function stateOf(s: NonNullable<ReturnType<typeof getSession>>) {
  const st = await pageState(s);
  const shot = await screenshot(s);
  return {
    sessionId: s.id,
    goal: s.goal,
    status: s.status,
    url: st.url,
    title: st.title,
    tabs: st.tabs,
    steps: s.history.length,
    pendingApproval: s.pendingApproval,
    screenshot: shot,
  };
}

/** POST /api/agent/session {goal} — start an isolated agent session. */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const { goal } = (await req.json()) as { goal?: string };
    if (!goal || !goal.trim()) {
      return Response.json({ error: "A goal is required." }, { status: 400 });
    }
    const s = await createSession(user.id, goal.trim());
    await logAgentRun(user.id, s.id, s.goal, "active", []);
    return Response.json(await stateOf(s));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not start agent session." },
      { status: 500 }
    );
  }
}

/** GET /api/agent/session?id= — current state (ownership enforced). */
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const s = getSession(id, user.id);
  if (!s) return Response.json({ error: "Session not found." }, { status: 404 });
  try {
    return Response.json(await stateOf(s));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to read session." },
      { status: 500 }
    );
  }
}

/** DELETE /api/agent/session?id= — terminate and destroy the browser session. */
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const ok = await closeSession(id, user.id);
  if (ok) await logAgentRun(user.id, id, "", "closed", []);
  return Response.json({ ok });
}
