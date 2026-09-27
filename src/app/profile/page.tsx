import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "@/components/ProfileForm";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name,avatar_url,created_at")
    .eq("id", user.id)
    .single();

  const name = profile?.name ?? (user.user_metadata?.name as string) ?? "";
  const initial = (name?.[0] ?? user.email?.[0] ?? "?").toUpperCase();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-8 pl-14 lg:pl-4">
        <h1 className="text-xl font-semibold text-white">Profile</h1>
        <p className="mt-1 text-sm text-zinc-500">
          How you appear on Human AI.
        </p>
        <div className="card mt-6 flex items-center gap-4 p-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-700 text-xl font-semibold text-white ring-1 ring-ink-600">
            {initial}
          </span>
          <div>
            <p className="text-[15px] font-medium text-white">{name || "Human AI user"}</p>
            <p className="text-sm text-zinc-500">{user.email}</p>
            <p className="mt-1 text-xs text-zinc-600">
              Member since{" "}
              {new Date(
                profile?.created_at ?? user.created_at
              ).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <ProfileForm initialName={name} email={user.email ?? ""} />
        </div>
      </div>
    </AppShell>
  );
}
