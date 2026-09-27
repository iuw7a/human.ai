"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LogoutPage() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.signOut().finally(() => {
      router.push("/");
      router.refresh();
    });
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950">
      <p className="text-sm text-zinc-400">Signing out of Human AI…</p>
    </div>
  );
}
