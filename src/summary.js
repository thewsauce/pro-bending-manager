import {avg, fmt} from "./util.js";

export function summarizeRound(out, blue, red){
  const tl = out.timeline, total = tl.length;
  const blueTicks = tl.filter(p=>p.zone>0).length;
  const redTicks  = tl.filter(p=>p.zone<0).length;

  let maxSwing={i:0,d:0}; tl.forEach((p,i)=>{const a=Math.abs(p.delta); if(a>Math.abs(maxSwing.d))maxSwing={i,d:p.delta};});
  const s = tl[maxSwing.i], b = tl[Math.max(0,maxSwing.i-1)], a = tl[Math.min(tl.length-1,maxSwing.i+1)];
  const swingTeam = maxSwing.d>0 ? "Stormfront (Blue)" : "Fire Ferrets (Red)";

  let winText = "Draw on time at midfield.";
  if (out.winner.includes("Blue")) winText = `Stormfront by zone advantage (final zone ${fmt(out.zone)})`;
  else if (out.winner.includes("Red")) winText = `Fire Ferrets by zone advantage (final zone ${fmt(out.zone)})`;

  const avgSTMb = avg(tl.map(x=>x.stamB)), avgSTMr = avg(tl.map(x=>x.stamR));
  const avgCMPb = avg(tl.map(x=>x.compB)), avgCMPr = avg(tl.map(x=>x.compR));
  const score = (team, sStm, sCmp) => team.map(p=>{
    const off=(p.STR+p.PRC+p.INI+p.RHY)/4, def=(p.GST+p.AWR+p.CMP+p.POS)/4;
    const impact = off*(0.6+0.4*sStm) + def*(0.4+0.6*sCmp);
    return {name:p.name, off:Math.round(off), def:Math.round(def), impact:Math.round(impact)};
  }).sort((x,y)=>y.impact-x.impact);

  let mvp, mvpTeam;
  if (out.winner.includes("Blue")){ mvp=score(blue,avgSTMb,avgCMPb)[0]; mvpTeam="Stormfront"; }
  else if (out.winner.includes("Red")){ mvp=score(red,avgSTMr,avgCMPr)[0]; mvpTeam="Fire Ferrets"; }
  else {
    const A=score(blue,avgSTMb,avgCMPb)[0], B=score(red,avgSTMr,avgCMPr)[0];
    mvp = Math.abs(out.zone)<0.05 ? (A.impact>=B.impact?A:B) : (out.zone>0?A:B);
    mvpTeam = Math.abs(out.zone)<0.05 ? "Tie" : (out.zone>0?"Stormfront":"Fire Ferrets");
  }

  return `Win: ${winText}
Zone Control: Blue ${Math.round(100*blueTicks/total)}% | Red ${Math.round(100*redTicks/total)}%
Max Swing: ${s.time}s  Δ${fmt(s.delta)} toward ${swingTeam}
Play of the Round:
  ${s.time}s: zone ${fmt(b.zone)} → ${fmt(s.zone)} → ${fmt(a.zone)} 
  STM(B/R) ${s.stamB.toFixed(2)}/${s.stamR.toFixed(2)} | CMP(B/R) ${s.compB.toFixed(2)}/${s.compR.toFixed(2)}

MVP: ${mvp.name} (${mvpTeam}) — Off ${mvp.off}, Def ${mvp.def}, Impact ${mvp.impact}`;
}
