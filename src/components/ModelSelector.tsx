"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { getModels, getSubscription } from "@/lib/subscriptionClient";
import { prettyModelName, familyOf } from "@/lib/modelDisplay";

interface ApiModel {
  id: string; name: string; vision: boolean; plan: string;
  access_level: string; allowed?: boolean; via_admin?: boolean;
}

/**
 * Subscription-aware model picker.
 * Shows what the user may actually use; restricted premium options are
 * locked with an upgrade hint. The server re-verifies on every request —
 * this picker is never the source of truth.
 */
export function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [models, setModels] = useState<ApiModel[]>([]);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<string>("free");
  const [query, setQuery] = useState("");

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

  const current = models.find((m) => m.id === value);
  const displayName = current ? prettyModelName(current.name) : value;

  const q = query.trim().toLowerCase();
  const visible = q
    ? models.filter(
        (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
      )
    : models;

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
        }}
        className="inline-flex items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-900 px-3 py-1.5 text-[13px] font-medium text-zinc-100 hover:border-ink-600"
        title={`AI access: ${plan} — server-verified`}
      >
        {displayName}
        <span className="rounded-full bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
          {current?.access_level ?? "light"}
        </span>
        <ChevronDown size={13} className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#141417] shadow-2xl animate-menu-in">
            <p className="border-b border-white/10 px-4 py-2.5 text-[11px] uppercase tracking-wider text-zinc-500">
              Your plan: {plan} · {visible.length}/{models.length} · server-verified
            </p>
            <div className="p-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="input !py-1.5 text-xs"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 pt-0">
              {models.length === 0 && (
                <p className="px-3 py-3 text-xs text-zinc-500">Loading models…</p>
              )}
              {models.length > 0 && visible.length === 0 && (
                <p className="px-3 py-3 text-xs text-zinc-500">No match.</p>
              )}
              {visible.map((m) => {
                const locked = m.allowed === false;
                const active = m.id === value;
                const fam = familyOf(m.id, m.name);
                return (
                  <button
                    key={m.id}
                    disabled={locked}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      locked
                        ? "cursor-not-allowed opacity-55"
                        : active
                          ? "bg-accent/15 text-white"
                          : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                    }`}
                    title={locked ? `Requires upgrade (${m.access_level})` : m.id}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ring-1 ${fam.classes}`}>
                      {fam.letter}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
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
                      <span className="block text-[11px] text-zinc-500">
                        {m.access_level}
                        {m.vision ? " · vision" : " · text"}
                        {m.plan !== "free" ? ` · ${m.plan}` : ""}
                      </span>
                    </span>
                    {locked ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        <Lock size={10} /> Upgrade
                      </span>
                    ) : active ? (
                      <span className="shrink-0 text-xs text-accent">●</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="border-t border-white/10 px-4 py-2.5 text-[11px] leading-5 text-zinc-500">
              Locked options need Plus/Pro. The backend re-checks your subscription on every request.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
