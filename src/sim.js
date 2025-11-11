import {avg, clamp, fmt, mulberry32} from "./util.js";

export function teamBaseStaminaFromRoster(team){ const s = avg(team.map(p=>p.STM)); return 0.85 + (s/100)*0.30; }
export function teamBaseComposureFromRoster(team){ const c = avg(team.map(p=>p.CMP)); return 0.85 + (c/100)*0.30; }

function teamOffense(players, stam, comp){
  const vals=[]; players.forEach(p=>vals.push(p.STR,p.PRC,p.INI,p.RHY));
  return avg(vals) * stam * (0.6 + 0.4*comp);
}
function teamDefense(players, stam, comp){
  const vals=[]; players.forEach(p=>vals.push(p.GST,p.AWR,p.CMP,p.POS));
  return avg(vals) * (0.5 + 0.5*stam) * (0.7 + 0.3*comp);
}

export function simulateRound({seed, dt, scale, variancePct, blue, red, carry}){
  const rng = mulberry32(seed || "seed");
  const ticks = Math.max(1, Math.floor(180 / dt));

  let stamB = carry?.stamB ?? teamBaseStaminaFromRoster(blue);
  let stamR = carry?.stamR ?? teamBaseStaminaFromRoster(red);
  let compB = carry?.compB ?? teamBaseComposureFromRoster(blue);
  let compR = carry?.compR ?? teamBaseComposureFromRoster(red);

  let zone = 0;
  const timeline = [];
  const lines = [];

  const exertEarly = 0.020, exertLate = 0.010;

  const pick = arr => arr[Math.floor(rng()*arr.length)];
  const pools = {
    start: [
      "Announcer: Bell rings—measured distance, both sides probing.",
      "Announcer: We’re live—quick testers from the front lines."
    ],
    swingBlue: ["Stormfront surge—angles open; precision lands."],
    swingRed:  ["Ferrets rally—counter-surge snaps the lane."],
    flipBlue:  ["Zone tilts BLUE—clean territory claim."],
    flipRed:   ["Zone flips RED—ground reclaimed."],
    fatigue:   ["Breaths heavy—output dipping, guards lagging."],
    clutch:    ["Final beats—one clean exchange decides it."]
  };

  for (let t=0; t<ticks; t++){
    const time = t*dt;
    const exertB = (t < Math.min(6,ticks)) ? exertEarly : exertLate;
    const exertR = (t < Math.min(6,ticks)) ? exertEarly : exertLate;

    const jitter = (pct) => 1 + ((rng()*2-1) * (pct/100));
    const offB = teamOffense(blue, stamB, compB) * jitter(variancePct);
    const defB = teamDefense(blue, stamB, compB) * jitter(variancePct);
    const offR = teamOffense(red,  stamR, compR) * jitter(variancePct);
    const defR = teamDefense(red,  stamR, compR) * jitter(variancePct);

    const delta = ((offB - defR) - (offR - defB)) / scale;
    zone += delta;

    timeline.push({ time, zone: +zone.toFixed(3), delta:+delta.toFixed(3), stamB, stamR, compB, compR });

    // stamina dynamics
    if (delta > 0){ stamB = clamp(stamB - exertB*1.10 + 0.002, 0.50, 1.25); stamR = clamp(stamR - exertR*0.90, 0.50, 1.25); }
    else if (delta < 0){ stamB = clamp(stamB - exertB*0.90, 0.50, 1.25); stamR = clamp(stamR - exertR*1.10 + 0.002, 0.50, 1.25); }
    else { stamB = clamp(stamB - exertB*0.98 + 0.001, 0.50, 1.25); stamR = clamp(stamR - exertR*0.98 + 0.001, 0.50, 1.25); }

    // composure dynamics
    const sign = Math.sign(delta);
    compB = clamp(compB + (sign>0? +0.006 : -0.005) + (zone>0? +0.001 : -0.001), 0.70, 1.30);
    compR = clamp(compR + (sign<0? +0.006 : -0.005) + (zone<0? +0.001 : -0.001), 0.70, 1.30);

    // commentary
    if (t===0) lines.push(pick(pools.start));
    const mag = Math.abs(delta);
    const tag = mag > .75 ? "HUGE SWING" : mag > .45 ? "BIG SWING" : mag > .20 ? "shift" : "tap";
    const who = delta>0 ? "Stormfront" : delta<0 ? "Fire Ferrets" : "Neutral";
    lines.push(`${String(time).padStart(3," ")}s: ${who} ${tag} Δ${fmt(delta)} | zone:${fmt(zone)} | STM(B/R) ${stamB.toFixed(2)}/${stamR.toFixed(2)} | CMP(B/R) ${compB.toFixed(2)}/${compR.toFixed(2)}`);
    if (mag>.6) lines.push( (delta>0? pick(pools.swingBlue):pick(pools.swingRed)) );
    if (Math.abs(zone)>1.0 && (t%3===0)) lines.push( zone>0? pick(pools.flipBlue):pick(pools.flipRed) );
    if (t===Math.floor(ticks/2)) lines.push(pick(pools.fatigue));
    if (ticks - t === 3) lines.push(pick(pools.clutch));
  }

  const winner = zone > 0.10 ? "Stormfront (Blue)" : zone < -0.10 ? "Fire Ferrets (Red)" : "Draw";
  return { winner, zone:+zone.toFixed(2), timeline, lines,
           endFactors:{stamB,stamR,compB,compR} };
}

export function recoverBetweenRounds(blue, red, end){
  const avgENDb = avg(blue.map(p=>p.END));
  const avgENDr = avg(red.map(p=>p.END));
  const recB = 0.04 + (avgENDb/100)*0.06;
  const recR = 0.04 + (avgENDr/100)*0.06;
  return {
    stamB: clamp(end.stamB + recB, 0.60, 1.10),
    stamR: clamp(end.stamR + recR, 0.60, 1.10),
    compB: clamp(end.compB + (1.0 - end.compB)*0.08, 0.75, 1.15),
    compR: clamp(end.compR + (1.0 - end.compR)*0.08, 0.75, 1.15),
  };
}
