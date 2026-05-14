// Pure helpers used by commands.ts. Extracted so tests can import without
// triggering addCmd side-effects.

import type { Coord, MapBounds, MapEntity } from "./schemas.ts";

const COORD_MAX = 1_000_000;
const ADMIN_FLAGS = ["admin", "wizard", "superuser"];

export function parseCoord(raw: string): Coord | null {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const parseOne = (s: string): number | null => {
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || Math.abs(n) > COORD_MAX) return null;
    return n;
  };
  const x = parseOne(parts[0]);
  const y = parseOne(parts[1]);
  const z = parts.length >= 3 ? parseOne(parts[2]) : 0;
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

// ─── Auth predicates ──────────────────────────────────────────────────────────

interface FlaggedActor {
  id: string;
  flags: { has(flag: string): boolean };
}

interface OwnedThing {
  id: string;
  owner?: string;
}

export function isAdminLike(actor: FlaggedActor): boolean {
  return ADMIN_FLAGS.some((f) => actor.flags.has(f));
}

/**
 * Pilot rule: vehicle owner OR admin/wizard/superuser. Passengers who are not
 * the owner cannot launch / move / land the vehicle.
 */
export function canPilot(actor: FlaggedActor, vehicle: OwnedThing): boolean {
  if (isAdminLike(actor)) return true;
  if (!vehicle.owner) return false;
  return vehicle.owner === actor.id;
}

/**
 * Claim rule for entity.controllerId. First claim of an unowned entity is
 * admin-only (sysop establishes who commands a remote scout). Builders can
 * re-link to entities they already control — that's a different code path
 * checked separately.
 */
export function canClaimEntity(
  actor: FlaggedActor,
  entity: Pick<MapEntity, "controllerId">,
): boolean {
  if (entity.controllerId === actor.id) return true;
  return isAdminLike(actor);
}

// ─── Bounds + movement math ───────────────────────────────────────────────────

/** Returns true iff coord is inside bounds (or no bounds provided). */
export function isInBounds(coord: Coord, bounds?: MapBounds): boolean {
  if (!bounds) return true;
  const { min, max } = bounds;
  return (
    coord.x >= min.x && coord.x <= max.x &&
    coord.y >= min.y && coord.y <= max.y &&
    coord.z >= min.z && coord.z <= max.z
  );
}

/**
 * Pre-validates a coord intended for `setEntity` — same rules as validateEntity
 * applies to coords, plus optional config bounds. Used at launch to reject bad
 * vehicle state.coord up front rather than failing inside setEntity with a
 * cryptic message.
 */
/**
 * Returns ok iff `mover` may enter a tile occupied by `tileOccupants` per the
 * stacking rule: same-faction stacks freely, different-faction (including
 * factionless on either side) blocks. An empty occupant list always returns ok.
 */
export function canStackWith(
  mover: Pick<MapEntity, "id" | "factionId">,
  tileOccupants: MapEntity[],
): { ok: true } | { ok: false; reason: string } {
  const others = tileOccupants.filter((o) => o.id !== mover.id);
  if (others.length === 0) return { ok: true };
  const myFaction = mover.factionId;
  for (const o of others) {
    if (!myFaction || !o.factionId || o.factionId !== myFaction) {
      return { ok: false, reason: "hostile entity blocks the tile" };
    }
  }
  return { ok: true };
}

export function validateCoord(coord: unknown, bounds?: MapBounds): Coord | null {
  if (!coord || typeof coord !== "object") return null;
  const { x, y, z } = coord as Record<string, unknown>;
  const ok = (n: unknown): n is number =>
    typeof n === "number" && Number.isInteger(n) && Math.abs(n) <= COORD_MAX;
  if (!ok(x) || !ok(y) || !ok(z)) return null;
  const c: Coord = { x, y, z };
  if (!isInBounds(c, bounds)) return null;
  return c;
}
