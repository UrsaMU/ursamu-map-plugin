import { assertEquals } from "@std/assert";

import {
  invalidatePluginConfigCache,
  resolveDefaultCommandToggle,
} from "../plugin-config.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const CONFIG_PATH = "./config/map.json";

async function withConfigFile(
  body: unknown,
  fn: () => void | Promise<void>,
): Promise<void> {
  await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(body));
  invalidatePluginConfigCache();
  try {
    await fn();
  } finally {
    await Deno.remove(CONFIG_PATH).catch(() => {});
    invalidatePluginConfigCache();
  }
}

function withEnv(value: string | null, fn: () => void): void {
  const prev = Deno.env.get("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS");
  if (value === null) Deno.env.delete("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS");
  else Deno.env.set("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS", value);
  try {
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS");
    else Deno.env.set("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS", prev);
  }
}

Deno.test("plugin-config: default → both commands register", OPTS, () => {
  invalidatePluginConfigCache();
  withEnv(null, () => {
    assertEquals(resolveDefaultCommandToggle(), { map: true, move: true });
  });
});

Deno.test("plugin-config: file disables move only", OPTS, async () => {
  await withConfigFile({ defaultCommands: { move: false } }, () => {
    withEnv(null, () => {
      assertEquals(resolveDefaultCommandToggle(), { map: true, move: false });
    });
  });
});

Deno.test("plugin-config: file disables both", OPTS, async () => {
  await withConfigFile({ defaultCommands: { map: false, move: false } }, () => {
    withEnv(null, () => {
      assertEquals(resolveDefaultCommandToggle(), { map: false, move: false });
    });
  });
});

Deno.test("plugin-config: env var overrides file (kills both)", OPTS, async () => {
  await withConfigFile({ defaultCommands: { map: true, move: true } }, () => {
    withEnv("1", () => {
      assertEquals(resolveDefaultCommandToggle(), { map: false, move: false });
    });
  });
});

Deno.test("plugin-config: explicit opts override env var and file", OPTS, async () => {
  await withConfigFile({ defaultCommands: { map: false, move: false } }, () => {
    withEnv("1", () => {
      assertEquals(
        resolveDefaultCommandToggle({ map: true, move: true }),
        { map: true, move: true },
      );
    });
  });
});

Deno.test("plugin-config: missing file is treated as defaults", OPTS, () => {
  invalidatePluginConfigCache();
  withEnv(null, () => {
    assertEquals(resolveDefaultCommandToggle(), { map: true, move: true });
  });
});
