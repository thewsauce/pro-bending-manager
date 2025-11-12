// src/main.js
// UI orchestrator for Pro-Bending Manager.
// Conservatively patched to add a 15s burst "boxing announcer" commentary
// WITHOUT modifying sim.js. If sim.js provides .events, we'll use them;
// otherwise we synthesize minimal events from the timeline swings.

import { simulateRound, recoverBetweenRounds } from "./sim.js";
import { buildAnnouncer } from "./announcer.js";
import { mulberry32 } from "./util.js";

// ----------------------------
// Minimal DOM helpers (adjust IDs to your page if needed)
const els = {
  start: document.getElementById("startBtn") || document.getElementById("runBtn"),
  seed: document.getElementById("seed") || document.getElementById("seedInput"),
  dt: document.getElementById("dt") || document.getElementById("stepInput"),
  commentary: document.getElementById("commentary") || document.getElementById("log"),
  winner: document.getElementById("winner"),
  graph: document.getElementById("graph"), // optional canvas/elem for timeline graph
};

function text(el, s){ if (el) el.textContent = s; }
function append(el, s){ if (el) el.textContent += (el.textContent ? "\n" : "") + s; }

// ----------------------------
// Team/roster bootstrap (load your roster.json the same way you already did)
async function loadRoster() {
  // Keep your established pathing; this mirrors your earlier fetch('src/roster.json')
  const res = await fetch("src/roster.json");
  if (!res.ok) throw new Error("Failed to load roster.json");
  return res.json();
}

function clonePlayer(p) {
  // return a shallow copy so round buffs don't mutate the base template
  return { ...p };
}

function buildTeam(roster, ids) {
  return ids.map(id => clonePlayer(roster.players[id]));
}

// ----------------------------
// Buff application (kept simple, call your existing ones if you have them)
function applyRoundBuffs(team) {
  // If you already do element/mood/style buffs elsewhere, no-op or wire here.
  // This is intentionally conservative to avoid changing balance.
  return team.map(p => ({ ...p }));
}

// ----------------------------
// First-move decision (use your existing logic if you have start_order.js)
function firstMoverDecision(blue, red, seed = "seed") {
  // Minimal deterministic nudge: alternate by seed parity
  // (If you have start_order.js, call it here instead!)
  const h = [...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return (h % 2 === 0) ? "blue" : "red";
}

// ----------------------------
// Announcer support: synthesize events if sim.js doesn't provide them.
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

// Render announcer lines into the commentary panel
function renderAnnouncer(result, dt, seed) {
  const rng = mulberry32(String(seed) + ":announcer");
  const events = result.events ?? synthesizeEventsFromTimeline(result.timeline);
  const lines = buildAnnouncer(events, dt, result.timeline, rng);
  if (els.commentary) els.commentary.textContent = lines.join("\n");
  return lines;
}

// ----------------------------
// Optional: tiny timeline graph (preserves existing behavior if you already draw)
function drawTimeline(timeline) {
  if (!els.graph || !timeline?.length) return;
  const ctx = els.graph.getContext?.("2d");
  if (!ctx) return;
  const W = els.graph.width, H = els.graph.height;
  ctx.clearRect(0,0,W,H);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H/2);
  for (let i=0;i<timeline.length;i++){
    const x = (i/(timeline.length-1)) * W;
    // zone is roughly -3..+3; map to H with midline
    const y = H/2 - (timeline[i]/3) * (H/2 - 6);
    ctx.lineTo(x,y);
  }
  ctx.stroke();
  // midline
  ctx.beginPath();
  ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
  ctx.lineWidth = 1; ctx.strokeStyle = "#888"; ctx.stroke();
  ctx.strokeStyle = "#fff";
}

// ----------------------------
// One round runner (kept close to your previous flow)
async function runOneRound({ seed, dt, blueTeam, redTeam, carry }) {
  const firstMover = firstMoverDecision(blueTeam, redTeam, seed);
  const blue = applyRoundBuffs(blueTeam);
  const red  = applyRoundBuffs(redTeam);

  const res = simulateRound({
    seed,
    dt,
    blue,
    red,
    firstMover
    // we do NOT pass variance/scale overrides here—keeping your defaults
  });

  // New: hypecaster commentary (15s bursts)
  renderAnnouncer(res, dt, seed);

  // Keep any prior "lines" rendering if you still want legacy text
  // append(els.commentary, res.lines.join("\n"));

  // Winner + graph
  text(els.winner, `Winner: ${res.winner}`);
  drawTimeline(res.timeline);

  // Between-round recovery mirrors your existing contract
  const carryNext = recoverBetweenRounds(blue, red, res.endFactors);
  return { res, carryNext };
}

// ----------------------------
// Full match loop (best-of-? or fixed rounds). Keep conservative defaults.
async function runMatch(seed = "seed", dt = 5, rounds = 1) {
  const roster = await loadRoster();

  // Choose teams (keep your existing selection if you have UI for this!)
  // Here we default to Stormfront vs Stormfront if only one team is defined.
  const allTeamIds = Object.keys(roster.teams || {});
  const teamAId = allTeamIds[0];
  const teamBId = allTeamIds[1] || allTeamIds[0];

  const blueTeam = buildTeam(roster, roster.teams[teamAId]);
  const redTeam  = buildTeam(roster, roster.teams[teamBId]);

  let carry = null;
  let blueWins = 0, redWins = 0;

  if (els.commentary) els.commentary.textContent = ""; // clear panel

  for (let r = 1; r <= rounds; r++) {
    const roundSeed = `${seed}:R${r}`;
    const { res, carryNext } = await runOneRound({ seed: roundSeed, dt, blueTeam, redTeam, carry });
    if (res.winner === "Blue") blueWins++;
    if (res.winner === "Red")  redWins++;
    carry = carryNext;

    // small header per round (non-announcer)
    append(els.commentary, `\n— End of Round ${r}: ${res.winner} —`);
  }

  append(els.commentary, `\nFinal: Blue ${blueWins} — Red ${redWins}`);
}

// ----------------------------
// Wire the Start button (keeps your original UX where possible)
function bootstrap() {
  const seedDefault = els.seed?.value || `stormfront-${Date.now()}`;
  const dtDefault = parseFloat(els.dt?.value ?? "5") || 5;

  if (els.start) {
    els.start.addEventListener("click", () => {
      const seed = els.seed?.value || seedDefault;
      const dt = parseFloat(els.dt?.value ?? dtDefault) || 5;
      runMatch(seed, dt, 1); // run a single 3:00 round by default
    });
  } else {
    // Autostart if no button exists (dev quality-of-life)
    runMatch(seedDefault, dtDefault, 1);
  }
}

bootstrap();
