import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it } from "vitest";

import type { OneclawConfigPaths } from "../../config/paths.js";
import {
  createSecretStore,
  type CommandRunner,
  type SecretStoreManager,
} from "../secret-store.js";

interface TempSecretContext {
  paths: OneclawConfigPaths;
  cleanup(): Promise<void>;
}

async function createTempSecretContext(): Promise<TempSecretContext> {
  const configDir = await mkdtemp(join(tmpdir(), "oneclaw-secret-test-"));
  const paths: OneclawConfigPaths = {
    configDir,
    configFilePath: join(configDir, "config.json"),
    backupsDir: join(configDir, "backups"),
    dataDir: join(configDir, "data"),
    secretsFilePath: join(configDir, "secrets.enc"),
  };

  return {
    paths,
    cleanup: async (): Promise<void> => {
      await rm(configDir, { recursive: true, force: true });
    },
  };
}

function createMacOsSecurityRunner(): CommandRunner {
  const secretMap = new Map<string, string>();

  return async (
    command: string,
    args: readonly string[],
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> => {
    if (command !== "security") {
      throw new Error(`Unexpected command: ${command}`);
    }

    const action = args[0];
    if (action === "list-keychains") {
      return { stdout: "default\n", stderr: "", exitCode: 0 };
    }

    const accountIndex = args.indexOf("-a");
    const account = accountIndex >= 0 ? args[accountIndex + 1] : undefined;
    if (typeof account !== "string") {
      return { stdout: "", stderr: "missing account", exitCode: 1 };
    }

    if (action === "add-generic-password") {
      const valueIndex = args.indexOf("-w");
      const value = valueIndex >= 0 ? args[valueIndex + 1] : undefined;
      if (typeof value !== "string") {
        return { stdout: "", stderr: "missing value", exitCode: 1 };
      }
      secretMap.set(account, value);
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    if (action === "find-generic-password") {
      const value = secretMap.get(account);
      if (value === undefined) {
        return {
          stdout: "",
          stderr: "The specified item could not be found in the keychain.",
          exitCode: 44,
        };
      }
      return { stdout: `${value}\n`, stderr: "", exitCode: 0 };
    }

    if (action === "delete-generic-password") {
      secretMap.delete(account);
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    return { stdout: "", stderr: `unsupported action: ${action ?? ""}`, exitCode: 1 };
  };
}

function createLinuxSecretToolRunner(): CommandRunner {
  const secretMap = new Map<string, string>();

  return async (
    command: string,
    args: readonly string[],
    options?: { stdin?: string },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> => {
    if (command !== "secret-tool") {
      throw new Error(`Unexpected command: ${command}`);
    }

    const action = args[0];
    if (action === "--help") {
      return { stdout: "secret-tool help", stderr: "", exitCode: 0 };
    }

    const keyFieldIndex = args.indexOf("key");
    const key = keyFieldIndex >= 0 ? args[keyFieldIndex + 1] : undefined;
    if (typeof key !== "string") {
      return { stdout: "", stderr: "missing key attribute", exitCode: 1 };
    }

    if (action === "store") {
      const value = options?.stdin ?? "";
      secretMap.set(key, value);
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    if (action === "lookup") {
      const value = secretMap.get(key);
      if (value === undefined) {
        return { stdout: "", stderr: "", exitCode: 1 };
      }
      return { stdout: `${value}\n`, stderr: "", exitCode: 0 };
    }

    if (action === "clear") {
      secretMap.delete(key);
      return { stdout: "", stderr: "", exitCode: 0 };
    }

    return { stdout: "", stderr: `unsupported action: ${action ?? ""}`, exitCode: 1 };
  };
}

async function assertSecretRoundTrip(
  store: SecretStoreManager,
  key: string,
  value: string,
): Promise<void> {
  await store.set(key, value);
  assert.equal(await store.has(key), true);
  assert.equal(await store.get(key), value);
  assert.deepEqual(await store.list(), [key]);

  await store.delete(key);
  assert.equal(await store.has(key), false);
  assert.equal(await store.get(key), null);
  assert.deepEqual(await store.list(), []);
}

describe("secret store integration", () => {
  it("auto-detects macOS keychain backend and supports round-trip", async () => {
    const context = await createTempSecretContext();

    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: context.paths,
        commandRunner: createMacOsSecurityRunner(),
      });

      assert.equal(store.getBackendKind(), "macos-keychain");
      await assertSecretRoundTrip(
        store,
        "oneclaw/provider/deepseek/api-key-1",
        "sk-macos-round-trip",
      );
    } finally {
      await context.cleanup();
    }
  });

  it("auto-detects Linux secret service backend and supports round-trip", async () => {
    const context = await createTempSecretContext();

    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: context.paths,
        commandRunner: createLinuxSecretToolRunner(),
      });

      assert.equal(store.getBackendKind(), "linux-secret-service");
      await assertSecretRoundTrip(
        store,
        "oneclaw/channel/feishu/app-secret",
        "linux-secret-round-trip",
      );
    } finally {
      await context.cleanup();
    }
  });

  it("falls back to encrypted-file backend and encrypts stored values", async () => {
    const context = await createTempSecretContext();

    try {
      const fallbackRunner: CommandRunner = async (
        command: string,
        args: readonly string[],
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        if (command === "security" && args[0] === "list-keychains") {
          return { stdout: "", stderr: "security unavailable", exitCode: 1 };
        }

        throw new Error(`Unexpected command: ${command}`);
      };

      const secretValue = "fallback-encrypted-value";
      const store = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: context.paths,
        commandRunner: fallbackRunner,
        machineId: "test-machine",
        password: "test-password",
      });

      assert.equal(store.getBackendKind(), "encrypted-file");
      await assertSecretRoundTrip(
        store,
        "oneclaw/service/search/api-key",
        secretValue,
      );

      await store.set("oneclaw/service/search/api-key", secretValue);
      const rawFile = await readFile(context.paths.secretsFilePath, "utf8");
      assert.equal(rawFile.includes(secretValue), false);
    } finally {
      await context.cleanup();
    }
  });
});
