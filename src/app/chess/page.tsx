import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { ChessExperience } from "@/components/chess/ChessExperience";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Chess | Human AI",
  description: "Human AI Chess — play against the engine or invite a friend. Think like a human. Play like a machine.",
};

export const dynamic = "force-dynamic";

export default async function ChessPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppShell>
      <Suspense fallback={null}>
        <ChessExperience user={user} />
      </Suspense>
    </AppShell>
  );
}
