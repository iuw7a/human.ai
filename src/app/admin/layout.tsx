import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const dynamic = "force-dynamic";

function Denied() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-accent">
        Human AI Admin
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Access denied</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">
        Your account does not have administrator permissions. If you believe
        this is a mistake, contact an administrator.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Back to Human AI
      </Link>
    </div>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const admin = createAdminSupabase();
  const { data: profile } = await admin
    .from("profiles")
    .select("role,plan,name,status")
    .eq("id", user.id)
    .single();

  const role = profile?.role;
  if (role !== "admin" && role !== "super_admin") {
    return (
      <div className="flex min-h-screen bg-ink-950 text-zinc-100">
        <main className="min-w-0 flex-1">
          <Denied />
        </main>
      </div>
    );
  }
  if (profile?.status !== "active") {
    return (
      <div className="flex min-h-screen bg-ink-950 text-zinc-100">
        <main className="min-w-0 flex-1">
          <Denied />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-ink-950 text-zinc-100">
      <AdminSidebar
        adminName={profile?.name ?? user.email ?? "Admin"}
        adminRole={role}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 pl-14 sm:px-8 lg:pl-8">
          {children}
        </div>
      </main>
    </div>
  );
}
