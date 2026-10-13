import { AppShell } from "@/components/AppShell";
import { UrHumiHome } from "@/components/humi/UrHumiHome";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "My Humi — Human AI" };

export default async function UrHumiPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initial: {
    id: string;
    name: string;
    avatar_url: string;
    personality: string;
    language: string;
    voice_enabled: boolean;
    model_id: string;
  }[] = [];
  if (user) {
    try {
      const { data } = await supabase
        .from("humi_assistants")
        .select("id,name,avatar_url,personality,language,voice_enabled,model_id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      initial = (data ?? []) as typeof initial;
    } catch {
      initial = [];
    }
  }

  return (
    <AppShell>
      <UrHumiHome initial={initial} signedIn={!!user} />
    </AppShell>
  );
}
