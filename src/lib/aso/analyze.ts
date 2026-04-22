import type { AnalyzeResult, ItunesApp, RelatedKeyword } from "./types.js";

export function analyzeResults(apps: ItunesApp[], keyword: string): AnalyzeResult | null {
  if (!apps.length) return null;
  const now = new Date();
  const valid = apps.filter((a) => a.userRatingCount > 0);
  const total = apps.length;
  const avgRev = valid.length
    ? valid.reduce((s, a) => s + a.userRatingCount, 0) / valid.length
    : 0;
  const maxRev = Math.max(...apps.map((a) => a.userRatingCount || 0), 1);
  const srt = [...valid].sort((a, b) => a.userRatingCount - b.userRatingCount);
  const medRev = srt.length ? srt[Math.floor(srt.length / 2)].userRatingCount : 0;
  const avgRat = valid.length
    ? valid.reduce((s, a) => s + a.averageUserRating, 0) / valid.length
    : 0;
  const ages = apps.map(
    (a) => (now.getTime() - new Date(a.currentVersionReleaseDate).getTime()) / 86400000,
  );
  const avgAge = ages.reduce((s, a) => s + a, 0) / ages.length;
  const kwLow = keyword.toLowerCase();
  const kwWords = kwLow.split(/\s+/);
  const nameAll = apps.filter((a) => a.trackName.toLowerCase().includes(kwLow)).length;

  const top10 = apps.slice(0, 10);
  const top10exact = top10.filter((a) => a.trackName.toLowerCase().includes(kwLow)).length;
  const top10strong = top10.filter((a) => a.userRatingCount >= 10000).length;

  const zombies = apps.filter((a) => a.userRatingCount === 0).length;
  const stale = apps.filter(
    (a) => (now.getTime() - new Date(a.currentVersionReleaseDate).getTime()) / 86400000 > 180,
  ).length;
  const paid = apps.filter((a) => a.price > 0);
  const monsters = valid.filter((a) => a.userRatingCount >= 50000).length;
  const strong = valid.filter(
    (a) => a.userRatingCount >= 10000 && a.userRatingCount < 50000,
  ).length;
  const medium = valid.filter(
    (a) => a.userRatingCount >= 1000 && a.userRatingCount < 10000,
  ).length;
  const weak = valid.filter((a) => a.userRatingCount >= 1 && a.userRatingCount < 1000).length;

  const sComp = Math.max(0, 100 - total * 1.2);
  const sStr =
    avgRev < 500 ? 90 : avgRev < 2000 ? 70 : avgRev < 10000 ? 45 : avgRev < 50000 ? 25 : 10;
  const sQual =
    avgRat < 3.5 ? 95 : avgRat < 4.0 ? 80 : avgRat < 4.5 ? 55 : avgRat < 4.7 ? 35 : 15;
  const sFresh =
    avgAge > 365 ? 90 : avgAge > 180 ? 70 : avgAge > 90 ? 50 : avgAge > 30 ? 30 : 15;
  const sSat = Math.max(0, 100 - (nameAll / Math.max(total, 1)) * 100);
  const sZomb = (zombies / Math.max(total, 1)) * 100;
  const sTop10 = Math.max(0, 100 - top10exact * 20);
  const top10withReviews = top10.filter((a) => a.userRatingCount >= 1000).length;
  const sTop10Den = Math.max(0, 100 - top10withReviews * 12);
  const monPen = monsters * 15 + strong * 5;
  const freeR = 1 - paid.length / Math.max(total, 1);

  const opp = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        sComp * 0.06 +
          sStr * 0.15 +
          sQual * 0.08 +
          sFresh * 0.10 +
          sSat * 0.06 +
          sZomb * 0.05 +
          sTop10 * 0.22 +
          sTop10Den * 0.13 +
          (freeR > 0.9 ? 20 : 10) * 0.05 -
          monPen * 0.10,
      ),
    ),
  );

  const stopW = new Set([
    "the", "a", "an", "and", "or", "for", "of", "in", "to", "my", "your", "app", "with",
    "&", "-", "–", "—", "|", "·",
  ]);
  const wf: Record<string, number> = {};
  apps.forEach((a) => {
    const ws = a.trackName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopW.has(w) && !kwWords.includes(w));
    const seen = new Set<string>();
    ws.forEach((w) => {
      if (!seen.has(w)) {
        wf[w] = (wf[w] || 0) + 1;
        seen.add(w);
      }
    });
  });
  const related: RelatedKeyword[] = Object.entries(wf)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));

  return {
    keyword,
    totalApps: total,
    validApps: valid.length,
    zombies,
    stale,
    avgReviews: Math.round(avgRev),
    medianReviews: medRev,
    maxReviews: maxRev,
    avgRating: avgRat.toFixed(2),
    avgAgeDays: Math.round(avgAge),
    nameMatches: nameAll,
    top10exact,
    top10strong,
    paidApps: paid.length,
    freeRatio: (freeR * 100).toFixed(0),
    distribution: { monsters, strong, medium, weak, zombies },
    opportunity: opp,
    scores: {
      competition: Math.round(sComp),
      strength: Math.round(sStr),
      quality: Math.round(sQual),
      freshness: Math.round(sFresh),
      saturation: Math.round(sSat),
      zombie: Math.round(sZomb),
      top10gap: Math.round(sTop10),
      top10density: Math.round(sTop10Den),
    },
    relatedKeywords: related,
    apps: apps
      .sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0))
      .slice(0, 20),
    timestamp: new Date().toISOString(),
  };
}
