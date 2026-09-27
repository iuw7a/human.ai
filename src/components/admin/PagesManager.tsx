"use client";

import { useEffect, useState } from "react";
import { StatusPill, ConfirmButton, EmptyState, useToast } from "@/components/admin/ui";

interface Row { slug: string; title: string; content_md: string; published: boolean; updated_at: string }

export function PagesManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ slug: "", title: "", content_md: "", published: false });
  const [editing, setEditing] = useState<string | null>(null);
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/admin/pages");
    const j = await res.json();
    setRows(j.rows ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!form.slug.trim() || !form.title.trim()) {
      show("Slug and title required.");
      return;
    }
    const res = await fetch("/api/admin/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    show(res.ok ? "Saved." : "Failed.");
    if (res.ok) {
      setForm({ slug: "", title: "", content_md: "", published: false });
      setEditing(null);
      load();
    }
  }

  function edit(r: Row) {
    setEditing(r.slug);
    setForm({ slug: r.slug, title: r.title, content_md: r.content_md ?? "", published: r.published });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggle(r: Row) {
    await fetch("/api/admin/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: r.slug, title: r.title, content_md: r.content_md, published: !r.published }),
    });
    load();
  }

  async function remove(slug: string) {
    await fetch(`/api/admin/pages?slug=${slug}`, { method: "DELETE" });
    show("Deleted — page falls back to built-in content.");
    load();
  }

  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold text-white">{editing ? `Edit: ${editing}` : "New page"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.slug} disabled={!!editing} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="slug (e.g. about)" className="input" />
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="input" />
        </div>
        <textarea value={form.content_md} onChange={(e) => setForm({ ...form, content_md: e.target.value })} placeholder="Markdown content…" rows={8} className="input font-mono !text-[13px]" />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
          Published (overrides built-in page)
        </label>
        <div className="flex gap-2">
          <button onClick={save} className="btn-primary text-xs">Save page</button>
          {editing && <button onClick={() => { setEditing(null); setForm({ slug: "", title: "", content_md: "", published: false }); }} className="btn-ghost text-xs">Cancel</button>}
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.slug} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm text-white">/{r.slug}</p>
              <p className="truncate text-xs text-zinc-500">{r.title}</p>
            </div>
            <StatusPill value={r.published ? "published" : "draft"} tone={r.published ? "green" : "gray"} />
            <div className="flex gap-1.5">
              <button onClick={() => toggle(r)} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">{r.published ? "Unpublish" : "Publish"}</button>
              <button onClick={() => edit(r)} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Edit</button>
              <ConfirmButton onConfirm={() => remove(r.slug)} confirmText="Delete?" className="btn-ghost !px-2.5 !py-1 text-xs hover:!text-accent">
                <span className="text-xs">Delete</span>
              </ConfirmButton>
            </div>
          </div>
        ))}
        {rows.length === 0 && <EmptyState text="No custom pages. Built-in About/Terms are used until you publish overrides." />}
      </div>
    </div>
  );
}
