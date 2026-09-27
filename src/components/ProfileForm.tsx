"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("Not signed in.");
      setLoading(false);
      return;
    }
    const { error: authError } = await supabase.auth.updateUser({
      data: { name },
    });
    const { error: dbError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, name, email: user.email });
    setLoading(false);
    if (authError || dbError) {
      setStatus(authError?.message ?? dbError?.message ?? "Update failed.");
      return;
    }
    setStatus("Profile updated.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">Display name</label>
        <input
          id="name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input opacity-60" value={email} disabled readOnly />
        <p className="mt-1 text-xs text-zinc-600">
          Change your email under Account → Security.
        </p>
      </div>
      {status && <p className="text-[13px] text-zinc-300">{status}</p>}
      <button type="submit" disabled={loading} className="btn-primary">
        {loading && <Loader2 size={16} className="animate-spin" />}
        Save changes
      </button>
    </form>
  );
}
