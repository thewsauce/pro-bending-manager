export const ALLOWED_ELEMENTS = new Set(["water","earth","fire"]); // add "air" if you want

export function validateTeamElements(team){
  const counts = {};
  team.forEach(p => { const el=(p.el||"unknown").toLowerCase(); counts[el]=(counts[el]||0)+1; });
  const dups = Object.entries(counts).filter(([el,c])=>c>1).map(([el,c])=>({el,count:c}));
  return { ok: dups.length===0, dups };
}
export function validateAllowedElements(team){
  const bad = team.filter(p => !ALLOWED_ELEMENTS.has((p.el||"").toLowerCase()));
  return { ok: bad.length===0, bad };
}
export function elementRuleMessage(teamName, res){
  if (res.ok) return "";
  const list = res.dups.map(d=>`${d.el}×${d.count}`).join(", ");
  return `${teamName}: duplicate elements (${list}). One per element only.`;
}
