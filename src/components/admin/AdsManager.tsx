"use client";

import { useEffect, useState } from "react";
import { StatusPill, ConfirmButton, EmptyState, useToast } from "@/components/admin/ui";
import { ImageUploadButton } from "@/components/admin/ImageUploadButton";

interface Ad {
  id: string; title: string; description: string; image_url: string | null;
  destination_url: string; placement: string; priority: number; active: boolean;
  starts_at: string | null; ends_at: string | null;
}

const EMPTY = { title: "", description: "", image_url: "", destination_url: "", placement: "chat", priority: 0, starts_at: "", ends_at: "" };

export function AdsManager() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const { show, ToastEl } = useToast();

  async function load() {
    const res = await fetch("/api/admin/ads");
    const j = await res.json();
    setAds(j.rows ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!form.title.trim()) {
      show("Title required.");
      return;
    }
    const method = editing ? "PUT" : "POST";
    try {
      const res = await fetch("/api/admin/ads", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editing ?? undefined, priority: Number(form.priority) || 0 }),
      });
      const j = await res.json().catch(() => null);
      show(res.ok ? "Saved." : (j?.error ?? `Server error (${res.status}).`));
      if (res.ok) {
        setForm(EMPTY);
        setEditing(null);
        load();
      }
    } catch {
      show("No response from server — is the dev server still running?");
    }
  }

  function edit(a: Ad) {
    setEditing(a.id);
    setForm({
      title: a.title, description: a.description ?? "", image_url: a.image_url ?? "",
      destination_url: a.destination_url ?? "", placement: a.placement ?? "chat",
      priority: a.priority ?? 0,
      starts_at: a.starts_at ? a.starts_at.slice(0, 16) : "",
      ends_at: a.ends_at ? a.ends_at.slice(0, 16) : "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    await fetch(`/api/admin/ads?id=${id}`, { method: "DELETE" });
    show("Deleted.");
    load();
  }

  async function toggle(a: Ad) {
    await fetch("/api/admin/ads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, active: !a.active }),
    });
    load();
  }

  const f = "input";
  return (
    <div className="space-y-4">
      {ToastEl}
      <div className="card grid gap-2 p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-white sm:col-span-2">{editing ? "Edit ad" : "New ad"}</h2>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={f} />
        <input value={form.destination_url} onChange={(e) => setForm({ ...form, destination_url: e.target.value })} placeholder="Destination URL" className={f} />
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className={`${f} sm:col-span-2`} />
        <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="Image URL (optional)" className={`${f} sm:col-span-2`} />
        <div className="flex items-center gap-2 sm:col-span-2">
          <ImageUploadButton label="Upload image" onUploaded={(url) => setForm({ ...form, image_url: url })} />
          {form.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.image_url} alt="Ad preview" className="h-10 w-10 rounded-lg border border-ink-700 object-cover" />
          )}
        </div>
        <input value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })} placeholder="Placement (chat)" className={f} />
        <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} placeholder="Priority" className={f} title="Higher shows first" />
        <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className={f} />
        <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className={f} />
        <div className="flex gap-2 sm:col-span-2">
          <button onClick={save} className="btn-primary text-xs">{editing ? "Save changes" : "Create ad"}</button>
          {editing && <button onClick={() => { setEditing(null); setForm(EMPTY); }} className="btn-ghost text-xs">Cancel</button>}
        </div>
      </div>

      <div className="space-y-2">
        {ads.map((a) => (
          <div key={a.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{a.title}</p>
              <p className="truncate text-xs text-zinc-500">{a.destination_url || "no URL"} · priority {a.priority}</p>
              <div className="mt-1.5"><StatusPill value={a.active ? "active" : "inactive"} tone={a.active ? "green" : "gray"} /></div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => toggle(a)} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">{a.active ? "Disable" : "Enable"}</button>
              <button onClick={() => edit(a)} className="btn-ghost !px-2.5 !py-1 text-xs border border-ink-700">Edit</button>
              <ConfirmButton onConfirm={() => remove(a.id)} confirmText="Delete?" className="btn-ghost !px-2.5 !py-1 text-xs hover:!text-accent">
                <span className="text-xs">Delete</span>
              </ConfirmButton>
            </div>
          </div>
        ))}
        {ads.length === 0 && <EmptyState text="No ads. Active ads appear beneath AI responses in chat." />}
      </div>
    </div>
  );
}
