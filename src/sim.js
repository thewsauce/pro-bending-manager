// src/sim.js
// V2 simulator: 3:00 round with lanes, actions, guards, hidden meters, and momentum.
// Public API preserved: simulateRound(opts), recoverBetweenRounds(...)

// Helpers from util.js
import { clamp } from "./util.js";
import { mulberry32 } from "./util.js";

// ---------- small utils ----------
const nh = x => clamp((x ?? 0) / 100, 0, 1);
const logistic = z => 1 / (1 + Math.exp(-z));
function avg(arr){ if(!arr?.length) return 0; let s=0; for(let i=0;i<arr.length;i++) s+=arr[i]; return s/arr.length; }
function teamAvgStat(team, key){ return avg(team.map(p => p[key] ?? 0)); }
function randn(rng, sigma){
  // Box–Muller (stable enough for our use)
  const u = Math.max(rng(), 1e-9), v = Math.max(rng(), 1e-9);
  return sigma * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}

// ---------- lane/action scaffolding ----------
const ACTIONS = ["LV","PB","FC","ZS"]; // Light Volley, Power Burst, Feint-Counter, Zone Shove
function chooseAction(rng, atk){
  const INI = nh(atk.INI), STR = nh(atk.STR), PRC = nh(atk.PRC), AWR = nh(atk.AWR), POS = nh(atk.POS);
  let w = [
    0.35 + 0.15*INI, // LV
    0.20 + 0.30*STR, // PB
    0.20 + 0.25*AWR, // FC
    0.25 + 0.20*POS  // ZS
  ];
  const s = w[0]+w[1]+w[2]+w[3]; w = w.map(x=>x/s);
  const r = rng();
  if (r < w[0]) return "LV";
  if (r < w[0]+w[1]) return "PB";
  if (r < w[0]+w[1]+w[2]) return "FC";
  return "ZS";
}

// Lane weights for 3 benders (rows = roles 1..3, cols = lanes 0..2)
const W = [
  [0.55, 0.35, 0.10], // Role1 (front/suppress)
  [0.20, 0.60, 0.20], // Role2 (anchor/counter)
  [0.10, 0.35, 0.55], // Role3 (closer)
];

// Guard policy: prefer Medium; upgrade to High on big hits; drop to Basic if low POI
function pickGuardLevel(def, expectedHit){
  if (def._broken) return 0;
  if (def.POI <= 20) return 0.5;        // conserve when low
  if (expectedHit > 18) return 1.0;     // heavy commit
  if (expectedHit > 10) return 0.7;
  return 0.5;
}

// ---------- hidden meters ----------
function bootstrapMeters(team){
  for (const b of team){
    if (b._boot) continue;
    const HPmax = 100 * (1 + 0.08*nh(b.END) + 0.04*nh(b.STM));
    b.HPmax = HPmax;
    b.HP  = HPmax;
    b.FTG = 300;     // start Zone 1 band
    b.POI = 100;
    b.SPI = 100;
    b._usedSecondWind = false;
    b._broken = false;
    b._auraGQTicks = 0;
    b._shaken = false;
    b._RHY_ema = nh(b.RHY);
    b._boot = true;
  }
}
function zoneCeil(ftg){
  if (ftg >= 201) return 300; // Z1 ceiling
  if (ftg >= 101) return 200; // Z2
  if (ftg >= 1)   return 100; // Z3
  return 0;                   // ring-out
}
function zoneIndex(ftg){
  if (ftg >= 201) return 1;
  if (ftg >= 101) return 2;
  if (ftg >= 1)   return 3;
  return 4; // ringout
}

// ---------- quality, mitigation, spirit ----------
function guardQuality(b){
  // 0.50–1.00; slight temp buff from second wind aura
  return clamp(0.50 + 0.25*nh(b.AWR) + 0.15*nh(b.GST) + 0.10*nh(b.END) + (b._auraGQTicks>0?0.10:0), 0.5, 1.1);
}
function footingMitigator(b){
  return clamp(1 - (0.35*nh(b.POS) + 0.25*nh(b.AWR) + 0.15*nh(b.RHY)), 0.25, 1.0);
}
function spiritEdge(attSPI, defSPI){
  const d = clamp((attSPI - defSPI)/80, -3, 3);
  return 1 + 0.12 * Math.tanh(d); // ≈ 0.88–1.12
}

// ---------- opposed test → HIT (with fixed defender CMP usage) ----------
function opposedHit(rng, atk, def, act){
  const INI_a = nh(atk.INI), PRC_a = nh(atk.PRC), STR_a = nh(atk.STR), RHY_a = nh(atk.RHY), AWR_a = nh(atk.AWR), POS_a = nh(atk.POS);
  const GST_d = nh(def.GST), AWR_d = nh(def.AWR), CMP_d = nh(def.CMP), POS_d = nh(def.POS);

  const Focus = 0.5 + 0.5*PRC_a;
  // USE DEFENDER CMP here; halve only if the DEFENDER is shaken
  const PoiseD = 0.6 + 0.4*(def._shaken ? clamp(CMP_d*0.5,0,1) : CMP_d);
  const Guard  = 0.55 + 0.45*GST_d;
  const Foot   = 0.55 + 0.45*POS_d;

  let AQ_raw=0, DQ_raw=0, ZS_bias=1.0;
  if (act==='LV'){
    AQ_raw = (0.35*INI_a + 0.35*PRC_a + 0.30*RHY_a) * Focus;
    DQ_raw = (0.30*AWR_d + 0.30*POS_d + 0.40*CMP_d) * PoiseD;
    ZS_bias = 1.0;
  } else if (act==='PB'){
    AQ_raw = (0.55*STR_a + 0.25*PRC_a + 0.20*INI_a) * (0.9 + 0.2*RHY_a);
    DQ_raw = (0.50*GST_d + 0.30*AWR_d + 0.20*CMP_d) * Guard;
    ZS_bias = 0.8;
  } else if (act==='FC'){
    AQ_raw = (0.40*AWR_a + 0.30*PRC_a + 0.30*INI_a) * PoiseD;
    DQ_raw = (0.35*INI_a + 0.35*PRC_a + 0.30*CMP_d) * (0.9 + 0.2*RHY_a);
    ZS_bias = 1.0;
  } else { // ZS
    AQ_raw = (0.45*STR_a + 0.25*POS_a + 0.30*RHY_a) * Foot;
    DQ_raw = (0.40*POS_d + 0.30*GST_d + 0.30*AWR_d) * Guard;
    ZS_bias = 1.2;
  }

  // Stamina & rhythm inside round
  const STM_eff_atk = Math.pow(nh(atk.STM), 1.35);
  const STM_eff_def = Math.pow(nh(def.STM), 1.35);
  const RHY_gain_atk = 0.9 + 0.2*atk._RHY_ema;

  // Composure-controlled noise (both sides reduce chaos)
  const sigma0 = 0.12;
  const sigma = sigma0 * (1 - 0.5*(nh(def.CMP) + nh(atk.CMP)));
  const eps = randn(rng, sigma);

  const AQ = AQ_raw * STM_eff_atk * RHY_gain_atk;
  const DQ = DQ_raw * STM_eff_def;

  const s = 0.18;
  let ps = logistic((AQ - DQ + eps)/s);
  let crit = 0;
  if (eps > 2*sigma) crit = 0.15;
  if (eps < -2*sigma) ps = 0; // fumble

  const AQscale = 40; // swing magnitude tuner
  const HIT = Math.max(0, (ps - 0.5 + crit) * AQscale);

  return { HIT, ZS_bias, ps };
}

// ---------- split damage, apply guard/broken ----------
function applyGuardAndDamage(atk, def, act, HIT){
  // Split into HP vs FTG
  let FTG_bias = 0.65; // most exchanges push feet more than health
  if (act==='LV') FTG_bias += 0.05;
  else if (act==='PB') FTG_bias -= 0.20;
  else if (act==='ZS') FTG_bias += 0.25;

  const kHP = 1.00, kFTG = 1.20;
  let hpDmg  = kHP  * HIT * (1 - FTG_bias);
  let ftgDmg = kFTG * HIT * (FTG_bias);

  // Mitigate FTG by defender’s POS/AWR/RHY
  ftgDmg *= footingMitigator(def);

  // Spirit edge
  const se = spiritEdge(atk.SPI, def.SPI);
  hpDmg  *= se;
  ftgDmg *= se;

  // Guard handling
  let level = 0;
  if (!def._broken && def.POI > 0){
    level = pickGuardLevel(def, hpDmg);
  }
  if (level > 0){
    const gq = guardQuality(def);
    const spend = level * hpDmg * (1 - 0.5*gq);
    if (def.POI - spend < 0){
      // guard breaks, overflow returns to damage
      const overflow = spend - def.POI;
      def.POI = 0;
      def._broken = true;
      hpDmg  = hpDmg * (1 - level) + 0.6*overflow;
      ftgDmg = ftgDmg * (1 - 0.2*gq) + 0.4*overflow;
    } else {
      def.POI -= spend;
      hpDmg  = hpDmg * (1 - level);
      ftgDmg = ftgDmg * (1 - 0.2*gq);
    }
  }

  // Broken state vulnerability
  if (def._broken){
    hpDmg  *= 1.20;
    ftgDmg *= 1.25;
  }

  return { hpDmg, ftgDmg, level };
}

// ---------- recovery & second wind ----------
function recoveryStep(b, underAttack){
  // HP micro-regen (never out-heals sustained combat)
  const hpReg = (0.02 + 0.06*nh(b.CMP)) * (1 - 0.6*(underAttack?1:0)) * (0.6 + 0.4*b.SPI/200);
  b.HP = Math.min(b.HPmax, b.HP + hpReg);

  // FTG auto-recover capped to current zone ceiling
  const ceil = zoneCeil(b.FTG);
  const ftgReg = (1.8 + 2.4*nh(b.POS) + 1.2*nh(b.AWR) + 0.6*nh(b.RHY)) * (1 - 0.6*(underAttack?1:0));
  b.FTG = Math.min(ceil, b.FTG + ftgReg);

  // POI: refill *only* when broken
  if (b._broken){
    const poiRefill = 10 + 20*nh(b.INI) + 20*nh(b.CMP);
    b.POI = Math.min(100, b.POI + poiRefill);
    if (b.POI >= 100){ b.POI = 100; b._broken = false; }
  }

  // Rhythm EMA warm-up + temp effects decay
  b._RHY_ema = 0.85*b._RHY_ema + 0.15*nh(b.RHY);
  if (b._auraGQTicks>0) b._auraGQTicks--;
  if (b._shaken && b.SPI >= 60) b._shaken = false;
}
function secondWindCheck(b, rng){
  if (b.SPI > 0 || b._usedSecondWind) return;
  const p = clamp(0.35 + 0.35*nh(b.CMP) + 0.2*nh(b.RHY) + 0.1*nh(b.AWR), 0, 0.9);
  if (rng() < p){
    b.SPI = 120;
    b._auraGQTicks = 3;
  } else {
    b._shaken = true; // halve CMP until SPI≥60 (applied in opposedHit via PoiseD)
  }
  b._usedSecondWind = true;
}

// ---------- Export: simulate a single 180s round ----------
export function simulateRound(opts){
  const {
    seed = "seed",
    dt = 5,
    blue, red,           // arrays of 3 benders (buffed for this round)
    firstMover = "blue", // "blue" | "red" | anything (no nudge)
    variancePct = 25     // kept for parity; noise handled inside opposedHit
  } = opts;

  const TICKS = Math.max(1, Math.floor(180 / dt));
  const rng = mulberry32(`${seed}:round`);

  // Init hidden meters on both teams
  bootstrapMeters(blue);
  bootstrapMeters(red);

  // Momentum & UI zone
  let M = (firstMover === "blue") ? +0.25 : (firstMover === "red" ? -0.25 : 0);
  let zone = 0;
  const timeline = [];
  const lines = [];

  // Telemetry
  let ticksBlueZone = 0, ticksRedZone = 0, maxSwingMag = 0, maxSwingIdx = -1, maxSwingDir = 0;

  // Lane picker helper
  const pickLane = (team, laneIdx) => ([
    { b: team[0], w: W[0][laneIdx] },
    { b: team[1], w: W[1][laneIdx] },
    { b: team[2], w: W[2][laneIdx] },
  ]);

  for (let t=0; t<TICKS; t++){
    // Acting probabilities from momentum; make them complementary.
    const p_act_blue = clamp(0.5 + 0.35*M, 0.05, 0.95);
    const p_act_red  = 1 - p_act_blue;

    let teamImpactBlue = 0, teamImpactRed = 0;
    let teamZpushBlue = 0, teamZpushRed = 0;

    for (let lane=0; lane<3; lane++){
      const Lb = pickLane(blue, lane).sort((a,b)=>b.w-a.w);
      const Lr = pickLane(red,  lane).sort((a,b)=>b.w-a.w);
      const leadBlue = Lb[0].b, leadRed = Lr[0].b;

      // SINGLE arbitration roll to avoid bias; exactly one side acts
      const r = rng();
      const actingSide = (r < p_act_blue) ? "blue" : "red";

      const A = actingSide === "blue" ? leadBlue : leadRed;
      const D = actingSide === "blue" ? leadRed  : leadBlue;

      const act = chooseAction(rng, A);
      const { HIT, ZS_bias } = opposedHit(rng, A, D, act);

      // Zone level uses FTG damage; save prev zone tier before damage
      const prevZoneTier = zoneIndex(D.FTG);

      // Damage/guard application
      const { hpDmg, ftgDmg, level } = applyGuardAndDamage(A, D, act, HIT);

      // Apply to defender
      D.HP  = Math.max(0, D.HP  - hpDmg);
      D.FTG = Math.max(0, D.FTG - ftgDmg);

      // Spirit changes (snowball damping at low footing)
      const HIT_norm = clamp(HIT/40, 0, 1);
      const lowFtgDamp = (D.FTG <= 120) ? 0.6 : 1.0;

      // attacker gains
      A.SPI = clamp(A.SPI + (4 + 3*nh(A.CMP)) * HIT_norm, 0, 200);
      // defender gains on guarded ticks; else loses
      if (level>0){
        const gq = guardQuality(D);
        D.SPI = clamp(D.SPI + (3 + 2*nh(D.CMP)) * HIT_norm * gq, 0, 200);
      } else {
        D.SPI = clamp(D.SPI - lowFtgDamp * (3 + 2*(1-nh(D.CMP))) * HIT_norm, 0, 200);
      }
      if (D.SPI === 0) secondWindCheck(D, rng);

      // Z-push proxy from FTG damage
      let zpush = (ftgDmg / 50) * ZS_bias;
      // Zone threshold crossing (drop to a lower band)
      const newZoneTier = zoneIndex(D.FTG);
      if (newZoneTier > prevZoneTier){
        // defender lost a zone → attacker advances team zone
        zpush += 0.6;       // hard event shove
        D.FTG = Math.min(300, D.FTG + 100); // defender gets +100 FTG (can overcap)
      }

      // Record signed contributions
      if (actingSide === "blue"){
        teamImpactBlue += hpDmg;
        teamZpushBlue  += zpush;
      } else {
        teamImpactRed  += hpDmg;
        teamZpushRed   += zpush;
      }

      // mark involvement for recovery damping
      A._underAttackThisTick = true;
      D._underAttackThisTick = true;
    }

    // Per-bender recovery and flag cleanup
    for (const b of [...blue, ...red]){
      recoveryStep(b, !!b._underAttackThisTick);
      b._underAttackThisTick = false;
    }

    // Momentum update from SPI centroid + position/damage
    const SPI_team_blue = avg(blue.map(b=>b.SPI));
    const SPI_team_red  = avg(red.map(b=>b.SPI));
    const SPI_tilde = clamp((SPI_team_blue - SPI_team_red)/100, -1, 1);

    M = clamp(
      0.80*M
      + 0.30*SPI_tilde
      + 0.30*Math.tanh((teamZpushBlue - teamZpushRed)/0.6)
      + 0.15*Math.sign((teamImpactBlue - teamImpactRed) || 0),
    -1, 1);

    // Convert lane outputs to single UI zone; reduce leakage for symmetry
    const Δ_zone = (teamZpushBlue - teamZpushRed) / 1.8;
    zone = clamp(zone + Δ_zone + 0.10*M, -3, 3);

    timeline.push(zone);
    if (zone > 0) ticksBlueZone++; else if (zone < 0) ticksRedZone++;

    const mag = Math.abs(Δ_zone + 0.10*M);
    if (mag > maxSwingMag){ maxSwingMag = mag; maxSwingIdx = t; maxSwingDir = (Δ_zone>=0?+1:-1); }

    // Early end: any ring-out or KO ends round
    const blueKO = blue.some(b => b.HP <= 0 || b.FTG <= 0);
    const redKO  = red.some(b => b.HP <= 0 || b.FTG <= 0);
    if (blueKO || redKO) break;
  }

  let winner = "Draw";
  if (zone > +0.10) winner = "Blue";
  else if (zone < -0.10) winner = "Red";

  const endFactors = {
    ticksBlueZone, ticksRedZone, maxSwingMag, maxSwingIdx, maxSwingDir,
    meters: {
      blue: blue.map(({name,HP,HPmax,FTG,POI,SPI})=>({name,HP:+HP.toFixed(1),HPmax:+HPmax.toFixed(1),FTG:+FTG.toFixed(1),POI:+POI.toFixed(0),SPI:+SPI.toFixed(0)})),
      red:  red.map(({name,HP,HPmax,FTG,POI,SPI})=>({name,HP:+HP.toFixed(1),HPmax:+HPmax.toFixed(1),FTG:+FTG.toFixed(1),POI:+POI.toFixed(0),SPI:+SPI.toFixed(0)})),
    }
  };

  return { winner, zone:+zone.toFixed(3), lines, timeline, endFactors };
}

// ---------- Export: between-round recovery ----------
export function recoverBetweenRounds(blue, red, ef){
  // Between-rounds: nudge stamina attributes; composure relax handled implicitly per-round.
  const avgENDb = teamAvgStat(blue, "END");
  const avgENDr = teamAvgStat(red,  "END");

  const recB = 0.04 + (avgENDb/100) * 0.06; // 0.04..0.10
  const recR = 0.04 + (avgENDr/100) * 0.06;

  for (const b of blue){
    b.STM = clamp(b.STM + recB*100, 0, 120);
  }
  for (const b of red){
    b.STM = clamp(b.STM + recR*100, 0, 120);
  }

  // Return carry fields for compatibility (your main.js may read these)
  return {
    stamB: clamp(0.85 + (teamAvgStat(blue,"STM")/100)*0.30, 0.6, 1.1),
    stamR: clamp(0.85 + (teamAvgStat(red,"STM")/100)*0.30, 0.6, 1.1),
    compB: 1.0,
    compR: 1.0
  };
}
