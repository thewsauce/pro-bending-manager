// src/main.js
// Pro-Bending Manager — UI orchestrator + announcer + robust roster loader.
// Works on raw GitHub Pages (no bundler) and tolerates future Vite builds.

import { simulateRound, recoverBetweenRounds } from "./sim.js";
import { buildAnnouncer } from "./announcer.js";
import { mulberry32 } from "./util.js";

/* -------------------------------------------------------
   DOM wires (match your page IDs)
------------------------------------------------------- */
const els = {
  run1: document.getElementById("runRound"),
  next: document.getElementById("nextRound"),
  reset: document.getElementById("resetMatch"),
  seed: document.getElementById("seed"),
  dt: document.getElementById("dt"),
  result: document.getElementById("result"),
  blueBox: document.getElementById("blueTeam"),
  redBox: document.getElementById("redTeam"),
  commentary: document.getElementById("commentary"),
  summary: document.getElementById("summary"),
  timelineCanvas: document.getElementById("timeline"),
  status: document.getElementById("rosterStatus") || document.getElementById("status"),
};

const setText = (el, s) => { if (el) el.textContent = s; };
const appendText = (el, s) => { if (el) el.textContent = (el.textContent ? el.textContent + "\n" : "") + s; };
const f1 = (x) => Number.isFinite(x) ? x.toFixed(1) : "0.0";

/* -------------------------------------------------------
   Roster loading (diagnostic, GH Pages first)
------------------------------------------------------- */
async function loadRoster() {
  const tried = [];

  // (0) Global injected (window.ROSTER)
  if (globalThis.ROSTER && typeof globalThis.ROSTER === "object") {
    setText(els.status, "Rosters loaded (global).");
    console.debug("[roster] using globalThis.ROSTER");
    return globalThis.ROSTER;
  }

  // (1) Inline JSON in HTML
  const tag = document.getElementById("roster-json");
  if (tag?.textContent?.trim()) {
    try {
      const j = JSON.parse(tag.textContent);
      setText(els.status, "Rosters loaded (inline).");
      console.debug("[roster] loaded inline <script id=roster-json>");
      return j;
    } catch (e) {
      console.warn("[roster] inline parse failed:", e);
    }
  }

  // (2) Plain paths (works on raw GitHub Pages)
  const plain = ["src/roster.json", "./src/roster.json", "roster.json", "./roster.json", "/roster.json"];
  for (const u of plain) {
    tried.push(u);
    try {
      const r = await fetch(u, { cache: "no-cache" });
      console.debug("[roster] fetch", u, r.status);
      if (r.ok) {
        setText(els.status, `Rosters loaded (${u}).`);
        return await r.json();
      }
    } catch (e) {
      console.warn("[roster] fetch error", u, e);
    }
  }

  // (3) Vite-style asset via import.meta.url (only after bundling)
  try {
    const href = new URL("./roster.json", import.meta.url).href;
    tried.push(href);
    const r = await fetch(href, { cache: "no-cache" });
    console.debug("[roster] fetch", href, r.status);
    if (r.ok) {
      setText(els.status, "Rosters loaded (import.meta.url).");
      return await r.json();
    }
  } catch (e) {
    console.warn("[roster] import.meta.url failed:", e);
  }

  // (4) data.js fallback
  try {
    const mod = await import("./data.js");
    const candidate = mod?.default || mod?.ROSTER || globalThis.ROSTER;
    if (candidate) {
      setText(els.status, "Rosters loaded (data.js).");
      console.debug("[roster] loaded from data.js");
      return candidate;
    }
  } catch (e) {
    console.warn("[roster] data.js import failed:", e);
  }

  const msg = `Failed to load rosters. Tried: ${tried.join(", ")}`;
  setText(els.status, msg);
  throw new Error(msg);
}

/* -------------------------------------------------------
   Team helpers
------------------------------------------------------- */
const cloneP = (p) => ({ ...p });
const buildTeam = (roster, ids) => (ids || []).map(id => cloneP(roster.players[id] ?? {}));

function fmtPlayer(p){
  const n = (x)=> Number.isFinite(x) ? x : 0;
  const ovr = Math.round((n(p.STR)+n(p.PRC)+n(p.INI)+n(p.RHY)+n(p.GST)+n(p.AWR)+n(p.CMP)+n(p.POS))/8);
  const el = (p.el?.toUpperCase?.() ?? "?");
  return `${p.name ?? "?"} | ${el} | OVR ~ ${ovr} | INI:${n(p.INI)} STR:${n(p.STR)} PRC:${n(p.PRC)} GST:${n(p.GST)} AWR:${n(p.AWR)} RHY:${n(p.RHY)} CMP:${n(p.CMP)} POS:${n(p.POS)} STM:${n(p.STM)} END:${n(p.END)}`;
}
function renderTeam(el, team){
  if (!el) return;
  el.textContent = team.map(fmtPlayer).join("\n");
}

/* -------------------------------------------------------
   Announcer support
------------------------------------------------------- */
function synthesizeEventsFromTimeline(timeline = []) {
  const ev = Array.from({ length: timeline.length }, () => []);
  for (let t = 1; t < timeline.length; t++) {
    const prev = Number.isFinite(timeline[t-1]) ? timeline[t-1] : 0;
    const curr = Number.isFinite(timeline[t])   ? timeline[t]   : 0;
    const dz = curr - prev;
    if (Math.abs(dz) > 0.6) {
      ev[t].push({
        type: "zone",
        SIDE: dz > 0 ? "Blue" : "Red",
        ZONE: (curr >= 0 ? "+" : "") + f1(curr),
      });
    }
  }
  return ev;
}

function renderAnnouncer(result, dt, seed) {
  const rng = mulberry32(String(seed) + ":announcer");
  const events = result?.events ?? synthesizeEventsFromTimeline(result?.timeline ?? []);
  const lines = buildAnnouncer(events, dt, result?.timeline ?? [], rng);
  if (els.commentary) els.commentary.textContent = lines.join("\n");
  return lines;
}

/* -------------------------------------------------------
   Timeline (tiny canvas)
------------------------------------------------------- */
function drawTimeline(timeline = []) {
  const c = els.timelineCanvas;
  if (!c || !c.getContext) return;
  const ctx = c.getContext("2d");
  const W = c.width  || c.clientWidth  || 900;
  const H = c.height || c.clientHeight || 160;
  c.width = W; c.height = H;

  ctx.clearRect(0,0,W,H);

  // midline
  ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();

  if (!Array.isArray(timeline) || timeline.length === 0) return;

  // path
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i=0;i<timeline.length;i++){
    const z = Number.isFinite(timeline[i]) ? timeline[i] : 0;
    const x = (i/(timeline.length-1)) * W;
    // assume zone in ~[-3,+3], map to canvas with padding
    const y = H/2 - (z/3) * (H/2 - 8);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

/* -------------------------------------------------------
   First mover (simple; swap with start_order.js if you have it)
------------------------------------------------------- */
function firstMoverDecision(_blue,_red,seed){
  const h = [...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return (h % 2 === 0) ? "blue" : "red";
}

/* -------------------------------------------------------
   Round runner
------------------------------------------------------- */
async function runOneRound({ seed, dt, blueTeam, redTeam, carry }) {
  const first = firstMoverDecision(blueTeam, redTeam, seed);

  const result = simulateRound({
    seed,
    dt,
    blue: blueTeam,
    red:  redTeam,
    firstMover: first
  });

  // Announcer + Graph
  renderAnnouncer(result, dt, seed);
  drawTimeline(result.timeline);

  // Result + summary
  const zone = Number.isFinite(result.zone) ? (result.zone >= 0 ? `+${f1(result.zone)}` : f1(result.zone)) : "0.0";
  setText(els.result, `Round Winner: ${result.winner} | Final zone: ${zone}`);

  if (els.summary) {
    const L = (result.timeline?.length) || 1;
    const bz = Number.isFinite(result.endFactors?.ticksBlueZone) ? result.endFactors.ticksBlueZone : 0;
    const rz = Number.isFinite(result.endFactors?.ticksRedZone)  ? result.endFactors.ticksRedZone  : 0;
    const bPct = Math.round((bz / L) * 100);
    const rPct = Math.round((rz / L) * 100);
    setText(els.summary, `Zone Control — Blue ${bPct}% / Red ${rPct}%`);
  }

  const carryNext = recoverBetweenRounds(blueTeam, redTeam, result.endFactors);
  return { result, carryNext };
}

/* -------------------------------------------------------
   Match loop (single round by default)
------------------------------------------------------- */
async function runMatch({ roster, rounds, seed, dt }){
  const teamIds = Object.keys(roster.teams || {});
  const blueId = teamIds[0];
  const redId  = teamIds[1] || teamIds[0];

  const blueTeam = buildTeam(roster, roster.teams[blueId] || []);
  const redTeam  = buildTeam(roster, roster.teams[redId]  || []);

  renderTeam(els.blueBox, blueTeam);
  renderTeam(els.redBox,  redTeam);

  if (els.commentary) els.commentary.textContent = "";

  let carry = null, bw = 0, rw = 0;
  for (let r=1; r<=rounds; r++){
    const { result, carryNext } = await runOneRound({
      seed: `${seed}:R${r}`,
      dt,
      blueTeam,
      redTeam,
      carry
    });
    if (result.winner === "Blue") bw++;
    else if (result.winner === "Red") rw++;
    appendText(els.commentary, `\n— End of Round ${r}: ${result.winner} —`);
    carry = carryNext;
  }
  appendText(els.commentary, `\nFinal: Blue ${bw} — Red ${rw}`);
}

/* -------------------------------------------------------
   Bootstrap
------------------------------------------------------- */
(async function init(){
  setText(els.result, "-");
  setText(els.summary, "-");
  setText(els.commentary, "-");
  if (els.status) setText(els.status, "Loading rosters…");

  let roster;
  try {
    roster = await loadRoster();
  } catch (e) {
    console.error("Roster load error:", e);
    setText(els.commentary, "❌ Could not load rosters. Open Console → Network and click `src/roster.json`. If it 404s, ensure the file exists and path matches.");
    return;
  }

  const seedOf = () => (els.seed?.value?.trim() || "stormfront42");
  const dtOf   = () => Math.max(1, parseInt(els.dt?.value || "5", 10));

  const startOne = async () => {
    if (els.commentary) els.commentary.textContent = "";
    await runMatch({ roster, rounds: 1, seed: seedOf(), dt: dtOf() });
  };

  if (els.run1) els.run1.onclick = startOne;
  if (els.next) els.next.onclick = startOne;
  if (els.reset) els.reset.onclick = () => {
    setText(els.commentary, "-");
    setText(els.result, "-");
    setText(els.summary, "-");
    drawTimeline([0,0]);
  };

  // Optional dev auto-run:
  // startOne();
})();
