/**
 * Text → Film persistence layer.
 *
 * - `film_links`          sandbox share links (name + secret token + quota)
 * - `film_projects`       every generated film, for the history panel
 * - `film_link_requests`  "give me more videos" requests shown to the admin
 *
 * SERVER ONLY — uses the service-role Supabase client, never import from a
 * client component.
 */

import { randomBytes } from "crypto";
import { createAdminSupabase } from "@/lib/supabase/server";

export const DEFAULT_LINK_QUOTA = 3;
export const DEFAULT_GRANT = 10;

export interface FilmLink {
  id: string;
  name: string;
  slug: string;
  token: string;
  label: string | null;
  enabled: boolean;
  max_films: number;
  used_films: number;
  created_at: string;
}

/** The safe subset handed to the public sandbox page. */
export interface FilmLinkPublic {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  max_films: number;
  used_films: number;
}

export interface FilmProjectSummary {
  id: string;
  title: string;
  brief: string;
  duration: number;
  model: string | null;
  ok: boolean;
  images_count: number;
  scenes_count: number;
  total_tokens: number;
  source: string;
  author: string | null;
  created_at: string;
}

export interface FilmProject extends FilmProjectSummary {
  html: string;
  plan: unknown;
  images: unknown;
}

export interface FilmLinkRequest {
  id: string;
  link_id: string;
  message: string | null;
  status: string;
  created_at: string;
  link_name: string | null;
  link_slug: string | null;
}

/** URL-safe slug for a display name (keeps Arabic letters, lowercases Latin). */
export function slugifyName(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "film";
}

/** Create a share link with a fresh secret token and a unique slug. */
export async function createFilmLink(opts: {
  name: string;
  label?: string | null;
  maxFilms?: number;
  createdBy?: string | null;
}): Promise<FilmLink> {
  const admin = createAdminSupabase();
  const name = opts.name.trim().slice(0, 60);
  const base = slugifyName(name);
  let slug = base;
  for (let i = 0; i < 40; i++) {
    const { data } = await admin.from("film_links").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${randomBytes(2).toString("hex")}`;
  }
  const maxFilms = Math.max(0, Math.min(Math.round(opts.maxFilms ?? DEFAULT_LINK_QUOTA), 1_000_000));
  const { data, error } = await admin
    .from("film_links")
    .insert({
      name,
      slug,
      token: randomBytes(4).toString("hex"),
      label: opts.label?.trim() || null,
      max_films: maxFilms,
      created_by: opts.createdBy ?? null,
    })
    .select("id,name,slug,token,label,enabled,max_films,used_films,created_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the link.");
  return data as FilmLink;
}

export async function listFilmLinks(limit = 200): Promise<FilmLink[]> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("film_links")
      .select("id,name,slug,token,label,enabled,max_films,used_films,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as FilmLink[];
  } catch {
    return [];
  }
}

/** Resolve a link by slug + token. Returns null when the token is wrong. */
export async function resolveFilmLink(slug: string, token: string): Promise<FilmLink | null> {
  if (!slug || !token) return null;
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("film_links")
      .select("id,name,slug,token,label,enabled,max_films,used_films,created_at")
      .eq("slug", slug.toLowerCase())
      .maybeSingle();
    const link = data as FilmLink | null;
    if (!link || link.token !== token) return null;
    return link;
  } catch {
    return null;
  }
}

export async function updateFilmLink(
  id: string,
  patch: { enabled?: boolean; addFilms?: number; label?: string | null }
): Promise<FilmLink | null> {
  const admin = createAdminSupabase();
  const current = await admin.from("film_links").select("max_films").eq("id", id).maybeSingle();
  if (!current?.data) return null;
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (typeof patch.label === "string" || patch.label === null) next.label = patch.label;
  if (typeof patch.addFilms === "number" && patch.addFilms !== 0) {
    next.max_films = Math.max(0, Math.min((current.data.max_films as number) + Math.round(patch.addFilms), 1_000_000));
  }
  const { data } = await admin
    .from("film_links")
    .update(next)
    .eq("id", id)
    .select("id,name,slug,token,label,enabled,max_films,used_films,created_at")
    .maybeSingle();
  return (data as FilmLink) ?? null;
}

export async function deleteFilmLink(id: string): Promise<void> {
  const admin = createAdminSupabase();
  await admin.from("film_links").delete().eq("id", id);
}

/**
 * Atomically spend one video credit. Uses an optimistic compare-and-set so two
 * concurrent requests can't both take the last credit. Returns the remaining
 * count after this call, or null when the link is exhausted/disabled.
 */
export async function consumeFilmCredit(linkId: string): Promise<{ ok: boolean; remaining: number; max: number }> {
  const admin = createAdminSupabase();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: cur } = await admin
      .from("film_links")
      .select("enabled,max_films,used_films")
      .eq("id", linkId)
      .maybeSingle();
    if (!cur || !cur.enabled) return { ok: false, remaining: 0, max: (cur?.max_films as number) ?? 0 };
    const max = cur.max_films as number;
    const used = cur.used_films as number;
    if (used >= max) return { ok: false, remaining: 0, max };
    const { data: upd } = await admin
      .from("film_links")
      .update({ used_films: used + 1, updated_at: new Date().toISOString() })
      .eq("id", linkId)
      .eq("used_films", used)
      .select("max_films,used_films")
      .maybeSingle();
    if (upd) return { ok: true, remaining: (upd.max_films as number) - (upd.used_films as number), max: upd.max_films as number };
  }
  return { ok: false, remaining: 0, max: 0 };
}

export interface SaveFilmProjectInput {
  title: string;
  brief: string;
  duration: number;
  plan: unknown;
  images: unknown;
  html: string;
  model: string | null;
  ok: boolean;
  imagesCount: number;
  scenesCount: number;
  totalTokens: number;
  source: "admin" | "sandbox";
  linkId?: string | null;
  author?: string | null;
  createdBy?: string | null;
}

/** Persist a generated film. Never throws — history must not break a run. */
export async function saveFilmProject(input: SaveFilmProjectInput): Promise<{ id: string } | null> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("film_projects")
      .insert({
        title: input.title.slice(0, 200),
        brief: input.brief.slice(0, 2000),
        duration: input.duration,
        plan: input.plan ?? null,
        images: input.images ?? null,
        html: input.html,
        model: input.model,
        ok: input.ok,
        images_count: input.imagesCount,
        scenes_count: input.scenesCount,
        total_tokens: input.totalTokens,
        source: input.source,
        link_id: input.linkId ?? null,
        author: input.author ?? null,
        created_by: input.createdBy ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return { id: (data as { id: string }).id };
  } catch {
    return null;
  }
}

export async function listFilmProjects(limit = 60): Promise<FilmProjectSummary[]> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("film_projects")
      .select("id,title,brief,duration,model,ok,images_count,scenes_count,total_tokens,source,author,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as FilmProjectSummary[];
  } catch {
    return [];
  }
}

export async function getFilmProject(id: string): Promise<FilmProject | null> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("film_projects").select("*").eq("id", id).maybeSingle();
    return (data as FilmProject) ?? null;
  } catch {
    return null;
  }
}

export async function deleteFilmProject(id: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.from("film_projects").delete().eq("id", id);
  } catch {
    /* ignore */
  }
}

/** A visitor asking for more quota. Deduplicated: one pending per link. */
export async function createFilmLinkRequest(linkId: string, message?: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("film_link_requests")
    .select("id")
    .eq("link_id", linkId)
    .eq("status", "pending")
    .maybeSingle();
  if (data) return;
  await admin.from("film_link_requests").insert({
    link_id: linkId,
    message: (message ?? "").slice(0, 500) || null,
    status: "pending",
  });
}

export async function listFilmLinkRequests(limit = 100): Promise<FilmLinkRequest[]> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("film_link_requests")
      .select("id,link_id,message,status,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    const rows = (data ?? []) as Omit<FilmLinkRequest, "link_name" | "link_slug">[];
    if (!rows.length) return [];
    const ids = Array.from(new Set(rows.map((r) => r.link_id)));
    const { data: links } = await admin.from("film_links").select("id,name,slug").in("id", ids);
    const byId = new Map((links ?? []).map((l) => [(l as { id: string }).id, l as { name: string; slug: string }]));
    return rows.map((r) => ({
      ...r,
      link_name: byId.get(r.link_id)?.name ?? null,
      link_slug: byId.get(r.link_id)?.slug ?? null,
    }));
  } catch {
    return [];
  }
}

/** Mark a request handled and (optionally) top the link's quota up. */
export async function handleFilmLinkRequest(
  requestId: string,
  grant = DEFAULT_GRANT
): Promise<void> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("film_link_requests").select("link_id").eq("id", requestId).maybeSingle();
  if (!data) return;
  if (grant !== 0) await updateFilmLink((data as { link_id: string }).link_id, { addFilms: grant, enabled: true });
  await admin
    .from("film_link_requests")
    .update({ status: "handled", handled_at: new Date().toISOString() })
    .eq("id", requestId);
}
