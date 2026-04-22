import type { AnalyzeResult } from "./types.js";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Proxy del volume di domanda per la keyword (1-100).
 * Deriva da numero di app che rankano + volume medio di recensioni + leader heat.
 */
export function popularity(r: AnalyzeResult): number {
  const appsFactor = clamp(r.totalApps / 50, 0, 1);
  const revFactor = clamp(Math.log10(Math.max(r.avgReviews, 1)) / 5, 0, 1);
  const maxRevFactor = clamp(Math.log10(Math.max(r.maxReviews, 1)) / 6, 0, 1);
  const raw = 0.35 * appsFactor + 0.40 * revFactor + 0.25 * maxRevFactor;
  return Math.round(1 + 99 * raw);
}

/**
 * Quanto è difficile rankare per la keyword (1-100).
 * Deriva da forza competitiva media, densità del top-10, presenza di "monsters".
 */
export function difficulty(r: AnalyzeResult): number {
  const compStrength = 100 - r.scores.strength;
  const top10Dens = 100 - r.scores.top10density;
  const monsterPen = clamp(r.distribution.monsters * 12, 0, 60);
  const strongPen = clamp(r.distribution.strong * 4, 0, 25);
  const raw =
    0.40 * compStrength + 0.30 * top10Dens + 0.20 * monsterPen + 0.10 * strongPen;
  return Math.round(clamp(1 + raw, 1, 100));
}
