import { createAdminSupabase } from "../supabase/server";

/** Best-effort agent run log. Works only if agent_runs exists; never throws. */
export async function logAgentRun(
  userId: string,
  sessionId: string,
  goal: string,
  status: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: any[]
): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.from("agent_runs").upsert(
      {
        session_id: sessionId,
        user_id: userId,
        goal: goal.slice(0, 2000),
        status,
        steps: steps.slice(-30),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );
  } catch {
    // logging must never break the agent
  }
}

/** Redact typed text from stored step details (no secrets in logs). */
export function redactArgs(
  tool: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  if (tool === "type" && typeof args.text === "string") {
    return { ...args, text: `<${args.text.length} chars>` };
  }
  return args;
}
