// Entity provider registry. Sibling plugins contribute on-map entities
// (NPCs, encounters, drones, vehicles) via registerEntityProvider; the
// renderer aggregates them through getEntitiesInRegion at render time.
//
// Providers are async and receive the viewport bounding box. They must
// return only entities whose coord falls inside the box. The plugin
// invokes every provider in parallel and concatenates results — order
// is not stable, so providers must not depend on each other.

import type { Coord, EntityMarker } from "./schemas.ts";

export interface EntityRegion {
  /** Inclusive viewport bounds. */
  min: Coord;
  max: Coord;
}

export interface ProvidedEntity extends EntityMarker {
  /** Position of the entity inside the queried region. */
  coord: Coord;
}

export type EntityProvider = (
  region: EntityRegion,
) => ProvidedEntity[] | Promise<ProvidedEntity[]>;

const providers = new Set<EntityProvider>();

export const registerEntityProvider = (fn: EntityProvider): void => {
  providers.add(fn);
};

export const unregisterEntityProvider = (fn: EntityProvider): void => {
  providers.delete(fn);
};

/** Test-only: clear every provider. Not part of the public contract. */
export const _clearEntityProviders = (): void => {
  providers.clear();
};

export const getEntitiesInRegion = async (
  region: EntityRegion,
): Promise<ProvidedEntity[]> => {
  if (providers.size === 0) return [];
  const results = await Promise.all(
    Array.from(providers).map(async (fn) => {
      try {
        return await fn(region);
      } catch {
        return [];
      }
    }),
  );
  return results.flat().filter((e) => insideRegion(e.coord, region));
};

const insideRegion = (c: Coord, r: EntityRegion): boolean =>
  c.x >= Math.min(r.min.x, r.max.x) && c.x <= Math.max(r.min.x, r.max.x) &&
  c.y >= Math.min(r.min.y, r.max.y) && c.y <= Math.max(r.min.y, r.max.y) &&
  c.z >= Math.min(r.min.z, r.max.z) && c.z <= Math.max(r.min.z, r.max.z);
