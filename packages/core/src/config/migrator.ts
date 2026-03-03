import type { OneclawConfig, ValidationLocale } from "./validator.js";
import { ConfigValidationError, assertValidConfig } from "./validator.js";

export const CURRENT_CONFIG_SCHEMA_VERSION = 1;

export type ConfigMigratorErrorCode =
  | "INVALID_CONFIG_OBJECT"
  | "INVALID_VERSION"
  | "UNSUPPORTED_VERSION"
  | "MIGRATION_PATH_NOT_FOUND"
  | "MIGRATION_REGISTRY_INVALID"
  | "MIGRATION_EXECUTION_FAILED"
  | "MIGRATION_VALIDATION_FAILED";

export interface ConfigMigrationStep {
  fromVersion: number;
  toVersion: number;
  migrate(config: Readonly<Record<string, unknown>>): Record<string, unknown>;
}

export interface ConfigMigratorOptions {
  locale?: ValidationLocale;
  targetVersion?: number;
  migrations?: readonly ConfigMigrationStep[];
}

export interface ConfigMigrationResult {
  config: OneclawConfig;
  fromVersion: number;
  toVersion: number;
  changed: boolean;
  appliedMigrations: string[];
}

export type MigrateConfigOptions = ConfigMigratorOptions;

export class ConfigMigratorError extends Error {
  readonly code: ConfigMigratorErrorCode;
  override readonly cause: unknown;

  constructor(
    code: ConfigMigratorErrorCode,
    locale: ValidationLocale,
    cause?: unknown,
  ) {
    super(messageForErrorCode(code, locale));
    this.name = "ConfigMigratorError";
    this.code = code;
    this.cause = cause;
  }
}

const DEFAULT_LOCALE: ValidationLocale = "zh-CN";
const DEFAULT_CONFIG_MIGRATIONS: readonly ConfigMigrationStep[] = [];

export class ConfigMigrator {
  private readonly locale: ValidationLocale;
  private readonly targetVersion: number;
  private readonly migrationsByFromVersion: ReadonlyMap<number, ConfigMigrationStep>;

  constructor(options: ConfigMigratorOptions = {}) {
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.targetVersion = normalizeVersionNumber(
      options.targetVersion ?? CURRENT_CONFIG_SCHEMA_VERSION,
      this.locale,
    );
    this.migrationsByFromVersion = buildMigrationRegistry(
      options.migrations ?? DEFAULT_CONFIG_MIGRATIONS,
      this.locale,
    );
  }

  getTargetVersion(): number {
    return this.targetVersion;
  }

  migrate(input: unknown): ConfigMigrationResult {
    const sourceObject = expectConfigObject(input, this.locale);
    const fromVersion = readVersion(sourceObject, this.locale);

    if (fromVersion > this.targetVersion) {
      throw new ConfigMigratorError(
        "UNSUPPORTED_VERSION",
        this.locale,
        new Error(
          `Config version ${fromVersion} is newer than supported target ${this.targetVersion}.`,
        ),
      );
    }

    if (fromVersion === this.targetVersion) {
      return {
        config: validateMigratedConfig(sourceObject, this.locale),
        fromVersion,
        toVersion: this.targetVersion,
        changed: false,
        appliedMigrations: [],
      };
    }

    let workingConfig = cloneObject(sourceObject);
    let currentVersion = fromVersion;
    const appliedMigrations: string[] = [];

    while (currentVersion < this.targetVersion) {
      const migration = this.migrationsByFromVersion.get(currentVersion);
      if (migration === undefined) {
        throw new ConfigMigratorError(
          "MIGRATION_PATH_NOT_FOUND",
          this.locale,
          new Error(
            `No migration step registered for version ${currentVersion}.`,
          ),
        );
      }

      if (migration.toVersion <= currentVersion) {
        throw new ConfigMigratorError(
          "MIGRATION_REGISTRY_INVALID",
          this.locale,
          new Error(
            `Migration step ${toMigrationKey(migration.fromVersion, migration.toVersion)} does not advance schema version.`,
          ),
        );
      }

      if (migration.toVersion > this.targetVersion) {
        throw new ConfigMigratorError(
          "MIGRATION_PATH_NOT_FOUND",
          this.locale,
          new Error(
            `Migration step ${toMigrationKey(migration.fromVersion, migration.toVersion)} overshoots target version ${this.targetVersion}.`,
          ),
        );
      }

      try {
        const migrated = migration.migrate(cloneObject(workingConfig));
        if (!isRecord(migrated)) {
          throw new Error("Migration function must return an object.");
        }
        workingConfig = {
          ...migrated,
          version: migration.toVersion,
        };
      } catch (error: unknown) {
        throw new ConfigMigratorError(
          "MIGRATION_EXECUTION_FAILED",
          this.locale,
          error,
        );
      }

      appliedMigrations.push(
        toMigrationKey(migration.fromVersion, migration.toVersion),
      );
      currentVersion = migration.toVersion;
    }

    return {
      config: validateMigratedConfig(workingConfig, this.locale),
      fromVersion,
      toVersion: this.targetVersion,
      changed: true,
      appliedMigrations,
    };
  }
}

export function migrateConfig(
  input: unknown,
  options: MigrateConfigOptions = {},
): ConfigMigrationResult {
  const migrator = new ConfigMigrator(options);
  return migrator.migrate(input);
}

export function toMigrationKey(fromVersion: number, toVersion: number): string {
  return `${fromVersion}->${toVersion}`;
}

function validateMigratedConfig(
  value: Record<string, unknown>,
  locale: ValidationLocale,
): OneclawConfig {
  try {
    return assertValidConfig(value, { locale });
  } catch (error: unknown) {
    if (error instanceof ConfigValidationError) {
      throw new ConfigMigratorError("MIGRATION_VALIDATION_FAILED", locale, error);
    }
    throw new ConfigMigratorError("MIGRATION_EXECUTION_FAILED", locale, error);
  }
}

function buildMigrationRegistry(
  migrations: readonly ConfigMigrationStep[],
  locale: ValidationLocale,
): ReadonlyMap<number, ConfigMigrationStep> {
  const map = new Map<number, ConfigMigrationStep>();

  for (const migration of migrations) {
    const fromVersion = normalizeVersionNumber(migration.fromVersion, locale);
    const toVersion = normalizeVersionNumber(migration.toVersion, locale);

    if (toVersion <= fromVersion) {
      throw new ConfigMigratorError(
        "MIGRATION_REGISTRY_INVALID",
        locale,
        new Error(
          `Migration step ${toMigrationKey(fromVersion, toVersion)} must advance the schema version.`,
        ),
      );
    }

    if (map.has(fromVersion)) {
      throw new ConfigMigratorError(
        "MIGRATION_REGISTRY_INVALID",
        locale,
        new Error(
          `Duplicate migration steps found for version ${fromVersion}.`,
        ),
      );
    }

    map.set(fromVersion, {
      fromVersion,
      toVersion,
      migrate: (config) => migration.migrate(config),
    });
  }

  return map;
}

function normalizeVersionNumber(value: number, locale: ValidationLocale): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ConfigMigratorError(
      "INVALID_VERSION",
      locale,
      new Error(`Invalid schema version value: ${String(value)}.`),
    );
  }

  return value;
}

function readVersion(
  value: Record<string, unknown>,
  locale: ValidationLocale,
): number {
  const rawVersion = value["version"];
  if (typeof rawVersion !== "number") {
    throw new ConfigMigratorError(
      "INVALID_VERSION",
      locale,
      new Error('Config version field "version" must be a number.'),
    );
  }

  return normalizeVersionNumber(rawVersion, locale);
}

function expectConfigObject(
  value: unknown,
  locale: ValidationLocale,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ConfigMigratorError(
      "INVALID_CONFIG_OBJECT",
      locale,
      new Error("Config value must be an object."),
    );
  }

  return cloneObject(value);
}

function cloneObject(value: Record<string, unknown>): Record<string, unknown> {
  const cloned = structuredClone(value) as unknown;
  if (!isRecord(cloned)) {
    return { ...value };
  }
  return cloned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageForErrorCode(
  code: ConfigMigratorErrorCode,
  locale: ValidationLocale,
): string {
  switch (code) {
    case "INVALID_CONFIG_OBJECT":
      return text(
        locale,
        "Config migration expects an object input.",
        "配置迁移仅支持对象类型输入。",
      );
    case "INVALID_VERSION":
      return text(locale, "Config version is invalid.", "配置版本号不合法。");
    case "UNSUPPORTED_VERSION":
      return text(
        locale,
        "Config version is newer than this runtime supports.",
        "配置版本高于当前运行时支持范围。",
      );
    case "MIGRATION_PATH_NOT_FOUND":
      return text(
        locale,
        "No valid migration path was found for this config version.",
        "未找到该配置版本可用的迁移路径。",
      );
    case "MIGRATION_REGISTRY_INVALID":
      return text(
        locale,
        "Migration registry is invalid.",
        "迁移注册表配置不合法。",
      );
    case "MIGRATION_EXECUTION_FAILED":
      return text(locale, "Config migration failed.", "配置迁移执行失败。");
    case "MIGRATION_VALIDATION_FAILED":
      return text(
        locale,
        "Migrated config failed schema validation.",
        "迁移后的配置未通过 Schema 校验。",
      );
    default:
      return text(locale, "Unknown migration error.", "未知配置迁移错误。");
  }
}

function text(locale: ValidationLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}
