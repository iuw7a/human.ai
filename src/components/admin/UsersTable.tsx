"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { StatusPill, EmptyState, useToast } from "@/components/admin/ui";
import { SubscriptionBadge, SourceBadge, planTone, statusTone } from "@/components/SubscriptionBadge";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  plan: string;
  status: string;
  role: string;
  subscription_status: string;
  subscription_source: string | null;
  subscription_starts_at: string | null;
  subscription_expires_at: string | null;
  access_levels: string[];
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function UsersTable({
  rows,
  total,
  page,
  perPage,
  q,
  filter,
  sort,
}: {
  rows: AdminUserRow[];
  total: number;
  page: number;
  perPage: number;
  q: string;
  filter: string;
  sort: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const { show, ToastEl } = useToast();
  const pages = Math.max(1, Math.ceil(total / perPage));

  function go(patch: Record<string, string | number>) {
    const p = new URLSearchParams({ q, filter, sort, page: String(page) });
    for (const [k, v] of Object.entries(patch)) p.set(k, String(v));
    router.push(`/admin/users?${p.toString()}`);
  }

  async function quickOp(id: string, op: string) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op }),
    });
    if (res.ok) {
      show("Updated.");
      router.refresh();
    } else {
      const j = await res.json().catch(() => null);
      show(j?.error ?? "Failed.");
    }
  }

  return (
    <div>
      {ToastEl}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: search, page: 1 });
        }}
        className="mb-3 flex flex-wrap gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username, email, or user ID…"
            className="input !pl-8"
          />
        </div>
        <select value={filter} onChange={(e) => go({ filter: e.target.value, page: 1 })} className="input !w-auto">
          <option value="all">All</option>
          <option value="pro">Pro</option>
          <option value="plus">Plus</option>
          <option value="free">Free</option>
          <option value="banned">Banned</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={sort} onChange={(e) => go({ sort: e.target.value })} className="input !w-auto">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="email">Email A–Z</option>
        </select>
        <button type="submit" className="btn-primary">Search</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Sub. status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Start / Expiry</th>
              <th className="px-4 py-3">AI access</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-ink-800/60 last:border-0 hover:bg-ink-850/50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-ink-700" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-semibold text-white">
                        {(u.name?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <Link href={`/admin/users/${u.id}`} className="hover:text-accent">
                        <SubscriptionBadge name={u.name} plan={u.plan} />
                      </Link>
                      <p className="mt-0.5 text-xs text-zinc-500">{u.email}</p>
                      <p className="font-mono text-[11px] text-zinc-600" title={u.id}>{u.id.slice(0, 8)}…</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill value={u.plan} tone={planTone(u.plan)} />
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill
                    value={u.banned ? "banned" : u.subscription_status}
                    tone={u.banned ? "red" : statusTone(u.subscription_status)}
                  />
                  {u.status !== "active" && !u.banned && (
                    <p className="mt-1 text-[11px] text-zinc-500">acct: {u.status}</p>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <SourceBadge source={u.subscription_source} />
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  <p>{fmtDate(u.subscription_starts_at)} → {fmtDate(u.subscription_expires_at)}</p>
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  {(u.access_levels ?? []).join(", ") || "light"}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  {fmtDate(u.created_at)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Link href={`/admin/users/${u.id}`} className="btn-ghost !px-2.5 !py-1 text-xs">
                      Open
                    </Link>
                    {u.banned ? (
                      <button onClick={() => quickOp(u.id, "unban")} className="btn-ghost !px-2.5 !py-1 text-xs">
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => { if (confirm(`Ban ${u.email}?`)) quickOp(u.id, "ban"); }}
                        className="btn-ghost !px-2.5 !py-1 text-xs hover:!text-accent"
                      >
                        Ban
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState text="No users match." />}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{total} users · page {page} of {pages}</span>
        <div className="flex gap-1.5">
          <button disabled={page <= 1} onClick={() => go({ page: page - 1 })} className="btn-ghost !px-3 !py-1 disabled:opacity-40">
            Prev
          </button>
          <button disabled={page >= pages} onClick={() => go({ page: page + 1 })} className="btn-ghost !px-3 !py-1 disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
