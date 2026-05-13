// Pure helpers used by commands.ts. Extracted so tests can import without
// triggering addCmd side-effects.

import type { Coord } from "./schemas.ts";

const COORD_MAX = 1_000_000;

export function parseCoord(raw: string): Coord | null {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const parseOne = (s: string): number | null => {
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || Math.abs(n) > COORD_MAX) return null;
    return n;
  };
  const x = parseOne(parts[0]);
  const y = parseOne(parts[1]);
  const z = parts.length >= 3 ? parseOne(parts[2]) : 0;
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}
