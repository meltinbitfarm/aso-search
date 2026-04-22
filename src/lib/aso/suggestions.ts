import { SYNONYMS } from "./constants.js";
import type {
  AnalyzeResult,
  Grade,
  SuggestionBundle,
  SuggestionTip,
  TargetedKeyword,
} from "./types.js";

export function generateASOSuggestions(
  result: AnalyzeResult,
  allResults: AnalyzeResult[],
  appName?: string,
): SuggestionBundle {
  const rawKw = result.rawKeyword || result.keyword;
  const kwWords = rawKw.toLowerCase().split(/\s+/);
  const tips: SuggestionTip[] = [];

  // a) Title suggestion — pick best keyword as primary
  const best = [...allResults].sort((a, b) => b.opportunity - a.opportunity)[0];
  const bestKw = (best?.rawKeyword || best?.keyword || rawKw).toLowerCase();
  let primaryKw = bestKw;
  let modifier = "";

  const bestWords = bestKw.split(/\s+/);
  if (bestWords.length >= 3) {
    primaryKw = bestWords.slice(-2).join(" ");
    modifier = bestWords.slice(0, -2).join(" ");
  } else if (bestWords.length === 2) {
    primaryKw = bestKw;
    modifier = "";
  }

  const titleCase = (s: string) =>
    s
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  const primaryDisplay = titleCase(primaryKw);
  const suggestedTitle = appName?.trim()
    ? `${appName.trim()} - ${primaryDisplay}`
    : `[NomeApp] - ${primaryDisplay}`;

  const titleWords = new Set([
    ...(appName?.trim() ? appName.trim().toLowerCase().split(/\s+/) : []),
    ...primaryKw.split(/\s+/),
  ]);

  // b) Subtitle suggestion
  const subtitleCandidates: string[] = [];
  if (modifier) {
    modifier.split(/\s+/).forEach((w) => {
      if (!titleWords.has(w)) subtitleCandidates.push(w);
    });
  }
  result.relatedKeywords.forEach((rk) => {
    if (!titleWords.has(rk.word) && !subtitleCandidates.includes(rk.word)) {
      subtitleCandidates.push(rk.word);
    }
  });
  allResults.forEach((r) => {
    const rk = r.rawKeyword || r.keyword;
    rk.toLowerCase()
      .split(/\s+/)
      .forEach((w) => {
        if (w.length > 2 && !titleWords.has(w) && !subtitleCandidates.includes(w)) {
          subtitleCandidates.push(w);
        }
      });
  });
  kwWords.forEach((w) => {
    const syns = SYNONYMS[w];
    if (syns)
      syns.forEach((s) => {
        if (!titleWords.has(s) && !subtitleCandidates.includes(s)) subtitleCandidates.push(s);
      });
  });

  const subtitleWords: string[] = [];
  let subLen = 0;
  for (const w of subtitleCandidates) {
    const display = titleCase(w);
    const addLen = subLen === 0 ? display.length : display.length + 2;
    if (subLen + addLen > 30) break;
    subtitleWords.push(display);
    subLen += addLen;
  }
  const suggestedSubtitle = subtitleWords.join(", ");
  const subtitleWordsLower = subtitleWords.map((w) => w.toLowerCase());

  // c) Targeted keywords
  const targetedKeywords: TargetedKeyword[] = [];
  const primaryWords = primaryKw.split(/\s+/);
  targetedKeywords.push({ kw: primaryDisplay, type: "primaria - nel titolo" });
  subtitleWordsLower.forEach((sw) => {
    targetedKeywords.push({
      kw: titleCase(`${sw} ${primaryKw}`),
      type: "combinazione titolo+sottotitolo",
    });
  });
  subtitleWordsLower.forEach((sw) => {
    primaryWords.forEach((pw) => {
      const combo = titleCase(`${sw} ${pw}`);
      if (!targetedKeywords.some((t) => t.kw.toLowerCase() === combo.toLowerCase())) {
        targetedKeywords.push({ kw: combo, type: "combinazione sottotitolo" });
      }
    });
  });

  // d) Warnings and tips
  const overlap = subtitleWordsLower.filter((w) => titleWords.has(w));
  if (overlap.length > 0) {
    tips.push({
      type: "warning",
      text: `Non ripetere parole tra titolo e sottotitolo — "${overlap.join(
        ", ",
      )}" appare in entrambi. Può penalizzare il ranking.`,
    });
  }
  if (result.top10exact > 3) {
    tips.push({
      type: "warning",
      text: "Keyword satura nel top 10 — considera una variante più specifica.",
    });
  }
  if (result.top10strong <= 1) {
    tips.push({
      type: "tip",
      text: "Top 10 debole — con buon ASO e download velocity nella prima settimana puoi entrare rapidamente.",
    });
  }
  const lessCompetitive = result.relatedKeywords.filter((rk) => {
    const matchingResult = allResults.find((r) =>
      (r.rawKeyword || r.keyword).toLowerCase().includes(rk.word),
    );
    return matchingResult && matchingResult.opportunity > result.opportunity;
  });
  if (lessCompetitive.length > 0) {
    tips.push({
      type: "tip",
      text: `Considera di targettare anche: ${lessCompetitive
        .slice(0, 3)
        .map((k) => k.word)
        .join(", ")}`,
    });
  }

  return { suggestedTitle, suggestedSubtitle, targetedKeywords, tips };
}

export function getGrade(s: number): Grade {
  if (s >= 75) return { letter: "A", color: "#22c55e", bg: "#052e16", label: "Ottima opportunità" };
  if (s >= 60) return { letter: "B", color: "#84cc16", bg: "#1a2e05", label: "Buona opportunità" };
  if (s >= 45) return { letter: "C", color: "#eab308", bg: "#2e2005", label: "Competitiva" };
  if (s >= 30) return { letter: "D", color: "#f97316", bg: "#2e1505", label: "Molto competitiva" };
  return { letter: "F", color: "#ef4444", bg: "#2e0505", label: "Mercato saturo" };
}
