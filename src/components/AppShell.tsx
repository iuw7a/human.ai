import { Sidebar } from "@/components/Sidebar";
import { AnnouncementBanner, AnnouncementModal } from "@/components/Announcements";
import { createServerSupabase } from "@/lib/supabase/server";
import { activeAnnouncements } from "@/lib/admin";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let chats: { id: string; title: string | null; model_id: string; updated_at: string; humi_assistant_id?: string | null }[] = [];
  let buildProjects: { id: string; title: string; brief?: string; status?: string; updated_at?: string }[] = [];
  let dbError = false;
  let plan: "all" | "free" | "plus" = "all";
  if (user) {
    // Chats, build projects + profile in parallel — never sequential DB waterfalls per navigation.
    const [chatsRes, profileRes, projectsRes] = await Promise.all([
      supabase
        .from("chats")
        .select("id,title,model_id,updated_at,humi_assistant_id")
        .order("updated_at", { ascending: false })
        .limit(30),
      supabase.from("profiles").select("plan").eq("id", user.id).single(),
      supabase
        .from("build_projects")
        .select("id,title,brief,status,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(30),
    ]);
    if (chatsRes.error) {
      // Pre-migration database (no humi_assistant_id yet): previous behavior.
      const { data, error } = await supabase
        .from("chats")
        .select("id,title,model_id,updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);
      chats = data ?? [];
      dbError = !!error;
    } else {
      // Bot threads live on /bot/[slug]/chat — keep the main sidebar to regular chats.
      chats = (((chatsRes.data ?? []) as typeof chats).filter((c) => !c.humi_assistant_id));
    }
    if (projectsRes.data) {
      buildProjects = projectsRes.data;
    }
    const rawPlan = profileRes.data?.plan;
    plan = rawPlan && rawPlan !== "free" ? "plus" : "free";
  }

  // Speed: single shared fetch (60 s cached in lib/admin) — split by kind in
  // memory instead of 3 sequential DB round-trips.
  const allAnnouncements = await activeAnnouncements(plan);
  const banners = allAnnouncements.filter((a) => a.kind === "banner");
  const modals = allAnnouncements.filter((a) => a.kind === "modal");
  const notices = allAnnouncements.filter((a) => a.kind === "notice");

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <Sidebar user={user} chats={chats} buildProjects={buildProjects} dbError={dbError} />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <AnnouncementBanner items={[...banners, ...notices]} />
        <div className="min-h-0 flex-1">{children}</div>
      </main>
      <AnnouncementModal items={modals} />
    </div>
  );
}
