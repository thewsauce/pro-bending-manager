// src/announcer.js
// Lightweight “boxing-announcer” commentary generator.
// API: buildAnnouncer(events, dt, timeline, rng?) -> string[]
// - events: Array< Array<Event> > indexed by tick (can be empty arrays).
//           Known Event: { type: 'zone', SIDE:'Blue'|'Red', ZONE:'+0.8' }
// - dt: tick size in seconds (e.g., 5)
// - timeline: numeric zone values per tick (length === events.length ideal)
// - rng: optional PRNG fn () => [0,1). If absent, fallback to Math.random.

const rand = (rng) => (typeof rng === "function" ? rng() : Math.random());
const sample = (arr, rng) => arr[Math.floor(rand(rng) * arr.length)] || arr[0];
const secToClock = (s) => {
  const m = Math.floor((s || 0) / 60);
  const r = Math.max(0, Math.floor((s || 0) - m * 60));
  const mm = String(m).padStart(1, "0");
  const ss = String(r).padStart(2, "0");
  return `${mm}:${ss}`;
};

const hypeOpeners = [
  "The gong sounds—here we go!",
  "We’re live! Gloves up, eyes sharp!",
  "Bell rings—round underway!",
  "Crowd roaring, pressure builds!"
];

const neutralBeats = [
  "Both sides measuring distance.",
  "Feints and footwork—testing the guard.",
  "A steady jab of pressure, no clean lane yet.",
  "Tempo magnets pulling center, neither blinking."
];

const bluePush = [
  "Blue steps in with stiff jabs—edge Blue!",
  "Blue churns the guard—ringcraft on display!",
  "Blue wins the beat—forcing the lane!",
  "Blue’s timing slices through—momentum rising!"
];

const redPush = [
  "Red surges—heavy hands in the pocket!",
  "Red bullies the line—back ’em up!",
  "Red hammers the beat—control flipping!",
  "Red’s cadence bites—momentum accrues!"
];

const flipLines = {
  Blue: [
    "Blue FLIPS the field—crowd explodes!",
    "Blue steals center—huge momentum swing!",
    "Blue storms ahead—tables turned!"
  ],
  Red: [
    "Red FLIPS control—what a reversal!",
    "Red steals the midline—stunning swing!",
    "Red storms into command—momentum swings!"
  ]
};

const bigHit = {
  Blue: [
    "Blue detonates—massive shove lands!",
    "Blue cracks the guard—clean power!",
    "Blue stacks the combo—ring shakes!"
  ],
  Red: [
    "Red detonates—huge shove connects!",
    "Red splits the guard—wicked hit!",
    "Red stacks a mean combo—answer that!"
  ]
};

const clutch = {
  Blue: [
    "Blue in the clutch—ice in the veins!",
    "Blue squeezes seconds dry—champion’s poise!",
    "Blue shuts the door—clinical finish!"
  ],
  Red: [
    "Red in the clutch—steel-nerved!",
    "Red owns the last beat—stone-cold!",
    "Red closes ruthless—statement made!"
  ],
  Even: [
    "Both sides gasping—final breaths!",
    "Every second a blade’s edge!",
    "Nothing given, nothing left!"
  ]
};

const outro = {
  Blue: [
    "Horn sounds—round to Blue!",
    "Time! Blue edges it!",
    "End of round—Blue on top!"
  ],
  Red: [
    "Horn sounds—round to Red!",
    "Time! Red takes it!",
    "End of round—Red ahead!"
  ],
  Draw: [
    "Horn! Too close—call it even!",
    "Time! Razor-thin—dead even!",
    "End of round—nothing in it!"
  ]
};

export function buildAnnouncer(events, dt, timeline, rng) {
  const lines = [];
  const ev = Array.isArray(events) ? events : [];
  const tl = Array.isArray(timeline) ? timeline : [];
  const T = Math.max(ev.length, tl.length);
  const step = Number.isFinite(dt) && dt > 0 ? dt : 5;

  // How often to speak if nothing special happens (≈15s cadence)
  const speakEvery = Math.max(1, Math.round(15 / step));

  // opener
  lines.push(sample(hypeOpeners, rng));

  let lastSign = 0; // for flip detection
  let spokeAt = -999;

  for (let t = 0; t < T; t++) {
    const z = Number.isFinite(tl[t]) ? tl[t] : 0;
    const prev = Number.isFinite(tl[t - 1]) ? tl[t - 1] : 0;
    const dz = z - prev;
    const sgn = z === 0 ? 0 : (z > 0 ? 1 : -1);
    const clk = secToClock(t * step);

    // Consume explicit events first
    const bucket = Array.isArray(ev[t]) ? ev[t] : [];

    // Big swings (synthetic or provided)
    let firedThisTick = false;
    for (const e of bucket) {
      if (e?.type === "zone" && (e.SIDE === "Blue" || e.SIDE === "Red")) {
        lines.push(`[${clk}] ${sample(bigHit[e.SIDE], rng)} (${e.ZONE})`);
        firedThisTick = true;
      }
    }

    // Detect flips across midline
    if (!firedThisTick && lastSign !== 0 && sgn !== 0 && sgn !== lastSign) {
      const side = sgn > 0 ? "Blue" : "Red";
      lines.push(`[${clk}] ${sample(flipLines[side], rng)} (${z >= 0 ? "+" : ""}${z.toFixed(1)})`);
      spokeAt = t;
      firedThisTick = true;
    }

    // Momentum pulses (no event this tick)
    if (!firedThisTick) {
      // big pulse
      if (Math.abs(dz) > 0.6) {
        const side = dz > 0 ? "Blue" : "Red";
        const bank = side === "Blue" ? bluePush : redPush;
        lines.push(`[${clk}] ${sample(bank, rng)} (${z >= 0 ? "+" : ""}${z.toFixed(1)})`);
        spokeAt = t;
      } else if (t - spokeAt >= speakEvery) {
        // neutral beat if we've been quiet ~15s
        lines.push(`[${clk}] ${sample(neutralBeats, rng)}`);
        spokeAt = t;
      }
    }

    lastSign = sgn;
  }

  // Clutch call + outro based on last zone
  const zf = Number.isFinite(tl[T - 1]) ? tl[T - 1] : 0;
  const who = zf > 0 ? "Blue" : zf < 0 ? "Red" : "Draw";

  if (who === "Draw") {
    lines.push(sample(clutch.Even, rng));
    lines.push(sample(outro.Draw, rng));
  } else {
    lines.push(sample(clutch[who], rng));
    lines.push(sample(outro[who], rng));
  }

  return lines;
}

export default { buildAnnouncer };
