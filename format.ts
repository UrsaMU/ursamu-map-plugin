// DESCFORMAT handler. Strict gating: target must be a MapEntity.containerId
// AND viewer (u.me) must have an active entity (passenger/controller/spectate).
import type { FormatHandler, IDBObj, IUrsamuSDK } from "ursamu";
import {
  type Coord,
  coordKey,
  DEFAULT_MINIMAP_H,
  DEFAULT_MINIMAP_W,
  type EntityMarker,
  type MapEntity,
  type RenderInput,
  type RenderTile,
  type TileOverlay,
} from "./schemas.ts";

import { defaultMapConfig } from "./config.default.ts";
import { createTopologyEngine } from "./topology.ts";
import { getOverlay, getOverlaysInRegion } from "./state.ts";
import {
  getActiveEntity,
  getEntitiesByContainer,
  getEntitiesByFaction,
  getEntitiesInRegion,
} from "./entities.ts";
import {
  buildOcclusionLookup,
  buildVisibilityMask,
  computeLiveVisible,
  getMemoryForOwner,
  unionLiveVisible,
  writeMemoryBatch,
} from "./fog.ts";
import { renderMap } from "./renderer.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Topo = ReturnType<typeof createTopologyEngine>;

const ownerKey = (e: MapEntity): string =>
  e.factionId ?? e.controllerId ?? e.id;

function buildTiles(
  centre: Coord, w: number, h: number, overlays: TileOverlay[], topo: Topo,
): RenderTile[][] {
  const lookup = new Map<string, TileOverlay>();
  for (const o of overlays) lookup.set(coordKey({ x: o.x, y: o.y, z: o.z }), o);
  const halfW = Math.floor(w / 2), halfH = Math.floor(h / 2);
  const grid: RenderTile[][] = [];
  for (let row = 0; row < h; row++) {
    const line: RenderTile[] = [];
    const y = centre.y + (halfH - row);
    for (let col = 0; col < w; col++) {
      const coord: Coord = { x: centre.x + (col - halfW), y, z: centre.z };
      const ov = lookup.get(coordKey(coord));
      line.push(ov?.glyph
        ? { coord, glyph: ov.glyph, authored: true }
        : { coord, glyph: topo.sample(coord).biome.glyph, authored: false });
    }
    grid.push(line);
  }
  return grid;
}

function cfgSectorName(cfg: typeof defaultMapConfig, c: Coord): string | null {
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

async function resolveViewParty(subject: MapEntity): Promise<MapEntity[]> {
  if (!subject.factionId) return [subject];
  const party = await getEntitiesByFaction(subject.factionId);
  return party.length > 0 ? party : [subject];
}

function tileGlyphAt(
  c: Coord, tiles: RenderTile[][], centre: Coord, w: number, h: number,
): string | null {
  if (c.z !== centre.z) return null;
  const col = c.x - centre.x + Math.floor(w / 2);
  const row = Math.floor(h / 2) - (c.y - centre.y);
  if (row < 0 || row >= h || col < 0 || col >= w) return null;
  return tiles[row][col].glyph;
}

function filterEntityMarkers(
  pool: MapEntity[], live: Set<string>, viewerFaction: string | undefined,
): EntityMarker[] {
  const out: EntityMarker[] = [];
  for (const e of pool) {
    if (!live.has(coordKey(e.coord))) continue;
    if (e.hidden && e.factionId !== viewerFaction) continue;
    out.push({ glyph: e.glyph, name: e.name, faction: e.factionId, status: e.status, groupKey: e.kind });
  }
  return out;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const descFormatHandler: FormatHandler = async (
  u: IUrsamuSDK,
  target: IDBObj,
  _defaultArg: string,
): Promise<string | null> => {
  const softDesc = await u.attr.get(target.id, "DESC");
  if (softDesc) return null;

  const candidates = await getEntitiesByContainer(target.id);
  const subject = candidates[0];
  if (!subject) return null;

  const active = await getActiveEntity(u);
  if (!active) return null;

  const cfg = defaultMapConfig;
  const w = cfg.viewportWidth ?? DEFAULT_MINIMAP_W;
  const h = cfg.viewportHeight ?? DEFAULT_MINIMAP_H;
  const halfW = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  const centre = subject.coord;

  const topo = createTopologyEngine(cfg);
  const min: Coord = { x: centre.x - halfW, y: centre.y - halfH, z: centre.z };
  const max: Coord = { x: centre.x + halfW, y: centre.y + halfH, z: centre.z };
  const regionOverlays = await getOverlaysInRegion(min, max);
  const centreOverlay = await getOverlay(centre);
  const merged = centreOverlay
    ? [...regionOverlays.filter((o) => o.key !== centreOverlay.key), centreOverlay]
    : regionOverlays;

  const tiles = buildTiles(centre, w, h, merged, topo);
  const neighborhood = topo.sampleNeighborhood(centre);

  // FoW: occlusion is computed from the SUBJECT's vantage; under admin spectate,
  // the admin's viewer entity differs from the subject, but vision is the
  // subject's, so the admin sees through the spectated piece.
  const party = await resolveViewParty(subject);
  const occlusion = buildOcclusionLookup(topo, merged);
  const live = party.length > 1
    ? unionLiveVisible(party, occlusion)
    : computeLiveVisible(subject, occlusion);

  const owner = ownerKey(subject);
  const memory = await getMemoryForOwner(owner);
  const visibility = buildVisibilityMask(live, memory);

  const now = Date.now();
  const updates = [];
  for (const k of live) {
    const [xs, ys, zs] = k.split(",");
    const c: Coord = { x: Number(xs), y: Number(ys), z: Number(zs) };
    const glyph = tileGlyphAt(c, tiles, centre, w, h);
    if (!glyph) continue;
    const ov = merged.find((o) => o.x === c.x && o.y === c.y && o.z === c.z);
    updates.push({
      key: `${owner}|${k}`, ownerId: owner, x: c.x, y: c.y, z: c.z,
      glyph, kind: ov?.kind, name: ov?.name, lastSeenAt: now,
    });
  }
  if (updates.length > 0) await writeMemoryBatch(updates);

  const pool = await getEntitiesInRegion(min, max);
  const entities = filterEntityMarkers(pool, live, subject.factionId);

  const sectorTitle = centreOverlay?.name ??
    cfgSectorName(cfg, centre) ??
    `Sector ${centre.x},${centre.y},${centre.z}`;

  const input: RenderInput = {
    sectorTitle,
    centre,
    tiles,
    neighborhood,
    overlays: merged,
    entities,
    adjacency: {
      N: neighborhood.ring.N.biome.name,
      S: neighborhood.ring.S.biome.name,
      E: neighborhood.ring.E.biome.name,
      W: neighborhood.ring.W.biome.name,
    },
    visibility,
    spectator: active.mode === "spectate",
  };
  return renderMap(input);
};
