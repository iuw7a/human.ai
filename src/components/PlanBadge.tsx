"use client";

import { useEffect, useState } from "react";
import { getSubscription } from "@/lib/subscriptionClient";
import { normalizePlan, planLabel, type Plan } from "@/lib/plan-labels";

const PLAN_TONE: Record<Plan, string> = {
  free: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30",
  plus: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  pro: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  humi_elite: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  humi_pro: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  humi_extra: "bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30",
  humi_enterprises: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30",
};

/** Current plan badge for account areas and next to the user name. Server-verified. */
export function PlanBadge({ compact = false }: { compact?: boolean }) {
  const [plan, setPlan] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getSubscription()
      .then((j) => {
        if (j) {
          setPlan(j.plan ?? "free");
          setStatus(j.subscriptionStatus ?? "free");
        }
      })
      .catch(() => {});
  }, []);

  if (!plan) return null;
  const key = normalizePlan(plan);
  const label = planLabel(key);
  const cls = PLAN_TONE[key];
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
