"use client";

import { useEffect, useState } from "react";
import { PageHeader, StatCard, RangeTabs, BarChart } from "@/components/admin/ui";

interface Summary {
  total_requests: number;
  total_tokens: number;
  by_model: { model_slug: string; requests: number; tokens: number }[];
  by_gateway: { gateway_key: string; requests: number; tokens: number; limit: number; remaining: number | null }[];
  recent: { model_slug: string; gateway_key: string; total_tokens: number; success: boolean; created_at: string }[];
}

export function UsagePanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [billing, setBilling] = useState<{ gateways: { key: string; label: string; needs_topup: boolean; last_billing_error: string | null; last_billing_at: string | null; billing_fails: number; topup_url: string | null }[]; failed_models: { model_slug: string; gateway_key: string; error: string; created_at: string }[] } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/usage?days=${days}`)
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => {});
    fetch("/api/admin/gateways")
      .then((r) => r.json())
      .then((j) => setBilling(j))
      .catch(() => {});
  }, [days]);

  return (
    <div>
      <PageHeader title="Usage" sub="Tokens consumed vs. remaining per gateway key." action={<RangeTabs value={days} onChange={setDays} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Requests (${days}d)`} value={data?.total_requests ?? 0} />
        <StatCard label={`Tokens used (${days}d)`} value={(data?.total_tokens ?? 0).toLocaleString()} />
        <StatCard label="Models hit" value={data?.by_model.length ?? 0} />
        <StatCard label="Gateways hit" value={data?.by_gateway.length ?? 0} />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">Gateways — used / remaining</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {(data?.by_gateway ?? []).map((g) => (
          <div key={g.gateway_key} className="card p-4">
            <p className="font-mono text-sm text-white">{g.gateway_key}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {g.tokens.toLocaleString()} tokens · {g.requests} requests
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Limit: {g.limit > 0 ? g.limit.toLocaleString() : "∞"} · Remaining: {g.remaining === null ? "∞" : g.remaining.toLocaleString()}
            </p>
            {g.limit > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full bg-accent" style={{ width: `${Math.min(100, (g.tokens / g.limit) * 100)}%` }} />
              </div>
            )}
          </div>
        ))}
        {(data?.by_gateway.length ?? 0) === 0 && <p className="text-xs text-zinc-600">No usage logged yet — chat once, then refresh.</p>}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">Billing issues — models needing a card/topup</h2>
      <div className="card space-y-2 p-4">
        {(billing?.gateways ?? []).filter((g) => g.needs_topup).length === 0 && (
          <p className="text-xs text-zinc-500">No billing failures in the last 7 days. All gateways clear.</p>
        )}
        {(billing?.gateways ?? [])
          .filter((g) => g.needs_topup)
          .map((g) => (
            <div key={g.key} className="rounded-xl border border-red-500/40 bg-red-500/[0.04] p-3">
              <p className="text-sm font-medium text-white">{g.label} — needs top-up ({g.billing_fails} fail(s))</p>
              {g.last_billing_error && <p className="mt-1 break-words font-mono text-[11px] text-red-200/70">{g.last_billing_error.slice(0, 300)}</p>}
              {g.topup_url && <a href={g.topup_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-sky-300 underline">Top up →</a>}
            </div>
          ))}
        {(billing?.failed_models ?? []).length > 0 && (
          <div className="space-y-1 pt-1">
            {(billing?.failed_models ?? []).map((f) => (
              <div key={f.model_slug} className="flex flex-wrap gap-2 font-mono text-[11px] text-zinc-500">
                <span className="text-red-300">{f.model_slug}</span>
                <span>{f.gateway_key}</span>
                <span className="ml-auto">{new Date(f.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">By model</h2>
      <div className="card p-4">
        <BarChart data={(data?.by_model ?? []).slice(0, 12).map((m) => ({ label: m.model_slug.slice(0, 12), value: m.tokens }))} />
        <div className="mt-3 space-y-1">
          {(data?.by_model ?? []).slice(0, 20).map((m) => (
            <div key={m.model_slug} className="flex justify-between font-mono text-xs text-zinc-400">
              <span>{m.model_slug}</span>
              <span>{m.tokens.toLocaleString()} tkn · {m.requests} req</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-white">Recent</h2>
      <div className="card divide-y divide-ink-800 p-2">
        {(data?.recent ?? []).slice(0, 20).map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-200">{r.model_slug}</span>
            <span>{r.gateway_key}</span>
            <span>{r.total_tokens} tkn</span>
            <span>{r.success ? "ok" : "fail"}</span>
            <span className="ml-auto">{new Date(r.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
