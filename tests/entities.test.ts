import { assertEquals } from "@std/assert";

import {
  _clearEntityProviders,
  getEntitiesInRegion,
  registerEntityProvider,
  unregisterEntityProvider,
} from "../entities.ts";
import type { ProvidedEntity } from "../entities.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const region = (min = -5, max = 5) => ({
  min: { x: min, y: min, z: 0 },
  max: { x: max, y: max, z: 0 },
});

const npc = (x: number, y: number, name = "Mook"): ProvidedEntity => ({
  coord: { x, y, z: 0 },
  glyph: "N",
  name,
});

Deno.test("empty registry returns no entities", OPTS, async () => {
  _clearEntityProviders();
  const out = await getEntitiesInRegion(region());
  assertEquals(out, []);
});

Deno.test("provider results are aggregated", OPTS, async () => {
  _clearEntityProviders();
  registerEntityProvider(() => [npc(0, 0, "A"), npc(1, 1, "B")]);
  registerEntityProvider(() => [npc(-1, -1, "C")]);
  const out = await getEntitiesInRegion(region());
  assertEquals(out.length, 3);
});

Deno.test("entities outside the region are filtered", OPTS, async () => {
  _clearEntityProviders();
  registerEntityProvider(() => [npc(0, 0, "inside"), npc(99, 99, "outside")]);
  const out = await getEntitiesInRegion(region(-1, 1));
  assertEquals(out.map((e) => e.name), ["inside"]);
});

Deno.test("throwing provider is isolated, others still produce", OPTS, async () => {
  _clearEntityProviders();
  registerEntityProvider(() => {
    throw new Error("boom");
  });
  registerEntityProvider(() => [npc(0, 0, "survivor")]);
  const out = await getEntitiesInRegion(region());
  assertEquals(out.map((e) => e.name), ["survivor"]);
});

Deno.test("unregister removes a provider", OPTS, async () => {
  _clearEntityProviders();
  const fn = () => [npc(0, 0, "doomed")];
  registerEntityProvider(fn);
  unregisterEntityProvider(fn);
  const out = await getEntitiesInRegion(region());
  assertEquals(out, []);
});

Deno.test("async providers are awaited", OPTS, async () => {
  _clearEntityProviders();
  registerEntityProvider(() =>
    new Promise<ProvidedEntity[]>((r) =>
      setTimeout(() => r([npc(0, 0, "lazy")]), 5)
    )
  );
  const out = await getEntitiesInRegion(region());
  assertEquals(out.map((e) => e.name), ["lazy"]);
  _clearEntityProviders();
});
