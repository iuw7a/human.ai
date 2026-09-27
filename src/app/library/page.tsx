import { redirect } from "next/navigation";
import Link from "next/link";
import { LibraryBig, MessagesSquare, Brain, ImageIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export default async function LibraryPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/library");

  const [{ count: chatCount }, { count: messageCount }, { count: memoryCount }] =
    await Promise.all([
      supabase.from("chats").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("memories").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);

  const { data: attachments } = await supabase
    .from("attachments")
    .select("storage_path,chat_id,created_at,mime_type")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);

  const admin = createAdminSupabase();
  const images = await Promise.all(
    (attachments ?? []).map(async (a) => {
      try {
        const { data: signed } = await admin.storage
          .from("attachments")
          .createSignedUrl(a.storage_path, 3600);
        return { ...a, url: signed?.signedUrl ?? null };
      } catch {
        return { ...a, url: null };
      }
    })
  );

  const stats = [
    { icon: MessagesSquare, label: "Chats", value: chatCount ?? 0 },
    { icon: Brain, label: "Memories", value: memoryCount ?? 0, href: "/memory" },
    { icon: ImageIcon, label: "Uploads", value: attachments?.length ?? 0 },
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 pl-14 lg:pl-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
            <LibraryBig size={19} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-white">Library</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Everything you have saved on Human AI.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {stats.map((s) => {
            const inner = (
              <>
                <s.icon size={17} className="text-zinc-400" />
                <p className="mt-2 text-2xl font-semibold text-white">{s.value}</p>
                <p className="text-xs text-zinc-500">{s.label}</p>
              </>
            );
            return "href" in s && s.href ? (
              <Link key={s.label} href={s.href as string} className="card p-4 transition-colors hover:border-zinc-300">
                {inner}
              </Link>
            ) : (
              <div key={s.label} className="card p-4">
                {inner}
              </div>
            );
          })}
        </div>

        <h2 className="mt-8 text-sm font-semibold text-white">Your uploads</h2>
        {images.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No uploads yet. Attach an image in any chat and it will appear here.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {images.map((img, i) =>
              img.url ? (
                <Link
                  key={`${img.storage_path}-${i}`}
                  href={`/chat/${img.chat_id}`}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-ink-700 bg-ink-900"
                  title={new Date(img.created_at).toLocaleString()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={`Upload ${i + 1}`}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </Link>
              ) : null
            )}
          </div>
        )}
        <p className="mt-6 text-xs text-zinc-400">
          {messageCount ?? 0} messages across your conversations. All data is
          private to your account.
        </p>
      </div>
    </AppShell>
  );
}
