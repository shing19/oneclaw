import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { FSWatcher } from "node:fs";
import { watch as watchFs } from "node:fs";
import { basename } from "node:path";

import type {
  ConfigPathResolverOptions,
  OneclawConfigPaths,
} from "./paths.js";
import { resolveOneclawConfigPaths } from "./paths.js";
import type { OneclawConfig, ValidationLocale } from "./validator.js";
import { ConfigValidationError, assertValidConfig } from "./validator.js";

export const DEFAULT_CONFIG_WATCH_DEBOUNCE_MS = 500;

export type ConfigManagerErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_READ_FAILED"
  | "CONFIG_PARSE_FAILED"
  | "CONFIG_WRITE_FAILED"
  | "CONFIG_WATCH_FAILED";

export interface ConfigManagerOptions {
  locale?: ValidationLocale;
  pathResolverOptions?: ConfigPathResolverOptions;
  paths?: OneclawConfigPaths;
  watchDebounceMs?: number;
}

export interface ConfigWatchOptions {
  debounceMs?: number;
  persistent?: boolean;
}

export interface ConfigChangedEvent {
  type: "changed";
  config: OneclawConfig;
  configFilePath: string;
}

export interface ConfigErrorEvent {
  type: "error";
  error: Error;
  configFilePath: string;
}

export type ConfigWatchEvent = ConfigChangedEvent | ConfigErrorEvent;

type MaybePromise<T> = T | Promise<T>;

export type ConfigWatchListener = (
  event: ConfigWatchEvent,
) => MaybePromise<void>;

export interface ConfigWatchHandle {
  close(): void;
  dispose(): void;
}

export class ConfigManagerError extends Error {
  readonly code: ConfigManagerErrorCode;
  override readonly cause: unknown;

  constructor(
    code: ConfigManagerErrorCode,
    locale: ValidationLocale,
    cause: unknown,
  ) {
    super(messageForErrorCode(code, locale));
    this.name = "ConfigManagerError";
    this.code = code;
    this.cause = cause;
  }
}

export class ConfigManager {
  private readonly locale: ValidationLocale;
  private readonly paths: OneclawConfigPaths;
  private readonly watchDebounceMs: number;

  constructor(options: ConfigManagerOptions = {}) {
    this.locale = options.locale ?? "zh-CN";
    this.paths =
      options.paths ??
      resolveOneclawConfigPaths(options.pathResolverOptions ?? {});
    this.watchDebounceMs =
      options.watchDebounceMs ?? DEFAULT_CONFIG_WATCH_DEBOUNCE_MS;
  }

  getPaths(): OneclawConfigPaths {
    return this.paths;
  }

  async load(): Promise<OneclawConfig> {
    let content: string;
    try {
      content = await readFile(this.paths.configFilePath, "utf8");
    } catch (error: unknown) {
      if (hasErrorCode(error, "ENOENT")) {
        throw new ConfigManagerError("CONFIG_NOT_FOUND", this.locale, error);
      }
      throw new ConfigManagerError("CONFIG_READ_FAILED", this.locale, error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch (error: unknown) {
      throw new ConfigManagerError("CONFIG_PARSE_FAILED", this.locale, error);
    }

    return assertValidConfig(parsed, { locale: this.locale });
  }

  async save(input: unknown): Promise<OneclawConfig> {
    const config = assertValidConfig(input, { locale: this.locale });
    const serialized = `${JSON.stringify(config, null, 2)}\n`;

    await this.ensureConfigDir();
    await this.writeAtomically(serialized);

    return config;
  }

  async watch(
    listener: ConfigWatchListener,
    options: ConfigWatchOptions = {},
  ): Promise<ConfigWatchHandle> {
    await this.ensureConfigDir();

    const effectiveDebounceMs = normalizeDebounceMs(
      options.debounceMs ?? this.watchDebounceMs,
    );
    const configFileName = basename(this.paths.configFilePath);
    const persistent = options.persistent ?? false;

    let timer: NodeJS.Timeout | undefined;
    let watcher: FSWatcher;

    const emitEvent = (event: ConfigWatchEvent): void => {
      void Promise.resolve(listener(event)).catch(() => undefined);
    };

    const flush = (): void => {
      timer = undefined;

      void this.load()
        .then((config) => {
          emitEvent({
            type: "changed",
            config,
            configFilePath: this.paths.configFilePath,
          });
        })
        .catch((error: unknown) => {
          emitEvent({
            type: "error",
            error: toError(error),
            configFilePath: this.paths.configFilePath,
          });
        });
    };

    const scheduleFlush = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, effectiveDebounceMs);
    };

    try {
      watcher = watchFs(
        this.paths.configDir,
        { persistent },
        (_eventType, filename) => {
          if (!matchesConfigFile(filename, configFileName)) {
            return;
          }
          scheduleFlush();
        },
      );
    } catch (error: unknown) {
      throw new ConfigManagerError("CONFIG_WATCH_FAILED", this.locale, error);
    }

    watcher.on("error", (error: Error) => {
      emitEvent({
        type: "error",
        error,
        configFilePath: this.paths.configFilePath,
      });
    });

    return {
      close: () => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        watcher.close();
      },
      dispose: () => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        watcher.close();
      },
    };
  }

  private async ensureConfigDir(): Promise<void> {
    await mkdir(this.paths.configDir, { recursive: true });
  }

  private async writeAtomically(content: string): Promise<void> {
    const tempPath = `${this.paths.configFilePath}.tmp-${process.pid}-${Date.now()}`;

    try {
      await mkdir(this.paths.configDir, { recursive: true });
      await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
      await rename(tempPath, this.paths.configFilePath);
    } catch (error: unknown) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      if (error instanceof ConfigValidationError) {
        throw error;
      }
      throw new ConfigManagerError("CONFIG_WRITE_FAILED", this.locale, error);
    }
  }
}

function normalizeDebounceMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_CONFIG_WATCH_DEBOUNCE_MS;
  }
  return Math.floor(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    (error as { code: string }).code === code
  );
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function matchesConfigFile(
  filename: string | Buffer | null,
  configFileName: string,
): boolean {
  if (filename === null) {
    return true;
  }

  const value = Buffer.isBuffer(filename) ? filename.toString("utf8") : filename;
  if (value.length === 0) {
    return true;
  }

  return value === configFileName;
}

function messageForErrorCode(
  code: ConfigManagerErrorCode,
  locale: ValidationLocale,
): string {
  switch (code) {
    case "CONFIG_NOT_FOUND":
      return text(
        locale,
        "Config file does not exist.",
        "配置文件不存在。",
      );
    case "CONFIG_READ_FAILED":
      return text(
        locale,
        "Failed to read config file.",
        "读取配置文件失败。",
      );
    case "CONFIG_PARSE_FAILED":
      return text(
        locale,
        "Config file JSON is invalid.",
        "配置文件 JSON 格式不合法。",
      );
    case "CONFIG_WRITE_FAILED":
      return text(
        locale,
        "Failed to write config file.",
        "写入配置文件失败。",
      );
    case "CONFIG_WATCH_FAILED":
      return text(
        locale,
        "Failed to watch config file changes.",
        "监听配置文件变更失败。",
      );
    default:
      return text(locale, "Unknown config manager error.", "未知配置管理错误。");
  }
}

function text(locale: ValidationLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}
