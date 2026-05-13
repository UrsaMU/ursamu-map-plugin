# ursamu-map-plugin

Procedural coordinate-based sector map for [UrsaMU](https://jsr.io/@ursamu/ursamu).

- **Topology engine** — two-axis Simplex noise (elevation × moisture) with multi-octave summation and a Whittaker biome matrix. Deterministic from a string seed.
- **Sparse state** — the world exists in math; rooms are never pre-materialized. Authored overrides are stored in a single DBO collection (`map.overlays`) keyed by `x,y,z`.
- **Latin-1 split-pane renderer** — 78-col viewport, minimap on the left, procedurally-woven topography prose on the right, plus infrastructure / contacts / adjacency sections. Uses the engine's native `header` / `divider` / `footer` helpers.
- **DESCFORMAT integration** — softcode `@desc` still wins; falls through to the procedural render for map sectors only; returns `null` for everything else.

## Install

```bash
deno add jsr:@ursamu/map-plugin
```

Then drop into your UrsaMU `plugins/` directory or load it like any other plugin.

## Commands

| Command | Lock | What it does |
|---------|------|--------------|
| `+map`, `+map/here` | `connected` | Render the sector around your current `state.coord`. |
| `+map/jump <x> <y> [z]` | gated by `builder+` flag inside `exec` | Teleport your map cursor to a coord and re-render. |

`+help map` is wired through the help directory.

## Config

The plugin ships with `defaultMapConfig` (7 biomes: deep_water, shallows, mudflats, plains, brush, ridge, road) covering the full elevation×moisture space. To swap in your own world, pass a `MapConfig` to your plugin's registration layer — see `schemas.ts` for the contract.

## Security invariants

- `safeText()` strips `%c*` color codes AND replaces `[` / `]` with `(` / `)` on every user-derived string before it lands in DESCFORMAT output. Without that, the engine would re-evaluate `[shutdown()]` in an overlay name as a softcode call.
- `parseCoord()` accepts integers only, magnitude capped at ±1,000,000.
- `validateOverlay()` enforces the same coord range, rejects `[`/`]` in any text field, and caps string lengths.
- `getOverlaysInRegion()` refuses bounding-box queries with more than 4,096 tiles.

See `tests/security_map_plugin.test.ts` for the exploit tests that lock these in.

## Showcase

```bash
deno task showcase
```

Renders the default config against a known centre, with two overlays and three contacts (including aggregated NPCs). The snapshot at `tests/map_render.snapshot.txt` locks the output — any visual regression breaks `deno task test`.

## Tests

```bash
deno task test
```

Covers security invariants, dimension contracts (78 cols, ≤28 lines), entity aggregation, and the snapshot fixture.

## License

MIT.
