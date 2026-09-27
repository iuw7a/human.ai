"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Allow username OR email: resolve usernames server-side first.
    let loginEmail = email.trim();
    if (loginEmail && !loginEmail.includes("@")) {
      try {
        const r = await fetch("/api/auth/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: loginEmail }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "Unknown username.");
        loginEmail = j.email;
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Unknown username. Use your email address.");
        return;
      }
    }
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setLoading(false);
    setLoading(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Invalid login credentials. Use your email address (e.g. admin@human.ai) or username."
          : error.message
      );
      fetch("/api/security/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "login_failed", email: loginEmail }),
      }).catch(() => {});
      return;
    }
    fetch("/api/security/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "login", email: loginEmail }),
    }).catch(() => {});
    router.push(params.get("next") ?? "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo />
          <h1 className="mt-2 text-xl font-semibold text-white">Welcome back</h1>
          <p className="text-sm text-zinc-500">Log in to Human AI</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {error && (
            <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[13px] text-red-200">
              {error}
            </p>
          )}
          <div>
            <label className="label" htmlFor="email">Email or username</label>
            <input
              id="email"
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com or username"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Log in
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          No account?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
