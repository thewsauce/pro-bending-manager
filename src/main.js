// src/main.js
// Preload rosters, render teams on load, safe button state, announcer + graph.

import { simulateRound, recoverBetweenRounds } from "./sim.js";
import { buildAnnouncer } from "./announcer.js";
import { mulberry32 } from "./util.js";

/* ---------------- DOM wires (support both naming schemes) ---------------- */
const q = (idA, idB) => document.getElementById(idA) || document.getElementById(idB);
const els = {
  run:      q("runRound","runBtn"),
  next:     q("nextRound","nextBtn"),
  reset:    q("resetMatch","resetBtn"),
  seed:     q("seed","seedInput"),
  dt:       q("dt","stepInput"),
  result:   q("result"),
  blueBox:  q("blueTeam","blueRoster"),
  redBox:   q("redTeam","redRoster"),
  log:      q("commentary","log"),
  summary:  q("summary"),
  graph:    q("timeline","graph"),
  status:   q("rosterStatus","boot"),
};

const setText   = (el, s) => { if (el) el.textContent = s; };
const appendTxt = (el, s) => { if (el) el.textContent = (el.textContent ? el.textContent + "\n" : "") + s; };
const f1        = (x) => Number.isFinite(x) ? x.toFixed(1) : "0.0";

let rosterCache = null;
let isRunning   = false;

/* ---------------- Roster loading (tries plural/singular + data.js) ---------------- */
async function loadRoster() {
  const tried = [];

  // Inline JSON
  const tag = document.getElementById("roster-json");
  if (tag?.textContent?.trim()) {
    try {
      const j = JSON.parse(tag.textContent);
      setText(els.status, "Rosters loaded (inline).");
      return j;
    } catch {}
  }

  // JSON on disk (plural first)
  const plain = [
    "src/rosters.json","./src/rosters.json",
    "src/roster.json","./src/roster.json",
    "rosters.json","./rosters.json",
    "roster.json","./roster.json","/roster.json"
  ];
  for (const u of plain) {
    tried.push(u);
    try {
      const r = await fetch(u, { cache: "no-cache" });
      if (r.ok) {
        setText(els.status, `Rosters loaded (${u}).`);
        return await r.json();
      }
    } catch {}
  }

  // data.js loader (loadRosters())
  try {
    const mod = await import("./data.js");
    if (typeof mod?.loadRosters === "function") {
      const j = await mod.loadRosters();
      setText(els.status, "Rosters loaded (data.js).");
      return j;
    }
    const candidate = mod?.default || mod?.ROSTER;
    if (candidate) {
      setText(els.status, "Rosters loaded (data.js export).");
      return candidate;
    }
  } catch {}

  // Global fallback
  if (globalThis.ROSTER && typeof globalThis.ROSTER === "object") {
    setText(els.status, "Rosters loaded (global).");
    return globalThis.ROSTER;
  }

  const msg = `Failed to load rosters. Tried: ${tried.join(", ")}`;
  setText(els.status, msg);
  throw new Error(msg);
}

/* ---------------- Team helpers ---------------- */
const cloneP    = (p) => ({ ...p });
const buildTeam = (roster, ids) => (ids || []).map(id => cloneP(roster.players[id] ?? {}));

function fmtPlayer(p){
  const n = (x)=> Number.isFinite(x) ? x : 0;
  const el = (p.el?.[0]?.toUpperCase?.() ?? "?") + (p.el?.slice?.(1) ?? "");
  const g  = (p.gender || "?").toUpperCase();
  const ovr = Math.round((n(p.STR)+n(p.PRC)+n(p.INI)+n(p.RHY)+n(p.GST)+n(p.AWR)+n(p.CMP)+n(p.POS))/8);
  const keys = ["INI","STR","PRC","GST","AWR","RHY","CMP","POS","STM","END"];
  const core = keys.map(k => `${k}:${String(n(p[k])).padStart(2," ")}`).join(" ");
  return `${(p.name||"?").padEnd(10)} | ${el}/${g} | OVR ~ ${String(ovr).padStart(2," ")} | ${core}`;
}
function renderTeam(el, team){
  if (!el) return;
  el.textContent = team.map(fmtPlayer).join("\n");
}

/* ---------------- Announcer + graph ---------------- */
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
  const rng    = mulberry32(String(seed) + ":announcer");
  const events = result?.events ?? synthesizeEventsFromTimeline(result?.timeline ?? []);
  const lines  = buildAnnouncer(events, dt, result?.timeline ?? [], rng);
  if (els.log) els.log.textContent = lines.join("\n");
}
function drawTimeline(timeline = []) {
  const c = els.graph;
  if (!c || !c.getContext) return;
  const ctx = c.getContext("2d");
  const W = c.width  || c.clientWidth  || 900;
  const H = c.height || c.clientHeight || 220;
  c.width = W; c.height = H;

  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle = "#555"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();

  if (!timeline.length) return;

  ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i=0;i<timeline.length;i++){
    const z = Number.isFinite(timeline[i]) ? timeline[i] : 0;
    const x = (i/(timeline.length-1)) * W;
    const y = H/2 - (z/3) * (H/2 - 8);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

/* ---------------- First mover ---------------- */
function firstMoverDecision(_blue,_red,seed){
  const h = [...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return (h % 2 === 0) ? "blue" : "red";
}

/* ---------------- Round + Match ---------------- */
async function runOneRound({ seed, dt, blueTeam, redTeam, carry }) {
  const first = firstMoverDecision(blueTeam, redTeam, seed);

  const result = simulateRound({ seed, dt, blue: blueTeam, red: redTeam, firstMover: first });

  renderAnnouncer(result, dt, seed);
  drawTimeline(result.timeline);

  const zone = Number.isFinite(result.zone) ? (result.zone >= 0 ? `+${f1(result.zone)}` : f1(result.zone)) : "0.0";
  setText(els.result, `Round Winner: ${result.winner}\nFinal zone: ${zone}`);

  if (els.summary) {
    const L  = (result.timeline?.length) || 1;
    const bz = Number.isFinite(result.endFactors?.ticksBlueZone) ? result.endFactors.ticksBlueZone : 0;
    const rz = Number.isFinite(result.endFactors?.ticksRedZone)  ? result.endFactors.ticksRedZone  : 0;
    setText(els.summary, `Zone Control — Blue ${Math.round((bz/L)*100)}% / Red ${Math.round((rz/L)*100)}%`);
  }

  const carryNext = recoverBetweenRounds(blueTeam, redTeam, result.endFactors);
  return { result, carryNext };
}

async function runMatchOnce(seed, dt){
  if (!rosterCache) return;

  const teamIds = Object.keys(rosterCache.teams || {});
  const blueId = teamIds[0];
  const redId  = teamIds[1] || teamIds[0];

  const blueTeam = buildTeam(rosterCache, rosterCache.teams[blueId] || []);
  const redTeam  = buildTeam(rosterCache, rosterCache.teams[redId]  || []);

  renderTeam(els.blueBox, blueTeam);
  renderTeam(els.redBox,  redTeam);

  setText(els.log, "");
  let carry = null;
  try {
    const { result, carryNext } = await runOneRound({
      seed: `${seed}:R1`, dt, blueTeam, redTeam, carry
    });
    carry = carryNext;
    appendTxt(els.log, `\n— End of Round 1: ${result.winner} —`);
    appendTxt(els.log, `\nFinal: ${result.winner === "Blue" ? "Blue 1 — Red 0" : "Blue 0 — Red 1"}`);
  } catch (e) {
    console.error(e);
    appendTxt(els.log, "\n❌ Round crashed. Check console for details.");
  }
}

/* ---------------- Bootstrap ---------------- */
(async function init(){
  setText(els.result, "—");
  setText(els.summary, "—");
  setText(els.log, "—");
  setText(els.status, "Loading rosters…");

  // Disable buttons until ready
  [els.run, els.next, els.reset].forEach(b => { if (b) b.disabled = true; });

  try {
    rosterCache = await loadRoster();
    setText(els.status, "Rosters loaded.");

    // Render default teams immediately (no round yet)
    const teamIds = Object.keys(rosterCache.teams || {});
    const blueId = teamIds[0];
    const redId  = teamIds[1] || teamIds[0];
    renderTeam(els.blueBox, buildTeam(rosterCache, rosterCache.teams[blueId] || []));
    renderTeam(els.redBox,  buildTeam(rosterCache, rosterCache.teams[redId]  || []));

    // Wire handlers now that rosters exist
    const seedOf = () => (els.seed?.value?.trim() || `stormfront-${Date.now()}`);
    const dtOf   = () => Math.max(1, parseInt(els.dt?.value || "5", 10));

    const start = async () => {
      if (isRunning) return;
      isRunning = true;
      [els.run, els.next].forEach(b => { if (b) b.disabled = true; });
      try {
        await runMatchOnce(seedOf(), dtOf());
      } finally {
        isRunning = false;
        [els.run, els.next].forEach(b => { if (b) b.disabled = false; });
      }
    };

    if (els.run)  els.run.onclick  = start;
    if (els.next) els.next.onclick = start;
    if (els.reset) els.reset.onclick = () => {
      setText(els.log, "—");
      setText(els.result, "—");
      setText(els.summary, "—");
      drawTimeline([0,0]);
      // Re-render teams (no changes to roster; just refresh panel)
      renderTeam(els.blueBox, buildTeam(rosterCache, rosterCache.teams[blueId] || []));
      renderTeam(els.redBox,  buildTeam(rosterCache, rosterCache.teams[redId]  || []));
    };

  } catch (e) {
    console.error("Roster load error:", e);
    setText(els.log, "❌ Could not load rosters. Open Console → Network and click the roster URL.");
    return;
  } finally {
    // Enable buttons when init completes (even if we error, Run stays disabled without rosters)
    if (rosterCache) [els.run, els.next, els.reset].forEach(b => { if (b) b.disabled = false; });
  }
})();
