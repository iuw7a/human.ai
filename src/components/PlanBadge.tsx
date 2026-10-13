"use client";

import { useEffect, useState } from "react";

/** Current plan badge for account areas and next to the user name. Server-verified. */
export function PlanBadge({ compact = false }: { compact?: boolean }) {
  const [plan, setPlan] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setPlan(j.plan ?? "free");
          setStatus(j.subscriptionStatus ?? "free");
        }
      })
      .catch(() => {});
  }, []);

  if (!plan) return null;
  const label = plan === "pro" ? "Pro" : plan === "plus" ? "Plus" : "Free";
  const cls =
    plan === "pro"
      ? "bg-sky-500/10 text-sky-300 ring-sky-500/30"
      : plan === "plus"
        ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
        : "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ${cls} ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
      title={status && status !== "free" && status !== "active" ? `Subscription ${status}` : `Plan ${label}`}
    >
      {label}
      {status === "expired" ? " · Expired" : status === "suspended" ? " · Suspended" : ""}
    </span>
  );
}
