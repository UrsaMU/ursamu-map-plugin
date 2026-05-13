# Changelog

All notable changes to `@ursamu/map-plugin` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
