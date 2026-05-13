import { assertEquals, assertExists } from "@std/assert";

import { renderMap } from "../renderer.ts";
import { getPlayerCoord, validateOverlay } from "../state.ts";
import { parseCoord } from "../commands_internals.ts";
import type {
  Coord,
  NeighborhoodSample,
  RenderInput,
  TopologySample,
} from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const biome = (id = "mud") => ({
  id,
  name: "Mudflats",
  glyph: ".",
  phrases: { self: ["mud spreads everywhere"], adjacent: ["mud spreads"] },
});

const sample = (coord: Coord, id = "mud"): TopologySample => ({
  coord,
  elevation: 0.5,
  moisture: 0.5,
  biome: biome(id),
});

const ring = (centre: Coord): NeighborhoodSample => ({
  centre: sample(centre),
  ring: {
    N: sample({ ...centre, y: centre.y + 1 }),
    NE: sample({ x: centre.x + 1, y: centre.y + 1, z: centre.z }),
    E: sample({ ...centre, x: centre.x + 1 }),
    SE: sample({ x: centre.x + 1, y: centre.y - 1, z: centre.z }),
    S: sample({ ...centre, y: centre.y - 1 }),
    SW: sample({ x: centre.x - 1, y: centre.y - 1, z: centre.z }),
    W: sample({ ...centre, x: centre.x - 1 }),
    NW: sample({ x: centre.x - 1, y: centre.y + 1, z: centre.z }),
  },
});

Deno.test("H1: overlay name with [...] is escaped, not passed raw", OPTS, () => {
  const centre: Coord = { x: 0, y: 0, z: 0 };
  const input: RenderInput = {
    sectorTitle: "Test",
    centre,
    tiles: [[{ coord: centre, glyph: ".", authored: false }]],
    neighborhood: ring(centre),
    overlays: [{
      key: "0,0,0",
      x: 0, y: 0, z: 0,
      kind: "infrastructure",
      name: "[shutdown()]",
      faction: "[hack()]",
      glyph: "#",
    }],
    entities: [],
    adjacency: { N: "Plains", S: "Plains", E: "Plains", W: "Plains" },
  };
  const out = renderMap(input);
  assertEquals(out.match(/\[shutdown\(\)\]/), null, "overlay.name must be escaped");
  assertEquals(out.match(/\[hack\(\)\]/), null, "overlay.faction must be escaped");
});

Deno.test("H1: renderer section labels do not emit raw [ X ]", OPTS, () => {
  const centre: Coord = { x: 0, y: 0, z: 0 };
  const input: RenderInput = {
    sectorTitle: "Sec",
    centre,
    tiles: [[{ coord: centre, glyph: ".", authored: false }]],
    neighborhood: ring(centre),
    overlays: [],
    entities: [],
    adjacency: { N: "P", S: "P", E: "P", W: "P" },
  };
  const out = renderMap(input);
  assertEquals(out.match(/\[ [A-Z]/), null, "labels must not use [ X ] syntax");
});

Deno.test("L1: getPlayerCoord reads state.coord directly", OPTS, () => {
  const result = getPlayerCoord({ coord: { x: 5, y: 7, z: 0 } });
  assertExists(result);
  assertEquals(result, { x: 5, y: 7, z: 0 });
});

Deno.test("L1: getPlayerCoord returns null for missing/invalid coord", OPTS, () => {
  assertEquals(getPlayerCoord({}), null);
  assertEquals(getPlayerCoord({ coord: null }), null);
  assertEquals(getPlayerCoord({ coord: { x: 1, y: 2 } }), null);
  assertEquals(getPlayerCoord({ coord: { x: 1, y: 2, z: NaN } }), null);
  assertEquals(getPlayerCoord({ coord: { x: "1", y: 2, z: 0 } }), null);
});

Deno.test("M2: parseCoord rejects non-integers and out-of-range", OPTS, () => {
  assertEquals(parseCoord("1.5 2 3"), null);
  assertEquals(parseCoord("1e20 0 0"), null);
  assertEquals(parseCoord("-1e20 0 0"), null);
  assertEquals(parseCoord("foo bar"), null);
  assertEquals(parseCoord("10 20"), { x: 10, y: 20, z: 0 });
  assertEquals(parseCoord("10 20 -3"), { x: 10, y: 20, z: -3 });
});

Deno.test("L3: validateOverlay rejects bad payloads", OPTS, () => {
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 1e20, y: 0, z: 0 }),
    false,
  );
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 0, y: 0, z: 0, name: "[bad()]" }),
    false,
  );
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 0, y: 0, z: 0, glyph: "ab" }),
    false,
  );
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 0, y: 0, z: 0, name: "Bunker" }),
    true,
  );
});
