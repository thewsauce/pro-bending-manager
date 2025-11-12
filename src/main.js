// src/main.js
// Robust roster loader (works in GH Pages/Vite), conservative game loop, 15s announcer.
// No changes to sim.js required.

import { simulateRound, recoverBetweenRounds } from "./sim.js";
import { buildAnnouncer } from "./announcer.js";
import { mulberry32 } from "./util.js";

/* -------------------------------------------------------
   DOM handles (adjust IDs only if your page differs)
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

/* -------------------------------------------------------
   Roster loading (multi-strategy)
------------------------------------------------------- */
async function loadRoster() {
  // (1) Global injected (e.g., via data.js)
  if (globalThis.ROSTER && typeof globalThis.ROSTER === "object") {
    setText(els.status, "Rosters loaded (global).");
    return globalThis.ROSTER;
  }

  // (2) Embedded in HTML
  const tag = document.getElementById("roster-json");
  if (tag?.textContent?.trim()) {
    try {
      const j = JSON.parse(tag.textContent);
      setText(els.status, "Rosters loaded (inline).");
      return j;
    } catch {}
  }

  // (3) Bundler-safe URL (copies file when placed in src and built with ?url or import.meta.url)
  try {
    const href = new URL("./roster.json", import.meta.url).href;
    const r = await fetch(href, { cache: "no-cache" });
    if (r.ok) {
      setText(els.status, "Rosters loaded (import.meta.url).");
      return await r.json();
    }
  } catch {}

  // (4) Plain relative fetch from site root/public
  for (const u of ["./roster.json", "roster.json", "/roster.json"]) {
    try {
      const r = await fetch(u, { cache: "no-cache" });
      if (r.ok) {
        setText(els.status, `Rosters loaded (${u}).`);
        return await r.json();
      }
    } catch {}
  }

  // (5) Dynamic import from data.js fallback
  try {
    const mod = await import("./data.js");
    const candidate = mod?.default || mod?.ROSTER || globalThis.ROSTER;
    if (candidate) {
      setText(els.status, "Rosters loaded (data.js).");
      return candidate;
    }
  } catch {}

  setText(els.status, "Failed to load rosters.");
  throw new Error("Unable to load roster via any strategy.");
}

/* -------------------------------------------------------
   Team helpers
------------------------------------------------------- */
const cloneP = (p) => ({ ...p });
const buildTeam = (roster, ids) => ids.map(id => cloneP(roster.players[id]));

function fmtPlayer(p){
  const n = (x)=>x??0;
  const ovr = Math.round((n(p.STR)+n(p.PRC)+n(p.INI)+n(p.RHY)+n(p.GST)+n(p.AWR)+n(p.CMP)+n(p.POS))/8);
  return `${p.name} | ${p.el?.toUpperCase()||"?"} | OVR:${ovr} | INI:${p.INI} STR:${p.STR} PRC:${p.PRC} GST:${p.GST} AWR:${p.AWR} RHY:${p.RHY} CMP:${p.CMP} POS:${p.POS} STM:${p.STM} END:${p.END}`;
}
function renderTeam(el, team){
  if (!el) return;
  el.textContent = team.map(fmtPlayer).join("\n");
}

/* -------------------------------------------------------
   Announcer (works even if sim.js doesn’t emit events)
------------------------------------------------------- */
function synthesizeEventsFromTimeline(timeline) {
  const ev = Array.from({ length: timeline.length }, () => []);
  for (let t = 1; t < timeline.length; t++) {
    const dz = timeline[t] - timeline[t-1];
    if (Math.abs(dz) > 0.6) {
      ev[t].push({
        type: "zone",
        SIDE: dz > 0 ? "Blue" : "Red",
        ZONE: (timeline[t] >= 0 ? "+" : "") + timeline[t].toFixed(1),
      });
    }
  }
  return ev;
}
function renderAnnouncer(result, dt, seed) {
  const rng = mulberry32(String(seed) + ":announcer");
  const events = result.events ?? synthesizeEventsFromTimeline(result.timeline);
  const lines = buildAnnouncer(events, dt, result.timeline, rng);
  if (els.commentary) els.commentary.textContent = lines.join("\n");
}

/* -------------------------------------------------------
   Tiny timeline renderer
------------------------------------------------------- */
function drawTimeline(timeline) {
  const c = els.timelineCanvas;
  if (!c || !c.getContext) return;
  const ctx = c.getContext("2d");
  const W = c.width || c.clientWidth || 900;
  const H = c.height || c.clientHeight || 140;
  c.width = W; c.height = H;
  ctx.clearRect(0,0,W,H);
  // midline
  ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
  // path
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i=0;i<timeline.length;i++){
    const x = (i/(timeline.length-1)) * W;
    const y = H/2 - (timeline[i]/3) * (H/2 - 8);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

/* -------------------------------------------------------
   First mover (leave your deeper logic elsewhere)
------------------------------------------------------- */
function firstMoverDecision(_blue,_red,seed){
  const h = [...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return (h % 2 === 0) ? "blue" : "red";
}

/* -------------------------------------------------------
   Round + Match loops (conservative)
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

  renderAnnouncer(result, dt, seed);
  drawTimeline(result.timeline);

  setText(els.result, `Round Winner: ${result.winner} | Final zone: ${result.zone > 0 ? "+" : ""}${result.zone}`);
  if (els.summary) {
    const bz = result.endFactors?.ticksBlueZone ?? 0;
    const rz = result.endFactors?.ticksRedZone ?? 0;
    const L = result.timeline?.length || 1;
    setText(els.summary, `Zone Control — Blue ${Math.round(bz/L*100)}% / Red ${Math.round(rz/L*100)}%`);
  }

  const carryNext = recoverBetweenRounds(blueTeam, redTeam, result.endFactors);
  return { result, carryNext };
}

async function runMatch({ roster, rounds, seed, dt }){
  const teamIds = Object.keys(roster.teams || {});
  const blueId = teamIds[0];
  const redId  = teamIds[1] || teamIds[0];

  const blueTeam = buildTeam(roster, roster.teams[blueId]);
  const redTeam  = buildTeam(roster, roster.teams[redId]);

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
    setText(els.commentary, "Could not load rosters. Check src/roster.json path.");
    return; // stop; prevent run buttons from firing a broken sim
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

  // Optional: auto-run once in dev
  // startOne();
})();
