// src/main.js
// UI orchestrator for Pro-Bending Manager.
// Fixes: robust roster.json loading for GH Pages subpaths (no 404 crash).
// Adds: 15s burst "boxing announcer" commentary in the UI (no sim changes).

import { simulateRound, recoverBetweenRounds } from "./sim.js";
import { buildAnnouncer } from "./announcer.js";
import { mulberry32 } from "./util.js";

// ---------- DOM ----------
const els = {
  run1: document.getElementById("runRound") || document.getElementById("runBtn") || document.getElementById("startBtn"),
  next: document.getElementById("nextRound"),
  reset: document.getElementById("resetMatch"),
  seed: document.getElementById("seed"),
  dt: document.getElementById("dt"),
  variance: document.getElementById("variance"),
  cadence: document.getElementById("cadence"),
  slow: document.getElementById("slowAnnouncer"),
  result: document.getElementById("result") || document.getElementById("winner"),
  blueBox: document.getElementById("blueTeam"),
  redBox: document.getElementById("redTeam"),
  commentary: document.getElementById("commentary") || document.getElementById("log"),
  summary: document.getElementById("summary"),
  timelineCanvas: document.getElementById("timeline"),
  status: document.getElementById("status") || document.getElementById("rosterStatus"),
};

function setText(el, s){ if (el) el.textContent = s; }
function appendText(el, s){ if (el) el.textContent = (el.textContent ? el.textContent + "\n" : "") + s; }

// ---------- Roster loading (robust to subpath / base href quirks) ----------
async function tryFetch(url){
  try{
    const res = await fetch(url, { cache: "no-cache" });
    if (res.ok) return await res.json();
  }catch(_e){ /* ignore */ }
  return null;
}
async function loadRoster() {
  // Try a few safe candidates in order
  const base = location.pathname.replace(/\/index\.html?$/i,"");
  const candidates = [
    "src/roster.json",
    "./src/roster.json",
    `${base}/src/roster.json`,
    new URL("src/roster.json", document.baseURI).href,
    "/src/roster.json"
  ];
  for (const u of candidates){
    const j = await tryFetch(u);
    if (j) {
      if (els.status) setText(els.status, "Rosters loaded.");
      return j;
    }
  }
  if (els.status) setText(els.status, "Failed to load rosters.");
  throw new Error("Unable to load src/roster.json via any candidate path");
}

// ---------- Team build / display ----------
function cloneP(p){ return { ...p }; }
function buildTeam(roster, ids){ return ids.map(id => cloneP(roster.players[id])); }

function fmtPlayer(p){
  const nb = v => (v ?? 0);
  return `${p.name} | ${p.el?.toUpperCase()||"?"} | OVR ~ ${Math.round(
    (nb(p.STR)+nb(p.PRC)+nb(p.INI)+nb(p.RHY)+nb(p.GST)+nb(p.AWR)+nb(p.CMP)+nb(p.POS))/8
  )} | INI:${p.INI} STR:${p.STR} PRC:${p.PRC} GST:${p.GST} AWR:${p.AWR} RHY:${p.RHY} CMP:${p.CMP} POS:${p.POS} STM:${p.STM} END:${p.END}`;
}
function renderTeam(el, team){
  if (!el) return;
  el.textContent = team.map(fmtPlayer).join("\n");
}

// ---------- Announcer helpers (no sim changes required) ----------
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

// ---------- Tiny timeline renderer (optional) ----------
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

// ---------- First mover (use your dedicated start_order if you have it) ----------
function firstMoverDecision(_blue,_red,seed){
  const h = [...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return (h % 2 === 0) ? "blue" : "red";
}

// ---------- Round runner ----------
async function runOneRound(ctx){
  const { seed, dt, blueTeam, redTeam, carry } = ctx;
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

  // Minimal summary line
  if (els.summary) {
    const bluePct = Math.round((result.endFactors?.ticksBlueZone ?? 0) / (result.timeline?.length || 1) * 100);
    const redPct  = Math.round((result.endFactors?.ticksRedZone  ?? 0) / (result.timeline?.length || 1) * 100);
    setText(els.summary, `Zone Control — Blue ${bluePct}% / Red ${redPct}%`);
  }

  const carryNext = recoverBetweenRounds(blueTeam, redTeam, result.endFactors);
  return { result, carryNext };
}

// ---------- Match loop ----------
async function runMatch(opts){
  const { roster, rounds, seed, dt } = opts;

  // pick two teams (keep your previous selection logic if you had UI)
  const teamIds = Object.keys(roster.teams || {});
  const blueId = teamIds[0];
  const redId  = teamIds[1] || teamIds[0];

  const blueTeam = buildTeam(roster, roster.teams[blueId]);
  const redTeam  = buildTeam(roster, roster.teams[redId]);

  renderTeam(els.blueBox, blueTeam);
  renderTeam(els.redBox,  redTeam);

  if (els.commentary) els.commentary.textContent = "-";

  let carry = null;
  let bw=0, rw=0;
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

// ---------- Bootstrap / Controls ----------
(async function init(){
  setText(els.result, "-");
  setText(els.commentary, "-");
  setText(els.summary, "-");
  if (els.status) setText(els.status, "Loading rosters…");

  let roster = null;
  try {
    roster = await loadRoster();
  } catch (e) {
    console.error(e);
    if (els.commentary) setText(els.commentary, "Could not load rosters. Check src/roster.json path.");
    return; // stop; do not wire run buttons if data missing
  }

  const getSeed = () => (els.seed?.value?.trim() || "stormfront42");
  const getDt = () => Math.max(1, parseInt(els.dt?.value || "5", 10));

  const start = async () => {
    if (els.commentary) els.commentary.textContent = "";
    await runMatch({
      roster,
      rounds: 1,
      seed: getSeed(),
      dt: getDt()
    });
  };

  if (els.run1) els.run1.onclick = start;
  if (els.next) els.next.onclick = start;
  if (els.reset) els.reset.onclick = () => {
    if (els.commentary) els.commentary.textContent = "-";
    setText(els.result, "-");
    setText(els.summary, "-");
    drawTimeline([0,0]); // clear-ish
  };

  // Optional: auto-run once if you prefer
  // start();
})();
