// src/main.js
// Pro-Bending Manager — UI orchestrator + announcer + robust roster loader.
// This version matches the IDs used in index.html in your zip.

import { simulateRound, recoverBetweenRounds } from "./sim.js";
import { buildAnnouncer } from "./announcer.js";
import { mulberry32 } from "./util.js";

/* ---------------- DOM wires (match your HTML) ---------------- */
const els = {
  run:      document.getElementById("runBtn"),
  next:     document.getElementById("nextBtn"),
  reset:    document.getElementById("resetBtn"),
  seed:     document.getElementById("seed"),
  dt:       document.getElementById("dt"),
  result:   document.getElementById("result"),
  blueBox:  document.getElementById("blueRoster"),
  redBox:   document.getElementById("redRoster"),
  log:      document.getElementById("log"),
  summary:  document.getElementById("summary"),
  graph:    document.getElementById("graph"),
  boot:     document.getElementById("boot"),
};

const setText   = (el, s) => { if (el) el.textContent = s; };
const appendTxt = (el, s) => { if (el) el.textContent = (el.textContent ? el.textContent + "\n" : "") + s; };
const f1        = (x) => Number.isFinite(x) ? x.toFixed(1) : "0.0";

/* ---------------- Roster loading (GH Pages + your data.js) ---------------- */
async function loadRoster() {
  const tried = [];

  // 1) Inline script support
  const tag = document.getElementById("roster-json");
  if (tag?.textContent?.trim()) {
    try {
      const j = JSON.parse(tag.textContent);
      setText(els.boot, "Rosters loaded (inline).");
      return j;
    } catch (e) { console.warn("[roster] inline parse failed", e); }
  }

  // 2) JSON files (plural first — your zip uses src/rosters.json)
  const plain = [
    "src/rosters.json", "./src/rosters.json",
    "src/roster.json",  "./src/roster.json",
    "rosters.json",     "./rosters.json",
    "roster.json",      "./roster.json", "/roster.json"
  ];
  for (const u of plain) {
    tried.push(u);
    try {
      const r = await fetch(u, { cache: "no-cache" });
      if (r.ok) {
        setText(els.boot, `Rosters loaded (${u}).`);
        return await r.json();
      }
    } catch (e) {
      console.debug("[roster] fetch error", u, e);
    }
  }

  // 3) data.js loader (your current file exports loadRosters())
  try {
    const mod = await import("./data.js");
    if (typeof mod?.loadRosters === "function") {
      const j = await mod.loadRosters();
      setText(els.boot, "Rosters loaded (data.js loader).");
      return j;
    }
  } catch (e) {
    console.warn("[roster] data.js loader failed", e);
  }

  // 4) Global injected
  if (globalThis.ROSTER && typeof globalThis.ROSTER === "object") {
    setText(els.boot, "Rosters loaded (global).");
    return globalThis.ROSTER;
  }

  setText(els.boot, `Failed to load rosters. Tried: ${tried.join(", ")}`);
  throw new Error("Roster load failed");
}

/* ---------------- Team helpers ---------------- */
const cloneP   = (p) => ({ ...p });
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

/* ---------------- Announcer support ---------------- */
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
  return lines;
}

/* ---------------- Tiny timeline graph ---------------- */
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

  if (!Array.isArray(timeline) || timeline.length === 0) return;

  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath();
  for (let i=0;i<timeline.length;i++){
    const z = Number.isFinite(timeline[i]) ? timeline[i] : 0;
    const x = (i/(timeline.length-1)) * W;
    const y = H/2 - (z/3) * (H/2 - 8); // assume zone ≈ [-3,+3]
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

/* ---------------- First mover ---------------- */
function firstMoverDecision(_blue,_red,seed){
  const h = [...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return (h % 2 === 0) ? "blue" : "red";
}

/* ---------------- One round ---------------- */
async function runOneRound({ seed, dt, blueTeam, redTeam, carry }) {
  const first = firstMoverDecision(blueTeam, redTeam, seed);

  const result = simulateRound({
    seed, dt, blue: blueTeam, red: redTeam, firstMover: first
  });

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

/* ---------------- Match loop ---------------- */
async function runMatch({ roster, rounds, seed, dt }){
  const teamIds = Object.keys(roster.teams || {});
  const blueId = teamIds[0];
  const redId  = teamIds[1] || teamIds[0];

  const blueTeam = buildTeam(roster, roster.teams[blueId] || []);
  const redTeam  = buildTeam(roster, roster.teams[redId]  || []);

  renderTeam(els.blueBox, blueTeam);
  renderTeam(els.redBox,  redTeam);

  if (els.log) els.log.textContent = "";

  let carry = null, bw = 0, rw = 0;
  for (let r=1; r<=rounds; r++){
    const { result, carryNext } = await runOneRound({
      seed: `${seed}:R${r}`, dt, blueTeam, redTeam, carry
    });
    if (result.winner === "Blue") bw++;
    else if (result.winner === "Red") rw++;
    appendTxt(els.log, `\n— End of Round ${r}: ${result.winner} —`);
    carry = carryNext;
  }
  appendTxt(els.log, `\nFinal: Blue ${bw} — Red ${rw}`);
}

/* ---------------- Bootstrap ---------------- */
(async function init(){
  setText(els.result, "—");
  setText(els.summary, "—");
  setText(els.log, "—");
  setText(els.boot, "Loading rosters…");

  let roster;
  try {
    roster = await loadRoster();
  } catch (e) {
    console.error("Roster load error:", e);
    setText(els.log, "❌ Could not load rosters. Check Console → Network for which roster url 404'd.");
    return;
  }

  const seedOf = () => (els.seed?.value?.trim() || `stormfront-${Date.now()}`);
  const dtOf   = () => Math.max(1, parseInt(els.dt?.value || "5", 10));

  const startOne = async () => {
    if (els.log) els.log.textContent = "";
    await runMatch({ roster, rounds: 1, seed: seedOf(), dt: dtOf() });
  };

  if (els.run)  els.run.onclick  = startOne;
  if (els.next) els.next.onclick = startOne;
  if (els.reset) els.reset.onclick = () => {
    setText(els.log, "—");
    setText(els.result, "—");
    setText(els.summary, "—");
    drawTimeline([0,0]);
  };

  // Enable buttons now that roster is in
  [els.run, els.next, els.reset].forEach(b => { if (b) b.disabled = false; });
  setText(els.boot, "Rosters loaded.");
})();
