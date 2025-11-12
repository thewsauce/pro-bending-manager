// src/announcer.js
// Burst-style boxing/MMA announcer for Pro-Bending. 15s windows, 2–3 lines per burst.

const L = {
  crit: [
    "{A} detonates a cannon-shot on {D}!",
    "Absolute sledgehammer from {A}! {D} stumbles!",
    "Crowd ERUPTS—{A} lands pure thunder on {D}!"
  ],
  guard: [
    "{D} bricks it up—perfect guard!",
    "Stonewall! {D} smothers the blast clean!",
    "Immaculate defense—{D} turns that away!"
  ],
  dodge: [
    "{D} vanishes off the line—silky dodge!",
    "{A} swings; {D} isn’t there—ghost step!",
    "Blink-and-miss it! {D} slips the volley!"
  ],
  zone: [
    "{SIDE} surges—line tilts {ZONE}!",
    "Arena sways toward {SIDE}—heavy pressure!",
    "{SIDE} driving the crowd forward—territory gained!"
  ],
  secondwind: [
    "{D} refuses the fall—SECOND WIND IGNITES!",
    "Listen to that roar—{D} back from the brink!",
    "Heart of a titan—{D} rallies with raw spirit!"
  ],
  failwind: [
    "Spirit shatters—no second wind for {D}!",
    "{D} buckles… no miracle this time!",
    "That’s a heartbreak—{D} can’t find the breath!"
  ],
  ko: [
    "{D} is DOWN! {A} ends it in brutal fashion!",
    "Ref waves it—{A} with the knockout!",
    "Lights out! {A} seals it emphatically!"
  ],
  quiet: [
    "Both corners feinting, reading… storm brewing.",
    "Measured exchanges—patience on a razor’s edge.",
    "Tense lull—someone’s loading the big one."
  ]
};

function pick(rng, arr){ return arr[Math.floor(rng()*arr.length)] || ""; }
function fmt(tpl, m){
  return tpl
    .replaceAll("{A}", m.A??"")
    .replaceAll("{D}", m.D??"")
    .replaceAll("{SIDE}", m.SIDE??"")
    .replaceAll("{ZONE}", m.ZONE??"");
}

/**
 * Build burst commentary.
 * @param {Array} events - per-tick events from sim (see sim patch below)
 * @param {number} dt     - seconds per tick
 * @param {Array<number>} timeline - zone values per tick (for extra zone lines)
 * @param {Function} rng  - seeded RNG
 * @returns {string[]} lines
 */
export function buildAnnouncer(events, dt, timeline, rng){
  const lines = [];
  const burst = Math.max(1, Math.floor(15 / dt));
  let windowEv = [];

  const flush = (tickIdx) => {
    const sec = (tickIdx+1)*dt;
    const out = [];

    // Prioritize: KO > secondwind/failwind > crit > guard > dodge > zone
    const pickType = (t) => windowEv.filter(e => e.type === t);

    const KO = pickType("ko");
    const SW = pickType("secondwind");
    const FW = pickType("failwind");
    const CR = pickType("crit");
    const GD = pickType("guard");
    const DG = pickType("dodge");
    const ZN = pickType("zone");

    const add = (bag, key) => {
      if (!bag.length) return false;
      const e = bag[Math.floor(rng()*bag.length)];
      out.push(fmt(pick(rng, L[key]), e));
      return true;
    };

    // Up to 3 lines per burst
    let slots = 3;
    if (KO.length) { add(KO,"ko"); slots--; }
    if (slots>0 && (SW.length || FW.length)) {
      if (rng()<0.6 && SW.length) add(SW,"secondwind");
      else if (FW.length) add(FW,"failwind");
      slots--;
    }
    if (slots>0 && CR.length) { add(CR,"crit"); slots--; }
    if (slots>0 && GD.length) { add(GD,"guard"); slots--; }
    if (slots>0 && DG.length) { add(DG,"dodge"); slots--; }
    if (slots>0 && ZN.length) { add(ZN,"zone"); slots--; }

    if (out.length===0) out.push(pick(rng, L.quiet));

    for (const s of out) lines.push(`(${sec}s) [Announcer] ${s}`);
  };

  for (let t=0; t<events.length; t++){
    windowEv.push(...events[t]);

    // also inject large zone swings if not already present
    const prev = t>0 ? timeline[t-1] : 0;
    const dz = timeline[t] - prev;
    if (Math.abs(dz) > 0.6) {
      windowEv.push({type:"zone", SIDE: dz>0?"Blue":"Red", ZONE: (timeline[t]>=0?"+":"")+timeline[t].toFixed(1)});
    }

    if ((t+1)%burst===0 || t===events.length-1){
      flush(t);
      windowEv = [];
    }
  }
  return lines;
}
