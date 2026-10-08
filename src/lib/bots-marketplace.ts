import { createAdminSupabase } from "./supabase/server";
import { OFFICIAL_BOT_SLUGS, resolveNvidiaBotModel, toBot, type Bot } from "./bots";

export interface MarketBot extends Bot {
  owner: boolean;
  official: boolean;
  conversations: number;
  creator: string;
  favorite: boolean;
}

/** Display name for a bot owner (admin lookup, safe fallbacks). SERVER ONLY. */
export async function creatorName(ownerId: string, botSlug: string): Promise<string> {
  if (OFFICIAL_BOT_SLUGS.has(botSlug)) return "Human AI";
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("profiles").select("name,email").eq("id", ownerId).maybeSingle();
    const name = (data?.name ?? "").trim();
    if (name) return name;
    const email = (data?.email ?? "").trim();
    if (email) return email.split("@")[0];
  } catch {
    // ignore
  }
  return "Community";
}

function toMarket(
  row: Record<string, unknown> & { id: string; owner_id: string; slug: string },
  userId: string | null,
  counts: Map<string, number>,
  creators: Map<string, string>,
  favorites: Set<string>
): MarketBot {
  const bot = toBot(row);
  return {
    ...bot,
    owner: !!userId && row.owner_id === userId,
    official: OFFICIAL_BOT_SLUGS.has(row.slug),
    conversations: counts.get(row.id) ?? 0,
    creator: creators.get(row.owner_id) ?? "Community",
    favorite: favorites.has(row.id),
  };
}

/** Conversation counts per bot id (best effort). SERVER ONLY. */
export async function conversationCounts(botIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (botIds.length === 0) return counts;
  try {
    const admin = createAdminSupabase();
    // PostgREST has no group-by; one cheap query per bot, capped.
    await Promise.all(
      botIds.slice(0, 60).map(async (id) => {
        const { count } = await admin
          .from("bot_conversations")
          .select("id", { count: "exact", head: true })
          .eq("bot_id", id);
        counts.set(id, count ?? 0);
      })
    );
  } catch {
    // stats optional
  }
  return counts;
}

/**
 * Full marketplace listing. Sections are derived, never hardcoded:
 * featured (official, most chatted first), official, community (public),
 * mine (owned). Tolerant of missing migration columns/tables.
 * SERVER ONLY.
 */
export async function listMarketplace(userId: string | null): Promise<{
  featured: MarketBot[];
  official: MarketBot[];
  community: MarketBot[];
  mine: MarketBot[];
  favorites: MarketBot[];
}> {
  const empty = { featured: [], official: [], community: [], mine: [], favorites: [] } as {
    featured: MarketBot[];
    official: MarketBot[];
    community: MarketBot[];
    mine: MarketBot[];
    favorites: MarketBot[];
  };
  try {
    const admin = createAdminSupabase();
    const { data: rows, error } = await admin
      .from("bots")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error || !rows) return empty;

    // Visible = owned + public. Rows without a visibility column (pre-migration)
    // fall back to owned-only plus official slugs.
    const visible = (rows as (Record<string, unknown> & { id: string; owner_id: string; slug: string })[]).filter(
      (r) => {
        if (userId && r.owner_id === userId) return true;
        const vis = r.visibility;
        if (vis === "public") return true;
        if (vis === undefined && OFFICIAL_BOT_SLUGS.has(r.slug)) return true;
        return false;
      }
    );

    const ids = visible.map((r) => r.id);
    const counts = await conversationCounts(ids);
    const creators = new Map<string, string>();
    await Promise.all(
      [...new Set(visible.map((r) => r.owner_id))].slice(0, 60).map(async (oid) => {
        const sample = visible.find((r) => r.owner_id === oid);
        creators.set(oid, await creatorName(oid, sample?.slug ?? ""));
      })
    );
    let favorites = new Set<string>();
    if (userId) {
      try {
        const { data: favs } = await admin.from("bot_favorites").select("bot_id").eq("user_id", userId);
        favorites = new Set((favs ?? []).map((f) => String(f.bot_id)));
      } catch {
        // table may not exist yet
      }
    }

    const all = visible.map((r) => toMarket(r, userId, counts, creators, favorites));
    const official = all.filter((b) => b.official).sort((a, b) => b.conversations - a.conversations);
    const mine = userId ? all.filter((b) => b.owner) : [];
    const mineIds = new Set(mine.map((b) => b.id));
    const community = all.filter((b) => !b.official && !mineIds.has(b.id));
    const featured = [...official].sort((a, b) => b.conversations - a.conversations).slice(0, 3);
    const favoritesList = all.filter((b) => b.favorite);
    return { featured, official, community, mine, favorites: favoritesList };
  } catch {
    return empty;
  }
}

/** Profile stats for one bot: conversations, messages, saves. SERVER ONLY. */
export async function botStats(botId: string): Promise<{ conversations: number; messages: number; favorites: number }> {
  const stats = { conversations: 0, messages: 0, favorites: 0 };
  async function count(p: PromiseLike<{ count?: number | null }>): Promise<number> {
    try {
      const r = await p;
      return r?.count ?? 0;
    } catch {
      return 0;
    }
  }
  const admin = createAdminSupabase();
  const [convs, msgs, favs] = await Promise.all([
    count(
      admin.from("bot_conversations").select("id", { count: "exact", head: true }).eq("bot_id", botId)
    ),
    count(
      admin.from("bot_messages").select("id", { count: "exact", head: true }).eq("bot_id", botId)
    ),
    count(
      admin.from("bot_favorites").select("bot_id", { count: "exact", head: true }).eq("bot_id", botId)
    ),
  ]);
  stats.conversations = convs;
  stats.messages = msgs;
  stats.favorites = favs;
  return stats;
}

/** Capability chips for a profile page. SERVER ONLY. */
export async function botCapabilities(bot: Bot): Promise<string[]> {
  const caps: string[] = [];
  if (bot.tools.web_search) caps.push("Web Search");
  if (bot.memory_enabled) caps.push("Memory");
  if (bot.voice.stt_enabled) caps.push("Voice Input");
  if (bot.voice.tts_enabled) caps.push("Read Aloud");
  try {
    const model = await resolveNvidiaBotModel(bot.model_id);
    if (model.ok && model.vision) caps.push("Vision");
  } catch {
    // ignore
  }
  return caps;
}

/** Single marketplace bot by username (= slug): public, or owned when logged in. */
export async function getMarketplaceBot(
  slug: string,
  userId: string | null
): Promise<MarketBot | null> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.from("bots").select("*").eq("slug", slug).single();
    if (error || !data) return null;
    const row = data as Record<string, unknown> & { id: string; owner_id: string; slug: string };
    const owned = !!userId && row.owner_id === userId;
    const vis = row.visibility;
    const isPublic = vis === "public" || (vis === undefined && OFFICIAL_BOT_SLUGS.has(row.slug));
    if (!owned && !isPublic) return null;
    const counts = await conversationCounts([row.id]);
    const creators = new Map<string, string>([[row.owner_id, await creatorName(row.owner_id, row.slug)]]);
    let favorites = new Set<string>();
    if (userId) {
      try {
        const { data: fav } = await admin
          .from("bot_favorites")
          .select("bot_id")
          .eq("user_id", userId)
          .eq("bot_id", row.id)
          .maybeSingle();
        if (fav) favorites = new Set([row.id]);
      } catch {
        // ignore
      }
    }
    return toMarket(row, userId, counts, creators, favorites);
  } catch {
    return null;
  }
}
