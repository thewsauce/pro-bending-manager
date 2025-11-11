// src/main.js
import { loadRosters, teamFromIds, rosterText } from "./data.js";
import {
  validateTeamElements,
  validateAllowedElements,
  elementRuleMessage,
} from "./validators.js";
import { simulateRound, recoverBetweenRounds } from "./sim.js";
import { drawGraph } from "./graph.js";
import { summarizeRound } from "./summary.js";
import { applyRoundVariance } from "./variance.js";
import { mulberry32 } from "./util.js";
import { setupTeamModal } from "./team_modal.js";

const $ = (sel) => document.querySelector(sel);

const state = {
  base: null,
  blue: null,
  red: null,
  carry: null, // {stamB, stamR, compB, compR}
  round: 1,
  locked: false,
};

function renderRosters() {
  $("#blueRoster").textContent = rosterText(state.blue);
  $("#redRoster").textContent  = rosterText(state.red);
}

function updateTicks() {
  const dt = parseInt($("#dt").value || "5", 10);
  $("#ticksAuto").textContent = String(Math.max(1, Math.floor(180 / dt)));
}

// ---------- Boot ----------
(async function boot() {
  try {
    const base = await loadRosters();
    state.base = base;

    // Default teams (adjust names if yours differ)
    const blueIds = base.teams.Stormfront || Object.values(base.teams)[0];
    const redIds  = base.teams.FireFerrets || Object.values(base.teams)[1];

    state.blue = teamFromIds(base, blueIds);
    state.red  = teamFromIds(base, redIds);

    renderRosters();
    updateTicks();

    // Init modal
    setupTeamModal(
      state.base,
      () => ({ blueIds: state.blue.map(p=>p.id), redIds: state.red.map(p=>p.id) }),
      ({ blueIds, redIds }) => {
        state.blue = teamFromIds(state.base, blueIds);
        state.red  = teamFromIds(state.base, redIds);

        // reset match state on team change
        state.carry = null;
        state.round = 1;
        state.locked = false;
        $("#roundNo").textContent = "1";
        $("#result").textContent = "—";
        $("#summary").textContent = "—";
        $("#log").textContent = "—";
        drawGraph($("#graph"), []);
        renderRosters();
        $("#nextBtn").disabled = true;
        $("#runBtn").disabled = false;
      }
    );

    $("#boot").textContent = "Rosters loaded.";
    $("#runBtn").disabled = false;
    $("#resetBtn").disabled = false;
  } catch (e) {
    $("#boot").textContent = "Load error: " + (e?.message || e);
  }
})();

// ---------- UI wiring ----------
$("#dt").addEventListener("input", updateTicks);

$("#resetBtn").addEventListener("click", () => {
  const base = state.base;
  const blueIds = base.teams.Stormfront || Object.values(base.teams)[0];
  const redIds  = base.teams.FireFerrets || Object.values(base.teams)[1];

  state.blue = teamFromIds(base, blueIds);
  state.red  = teamFromIds(base, redIds);
  state.carry = null;
  state.round = 1;
  state.locked = false;

  $("#roundNo").textContent = "1";
  $("#result").textContent = "—";
  $("#summary").textContent = "—";
  $("#log").textContent = "—";
  drawGraph($("#graph"), []);
  renderRosters();
  $("#nextBtn").disabled = true;
  $("#runBtn").disabled = false;
});

$("#runBtn").addEventListener("click", () => {
  if (state.locked) return;

  // Element rules
  const vBlue = validateTeamElements(state.blue);
  const vRed  = validateTeamElements(state.red);
  const aBlue = validateAllowedElements(state.blue);
  const aRed  = validateAllowedElements(state.red);
  if (!vBlue.ok || !vRed.ok || !aBlue.ok || !aRed.ok) {
    const msg1 = [elementRuleMessage("Blue", vBlue), elementRuleMessage("Red", vRed)]
      .filter(Boolean).join("\n");
    const msg2 = [
      aBlue.bad?.length ? `Blue illegal: ${aBlue.bad.map((p)=>`${p.name}(${p.el})`).join(", ")}` : "",
      aRed.bad?.length  ? `Red illegal: ${aRed.bad.map((p)=>`${p.name}(${p.el})`).join(", ")}`  : "",
    ].filter(Boolean).join("\n");
    $("#result").textContent = "Cannot run round:\n" + [msg1, msg2].filter(Boolean).join("\n");
    return;
  }

  const seed = $("#seed").value.trim() || "seed";
  const dt = parseInt($("#dt").value, 10) || 5;
  const scale = parseInt($("#scale").value, 10) || 60;
  const variancePct = parseInt($("#variance").value, 10) || 0;

  $("#runBtn").disabled = true;
  $("#nextBtn").disabled = true;

  // Pre-round variance (mood + element + play-styles)
  const rngBlue = mulberry32(`${seed}:round${state.round}:blue`);
  const rngRed  = mulberry32(`${seed}:round${state.round}:red`);
  const { team: blueRound, notes: blueNotes } = applyRoundVariance(state.blue, rngBlue);
  const { team: redRound,  notes: redNotes  } = applyRoundVariance(state.red,  rngRed);

  const preface = [
    `— Round ${state.round} pre-buffs —`,
    ...blueNotes.map(s => `[Blue] ${s}`),
    ...redNotes.map(s  => `[Red ] ${s}`),
    ""
  ].join("\n");
  $("#log").textContent = preface;

  const out = simulateRound({
    seed, dt, scale, variancePct,
    blue: blueRound,
    red:  redRound,
    carry: state.carry
  });

  $("#result").textContent =
    `Round ${state.round} Winner: ${out.winner}\n` +
    `Final zone: ${(out.zone >= 0 ? "+" : "") + out.zone}`;

  $("#log").textContent += out.lines.length
    ? out.lines.map(s => "- " + s).join("\n").replace(/^/m, "\n")
    : "\n— (Quiet round)";

  drawGraph($("#graph"), out.timeline);
  $("#summary").textContent = summarizeRound(out, state.blue, state.red);

  state.carry = recoverBetweenRounds(state.blue, state.red, out.endFactors);

  state.locked = true;
  $("#nextBtn").disabled = false;
  $("#runBtn").disabled = false;
});

$("#nextBtn").addEventListener("click", () => {
  state.round += 1;
  state.locked = false;
  $("#roundNo").textContent = String(state.round);
  $("#runBtn").disabled = false;
  $("#nextBtn").disabled = true;

  if (state.carry) {
    const s = state.carry;
    const note = `\n— Recovery applied → STM(B/R) ${s.stamB.toFixed(2)}/${s.stamR.toFixed(2)}, ` +
                 `CMP(B/R) ${s.compB.toFixed(2)}/${s.compR.toFixed(2)}.\n`;
    $("#log").textContent += note;
  }
});
