import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EditHumiClient } from "@/components/humi/EditHumiClient";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOwnAssistant } from "@/lib/humi/server";
import { listDbModels } from "@/lib/admin";
import { getEffectiveSubscription, canAccessModel } from "@/lib/subscriptions";

export const metadata = { title: "Customize Humi — Human AI" };

export default async function EditHumiPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/urhumi/${params.id}/edit`);

  const assistant = await getOwnAssistant(supabase, user.id, params.id).catch(() => null);
  if (!assistant) notFound();

  // White-label safe model options (slugs + neutral labels only, no provider internals).
  // Subscription-aware: restricted models are marked, server re-verifies on every chat request.
  const sub = await getEffectiveSubscription(user.id);
  const models = (await listDbModels())
    .filter((m) => m.enabled)
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description || m.name,
      allowed: canAccessModel(sub, m),
      access_level: m.access_level,
    }));

  let memoryCount = 0;
  try {
    const { count } = await supabase.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    memoryCount = count ?? 0;
  } catch {
    memoryCount = 0;
  }

  return (
    <AppShell>
      <EditHumiClient
        assistant={{
          id: assistant.id,
          name: assistant.name,
          avatar_url: assistant.avatar_url,
          personality: assistant.personality as "friendly" | "professional" | "funny" | "calm" | "custom",
          custom_instructions: assistant.custom_instructions,
          language: assistant.language as "auto" | "ar" | "de" | "en",
          voice: "server",
          voice_enabled: assistant.voice_enabled,
          model_id: assistant.model_id,
        }}
        models={models}
        memoryCount={memoryCount}
      />
    </AppShell>
  );
}
