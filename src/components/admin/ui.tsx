"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs">
        {delta !== undefined && delta !== null && (
          <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
        {hint && <span className="text-zinc-500"> {hint}</span>}
      </p>
    </div>
  );
}

export function DaysTabs({ value, options = [7, 30, 90] }: { value: number; options?: number[] }) {
  const router = useRouter();
  const params = useSearchParams();
  function go(days: number) {
    const q = new URLSearchParams(params.toString());
    q.set("days", String(days));
    router.push(`?${q.toString()}`);
  }
  return (
    <div className="flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => go(o)}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
            value === o ? "bg-ink-700 text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {o}d
        </button>
      ))}
    </div>
  );
}
export function RangeTabs({
  value,
  onChange,
  options = [7, 30, 90],
}: {
  value: number;
  onChange: (v: number) => void;
  options?: number[];
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
            value === o ? "bg-ink-700 text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {o}d
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ value, tone }: { value: string; tone?: "green" | "red" | "amber" | "gray" | "blue" }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    red: "bg-accent/10 text-red-300 ring-accent/40",
    amber: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    blue: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
    gray: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tones[tone ?? "gray"]}`}>
      {value}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-zinc-500">{text}</p>;
}

export function ConfirmButton({
  children,
  onConfirm,
  confirmText = "Are you sure?",
  className = "",
}: {
  children: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  confirmText?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} className={className}>
        {children}
      </button>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-xs text-zinc-400">{confirmText}</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setArmed(false);
          }
        }}
        className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover"
      >
        Confirm
      </button>
      <button onClick={() => setArmed(false)} className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:text-white">
        Cancel
      </button>
    </span>
  );
}

/** Minimal SVG bar chart from real {label, value} data. */
export function BarChart({ data, height = 140 }: { data: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 560;
  const bw = data.length > 0 ? w / data.length : w;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${height + 24}`} style={{ minWidth: 480, width: "100%", height: "auto" }} role="img">
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * height);
          return (
            <g key={i}>
              <title>{`${d.label}: ${d.value}`}</title>
              <rect
                x={i * bw + bw * 0.22}
                y={height - h}
                width={bw * 0.56}
                height={h}
                rx={3}
                className="fill-accent/80"
              />
              {i % Math.ceil(data.length / 8) === 0 && (
                <text x={i * bw + bw * 0.5} y={height + 16} textAnchor="middle" fontSize={10} className="fill-zinc-500">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm text-zinc-100 shadow-2xl animate-menu-in">
      {msg}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  function show(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(null), 2800);
  }
  return { msg, show, ToastEl: <Toast msg={msg} /> };
}
