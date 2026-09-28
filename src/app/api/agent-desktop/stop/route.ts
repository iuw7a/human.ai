import { NextRequest } from "next/server";
import { getDesktopSessionByToken, destroyDesktopSession } from "@/lib/desktop/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agent-desktop/stop {sessionId, token}
 * Emergency kill switch for the on-screen overlay pill. Authenticated by the
 * per-session stop token (NOT the user session) so the overlay — which runs
 * outside the browser — can trigger it. Token is random per session.
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, token } = (await req.json()) as {
      sessionId?: string;
      token?: string;
    };
    const s = getDesktopSessionByToken(sessionId ?? "", token ?? "");
    if (!s) return Response.json({ error: "Unknown session." }, { status: 404 });
    await destroyDesktopSession(s);
    return Response.json({ ok: true, message: "Agent stopped. Control released." });
  } catch {
    return Response.json({ error: "Stop failed." }, { status: 500 });
  }
}
