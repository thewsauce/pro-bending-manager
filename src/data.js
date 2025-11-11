export async function loadRosters(){
  const local = localStorage.getItem("rosters.v1");
  if (local) return JSON.parse(local);
  const res = await fetch("./data/rosters.json?v="+Date.now(), {cache:"no-store"});
  if (!res.ok) throw new Error("Failed to load data/rosters.json");
  return await res.json();
}
export function saveRosters(rosters){
  localStorage.setItem("rosters.v1", JSON.stringify(rosters));
}
export const teamFromIds = (base, ids) => ids.map(id => ({ id, ...base.players[id] }));
export const rosterText = team => team.map(p=>{
  const e = p.el?.[0]?.toUpperCase()+p.el?.slice(1);
  const g = (p.gender||"?").toUpperCase();
  const core = ["INI","STR","PRC","GST","AWR","RHY","CMP","POS","STM","END"].map(k=>`${k}:${String(p[k]).padStart(2," ")}`).join(" ");
  const ovr = Math.round(["INI","STR","PRC","GST","AWR","RHY","CMP","POS"].reduce((a,k)=>a+p[k],0)/8);
  return `${p.name.padEnd(10)} | ${e}/${g} | OVR ~ ${String(ovr).padStart(2," ")} | ${core}`;
}).join("\n");
