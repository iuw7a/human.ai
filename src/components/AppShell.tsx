import { Sidebar } from "@/components/Sidebar";
import { AnnouncementBanner, AnnouncementModal } from "@/components/Announcements";
import { createServerSupabase } from "@/lib/supabase/server";
import { activeAnnouncements } from "@/lib/admin";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let chats: { id: string; title: string | null; model_id: string; updated_at: string }[] = [];
  let dbError = false;
  let plan: "all" | "free" | "plus" = "all";
  if (user) {
    const { data, error } = await supabase
      .from("chats")
      .select("id,title,model_id,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    chats = data ?? [];
    dbError = !!error;
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    plan = profile?.plan === "plus" ? "plus" : "free";
  }

  const [banners, modals, notices] = await Promise.all([
    activeAnnouncements(plan, "banner"),
    activeAnnouncements(plan, "modal"),
    activeAnnouncements(plan, "notice"),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <Sidebar user={user} chats={chats} dbError={dbError} />
      <main className="flex min-w-0 flex-1 flex-col">
        <AnnouncementBanner items={[...banners, ...notices]} />
        <div className="min-h-0 flex-1">{children}</div>
      </main>
      <AnnouncementModal items={modals} />
    </div>
  );
}
