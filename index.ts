// Map plugin entry point. Phase 1: importing ./commands.ts registers +map.
// Phase 2: init() wires DESCFORMAT into the format-attribute pipeline.

import type { IPlugin } from "ursamu";
import {
  registerFormatHandler,
  unregisterFormatHandler,
} from "ursamu";

import { descFormatHandler } from "./format.ts";
import "./commands.ts";

const mapPlugin: IPlugin = {
  name: "map",
  version: "1.0.0",
  description: "Procedural sector map with overlay support via DESCFORMAT.",

  init: () => {
    registerFormatHandler("DESCFORMAT", descFormatHandler);
    return true;
  },

  remove: () => {
    unregisterFormatHandler("DESCFORMAT", descFormatHandler);
  },
};

export default mapPlugin;
