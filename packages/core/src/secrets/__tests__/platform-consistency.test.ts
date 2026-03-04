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

async function createTempPaths(): Promise<{
  paths: OneclawConfigPaths;
  cleanup(): Promise<void>;
}> {
  const configDir = await mkdtemp(join(tmpdir(), "oneclaw-platform-test-"));
  const paths: OneclawConfigPaths = {
    configDir,
    configFilePath: join(configDir, "config.json"),
    backupsDir: join(configDir, "backups"),
    dataDir: join(configDir, "data"),
    secretsFilePath: join(configDir, "secrets.enc"),
  };
  return {
    paths,
    cleanup: () => rm(configDir, { recursive: true, force: true }),
  };
}

function unavailableRunner(): CommandRunner {
  return async (command: string) => {
    throw new Error(`Command not found: ${command}`);
  };
}

function createMacOsRunner(): CommandRunner {
  const store = new Map<string, string>();
  return async (command, args) => {
    if (command !== "security") throw new Error(`Unexpected: ${command}`);
    const action = args[0];
    if (action === "list-keychains") return { stdout: "default\n", stderr: "", exitCode: 0 };
    const ai = args.indexOf("-a");
    const account = ai >= 0 ? args[ai + 1] : undefined;
    if (typeof account !== "string") return { stdout: "", stderr: "no account", exitCode: 1 };
    if (action === "add-generic-password") {
      const wi = args.indexOf("-w");
      const v = wi >= 0 ? args[wi + 1] : undefined;
      if (typeof v !== "string") return { stdout: "", stderr: "no value", exitCode: 1 };
      store.set(account, v);
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (action === "find-generic-password") {
      const v = store.get(account);
      if (v === undefined) return { stdout: "", stderr: "The specified item could not be found", exitCode: 44 };
      return { stdout: `${v}\n`, stderr: "", exitCode: 0 };
    }
    if (action === "delete-generic-password") {
      store.delete(account);
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "unsupported", exitCode: 1 };
  };
}

function createLinuxRunner(): CommandRunner {
  const store = new Map<string, string>();
  return async (command, args, _options) => {
    if (command !== "secret-tool") throw new Error(`Unexpected: ${command}`);
    const action = args[0];
    if (action === "--help") return { stdout: "help", stderr: "", exitCode: 0 };
    const ki = args.indexOf("key");
    const key = ki >= 0 ? args[ki + 1] : undefined;
    if (typeof key !== "string") return { stdout: "", stderr: "no key", exitCode: 1 };
    if (action === "store") {
      store.set(key, _options?.stdin ?? "");
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (action === "lookup") {
      const v = store.get(key);
      if (v === undefined) return { stdout: "", stderr: "", exitCode: 1 };
      return { stdout: `${v}\n`, stderr: "", exitCode: 0 };
    }
    if (action === "clear") {
      store.delete(key);
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "unsupported", exitCode: 1 };
  };
}

describe("cross-platform secret store backend auto-detection", () => {
  it("selects macos-keychain on darwin when security command is available", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: ctx.paths,
        commandRunner: createMacOsRunner(),
      });
      assert.equal(store.getBackendKind(), "macos-keychain");
    } finally {
      await ctx.cleanup();
    }
  });

  it("selects linux-secret-service on linux when secret-tool is available", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: createLinuxRunner(),
      });
      assert.equal(store.getBackendKind(), "linux-secret-service");
    } finally {
      await ctx.cleanup();
    }
  });

  it("falls back to encrypted-file on darwin when security command fails", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        password: "test",
        machineId: "test-machine",
      });
      assert.equal(store.getBackendKind(), "encrypted-file");
    } finally {
      await ctx.cleanup();
    }
  });

  it("falls back to encrypted-file on linux when secret-tool is unavailable", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        password: "test",
        machineId: "test-machine",
      });
      assert.equal(store.getBackendKind(), "encrypted-file");
    } finally {
      await ctx.cleanup();
    }
  });

  it("defaults to encrypted-file on win32 (no native backend yet)", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "win32",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        password: "test",
        machineId: "test-machine",
      });
      assert.equal(store.getBackendKind(), "encrypted-file");
    } finally {
      await ctx.cleanup();
    }
  });

  it("respects explicit preferredBackend override", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: ctx.paths,
        commandRunner: createMacOsRunner(),
        preferredBackend: "encrypted-file",
        password: "test",
        machineId: "test-machine",
      });
      assert.equal(store.getBackendKind(), "encrypted-file");
    } finally {
      await ctx.cleanup();
    }
  });
});

describe("cross-platform secret round-trip consistency", () => {
  const testKey = "oneclaw/provider/deepseek/api-key-1";
  const testValue = "sk-test-cross-platform-value-αβγ-中文";

  async function assertRoundTrip(store: SecretStoreManager): Promise<void> {
    await store.set(testKey, testValue);
    assert.equal(await store.has(testKey), true);
    assert.equal(await store.get(testKey), testValue);

    const keys = await store.list();
    assert.ok(keys.includes(testKey));

    await store.delete(testKey);
    assert.equal(await store.has(testKey), false);
    assert.equal(await store.get(testKey), null);
  }

  it("macOS keychain round-trip preserves unicode values", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: ctx.paths,
        commandRunner: createMacOsRunner(),
      });
      await assertRoundTrip(store);
    } finally {
      await ctx.cleanup();
    }
  });

  it("Linux secret-service round-trip preserves unicode values", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: createLinuxRunner(),
      });
      await assertRoundTrip(store);
    } finally {
      await ctx.cleanup();
    }
  });

  it("Windows encrypted-file round-trip preserves unicode values", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "win32",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        password: "win-test-password",
        machineId: "DESKTOP-WIN10",
      });
      await assertRoundTrip(store);
    } finally {
      await ctx.cleanup();
    }
  });

  it("encrypted-file on all platforms stores to secretsFilePath", async () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const ctx = await createTempPaths();
      try {
        const store = await createSecretStore({
          locale: "en",
          platform,
          paths: ctx.paths,
          commandRunner: unavailableRunner(),
          preferredBackend: "encrypted-file",
          password: "test",
          machineId: "test-machine",
        });

        await store.set(testKey, testValue);

        const rawContent = await readFile(ctx.paths.secretsFilePath, "utf8");
        assert.ok(rawContent.length > 0, `secrets.enc must exist on ${platform}`);
        assert.equal(
          rawContent.includes(testValue),
          false,
          `plaintext value must not appear in secrets.enc on ${platform}`,
        );

        const payload = JSON.parse(rawContent) as Record<string, unknown>;
        assert.equal(payload["algorithm"], "aes-256-gcm");
        assert.equal(payload["version"], 1);
      } finally {
        await ctx.cleanup();
      }
    }
  });
});

describe("cross-platform audit log consistency", () => {
  it("creates audit log under dataDir on all platforms", async () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const ctx = await createTempPaths();
      try {
        const store = await createSecretStore({
          locale: "zh-CN",
          platform,
          paths: ctx.paths,
          commandRunner: unavailableRunner(),
          preferredBackend: "encrypted-file",
          password: "test",
          machineId: "test-machine",
        });

        await store.set("oneclaw/provider/test/api-key", "value");

        const auditPath = join(ctx.paths.dataDir, "secret-audit.log");
        const auditContent = await readFile(auditPath, "utf8");
        const lines = auditContent.trim().split("\n");
        assert.ok(lines.length >= 1, `audit log must have entries on ${platform}`);

        const lastLine = lines[lines.length - 1];
        assert.ok(typeof lastLine === "string", "last audit line must be a string");
        const entry = JSON.parse(lastLine) as Record<string, unknown>;
        assert.equal(entry["operation"], "set");
        assert.equal(entry["key"], "oneclaw/provider/test/api-key");
        assert.ok(typeof entry["timestamp"] === "string");
        assert.ok(typeof entry["backend"] === "string");
      } finally {
        await ctx.cleanup();
      }
    }
  });

  it("audit log never contains secret values", async () => {
    const ctx = await createTempPaths();
    const secretValue = "super-secret-api-key-12345";
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password: "test",
        machineId: "test-machine",
      });

      await store.set("oneclaw/provider/test/api-key", secretValue);
      await store.get("oneclaw/provider/test/api-key");
      await store.has("oneclaw/provider/test/api-key");
      await store.list();
      await store.delete("oneclaw/provider/test/api-key");

      const auditContent = await readFile(join(ctx.paths.dataDir, "secret-audit.log"), "utf8");
      assert.equal(
        auditContent.includes(secretValue),
        false,
        "audit log must never contain secret values",
      );
    } finally {
      await ctx.cleanup();
    }
  });
});

describe("cross-platform encrypted-file determinism", () => {
  it("same password + machineId decrypts across simulated platform switches", async () => {
    const ctx = await createTempPaths();
    const password = "shared-password";
    const machineId = "shared-machine-id";
    const testKey = "oneclaw/provider/deepseek/api-key-1";
    const testValue = "sk-portable-secret";

    try {
      const darwinStore = await createSecretStore({
        locale: "en",
        platform: "darwin",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password,
        machineId,
      });

      await darwinStore.set(testKey, testValue);

      const linuxStore = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password,
        machineId,
      });

      const retrieved = await linuxStore.get(testKey);
      assert.equal(retrieved, testValue, "encrypted file must be portable across platforms with same credentials");
    } finally {
      await ctx.cleanup();
    }
  });

  it("different machineId cannot decrypt the file", async () => {
    const ctx = await createTempPaths();
    const testKey = "oneclaw/provider/test/api-key";

    try {
      const storeA = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password: "same-password",
        machineId: "machine-A",
      });

      await storeA.set(testKey, "secret-value");

      const storeB = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password: "same-password",
        machineId: "machine-B",
      });

      await assert.rejects(
        () => storeB.get(testKey),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          return true;
        },
        "different machineId must fail to decrypt",
      );
    } finally {
      await ctx.cleanup();
    }
  });

  it("different password cannot decrypt the file", async () => {
    const ctx = await createTempPaths();
    const testKey = "oneclaw/provider/test/api-key";

    try {
      const storeA = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password: "password-A",
        machineId: "same-machine",
      });

      await storeA.set(testKey, "secret-value");

      const storeB = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password: "password-B",
        machineId: "same-machine",
      });

      await assert.rejects(
        () => storeB.get(testKey),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          return true;
        },
        "different password must fail to decrypt",
      );
    } finally {
      await ctx.cleanup();
    }
  });
});

describe("bilingual error messages", () => {
  it("zh-CN locale produces Chinese error messages", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "zh-CN",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password: "test",
        machineId: "test",
      });

      await assert.rejects(
        () => store.set("invalid-key", "value"),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(
            error.message.includes("密钥") || error.message.includes("不可用"),
            `expected Chinese error message, got: ${error.message}`,
          );
          return true;
        },
      );
    } finally {
      await ctx.cleanup();
    }
  });

  it("en locale produces English error messages", async () => {
    const ctx = await createTempPaths();
    try {
      const store = await createSecretStore({
        locale: "en",
        platform: "linux",
        paths: ctx.paths,
        commandRunner: unavailableRunner(),
        preferredBackend: "encrypted-file",
        password: "test",
        machineId: "test",
      });

      await assert.rejects(
        () => store.set("invalid-key", "value"),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(
            error.message.includes("Secret") || error.message.includes("unavailable") || error.message.includes("storage"),
            `expected English error message, got: ${error.message}`,
          );
          return true;
        },
      );
    } finally {
      await ctx.cleanup();
    }
  });
});
