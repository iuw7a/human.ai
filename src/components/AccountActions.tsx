"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AccountActions({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-4">
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
    </div>
  );
}
