import fs from "node:fs";
import path from "node:path";

export interface DesignSkill {
  id: string;
  name: string;
  description: string;
  preview?: string;
  game: boolean;
}

const DIR = path.join(process.cwd(), "skills", "design");
const PREVIEW_DIR = path.join(process.cwd(), "public", "skills");
const MAX_CHARS = 6000;
const GAME_SKILL_IDS = new Set([
  "cyberpunk",
  "minimal-dark",
  "neon-arcade",
  "pixel-retro",
  "retro-terminal",
  "space-scifi",
  "synthwave",
]);

let cache: DesignSkill[] | null = null;

function parseFile(file: string): DesignSkill | null {
  const id = file.replace(/\.md$/, "");
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) return null;
  try {
    const raw = fs.readFileSync(path.join(DIR, file), "utf8");
    const fm = /^---\s*\n([\s\S]*?)\n---/.exec(raw);
    let name = id;
    let description = "";
    let preview = fs.existsSync(path.join(PREVIEW_DIR, `${id}.png`)) ? `/skills/${id}.png` : undefined;
    if (fm) {
      const n = /^name:\s*(.+)$/m.exec(fm[1]);
      const d = /^description:\s*(.+)$/m.exec(fm[1]);
      const p = /^preview:\s*(.+)$/m.exec(fm[1]);
      if (n) name = n[1].trim().slice(0, 60);
      if (d) description = d[1].trim().slice(0, 160);
      if (p && /^\/[A-Za-z0-9._\-\/]{1,120}$/.test(p[1].trim())) preview = p[1].trim();
    } else {
      // No frontmatter — extract name from H1 and description from **Purpose** line
      const h1 = /^#\s+(.+)$/m.exec(raw);
      if (h1) name = h1[1].trim().slice(0, 60);
      // Try **Purpose**: line
      const purpose = /\*\*Purpose\*\*:\s*(.+)/i.exec(raw);
      if (purpose) {
        description = purpose[1].trim().slice(0, 160);
      } else {
        // Fall back to first non-empty, non-heading line
        const firstLine = raw.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("**Purpose"));
        if (firstLine) description = firstLine.trim().slice(0, 160);
      }
    }
    return { id, name, description, preview, game: GAME_SKILL_IDS.has(id) };
  } catch {
    return null;
  }
}

/**
 * Design skills = Claude-style SKILL.md files in skills/design/.
 * Drop any compatible skill file (e.g. from GitHub) in that folder —
 * it appears in the builder picker automatically, no code change.
 */
export function listDesignSkills(): DesignSkill[] {
  if (cache) return cache;
  try {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md"));
    cache = files.map(parseFile).filter((s): s is DesignSkill => !!s);
  } catch {
    cache = [];
  }
  return cache;
}

/** Full skill text for prompt injection (capped). Null when unknown. */
export function getSkillContent(id: unknown): string | null {
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) return null;
  try {
    const raw = fs.readFileSync(path.join(DIR, `${id}.md`), "utf8");
    const body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "").trim();
    if (!body) return null;
    return body.slice(0, MAX_CHARS);
  } catch {
    return null;
  }
}
