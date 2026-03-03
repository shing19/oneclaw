import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { pbkdf2 as pbkdf2Callback, randomBytes } from "node:crypto";
import { createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";

import type { ConfigPathResolverOptions, OneclawConfigPaths } from "../config/paths.js";
import { resolveOneclawConfigPaths } from "../config/paths.js";
import type {
  SecretStore,
  SecretStoreError,
  SecretStoreErrorCode,
} from "../types/secret-storage.js";

const pbkdf2 = promisify(pbkdf2Callback);

const DEFAULT_LOCALE: SecretStoreLocale = "zh-CN";
const DEFAULT_SECRET_STORE_SERVICE_NAME = "oneclaw";
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const INTERNAL_INDEX_KEY = "oneclaw/internal/secret-index";
const SECRET_KEY_PATTERN = /^oneclaw\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/i;
const INTERNAL_KEY_PREFIX = "oneclaw/internal/";
const SECRET_AUDIT_FILE_NAME = "secret-audit.log";

export type SecretStoreLocale = "zh-CN" | "en";

export type SecretStoreBackendKind =
  | "macos-keychain"
  | "linux-secret-service"
  | "encrypted-file";

export type SecretStoreOperation = "get" | "set" | "delete" | "has" | "list";

export interface SecretStoreAuditEvent {
  key: string;
  operation: SecretStoreOperation;
  backend: SecretStoreBackendKind;
  timestamp: string;
}

export type SecretStoreAuditLogger = (
  event: SecretStoreAuditEvent,
) => void | Promise<void>;

export type SecretPasswordProvider = () => string | Promise<string>;

export interface SecretStoreOptions {
  locale?: SecretStoreLocale;
  paths?: OneclawConfigPaths;
  pathResolverOptions?: ConfigPathResolverOptions;
  preferredBackend?: SecretStoreBackendKind | "auto";
  password?: string;
  passwordProvider?: SecretPasswordProvider;
  machineId?: string;
  pbkdf2Iterations?: number;
  serviceName?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  commandRunner?: CommandRunner;
  auditLogger?: SecretStoreAuditLogger;
}

interface SecretStoreDriver {
  readonly kind: SecretStoreBackendKind;
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

interface SecretStoreManagerOptions {
  locale: SecretStoreLocale;
  paths: OneclawConfigPaths;
  driver: SecretStoreDriver;
  auditLogger?: SecretStoreAuditLogger;
}

interface CommandExecutionOptions {
  stdin?: string;
}

interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandExecutionOptions,
) => Promise<CommandExecutionResult>;

export class SecretStoreManagerError extends Error implements SecretStoreError {
  readonly code: SecretStoreErrorCode;
  override readonly cause: unknown;

  constructor(
    code: SecretStoreErrorCode,
    locale: SecretStoreLocale,
    cause?: unknown,
  ) {
    super(messageForSecretStoreErrorCode(code, locale));
    this.name = "SecretStoreManagerError";
    this.code = code;
    this.cause = cause;
  }
}

export class SecretStoreManager implements SecretStore {
  private readonly locale: SecretStoreLocale;
  private readonly paths: OneclawConfigPaths;
  private readonly driver: SecretStoreDriver;
  private readonly auditLogger?: SecretStoreAuditLogger;
  private readonly auditFilePath: string;

  constructor(options: SecretStoreManagerOptions) {
    this.locale = options.locale;
    this.paths = options.paths;
    this.driver = options.driver;
    this.auditLogger = options.auditLogger;
    this.auditFilePath = join(this.paths.dataDir, SECRET_AUDIT_FILE_NAME);
  }

  getBackendKind(): SecretStoreBackendKind {
    return this.driver.kind;
  }

  getPaths(): OneclawConfigPaths {
    return this.paths;
  }

  async set(key: string, value: string): Promise<void> {
    assertValidSecretKey(key, this.locale);
    assertNonEmptySecretValue(value, this.locale);

    try {
      await this.driver.set(key, value);
      await this.addToIndex(key);
      await this.writeAudit({
        key,
        operation: "set",
      });
    } catch (error: unknown) {
      throw asSecretStoreError(error, this.locale);
    }
  }

  async get(key: string): Promise<string | null> {
    assertValidSecretKey(key, this.locale);

    try {
      const value = await this.driver.get(key);
      await this.writeAudit({
        key,
        operation: "get",
      });
      return value;
    } catch (error: unknown) {
      throw asSecretStoreError(error, this.locale);
    }
  }

  async delete(key: string): Promise<void> {
    assertValidSecretKey(key, this.locale);

    try {
      await this.driver.delete(key);
      await this.removeFromIndex(key);
      await this.writeAudit({
        key,
        operation: "delete",
      });
    } catch (error: unknown) {
      throw asSecretStoreError(error, this.locale);
    }
  }

  async has(key: string): Promise<boolean> {
    assertValidSecretKey(key, this.locale);

    try {
      const value = await this.driver.get(key);
      await this.writeAudit({
        key,
        operation: "has",
      });
      return value !== null;
    } catch (error: unknown) {
      throw asSecretStoreError(error, this.locale);
    }
  }

  async list(): Promise<string[]> {
    try {
      const indexedKeys = await this.loadIndex();
      const existingKeys: string[] = [];
      let indexChanged = false;

      for (const key of indexedKeys) {
        const exists = (await this.driver.get(key)) !== null;
        if (exists) {
          existingKeys.push(key);
          continue;
        }
        indexChanged = true;
      }

      if (indexChanged) {
        await this.saveIndex(existingKeys);
      }

      await this.writeAudit({
        key: "*",
        operation: "list",
      });

      return [...existingKeys].sort((left, right) => left.localeCompare(right));
    } catch (error: unknown) {
      throw asSecretStoreError(error, this.locale);
    }
  }

  private async addToIndex(key: string): Promise<void> {
    const current = await this.loadIndex();
    if (current.includes(key)) {
      return;
    }
    current.push(key);
    await this.saveIndex(current);
  }

  private async removeFromIndex(key: string): Promise<void> {
    const current = await this.loadIndex();
    const next = current.filter((item) => item !== key);

    if (next.length === current.length) {
      return;
    }

    await this.saveIndex(next);
  }

  private async loadIndex(): Promise<string[]> {
    const raw = await this.driver.get(INTERNAL_INDEX_KEY);
    if (raw === null) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error: unknown) {
      throw new SecretStoreManagerError("DECRYPTION_FAILED", this.locale, error);
    }

    if (!Array.isArray(parsed)) {
      throw new SecretStoreManagerError(
        "DECRYPTION_FAILED",
        this.locale,
        new Error("Secret index payload must be an array."),
      );
    }

    const keys: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string" || !isValidPublicSecretKey(item)) {
        continue;
      }
      if (seen.has(item)) {
        continue;
      }
      seen.add(item);
      keys.push(item);
    }

    return keys;
  }

  private async saveIndex(keys: readonly string[]): Promise<void> {
    const unique = [...new Set(keys)];
    const serialized = JSON.stringify(unique);
    await this.driver.set(INTERNAL_INDEX_KEY, serialized);
  }

  private async writeAudit(input: {
    key: string;
    operation: SecretStoreOperation;
  }): Promise<void> {
    const event: SecretStoreAuditEvent = {
      key: input.key,
      operation: input.operation,
      backend: this.driver.kind,
      timestamp: new Date().toISOString(),
    };

    if (this.auditLogger !== undefined) {
      await Promise.resolve(this.auditLogger(event));
    }

    await mkdir(this.paths.dataDir, { recursive: true });
    await appendFile(this.auditFilePath, `${JSON.stringify(event)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

interface CliSecretDriverOptions {
  locale: SecretStoreLocale;
  runner: CommandRunner;
  serviceName: string;
}

class MacOsKeychainSecretDriver implements SecretStoreDriver {
  readonly kind: SecretStoreBackendKind = "macos-keychain";

  private readonly locale: SecretStoreLocale;
  private readonly runner: CommandRunner;
  private readonly serviceName: string;

  constructor(options: CliSecretDriverOptions) {
    this.locale = options.locale;
    this.runner = options.runner;
    this.serviceName = options.serviceName;
  }

  async set(key: string, value: string): Promise<void> {
    const result = await this.runner(
      "security",
      ["add-generic-password", "-a", key, "-s", this.serviceName, "-w", value, "-U"],
      {},
    );

    if (result.exitCode !== 0) {
      throw this.toDriverError(result);
    }
  }

  async get(key: string): Promise<string | null> {
    const result = await this.runner(
      "security",
      ["find-generic-password", "-a", key, "-s", this.serviceName, "-w"],
      {},
    );

    if (result.exitCode === 0) {
      return result.stdout.trimEnd();
    }

    if (isSecurityNotFound(result.stderr)) {
      return null;
    }

    throw this.toDriverError(result);
  }

  async delete(key: string): Promise<void> {
    const result = await this.runner(
      "security",
      ["delete-generic-password", "-a", key, "-s", this.serviceName],
      {},
    );

    if (result.exitCode === 0 || isSecurityNotFound(result.stderr)) {
      return;
    }

    throw this.toDriverError(result);
  }

  private toDriverError(result: CommandExecutionResult): SecretStoreManagerError {
    if (isPermissionDeniedMessage(result.stderr)) {
      return new SecretStoreManagerError(
        "PERMISSION_DENIED",
        this.locale,
        new Error(result.stderr),
      );
    }

    return new SecretStoreManagerError(
      "STORE_UNAVAILABLE",
      this.locale,
      new Error(result.stderr),
    );
  }
}

class LinuxSecretServiceDriver implements SecretStoreDriver {
  readonly kind: SecretStoreBackendKind = "linux-secret-service";

  private readonly locale: SecretStoreLocale;
  private readonly runner: CommandRunner;
  private readonly serviceName: string;

  constructor(options: CliSecretDriverOptions) {
    this.locale = options.locale;
    this.runner = options.runner;
    this.serviceName = options.serviceName;
  }

  async set(key: string, value: string): Promise<void> {
    const result = await this.runner(
      "secret-tool",
      [
        "store",
        "--label",
        "OneClaw Secret",
        "service",
        this.serviceName,
        "key",
        key,
      ],
      {
        stdin: value,
      },
    );

    if (result.exitCode !== 0) {
      throw this.toDriverError(result);
    }
  }

  async get(key: string): Promise<string | null> {
    const result = await this.runner(
      "secret-tool",
      ["lookup", "service", this.serviceName, "key", key],
      {},
    );

    if (result.exitCode === 0) {
      return result.stdout.trimEnd();
    }

    if (isSecretToolNotFound(result)) {
      return null;
    }

    throw this.toDriverError(result);
  }

  async delete(key: string): Promise<void> {
    const result = await this.runner(
      "secret-tool",
      ["clear", "service", this.serviceName, "key", key],
      {},
    );

    if (result.exitCode === 0 || isSecretToolNotFound(result)) {
      return;
    }

    throw this.toDriverError(result);
  }

  private toDriverError(result: CommandExecutionResult): SecretStoreManagerError {
    if (isPermissionDeniedMessage(result.stderr)) {
      return new SecretStoreManagerError(
        "PERMISSION_DENIED",
        this.locale,
        new Error(result.stderr),
      );
    }

    return new SecretStoreManagerError(
      "STORE_UNAVAILABLE",
      this.locale,
      new Error(result.stderr),
    );
  }
}

interface EncryptedSecretPayload {
  version: number;
  algorithm: "aes-256-gcm";
  pbkdf2Iterations: number;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

interface PlainSecretStoreData {
  version: number;
  secrets: Record<string, string>;
}

interface EncryptedFileSecretDriverOptions {
  locale: SecretStoreLocale;
  filePath: string;
  password?: string;
  passwordProvider?: SecretPasswordProvider;
  machineId?: string;
  pbkdf2Iterations: number;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  runner: CommandRunner;
}

class EncryptedFileSecretDriver implements SecretStoreDriver {
  readonly kind: SecretStoreBackendKind = "encrypted-file";

  private readonly locale: SecretStoreLocale;
  private readonly filePath: string;
  private readonly password?: string;
  private readonly passwordProvider?: SecretPasswordProvider;
  private readonly machineId?: string;
  private readonly pbkdf2Iterations: number;
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly runner: CommandRunner;
  private serial: Promise<unknown> = Promise.resolve();
  private credentialSeed?: Promise<string>;

  constructor(options: EncryptedFileSecretDriverOptions) {
    this.locale = options.locale;
    this.filePath = options.filePath;
    this.password = normalizeOptionalString(options.password);
    this.passwordProvider = options.passwordProvider;
    this.machineId = normalizeOptionalString(options.machineId);
    this.pbkdf2Iterations = normalizePbkdf2Iterations(
      options.pbkdf2Iterations,
      this.locale,
    );
    this.platform = options.platform;
    this.env = options.env;
    this.runner = options.runner;
  }

  async set(key: string, value: string): Promise<void> {
    await this.runSerialized(async () => {
      const current = await this.readSecrets();
      current[key] = value;
      await this.writeSecrets(current);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.runSerialized(async () => {
      const current = await this.readSecrets();
      return current[key] ?? null;
    });
  }

  async delete(key: string): Promise<void> {
    await this.runSerialized(async () => {
      const current = await this.readSecrets();
      if (!(key in current)) {
        return;
      }
      Reflect.deleteProperty(current, key);
      await this.writeSecrets(current);
    });
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.serial.then(operation, operation);
    this.serial = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  private async readSecrets(): Promise<Record<string, string>> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error: unknown) {
      if (hasErrorCode(error, "ENOENT")) {
        return {};
      }
      throw new SecretStoreManagerError("STORE_UNAVAILABLE", this.locale, error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch (error: unknown) {
      throw new SecretStoreManagerError("DECRYPTION_FAILED", this.locale, error);
    }

    const payload = parseEncryptedPayload(parsed, this.locale);
    const key = await this.deriveEncryptionKey(payload.salt, payload.pbkdf2Iterations);

    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv(
        payload.algorithm,
        key,
        Buffer.from(payload.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, "base64")),
        decipher.final(),
      ]);
    } catch (error: unknown) {
      throw new SecretStoreManagerError("DECRYPTION_FAILED", this.locale, error);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(plaintext.toString("utf8")) as unknown;
    } catch (error: unknown) {
      throw new SecretStoreManagerError("DECRYPTION_FAILED", this.locale, error);
    }

    const plain = parsePlainStoreData(decoded, this.locale);
    return { ...plain.secrets };
  }

  private async writeSecrets(secrets: Record<string, string>): Promise<void> {
    const payload = await this.encryptSecrets(secrets);
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;

    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(tempPath, serialized, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(tempPath, this.filePath);
    } catch (error: unknown) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw new SecretStoreManagerError("STORE_UNAVAILABLE", this.locale, error);
    }
  }

  private async encryptSecrets(
    secrets: Record<string, string>,
  ): Promise<EncryptedSecretPayload> {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await this.deriveEncryptionKey(
      salt.toString("base64"),
      this.pbkdf2Iterations,
    );
    const plainData: PlainSecretStoreData = {
      version: 1,
      secrets: { ...secrets },
    };
    const plainText = Buffer.from(JSON.stringify(plainData), "utf8");

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 1,
      algorithm: "aes-256-gcm",
      pbkdf2Iterations: this.pbkdf2Iterations,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
    };
  }

  private async deriveEncryptionKey(
    salt: string,
    iterations: number,
  ): Promise<Buffer> {
    const seed = await this.getCredentialSeed();
    const key = await pbkdf2(
      seed,
      Buffer.from(salt, "base64"),
      iterations,
      32,
      "sha256",
    );
    return key;
  }

  private async getCredentialSeed(): Promise<string> {
    if (this.credentialSeed !== undefined) {
      return this.credentialSeed;
    }

    this.credentialSeed = (async () => {
      const machineId = await this.resolveMachineId();
      const password = await this.resolvePassword();
      return `${machineId}:${password}`;
    })();

    return this.credentialSeed;
  }

  private async resolveMachineId(): Promise<string> {
    if (isNonEmptyString(this.machineId)) {
      return this.machineId;
    }

    if (isNonEmptyString(this.env.ONECLAW_MACHINE_ID)) {
      return this.env.ONECLAW_MACHINE_ID.trim();
    }

    return resolveMachineIdentifier({
      platform: this.platform,
      env: this.env,
      runner: this.runner,
      locale: this.locale,
    });
  }

  private async resolvePassword(): Promise<string> {
    if (isNonEmptyString(this.password)) {
      return this.password;
    }

    if (this.passwordProvider !== undefined) {
      const resolved = await Promise.resolve(this.passwordProvider());
      if (isNonEmptyString(resolved)) {
        return resolved.trim();
      }
    }

    if (isNonEmptyString(this.env.ONECLAW_SECRETS_PASSWORD)) {
      return this.env.ONECLAW_SECRETS_PASSWORD.trim();
    }

    throw new SecretStoreManagerError(
      "STORE_UNAVAILABLE",
      this.locale,
      new Error("Encrypted secret store requires a password."),
    );
  }
}

export async function createSecretStore(
  options: SecretStoreOptions = {},
): Promise<SecretStoreManager> {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const paths =
    options.paths ?? resolveOneclawConfigPaths(options.pathResolverOptions ?? {});
  const runner = options.commandRunner ?? runCommand;
  const backendPreference = options.preferredBackend ?? "auto";
  const serviceName = normalizeServiceName(options.serviceName);

  const backendKind = await resolveBackendKind({
    platform,
    preference: backendPreference,
    runner,
  });

  const driver = await createDriver({
    backendKind,
    locale,
    paths,
    platform,
    env,
    runner,
    serviceName,
    options,
  });

  return new SecretStoreManager({
    locale,
    paths,
    driver,
    auditLogger: options.auditLogger,
  });
}

interface ResolveBackendKindOptions {
  platform: NodeJS.Platform;
  preference: SecretStoreBackendKind | "auto";
  runner: CommandRunner;
}

async function resolveBackendKind(
  options: ResolveBackendKindOptions,
): Promise<SecretStoreBackendKind> {
  if (options.preference !== "auto") {
    return options.preference;
  }

  if (options.platform === "darwin") {
    const available = await probeCommand(options.runner, "security", ["list-keychains"]);
    if (available) {
      return "macos-keychain";
    }
  }

  if (options.platform === "linux") {
    const available = await probeCommand(options.runner, "secret-tool", ["--help"]);
    if (available) {
      return "linux-secret-service";
    }
  }

  return "encrypted-file";
}

interface CreateDriverOptions {
  backendKind: SecretStoreBackendKind;
  locale: SecretStoreLocale;
  paths: OneclawConfigPaths;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  runner: CommandRunner;
  serviceName: string;
  options: SecretStoreOptions;
}

function createDriver(options: CreateDriverOptions): Promise<SecretStoreDriver> {
  if (options.backendKind === "macos-keychain") {
    return Promise.resolve(new MacOsKeychainSecretDriver({
      locale: options.locale,
      runner: options.runner,
      serviceName: options.serviceName,
    }));
  }

  if (options.backendKind === "linux-secret-service") {
    return Promise.resolve(new LinuxSecretServiceDriver({
      locale: options.locale,
      runner: options.runner,
      serviceName: options.serviceName,
    }));
  }

  return Promise.resolve(new EncryptedFileSecretDriver({
    locale: options.locale,
    filePath: options.paths.secretsFilePath,
    password: options.options.password,
    passwordProvider: options.options.passwordProvider,
    machineId: options.options.machineId,
    pbkdf2Iterations:
      options.options.pbkdf2Iterations ?? DEFAULT_PBKDF2_ITERATIONS,
    platform: options.platform,
    env: options.env,
    runner: options.runner,
  }));
}

async function probeCommand(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
): Promise<boolean> {
  try {
    const result = await runner(command, args);
    return result.exitCode === 0 || command === "secret-tool";
  } catch (_error: unknown) {
    return false;
  }
}

function normalizeServiceName(value: string | undefined): string {
  const normalized = normalizeOptionalString(value);
  if (normalized === undefined) {
    return DEFAULT_SECRET_STORE_SERVICE_NAME;
  }
  return normalized;
}

function normalizePbkdf2Iterations(
  value: number,
  locale: SecretStoreLocale,
): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new SecretStoreManagerError(
      "STORE_UNAVAILABLE",
      locale,
      new Error(`PBKDF2 iterations must be a positive integer: ${String(value)}`),
    );
  }
  return value;
}

async function runCommand(
  command: string,
  args: readonly string[],
  options: CommandExecutionOptions = {},
): Promise<CommandExecutionResult> {
  return new Promise<CommandExecutionResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string): void => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string): void => {
      stderr += chunk;
    });
    child.on("error", (error: Error): void => {
      reject(error);
    });
    child.on("close", (code: number | null): void => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    if (isNonEmptyString(options.stdin)) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

interface ResolveMachineIdentifierOptions {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  runner: CommandRunner;
  locale: SecretStoreLocale;
}

async function resolveMachineIdentifier(
  options: ResolveMachineIdentifierOptions,
): Promise<string> {
  if (options.platform === "linux") {
    const linuxMachineId = await resolveLinuxMachineId();
    if (linuxMachineId !== null) {
      return linuxMachineId;
    }
  }

  if (options.platform === "darwin") {
    const macMachineId = await resolveMacMachineId(options.runner);
    if (macMachineId !== null) {
      return macMachineId;
    }
  }

  if (options.platform === "win32") {
    const windowsMachineId = await resolveWindowsMachineId(options.runner, options.env);
    if (windowsMachineId !== null) {
      return windowsMachineId;
    }
  }

  const host = hostname().trim();
  if (host.length > 0) {
    return host;
  }

  throw new SecretStoreManagerError(
    "STORE_UNAVAILABLE",
    options.locale,
    new Error("Unable to resolve a machine identifier."),
  );
}

async function resolveLinuxMachineId(): Promise<string | null> {
  const candidates = ["/etc/machine-id", "/var/lib/dbus/machine-id"];

  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, "utf8");
      const normalized = content.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    } catch (_error: unknown) {
      // Ignore and continue trying additional candidates.
    }
  }

  return null;
}

async function resolveMacMachineId(runner: CommandRunner): Promise<string | null> {
  try {
    const result = await runner("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
    if (result.exitCode !== 0) {
      return null;
    }

    const match = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(result.stdout);
    if (match === null) {
      return null;
    }
    const candidate = match[1];
    if (!isNonEmptyString(candidate)) {
      return null;
    }

    return candidate.trim();
  } catch (_error: unknown) {
    return null;
  }
}

async function resolveWindowsMachineId(
  runner: CommandRunner,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  try {
    const result = await runner("wmic", ["csproduct", "get", "uuid"]);
    if (result.exitCode === 0) {
      const lines = result.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length >= 2) {
        const candidate = lines[1];
        if (
          isNonEmptyString(candidate) &&
          !candidate.toUpperCase().startsWith("UUID")
        ) {
          return candidate.trim();
        }
      }
    }
  } catch (_error: unknown) {
    // Fall through to environment fallback.
  }

  if (isNonEmptyString(env.COMPUTERNAME)) {
    return env.COMPUTERNAME.trim();
  }

  return null;
}

function parseEncryptedPayload(
  value: unknown,
  locale: SecretStoreLocale,
): EncryptedSecretPayload {
  if (!isRecord(value)) {
    throw new SecretStoreManagerError(
      "DECRYPTION_FAILED",
      locale,
      new Error("Encrypted secrets payload must be an object."),
    );
  }

  const version = value["version"];
  const algorithm = value["algorithm"];
  const pbkdf2Iterations = value["pbkdf2Iterations"];
  const salt = value["salt"];
  const iv = value["iv"];
  const tag = value["tag"];
  const ciphertext = value["ciphertext"];

  if (
    typeof version !== "number" ||
    version !== 1 ||
    algorithm !== "aes-256-gcm" ||
    typeof pbkdf2Iterations !== "number" ||
    !Number.isInteger(pbkdf2Iterations) ||
    pbkdf2Iterations < 1 ||
    typeof salt !== "string" ||
    salt.length === 0 ||
    typeof iv !== "string" ||
    iv.length === 0 ||
    typeof tag !== "string" ||
    tag.length === 0 ||
    typeof ciphertext !== "string" ||
    ciphertext.length === 0
  ) {
    throw new SecretStoreManagerError(
      "DECRYPTION_FAILED",
      locale,
      new Error("Encrypted secrets payload is malformed."),
    );
  }

  return {
    version,
    algorithm,
    pbkdf2Iterations,
    salt,
    iv,
    tag,
    ciphertext,
  };
}

function parsePlainStoreData(
  value: unknown,
  locale: SecretStoreLocale,
): PlainSecretStoreData {
  if (!isRecord(value)) {
    throw new SecretStoreManagerError(
      "DECRYPTION_FAILED",
      locale,
      new Error("Decrypted secrets payload must be an object."),
    );
  }

  const version = value["version"];
  const secrets = value["secrets"];

  if (typeof version !== "number" || version !== 1 || !isRecord(secrets)) {
    throw new SecretStoreManagerError(
      "DECRYPTION_FAILED",
      locale,
      new Error("Decrypted secrets payload structure is invalid."),
    );
  }

  const normalizedSecrets: Record<string, string> = {};
  for (const [key, raw] of Object.entries(secrets)) {
    if (typeof raw !== "string") {
      throw new SecretStoreManagerError(
        "DECRYPTION_FAILED",
        locale,
        new Error(`Secret "${key}" is not a string.`),
      );
    }
    normalizedSecrets[key] = raw;
  }

  return {
    version,
    secrets: normalizedSecrets,
  };
}

function assertValidSecretKey(key: string, locale: SecretStoreLocale): void {
  if (!isValidPublicSecretKey(key)) {
    throw new SecretStoreManagerError(
      "STORE_UNAVAILABLE",
      locale,
      new Error(`Invalid secret key: ${key}`),
    );
  }
}

function isValidPublicSecretKey(key: string): boolean {
  return (
    SECRET_KEY_PATTERN.test(key) &&
    !key.startsWith(INTERNAL_KEY_PREFIX) &&
    key.length <= 256
  );
}

function assertNonEmptySecretValue(
  value: string,
  locale: SecretStoreLocale,
): void {
  if (!isNonEmptyString(value)) {
    throw new SecretStoreManagerError(
      "STORE_UNAVAILABLE",
      locale,
      new Error("Secret value must be a non-empty string."),
    );
  }
}

function asSecretStoreError(
  error: unknown,
  locale: SecretStoreLocale,
): SecretStoreManagerError {
  if (error instanceof SecretStoreManagerError) {
    return error;
  }

  if (hasErrorCode(error, "ENOENT")) {
    return new SecretStoreManagerError("STORE_UNAVAILABLE", locale, error);
  }

  if (hasErrorCode(error, "EACCES") || hasErrorCode(error, "EPERM")) {
    return new SecretStoreManagerError("PERMISSION_DENIED", locale, error);
  }

  return new SecretStoreManagerError("STORE_UNAVAILABLE", locale, error);
}

function isSecurityNotFound(stderr: string): boolean {
  return /could not be found|The specified item could not be found/u.test(stderr);
}

function isSecretToolNotFound(result: CommandExecutionResult): boolean {
  if (result.exitCode === 0) {
    return false;
  }

  const normalizedStderr = result.stderr.trim();
  if (normalizedStderr.length === 0) {
    return true;
  }

  return /not found|no matching items/i.test(normalizedStderr);
}

function isPermissionDeniedMessage(stderr: string): boolean {
  return /permission denied|user interaction is not allowed|not authorized/i.test(
    stderr,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function messageForSecretStoreErrorCode(
  code: SecretStoreErrorCode,
  locale: SecretStoreLocale,
): string {
  switch (code) {
    case "STORE_UNAVAILABLE":
      return text(
        locale,
        "Secret storage backend is unavailable.",
        "密钥存储后端不可用。",
      );
    case "SECRET_NOT_FOUND":
      return text(locale, "Secret key was not found.", "未找到对应的密钥。");
    case "DECRYPTION_FAILED":
      return text(
        locale,
        "Failed to decrypt secrets data.",
        "密钥数据解密失败。",
      );
    case "PERMISSION_DENIED":
      return text(
        locale,
        "Permission denied while accessing secret storage.",
        "访问密钥存储时权限不足。",
      );
    default:
      return text(locale, "Unknown secret storage error.", "未知密钥存储错误。");
  }
}

function text(
  locale: SecretStoreLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
}
