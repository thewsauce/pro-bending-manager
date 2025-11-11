// src/sim.js
// Core simulator: single 3:00 round, ticked at dt seconds.
// Symmetric math, paired jitter to avoid color bias, and optional first-mover opener.

// Helpers from util.js
import { clamp } from "./util.js";
import { mulberry32 } from "./util.js"; // for internal seeded jitter if needed

// --- internal helpers ---
function avg(arr) {
  if (!arr || !arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function teamAvgStat(team, key) {
  return avg(team.map(p => p[key] ?? 0));
}

function offenseScore(team, stam, comp) {
  // Off = avg(STR,PRC,INI,RHY) * stam * (0.6 + 0.4*comp)
  const core = avg(team.map(p => avg([p.STR, p.PRC, p.INI, p.RHY])));
  return core * stam * (0.6 + 0.4 * comp);
}

function defenseScore(team, stam, comp) {
  // Def = avg(GST,AWR,CMP,POS) * (0.5 + 0.5*stam) * (0.7 + 0.3*comp)
  const core = avg(team.map(p => avg([p.GST, p.AWR, p.CMP, p.POS])));
  return core * (0.5 + 0.5 * stam) * (0.7 + 0.3 * comp);
}

// --- export: simulate a round ---
export function simulateRound(opts) {
  const {
    seed = "seed",
    dt = 5,                 // seconds per tick
    scale = 60,             // larger → heavier footing / smaller swings
    variancePct = 25,       // 0..100, typical 20–35
    blue, red,              // arrays of 3 players (buffed copies for this round)
    carry = null,           // {stamB, stamR, compB, compR} from previous round recovery
    firstMover = "blue"     // "blue" | "red", decides who gets the opening tick nudge
  } = opts;

  // ticks for a 180-second round (3:00)
  const TICKS = Math.max(1, Math.floor(180 / dt));

  // Baseline stamina & composure from team averages (or carried over)
  const stamB0 = carry?.stamB ?? (0.85 + (teamAvgStat(blue, "STM")/100) * 0.30);
  const stamR0 = carry?.stamR ?? (0.85 + (teamAvgStat(red,  "STM")/100) * 0.30);
  const compB0 = carry?.compB ?? (0.85 + (teamAvgStat(blue, "CMP")/100) * 0.30);
  const compR0 = carry?.compR ?? (0.85 + (teamAvgStat(red,  "CMP")/100) * 0.30);

  let stamB = clamp(stamB0, 0.5, 1.25);
  let stamR = clamp(stamR0, 0.5, 1.25);
  let compB = clamp(compB0, 0.7, 1.3);
  let compR = clamp(compR0, 0.7, 1.3);

  // Opening initiative nudge: one tick, offense-only
  const starter = (firstMover === "red" || firstMover === "blue") ? firstMover : "blue";
  const initKickUp   = 1.05; // +5% Offense on tick 0 for starter
  const initKickDown = 0.95; // -5% Offense on tick 0 for non-starter

  // Exertion profile
  const openingTicks = Math.max(1, Math.round(6 / (dt / 5))); // ~first 6s at dt=5 → first tick
  const exertEarly = 0.020; // stamina cost per tick (winner spends a bit more)
  const exertLate  = 0.010;

  // Paired jitter scale
  const V = clamp(variancePct / 100, 0, 1);

  // RNG stream (seeded)
  const rng = mulberry32(`${seed}:round`);

  // Outputs
  let zone = 0;               // blue positive, red negative
  const timeline = [];        // zone after each tick
  const lines = [];           // commentary lines

  // Telemetry for summary
  let ticksBlueZone = 0;
  let ticksRedZone  = 0;
  let maxSwingMag = 0;
  let maxSwingIdx = -1;
  let maxSwingDir = 0; // +1 blue, -1 red

  for (let t = 0; t < TICKS; t++) {
    // Raw Off/Def before jitter
    let OffB = offenseScore(blue, stamB, compB);
    let DefB = defenseScore(blue, stamB, compB);
    let OffR = offenseScore(red,  stamR, compR);
    let DefR = defenseScore(red,  stamR, compR);

    // Apply opening initiative to OFFENSE only, tick 0
    if (t === 0) {
      if (starter === "blue") {
        OffB *= initKickUp;
        OffR *= initKickDown;
      } else {
        OffR *= initKickUp;
        OffB *= initKickDown;
      }
    }

    // Paired jitter to remove evaluation-order bias
    const u = (rng() * 2 - 1) * V; // -V..+V
    // Offense: Blue gets +u, Red gets -u
    OffB *= (1 + u);
    OffR *= (1 - u);
    // Defense: mirror so each tick net expectation is zero
    DefB *= (1 - u);
    DefR *= (1 + u);

    // Momentum net and zone update
    const mB = OffB - DefR;
    const mR = OffR - DefB;
    const delta = ( (mB - mR) ) / scale;

    zone += delta;
    timeline.push(zone);
    if (zone > 0) ticksBlueZone++; else if (zone < 0) ticksRedZone++;

    // Track biggest instantaneous swing for summary
    const mag = Math.abs(delta);
    if (mag > maxSwingMag) {
      maxSwingMag = mag;
      maxSwingIdx = t;
      maxSwingDir = (delta >= 0 ? +1 : -1);
    }

    // Commentary (lean but informative)
    const sec = (t+1) * dt;
    if (Math.abs(delta) > 0.60) {
      lines.push(`(${sec}s) HUGE SWING: ${delta >= 0 ? "Blue" : "Red"} surges; zone ${(zone>=0?"+":"")}${zone.toFixed(2)}.`);
    } else if (Math.abs(delta) > 0.30) {
      lines.push(`(${sec}s) Big push ${delta >= 0 ? "Blue" : "Red"}; zone ${(zone>=0?"+":"")}${zone.toFixed(2)}.`);
    } else if ((t % Math.max(1, Math.floor(10 / (dt / 5)))) === 0) {
      lines.push(`(${sec}s) Trading; zone ${(zone>=0?"+":"")}${zone.toFixed(2)}.`);
    }

    // Stamina dynamics (winner spends more)
    const exert = t < openingTicks ? exertEarly : exertLate;
    if (delta > 0) {
      // Blue winning this tick
      stamB = clamp(stamB - exert * 1.15, 0.50, 1.25);
      stamR = clamp(stamR - exert * 0.85 + 0.0015, 0.50, 1.25); // a hair of loser regen
    } else if (delta < 0) {
      // Red winning this tick
      stamR = clamp(stamR - exert * 1.15, 0.50, 1.25);
      stamB = clamp(stamB - exert * 0.85 + 0.0015, 0.50, 1.25);
    } else {
      stamB = clamp(stamB - exert, 0.50, 1.25);
      stamR = clamp(stamR - exert, 0.50, 1.25);
    }

    // Composure dynamics (reacts to current pressure and standing)
    const zBiasB = zone > 0 ? +0.001 : -0.001;
    const zBiasR = zone < 0 ? +0.001 : -0.001;
    compB = clamp(compB + (delta > 0 ? +0.006 : (delta < 0 ? -0.005 : 0)) + zBiasB, 0.70, 1.30);
    compR = clamp(compR + (delta < 0 ? +0.006 : (delta > 0 ? -0.005 : 0)) + zBiasR, 0.70, 1.30);
  }

  // Decide winner by final zone
  let winner = "Draw";
  if (zone > +0.10) winner = "Blue";
  else if (zone < -0.10) winner = "Red";

  // End factors for recovery
  const endFactors = { stamB, stamR, compB, compR, ticksBlueZone, ticksRedZone, maxSwingMag, maxSwingIdx, maxSwingDir };

  return {
    winner,
    zone: +zone.toFixed(3),
    lines,
    timeline,
    endFactors
  };
}

// --- export: between-round recovery ---
export function recoverBetweenRounds(blue, red, ef) {
  // Recovery based on endurance and gentle relaxation of composure toward neutral (1.0)
  const avgENDb = teamAvgStat(blue, "END");
  const avgENDr = teamAvgStat(red,  "END");

  const recB = 0.04 + (avgENDb/100) * 0.06; // 0.04..0.10
  const recR = 0.04 + (avgENDr/100) * 0.06;

  const stamB = clamp((ef?.stamB ?? 1.0) + recB, 0.60, 1.10);
  const stamR = clamp((ef?.stamR ?? 1.0) + recR, 0.60, 1.10);

  const compRelax = 0.08;
  const compB = clamp((ef?.compB ?? 1.0) + (1.0 - (ef?.compB ?? 1.0)) * compRelax, 0.75, 1.15);
  const compR = clamp((ef?.compR ?? 1.0) + (1.0 - (ef?.compR ?? 1.0)) * compRelax, 0.75, 1.15);

  return { stamB, stamR, compB, compR };
}
