"use client";

import { StatusPill } from "@/components/admin/ui";

export function planTone(plan: string): "gray" | "amber" | "blue" {
  if (plan === "pro") return "blue";
  if (plan === "plus") return "amber";
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
  if (plan === "pro") return "Pro";
  if (plan === "plus") return "Plus";
  return "Free";
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
