// src/summary.js
const f1 = (x) => Number.isFinite(x) ? x.toFixed(1) : "0.0";
const f2 = (x) => Number.isFinite(x) ? x.toFixed(2) : "0.00";
const f3 = (x) => Number.isFinite(x) ? x.toFixed(3) : "0.000";

const pct = (num, den) => (den > 0 && Number.isFinite(num)) ? (num / den * 100) : 0;

function avg(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (Number.isFinite(arr[i]) ? arr[i] : 0);
  return s / arr.length;
}
function pAvg(p, keys) {
  return avg(keys.map(k => Number.isFinite(p[k]) ? p[k] : 0));
}

export function summarizeRound(out, blue, red) {
  // Defensive reads
  const timeline = Array.isArray(out?.timeline) ? out.timeline : [];
  const T = timeline.length;

  const ticksBlueZone = timeline.reduce((a, z) => a + (Number.isFinite(z) && z > 0 ? 1 : 0), 0);
  const ticksRedZone  = timeline.reduce((a, z) => a + (Number.isFinite(z) && z < 0 ? 1 : 0), 0);
  const bluePct = pct(ticksBlueZone, T);
  const redPct  = pct(ticksRedZone, T);

  // Big swing telemetry (already provided in out.endFactors but safe-calc if missing)
  const deltas = [];
  for (let i = 1; i < T; i++) {
    const a = Number.isFinite(timeline[i-1]) ? timeline[i-1] : 0;
    const b = Number.isFinite(timeline[i])   ? timeline[i]   : 0;
    deltas.push(b - a);
  }
  let maxMag = 0, maxIdx = -1, dir = 0;
  for (let i = 0; i < deltas.length; i++) {
    const m = Math.abs(deltas[i]);
    if (m > maxMag) { maxMag = m; maxIdx = i; dir = deltas[i] >= 0 ? +1 : -1; }
  }

  const zoneBefore = (maxIdx >= 0 && Number.isFinite(timeline[maxIdx])) ? timeline[maxIdx] : 0;
  const zoneAfter  = (maxIdx+1 >= 0 && maxIdx+1 < T && Number.isFinite(timeline[maxIdx+1])) ? timeline[maxIdx+1] : zoneBefore;
  const swingTimeSec = (maxIdx+1); // 1 step ~ 1 tick; UI shows time elsewhere

  // MVP heuristic (safe)
  const keysOff = ["STR","PRC","INI","RHY"];
  const keysDef = ["GST","AWR","CMP","POS"];

  const teamImpact = (team) => {
    if (!Array.isArray(team) || team.length === 0) return { best: null, score: 0 };
    let best = null, bestScore = -1e9;
    for (const p of team) {
      const off = pAvg(p, keysOff);
      const def = pAvg(p, keysDef);
      // Weighting constants; treat as plain averages here (no risky multipliers)
      const score = off * 0.6 + def * 0.6;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return { best, score: bestScore };
  };

  const winner = out?.winner || "Draw";
  const blueImp = teamImpact(blue);
  const redImp  = teamImpact(red);
  const mvp = winner === "Blue" ? (blueImp.best || redImp.best) :
              winner === "Red"  ? (redImp.best  || blueImp.best) :
              (blueImp.score >= redImp.score ? blueImp.best : redImp.best);

  // Narrative summary text
  const swingLine = (maxIdx >= 0)
    ? `Play of the round: ${dir>=0 ? "Blue surge" : "Red counter"} at tick ${swingTimeSec} — zone ${f2(zoneBefore)} → ${f2(zoneAfter)}`
    : `Play of the round: —`;

  const mvpLine = mvp
    ? `MVP: ${mvp.name} (${mvp.el}) — Off≈${f1(pAvg(mvp, keysOff))}, Def≈${f1(pAvg(mvp, keysDef))}`
    : `MVP: —`;

  const controlLine = `Zone Control — Blue ${f1(bluePct)}% / Red ${f1(redPct)}%`;

  return [
    `Winner: ${winner}`,
    controlLine,
    swingLine,
    mvpLine
  ].join("\n");
}
