const API_URL = "https://api.langsearch.com/v1/web-search";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/** Built-in web search is available when the server holds a LangSearch key. */
export function isSearchEnabled(): boolean {
  return !!process.env.LANGSEARCH_API_KEY;
}

export const WEB_SEARCH_TOOL = {
  name: "web_search",
  description:
    "Search the live web for current information (news, prices, docs, recent events, anything beyond training data). QUERY RULES (strict): pass ONLY a short keyword query, 2-8 words, preferably English — NEVER the raw user message, NEVER instructions like 'search the web' or 'suche im web'. Example: user asks 'suche im web was ist barada ai' → query 'Barada AI barada.cloud'. Returns titles, URLs and snippets — always cite source URLs in the answer.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Clean keyword query, 2-8 words, preferably English" },
      count: { type: "number", description: "Results, 1-10 (default 5)" },
    },
    required: ["query"],
  },
};

/** Strip instruction wrappers models sometimes include ("search the web for X"). */
function cleanQuery(q: string): string {
  const stripped = q
    .trim()
    .replace(/^(bitte\s+)?(suche(\s+im\s+web|\s+mal)?|search(\s+the\s+web)?(\s+for)?|google(\s+mal)?|find|look\s+up)\s+(nach\s+|for\s+|about\s+)?/i, "")
    .replace(/\s+(bitte|please)\.?$/i, "")
    .trim();
  return stripped.length >= 2 ? stripped : q.trim();
}

/** Server-side only — key never leaves the server. Throws on failure. */
export async function webSearch(query: string, count = 5): Promise<string> {
  const apiKey = process.env.LANGSEARCH_API_KEY;
  if (!apiKey) throw new Error("Web search is not configured on the server.");
  const q = cleanQuery(query).slice(0, 500);
  if (!q) throw new Error("Empty search query.");
  const n = Math.min(10, Math.max(1, Math.round(count) || 5));
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, count: n }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Web search failed (${res.status}).`);
  }
  const j = (await res.json()) as {
    data?: { webPages?: { value?: { name?: string; url?: string; snippet?: string }[] } };
  };
  const vals = j?.data?.webPages?.value ?? [];
  if (vals.length === 0) return "No web results found.";
  const lines = vals.slice(0, n).map((v, i) => {
    const title = String(v.name ?? "Untitled").slice(0, 150);
    const url = String(v.url ?? "");
    const snippet = String(v.snippet ?? "").slice(0, 500);
    return `[${i + 1}] ${title}\nURL: ${url}\n${snippet}`;
  });
  return lines.join("\n\n").slice(0, 6000);
}
