import { fetch, Agent } from "undici";
import type { ItunesApp } from "./types.js";

const ITUNES_BASE = process.env.ITUNES_BASE ?? "https://itunes.apple.com";
const ITUNES_HINTS_BASE =
  process.env.ITUNES_HINTS_BASE ?? "https://search.itunes.apple.com";

const agent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 16,
});

export class ItunesError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly upstream?: unknown,
  ) {
    super(message);
    this.name = "ItunesError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { dispatcher: agent, headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new ItunesError(`iTunes responded ${res.status} for ${url}`, res.status);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new ItunesError(`iTunes returned invalid JSON for ${url}`, 502, e);
  }
}

interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesApp[];
}

export async function searchItunes(
  term: string,
  country = "us",
  limit = 50,
): Promise<ItunesApp[]> {
  const u = new URL(`${ITUNES_BASE}/search`);
  u.searchParams.set("term", term);
  u.searchParams.set("country", country);
  u.searchParams.set("entity", "software");
  u.searchParams.set("limit", String(Math.max(1, Math.min(200, limit))));
  const data = await getJson<ItunesSearchResponse>(u.toString());
  return data.results ?? [];
}

export async function lookupItunes(
  appId: string,
  country = "us",
): Promise<ItunesApp | null> {
  const u = new URL(`${ITUNES_BASE}/lookup`);
  u.searchParams.set("id", appId);
  u.searchParams.set("country", country);
  const data = await getJson<ItunesSearchResponse>(u.toString());
  return data.results?.[0] ?? null;
}

interface ItunesHintsResponse {
  hints?: Array<{ term: string; displayTerm?: string; priority?: number }>;
}

export async function itunesHints(term: string, country = "us"): Promise<string[]> {
  const u = new URL(`${ITUNES_HINTS_BASE}/WebObjects/MZSearchHints.woa/wa/hints`);
  u.searchParams.set("clientApplication", "Software");
  u.searchParams.set("term", term);
  u.searchParams.set("country", country);
  try {
    const data = await getJson<ItunesHintsResponse>(u.toString());
    const hints = data.hints ?? [];
    return hints
      .map((h) => h.displayTerm || h.term)
      .filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}
