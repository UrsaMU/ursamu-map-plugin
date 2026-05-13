// +map / +move commands. Single catch-all switch dispatcher for +map per
// CLAUDE.md catch-all gotcha; +move is a separate command.

import { addCmd, DBO } from "ursamu";
import type { IDBObj, IUrsamuSDK } from "ursamu";
import {
  CONTROLLING_STATE_FIELD,
  type Coord,
  MAP_CAPABLE_FLAG,
  OVERLAY_COLLECTION,
  SPECTATING_STATE_FIELD,
  type TileOverlay,
} from "./schemas.ts";

type StoredOverlay = TileOverlay & { id: string };

async function lookup(u: IUrsamuSDK, id: string): Promise<IDBObj | null> {
  const rows = await u.db.search({ id });
  return rows[0] ?? null;
}
import { getOverlay } from "./state.ts";
import {
  destroyEntity,
  getActiveEntity,
  getEntity,
  moveEntity,
  setEntity,
} from "./entities.ts";
import { parseCoord } from "./commands_internals.ts";

const HELP = `+map[/<switch>] [<args>]  — Procedural sector map & movement.

Switches:
  /here                 Render the sector around your active entity (default).
  /jump <x> <y> [z]     Admin: move your active entity to a coord.
  /embark <target>      Board a map-capable vehicle in your room.
  /disembark            Step out of the vehicle you are inside.
  /launch               Take the vehicle you are in onto the map.
  /land                 Bring your in-map vehicle back to its dock.
  /link <entityId>      Builder+: command an entity remotely.
  /unlink               Stop commanding an entity remotely.
  /spectate <entityId>  Admin: watch an entity's vision.
  /unspectate           Admin: stop spectating.
  /stats                Builder+: dump system stats.

+move <dir>             Move active entity (n/s/e/w/ne/nw/se/sw/u/d).

Examples:
  +map                          Render the sector around you.
  +map/embark AT-RT             Board the AT-RT in your room.
  +map/launch                   Take the AT-RT onto the map.
  +map/jump 120 -40             Admin: jump your entity to (120,-40,0).
  +map/link entity-42           Take remote control of entity-42.
  +move ne                      Move one tile northeast.`;

const DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  n: { dx: 0, dy: 1 }, north: { dx: 0, dy: 1 },
  s: { dx: 0, dy: -1 }, south: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 }, east: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 }, west: { dx: -1, dy: 0 },
  ne: { dx: 1, dy: 1 }, northeast: { dx: 1, dy: 1 },
  nw: { dx: -1, dy: 1 }, northwest: { dx: -1, dy: 1 },
  se: { dx: 1, dy: -1 }, southeast: { dx: 1, dy: -1 },
  sw: { dx: -1, dy: -1 }, southwest: { dx: -1, dy: -1 },
};

function isAdmin(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") || u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

function isBuilder(u: IUrsamuSDK): boolean {
  return u.me.flags.has("builder") || isAdmin(u);
}

function noActiveMsg(): string {
  return "%crYou have no map presence. Embark a map-capable vehicle first.%cn";
}

async function handleHere(u: IUrsamuSDK): Promise<void> {
  const active = await getActiveEntity(u);
  if (!active) {
    u.send(noActiveMsg());
    return;
  }
  const c = active.entity.coord;
  u.send(`%cyMap centred on ${active.entity.name} at (${c.x}, ${c.y}, ${c.z}). Look to view.%cn`);
}

async function handleJump(u: IUrsamuSDK, rest: string): Promise<void> {
  if (!isAdmin(u)) {
    u.send("%crPermission denied — +map/jump is admin-only.%cn");
    return;
  }
  const coord = parseCoord(rest);
  if (!coord) {
    u.send("Usage: +map/jump <x> <y> [z]");
    return;
  }
  const active = await getActiveEntity(u);
  if (!active) {
    u.send(noActiveMsg());
    return;
  }
  await moveEntity(active.entity.id, coord);
  u.send(`%cgJumped ${active.entity.name} to (${coord.x}, ${coord.y}, ${coord.z}).%cn`);
}

async function handleEmbark(u: IUrsamuSDK, rawName: string): Promise<void> {
  if (!rawName) {
    u.send("Usage: +map/embark <target>");
    return;
  }
  const target = await u.util.target(u.me, rawName, true);
  if (!target) {
    u.send("%crNo such target here.%cn");
    return;
  }
  if (target.location !== u.here.id) {
    u.send("%crThat is not in your room.%cn");
    return;
  }
  if (!target.flags.has(MAP_CAPABLE_FLAG)) {
    u.send("%crThat is not map-capable.%cn");
    return;
  }
  await u.db.modify(u.me.id, "$set", { location: target.id });
  u.send(`%cgYou board ${target.name}.%cn`);
}

async function handleDisembark(u: IUrsamuSDK): Promise<void> {
  const locId = u.me.location;
  if (typeof locId !== "string" || !locId) {
    u.send("%crYou are not inside anything.%cn");
    return;
  }
  const container = await lookup(u, locId);
  if (!container || !container.flags.has(MAP_CAPABLE_FLAG)) {
    u.send("%crYou are not inside a map-capable vehicle.%cn");
    return;
  }
  const dock = (container.state ?? {}).lastDock as string | undefined;
  const dest = (dock && typeof dock === "string") ? dock : container.location;
  await u.db.modify(u.me.id, "$set", { location: dest });
  u.send(`%cgYou disembark from ${container.name}.%cn`);
}

async function handleLaunch(u: IUrsamuSDK): Promise<void> {
  const locId = u.me.location;
  const container = locId ? await lookup(u, locId) : null;
  if (!container || !container.flags.has(MAP_CAPABLE_FLAG)) {
    u.send("%crYou are not inside a map-capable vehicle.%cn");
    return;
  }
  const cstate = container.state ?? {};
  const coord = (cstate.coord as Coord | undefined) ?? { x: 0, y: 0, z: 0 };
  const entityId = `entity-${container.id}-${Date.now()}`;
  await setEntity({
    id: entityId,
    coord,
    glyph: "@",
    kind: "vehicle",
    containerId: container.id,
    name: container.name ?? "Vehicle",
    vision: 6,
  });
  const dock = container.location;
  await u.db.modify(container.id, "$set", {
    "state.lastDock": dock,
    location: `map:${entityId}`,
  });
  u.send(`%cg${container.name} launches into the map at (${coord.x}, ${coord.y}, ${coord.z}).%cn`);
}

async function handleLand(u: IUrsamuSDK): Promise<void> {
  const active = await getActiveEntity(u);
  if (!active || active.mode !== "container") {
    u.send("%crYou are not piloting an in-map vehicle.%cn");
    return;
  }
  const ov = await getOverlay(active.entity.coord);
  if (ov?.blocksMovement === true) {
    u.send("%crCannot land: the tile blocks movement.%cn");
    return;
  }
  const containerId = active.entity.containerId;
  if (!containerId) {
    u.send("%crEntity has no container.%cn");
    return;
  }
  const container = await lookup(u, containerId);
  const dock = (container?.state ?? {}).lastDock as string | undefined;
  if (!dock) {
    u.send("%crNo dock recorded.%cn");
    return;
  }
  await destroyEntity(active.entity.id);
  await u.db.modify(containerId, "$set", {
    location: dock,
    "state.lastDock": "",
  });
  u.send(`%cg${container?.name ?? "Vehicle"} touches down.%cn`);
}

async function handleLink(u: IUrsamuSDK, id: string): Promise<void> {
  if (!isBuilder(u)) {
    u.send("%crPermission denied — +map/link requires builder+.%cn");
    return;
  }
  if (!id) {
    u.send("Usage: +map/link <entityId>");
    return;
  }
  const entity = await getEntity(id);
  if (!entity) {
    u.send("%crNo such entity.%cn");
    return;
  }
  if (entity.controllerId && entity.controllerId !== u.me.id) {
    u.send("%crEntity already has a controller.%cn");
    return;
  }
  if (!entity.controllerId) {
    await setEntity({ ...entity, controllerId: u.me.id });
  }
  await u.db.modify(u.me.id, "$set", { [`state.${CONTROLLING_STATE_FIELD}`]: id });
  u.send(`%cgLinked to ${entity.name}.%cn`);
}

async function handleUnlink(u: IUrsamuSDK): Promise<void> {
  await u.db.modify(u.me.id, "$set", { [`state.${CONTROLLING_STATE_FIELD}`]: "" });
  u.send("%cyUnlinked.%cn");
}

async function handleSpectate(u: IUrsamuSDK, id: string): Promise<void> {
  if (!isAdmin(u)) {
    u.send("%crPermission denied — admin only.%cn");
    return;
  }
  if (!id) {
    u.send("Usage: +map/spectate <entityId>");
    return;
  }
  const entity = await getEntity(id);
  if (!entity) {
    u.send("%crNo such entity.%cn");
    return;
  }
  await u.db.modify(u.me.id, "$set", { [`state.${SPECTATING_STATE_FIELD}`]: id });
  u.send(`%cySpectating ${entity.name}.%cn`);
}

async function handleUnspectate(u: IUrsamuSDK): Promise<void> {
  if (!isAdmin(u)) {
    u.send("%crPermission denied — admin only.%cn");
    return;
  }
  await u.db.modify(u.me.id, "$set", { [`state.${SPECTATING_STATE_FIELD}`]: "" });
  u.send("%cyNo longer spectating.%cn");
}

async function handleStats(u: IUrsamuSDK): Promise<void> {
  if (!isBuilder(u)) {
    u.send("%crPermission denied — builder+ only.%cn");
    return;
  }
  const overlays = await new DBO<StoredOverlay>(OVERLAY_COLLECTION).all();
  const byKind: Record<string, number> = {};
  for (const o of overlays) {
    const k = o.kind ?? "(none)";
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  const kindLines = Object.entries(byKind).map(([k, n]) => `    ${k}: ${n}`).join("\n");
  u.send(
    `%chMap stats%cn\n  overlays: ${overlays.length}\n${kindLines || "    (none)"}`,
  );
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

    if (!sw || sw === "here") return await handleHere(u);
    if (sw === "jump") return await handleJump(u, rest);
    if (sw === "embark") return await handleEmbark(u, rest);
    if (sw === "disembark") return await handleDisembark(u);
    if (sw === "launch") return await handleLaunch(u);
    if (sw === "land") return await handleLand(u);
    if (sw === "link") return handleLink(u, rest);
    if (sw === "unlink") return handleUnlink(u);
    if (sw === "spectate") return handleSpectate(u, rest);
    if (sw === "unspectate") return handleUnspectate(u);
    if (sw === "stats") return handleStats(u);

    u.send(`%crUnknown switch "/${sw}". See +help map.%cn`);
  },
});

addCmd({
  name: "+move",
  pattern: /^\+move\s+(\S+)/i,
  lock: "connected",
  category: "Map",
  help: "+move <dir> — Move your active entity one tile. See +help map.",
  exec: async (u: IUrsamuSDK) => {
    const raw = u.util.stripSubs(u.cmd.args[0] ?? "").toLowerCase().trim();
    const dir = DIRECTIONS[raw];
    if (!dir) {
      u.send(`%crCannot move ${raw}: unknown direction.%cn`);
      return;
    }
    const active = await getActiveEntity(u);
    if (!active) {
      u.send(noActiveMsg());
      return;
    }
    const cur = active.entity.coord;
    const dest: Coord = { x: cur.x + dir.dx, y: cur.y + dir.dy, z: cur.z };
    const ov = await getOverlay(dest);
    if (ov?.blocksMovement === true) {
      u.send(`%crCannot move ${raw}: tile blocks movement.%cn`);
      return;
    }
    await moveEntity(active.entity.id, dest);
    u.send(`%cg${active.entity.name} moves ${raw} to (${dest.x}, ${dest.y}, ${dest.z}).%cn`);
  },
});
