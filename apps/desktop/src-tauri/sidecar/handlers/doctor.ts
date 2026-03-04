/**
 * Sidecar handler for `doctor.run`.
 *
 * Runs diagnostic checks (filesystem, config, secret store)
 * and returns a bilingual report.
 */

import { ConfigManager, validateConfig, createSecretStore } from "@oneclaw/core";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import type { SidecarContext } from "../context.js";

type DoctorCheckStatus = "pass" | "warn" | "fail";

interface IpcDoctorCheck {
  id: string;
  label: { "zh-CN": string; en: string };
  status: DoctorCheckStatus;
  message: { "zh-CN": string; en: string };
  checkedAt: string;
}

interface IpcDoctorReport {
  overall: DoctorCheckStatus;
  checks: IpcDoctorCheck[];
  timestamp: string;
}

export async function handleDoctorRun(
  ctx: SidecarContext,
): Promise<IpcDoctorReport> {
  const checks: IpcDoctorCheck[] = [];
  const configManager = ctx.getConfigManager();
  const paths = configManager.getPaths();
  const now = new Date().toISOString();

  // Check 1: Filesystem access
  checks.push(await checkFilesystem(paths, now));

  // Check 2: Config file
  checks.push(await checkConfig(paths.configFilePath, ctx, now));

  // Check 3: Secret store
  checks.push(await checkSecretStore(ctx, now));

  // Determine overall status
  const hasFailure = checks.some((c) => c.status === "fail");
  const hasWarning = checks.some((c) => c.status === "warn");
  const overall: DoctorCheckStatus = hasFailure
    ? "fail"
    : hasWarning
      ? "warn"
      : "pass";

  return { overall, checks, timestamp: now };
}

async function checkFilesystem(
  paths: { configDir: string; backupsDir: string; dataDir: string },
  checkedAt: string,
): Promise<IpcDoctorCheck> {
  const targets = [paths.configDir, paths.backupsDir, paths.dataDir];
  const failures: string[] = [];

  for (const target of targets) {
    try {
      await mkdir(target, { recursive: true });
      await access(target, fsConstants.R_OK | fsConstants.W_OK);
    } catch {
      failures.push(target);
    }
  }

  if (failures.length > 0) {
    return {
      id: "filesystem",
      label: { "zh-CN": "文件系统访问", en: "Filesystem access" },
      status: "fail",
      message: {
        "zh-CN": "部分 OneClaw 目录不可读或不可写。",
        en: "Some OneClaw directories are not readable/writable.",
      },
      checkedAt,
    };
  }

  return {
    id: "filesystem",
    label: { "zh-CN": "文件系统访问", en: "Filesystem access" },
    status: "pass",
    message: {
      "zh-CN": "配置、备份和数据目录均可访问。",
      en: "Config, backups, and data directories are accessible.",
    },
    checkedAt,
  };
}

async function checkConfig(
  configFilePath: string,
  ctx: SidecarContext,
  checkedAt: string,
): Promise<IpcDoctorCheck> {
  try {
    const raw = await readFile(configFilePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    const result = validateConfig(parsed, { locale: ctx.locale });

    if (!result.ok) {
      return {
        id: "config",
        label: { "zh-CN": "配置文件", en: "Configuration" },
        status: "fail",
        message: {
          "zh-CN": `配置校验失败，共 ${String(result.issues.length)} 个问题。`,
          en: `Config validation failed with ${String(result.issues.length)} issues.`,
        },
        checkedAt,
      };
    }

    return {
      id: "config",
      label: { "zh-CN": "配置文件", en: "Configuration" },
      status: "pass",
      message: {
        "zh-CN": "配置 Schema 校验通过。",
        en: "Config schema validation passed.",
      },
      checkedAt,
    };
  } catch (error: unknown) {
    const isNotFound =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT";

    if (isNotFound) {
      return {
        id: "config",
        label: { "zh-CN": "配置文件", en: "Configuration" },
        status: "fail",
        message: {
          "zh-CN": "配置文件不存在。",
          en: "Config file does not exist.",
        },
        checkedAt,
      };
    }

    return {
      id: "config",
      label: { "zh-CN": "配置文件", en: "Configuration" },
      status: "fail",
      message: {
        "zh-CN": "读取或解析配置文件失败。",
        en: "Failed to read or parse config file.",
      },
      checkedAt,
    };
  }
}

async function checkSecretStore(
  _ctx: SidecarContext,
  checkedAt: string,
): Promise<IpcDoctorCheck> {
  try {
    const store = await createSecretStore();
    const keys = await store.list();

    return {
      id: "secret-store",
      label: { "zh-CN": "密钥存储", en: "Secret storage" },
      status: "pass",
      message: {
        "zh-CN": `密钥后端可用，已存储 ${String(keys.length)} 个密钥。`,
        en: `Secret backend is available with ${String(keys.length)} stored keys.`,
      },
      checkedAt,
    };
  } catch {
    return {
      id: "secret-store",
      label: { "zh-CN": "密钥存储", en: "Secret storage" },
      status: "warn",
      message: {
        "zh-CN": "密钥存储后端不可用。",
        en: "Secret storage backend is unavailable.",
      },
      checkedAt,
    };
  }
}
