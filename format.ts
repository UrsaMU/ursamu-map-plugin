// DESCFORMAT handler — renders a procedural map sector when the target looks
// like one. Returns null to fall through to softcode @desc / built-in for
// anything else. Composition pulls topology + overlays + entities and hands
// the assembled RenderInput to the renderer.

import type { FormatHandler } from "ursamu";
import type { IDBObj, IUrsamuSDK } from "ursamu";
import type {
  Coord,
  EntityMarker,
  RenderInput,
  RenderTile,
  TileOverlay,
} from "./schemas.ts";
import { DEFAULT_MINIMAP_H, DEFAULT_MINIMAP_W } from "./schemas.ts";

import { defaultMapConfig } from "./config.default.ts";
import { createTopologyEngine } from "./topology.ts";
import { getOverlay, getOverlaysInRegion } from "./state.ts";
import { getEntitiesInRegion } from "./entities.ts";
import { renderMap } from "./renderer.ts";

// ─── Heuristics ───────────────────────────────────────────────────────────────

function readCoord(target: IDBObj): Coord | null {
  const raw = (target.state as Record<string, unknown>)?.coord;
  if (!raw || typeof raw !== "object") return null;
  const { x, y, z } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") {
    return null;
  }
  return { x, y, z };
}

function isMapSector(target: IDBObj): Coord | null {
  const coord = readCoord(target);
  if (coord) return coord;
  if (target.flags?.has("map")) {
    return { x: 0, y: 0, z: 0 };
  }
  return null;
}

// ─── Renderer input assembly ─────────────────────────────────────────────────

function buildTiles(
  centre: Coord,
  w: number,
  h: number,
  overlays: TileOverlay[],
  topo: ReturnType<typeof createTopologyEngine>,
): RenderTile[][] {
  const overlayKey = (x: number, y: number) =>
    overlays.find((o) => o.x === x && o.y === y && o.z === centre.z);
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const grid: RenderTile[][] = [];
  for (let row = 0; row < h; row++) {
    const line: RenderTile[] = [];
    const y = centre.y + (halfH - row);
    for (let col = 0; col < w; col++) {
      const x = centre.x + (col - halfW);
      const coord: Coord = { x, y, z: centre.z };
      const ov = overlayKey(x, y);
      if (ov?.glyph) {
        line.push({ coord, glyph: ov.glyph, authored: true });
      } else {
        const sample = topo.sample(coord);
        line.push({ coord, glyph: sample.biome.glyph, authored: false });
      }
    }
    grid.push(line);
  }
  return grid;
}

async function entitiesInRegion(
  centre: Coord,
  w: number,
  h: number,
): Promise<EntityMarker[]> {
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const min: Coord = { x: centre.x - halfW, y: centre.y - halfH, z: centre.z };
  const max: Coord = { x: centre.x + halfW, y: centre.y + halfH, z: centre.z };
  const provided = await getEntitiesInRegion({ min, max });
  return provided.map(({ coord: _c, ...marker }) => marker);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const descFormatHandler: FormatHandler = async (
  u: IUrsamuSDK,
  target: IDBObj,
  _defaultArg: string,
): Promise<string | null> => {
  const centre = isMapSector(target);
  if (!centre) return null;

  // Highest layer (softcode @desc) is handled by the engine before we run,
  // but be defensive: if the target carries a stored softcode desc, fall
  // through so it wins.
  const softDesc = await u.attr.get(target.id, "DESC");
  if (softDesc) return null;

  const cfg = defaultMapConfig;
  const w = cfg.viewportWidth ?? DEFAULT_MINIMAP_W;
  const h = cfg.viewportHeight ?? DEFAULT_MINIMAP_H;
  const topo = createTopologyEngine(cfg);
  const neighborhood = topo.sampleNeighborhood(centre);

  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const overlays = await getOverlaysInRegion(
    { x: centre.x - halfW, y: centre.y - halfH, z: centre.z },
    { x: centre.x + halfW, y: centre.y + halfH, z: centre.z },
  );
  const centreOverlay = await getOverlay(centre);
  const merged = centreOverlay
    ? [...overlays.filter((o) => o.key !== centreOverlay.key), centreOverlay]
    : overlays;

  const tiles = buildTiles(centre, w, h, merged, topo);

  const sectorTitle = centreOverlay?.name ??
    cfgSectorName(cfg, centre) ??
    `Sector ${centre.x},${centre.y},${centre.z}`;

  const input: RenderInput = {
    sectorTitle,
    centre,
    tiles,
    neighborhood,
    overlays: merged,
    entities: await entitiesInRegion(centre, w, h),
    adjacency: {
      N: neighborhood.ring.N.biome.name,
      S: neighborhood.ring.S.biome.name,
      E: neighborhood.ring.E.biome.name,
      W: neighborhood.ring.W.biome.name,
    },
  };
  return renderMap(input);
};

function cfgSectorName(
  cfg: typeof defaultMapConfig,
  c: Coord,
): string | null {
  if (!cfg.sectors) return null;
  for (const slug of Object.keys(cfg.sectors)) {
    const { name, aabb } = cfg.sectors[slug];
    const [lo, hi] = aabb;
    if (
      c.x >= lo.x && c.x <= hi.x &&
      c.y >= lo.y && c.y <= hi.y &&
      c.z >= lo.z && c.z <= hi.z
    ) return name;
  }
  return null;
}
