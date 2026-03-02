import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

import { describe, it } from "vitest";

import {
  ConfigManager,
  ConfigManagerError,
  type ConfigWatchEvent,
} from "../config-manager.js";
import { createTempConfigContext, createValidConfig } from "./fixtures.js";

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await sleep(25);
  }

  throw new Error(`Condition not met within ${String(timeoutMs)}ms.`);
}

describe("config manager", () => {
  it("saves and loads config round trip", async () => {
    const context = await createTempConfigContext();

    try {
      const manager = new ConfigManager({ paths: context.paths, locale: "en" });
      const expected = createValidConfig();

      const saved = await manager.save(expected);
      const loaded = await manager.load();

      assert.deepEqual(saved, expected);
      assert.deepEqual(loaded, expected);
    } finally {
      await context.cleanup();
    }
  });

  it("returns CONFIG_NOT_FOUND when config is missing", async () => {
    const context = await createTempConfigContext();

    try {
      const manager = new ConfigManager({ paths: context.paths, locale: "en" });

      await assert.rejects(
        async () => manager.load(),
        (error: unknown): boolean => {
          assert.ok(error instanceof ConfigManagerError);
          assert.ok(hasErrorCode(error, "CONFIG_NOT_FOUND"));
          return true;
        },
      );
    } finally {
      await context.cleanup();
    }
  });

  it("returns CONFIG_PARSE_FAILED when config JSON is invalid", async () => {
    const context = await createTempConfigContext();

    try {
      await mkdir(context.paths.configDir, { recursive: true });
      await writeFile(context.paths.configFilePath, "{invalid-json", "utf8");

      const manager = new ConfigManager({ paths: context.paths, locale: "en" });

      await assert.rejects(
        async () => manager.load(),
        (error: unknown): boolean => {
          assert.ok(error instanceof ConfigManagerError);
          assert.ok(hasErrorCode(error, "CONFIG_PARSE_FAILED"));
          return true;
        },
      );
    } finally {
      await context.cleanup();
    }
  });

  it("emits a changed event from fs.watch with debounce", async () => {
    const context = await createTempConfigContext();

    try {
      const manager = new ConfigManager({
        paths: context.paths,
        locale: "en",
        watchDebounceMs: 20,
      });
      const events: ConfigWatchEvent[] = [];

      const handle = await manager.watch(
        (event): void => {
          events.push(event);
        },
        { debounceMs: 20, persistent: false },
      );

      try {
        await manager.save(createValidConfig());

        await waitForCondition(
          () => events.some((event) => event.type === "changed"),
          4000,
        );

        const changedEvent = events.find(
          (event): event is Extract<ConfigWatchEvent, { type: "changed" }> =>
            event.type === "changed",
        );

        assert.ok(changedEvent !== undefined);
        if (changedEvent !== undefined) {
          assert.equal(changedEvent.configFilePath, context.paths.configFilePath);
          assert.equal(changedEvent.config.version, 1);
        }
      } finally {
        handle.close();
      }
    } finally {
      await context.cleanup();
    }
  });
});
