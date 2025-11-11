// src/data.js
// Handles loading and saving of rosters in both local (dev) and GitHub Pages (production) environments.

export async function loadRosters() {
  // Prefer local overrides (if you ever add an editor or custom rosters)
  const local = localStorage.getItem("rosters.v1");
  if (local) return JSON.parse(local);

  // Use Vite's environment variable for correct relative pathing on GitHub Pages.
  // import.meta.env.BASE_URL is automatically set from vite.config.js `base`.
  const base = import.meta.env.BASE_URL || "/";
  const url = `${base}data/rosters.json`;

  try {
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch roster data: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[loadRosters] Could not load roster file:", err);
    throw err;
  }
}

// optional save for future roster editors
export function saveRosters(rosters) {
  localStorage.setItem("rosters.v1", JSON.stringify(rosters));
}

// helper for expanding ids into player objects
export const teamFromIds = (base, ids) =>
  ids.map((id) => ({ id, ...base.players[id] }));

// render a pretty text view of each team
export const rosterText = (team) =>
  team
    .map((p) => {
      const el = p.el?.[0]?.toUpperCase() + p.el?.slice(1);
      const g = (p.gender || "?").toUpperCase();
      const core = [
        "INI",
        "STR",
        "PRC",
        "GST",
        "AWR",
        "RHY",
        "CMP",
        "POS",
        "STM",
        "END",
      ]
        .map((k) => `${k}:${String(p[k]).padStart(2, " ")}`)
        .join(" ");
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
