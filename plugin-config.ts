// Plugin-scoped runtime configuration.
//
// Read from `config/map.json` (optional) at module load. Used today for:
//   - toggling the bundled `+map` / `+move` registration per-command
//
// Schema (all fields optional, missing → defaults):
// {
//   "defaultCommands": {
//     "map":  true,
//     "move": false       // disable just the bundled +move
//   }
// }
//
// Precedence (high → low):
//   1. explicit `opts` argument passed to `registerDefaultCommands(opts)`
//   2. environment variable `URSAMU_MAP_DISABLE_DEFAULT_COMMANDS=1` (disables both)
//   3. `config/map.json` `defaultCommands` block
//   4. defaults (both register)

export interface MapPluginConfig {
  /**
   * Per-command registration toggle for the bundled commands.
   * Missing or true → register. False → skip.
   */
  defaultCommands?: {
    map?: boolean;
    move?: boolean;
  };
}

const CONFIG_PATH = "./config/map.json";

let cached: MapPluginConfig | null = null;
let cacheValid = false;

/**
 * Read `config/map.json` from disk synchronously. Returns an empty object
 * when the file is missing or unreadable (intentionally tolerant — the file
 * is optional). Result is cached for the lifetime of the process; call
 * {@link invalidatePluginConfigCache} after writing the file in a test.
 */
export function getPluginConfigSync(): MapPluginConfig {
  if (cacheValid && cached) return cached;
  try {
    const txt = Deno.readTextFileSync(CONFIG_PATH);
    const parsed = JSON.parse(txt);
    cached = (parsed && typeof parsed === "object") ? parsed as MapPluginConfig : {};
  } catch {
    cached = {};
  }
  cacheValid = true;
  return cached;
}

/** Test-only: drop the cached config so the next call re-reads the file. */
export function invalidatePluginConfigCache(): void {
  cached = null;
  cacheValid = false;
}

/**
 * Resolve whether the bundled `+map` / `+move` should register. Honors
 * (in order): the explicit `opts` arg, the env-var kill switch, the config
 * file, then the default (register both).
 */
export function resolveDefaultCommandToggle(
  opts?: { map?: boolean; move?: boolean },
): { map: boolean; move: boolean } {
  let envKill = false;
  try {
    envKill = Deno.env.get("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS") === "1";
  } catch {
    /* env access denied — treat as not set */
  }
  const fromFile = getPluginConfigSync().defaultCommands ?? {};
  return {
    map: opts?.map ?? (envKill ? false : (fromFile.map ?? true)),
    move: opts?.move ?? (envKill ? false : (fromFile.move ?? true)),
  };
}
