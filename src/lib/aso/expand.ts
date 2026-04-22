import { SUFFIXES, SYNONYMS } from "./constants.js";

export function expandKeyword(kw: string): string[] {
  const b = kw.toLowerCase().trim();
  const ws = b.split(/\s+/);
  const v = new Set<string>();
  SUFFIXES.forEach((s) => {
    if (!b.includes(s)) v.add(`${b} ${s}`);
  });
  ws.forEach((w) => {
    const sy = SYNONYMS[w];
    if (sy) sy.forEach((s) => v.add(b.replace(w, s)));
  });
  if (ws.length === 2) v.add(`${ws[1]} ${ws[0]}`);
  v.delete(b);
  return Array.from(v).slice(0, 15);
}
