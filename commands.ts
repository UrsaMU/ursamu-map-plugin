// +map command — centre the minimap on the player or jump a builder to a
// specific coordinate. Uses the catch-all switch pattern; sub-switches are
// dispatched inside exec (per CLAUDE.md catch-all gotcha).

import { addCmd } from "ursamu";
import type { IUrsamuSDK } from "ursamu";
import type { Coord } from "./schemas.ts";
import { getPlayerCoord, setPlayerCoord } from "./state.ts";
import { parseCoord } from "./commands_internals.ts";

const HELP = `+map[/<switch>] [<args>]  — View the procedural sector map.

Switches:
  /here          Centre the map on your current coordinate (default).
  /jump <x> <y> [z]  Teleport your map cursor to a coordinate (builder+).

Examples:
  +map                    Render the sector around you.
  +map/here               Same as bare +map.
  +map/jump 120 -40       Jump to (120, -40, 0).`;

function isBuilder(u: IUrsamuSDK): boolean {
  return u.me.flags.has("builder") ||
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

async function renderForCoord(u: IUrsamuSDK, coord: Coord): Promise<void> {
  // Stash the coord on a synthetic target so DESCFORMAT picks it up.
  const synthetic = {
    ...u.here,
    state: { ...u.here.state, coord },
    flags: new Set([...u.here.flags, "map"]),
  };
  const out = await u.util.resolveFormat?.(
    synthetic as unknown as Parameters<NonNullable<typeof u.util.resolveFormat>>[0],
    "DESCFORMAT",
    "",
  );
  if (out) {
    u.send(out);
    return;
  }
  u.send(`%cyNo map available at ${coord.x},${coord.y},${coord.z}.%cn`);
}

addCmd({
  name: "+map",
  pattern: /^\+map(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Map",
  help: HELP,
  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const rest = u.util.stripSubs(u.cmd.args[1] ?? "").trim();

    if (!sw || sw === "here") {
      const coord = getPlayerCoord(u.me.state ?? {}) ?? { x: 0, y: 0, z: 0 };
      await renderForCoord(u, coord);
      return;
    }

    if (sw === "jump") {
      if (!isBuilder(u)) {
        u.send("Permission denied — +map/jump requires builder+.");
        return;
      }
      const coord = parseCoord(rest);
      if (!coord) {
        u.send("Usage: +map/jump <x> <y> [z]");
        return;
      }
      await setPlayerCoord(u, u.me.id, coord);
      u.send(`Jumped to ${coord.x},${coord.y},${coord.z}.`);
      await renderForCoord(u, coord);
      return;
    }

    u.send(`Unknown switch "/${sw}". See +help map.`);
  },
});
