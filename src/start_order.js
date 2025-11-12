// src/start_order.js
// Initiative-based first-mover decision (guaranteed finite numbers)

const wINI = 1.00;
const wCMP = 0.60;
const wRHY = 0.20;
const kEND = 0.35;
const coinMin = 0.02;
const coinMax = 0.05;
const deadband = 0.01;

export function firstMoverDecision(blue, red, rng) {
  const norm = (v) => (Number.isFinite(v) ? v : 0) / 100;

  const teamTempo = (team) => {
    if (!Array.isArray(team) || team.length === 0) return 0;
    const t = team.map(p => {
      const INI = norm(p?.INI);
      const CMP = norm(p?.CMP);
      const RHY = norm(p?.RHY);
      return wINI * INI + wCMP * CMP + wRHY * RHY;
    });
    return t.reduce((a, b) => a + b, 0) / team.length;
  };

  const maxEnd = (team) => {
    if (!Array.isArray(team) || team.length === 0) return 0;
    return Math.max(...team.map(p => norm(p?.END)), 0);
  };

  let TB = teamTempo(blue);
  let TR = teamTempo(red);

  if (!Number.isFinite(TB)) TB = 0;
  if (!Number.isFinite(TR)) TR = 0;

  const bonus = () => coinMin + rng() * (coinMax - coinMin);
  if (rng() < 0.5) TB += bonus(); else TR += bonus();

  TB *= (1 - kEND * maxEnd(red));
  TR *= (1 - kEND * maxEnd(blue));

  TB = Math.max(0, TB);
  TR = Math.max(0, TR);

  let first = "blue";
  if (TR > TB + deadband) first = "red";
  else if (Math.abs(TR - TB) <= deadband) first = rng() < 0.5 ? "blue" : "red";

  return {
    first,
    TB: Number(TB.toFixed(3)),
    TR: Number(TR.toFixed(3))
  };
}
