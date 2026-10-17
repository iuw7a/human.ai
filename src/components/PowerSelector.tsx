"use client";

import { useEffect, useRef, useState } from "react";
import { Zap, ChevronDown, Check, Lock } from "lucide-react";
import { getModels, getSubscription } from "@/lib/subscriptionClient";
import { prettyModelName, familyOf } from "@/lib/modelDisplay";

interface ApiModel {
  id: string;
  name: string;
  vision: boolean;
  plan: string;
  access_level: string;
  allowed?: boolean;
  via_admin?: boolean;
}

function tierLabel(tier: string): string {
  if (tier === "pro") return "Pro";
  if (tier === "high") return "High";
  if (tier === "extra") return "Extra";
  return "Light";
}

/**
 * Power/model selector for the composer bar.
 * Shows the real model display name (e.g. "humi.1 images").
 * The server re-verifies on every request —
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
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
  const currentLabel = current ? prettyModelName(current.name) : tierLabel(tier);

  const q = query.trim().toLowerCase();
  const visible = q
    ? models.filter(
        (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
      )
    : models;

  function setOpenAndReset(v: boolean) {
    setOpen(v);
    setQuery("");
    if (v) setTimeout(() => searchRef.current?.focus(), 30);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpenAndReset(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Model: ${currentLabel} (plan: ${plan}, server-verified)`}
        className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-ink-600 hover:text-white"
      >
        <Zap size={13} className="shrink-0 text-accent" />
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={13} className={`shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 max-h-[40vh] w-72 overflow-x-hidden overflow-y-auto rounded-2xl border border-white/10 bg-[#141417] p-1.5 shadow-2xl shadow-black/60 animate-menu-in"
        >
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Power · plan {plan} · {visible.length}/{models.length}
          </p>
          <div className="px-1.5 pb-1">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && visible.length > 0 && visible[0] && visible[0].allowed !== false) {
                  onChange(visible[0].id);
                  setOpenAndReset(false);
                }
              }}
              placeholder="Search models…"
              className="input !py-1.5 text-xs"
            />
          </div>
          {models.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-500">Loading…</p>
          )}
          {models.length > 0 && visible.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-500">No match.</p>
          )}
          {visible.map((m) => {
            const locked = m.allowed === false;
            const selected = m.id === value;
            const fam = familyOf(m.id, m.name);
            return (
              <button
                key={m.id}
                role="menuitem"
                disabled={locked}
                onClick={() => {
                  setOpenAndReset(false);
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
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ring-1 ${fam.classes}`}>
                  {fam.letter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] font-medium ${selected ? "text-white" : "text-zinc-200"}`}>
                    {prettyModelName(m.name)}
                    {fam.label && (
                      <span className="ml-1.5 text-[10px] font-normal text-zinc-500">{fam.label}</span>
                    )}
                    {m.via_admin && (
                      <span className="ml-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-px text-[10px] font-medium text-sky-300">
                        via admin
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {tierLabel(m.access_level)}{m.vision ? " · vision" : m.id === "humi.1-images" ? " · image" : " · text"}
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
