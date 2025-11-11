// src/start_order.js
// Decide who starts based on team tempo vs. opponent endurance,
// with a small coin bonus. All values are normalized (0..1.x) so
// tuning is predictable and END can never swamp tempo.

const wINI = 1.00;
const wCMP = 0.60;
const wRHY = 0.20;

export function firstMoverDecision(blue, red, rng) {
  const deadband = 0.01; // tiny tie zone
  const k = 0.35;        // END influence (proportional dampener)
  const norm = v => v / 100;

  const teamTempo = (team) => {
    // avg over 3 players of (INI + 0.6*CMP + 0.2*RHY) normalized
    const t = team.map(p => (
      wINI * norm(p.INI) +
      wCMP * norm(p.CMP) +
      wRHY * norm(p.RHY)
    ));
    return (t[0] + t[1] + t[2]) / 3;
  };

  const maxEnd = (team) => Math.max(...team.map(p => norm(p.END))); // 0..1

  let TB = teamTempo(blue);
  let TR = teamTempo(red);

  // Coin bonus: small, normalized bump (+2%..+5%)
  const bonus = () => (0.02 + rng() * 0.03);
  if (rng() < 0.5) TB += bonus(); else TR += bonus();

  // Proportional END dampener (cannot exceed k*T)
  TB *= (1 - k * maxEnd(red));
  TR *= (1 - k * maxEnd(blue));

  if (TB > TR + deadband) return { first: "blue", TB, TR };
  if (TR > TB + deadband) return { first: "red",  TB, TR  };
  return { first: (rng() < 0.5 ? "blue" : "red"), TB, TR };
}
