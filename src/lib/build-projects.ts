import { createAdminSupabase } from "./supabase/server";

export interface BuildProject {
  id: string;
  user_id: string;
  title: string;
  brief: string;
  status: string;
  files: { path: string; content: string }[];
  sandbox_id: string;
  preview_url: string;
  subdomain: string;
  created_at: string;
  updated_at: string;
}

export function projectUrl(userId: string, email: string, projectId: string, ...segments: string[]): string {
  const base = `/build/${userId}/${encodeURIComponent(email || "user")}/${projectId}`;
  const cleaned = segments.map((s) => s.replace(/^\/+|\/+$/g, "")).filter(Boolean);
  const path = [base, ...cleaned].join("/");
  return `${path}/`;
}

/** Shared, extensible list of a project's links. Add future links here! */
export interface ProjectLink {
  key: string;
  label: string;
  segment: string; // path after the project base, "" for overview
  href: string;
  description: string;
}

export function projectLinks(userId: string, email: string, projectId: string): ProjectLink[] {
  const base = projectUrl(userId, email, projectId).replace(/\/$/, "");
  const mk = (key: string, label: string, segment: string, description: string): ProjectLink => ({
    key,
    label,
    segment,
    href: segment ? `${base}/${segment}` : `${base}/`,
    description,
  });
  // Keep this list in sync with the routes under src/app/build/[userId]/[email]/[projectId]/.
  // To add a new link, add an entry here AND a page under that route.
  const items: ProjectLink[] = [
    mk("overview", "Overview", "", "Project home, live status & file tree"),
    mk("deploy", "Deploy", "deploy", "Publish to https://<name>.usehuman.de"),
    mk("preview", "Preview", "preview", "Full interactive preview"),
    mk("settings", "Settings", "settings", "Project settings & API keys"),
    mk("settings-edit", "Edit project", "settings/edit", "Rename the project or update brief"),
    mk("settings-api-key", "API Keys", "settings/set-my-api-key", "Manage build API tokens"),
  ];
  return items;
}

/** Server-side: load a project that belongs to this user (null otherwise). */
export async function getOwnProject(userId: string, projectId: string): Promise<BuildProject | null> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("build_projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data as BuildProject;
  } catch {
    return null;
  }
}
