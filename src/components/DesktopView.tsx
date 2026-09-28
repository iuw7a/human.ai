"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Square, Plus, Check, X, Loader2, AlertTriangle } from "lucide-react";
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

export function DesktopView({
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
  const [status, setStatus] = useState("Taking control…");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [shot, setShot] = useState<string | null>(null);
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
        setStatus("Looking at screen…");
        const res = await fetch("/api/agent-desktop/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? `Step failed (${res.status}).`);
        if (j.screenshot) setShot(j.screenshot);
        if (j.stopped) {
          setStopped(true);
          setDone(j.message ?? "Stopped.");
          setStatus("Stopped");
          break;
        }
        if (j.needsApproval) {
          setApproval(j.needsApproval);
          setStatus("Human approval required");
          runRef.current = false;
          setRunning(true);
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
    const res = await fetch("/api/agent-desktop/approve", {
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

  async function emergencyStop() {
    runRef.current = false;
    setRunning(false);
    await fetch(`/api/agent-desktop/session?id=${sessionId}`, { method: "DELETE" }).catch(() => {});
    setStopped(true);
    setDone("Stopped by user. Control released.");
    setStatus("Stopped");
  }

  async function newTask(e: React.FormEvent) {
    e.preventDefault();
    if (!followUp.trim()) return;
    router.push(`/desktop/new?goal=${encodeURIComponent(followUp.trim())}`);
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 pl-10 lg:pl-0">
          <Monitor size={16} className="shrink-0 text-accent" />
          <span className="truncate text-sm font-medium text-white">Desktop Control</span>
          <span className="hidden truncate text-xs text-zinc-500 sm:inline">· {initialGoal}</span>
        </div>
        <button
          onClick={() => void emergencyStop()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-[0_0_18px_rgba(229,72,77,0.5)] transition-colors hover:bg-accent-hover"
          title="Immediately release mouse and keyboard"
        >
          <Square size={12} /> Stop Agent
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col border-b border-ink-800 lg:border-b-0 lg:border-r">
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${running ? "animate-pulse bg-accent" : stopped || done ? "bg-zinc-600" : "bg-emerald-400"}`} />
              <span className="truncate text-zinc-200">{status}</span>
            </div>

            {approval && (
              <div className="mb-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 animate-menu-in">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-200">
                  <AlertTriangle size={15} /> Human approval required
                </p>
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
                  <p className="text-sm font-medium text-emerald-200">{stopped ? "Stopped" : "Task completed"}</p>
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
                placeholder="New desktop task (fresh session)…"
                className="input"
              />
              <button type="submit" className="btn-primary shrink-0 text-xs">
                <Plus size={14} /> Start
              </button>
            </div>
          </form>
        </div>

        <div className="flex min-h-0 flex-col bg-ink-950">
          <div className="border-b border-ink-800 px-4 py-2">
            <p className="text-xs text-zinc-500">
              Reference view — you are watching the <b className="text-zinc-300">real desktop</b> directly.
              The blue frame marks agent control.
            </p>
          </div>
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4">
            {shot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/jpeg;base64,${shot}`}
                alt="Current desktop observation"
                className="w-full max-w-3xl rounded-xl border border-ink-700 shadow-2xl"
              />
            ) : (
              <div className="flex h-48 w-full max-w-3xl items-center justify-center rounded-xl border border-dashed border-ink-700 text-sm text-zinc-600">
                Waiting for first observation…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
