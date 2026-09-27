import { Sidebar } from "@/components/Sidebar";
import { createServerSupabase } from "@/lib/supabase/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let chats: { id: string; title: string | null; model_id: string; updated_at: string }[] = [];
  let dbError = false;
  if (user) {
    const { data, error } = await supabase
      .from("chats")
      .select("id,title,model_id,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30);
    chats = data ?? [];
    dbError = !!error;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <Sidebar user={user} chats={chats} dbError={dbError} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
