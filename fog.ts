import { DBO } from "ursamu";
import {
  type Coord,
  coordKey,
  FOG_COLLECTION,
  type FogRecord,
  type MapEntity,
  type TileOverlay,
  type VisibilityMask,
} from "./schemas.ts";
import type { TopologyEngine } from "./topology.ts";

export interface OcclusionLookup {
  (coord: Coord): number;
}

export function buildOcclusionLookup(
  topo: TopologyEngine,
  overlays: TileOverlay[],
): OcclusionLookup {
  const overlayByKey = new Map<string, TileOverlay>();
  for (const o of overlays) overlayByKey.set(o.key, o);
  const cache = new Map<string, number>();
  return (coord: Coord): number => {
    const key = coordKey(coord);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const overlay = overlayByKey.get(key);
    let value = 0;
    if (overlay?.occludes !== undefined) {
      value = overlay.occludes;
    } else {
      const biomeOcc = topo.sample(coord).biome.occludes;
      value = biomeOcc ?? 0;
    }
    cache.set(key, value);
    return value;
  };
}

function bresenhamLine(from: Coord, to: Coord): Coord[] {
  const points: Coord[] = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    points.push({ x: x0, y: y0, z: from.z });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}

export function computeLiveVisible(
  entity: MapEntity,
  occlusion: OcclusionLookup,
): Set<string> {
  const visible = new Set<string>();
  const origin = entity.coord;
  visible.add(coordKey(origin));
  const R = Math.max(0, entity.vision | 0);
  if (R === 0) return visible;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx === 0 && dy === 0) continue;
      const target: Coord = { x: origin.x + dx, y: origin.y + dy, z: origin.z };
      const line = bresenhamLine(origin, target);
      // Accumulate occlusion along the ray; target is visible itself (a wall is
      // seen) but anything past a cumulative >=1.0 step is hidden.
      let cumulative = 0;
      let blocked = false;
      for (let i = 1; i < line.length; i++) {
        const step = line[i];
        const isTarget = i === line.length - 1;
        if (isTarget) {
          if (!blocked) visible.add(coordKey(step));
          break;
        }
        cumulative += occlusion(step);
        if (cumulative >= 1.0) {
          visible.add(coordKey(step));
          blocked = true;
          break;
        }
        visible.add(coordKey(step));
      }
    }
  }
  return visible;
}

export function unionLiveVisible(
  entities: MapEntity[],
  occlusion: OcclusionLookup,
): Set<string> {
  const out = new Set<string>();
  for (const e of entities) {
    const part = computeLiveVisible(e, occlusion);
    for (const k of part) out.add(k);
  }
  return out;
}

export function buildVisibilityMask(
  live: Set<string>,
  memory: FogRecord[],
): VisibilityMask {
  const mem = new Map<string, FogRecord>();
  for (const rec of memory) {
    const key = coordKey({ x: rec.x, y: rec.y, z: rec.z });
    if (live.has(key)) continue;
    const prior = mem.get(key);
    if (!prior || prior.lastSeenAt < rec.lastSeenAt) mem.set(key, rec);
  }
  return { live, memory: mem };
}

type StoredFog = FogRecord & { id: string };

const fog = new DBO<StoredFog>(FOG_COLLECTION);

const stripId = (rec: StoredFog): FogRecord => {
  const { id: _id, ...rest } = rec;
  return rest;
};

export const getMemoryForOwner = async (
  ownerId: string,
): Promise<FogRecord[]> => {
  const all = await fog.all();
  return all.filter((r) => r.ownerId === ownerId).map(stripId);
};

export const writeMemoryBatch = async (
  records: FogRecord[],
): Promise<void> => {
  for (const rec of records) {
    const id = rec.key;
    const record: StoredFog = { ...rec, id };
    await fog.update({ id }, record);
  }
};

export const clearMemoryForOwner = async (ownerId: string): Promise<void> => {
  await fog.delete({ ownerId });
};
