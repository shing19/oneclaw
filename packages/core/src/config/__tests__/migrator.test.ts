import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  ConfigMigrator,
  ConfigMigratorError,
  migrateConfig,
} from "../migrator.js";
import { createValidConfig } from "./fixtures.js";

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

describe("config migrator", () => {
  it("returns unchanged result when version already matches target", () => {
    const source = createValidConfig(1);
    const migrator = new ConfigMigrator({ locale: "en" });

    const result = migrator.migrate(source);

    assert.equal(result.changed, false);
    assert.equal(result.fromVersion, 1);
    assert.equal(result.toVersion, 1);
    assert.deepEqual(result.appliedMigrations, []);
  });

  it("applies migration steps in order", () => {
    const source = createValidConfig(1);

    const result = migrateConfig(source, {
      locale: "en",
      targetVersion: 2,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (config): Record<string, unknown> => {
            const quotas = asRecord(config["quotas"]);
            return {
              ...config,
              quotas: {
                ...quotas,
                dailyLimit: 123,
              },
            };
          },
        },
      ],
    });

    assert.equal(result.changed, true);
    assert.equal(result.fromVersion, 1);
    assert.equal(result.toVersion, 2);
    assert.deepEqual(result.appliedMigrations, ["1->2"]);
    assert.equal(result.config.version, 2);
    assert.equal(result.config.quotas.dailyLimit, 123);
  });

  it("throws MIGRATION_PATH_NOT_FOUND when step is missing", () => {
    const source = createValidConfig(1);
    const migrator = new ConfigMigrator({
      locale: "en",
      targetVersion: 2,
      migrations: [],
    });

    assert.throws(
      () => {
        migrator.migrate(source);
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof ConfigMigratorError);
        assert.ok(hasErrorCode(error, "MIGRATION_PATH_NOT_FOUND"));
        return true;
      },
    );
  });

  it("throws MIGRATION_VALIDATION_FAILED for invalid migrated output", () => {
    const source = createValidConfig(1);

    const migrator = new ConfigMigrator({
      locale: "en",
      targetVersion: 2,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (config): Record<string, unknown> => ({
            ...config,
            general: {
              language: "zh-CN",
              theme: "system",
            },
          }),
        },
      ],
    });

    assert.throws(
      () => {
        migrator.migrate(source);
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof ConfigMigratorError);
        assert.ok(hasErrorCode(error, "MIGRATION_VALIDATION_FAILED"));
        return true;
      },
    );
  });
});
