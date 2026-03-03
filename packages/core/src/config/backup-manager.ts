import type { Dirent } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import type {
  ConfigPathResolverOptions,
  OneclawConfigPaths,
} from "./paths.js";
import { resolveOneclawConfigPaths } from "./paths.js";
import type { ValidationLocale } from "./validator.js";

export const DEFAULT_CONFIG_BACKUP_LIMIT = 20;

const BACKUP_FILE_PREFIX = "config-";
const BACKUP_FILE_EXTENSION = ".json";
const BACKUP_FILE_PATTERN = /^config-(\d{8}T\d{9}Z)\.json$/;

export type BackupManagerErrorCode =
  | "BACKUP_DIR_CREATE_FAILED"
  | "BACKUP_CREATE_FAILED"
  | "BACKUP_LIST_FAILED"
  | "BACKUP_PRUNE_FAILED"
  | "BACKUP_NOT_FOUND"
  | "BACKUP_RESTORE_FAILED";

export interface BackupManagerOptions {
  locale?: ValidationLocale;
  pathResolverOptions?: ConfigPathResolverOptions;
  paths?: OneclawConfigPaths;
  maxBackups?: number;
}

export interface ConfigBackup {
  fileName: string;
  filePath: string;
  createdAt: Date;
}

export class BackupManagerError extends Error {
  readonly code: BackupManagerErrorCode;
  override readonly cause: unknown;

  constructor(
    code: BackupManagerErrorCode,
    locale: ValidationLocale,
    cause: unknown,
  ) {
    super(messageForErrorCode(code, locale));
    this.name = "BackupManagerError";
    this.code = code;
    this.cause = cause;
  }
}

export class BackupManager {
  private readonly locale: ValidationLocale;
  private readonly paths: OneclawConfigPaths;
  private readonly maxBackups: number;

  constructor(options: BackupManagerOptions = {}) {
    this.locale = options.locale ?? "zh-CN";
    this.paths =
      options.paths ??
      resolveOneclawConfigPaths(options.pathResolverOptions ?? {});
    this.maxBackups = normalizeMaxBackups(
      options.maxBackups ?? DEFAULT_CONFIG_BACKUP_LIMIT,
    );
  }

  getPaths(): OneclawConfigPaths {
    return this.paths;
  }

  getMaxBackups(): number {
    return this.maxBackups;
  }

  async backupBeforeSave(): Promise<ConfigBackup | null> {
    await this.ensureBackupsDir();

    const createdBackup = await this.createBackupFromCurrentConfig();
    await this.pruneBackups();

    return createdBackup;
  }

  async listBackups(): Promise<ConfigBackup[]> {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(this.paths.backupsDir, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch (error: unknown) {
      if (hasErrorCode(error, "ENOENT")) {
        return [];
      }
      throw new BackupManagerError("BACKUP_LIST_FAILED", this.locale, error);
    }

    const backups: ConfigBackup[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const parsedTimestamp = parseBackupTimestamp(entry.name);
      if (parsedTimestamp === null) {
        continue;
      }

      backups.push({
        fileName: entry.name,
        filePath: join(this.paths.backupsDir, entry.name),
        createdAt: parsedTimestamp,
      });
    }

    backups.sort((left, right) => {
      const timeDiff = right.createdAt.getTime() - left.createdAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return right.fileName.localeCompare(left.fileName);
    });

    return backups;
  }

  async restoreBackup(backupFileName: string): Promise<void> {
    const backups = await this.listBackups();
    const targetBackup = backups.find((backup) => backup.fileName === backupFileName);

    if (targetBackup === undefined) {
      throw new BackupManagerError(
        "BACKUP_NOT_FOUND",
        this.locale,
        new Error(`Backup "${backupFileName}" does not exist.`),
      );
    }

    await this.writeBackupToConfig(targetBackup.filePath);
  }

  private async createBackupFromCurrentConfig(): Promise<ConfigBackup | null> {
    const timestamp = formatBackupTimestamp(new Date());
    const backupFileName = `${BACKUP_FILE_PREFIX}${timestamp}${BACKUP_FILE_EXTENSION}`;
    const backupFilePath = join(this.paths.backupsDir, backupFileName);

    try {
      await copyFile(this.paths.configFilePath, backupFilePath);
    } catch (error: unknown) {
      if (hasErrorCode(error, "ENOENT")) {
        return null;
      }
      throw new BackupManagerError("BACKUP_CREATE_FAILED", this.locale, error);
    }

    return {
      fileName: backupFileName,
      filePath: backupFilePath,
      createdAt: parseBackupTimestamp(backupFileName) ?? new Date(),
    };
  }

  private async pruneBackups(): Promise<void> {
    let backups: ConfigBackup[];
    try {
      backups = await this.listBackups();
    } catch (error: unknown) {
      if (error instanceof BackupManagerError) {
        throw error;
      }
      throw new BackupManagerError("BACKUP_PRUNE_FAILED", this.locale, error);
    }

    const staleBackups = backups.slice(this.maxBackups);
    if (staleBackups.length === 0) {
      return;
    }

    for (const backup of staleBackups) {
      try {
        await rm(backup.filePath, { force: true });
      } catch (error: unknown) {
        throw new BackupManagerError("BACKUP_PRUNE_FAILED", this.locale, error);
      }
    }
  }

  private async writeBackupToConfig(backupFilePath: string): Promise<void> {
    const temporaryPath = `${this.paths.configFilePath}.tmp-restore-${process.pid}-${Date.now()}`;

    try {
      await mkdir(this.paths.configDir, { recursive: true });
      await copyFile(backupFilePath, temporaryPath);
      await rename(temporaryPath, this.paths.configFilePath);
    } catch (error: unknown) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw new BackupManagerError("BACKUP_RESTORE_FAILED", this.locale, error);
    }
  }

  private async ensureBackupsDir(): Promise<void> {
    try {
      await mkdir(this.paths.backupsDir, { recursive: true });
    } catch (error: unknown) {
      throw new BackupManagerError("BACKUP_DIR_CREATE_FAILED", this.locale, error);
    }
  }
}

function normalizeMaxBackups(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_CONFIG_BACKUP_LIMIT;
  }
  return Math.floor(value);
}

function formatBackupTimestamp(value: Date): string {
  const year = value.getUTCFullYear().toString().padStart(4, "0");
  const month = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = value.getUTCDate().toString().padStart(2, "0");
  const hour = value.getUTCHours().toString().padStart(2, "0");
  const minute = value.getUTCMinutes().toString().padStart(2, "0");
  const second = value.getUTCSeconds().toString().padStart(2, "0");
  const millisecond = value.getUTCMilliseconds().toString().padStart(3, "0");

  return `${year}${month}${day}T${hour}${minute}${second}${millisecond}Z`;
}

function parseBackupTimestamp(fileName: string): Date | null {
  const match = BACKUP_FILE_PATTERN.exec(fileName);
  if (match === null) {
    return null;
  }

  const token = match[1];
  if (token === undefined) {
    return null;
  }
  const isoLikeValue = `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}T${token.slice(9, 11)}:${token.slice(11, 13)}:${token.slice(13, 15)}.${token.slice(15, 18)}Z`;
  const parsed = new Date(isoLikeValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
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

function messageForErrorCode(
  code: BackupManagerErrorCode,
  locale: ValidationLocale,
): string {
  switch (code) {
    case "BACKUP_DIR_CREATE_FAILED":
      return text(
        locale,
        "Failed to create backup directory.",
        "创建备份目录失败。",
      );
    case "BACKUP_CREATE_FAILED":
      return text(locale, "Failed to create config backup.", "创建配置备份失败。");
    case "BACKUP_LIST_FAILED":
      return text(locale, "Failed to list config backups.", "读取配置备份列表失败。");
    case "BACKUP_PRUNE_FAILED":
      return text(locale, "Failed to prune config backups.", "清理旧配置备份失败。");
    case "BACKUP_NOT_FOUND":
      return text(locale, "Requested backup was not found.", "未找到指定的配置备份。");
    case "BACKUP_RESTORE_FAILED":
      return text(locale, "Failed to restore config backup.", "恢复配置备份失败。");
    default:
      return text(locale, "Unknown backup manager error.", "未知备份管理错误。");
  }
}

function text(locale: ValidationLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}
