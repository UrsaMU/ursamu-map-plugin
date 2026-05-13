# Changelog

All notable changes to `@ursamu/map-plugin` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] - 2026-05-13

### BREAKING

- Players no longer carry `state.coord`. Map presence requires a `MapEntity` and either containment in a `MAP_CAPABLE` object or a `state.mapControlling` link.
- DESCFORMAT handler no longer triggers for arbitrary objects with `state.coord`. It triggers only when the target is a `MapEntity.containerId` and the viewer has a resolvable active entity (or is an admin spectator).
- `+map/jump` is now admin-only and operates on the caller's active entity, not the caller themselves.

### Added

- `MapEntity` model + `map.entities` DBO collection.
- `+map/embark`, `+map/disembark`, `+map/launch`, `+map/land`, `+map/link`, `+map/unlink`, `+map/spectate`, `+map/unspectate`, `+map/stats` commands.
- `+move` command (n/s/e/w/u/d/diagonals) that walks the caller's active entity.
- Fog of war: live vision (Chebyshev), faction-shared union, explored memory (`map.fog` DBO), terrain occlusion (`BiomeDefinition.occludes`, `TileOverlay.occludes`).
- `MAP_CAPABLE` object flag as the primary "passenger" gate.
- `MapConfig.bounds` (optional hard XYZ bounds).
- `TileOverlay.blocksMovement` for impassable authored tiles.

### Security

- New validateEntity invariants mirror validateOverlay (coord range, glyph length, no `[`/`]` in text, name/kind length caps, vision ≤ MAX_VISION).
- `+map/jump`, `+map/spectate`, `+map/stats` gated by admin/wizard/superuser flag check inside exec (per catch-all switch pattern).
- Off-map players see a hard-cordon error message ("You have no map presence"); admin spectate is the only override.

## [1.1.0] - 2026-05-13

### Changed

- **Drop `npm:simplex-noise` and `npm:alea` dependencies.** Topology engine now uses `createNoise(seed)` from `ursamu` (added in 2.5.2), which exposes a per-instance `Noise` class with its own permutation table. String seeds are hashed FNV-1a to a 32-bit int before passing to `createNoise`. Snapshot fixture re-bootstrapped — terrain output is deterministic but differs numerically from the previous Alea-seeded build.
- **Engine requirement bumped to `>=2.5.2`.** The plugin now has **zero npm dependencies** at the import-map level.

## [1.0.0] - 2026-05-13

### Added

- Initial plugin scaffold registered as `@ursamu/map-plugin` (UrsaMU `>=2.3.0`).
- Procedural topology engine backed by Simplex noise + Alea PRNG (`topology.ts`).
- Sparse DBO overlay store in the `map.overlays` collection with `getOverlay`, `getOverlaysInRegion`, `setOverlay`, `clearOverlay` (`state.ts`).
- Split-pane Latin-1 renderer using the engine's native `header` / `divider` / `footer` helpers (`renderer.ts`).
- DESCFORMAT integration: `descFormatHandler` registered via `registerFormatHandler` on `init()` and unregistered cleanly on `remove()`.
- `+map` command suite with `/here`, `/look`, and builder-gated `/jump` (`commands.ts`).
- Default 7-biome Whittaker config in `config.default.ts` plus configurable sector AABBs.
- 11/11 passing tests across the security and showcase suites.

### Security

- `safeText` escapes `[` and `]` in DESCFORMAT output to prevent MUSH-eval injection.
- `parseCoord` accepts integers only and rejects values outside +/- 1,000,000.
- `validateOverlay` enforces coord range, single-character glyph, 80-char name/faction/kind/biome cap, 2048-char desc cap, and bracket-free text fields.
- `getOverlaysInRegion` caps requested region span at `REGION_MAX_TILES = 4096` before scanning.

### Known limitations

- `entitiesInRegion` in `format.ts` is a stub — connected players and NPCs are not yet projected onto the viewport.
- No chunk-key index on overlays; `getOverlaysInRegion` performs `overlays.all()` then filters in memory.
- No REST routes shipped; consumers must register their own via `registerPluginRoute`.
- No config-injection plumbing — `defaultMapConfig` is imported directly by `format.ts`; swapping config requires a fork or patch.
- No in-game overlay-authoring command; overlays must be written programmatically via `setOverlay`.

[1.0.0]: https://jsr.io/@ursamu/map-plugin
