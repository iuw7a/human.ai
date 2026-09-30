"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ListTodo, Loader2 } from "lucide-react";

export interface BotTask {
  id: string;
  title: string;
  done: boolean;
  due_at: string | null;
}

/**
 * Floating task card for a Pro bot: lists open tasks, animates completion.
 * Backed by the real bot tasks API — no demo data.
 */
export function TaskPanel({ botSlug, accent = "#e5484d" }: { botSlug: string; accent?: string }) {
  const [tasks, setTasks] = useState<BotTask[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/bots/${botSlug}/tasks`);
    const j = await res.json().catch(() => null);
    if (res.ok) setTasks(j?.tasks ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botSlug]);

  if (tasks === null) return null;
  const openTasks = tasks.filter((t) => !t.done);
  if (openTasks.length === 0 && !open) return null;

  async function toggle(task: BotTask) {
    setBusyId(task.id);
    // Optimistic completion animation, then persist.
    setTasks((prev) => (prev ?? []).map((t) => (t.id === task.id ? { ...t, done: true } : t)));
    try {
      const res = await fetch(`/api/bots/${botSlug}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, done: true }),
      });
      if (!res.ok) throw new Error("failed");
      setTimeout(load, 900);
    } catch {
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#101014]/90 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left"
        aria-expanded={open}
      >
        <ListTodo size={16} style={{ color: accent }} />
        <span className="flex-1 text-sm font-medium text-zinc-100">
          Tasks
          <span className="ml-2 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-zinc-400">
            {openTasks.length} open
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={15} className="text-zinc-500" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 px-3 pb-4">
              <AnimatePresence initial={false}>
                {tasks.map((t) => (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: t.done ? 0.45 : 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-black/40 px-3.5 py-2.5"
                  >
                    <button
                      onClick={() => !t.done && toggle(t)}
                      disabled={t.done || busyId === t.id}
                      aria-label={t.done ? "Completed" : `Complete: ${t.title}`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors"
                      style={
                        t.done
                          ? { background: accent, borderColor: accent }
                          : { borderColor: "rgba(255,255,255,0.2)" }
                      }
                    >
                      {busyId === t.id ? (
                        <Loader2 size={13} className="animate-spin text-white" />
                      ) : (
                        t.done && <Check size={13} className="text-white" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${t.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                        {t.title}
                      </p>
                      {t.due_at && (
                        <p className="text-[11px] text-zinc-500">
                          Due {new Date(t.due_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
