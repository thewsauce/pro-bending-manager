// src/variance.js
import { clamp } from "./util.js";

/** Core stat keys used in sim */
const KEYS = ["INI","STR","PRC","GST","AWR","RHY","CMP","POS","STM","END"];

/** Elemental 6-stat pools (pick 2 per round, +5% each) */
const ELEMENT_POOLS = {
  fire:  ["STR","PRC","INI","RHY","GST","CMP"],
  water: ["PRC","RHY","AWR","POS","CMP","STM"],
  earth: ["STR","GST","POS","AWR","END","CMP"],
  // air (if you enable later): ["INI","RHY","PRC","POS","AWR","CMP"]
};

/** Play-style 3-stat pools (pick one from each) */
const STYLE_POOLS = {
  1: ["RHY","INI","PRC"], // Suppression & Assault
  2: ["GST","AWR","PRC"], // Defensive & Counter
  3: ["POS","PRC","RHY"], // Zoning & Pressure
  4: ["INI","PRC","POS"], // Stalker
  5: ["GST","POS","CMP"], // Anchor
  6: ["STR","PRC","CMP"]  // Closer
};

/** Mood bands (percent range). Weighted to center around Normal/Good. */
const MOODS = [
  { name: "Great",  min: +0.11, max: +0.15, w: 0.10 },
  { name: "Good",   min: +0.01, max: +0.10, w: 0.28 },
  { name: "Normal", min:  0.00, max:  0.00, w: 0.32 },
  { name: "Bad",    min: -0.05, max: -0.01, w: 0.20 },
  { name: "Awful",  min: -0.10, max: -0.06, w: 0.10 }
];

function pickWeighted(rng, arr){
  const total = arr.reduce((s,a)=>s+a.w,0);
  const r = rng()*total;
  let acc = 0;
  for (const a of arr){ acc += a.w; if (r <= acc) return a; }
  return arr[arr.length-1];
}
function pick(rng, arr){ return arr[Math.floor(rng()*arr.length)] }
function pickDistinct(rng, arr, k){
  const copy = arr.slice();
  const out = [];
  for (let i=0;i<k && copy.length;i++){
    const idx = Math.floor(rng()*copy.length);
    out.push(copy[idx]);
    copy.splice(idx,1);
  }
  return out;
}

function applyFactor(obj, key, factor){
  // multiply & keep reasonable bounds; keep decimals for sim fidelity
  obj[key] = clamp(obj[key] * factor, 1, 150);
}

export function applyRoundVariance(team, rng){
  const notes = [];
  const buffed = team.map(p => {
    const q = structuredClone(p);

    // 1) Mood: global multiplier across all stats
    const moodBand = pickWeighted(rng, MOODS);
    const moodPct = moodBand.min === moodBand.max
      ? moodBand.min
      : (moodBand.min + rng()*(moodBand.max - moodBand.min));
    const moodFactor = 1 + moodPct;
    for (const k of KEYS) applyFactor(q, k, moodFactor);

    // 2) Element: +5% to 2 distinct stats from pool
    const poolE = ELEMENT_POOLS[(p.el||"").toLowerCase()] || [];
    const elBoosts = pickDistinct(rng, poolE, 2);
    for (const k of elBoosts) applyFactor(q, k, 1.05);

    // 3) Play-style: +5% to one from primary, +3% to one from secondary
    const prim = STYLE_POOLS[p.primaryStyle] || [];
    const sec  = STYLE_POOLS[p.secondaryStyle] || [];
    const primPick = prim.length ? pick(rng, prim) : null;
    const secPick  = sec.length  ? pick(rng, sec)  : null;
    if (primPick) applyFactor(q, primPick, 1.05);
    if (secPick)  applyFactor(q, secPick,  1.03);

    // Build a readable note for commentary
    const elText  = elBoosts.length ? `Element +5%: ${elBoosts.join(", ")}` : `Element: —`;
    const primTxt = primPick ? `${primPick} +5%` : "—";
    const secTxt  = secPick  ? `${secPick} +3%`  : "—";
    notes.push(`${q.name}: Mood=${moodBand.name}${moodPct?` (${(moodPct*100).toFixed(1)}%)`:""} | ${elText} | Style: ${primTxt} / ${secTxt}`);

    return q;
  });

  return { team: buffed, notes };
}
