"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PlanBadge } from "./PlanBadge";
import { planLabel } from "@/lib/plan-labels";

interface SubInfo {
  plan: string; subscriptionStatus: string; source: string | null;
  startsAt: string | null; expiresAt: string | null;
  accessLevels: string[];
}

export function AccountActions({
  email,
  availablePlans = [],
}: {
  email: string;
  availablePlans?: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setStatus(error.message);
    else {
      setStatus("Password updated.");
      setPassword("");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function deleteAllChats() {
    setWipeBusy(true);
    setWipeError(null);
    try {
      const res = await fetch("/api/chats", { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Could not delete chats.");
      }
      setWipeOpen(false);
      router.push("/");
      router.refresh();
    } catch (e) {
      setWipeError(e instanceof Error ? e.message : "Could not delete chats.");
    } finally {
      setWipeBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Permanently delete your Human AI account and all chats, messages and memories? This cannot be undone."
      )
    )
      return;
    setBusy(true);
    const res = await fetch("/api/account/delete", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setStatus(j?.error ?? "Could not delete account.");
      return;
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const [sub, setSub] = useState<SubInfo | null>(null);
  useEffect(() => {
    fetch("/api/me/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) setSub(j);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
          Subscription <PlanBadge />
        </h2>
        {sub ? (
          <div className="mt-2 space-y-1 text-sm text-zinc-400">
            <p>Plan: <span className="text-white">{sub.plan}</span> · Status: <span className="text-white">{sub.subscriptionStatus}</span></p>
            <p>Source: <span className="text-white">{sub.source ?? "—"}</span></p>
            <p>AI access: <span className="text-white">{(sub.accessLevels ?? []).join(", ")}</span></p>
            {sub.expiresAt && <p>Expires: <span className="text-white">{new Date(sub.expiresAt).toLocaleString()}</span></p>}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">Loading subscription…</p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-[15px] font-semibold text-white">Upgrade</h2>
        {availablePlans.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              You&apos;ll be redirected to Stripe&apos;s secure checkout. Cancel anytime.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {availablePlans.map((plan) => (
                <form key={plan} method="POST" action="/api/stripe/create-checkout-session">
                  <input type="hidden" name="plan" value={plan} />
                  <button type="submit" className="btn-primary">
                    Upgrade to {planLabel(plan)}
                  </button>
                </form>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">No upgrades available right now.</p>
        )}
        <Link href="/pricing" className="mt-3 inline-block text-sm text-zinc-400 hover:text-white">
          See all plans →
        </Link>
      </section>

      <section className="card p-6">
        <h2 className="text-[15px] font-semibold text-white">Session</h2>
        <p className="mt-1 text-sm text-zinc-500">Signed in as {email}.</p>
        <button onClick={logout} className="btn-ghost mt-3 border border-ink-700">
          Log out
        </button>
      </section>

      <section className="card p-6">
        <h2 className="text-[15px] font-semibold text-white">Security</h2>
        <p className="mt-1 text-sm text-zinc-500">Set a new password.</p>
        <form onSubmit={changePassword} className="mt-3 flex gap-2">
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="input"
            autoComplete="new-password"
          />
          <button type="submit" disabled={busy} className="btn-primary shrink-0">
            {busy && <Loader2 size={15} className="animate-spin" />}
            Update
          </button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="text-[15px] font-semibold text-white">Chat history</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Delete all your conversations at once — chats, bot chats and uploads.
        </p>
        <button
          onClick={() => {
            setWipeError(null);
            setWipeOpen(true);
          }}
          className="btn-ghost mt-3 border border-ink-700"
        >
          Delete all chats…
        </button>
      </section>

      <section className="card border-accent/30 p-6">
        <h2 className="text-[15px] font-semibold text-white">Delete account</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Removes your profile, chats, messages, memories and uploads.
        </p>
        <button
          onClick={deleteAccount}
          disabled={busy}
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-accent/15 px-4 py-2 text-sm font-medium text-red-200 ring-1 ring-accent/40 transition-colors hover:bg-accent/25"
        >
          Delete my account
        </button>
      </section>

      {status && <p className="text-[13px] text-zinc-300">{status}</p>}

      {wipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Delete all chats">
          <div className="absolute inset-0 bg-black/70" onClick={() => !wipeBusy && setWipeOpen(false)} />
          <div className="relative w-full max-w-sm rounded-[22px] border border-white/10 bg-[#141417] p-6 shadow-2xl shadow-black/60 animate-menu-in">
            <h3 className="text-base font-semibold text-white">Delete all chats?</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              This permanently removes every conversation, bot chat and upload
              on your account. This cannot be undone.
            </p>
            {wipeError && (
              <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">
                {wipeError}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setWipeOpen(false)}
                disabled={wipeBusy}
                className="btn-ghost flex-1 border border-ink-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void deleteAllChats()}
                disabled={wipeBusy}
                className="flex-1 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {wipeBusy ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
