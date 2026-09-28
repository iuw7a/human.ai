"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Square,
  Plus,
  Check,
  X,
  Loader2,
  Globe,
  ExternalLink,
} from "lucide-react";
import { Markdown } from "./Markdown";

interface StepEntry {
  n: number;
  status: string;
  action?: string;
  message?: string;
  ok?: boolean;
}

interface Approval {
  action: string;
  reason: string;
}

export function AgentView({
  sessionId,
  initialGoal,
  autostart,
}: {
  sessionId: string;
  initialGoal: string;
  autostart: boolean;
}) {
  const router = useRouter();
  const [log, setLog] = useState<StepEntry[]>([]);
  const [status, setStatus] = useState("Starting…");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tabs, setTabs] = useState<{ index: number; url: string; title: string; active: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const runRef = useRef(false);
  const stepNo = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, done]);

  const drive = useCallback(async () => {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);
    setError(null);
    try {
      for (;;) {
        if (!runRef.current) break;
        setStatus("Thinking…");
        const res = await fetch("/api/agent/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? `Step failed (${res.status}).`);

        if (j.screenshot) setShot(j.screenshot);
        if (j.url !== undefined) setUrl(j.url);
        if (j.title !== undefined) setTitle(j.title);
        if (j.tabs) setTabs(j.tabs);

        if (j.needsApproval) {
          setApproval(j.needsApproval);
          setStatus("Human approval required");
          setRunning(true);
          runRef.current = false;
          setLog((l) => [...l, { n: ++stepNo.current, status: "Human approval required", message: j.needsApproval.action }]);
          break;
        }
        if (j.done) {
          setDone(j.message ?? "Task completed.");
          setStatus("Task completed");
          setLog((l) => [...l, { n: ++stepNo.current, status: "Task completed", message: j.message }]);
          break;
        }
        setStatus(j.status ?? "Working…");
        setLog((l) => [
          ...l,
          { n: ++stepNo.current, status: j.status ?? j.action ?? "Step", action: j.action, message: j.observation, ok: j.ok },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent failed.");
      setStatus("Error");
    } finally {
      runRef.current = false;
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (autostart) void drive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(approved: boolean) {
    setApproval(null);
    setStatus(approved ? "Approved — continuing…" : "Rejected — replanning…");
    const res = await fetch("/api/agent/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, approved }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error ?? "Approval failed.");
      return;
    }
    if (j.screenshot) setShot(j.screenshot);
    setLog((l) => [...l, { n: ++stepNo.current, status: approved ? "Approved" : "Rejected", message: j.message }]);
    void drive();
  }

  function stop() {
    runRef.current = false;
    setRunning(false);
    setStatus("Stopped");
  }

  async function endSession() {
    stop();
    await fetch(`/api/agent/session?id=${sessionId}`, { method: "DELETE" }).catch(() => {});
    router.push("/agent");
  }

  async function newTask(e: React.FormEvent) {
    e.preventDefault();
    if (!followUp.trim()) return;
    const res = await fetch("/api/agent/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: followUp.trim() }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error ?? "Could not start session.");
      return;
    }
    router.push(`/agent/${j.sessionId}`);
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 pl-10 lg:pl-0">
          <Bot size={16} className="shrink-0 text-accent" />
          <span className="truncate text-sm font-medium text-white">Agent</span>
          <span className="hidden truncate text-xs text-zinc-500 sm:inline">· {initialGoal}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {running ? (
            <button onClick={stop} className="btn-ghost border border-ink-700 !px-2.5 !py-1 text-xs">
              <Square size={12} /> Stop
            </button>
          ) : (
            !done &&
            !approval && (
              <button onClick={() => void drive()} className="btn-ghost border border-ink-700 !px-2.5 !py-1 text-xs">
                Resume
              </button>
            )
          )}
          <button onClick={() => void endSession()} className="btn-ghost border border-ink-700 !px-2.5 !py-1 text-xs" title="Close browser session">
            <Plus size={12} /> New
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Left: run log + follow-up */}
        <div className="flex min-h-0 flex-col border-b border-ink-800 lg:border-b-0 lg:border-r">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${running ? "animate-pulse bg-accent" : done ? "bg-emerald-400" : "bg-zinc-600"}`} />
              <span className="truncate text-zinc-200">{status}</span>
            </div>

            {approval && (
              <div className="mb-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 animate-menu-in">
                <p className="text-sm font-semibold text-amber-200">Human approval required</p>
                <p className="mt-1 text-sm text-zinc-200">{approval.action}</p>
                {approval.reason && <p className="mt-1 text-xs text-zinc-400">{approval.reason}</p>}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => void decide(true)} className="btn-primary flex-1 !py-2 text-sm">
                    <Check size={15} /> Approve
                  </button>
                  <button onClick={() => void decide(false)} className="btn-ghost flex-1 border border-ink-600 !py-2 text-sm">
                    <X size={15} /> Reject
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {log.map((s, i) => (
                <div key={i} className="rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2">
                  <p className="text-[13px] font-medium text-zinc-100">
                    <span className="mr-2 font-mono text-[11px] text-zinc-500">#{s.n}</span>
                    {s.status}
                  </p>
                  {s.message && (
                    <div className="mt-1 text-[13px] leading-6 text-zinc-400">
                      <Markdown content={s.message.length > 600 ? s.message.slice(0, 600) + "…" : s.message} />
                    </div>
                  )}
                </div>
              ))}
              {done && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                  <p className="text-sm font-medium text-emerald-200">Task completed</p>
                  <div className="mt-1 text-sm leading-6 text-zinc-200">
                    <Markdown content={done} />
                  </div>
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>
            <div ref={bottomRef} />
          </div>
          <form onSubmit={newTask} className="border-t border-ink-800 p-3">
            <div className="flex gap-2">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="New task for a fresh browser session…"
                className="input"
              />
              <button type="submit" className="btn-primary shrink-0 text-xs">Start</button>
            </div>
          </form>
        </div>

        {/* Right: live browser preview */}
        <div className="flex min-h-0 flex-col bg-ink-950">
          <div className="flex items-center gap-2 border-b border-ink-800 px-4 py-2">
            <Globe size={13} className="shrink-0 text-zinc-500" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">
              {url || "about:blank"}
            </span>
            {url && url.startsWith("http") && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-zinc-500 hover:text-white" title="Open in new tab">
                <ExternalLink size={13} />
              </a>
            )}
          </div>
          {tabs.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto border-b border-ink-800 px-4 py-1.5">
              {tabs.map((t) => (
                <span
                  key={t.index}
                  className={`max-w-[160px] truncate rounded-md px-2 py-1 font-mono text-[11px] ${
                    t.active ? "bg-ink-700 text-white" : "bg-ink-900 text-zinc-500"
                  }`}
                >
                  {t.index}: {t.title || t.url || "blank"}
                </span>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4">
            {shot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/jpeg;base64,${shot}`}
                alt={title || "Browser preview"}
                className="w-full max-w-3xl rounded-xl border border-ink-700 shadow-2xl"
              />
            ) : (
              <div className="flex h-48 w-full max-w-3xl items-center justify-center rounded-xl border border-dashed border-ink-700 text-sm text-zinc-600">
                {running ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" /> Opening browser…
                  </span>
                ) : (
                  "No preview yet"
                )}
              </div>
            )}
          </div>
          {title && <p className="truncate px-4 pb-3 text-xs text-zinc-500">{title}</p>}
        </div>
      </div>
    </div>
  );
}
