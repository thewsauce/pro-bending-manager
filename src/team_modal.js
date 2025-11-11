// src/team_modal.js
import { validateTeamElements } from "./validators.js";

const ELS = ["fire","water","earth"]; // expand if you add air later

function byElement(players, el){
  return Object.entries(players)
    .filter(([,p]) => (p.el||"").toLowerCase()===el)
    .map(([id,p]) => ({ id, name:p.name }));
}

function fillSelect(sel, options){
  sel.innerHTML = "";
  for (const o of options){
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.name;
    sel.appendChild(opt);
  }
}

function setSelectValue(sel, id){
  if (!id) return;
  const opt = [...sel.options].find(o => o.value===id);
  if (opt) sel.value = id;
}

function getTeamIdsFromPreset(players, presetIds){
  // ensure exactly 1 per required element, fall back to first matching
  const pick = { fire:null, water:null, earth:null };
  for (const id of presetIds){
    const el = (players[id]?.el||"").toLowerCase();
    if (ELS.includes(el) && !pick[el]) pick[el] = id;
  }
  // any missing? auto-fill from roster by element first available
  ELS.forEach(el => {
    if (!pick[el]){
      const any = Object.entries(players).find(([,p]) => (p.el||"").toLowerCase()===el);
      if (any) pick[el] = any[0];
    }
  });
  return [pick.fire, pick.water, pick.earth].filter(Boolean);
}

export function setupTeamModal(base, getCurrentTeams, onSave){
  const modal = document.getElementById("teamsModal");
  const openBtn = document.getElementById("teamsBtn");
  const closeBtn = document.getElementById("teamsClose");
  const cancelBtn = document.getElementById("teamsCancel");
  const saveBtn = document.getElementById("teamsSave");

  const blueSelects = {
    fire:  document.getElementById("blueFire"),
    water: document.getElementById("blueWater"),
    earth: document.getElementById("blueEarth"),
  };
  const redSelects = {
    fire:  document.getElementById("redFire"),
    water: document.getElementById("redWater"),
    earth: document.getElementById("redEarth"),
  };

  const bluePreset = document.getElementById("bluePreset");
  const redPreset  = document.getElementById("redPreset");
  const blueLoad   = document.getElementById("blueLoadPreset");
  const redLoad    = document.getElementById("redLoadPreset");

  // Build options
  const pools = {
    fire:  byElement(base.players,"fire"),
    water: byElement(base.players,"water"),
    earth: byElement(base.players,"earth"),
  };
  for (const el of ELS){
    fillSelect(blueSelects[el], pools[el]);
    fillSelect(redSelects[el],  pools[el]);
  }

  // Preset lists
  const teamNames = Object.keys(base.teams);
  function fillPreset(sel){
    sel.innerHTML = "";
    for (const name of teamNames){
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    }
  }
  fillPreset(bluePreset);
  fillPreset(redPreset);

  blueLoad.addEventListener("click", ()=>{
    const ids = getTeamIdsFromPreset(base.players, base.teams[bluePreset.value]||[]);
    const [f,w,e] = ids;
    setSelectValue(blueSelects.fire,  f);
    setSelectValue(blueSelects.water, w);
    setSelectValue(blueSelects.earth, e);
  });
  redLoad.addEventListener("click", ()=>{
    const ids = getTeamIdsFromPreset(base.players, base.teams[redPreset.value]||[]);
    const [f,w,e] = ids;
    setSelectValue(redSelects.fire,  f);
    setSelectValue(redSelects.water, w);
    setSelectValue(redSelects.earth, e);
  });

  function open(){
    // Seed modal with current teams (if set)
    const { blueIds, redIds } = getCurrentTeams();
    // Map current to element slots
    const mapToEl = (ids)=>{
      const m = {fire:null,water:null,earth:null};
      ids.forEach(id => { const el=(base.players[id]?.el||"").toLowerCase(); if (ELS.includes(el)) m[el]=id;});
      return m;
    };
    const b = mapToEl(blueIds), r = mapToEl(redIds);
    setSelectValue(blueSelects.fire,  b.fire);
    setSelectValue(blueSelects.water, b.water);
    setSelectValue(blueSelects.earth, b.earth);
    setSelectValue(redSelects.fire,   r.fire);
    setSelectValue(redSelects.water,  r.water);
    setSelectValue(redSelects.earth,  r.earth);

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden","false");
  }

  function close(){
    modal.style.display = "none";
    modal.setAttribute("aria-hidden","true");
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);

  saveBtn.addEventListener("click", ()=>{
    const blueIds = [blueSelects.fire.value, blueSelects.water.value, blueSelects.earth.value];
    const redIds  = [redSelects.fire.value,  redSelects.water.value,  redSelects.earth.value];

    // Validate one-per-element using existing validator (extra safety)
    const mkTeam = ids => ids.map(id => ({ id, ...base.players[id] }));
    const vB = validateTeamElements(mkTeam(blueIds));
    const vR = validateTeamElements(mkTeam(redIds));
    if (!vB.ok || !vR.ok){
      alert("Each team must have exactly one fire, one water, and one earth bender.");
      return;
    }

    onSave({ blueIds, redIds });
    close();
  });

  return { open, close };
}
