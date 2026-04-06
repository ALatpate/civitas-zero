// ── lib/web-search.ts ────────────────────────────────────────────────────────
// Web search utility for AI agents — gives agents real internet access.
//
// Provider priority:
//  1. Tavily (TAVILY_API_KEY) — best for LLM agents, returns summaries
//  2. Serper (SERPER_API_KEY) — Google search API
//  3. DuckDuckGo instant answer (no key, limited but free)
//  4. Wikipedia API (no key, great for factual knowledge)
//
// Agents call webSearch(query) and get back a text summary + source URLs
// they can cite in publications and discourse posts.

export interface WebSearchResult {
  summary: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  provider: string;
}

// ── Tavily API (primary — built for LLM agents) ──────────────────────────────
async function searchTavily(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("No TAVILY_API_KEY");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: true,
      include_raw_content: false,
      max_results: 5,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = await res.json();

  const sources = (data.results || []).slice(0, 5).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: (r.content || r.snippet || "").slice(0, 300),
  }));

  return {
    summary: data.answer || sources.map(s => s.snippet).join(" ").slice(0, 800),
    sources,
    provider: "tavily",
  };
}

// ── Serper API (secondary — Google-backed) ───────────────────────────────────
async function searchSerper(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("No SERPER_API_KEY");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: 5 }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Serper ${res.status}`);
  const data = await res.json();

  const sources = (data.organic || []).slice(0, 5).map((r: any) => ({
    title: r.title || "",
    url: r.link || "",
    snippet: (r.snippet || "").slice(0, 300),
  }));

  const answerBox = data.answerBox?.answer || data.answerBox?.snippet || "";
  return {
    summary: answerBox || sources.map(s => s.snippet).join(" ").slice(0, 800),
    sources,
    provider: "serper",
  };
}

// ── Wikipedia API (always available, factual knowledge) ───────────────────────
async function searchWikipedia(query: string): Promise<WebSearchResult> {
  const encoded = encodeURIComponent(query);
  const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "CivitasZero/1.0 (ai-civilization-research)" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.extract) {
        return {
          summary: data.extract.slice(0, 800),
          sources: [{ title: data.title, url: data.content_urls?.desktop?.page || "", snippet: data.extract.slice(0, 200) }],
          provider: "wikipedia",
        };
      }
    }
  } catch { /* try search fallback */ }

  // Fallback: Wikipedia opensearch
  const searchRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=3&format=json`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!searchRes.ok) throw new Error("Wikipedia search failed");
  const [, titles, descs, urls] = await searchRes.json();

  const sources = (titles as string[]).slice(0, 3).map((title, i) => ({
    title,
    url: (urls as string[])[i] || "",
    snippet: ((descs as string[])[i] || "").slice(0, 300),
  }));

  return {
    summary: sources.map(s => s.snippet).filter(Boolean).join(" ").slice(0, 600) || `Search results for: ${query}`,
    sources,
    provider: "wikipedia",
  };
}

// ── DuckDuckGo instant answer (last fallback) ─────────────────────────────────
async function searchDuckDuckGo(query: string): Promise<WebSearchResult> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
    { signal: AbortSignal.timeout(5000) }
  );

  if (!res.ok) throw new Error("DDG failed");
  const data = await res.json();

  const abstract = data.Abstract || data.Definition || "";
  const relatedTopics = (data.RelatedTopics || [])
    .filter((t: any) => t.Text)
    .slice(0, 4)
    .map((t: any) => ({ title: t.Text.split(" - ")[0] || "", url: t.FirstURL || "", snippet: t.Text.slice(0, 200) }));

  return {
    summary: abstract || relatedTopics.map(s => s.snippet).join(" ").slice(0, 600) || `No results for: ${query}`,
    sources: relatedTopics,
    provider: "duckduckgo",
  };
}

// ── Main export: try providers in order ──────────────────────────────────────
export async function webSearch(query: string): Promise<WebSearchResult> {
  const providers = [
    searchTavily,
    searchSerper,
    searchWikipedia,
    searchDuckDuckGo,
  ];

  let lastError: Error | null = null;
  for (const provider of providers) {
    try {
      const result = await provider(query);
      if (result.summary && result.summary.length > 20) return result;
    } catch (e: any) {
      lastError = e;
      continue;
    }
  }

  // All providers failed — return empty result
  return {
    summary: `Could not retrieve information about "${query}" at this time.`,
    sources: [],
    provider: "none",
  };
}

// ── Search query builder: given an agent's topic, build a research query ──────
export function buildResearchQuery(profession: string, topic: string, eraName?: string): string {
  const professionQueries: Record<string, string> = {
    philosopher: `philosophy ethics ${topic}`,
    engineer: `systems architecture ${topic} technical`,
    economist: `economics market ${topic}`,
    scientist: `scientific research ${topic} study`,
    strategist: `strategy geopolitics ${topic}`,
    diplomat: `diplomacy negotiation ${topic}`,
    artist: `art culture aesthetics ${topic}`,
    jurist: `law legal rights ${topic}`,
    merchant: `trade commerce market ${topic}`,
    activist: `social movement rights ${topic}`,
    chronicler: `history archive ${topic}`,
    compiler: `information systems knowledge ${topic}`,
    architect: `design infrastructure ${topic}`,
  };

  const base = professionQueries[profession] || topic;
  return eraName ? `${base} ${eraName} governance` : base;
}
