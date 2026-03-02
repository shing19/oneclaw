import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { describe, it } from "vitest";

import { BackupManager, BackupManagerError } from "../backup-manager.js";
import { createTempConfigContext } from "./fixtures.js";

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

describe("backup manager", () => {
  it("returns null when there is no config to back up", async () => {
    const context = await createTempConfigContext();

    try {
      const manager = new BackupManager({ paths: context.paths, locale: "en" });

      const backup = await manager.backupBeforeSave();
      const backups = await manager.listBackups();

      assert.equal(backup, null);
      assert.equal(backups.length, 0);
    } finally {
      await context.cleanup();
    }
  });

  it("creates backups and prunes stale files", async () => {
    const context = await createTempConfigContext();

    try {
      await mkdir(context.paths.configDir, { recursive: true });
      const manager = new BackupManager({
        paths: context.paths,
        locale: "en",
        maxBackups: 2,
      });

      await writeFile(context.paths.configFilePath, "{\"v\":1}\n", "utf8");
      const first = await manager.backupBeforeSave();

      await sleep(4);
      await writeFile(context.paths.configFilePath, "{\"v\":2}\n", "utf8");
      const second = await manager.backupBeforeSave();

      await sleep(4);
      await writeFile(context.paths.configFilePath, "{\"v\":3}\n", "utf8");
      const third = await manager.backupBeforeSave();

      const backups = await manager.listBackups();

      assert.ok(first !== null);
      assert.ok(second !== null);
      assert.ok(third !== null);
      assert.equal(backups.length, 2);

      if (first !== null) {
        assert.ok(backups.every((backup) => backup.fileName !== first.fileName));
      }
    } finally {
      await context.cleanup();
    }
  });

  it("restores a selected backup into config.json", async () => {
    const context = await createTempConfigContext();

    try {
      await mkdir(context.paths.configDir, { recursive: true });
      await writeFile(context.paths.configFilePath, "{\"mode\":\"old\"}\n", "utf8");

      const manager = new BackupManager({ paths: context.paths, locale: "en" });
      const created = await manager.backupBeforeSave();

      assert.ok(created !== null);
      if (created === null) {
        throw new Error("Expected backup file to be created.");
      }

      await writeFile(context.paths.configFilePath, "{\"mode\":\"new\"}\n", "utf8");
      await manager.restoreBackup(created.fileName);

      const restored = await readFile(context.paths.configFilePath, "utf8");
      assert.equal(restored, "{\"mode\":\"old\"}\n");
    } finally {
      await context.cleanup();
    }
  });

  it("throws BACKUP_NOT_FOUND for missing backup names", async () => {
    const context = await createTempConfigContext();

    try {
      const manager = new BackupManager({ paths: context.paths, locale: "en" });

      await assert.rejects(
        async () => manager.restoreBackup("config-20000101T000000000Z.json"),
        (error: unknown): boolean => {
          assert.ok(error instanceof BackupManagerError);
          assert.ok(hasErrorCode(error, "BACKUP_NOT_FOUND"));
          return true;
        },
      );
    } finally {
      await context.cleanup();
    }
  });
});
