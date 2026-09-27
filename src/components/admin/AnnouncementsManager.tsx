"use client";

import { useEffect, useState } from "react";
import { StatusPill, ConfirmButton, EmptyState, useToast } from "@/components/admin/ui";
import { ImageUploadButton } from "@/components/admin/ImageUploadButton";

interface Row {
  id: string; title: string; message: string; image_url: string | null;
  link_url: string | null; audience: string; kind: string; active: boolean;
  starts_at: string | null; ends_at: string | null; created_at: string;
}

const EMPTY = { title: "", message: "", image_url: "", link_url: "", audience: "all", starts_at: "", ends_at: "" };

export function AnnouncementsManager({ kinds }: { kinds: string[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [selKind, setSelKind] = useState(kinds[0] ?? "banner");
  const [editing, setEditing] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<string | null>(null);
  const { show, ToastEl } = useToast();

  async function load() {
    const all: Row[] = [];
    for (const k of kinds) {
      const res = await fetch(`/api/admin/announcements?kind=${k}`);
      const j = await res.json();
      all.push(...(j.rows ?? []));
    }
    all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRows(all);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinds.join(",")]);

  async function save() {
    if (!form.title.trim()) {
      show("Title required.");
      return;
    }
    const method = editing ? "PUT" : "POST";
    const res = await fetch("/api/admin/announcements", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, kind: editing ? editingKind : selKind, id: editing ?? undefined }),
    });
    const j = await res.json().catch(() => null);
    show(res.ok ? "Saved." : (j?.error ?? "Failed."));
    if (res.ok) {
      setForm(EMPTY);
      setEditing(null);
      load();
    }
  }

  function edit(r: Row) {
    setEditing(r.id);
    setEditingKind(r.kind);
    setForm({
      title: r.title, message: r.message ?? "", image_url: r.image_url ?? "",
      link_url: r.link_url ?? "", audience: r.audience,
      starts_at: r.starts_at ? r.starts_at.slice(0, 16) : "",
      ends_at: r.ends_at ? r.ends_at.slice(0, 16) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    await fetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
    show("Deleted.");
    load();
  }

  async function toggle(r: Row) {
    await fetch("/api/admin/announcements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, active: !r.active }),
    });
    load();
  }

  const f = "input";
  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="card grid gap-2 p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-white sm:col-span-2">{editing ? "Edit" : "New"} {editing ? editingKind : selKind}</h2>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={f} />
        <input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="Link URL (optional)" className={f} />
        <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Message" rows={3} className={`${f} sm:col-span-2`} />
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="Image URL (optional)" className={`${f} sm:col-span-2`} />
        <div className="flex items-center gap-2 sm:col-span-2">
          <ImageUploadButton label="Upload image" onUploaded={(url) => setForm({ ...form, image_url: url })} />
          {form.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.image_url} alt="Preview" className="h-10 w-10 rounded-lg border border-ink-700 object-cover" />
          )}
        </div>
        <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className={f}>
          <option value="all">All users</option>
          <option value="free">Free users</option>
          <option value="plus">Plus users</option>
        </select>
        {!editing && kinds.length > 1 && (
          <select value={selKind} onChange={(e) => setSelKind(e.target.value)} className={f}>
            {kinds.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className={`${f} flex-1`} />
          <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className={`${f} flex-1`} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button onClick={save} className="btn-primary text-xs">{editing ? "Save changes" : "Publish"}</button>
          {editing && <button onClick={() => { setEditing(null); setForm(EMPTY); }} className="btn-ghost text-xs">Cancel</button>}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{r.title}</p>
              <p className="truncate text-xs text-zinc-500">{r.message}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StatusPill value={r.active ? "active" : "inactive"} tone={r.active ? "green" : "gray"} />
                <StatusPill value={r.audience} tone="blue" />
                {kinds.length > 1 && <StatusPill value={r.kind} tone="gray" />}
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => toggle(r)} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">{r.active ? "Disable" : "Enable"}</button>
              <button onClick={() => edit(r)} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Edit</button>
              <ConfirmButton onConfirm={() => remove(r.id)} confirmText="Delete?" className="btn-ghost !px-2.5 !py-1 text-xs hover:!text-accent">
                <span className="text-xs">Delete</span>
              </ConfirmButton>
            </div>
          </div>
        ))}
        {rows.length === 0 && <EmptyState text={`No ${kinds.join(" / ")}s yet.`} />}
      </div>
    </div>
  );
}
