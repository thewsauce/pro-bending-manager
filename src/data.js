// src/data.js
// Handles loading and saving of rosters in both local (dev) and GitHub Pages builds.
// Works with Vite's BASE_URL so that data loads correctly at https://user.github.io/<repo>/.

export async function loadRosters() {
  // 1️⃣ Prefer a locally saved copy if you ever add an in-browser editor.
  const local = localStorage.getItem("rosters.v1");
  if (local) return JSON.parse(local);

  // 2️⃣ Determine correct base path for both local dev and GitHub Pages.
  const base = import.meta.env.BASE_URL || "/";
  // Static JSON should live in /public/data/rosters.json (copied to dist/data/rosters.json).
  const url = `${base}data/rosters.json`;

  try {
    // 3️⃣ Cache bust with timestamp query to avoid stale JSON on Pages.
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok)
      throw new Error(`Failed to fetch roster data: ${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error("[loadRosters] Could not load roster file:", err);
    throw err;
  }
}

// 4️⃣ Save updated rosters locally (optional feature for future roster editing UI).
export function saveRosters(rosters) {
  try {
    localStorage.setItem("rosters.v1", JSON.stringify(rosters));
  } catch (err) {
    console.warn("Unable to save roster data locally:", err);
  }
}

// 5️⃣ Expand an array of player IDs into full player objects from the base dataset.
export const teamFromIds = (base, ids) =>
  ids.map((id) => ({ id, ...base.players[id] }));

// 6️⃣ Render a nicely formatted roster summary for display panels.
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
      return `${p.name.padEnd(10)} | ${el}/${g} | OVR ~ ${String(
        ovr
      ).padStart(2, " ")} | ${core}`;
    })
    .join("\n");
