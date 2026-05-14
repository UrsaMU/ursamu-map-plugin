// Map plugin entry point. Phase 1: importing ./commands.ts registers +map.
// Phase 2: init() wires DESCFORMAT into the format-attribute pipeline.
// Phase 3: init() schedules periodic fog-memory pruning.

import type { IPlugin } from "ursamu";
import {
  registerFormatHandler,
  unregisterFormatHandler,
} from "ursamu";

import { descFormatHandler } from "./format.ts";
import { pruneStaleMemory } from "./fog.ts";
import { registerMapRoutes } from "./routes.ts";
import "./commands.ts";

// Public extension API surfaced for sibling plugins.
export {
  E,
  type DirectionDelta,
  type GuardResult,
  type MoveContext,
  type MoveGuard,
  type MoveResult,
  moveCoord,
  N,
  NE,
  NW,
  registerMoveGuard,
  S,
  SE,
  SW,
  unregisterMoveGuard,
  W,
} from "./move.ts";

export {
  type InfoLineFn,
  registerInfoLine,
  registerRenderLayer,
  type RenderExtensionInput,
  type RenderLayerFn,
  unregisterInfoLine,
  unregisterRenderLayer,
} from "./extensions.ts";

export {
  getMapConfig,
  getTopologyEngine,
  listRegisteredRealms,
  registerMapConfig,
  unregisterMapConfig,
} from "./mapconfig.ts";

export {
  effectiveRegions,
  getRegion,
  getRegionPath,
} from "./regions.ts";

export {
  findPath,
  type FindPathOptions,
  getTraversalCost,
} from "./pathfinding.ts";

const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

let pruneTimer: number | undefined;

const runPrune = async (): Promise<void> => {
  try {
    await pruneStaleMemory();
  } catch (err) {
    console.error("[map-plugin] pruneStaleMemory failed:", err);
  }
};

const mapPlugin: IPlugin = {
  name: "map",
  version: "1.0.0",
  description: "Procedural sector map with overlay support via DESCFORMAT.",

  init: () => {
    registerFormatHandler("DESCFORMAT", descFormatHandler);
    registerMapRoutes();
    if (pruneTimer !== undefined) {
      clearInterval(pruneTimer);
      pruneTimer = undefined;
    }
    void runPrune();
    pruneTimer = setInterval(() => {
      void runPrune();
    }, PRUNE_INTERVAL_MS);
    return true;
  },

  remove: () => {
    unregisterFormatHandler("DESCFORMAT", descFormatHandler);
    if (pruneTimer !== undefined) {
      clearInterval(pruneTimer);
      pruneTimer = undefined;
    }
  },
};

export default mapPlugin;
