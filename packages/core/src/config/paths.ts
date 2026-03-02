import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

export const ONECLAW_CONFIG_PATH_ENV = "ONECLAW_CONFIG_PATH";
export const ONECLAW_CONFIG_FILE_NAME = "config.json";
export const ONECLAW_CONFIG_DIR_NAME = "oneclaw";
export const ONECLAW_BACKUPS_DIR_NAME = "backups";
export const ONECLAW_DATA_DIR_NAME = "data";
export const ONECLAW_SECRETS_FILE_NAME = "secrets.enc";

export interface ConfigPathResolverOptions {
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
}

export interface OneclawConfigPaths {
  configDir: string;
  configFilePath: string;
  backupsDir: string;
  dataDir: string;
  secretsFilePath: string;
}

export const resolveOneclawConfigPaths = (
  options: ConfigPathResolverOptions = {},
): OneclawConfigPaths => {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? homedir();
  const overridePath = env[ONECLAW_CONFIG_PATH_ENV];

  const configFilePath = resolveConfigFilePath({
    env,
    homeDirectory,
    overridePath,
    platform,
  });
  const configDir = dirname(configFilePath);

  return {
    configDir,
    configFilePath,
    backupsDir: join(configDir, ONECLAW_BACKUPS_DIR_NAME),
    dataDir: join(configDir, ONECLAW_DATA_DIR_NAME),
    secretsFilePath: join(configDir, ONECLAW_SECRETS_FILE_NAME),
  };
};

interface ResolveConfigFilePathOptions {
  env: NodeJS.ProcessEnv;
  homeDirectory: string;
  overridePath: string | undefined;
  platform: NodeJS.Platform;
}

const resolveConfigFilePath = (
  options: ResolveConfigFilePathOptions,
): string => {
  if (isNonEmptyString(options.overridePath)) {
    const trimmedPath = options.overridePath.trim();
    const candidatePath = resolve(trimmedPath);

    if (extname(candidatePath).toLowerCase() === ".json") {
      return candidatePath;
    }

    return join(candidatePath, ONECLAW_CONFIG_FILE_NAME);
  }

  return join(
    resolveDefaultConfigDir(options.platform, options.homeDirectory, options.env),
    ONECLAW_CONFIG_FILE_NAME,
  );
};

const resolveDefaultConfigDir = (
  platform: NodeJS.Platform,
  homeDirectory: string,
  env: NodeJS.ProcessEnv,
): string => {
  if (platform === "darwin") {
    return join(
      homeDirectory,
      "Library",
      "Application Support",
      ONECLAW_CONFIG_DIR_NAME,
    );
  }

  if (platform === "win32") {
    const appData = env.APPDATA;
    const windowsRoot =
      isNonEmptyString(appData) && appData.trim().length > 0
        ? appData
        : join(homeDirectory, "AppData", "Roaming");
    return join(windowsRoot, ONECLAW_CONFIG_DIR_NAME);
  }

  return join(homeDirectory, ".config", ONECLAW_CONFIG_DIR_NAME);
};

const isNonEmptyString = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;
