import assert from "node:assert/strict";
import { join } from "node:path";

import { describe, it } from "vitest";

import {
  resolveOneclawConfigPaths,
  ONECLAW_CONFIG_FILE_NAME,
  ONECLAW_CONFIG_DIR_NAME,
  ONECLAW_BACKUPS_DIR_NAME,
  ONECLAW_DATA_DIR_NAME,
  ONECLAW_SECRETS_FILE_NAME,
  ONECLAW_CONFIG_PATH_ENV,
} from "../paths.js";

describe("cross-platform config path resolution", () => {
  describe("macOS (darwin)", () => {
    it("resolves config to ~/Library/Application Support/oneclaw/config.json", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "darwin",
        homeDirectory: "/Users/alice",
        env: {},
      });

      assert.equal(
        paths.configFilePath,
        join("/Users/alice", "Library", "Application Support", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
      assert.equal(
        paths.configDir,
        join("/Users/alice", "Library", "Application Support", ONECLAW_CONFIG_DIR_NAME),
      );
    });

    it("resolves backups/data/secrets under configDir", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "darwin",
        homeDirectory: "/Users/alice",
        env: {},
      });

      const expectedDir = join("/Users/alice", "Library", "Application Support", ONECLAW_CONFIG_DIR_NAME);
      assert.equal(paths.backupsDir, join(expectedDir, ONECLAW_BACKUPS_DIR_NAME));
      assert.equal(paths.dataDir, join(expectedDir, ONECLAW_DATA_DIR_NAME));
      assert.equal(paths.secretsFilePath, join(expectedDir, ONECLAW_SECRETS_FILE_NAME));
    });
  });

  describe("Windows (win32)", () => {
    it("resolves config to %APPDATA%/oneclaw/config.json when APPDATA is set", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        env: { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" },
      });

      assert.equal(
        paths.configFilePath,
        join("C:\\Users\\alice\\AppData\\Roaming", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
    });

    it("falls back to ~/AppData/Roaming when APPDATA is not set", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        env: {},
      });

      assert.equal(
        paths.configFilePath,
        join("C:\\Users\\alice", "AppData", "Roaming", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
    });

    it("falls back to ~/AppData/Roaming when APPDATA is empty string", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        env: { APPDATA: "" },
      });

      assert.equal(
        paths.configFilePath,
        join("C:\\Users\\alice", "AppData", "Roaming", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
    });

    it("falls back to ~/AppData/Roaming when APPDATA is whitespace-only", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        env: { APPDATA: "   " },
      });

      assert.equal(
        paths.configFilePath,
        join("C:\\Users\\alice", "AppData", "Roaming", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
    });

    it("resolves all sub-paths under APPDATA-based configDir", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        env: { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" },
      });

      const expectedDir = join("C:\\Users\\alice\\AppData\\Roaming", ONECLAW_CONFIG_DIR_NAME);
      assert.equal(paths.backupsDir, join(expectedDir, ONECLAW_BACKUPS_DIR_NAME));
      assert.equal(paths.dataDir, join(expectedDir, ONECLAW_DATA_DIR_NAME));
      assert.equal(paths.secretsFilePath, join(expectedDir, ONECLAW_SECRETS_FILE_NAME));
    });
  });

  describe("Linux", () => {
    it("resolves config to ~/.config/oneclaw/config.json", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "linux",
        homeDirectory: "/home/alice",
        env: {},
      });

      assert.equal(
        paths.configFilePath,
        join("/home/alice", ".config", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
      assert.equal(
        paths.configDir,
        join("/home/alice", ".config", ONECLAW_CONFIG_DIR_NAME),
      );
    });

    it("resolves backups/data/secrets under configDir", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "linux",
        homeDirectory: "/home/alice",
        env: {},
      });

      const expectedDir = join("/home/alice", ".config", ONECLAW_CONFIG_DIR_NAME);
      assert.equal(paths.backupsDir, join(expectedDir, ONECLAW_BACKUPS_DIR_NAME));
      assert.equal(paths.dataDir, join(expectedDir, ONECLAW_DATA_DIR_NAME));
      assert.equal(paths.secretsFilePath, join(expectedDir, ONECLAW_SECRETS_FILE_NAME));
    });
  });

  describe("ONECLAW_CONFIG_PATH override", () => {
    it("uses override path as config file when it has .json extension", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "darwin",
        homeDirectory: "/Users/alice",
        env: { [ONECLAW_CONFIG_PATH_ENV]: "/custom/path/my-config.json" },
      });

      assert.equal(paths.configFilePath, "/custom/path/my-config.json");
      assert.equal(paths.configDir, "/custom/path");
    });

    it("appends config.json when override path has no .json extension", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "darwin",
        homeDirectory: "/Users/alice",
        env: { [ONECLAW_CONFIG_PATH_ENV]: "/custom/dir" },
      });

      assert.equal(paths.configFilePath, join("/custom/dir", ONECLAW_CONFIG_FILE_NAME));
      assert.equal(paths.configDir, "/custom/dir");
    });

    it("override takes precedence over platform default on Windows", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "win32",
        homeDirectory: "C:\\Users\\alice",
        env: {
          APPDATA: "C:\\Users\\alice\\AppData\\Roaming",
          [ONECLAW_CONFIG_PATH_ENV]: "/override/dir",
        },
      });

      assert.equal(paths.configFilePath, join("/override/dir", ONECLAW_CONFIG_FILE_NAME));
    });

    it("ignores empty ONECLAW_CONFIG_PATH and falls back to platform default", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "linux",
        homeDirectory: "/home/alice",
        env: { [ONECLAW_CONFIG_PATH_ENV]: "" },
      });

      assert.equal(
        paths.configFilePath,
        join("/home/alice", ".config", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
    });

    it("ignores whitespace-only ONECLAW_CONFIG_PATH", () => {
      const paths = resolveOneclawConfigPaths({
        platform: "linux",
        homeDirectory: "/home/alice",
        env: { [ONECLAW_CONFIG_PATH_ENV]: "   " },
      });

      assert.equal(
        paths.configFilePath,
        join("/home/alice", ".config", ONECLAW_CONFIG_DIR_NAME, ONECLAW_CONFIG_FILE_NAME),
      );
    });
  });

  describe("path consistency guarantees", () => {
    it("secretsFilePath is always inside configDir", () => {
      for (const platform of ["darwin", "win32", "linux"] as const) {
        const paths = resolveOneclawConfigPaths({
          platform,
          homeDirectory: platform === "win32" ? "C:\\Users\\alice" : "/home/alice",
          env: platform === "win32" ? { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" } : {},
        });

        assert.ok(
          paths.secretsFilePath.startsWith(paths.configDir),
          `secrets.enc must be inside configDir on ${platform}`,
        );
      }
    });

    it("backupsDir and dataDir are always inside configDir", () => {
      for (const platform of ["darwin", "win32", "linux"] as const) {
        const paths = resolveOneclawConfigPaths({
          platform,
          homeDirectory: platform === "win32" ? "C:\\Users\\alice" : "/home/alice",
          env: platform === "win32" ? { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" } : {},
        });

        assert.ok(
          paths.backupsDir.startsWith(paths.configDir),
          `backupsDir must be inside configDir on ${platform}`,
        );
        assert.ok(
          paths.dataDir.startsWith(paths.configDir),
          `dataDir must be inside configDir on ${platform}`,
        );
      }
    });

    it("configFilePath is always inside configDir", () => {
      for (const platform of ["darwin", "win32", "linux"] as const) {
        const paths = resolveOneclawConfigPaths({
          platform,
          homeDirectory: platform === "win32" ? "C:\\Users\\alice" : "/home/alice",
          env: platform === "win32" ? { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" } : {},
        });

        assert.ok(
          paths.configFilePath.startsWith(paths.configDir),
          `configFilePath must be inside configDir on ${platform}`,
        );
      }
    });

    it("all three platforms produce different default config directories", () => {
      const darwinPaths = resolveOneclawConfigPaths({
        platform: "darwin",
        homeDirectory: "/home/user",
        env: {},
      });
      const linuxPaths = resolveOneclawConfigPaths({
        platform: "linux",
        homeDirectory: "/home/user",
        env: {},
      });
      const win32Paths = resolveOneclawConfigPaths({
        platform: "win32",
        homeDirectory: "/home/user",
        env: {},
      });

      const dirs = new Set([darwinPaths.configDir, linuxPaths.configDir, win32Paths.configDir]);
      assert.equal(dirs.size, 3, "each platform must resolve to a unique configDir");
    });
  });
});
