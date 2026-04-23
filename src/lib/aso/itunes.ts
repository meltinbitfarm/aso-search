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

// Mapping country → Apple Store Front header required by MZSearchHints.
// Format: "<storefront>-<type>,29" where 29 is the Software store.
// Without this header, the hints endpoint returns an empty array.
const STOREFRONTS: Record<string, string> = {
  us: "143441-1,29",
  gb: "143444-2,29",
  fr: "143442-3,29",
  de: "143443-4,29",
  ca: "143455-6,29",
  es: "143454-8,29",
  jp: "143462-9,29",
  au: "143460-10,29",
  it: "143450-15,29",
  br: "143503-20,29",
  nl: "143452-24,29",
  in: "143467-28,29",
};

function storefrontFor(country: string): string {
  return STOREFRONTS[country.toLowerCase()] ?? STOREFRONTS.us!;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parsePlistHints(xml: string): string[] {
  const re = /<key>\s*term\s*<\/key>\s*<string>([^<]*)<\/string>/g;
  const terms: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1]?.trim();
    if (raw) terms.push(decodeXml(raw));
  }
  return terms;
}

/**
 * Apple App Store autosuggest. Returns the suggested search terms for a prefix.
 * Uses the non-documented MZSearchHints endpoint which requires an
 * X-Apple-Store-Front header per country and returns plist XML.
 */
export async function itunesHints(term: string, country = "us"): Promise<string[]> {
  const u = new URL(`${ITUNES_HINTS_BASE}/WebObjects/MZSearchHints.woa/wa/hints`);
  u.searchParams.set("clientApplication", "Software");
  u.searchParams.set("term", term);
  u.searchParams.set("country", country);
  try {
    const res = await fetch(u.toString(), {
      dispatcher: agent,
      headers: {
        "X-Apple-Store-Front": storefrontFor(country),
        accept: "application/xml",
      },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text) return [];
    return parsePlistHints(text);
  } catch {
    return [];
  }
}
