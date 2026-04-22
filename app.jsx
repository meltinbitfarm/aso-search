import { useState, useCallback } from "react";

const ITUNES_API = "https://itunes.apple.com/search";
const COUNTRIES = [
  { code: "us", flag: "🇺🇸", name: "US" }, { code: "gb", flag: "🇬🇧", name: "UK" }, { code: "it", flag: "🇮🇹", name: "IT" },
  { code: "de", flag: "🇩🇪", name: "DE" }, { code: "fr", flag: "🇫🇷", name: "FR" }, { code: "es", flag: "🇪🇸", name: "ES" },
  { code: "jp", flag: "🇯🇵", name: "JP" }, { code: "br", flag: "🇧🇷", name: "BR" }, { code: "au", flag: "🇦🇺", name: "AU" },
  { code: "ca", flag: "🇨🇦", name: "CA" }, { code: "nl", flag: "🇳🇱", name: "NL" }, { code: "in", flag: "🇮🇳", name: "IN" },
];
const SUFFIXES = ["app","tracker","manager","planner","log","buddy","assistant","tool","helper","diary"];
const SYNONYMS = {
  expense:["spending","cost","money","budget","finance"], tracker:["manager","planner","log","diary","monitor"],
  budget:["money","finance","saving","expense"], voice:["audio","sound","speech","recording"],
  notes:["memo","journal","diary","notebook"], minimal:["simple","clean","lite","easy"],
  health:["wellness","fitness","medical","care"], habit:["routine","daily","streak","goal"],
  todo:["task","checklist","planner","organizer"], photo:["camera","picture","image","snap"],
  workout:["exercise","fitness","gym","training"], sleep:["rest","bedtime","nap","dream"],
  meditation:["mindfulness","calm","zen","relax"], water:["hydration","drink","aqua"],
  food:["meal","recipe","diet","nutrition"],
};
const mono = "'JetBrains Mono', monospace";
const sans = "'IBM Plex Sans', -apple-system, sans-serif";

// --- ANALYSIS ---
function analyzeResults(apps, keyword) {
  if (!apps.length) return null;
  const now = new Date();
  const valid = apps.filter(a => a.userRatingCount > 0);
  const total = apps.length;
  const avgRev = valid.length ? valid.reduce((s,a) => s + a.userRatingCount, 0) / valid.length : 0;
  const maxRev = Math.max(...apps.map(a => a.userRatingCount || 0), 1);
  const srt = [...valid].sort((a,b) => a.userRatingCount - b.userRatingCount);
  const medRev = srt.length ? srt[Math.floor(srt.length/2)].userRatingCount : 0;
  const avgRat = valid.length ? valid.reduce((s,a) => s + a.averageUserRating, 0) / valid.length : 0;
  const ages = apps.map(a => (now - new Date(a.currentVersionReleaseDate)) / 86400000);
  const avgAge = ages.reduce((s,a) => s+a, 0) / ages.length;
  const kwLow = keyword.toLowerCase();
  const kwWords = kwLow.split(/\s+/);
  const nameAll = apps.filter(a => a.trackName.toLowerCase().includes(kwLow)).length;

  // NEW: exact match in top 10 vs top 50
  const top10 = apps.slice(0, 10);
  const top10exact = top10.filter(a => a.trackName.toLowerCase().includes(kwLow)).length;
  const top10strong = top10.filter(a => a.userRatingCount >= 10000).length;

  const zombies = apps.filter(a => a.userRatingCount === 0).length;
  const stale = apps.filter(a => (now - new Date(a.currentVersionReleaseDate)) / 86400000 > 180).length;
  const paid = apps.filter(a => a.price > 0);
  const monsters = valid.filter(a => a.userRatingCount >= 50000).length;
  const strong = valid.filter(a => a.userRatingCount >= 10000 && a.userRatingCount < 50000).length;
  const medium = valid.filter(a => a.userRatingCount >= 1000 && a.userRatingCount < 10000).length;
  const weak = valid.filter(a => a.userRatingCount >= 1 && a.userRatingCount < 1000).length;

  const sComp = Math.max(0, 100 - total * 1.2);
  const sStr = avgRev < 500 ? 90 : avgRev < 2000 ? 70 : avgRev < 10000 ? 45 : avgRev < 50000 ? 25 : 10;
  const sQual = avgRat < 3.5 ? 95 : avgRat < 4.0 ? 80 : avgRat < 4.5 ? 55 : avgRat < 4.7 ? 35 : 15;
  const sFresh = avgAge > 365 ? 90 : avgAge > 180 ? 70 : avgAge > 90 ? 50 : avgAge > 30 ? 30 : 15;
  const sSat = Math.max(0, 100 - (nameAll / Math.max(total,1)) * 100);
  const sZomb = (zombies / Math.max(total,1)) * 100;
  // NEW: top10 exact match penalty/bonus
  const sTop10 = Math.max(0, 100 - top10exact * 20); // fewer exact matches in top10 = better
  const top10withReviews = top10.filter(a => a.userRatingCount >= 1000).length;
  const sTop10Den = Math.max(0, 100 - top10withReviews * 12); // fewer strong apps in top10 = weaker competition
  const monPen = monsters * 15 + strong * 5;
  const freeR = 1 - paid.length / Math.max(total,1);

  const opp = Math.min(100, Math.max(0, Math.round(
    sComp * 0.06 + sStr * 0.15 + sQual * 0.08 + sFresh * 0.10 + sSat * 0.06 + sZomb * 0.05 + sTop10 * 0.22 + sTop10Den * 0.13 + (freeR > 0.9 ? 20 : 10) * 0.05 - monPen * 0.10
  )));

  const stopW = new Set(["the","a","an","and","or","for","of","in","to","my","your","app","with","&","-","–","—","|","·"]);
  const wf = {};
  apps.forEach(a => {
    const ws = a.trackName.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w => w.length > 2 && !stopW.has(w) && !kwWords.includes(w));
    const seen = new Set();
    ws.forEach(w => { if (!seen.has(w)) { wf[w] = (wf[w]||0)+1; seen.add(w); }});
  });
  const related = Object.entries(wf).filter(([,c]) => c >= 2).sort((a,b) => b[1]-a[1]).slice(0,12).map(([word,count]) => ({word,count}));

  return {
    keyword, totalApps: total, validApps: valid.length, zombies, stale,
    avgReviews: Math.round(avgRev), medianReviews: medRev, maxReviews: maxRev,
    avgRating: avgRat.toFixed(2), avgAgeDays: Math.round(avgAge),
    nameMatches: nameAll, top10exact, top10strong,
    paidApps: paid.length, freeRatio: (freeR*100).toFixed(0),
    distribution: { monsters, strong, medium, weak, zombies },
    opportunity: opp,
    scores: { competition: Math.round(sComp), strength: Math.round(sStr), quality: Math.round(sQual), freshness: Math.round(sFresh), saturation: Math.round(sSat), zombie: Math.round(sZomb), top10gap: Math.round(sTop10), top10density: Math.round(sTop10Den) },
    relatedKeywords: related,
    apps: apps.sort((a,b) => (b.userRatingCount||0) - (a.userRatingCount||0)).slice(0,20),
    timestamp: new Date().toISOString(),
  };
}

function expandKeyword(kw) {
  const b = kw.toLowerCase().trim(), ws = b.split(/\s+/), v = new Set();
  SUFFIXES.forEach(s => { if (!b.includes(s)) v.add(`${b} ${s}`); });
  ws.forEach(w => { const sy = SYNONYMS[w]; if (sy) sy.forEach(s => v.add(b.replace(w,s))); });
  if (ws.length === 2) v.add(`${ws[1]} ${ws[0]}`);
  v.delete(b);
  return Array.from(v).slice(0,15);
}

function generateASOSuggestions(result, allResults, appName) {
  const rawKw = result.rawKeyword || result.keyword;
  const kwWords = rawKw.toLowerCase().split(/\s+/);
  const tips = [];

  // a) Title suggestion — pick best keyword as primary
  const best = [...allResults].sort((a, b) => b.opportunity - a.opportunity)[0];
  const bestKw = (best?.rawKeyword || rawKw).toLowerCase();
  let primaryKw = bestKw;
  let modifier = "";

  // If multi-word, split into generic core + modifier
  const bestWords = bestKw.split(/\s+/);
  if (bestWords.length >= 3) {
    // last 2 words are the generic core (e.g. "expense tracker"), first words are modifiers
    primaryKw = bestWords.slice(-2).join(" ");
    modifier = bestWords.slice(0, -2).join(" ");
  } else if (bestWords.length === 2) {
    primaryKw = bestKw;
    modifier = "";
  }

  const titleCase = s => s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const primaryDisplay = titleCase(primaryKw);
  const suggestedTitle = appName?.trim()
    ? `${appName.trim()} - ${primaryDisplay}`
    : `[NomeApp] - ${primaryDisplay}`;

  const titleWords = new Set([
    ...(appName?.trim() ? appName.trim().toLowerCase().split(/\s+/) : []),
    ...primaryKw.split(/\s+/),
  ]);

  // b) Subtitle suggestion
  const subtitleCandidates = [];
  // Add modifier if split from primary
  if (modifier) {
    modifier.split(/\s+/).forEach(w => {
      if (!titleWords.has(w)) subtitleCandidates.push(w);
    });
  }
  // Add related keywords not in title
  result.relatedKeywords.forEach(rk => {
    if (!titleWords.has(rk.word) && !subtitleCandidates.includes(rk.word)) {
      subtitleCandidates.push(rk.word);
    }
  });
  // Add words from other analyzed keywords
  allResults.forEach(r => {
    const rk = r.rawKeyword || r.keyword;
    rk.toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 2 && !titleWords.has(w) && !subtitleCandidates.includes(w)) {
        subtitleCandidates.push(w);
      }
    });
  });
  // Also add synonyms for modifier words
  kwWords.forEach(w => {
    const syns = SYNONYMS[w];
    if (syns) syns.forEach(s => {
      if (!titleWords.has(s) && !subtitleCandidates.includes(s)) subtitleCandidates.push(s);
    });
  });

  // Build subtitle: pick words until ~30 chars
  const subtitleWords = [];
  let subLen = 0;
  for (const w of subtitleCandidates) {
    const display = titleCase(w);
    const addLen = subLen === 0 ? display.length : display.length + 2; // ", " separator
    if (subLen + addLen > 30) break;
    subtitleWords.push(display);
    subLen += addLen;
  }
  const suggestedSubtitle = subtitleWords.join(", ");
  const subtitleWordsLower = subtitleWords.map(w => w.toLowerCase());

  // c) Targeted keywords — combinations of title + subtitle words
  const targetedKeywords = [];
  const primaryWords = primaryKw.split(/\s+/);
  // Primary keyword
  targetedKeywords.push({ kw: primaryDisplay, type: "primaria - nel titolo" });
  // Subtitle word + full primary
  subtitleWordsLower.forEach(sw => {
    targetedKeywords.push({ kw: titleCase(`${sw} ${primaryKw}`), type: "combinazione titolo+sottotitolo" });
  });
  // Subtitle word + individual primary words
  subtitleWordsLower.forEach(sw => {
    primaryWords.forEach(pw => {
      const combo = titleCase(`${sw} ${pw}`);
      if (!targetedKeywords.some(t => t.kw.toLowerCase() === combo.toLowerCase())) {
        targetedKeywords.push({ kw: combo, type: "combinazione sottotitolo" });
      }
    });
  });

  // d) Warnings and tips
  // Check for word overlap between title and subtitle
  const overlap = subtitleWordsLower.filter(w => titleWords.has(w));
  if (overlap.length > 0) {
    tips.push({ type: "warning", text: `Non ripetere parole tra titolo e sottotitolo — "${overlap.join(", ")}" appare in entrambi. Può penalizzare il ranking.` });
  }
  if (result.top10exact > 3) {
    tips.push({ type: "warning", text: "Keyword satura nel top 10 — considera una variante più specifica." });
  }
  if (result.top10strong <= 1) {
    tips.push({ type: "tip", text: "Top 10 debole — con buon ASO e download velocity nella prima settimana puoi entrare rapidamente." });
  }
  // Check if related keywords have less competition
  const lessCompetitive = result.relatedKeywords.filter(rk => {
    const matchingResult = allResults.find(r => (r.rawKeyword || r.keyword).toLowerCase().includes(rk.word));
    return matchingResult && matchingResult.opportunity > result.opportunity;
  });
  if (lessCompetitive.length > 0) {
    tips.push({ type: "tip", text: `Considera di targettare anche: ${lessCompetitive.slice(0, 3).map(k => k.word).join(", ")}` });
  }

  return { suggestedTitle, suggestedSubtitle, targetedKeywords, tips };
}

function getGrade(s) {
  if (s >= 75) return { letter:"A", color:"#22c55e", bg:"#052e16", label:"Ottima opportunità" };
  if (s >= 60) return { letter:"B", color:"#84cc16", bg:"#1a2e05", label:"Buona opportunità" };
  if (s >= 45) return { letter:"C", color:"#eab308", bg:"#2e2005", label:"Competitiva" };
  if (s >= 30) return { letter:"D", color:"#f97316", bg:"#2e1505", label:"Molto competitiva" };
  return { letter:"F", color:"#ef4444", bg:"#2e0505", label:"Mercato saturo" };
}

function googleTrendsUrl(kw) {
  return `https://trends.google.com/trends/explore?q=${encodeURIComponent(kw)}&cat=0&gprop=`;
}

// --- SMALL COMPONENTS ---
function ScoreBar({ label, value, icon }) {
  const c = value >= 70 ? "#22c55e" : value >= 45 ? "#eab308" : "#ef4444";
  return (<div style={{ marginBottom: 5 }}>
    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#94a3b8", marginBottom:2 }}>
      <span>{icon} {label}</span><span style={{ fontFamily:mono }}>{value}</span>
    </div>
    <div style={{ height:3, background:"#1e293b", borderRadius:2, overflow:"hidden" }}>
      <div style={{ width:`${value}%`, height:"100%", borderRadius:2, background:c, transition:"width 0.5s ease-out" }}/>
    </div>
  </div>);
}

function DistBar({ d }) {
  const t = Object.values(d).reduce((s,v) => s+v, 0) || 1;
  const sg = [
    { k:"monsters",l:"Giganti (50k+ reviews)",c:"#ef4444",n:d.monsters },
    { k:"strong",l:"Forti (10-50k)",c:"#f97316",n:d.strong },
    { k:"medium",l:"Medi (1-10k)",c:"#eab308",n:d.medium },
    { k:"weak",l:"Deboli (1-1k)",c:"#22c55e",n:d.weak },
    { k:"zombies",l:"Morti (0 reviews)",c:"#334155",n:d.zombies },
  ];
  const dangerous = d.monsters + d.strong;
  const beatable = d.weak + d.zombies;
  const verdict = dangerous >= t * 0.4
    ? { text: "Mercato dominato da app forti — difficile competere", color: "#ef4444" }
    : beatable >= t * 0.6
    ? { text: "Tanti competitor deboli o morti — spazio per entrare", color: "#22c55e" }
    : { text: "Mix equilibrato — servono differenziazione e ASO forte", color: "#eab308" };
  return (<div>
    <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden", marginBottom:6 }}>
      {sg.map(s => s.n > 0 ? <div key={s.k} style={{ width:`${(s.n/t)*100}%`, background:s.c, minWidth:2 }}/> : null)}
    </div>
    <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:6 }}>
      {sg.filter(s => s.n > 0).map(s => (
        <div key={s.k} style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ display:"inline-block", width:6, height:6, borderRadius:1, background:s.c, flexShrink:0 }}/>
          <span style={{ fontSize:10, color:"#94a3b8", flex:1 }}>{s.l}</span>
          <span style={{ fontSize:10, color:"#e2e8f0", fontFamily:mono, fontWeight:600 }}>{s.n}</span>
          <span style={{ fontSize:9, color:"#475569", fontFamily:mono, width:32 }}>{Math.round(s.n/t*100)}%</span>
        </div>
      ))}
    </div>
    <div style={{ fontSize:10, color:verdict.color, fontWeight:500, paddingTop:4, borderTop:"1px solid #334155" }}>
      {verdict.text}
    </div>
  </div>);
}

function AppRow({ app, index, keyword }) {
  const age = Math.round((new Date() - new Date(app.currentVersionReleaseDate)) / 86400000);
  const al = age > 365 ? `${Math.round(age/365)}y` : age > 30 ? `${Math.round(age/30)}mo` : `${age}d`;
  const ac = age > 180 ? "#ef4444" : age > 60 ? "#eab308" : "#22c55e";
  const has = app.trackName.toLowerCase().includes(keyword.toLowerCase());
  const isTop = index < 10;
  return (
    <div style={{ display:"grid", gridTemplateColumns:"22px 28px 1fr 65px 44px 38px", alignItems:"center", padding:"5px 10px", fontSize:10, borderBottom:"1px solid #0f172a", background: isTop ? "#0a1628" : "transparent", gap:5 }}>
      <span style={{ color: isTop ? "#64748b" : "#334155", fontFamily:mono, fontSize:9, fontWeight: isTop ? 600 : 400 }}>{index+1}</span>
      <img src={app.artworkUrl60} alt="" style={{ width:24, height:24, borderRadius:5, background:"#1e293b" }} onError={e => { e.target.style.display="none"; }}/>
      <div style={{ overflow:"hidden" }}>
        <div style={{ color: has ? "#93c5fd" : "#e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontSize:11, fontWeight: has ? 600 : 400 }}>{app.trackName}</div>
        <div style={{ color:"#475569", fontSize:9, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{app.artistName}{app.price > 0 ? ` · $${app.price}` : ""}</div>
      </div>
      <span style={{ color:"#cbd5e1", fontFamily:mono, textAlign:"right", fontSize:10 }}>{(app.userRatingCount||0).toLocaleString()}</span>
      <span style={{ textAlign:"right", fontSize:10, color:"#cbd5e1" }}>{app.averageUserRating ? `${app.averageUserRating.toFixed(1)}★` : "—"}</span>
      <span style={{ textAlign:"right", fontSize:9, color:ac, fontFamily:mono }}>{al}</span>
    </div>
  );
}

// --- RESULT CARD ---
function CopyBox({ text, label }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => { navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return (
    <div style={{ marginBottom:10 }}>
      {label && <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{label}</div>}
      <div style={{ display:"flex", alignItems:"center", gap:6, background:"#1e293b", borderRadius:6, padding:"8px 10px", border:"1px solid #334155" }}>
        <div style={{ flex:1, fontSize:12, fontWeight:600, color:"#e2e8f0", fontFamily:mono, wordBreak:"break-word" }}>{text}</div>
        <button onClick={doCopy} style={{ padding:"4px 8px", fontSize:9, fontFamily:mono, background:copied?"#22c55e20":"#334155", border:"1px solid #475569", borderRadius:4, color:copied?"#22c55e":"#94a3b8", cursor:"pointer", flexShrink:0 }}>
          {copied ? "✓" : "📋"}
        </button>
      </div>
    </div>
  );
}

function ResultCard({ result, onRemove, onSearchRelated, appName, allResults }) {
  const grade = getGrade(result.opportunity);
  const [tab, setTab] = useState("overview");
  const rawKw = result.rawKeyword || result.keyword;
  const aso = generateASOSuggestions(result, allResults || [result], appName);

  return (
    <div style={{ background:"#0f172a", border:`1px solid ${grade.color}20`, borderRadius:10, overflow:"hidden", marginBottom:12 }}>
      {/* Header */}
      <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10, borderBottom:"1px solid #1e293b" }}>
        <div style={{ width:40, height:40, borderRadius:8, background:grade.bg, border:`2px solid ${grade.color}30`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ fontSize:20, fontWeight:800, color:grade.color, fontFamily:mono }}>{grade.letter}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ color:"#f1f5f9", fontSize:13, fontWeight:600, fontFamily:mono }}>{result.keyword}</div>
          <div style={{ color:"#64748b", fontSize:10 }}>{grade.label} · {result.totalApps} app · med {result.medianReviews.toLocaleString()} rev</div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:24, fontWeight:800, color:grade.color, fontFamily:mono, lineHeight:1 }}>{result.opportunity}</div>
          <div style={{ fontSize:8, color:"#475569", textTransform:"uppercase", letterSpacing:1 }}>score</div>
        </div>
        {onRemove && <button onClick={() => onRemove(result.keyword)} style={{ background:"none", border:"none", color:"#334155", cursor:"pointer", fontSize:12, padding:2 }}>✕</button>}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #1e293b" }}>
        {[{id:"overview",l:"Overview"},{id:"apps",l:`App (${result.totalApps})`},{id:"related",l:"Correlate"},{id:"actions",l:"🚀 Next"},{id:"aso",l:"💡 ASO"}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:"6px 0", fontSize:10, fontWeight:600, border:"none",
            borderBottom: tab===t.id ? `2px solid ${grade.color}` : "2px solid transparent",
            background:"transparent", color: tab===t.id ? "#e2e8f0" : "#475569", cursor:"pointer", fontFamily:mono,
          }}>{t.l}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div style={{ padding:14 }}>
          {/* Quick stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:6, marginBottom:12 }}>
            {[
              { l:"Avg rev", v:result.avgReviews.toLocaleString() },
              { l:"Avg ★", v:result.avgRating },
              { l:"Zombie", v:`${result.zombies}/${result.totalApps}` },
              { l:"Stale", v:`${result.stale}/${result.totalApps}` },
            ].map((m,i) => (
              <div key={i} style={{ background:"#1e293b", borderRadius:6, padding:"6px 8px", textAlign:"center" }}>
                <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", fontFamily:mono }}>{m.v}</div>
                <div style={{ fontSize:8, color:"#64748b", textTransform:"uppercase", marginTop:1 }}>{m.l}</div>
              </div>
            ))}
          </div>

          {/* NEW: Top 10 insight */}
          <div style={{ background:"#1e293b", borderRadius:8, padding:"10px 12px", marginBottom:12, border: result.top10exact <= 1 ? "1px solid #22c55e30" : result.top10exact <= 3 ? "1px solid #eab30830" : "1px solid #ef444430" }}>
            <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>🔍 Top 10 Analysis</div>
            <div style={{ display:"flex", gap:12 }}>
              <div>
                <span style={{ fontSize:18, fontWeight:800, fontFamily:mono, color: result.top10exact <= 1 ? "#22c55e" : result.top10exact <= 3 ? "#eab308" : "#ef4444" }}>{result.top10exact}</span>
                <span style={{ fontSize:9, color:"#64748b" }}>/10 exact match</span>
              </div>
              <div>
                <span style={{ fontSize:18, fontWeight:800, fontFamily:mono, color: result.top10strong <= 2 ? "#22c55e" : "#ef4444" }}>{result.top10strong}</span>
                <span style={{ fontSize:9, color:"#64748b" }}>/10 con 10k+ rev</span>
              </div>
            </div>
            <div style={{ fontSize:10, color:"#94a3b8", marginTop:6 }}>
              {result.top10exact <= 1 && result.top10strong <= 1
                ? "🟢 Pochi exact match e competitor deboli nel top 10 — forte opportunità"
                : result.top10exact <= 1 && result.top10strong > 1
                ? "🟡 Pochi exact match MA top 10 dominato da app forti — keyword difficile nonostante il gap nel titolo"
                : result.top10exact <= 3 && result.top10strong <= 2
                ? "🟡 Alcune app la targettano ma competitor gestibili — serve ASO forte"
                : result.top10exact <= 3 && result.top10strong > 2
                ? "🔴 Alcune app la targettano e competitor forti — difficile emergere"
                : "🔴 Keyword satura nel top 10 — cerca una sotto-nicchia"}
            </div>
          </div>

          {/* Google Trends link */}
          <a href={googleTrendsUrl(rawKw)} target="_blank" rel="noopener noreferrer"
            style={{ display:"block", padding:"8px 12px", background:"#172554", border:"1px solid #1e3a5f", borderRadius:6, marginBottom:12, textDecoration:"none", fontSize:11, color:"#93c5fd", textAlign:"center" }}>
            📈 Verifica domanda su Google Trends →
          </a>

          {/* Score breakdown with integrated distribution */}
          <div>
            <div style={{ marginBottom:10, background:"#1e293b", borderRadius:6, padding:"10px 12px" }}>
              <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Quanto sono forti i competitor? ({result.totalApps} app trovate)</div>
              <DistBar d={result.distribution} />
            </div>
            <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Perche' questo score? (alto = meglio per te)</div>
            <div style={{ fontSize:9, color:"#475569", marginBottom:8 }}>Ogni barra misura un fattore. Piu' e' piena, piu' quel fattore gioca a tuo favore.</div>
            <ScoreBar label="Poche app competono su questa keyword" value={result.scores.competition} icon="🎯" />
            <ScoreBar label="I competitor hanno poche reviews" value={result.scores.strength} icon="💪" />
            <ScoreBar label="Poche app nel top 10 usano questa keyword nel titolo" value={result.scores.top10gap} icon="🔍" />
            <ScoreBar label="Poche app forti (1k+ reviews) nel top 10" value={result.scores.top10density} icon="📊" />
            <ScoreBar label="Le app esistenti hanno rating bassi" value={result.scores.quality} icon="⭐" />
            <ScoreBar label="Le app esistenti non vengono aggiornate" value={result.scores.freshness} icon="🕰" />
            <ScoreBar label="Poche app usano questa keyword nel nome" value={result.scores.saturation} icon="🏷" />
            <ScoreBar label="Tante app con 0 reviews (mercato con app abbandonate)" value={result.scores.zombie} icon="💀" />
          </div>
        </div>
      )}

      {/* Apps */}
      {tab === "apps" && (
        <div>
          <div style={{ padding:"6px 10px", fontSize:8, color:"#475569", borderBottom:"1px solid #1e293b" }}>
            ℹ️ Righe scure = Top 10 · <span style={{ color:"#93c5fd" }}>blu</span> = keyword nel titolo
          </div>
          <div style={{ padding:"6px 10px 3px", display:"grid", gridTemplateColumns:"22px 28px 1fr 65px 44px 38px", gap:5, fontSize:8, color:"#334155", textTransform:"uppercase", letterSpacing:1 }}>
            <span>#</span><span></span><span>App</span><span style={{ textAlign:"right" }}>Rev</span><span style={{ textAlign:"right" }}>★</span><span style={{ textAlign:"right" }}>Age</span>
          </div>
          {result.apps.map((app,i) => <AppRow key={app.trackId} app={app} index={i} keyword={rawKw} />)}
        </div>
      )}

      {/* Related */}
      {tab === "related" && (
        <div style={{ padding:14 }}>
          {result.relatedKeywords.length > 0 ? (<>
            <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Parole frequenti nei titoli</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
              {result.relatedKeywords.map(rk => (
                <button key={rk.word} onClick={() => onSearchRelated && onSearchRelated(rk.word)} style={{
                  padding:"4px 8px", background:"#1e293b", borderRadius:5, fontSize:10, color:"#e2e8f0",
                  fontFamily:mono, cursor:"pointer", border:"1px solid #334155",
                }} title={`Aggiungi "${rk.word}"`}>
                  {rk.word} <span style={{ color:"#475569", fontSize:9 }}>×{rk.count}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize:9, color:"#475569", marginTop:8 }}>Clicca per aggiungere come keyword</div>
          </>) : <div style={{ color:"#475569", fontSize:11, textAlign:"center", padding:16 }}>Nessuna correlata</div>}
        </div>
      )}

      {/* NEW: Actions / Next Steps */}
      {/* ASO */}
      {tab === "aso" && (
        <div style={{ padding:14 }}>
          <CopyBox label="Titolo suggerito" text={aso.suggestedTitle} />
          <CopyBox label="Sottotitolo suggerito" text={aso.suggestedSubtitle} />

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Keyword targettate</div>
            {aso.targetedKeywords.map((tk, i) => (
              <div key={i} style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:3, paddingLeft:4 }}>
                <span style={{ color:"#e2e8f0", fontSize:11, fontFamily:mono, fontWeight:600 }}>{tk.kw}</span>
                <span style={{ fontSize:9, color:"#475569" }}>({tk.type})</span>
              </div>
            ))}
          </div>

          {aso.tips.length > 0 && (
            <div>
              <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Tips</div>
              {aso.tips.map((tip, i) => (
                <div key={i} style={{
                  padding:"7px 10px", marginBottom:4, borderRadius:5, fontSize:10, lineHeight:1.5,
                  background: tip.type === "warning" ? "#451a0320" : "#0f291420",
                  border: tip.type === "warning" ? "1px solid #f9731630" : "1px solid #22c55e30",
                  color: tip.type === "warning" ? "#fbbf24" : "#86efac",
                }}>
                  {tip.type === "warning" ? "⚠️" : "💡"} {tip.text}
                </div>
              ))}
            </div>
          )}

          {!appName?.trim() && (
            <div style={{ marginTop:10, padding:"7px 10px", background:"#172554", border:"1px solid #1e3a5f", borderRadius:5, fontSize:10, color:"#93c5fd" }}>
              💡 Compila "Nome app" sopra per suggerimenti titolo personalizzati.
            </div>
          )}
        </div>
      )}

      {tab === "actions" && (
        <div style={{ padding:14 }}>
          <div style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Prossimi step per "{rawKw}"</div>
          {result.opportunity >= 45 ? (<>
            <ActionStep n={1} title="Valida su Google Trends" done={false}
              desc={`Apri Google Trends e cerca "${rawKw}". Se c'è interesse stabile o crescente, la domanda esiste anche fuori dall'App Store.`}
              link={googleTrendsUrl(rawKw)} linkLabel="Apri Google Trends" />
            <ActionStep n={2} title="Definisci keyword primaria" done={false}
              desc={`La keyword primaria va nel TITOLO dell'app come exact match (parole consecutive). Es: "NomeApp - ${rawKw}". Non separare con trattini o simboli tra le parole della keyword.`} />
            <ActionStep n={3} title="Scegli keyword secondarie" done={false}
              desc="Metti 1-2 keyword secondarie nel SOTTOTITOLO. Non ripetere parole già nel titolo. Il sottotitolo deve essere leggibile e descrittivo per un utente umano." />
            <ActionStep n={4} title="Prototipa e testa" done={false}
              desc="Costruisci un proof of concept. Se è clunky, noioso, o non funziona — pivota o abbandona. Il prototipo ti dice subito cosa funziona." />
            <ActionStep n={5} title="Prepara il lancio" done={false}
              desc="Prima del lancio: screenshot ottimizzati, descrizione con keyword naturali, icona distintiva. Pianifica post social per il giorno del lancio." />
            <ActionStep n={6} title="Campagna Search Ads (visibility)" done={false}
              desc="Appena l'app è approvata, crea una campagna Apple Search Ads con exact match sul nome app. Budget giornaliero alto ($100-1000), CPT bid alto ($5-10). Costa ~$50-70 totali. Spegni quando l'app inizia a rankare organicamente." />
            <ActionStep n={7} title="Lancio social + download velocity" done={false}
              desc="Il giorno del lancio, promuovi ovunque: X, TikTok, Product Hunt, Reddit. Ogni download esterno conta per il ranking. La prima settimana determina il posizionamento dei prossimi 6 mesi." />
            <ActionStep n={8} title="Sharable moments" done={false}
              desc="Identifica il momento nell'app che l'utente vorrebbe condividere (score, risultato, creazione). Aggiungi il branding dell'app in quella schermata + bottone share. Ogni 5 utenti che condividono = +20% download gratis." />
            <ActionStep n={9} title="Raccogli review" done={false}
              desc="Usa SKStoreReviewController dopo un momento positivo (completamento task, achievement). Le review impattano il ranking. Obiettivo: 10+ review nella prima settimana." />
          </>) : (
            <div style={{ padding:16, background:"#1e293b", borderRadius:8, textAlign:"center" }}>
              <div style={{ fontSize:13, color:"#f97316", fontWeight:600, marginBottom:6 }}>⚠️ Score basso — considera di cercare una sotto-nicchia</div>
              <div style={{ fontSize:11, color:"#94a3b8", lineHeight:1.6 }}>
                Questa keyword è molto competitiva. Prova ad aggiungere un modificatore specifico (es: "{rawKw} for students", "{rawKw} minimal", "{rawKw} offline") oppure esplora le keyword correlate nel tab precedente.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionStep({ n, title, desc, link, linkLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:6, background:"#1e293b", borderRadius:6, overflow:"hidden" }}>
      <div onClick={() => setOpen(!open)} style={{ padding:"8px 12px", display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
        <span style={{ width:20, height:20, borderRadius:10, background:"#334155", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#94a3b8", fontFamily:mono, flexShrink:0 }}>{n}</span>
        <span style={{ fontSize:11, color:"#e2e8f0", fontWeight:500, flex:1 }}>{title}</span>
        <span style={{ color:"#475569", fontSize:12, transform: open ? "rotate(180deg)" : "rotate(0)", transition:"transform 0.15s" }}>▾</span>
      </div>
      {open && (
        <div style={{ padding:"0 12px 10px 40px" }}>
          <div style={{ fontSize:10, color:"#94a3b8", lineHeight:1.6 }}>{desc}</div>
          {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ display:"inline-block", marginTop:6, fontSize:10, color:"#93c5fd", textDecoration:"none" }}>→ {linkLabel || link}</a>}
        </div>
      )}
    </div>
  );
}

// --- ROADMAP PANEL ---
function RoadmapPanel() {
  const [open, setOpen] = useState(false);
  const phases = [
    { emoji:"💡", title:"1. Idea & Ispirazione", items:[
      "Definisci obiettivi chiari (learn, revenue, viralità, challenge)",
      "Cerca ispirazione fuori dal computer — trend TikTok, problemi reali",
      "Limita l'idea a 1-2 feature core, non di più",
      "Non guardare i competitor in questa fase — influenzano il pensiero",
    ]},
    { emoji:"🔬", title:"2. Validazione Keyword", items:[
      "Usa questo tool: cerca keyword → analizza competizione",
      "Cerca keyword con pochi exact match nel top 10",
      "Valida su Google Trends: interesse stabile o crescente?",
      "Confronta più paesi — una keyword satura in US può essere vuota in IT",
      "Esplora varianti e sotto-nicchie con l'expander",
    ]},
    { emoji:"🔨", title:"3. Proof of Concept", items:[
      "Costruisci un prototipo funzionale, anche brutto",
      "Testa se l'idea è divertente/utile nella pratica, non solo nella teoria",
      "Se è noioso, clunky, o non funziona → pivota o abbandona",
      "Se funziona → itera sul concept con market research",
    ]},
    { emoji:"🏗", title:"4. Build & ASO Setup", items:[
      "Keyword primaria nel TITOLO come exact match (parole consecutive)",
      "Keyword secondarie nel SOTTOTITOLO, non ripetere parole dal titolo",
      "Screenshot ottimizzati, icona chiara e riconoscibile",
      "Descrizione con keyword integrate naturalmente",
      "Prepara sharable moments (screenshot-worthy screens con branding)",
    ]},
    { emoji:"🚀", title:"5. Lancio (Settimana 1)", items:[
      "Campagna Apple Search Ads 'visibility' dal giorno 1 (~$50-70 totali)",
      "Exact match sul brand name, CPT bid alto, budget giornaliero alto",
      "L'app appare nel recommended search list per pochi giorni — sfruttalo",
      "Promuovi su X, TikTok, Product Hunt, Reddit — download velocity è tutto",
      "La prima settimana determina il ranking per i prossimi 6 mesi",
    ]},
    { emoji:"📈", title:"6. Crescita Sostenibile", items:[
      "Sharable moments → word of mouth → download gratuiti",
      "Ogni 5 utenti che condividono = ~20% download extra",
      "Chiedi review con SKStoreReviewController dopo momenti positivi",
      "Non dipendere da un singolo canale — diversifica",
      "Monitora keyword ranking e itera su titolo/sottotitolo se necessario",
    ]},
  ];

  return (
    <div style={{ marginBottom:12 }}>
      <button onClick={() => setOpen(!open)} style={{
        width:"100%", padding:"10px 14px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:8,
        color:"#e2e8f0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between",
        fontFamily:mono, fontSize:12, fontWeight:600,
      }}>
        <span>🗺 Roadmap: da idea a lancio</span>
        <span style={{ color:"#475569", transform: open ? "rotate(180deg)" : "rotate(0)", transition:"transform 0.15s" }}>▾</span>
      </button>
      {open && (
        <div style={{ marginTop:2, background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, padding:14 }}>
          {phases.map((p, pi) => (
            <div key={pi} style={{ marginBottom: pi < phases.length-1 ? 14 : 0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#f1f5f9", marginBottom:6 }}>{p.emoji} {p.title}</div>
              {p.items.map((item, ii) => (
                <div key={ii} style={{ display:"flex", gap:6, marginBottom:3, paddingLeft:4 }}>
                  <span style={{ color:"#334155", fontSize:10, flexShrink:0 }}>→</span>
                  <span style={{ fontSize:10, color:"#94a3b8", lineHeight:1.5 }}>{item}</span>
                </div>
              ))}
              {pi < phases.length-1 && <div style={{ borderBottom:"1px solid #1e293b", marginTop:10 }}/>}
            </div>
          ))}
          <div style={{ marginTop:12, padding:10, background:"#172554", borderRadius:6, fontSize:10, color:"#93c5fd", lineHeight:1.6 }}>
            💡 Fonte: processo validato da Adam Lidle ($1.19M app store sales, 1.7M downloads) combinato con dati ASO da iTunes Search API.
          </div>
        </div>
      )}
    </div>
  );
}

// --- MAIN APP ---
export default function ASOValidator() {
  const [keywords, setKeywords] = useState("");
  const [selCountries, setSelCountries] = useState(["us"]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHist, setShowHist] = useState(false);
  const [showExp, setShowExp] = useState(false);
  const [expKws, setExpKws] = useState([]);
  const [mode, setMode] = useState("api");
  const [pJson, setPJson] = useState("");
  const [pKw, setPKw] = useState("");
  const [pCountry, setPCountry] = useState("us");
  const [view, setView] = useState("tool"); // "tool" | "roadmap"
  const [appName, setAppName] = useState("");

  const toggleC = c => setSelCountries(p => p.includes(c) ? (p.length > 1 ? p.filter(x => x!==c) : p) : [...p, c]);

  const doSearch = async () => {
    const kws = keywords.split("\n").map(k => k.trim()).filter(Boolean);
    if (!kws.length) return;
    setLoading(true); setError(null);
    const nr = [];
    for (const kw of kws) {
      for (const co of selCountries) {
        const cn = COUNTRIES.find(c => c.code===co)?.name||co;
        setStatus(`${kw} · ${cn}`);
        try {
          const r = await fetch(`${ITUNES_API}?term=${encodeURIComponent(kw.trim())}&country=${co}&entity=software&limit=50`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const d = await r.json();
          const a = analyzeResults(d.results||[], kw);
          if (a) { a.country=co; a.countryFlag=COUNTRIES.find(c=>c.code===co)?.flag||""; a.keyword=`${kw} [${cn}]`; a.rawKeyword=kw; nr.push(a); }
          await new Promise(r => setTimeout(r, 3200));
        } catch(e) { setError(`"${kw}" (${cn}): ${e.message}`); }
      }
    }
    nr.sort((a,b) => b.opportunity - a.opportunity);
    setResults(nr);
    setHistory(p => [...nr,...p].slice(0,100));
    setLoading(false); setStatus("");
  };

  const doPaste = () => {
    if (!pJson.trim()||!pKw.trim()) return;
    try {
      const d = JSON.parse(pJson), apps = d.results||d;
      const a = analyzeResults(Array.isArray(apps)?apps:[], pKw.trim());
      if (a) {
        const cn = COUNTRIES.find(c=>c.code===pCountry)?.name||pCountry;
        a.country=pCountry; a.countryFlag=COUNTRIES.find(c=>c.code===pCountry)?.flag||"";
        a.keyword=`${pKw.trim()} [${cn}]`; a.rawKeyword=pKw.trim();
        setResults(p => [...p,a].sort((x,y) => y.opportunity-x.opportunity));
        setHistory(p => [a,...p].slice(0,100));
        setPJson(""); setPKw("");
      }
    } catch { setError("JSON non valido."); }
  };

  const addKw = kw => setKeywords(p => { const ls = p.split("\n").map(l=>l.trim()).filter(Boolean); if (!ls.includes(kw)) ls.push(kw); return ls.join("\n"); });

  const exportMd = () => {
    const md = results.map(r => {
      const g = getGrade(r.opportunity);
      return `## ${r.keyword} — ${g.letter} (${r.opportunity}/100)\n- ${r.totalApps} app, avg ${r.avgReviews} rev, ${r.avgRating}★\n- Top10: ${r.top10exact} exact match, ${r.top10strong} con 10k+ rev\n- Monsters:${r.distribution.monsters} Strong:${r.distribution.strong} Medium:${r.distribution.medium} Weak:${r.distribution.weak} Zombie:${r.distribution.zombies}\n- Google Trends: ${googleTrendsUrl(r.rawKeyword||r.keyword)}\n- Related: ${r.relatedKeywords.map(k=>k.word).join(", ")}\n`;
    }).join("\n");
    navigator.clipboard?.writeText(md).then(() => alert("Copiato!")).catch(() => {});
  };

  return (
    <div style={{ minHeight:"100vh", background:"#020617", color:"#e2e8f0", fontFamily:sans, zoom:1.4 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #1e293b", padding:"10px 14px", position:"sticky", top:0, background:"#020617ee", zIndex:10, backdropFilter:"blur(10px)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", maxWidth:680, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:16 }}>🔬</span>
            <div>
              <h1 style={{ margin:0, fontSize:14, fontWeight:700, fontFamily:mono, color:"#f1f5f9" }}>ASO Validator</h1>
              <p style={{ margin:0, fontSize:9, color:"#475569" }}>Keyword · Gap · Launch</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {results.length > 0 && <button onClick={exportMd} style={{ padding:"4px 8px", fontSize:9, background:"#1e293b", border:"1px solid #334155", borderRadius:5, color:"#94a3b8", cursor:"pointer", fontFamily:mono }}>📋</button>}
            <button onClick={() => setShowHist(!showHist)} style={{ padding:"4px 8px", fontSize:9, background:showHist?"#1e3a5f":"#1e293b", border:"1px solid #334155", borderRadius:5, color:showHist?"#93c5fd":"#94a3b8", cursor:"pointer", fontFamily:mono }}>📜{history.length}</button>
          </div>
        </div>
      </div>

      <div style={{ padding:"12px 14px", maxWidth:680, margin:"0 auto" }}>

        {/* View toggle: Tool vs Roadmap */}
        <div style={{ display:"flex", gap:2, marginBottom:10, background:"#0f172a", borderRadius:5, padding:2, border:"1px solid #1e293b" }}>
          {[{id:"tool",l:"🔬 Analisi"},{id:"roadmap",l:"🗺 Roadmap"}].map(m => (
            <button key={m.id} onClick={() => setView(m.id)} style={{ flex:1, padding:"6px", fontSize:11, fontWeight:600, border:"none", borderRadius:4, cursor:"pointer", background:view===m.id?"#1e293b":"transparent", color:view===m.id?"#f1f5f9":"#475569" }}>{m.l}</button>
          ))}
        </div>

        {/* ROADMAP VIEW */}
        {view === "roadmap" && <RoadmapPanel />}

        {/* TOOL VIEW */}
        {view === "tool" && (<>
          {/* Mode toggle */}
          <div style={{ display:"flex", gap:2, marginBottom:10, background:"#0f172a", borderRadius:5, padding:2, border:"1px solid #1e293b" }}>
            {[{id:"api",l:"🌐 API"},{id:"paste",l:"📋 Paste"}].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={{ flex:1, padding:"5px", fontSize:10, fontWeight:600, border:"none", borderRadius:4, cursor:"pointer", background:mode===m.id?"#1e293b":"transparent", color:mode===m.id?"#f1f5f9":"#475569" }}>{m.l}</button>
            ))}
          </div>

          {mode === "api" ? (<>
            {/* Countries */}
            <div style={{ display:"flex", gap:3, marginBottom:8, flexWrap:"wrap" }}>
              {COUNTRIES.map(c => (
                <button key={c.code} onClick={() => toggleC(c.code)} style={{
                  padding:"3px 6px", fontSize:10, borderRadius:4, cursor:"pointer",
                  border: selCountries.includes(c.code) ? "1px solid #3b82f6" : "1px solid #1e293b",
                  background: selCountries.includes(c.code) ? "#1e3a5f" : "#0f172a",
                  color: selCountries.includes(c.code) ? "#93c5fd" : "#475569",
                }}>{c.flag}</button>
              ))}
              <span style={{ fontSize:8, color:"#334155", alignSelf:"center", marginLeft:2 }}>{selCountries.length}p</span>
            </div>

            {/* App name */}
            <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Nome della tua app (es: Skei) — opzionale"
              style={{ width:"100%", padding:"7px 10px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:11, fontFamily:mono, outline:"none", boxSizing:"border-box", marginBottom:6 }}
              onFocus={e => e.target.style.borderColor="#8b5cf6"} onBlur={e => e.target.style.borderColor="#1e293b"} />

            {/* Input */}
            <textarea value={keywords} onChange={e => setKeywords(e.target.value)} placeholder={"expense tracker\nminimal budget\nvoice notes"} rows={3}
              style={{ width:"100%", padding:"8px 10px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:12, fontFamily:mono, resize:"vertical", outline:"none", boxSizing:"border-box", lineHeight:1.5 }}
              onFocus={e => e.target.style.borderColor="#3b82f6"} onBlur={e => e.target.style.borderColor="#1e293b"} />

            <div style={{ display:"flex", gap:5, marginTop:6 }}>
              <button onClick={doSearch} disabled={loading||!keywords.trim()} style={{
                flex:1, padding:"9px", fontSize:12, fontWeight:700, border:"none", borderRadius:7, cursor:loading?"wait":"pointer", fontFamily:mono,
                background: loading ? "#1e293b" : "linear-gradient(135deg, #3b82f6, #2563eb)", color:"#fff", opacity:!keywords.trim()?0.4:1,
              }}>{loading ? `⏳ ${status}` : "🔍 Analizza"}</button>
              <button onClick={() => { const b=keywords.split("\n")[0]?.trim(); if(b){setExpKws(expandKeyword(b));setShowExp(true);} }} disabled={!keywords.trim()} style={{
                padding:"9px 12px", fontSize:12, fontWeight:600, border:"1px solid #334155", borderRadius:7, cursor:"pointer", fontFamily:mono, background:"#0f172a", color:"#94a3b8", opacity:!keywords.trim()?0.4:1,
              }}>🧬</button>
            </div>

            {/* Expander */}
            {showExp && expKws.length > 0 && (
              <div style={{ padding:10, background:"#0f172a", border:"1px solid #1e293b", borderRadius:6, marginTop:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:9, color:"#64748b", textTransform:"uppercase", letterSpacing:1 }}>🧬 Varianti</span>
                  <button onClick={() => setShowExp(false)} style={{ background:"none", border:"none", color:"#334155", cursor:"pointer", fontSize:11 }}>✕</button>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                  {expKws.map(kw => {
                    const added = keywords.split("\n").map(l=>l.trim()).includes(kw);
                    return <button key={kw} onClick={() => !added && addKw(kw)} style={{ padding:"3px 7px", fontSize:9, fontFamily:mono, borderRadius:3, cursor:added?"default":"pointer", border:"1px solid #1e293b", background:added?"#1e293b":"#020617", color:added?"#334155":"#94a3b8" }}>{added?"✓":"+"} {kw}</button>;
                  })}
                </div>
                <button onClick={() => expKws.forEach(addKw)} style={{ marginTop:6, padding:"3px 8px", fontSize:9, fontFamily:mono, borderRadius:3, border:"1px solid #334155", background:"#1e293b", color:"#94a3b8", cursor:"pointer" }}>Aggiungi tutte</button>
              </div>
            )}
          </>) : (<>
            {/* Paste mode */}
            <div style={{ display:"flex", gap:5, marginBottom:6 }}>
              <input value={pKw} onChange={e => setPKw(e.target.value)} placeholder="Keyword..." style={{ flex:1, padding:"7px 9px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:5, color:"#e2e8f0", fontSize:11, fontFamily:mono, outline:"none" }}/>
              <select value={pCountry} onChange={e => setPCountry(e.target.value)} style={{ padding:"7px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:5, color:"#e2e8f0", fontSize:11, outline:"none" }}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
            </div>
            <textarea value={pJson} onChange={e => setPJson(e.target.value)} placeholder='{"resultCount":46,"results":[...]}' rows={5}
              style={{ width:"100%", padding:"8px 10px", background:"#0f172a", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:10, fontFamily:mono, resize:"vertical", outline:"none", boxSizing:"border-box" }}/>
            <button onClick={doPaste} disabled={!pJson.trim()||!pKw.trim()} style={{
              width:"100%", marginTop:6, padding:"9px", fontSize:12, fontWeight:700, border:"none", borderRadius:7, cursor:"pointer",
              background:"linear-gradient(135deg, #8b5cf6, #7c3aed)", color:"#fff", fontFamily:mono, opacity:!pJson.trim()||!pKw.trim()?0.4:1,
            }}>📋 Analizza JSON</button>
          </>)}

          {/* Error */}
          {error && (
            <div style={{ marginTop:8, padding:"7px 10px", background:"#450a0a", border:"1px solid #7f1d1d", borderRadius:5, fontSize:10, color:"#fca5a5", display:"flex", justifyContent:"space-between" }}>
              <span>{error}</span><button onClick={() => setError(null)} style={{ background:"none", border:"none", color:"#fca5a5", cursor:"pointer" }}>✕</button>
            </div>
          )}

          {/* History */}
          {showHist && history.length > 0 && (
            <div style={{ marginTop:10, padding:10, background:"#0f172a", border:"1px solid #1e293b", borderRadius:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:9, color:"#64748b", textTransform:"uppercase" }}>📜 History</span>
                <button onClick={() => setHistory([])} style={{ fontSize:8, background:"none", border:"none", color:"#475569", cursor:"pointer" }}>Svuota</button>
              </div>
              <div style={{ maxHeight:180, overflowY:"auto" }}>
                {history.map((h,i) => { const g=getGrade(h.opportunity); return (
                  <div key={`${h.keyword}-${i}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 6px", borderBottom:"1px solid #1e293b", fontSize:10 }}>
                    <span style={{ color:"#94a3b8", fontFamily:mono, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{h.keyword}</span>
                    <span style={{ color:g.color, fontWeight:700, fontFamily:mono, fontSize:11, marginLeft:6 }}>{g.letter}{h.opportunity}</span>
                  </div>
                );})}
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:9, color:"#475569", fontFamily:mono }}>{results.length} risultati</span>
                <button onClick={() => setResults([])} style={{ fontSize:8, background:"none", border:"none", color:"#334155", cursor:"pointer", fontFamily:mono }}>Pulisci</button>
              </div>

              {/* Comparison */}
              {results.length > 1 && (
                <div style={{ marginBottom:12, padding:8, background:"#0f172a", border:"1px solid #1e293b", borderRadius:6 }}>
                  <div style={{ fontSize:8, color:"#475569", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Confronto</div>
                  {results.map(r => { const g=getGrade(r.opportunity); return (
                    <div key={r.keyword} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                      <span style={{ width:16, fontSize:10, fontWeight:800, color:g.color, fontFamily:mono }}>{g.letter}</span>
                      <div style={{ flex:1, height:5, background:"#1e293b", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ width:`${r.opportunity}%`, height:"100%", background:g.color, borderRadius:2 }}/>
                      </div>
                      <span style={{ fontSize:9, color:"#94a3b8", fontFamily:mono, width:22, textAlign:"right" }}>{r.opportunity}</span>
                      <span style={{ fontSize:8, color: r.top10exact <= 1 ? "#22c55e" : "#eab308", fontFamily:mono }}>T10:{r.top10exact}</span>
                      <span style={{ fontSize:8, color: r.scores.top10density >= 60 ? "#22c55e" : r.scores.top10density >= 30 ? "#eab308" : "#ef4444", fontFamily:mono }}>D:{r.scores.top10density}</span>
                      <span style={{ fontSize:9, color:"#475569", fontFamily:mono, width:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.keyword}</span>
                    </div>
                  );})}
                </div>
              )}

              {results.map(r => <ResultCard key={r.keyword} result={r} onRemove={kw => setResults(p => p.filter(x => x.keyword!==kw))} onSearchRelated={addKw} appName={appName} allResults={results}/>)}
            </div>
          )}

          {/* Empty */}
          {!results.length && !loading && !showHist && (
            <div style={{ marginTop:36, textAlign:"center", padding:16 }}>
              <div style={{ fontSize:26, marginBottom:8 }}>🎯</div>
              <div style={{ fontSize:11, color:"#475569", lineHeight:1.6 }}>Keyword → competizione → gap → opportunità</div>
              <div style={{ fontSize:9, color:"#334155", marginTop:4 }}>In locale l'API funziona · Usa 🗺 Roadmap per il processo completo</div>
            </div>
          )}

          {/* Legend */}
          <div style={{ marginTop:20, padding:10, background:"#0f172a", border:"1px solid #1e293b", borderRadius:6, marginBottom:16 }}>
            <div style={{ fontSize:9, color:"#64748b", lineHeight:1.7, fontFamily:mono }}>
              <span style={{ color:"#22c55e" }}>■</span> A 75+ Go · <span style={{ color:"#84cc16" }}>■</span> B 60-74 Buona · <span style={{ color:"#eab308" }}>■</span> C 45-59 Angolo · <span style={{ color:"#f97316" }}>■</span> D 30-44 Dura · <span style={{ color:"#ef4444" }}>■</span> F &lt;30 Skip
            </div>
            <div style={{ fontSize:8, color:"#334155", marginTop:4 }}>T10 = exact match keyword nel top 10 risultati (meno = meglio)</div>
          </div>
        </>)}
      </div>
    </div>
  );
}