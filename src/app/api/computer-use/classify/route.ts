import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveDbModel, logAppError } from "@/lib/admin";
import { createNvidiaProvider } from "@/lib/providers/nvidia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CLASSIFY_SYSTEM = `You decide whether the user's latest message requires controlling the computer (opening apps/websites, clicking, typing into pages, navigating, scrolling, reading on-screen content) or can be answered directly as a normal chat reply.

Reply with EXACTLY ONE JSON object, no other text: {"needsComputer": true} or {"needsComputer": false}

needsComputer = true when the message:
- asks to open, visit, go to, search on, or interact with any website, app, file, or on-screen UI
- says things like "open X", "go to X", "click", "type", "search for", "ask it", "read the page", "scroll"
- continues an ongoing on-screen task (e.g. "ask it ...", "now click ...", "what did it answer" about something on screen)
- cannot be answered without seeing or touching the live computer

needsComputer = false when the message is a pure knowledge question, explanation, or conversation answerable from training data and chat history alone (e.g. "what is ...", "explain ...", "summarize what you just told me").`;

/**
 * POST /api/computer-use/classify {message, history?}
 * → {needsComputer: boolean}
 * Lets Computer Use mode answer plain questions normally without touching the desktop.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const { message, history } = (await req.json()) as {
      message?: string;
      history?: { role: string; content: string }[];
    };
    const text = (message ?? "").trim();
    if (!text) return Response.json({ error: "A message is required." }, { status: 400 });

    const model = await resolveDbModel("human-ai");
    const providerModelId = model?.providerModelId ?? "meta/llama-3.2-11b-vision-instruct";
    const provider = createNvidiaProvider(providerModelId);
    const convo = (history ?? [])
      .slice(-6)
      .map((m) => `${m.role === "assistant" ? "Human AI" : "User"}: ${String(m.content ?? "").slice(0, 500)}`)
      .join("\n");

    const raw = await provider.chat([
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: `${convo ? `RECENT CONVERSATION:\n${convo}\n\n` : ""}LATEST USER MESSAGE: ${text.slice(0, 2000)}` },
    ]);
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    let needsComputer = true;
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as { needsComputer?: unknown };
        needsComputer = parsed.needsComputer !== false;
      } catch {
        needsComputer = true;
      }
    }
    return Response.json({ needsComputer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Classification failed.";
    void logAppError("api/computer-use/classify", msg);
    // Fail open: an undecidable message in Computer Use mode should still act.
    return Response.json({ needsComputer: true });
  }
}
