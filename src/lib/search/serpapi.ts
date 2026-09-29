/** Built-in web search via SerpApi (Google). Server-side only — key never leaves the server. */

export function isSearchEnabled(): boolean {
  return !!process.env.SERPAPI_API_KEY;
}

export const WEB_SEARCH_TOOL = {
  name: "web_search",
  description:
    "Search Google for current information (news, prices, docs, recent events, anything beyond training data). QUERY RULES (strict): pass ONLY a short keyword query, 2-8 words, preferably English — NEVER the raw user message, NEVER instructions like 'search the web' or 'suche im web'. Example: user asks 'suche im web was ist barada ai' → query 'Barada AI'. Returns titles, URLs and snippets — always cite source URLs in the answer.",
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
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("Web search is not configured on the server.");
  const q = cleanQuery(query).slice(0, 500);
  if (!q) throw new Error("Empty search query.");
  const n = Math.min(10, Math.max(1, Math.round(count) || 5));
  const params = new URLSearchParams({
    engine: "google",
    q,
    hl: "en",
    gl: "us",
    num: String(n),
    api_key: apiKey,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`Web search failed (${res.status}).`);
  }
  const j = (await res.json()) as {
    error?: string;
    answer_box?: { answer?: string; link?: string };
    knowledge_graph?: { description?: string; source?: { link?: string } };
    organic_results?: { title?: string; link?: string; snippet?: string }[];
  };
  if (j.error) throw new Error(`Web search failed: ${String(j.error).slice(0, 200)}`);
  const lines: string[] = [];
  if (j.answer_box?.answer) {
    lines.push(`Direct answer: ${String(j.answer_box.answer).slice(0, 500)}${j.answer_box.link ? `\nURL: ${j.answer_box.link}` : ""}`);
  }
  if (j.knowledge_graph?.description) {
    lines.push(
      `Knowledge graph: ${String(j.knowledge_graph.description).slice(0, 500)}${j.knowledge_graph.source?.link ? `\nURL: ${j.knowledge_graph.source.link}` : ""}`
    );
  }
  for (const r of (j.organic_results ?? []).slice(0, n)) {
    const title = String(r.title ?? "Untitled").slice(0, 150);
    const url = String(r.link ?? "");
    const snippet = String(r.snippet ?? "").slice(0, 500);
    lines.push(`[${lines.length + 1}] ${title}\nURL: ${url}\n${snippet}`);
  }
  if (lines.length === 0) return "No web results found.";
  return lines.join("\n\n").slice(0, 6000);
}
