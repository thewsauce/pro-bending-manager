// src/data.js
// Load rosters from a bundled JSON module in /src (no fetch).
// Still respects a local override via localStorage if you add an editor later.

export async function loadRosters() {
  // Local override first (optional feature)
  const local = localStorage.getItem("rosters.v1");
  if (local) return JSON.parse(local);

  // Import JSON from /src. Choose the path that matches where you put it.
  // If you placed it at:   src/rosters.json
  const rosters = (await import("./rosters.json")).default;

  // If you instead placed it at:   src/assets/rosters.json
  // const rosters = (await import("./assets/rosters.json")).default;

  return rosters;
}

export function saveRosters(rosters) {
  try {
    localStorage.setItem("rosters.v1", JSON.stringify(rosters));
  } catch (err) {
    console.warn("Unable to save roster data locally:", err);
  }
}

export const teamFromIds = (base, ids) =>
  ids.map((id) => ({ id, ...base.players[id] }));

export const rosterText = (team) =>
  team
    .map((p) => {
      const el = p.el?.[0]?.toUpperCase() + p.el?.slice(1);
      const g = (p.gender || "?").toUpperCase();
      const keys = ["INI", "STR", "PRC", "GST", "AWR", "RHY", "CMP", "POS", "STM", "END"];
      const core = keys.map((k) => `${k}:${String(p[k]).padStart(2, " ")}`).join(" ");
      const ovr = Math.round(
        ["INI", "STR", "PRC", "GST", "AWR", "RHY", "CMP", "POS"].reduce(
          (a, k) => a + p[k],
          0
        ) / 8
      );
      return `${p.name.padEnd(10)} | ${el}/${g} | OVR ~ ${String(ovr).padStart(2, " ")} | ${core}`;
    })
    .join("\n");
