import {loadRosters, teamFromIds, rosterText} from "./data.js";
import {validateTeamElements, validateAllowedElements, elementRuleMessage} from "./validators.js";
import {simulateRound, recoverBetweenRounds, teamBaseStaminaFromRoster, teamBaseComposureFromRoster} from "./sim.js";
import {drawGraph} from "./graph.js";

const $ = sel => document.querySelector(sel);
const state = {
  base:null, blue:null, red:null,
  carry:null,
  round:1, locked:false
};

function renderRosters(){
  $("#blueRoster").textContent = rosterText(state.blue);
  $("#redRoster").textContent  = rosterText(state.red);
}

function updateTicks(){ const dt=parseInt($("#dt").value||"5",10); $("#ticksAuto").textContent = String(Math.max(1, Math.floor(180/dt))); }

(async function boot(){
  try{
    const base = await loadRosters();
    state.base = base;
    state.blue = teamFromIds(base, base.teams.Stormfront);
    state.red  = teamFromIds(base, base.teams.FireFerrets);
    renderRosters();
    updateTicks();
    $("#boot").textContent = "Rosters loaded.";
    $("#runBtn").disabled = $("#resetBtn").disabled = false;
  }catch(e){
    $("#boot").textContent = "Load error: " + e.message;
  }
})();

$("#dt").addEventListener("input", updateTicks);
$("#variance").addEventListener("input", ()=>{}); // reserved if you want live label
$("#resetBtn").addEventListener("click", ()=>{
  state.round=1; state.locked=false; state.carry=null;
  $("#roundNo").textContent="1";
  $("#result").textContent="—"; $("#summary").textContent="—"; $("#log").textContent="—";
  drawGraph($("#graph"), []);
  $("#nextBtn").disabled = true; $("#runBtn").disabled=false;
});

$("#runBtn").addEventListener("click", ()=>{
  if (state.locked) return;

  // element rules
  const vBlue=validateTeamElements(state.blue), vRed=validateTeamElements(state.red);
  const aBlue=validateAllowedElements(state.blue), aRed=validateAllowedElements(state.red);
  if (!vBlue.ok || !vRed.ok || !aBlue.ok || !aRed.ok){
    const msg1=[elementRuleMessage("Blue",vBlue), elementRuleMessage("Red",vRed)].filter(Boolean).join("\n");
    const msg2=[aBlue.bad?.length?`Blue illegal: ${aBlue.bad.map(p=>`${p.name}(${p.el})`).join(", ")}`:"", aRed.bad?.length?`Red illegal: ${aRed.bad.map(p=>`${p.name}(${p.el})`).join(", ")}`:""].filter(Boolean).join("\n");
    $("#result").textContent = "Cannot run round:\n"+[msg1,msg2].filter(Boolean).join("\n");
    return;
  }

  const seed=$("#seed").value.trim()||"seed";
  const dt=parseInt($("#dt").value,10)||5;
  const scale=parseInt($("#scale").value,10)||60;
  const variancePct=parseInt($("#variance").value,10)||0;

  $("#runBtn").disabled=true; $("#nextBtn").disabled=true;

  const out = simulateRound({
    seed, dt, scale, variancePct,
    blue: state.blue, red: state.red,
    carry: state.carry
  });

  $("#result").textContent = `Round ${state.round} Winner: ${out.winner}\nFinal zone: ${out.zone>=0?"+":""}${out.zone}`;
  $("#log").textContent = out.lines.join("\n");
  drawGraph($("#graph"), out.timeline);

  // summary (lazy import to keep main.js short)
  import("./summary.js").then(({summarizeRound})=>{
    $("#summary").textContent = summarizeRound(out, state.blue, state.red);
  });

  // carry into next round
  state.carry = recoverBetweenRounds(state.blue, state.red, out.endFactors);
  state.locked = true;
  $("#nextBtn").disabled=false;
});

$("#nextBtn").addEventListener("click", ()=>{
  state.round += 1;
  $("#roundNo").textContent = String(state.round);
  state.locked=false;
  $("#runBtn").disabled=false;
  $("#nextBtn").disabled=true;
  // small note
  const s = state.carry;
  const note = `— Between-round recovery → STM(B/R) ${s.stamB.toFixed(2)}/${s.stamR.toFixed(2)}, CMP(B/R) ${s.compB.toFixed(2)}/${s.compR.toFixed(2)}.`;
  $("#log").textContent += ("\n" + note);
});
