"use client";

import { StatusPill } from "@/components/admin/ui";
import { normalizePlan, planLabel as labelForPlan } from "@/lib/plan-labels";

export function planTone(plan: string): "gray" | "amber" | "blue" | "green" {
  const key = normalizePlan(plan);
  if (key === "humi_extra" || key === "humi_enterprises") return "green";
  if (key === "pro" || key === "humi_pro") return "blue";
  if (key === "plus" || key === "humi_elite") return "amber";
  return "gray";
}

export function statusTone(status: string): "gray" | "green" | "red" | "amber" {
  if (status === "active") return "green";
  if (status === "suspended") return "red";
  if (status === "expired") return "amber";
  return "gray";
}

export function sourceTone(source: string | null): "gray" | "blue" | "amber" | "green" {
  if (!source) return "gray";
  if (source === "payment") return "green";
  if (source === "admin_grant") return "blue";
  return "amber";
}

export function planLabel(plan: string): string {
  return labelForPlan(plan);
}

export function sourceLabel(source: string | null): string {
  if (!source) return "—";
  if (source === "admin_grant") return "Admin Grant";
  if (source === "redeem_code") return "Redeem Code";
  if (source === "external_provider") return "External Provider";
  if (source === "payment") return "Payment";
  if (source === "promotion") return "Promotion";
  return source;
}

/** "User Name · Plus" badge for user lists and management screens. */
export function SubscriptionBadge({ name, plan }: { name: string; plan: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-medium text-white">{name || "—"}</span>
      <StatusPill value={planLabel(plan)} tone={planTone(plan)} />
    </span>
  );
}

/** "Source: Admin Grant" — always from DB records, never inferred. */
export function SourceBadge({ source }: { source: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <span className="text-zinc-500">Source:</span>
      <StatusPill value={sourceLabel(source)} tone={sourceTone(source)} />
    </span>
  );
}
