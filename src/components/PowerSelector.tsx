"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, ChevronDown, Check, Lock } from "lucide-react";
import { getModels, getSubscription } from "@/lib/subscriptionClient";

interface ApiModel {
  id: string;
  name: string;
  vision: boolean;
  plan: string;
  access_level: string;
  allowed?: boolean;
}

function tierLabel(tier: string): string {
  if (tier === "pro") return "Pro";
  if (tier === "high") return "High";
  if (tier === "extra") return "Extra";
  return "Light";
}

/**
 * Power/model selector for the composer bar: [ Light ▾ ] next to [ Chat ▾ ].
 * Lists the real registry models by capability tier; restricted tiers are
 * locked with an upgrade hint. The server re-verifies on every request —
 * this picker is never the source of truth.
 */
export function PowerSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [models, setModels] = useState<ApiModel[]>([]);
  const [plan, setPlan] = useState("free");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getModels()
      .then((models) => setModels(models))
      .catch(() => {});
    getSubscription()
      .then((j) => {
        if (j?.plan) setPlan(j.plan);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const current = models.find((m) => m.id === value);
  const tier = current?.access_level ?? "light";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`AI power: ${tierLabel(tier)} (plan: ${plan}, server-verified)`}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-ink-600 hover:text-white"
      >
        <Zap size={13} className="text-accent" />
        {tierLabel(tier)}
        <ChevronDown size={13} className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-[#141417] p-1.5 shadow-2xl shadow-black/60 animate-menu-in"
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Power · plan {plan}
          </p>
          {models.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-500">Loading…</p>
          )}
          {models.map((m) => {
            const locked = m.allowed === false;
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                role="menuitem"
                disabled={locked}
                onClick={() => {
                  setOpen(false);
                  if (!locked) onChange(m.id);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                  locked
                    ? "cursor-not-allowed opacity-55"
                    : selected
                      ? "bg-white/[0.07]"
                      : "hover:bg-white/[0.07]"
                }`}
                title={locked ? `Requires upgrade (${tierLabel(m.access_level)})` : m.id}
              >
                <Zap size={15} className={selected ? "text-accent" : "text-zinc-500"} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-medium ${selected ? "text-white" : "text-zinc-200"}`}>
                    {tierLabel(m.access_level)}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    Human AI{m.vision ? " · vision" : " · text"}
                    {m.plan !== "free" ? ` · ${m.plan}` : " · free"}
                  </span>
                </span>
                {locked ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    <Lock size={10} />
                  </span>
                ) : (
                  selected && <Check size={14} className="shrink-0 text-accent" />
                )}
              </button>
            );
          })}
          <p className="border-t border-white/10 px-3 py-2 text-[10px] leading-4 text-zinc-600">
            Locked power needs Plus/Pro. Server checks every request.
          </p>
        </div>
      )}
    </div>
  );
}
