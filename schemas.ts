// Shared contract for the map plugin. Every other module in this plugin imports
// from this file; nothing in here imports from peers, so it is the canonical
// source of types and constants.

// ─── Coordinate ───────────────────────────────────────────────────────────────

export interface Coord {
  x: number;
  y: number;
  z: number;
}

export const coordKey = (c: Coord): string => `${c.x},${c.y},${c.z}`;

// ─── Biome & legend ───────────────────────────────────────────────────────────

/** A Latin-1 single character used on the minimap. */
export type Glyph = string;

export interface BiomeDefinition {
  /** Stable id used by configs and overlays. */
  id: string;
  /** Display label, e.g. "Mudflats". */
  name: string;
  /** Single Latin-1 character drawn on the minimap. */
  glyph: Glyph;
  /** Optional MUSH color code applied to the glyph (e.g. "%cg"). */
  color?: string;
  /**
   * Briefing-style phrase fragments the renderer may weave into prose.
   * Strictly objective tone — no "you see" phrasing.
   */
  phrases: {
    /** Used when this biome dominates the centre tile. */
    self: string[];
    /** Used when this biome appears in the named cardinal neighbourhood. */
    adjacent?: string[];
  };
  /** Optional traversal cost hint for movement / vehicle rules. */
  traversal?: "trivial" | "easy" | "rough" | "hazard" | "impassable";
}

/** Glyph categories enforced by the renderer to keep Latin-1 consistent. */
export interface MapLegend {
  /** Traversable terrain glyphs — light punctuation. e.g. ".", ",", "~". */
  terrain: Glyph[];
  /** Infrastructure glyphs — heavy symbols. e.g. "#", "=", "+". */
  infrastructure: Glyph[];
  /** Entity glyphs — alphabetical. e.g. "@", "R", "C". */
  entities: Glyph[];
}

// ─── Whittaker matrix ─────────────────────────────────────────────────────────

/**
 * Elevation / moisture both range 0..1 after octave summation + normalization.
 * A matrix entry is selected when both axes fall inside its range.
 */
export interface WhittakerCell {
  elevation: [number, number];
  moisture: [number, number];
  biome: string; // BiomeDefinition.id
}

// ─── Plugin configuration ─────────────────────────────────────────────────────

export interface MapNoiseConfig {
  seed: string;
  /** World-space distance covered by one base-octave noise unit. */
  scale: number;
  /**
   * Octave weighting. Each entry is { frequency, amplitude }. Sum of
   * amplitudes is normalized internally.
   */
  octaves: { frequency: number; amplitude: number }[];
}

export interface MapConfig {
  /** Two independent seeds, offset deterministically via alea. */
  noise: {
    elevation: MapNoiseConfig;
    moisture: MapNoiseConfig;
  };
  biomes: BiomeDefinition[];
  legend: MapLegend;
  matrix: WhittakerCell[];
  /** Width of the rendered minimap in cells. Must be odd. Default 15. */
  viewportWidth?: number;
  /** Height of the rendered minimap in cells. Must be odd. Default 7. */
  viewportHeight?: number;
  /** Optional named regions used for header labels — keyed by sector slug. */
  sectors?: Record<string, { name: string; aabb: [Coord, Coord] }>;
}

// ─── Tile overlay (authored / persistent state) ───────────────────────────────

/**
 * Stored only when authored content overrides procedural terrain at a coord
 * (a building, a cache, a faction marker). Absence of an overlay means
 * "use the topology engine".
 */
export interface TileOverlay {
  /** Composite key `${x},${y},${z}` — also persisted as separate fields. */
  key: string;
  x: number;
  y: number;
  z: number;
  /** Overrides the procedural biome glyph if set. */
  glyph?: Glyph;
  /** Overrides the procedural biome id if set. */
  biome?: string;
  /** Authored display name, e.g. "Forward Command Bunker". */
  name?: string;
  /** "infrastructure" | "landmark" | "hazard" | "cache" | "faction". */
  kind?: string;
  /** Faction tag rendered in brackets, e.g. "Republic". */
  faction?: string;
  /** Free-form authored description, evaluated through the format pipeline. */
  desc?: string;
}

// ─── Topology engine result ───────────────────────────────────────────────────

export interface TopologySample {
  coord: Coord;
  elevation: number; // 0..1
  moisture: number;  // 0..1
  biome: BiomeDefinition;
}

export interface NeighborhoodSample {
  centre: TopologySample;
  /** 8 Moore-neighborhood samples keyed by cardinal/ordinal direction. */
  ring: {
    N: TopologySample; NE: TopologySample; E: TopologySample; SE: TopologySample;
    S: TopologySample; SW: TopologySample; W: TopologySample; NW: TopologySample;
  };
}

// ─── Renderer input ───────────────────────────────────────────────────────────

export interface EntityMarker {
  glyph: Glyph;
  /** Player or NPC display name. */
  name: string;
  faction?: string;
  /** Optional flavor: "operating in an AT-RT Walker", "advancing through brush". */
  status?: string;
  /** Used for aggregation when many identical NPCs share a tile. */
  groupKey?: string;
}

export interface RenderTile {
  coord: Coord;
  glyph: Glyph;
  /** True if an overlay placed something on this tile. */
  authored: boolean;
}

export interface RenderInput {
  sectorTitle: string;
  centre: Coord;
  /** 2D grid sized viewportHeight x viewportWidth. */
  tiles: RenderTile[][];
  /** Topology of the centre tile + its Moore neighborhood. */
  neighborhood: NeighborhoodSample;
  /** Authored overlays present within the viewport. */
  overlays: TileOverlay[];
  /** Entities (players + NPCs) currently within the viewport. */
  entities: EntityMarker[];
  /** Cardinal label hints for the "ADJACENT SECTORS" footer. */
  adjacency: { N: string; S: string; E: string; W: string };
}

// ─── Renderer output constants ────────────────────────────────────────────────

export const VIEWPORT_COLS = 78;
export const MAX_VIEWPORT_LINES = 28;
export const DEFAULT_MINIMAP_W = 15;
export const DEFAULT_MINIMAP_H = 7;

// ─── DBO collection name ──────────────────────────────────────────────────────

/** Plugin DBO collection holding TileOverlay records. */
export const OVERLAY_COLLECTION = "map.overlays";
