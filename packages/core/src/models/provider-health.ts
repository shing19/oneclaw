import type {
  Disposable,
  ModelProvider,
  ProviderHealth,
  ProviderRegistry,
} from "../types/model-config.js";

export type ProviderHealthLocale = "zh-CN" | "en";

export type ProviderHealthErrorCode =
  | "INVALID_PROVIDER_ID"
  | "INVALID_PROBE_INTERVAL_MS"
  | "PROVIDER_NOT_FOUND";

export interface ProviderHealthManagerOptions {
  providerRegistry?: ProviderRegistry;
  providers?: readonly ModelProvider[] | Record<string, ModelProvider>;
  locale?: ProviderHealthLocale;
  probeIntervalMs?: number;
  now?: () => Date;
}

export interface ProviderHealthSnapshot {
  providerId: string;
  health: ProviderHealth;
  checkedAt: Date;
  recovering: boolean;
  consecutiveFailures: number;
  recoveryProbeDueAt: Date | null;
  lastError: string | null;
}

export interface ProviderHealthChangeEvent {
  providerId: string;
  previous: ProviderHealthSnapshot | null;
  current: ProviderHealthSnapshot;
}

const DEFAULT_PROBE_INTERVAL_MS = 30_000;

export class ProviderHealthError extends Error {
  readonly code: ProviderHealthErrorCode;

  constructor(code: ProviderHealthErrorCode, locale: ProviderHealthLocale) {
    super(messageForErrorCode(code, locale));
    this.name = "ProviderHealthError";
    this.code = code;
  }
}

export class ProviderHealthManager {
  private readonly providerRegistry: ProviderRegistry | undefined;
  private readonly providersById: Map<string, ModelProvider>;
  private readonly locale: ProviderHealthLocale;
  private readonly probeIntervalMs: number;
  private readonly now: () => Date;
  private readonly snapshots: Map<string, ProviderHealthSnapshot>;
  private readonly listeners: Set<(event: ProviderHealthChangeEvent) => void>;
  private intervalHandle: NodeJS.Timeout | null;

  constructor(options: ProviderHealthManagerOptions = {}) {
    this.locale = options.locale ?? "zh-CN";
    this.probeIntervalMs = normalizeProbeIntervalMs(
      options.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS,
      this.locale,
    );
    this.now = options.now ?? (() => new Date());
    this.providerRegistry = options.providerRegistry;
    this.providersById = buildProviderMap(options.providers);
    this.snapshots = new Map<string, ProviderHealthSnapshot>();
    this.listeners = new Set<(event: ProviderHealthChangeEvent) => void>();
    this.intervalHandle = null;
  }

  getProbeIntervalMs(): number {
    return this.probeIntervalMs;
  }

  isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  start(): void {
    if (this.intervalHandle !== null) {
      return;
    }

    void this.checkAll();
    this.intervalHandle = setInterval(() => {
      void this.checkAll().catch(() => undefined);
    }, this.probeIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle === null) {
      return;
    }
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  dispose(): void {
    this.stop();
  }

  onStatusChange(callback: (event: ProviderHealthChangeEvent) => void): Disposable {
    this.listeners.add(callback);
    return {
      dispose: () => {
        this.listeners.delete(callback);
      },
    };
  }

  getStatus(providerId: string): ProviderHealthSnapshot | undefined {
    const normalizedProviderId = normalizeProviderId(providerId);
    if (normalizedProviderId === null) {
      return undefined;
    }

    const snapshot = this.snapshots.get(normalizedProviderId);
    return snapshot === undefined ? undefined : cloneSnapshot(snapshot);
  }

  getStatuses(): ProviderHealthSnapshot[] {
    return [...this.snapshots.values()]
      .map(cloneSnapshot)
      .sort((left, right) => left.providerId.localeCompare(right.providerId));
  }

  async check(providerId: string): Promise<ProviderHealthSnapshot> {
    const normalizedProviderId = normalizeProviderId(providerId);
    if (normalizedProviderId === null) {
      throw new ProviderHealthError("INVALID_PROVIDER_ID", this.locale);
    }

    const provider = this.resolveProvider(normalizedProviderId);
    if (provider === undefined) {
      throw new ProviderHealthError("PROVIDER_NOT_FOUND", this.locale);
    }

    return this.runHealthCheck(normalizedProviderId, provider);
  }

  async checkAll(): Promise<ProviderHealthSnapshot[]> {
    const providers = this.listProviders();
    const results: ProviderHealthSnapshot[] = [];

    for (const [providerId, provider] of providers.entries()) {
      const snapshot = await this.runHealthCheck(providerId, provider);
      results.push(snapshot);
    }

    return results.sort((left, right) => left.providerId.localeCompare(right.providerId));
  }

  private async runHealthCheck(
    providerId: string,
    provider: ModelProvider,
  ): Promise<ProviderHealthSnapshot> {
    const startedAt = this.now();

    try {
      const reportedHealth = await provider.getHealth();
      const normalizedHealth = normalizeHealth(reportedHealth, startedAt);
      return this.updateSnapshot(providerId, normalizedHealth, null);
    } catch (error: unknown) {
      const fallbackHealth = toUnavailableHealth(startedAt, error);
      const errorMessage = toErrorMessage(error);
      return this.updateSnapshot(providerId, fallbackHealth, errorMessage);
    }
  }

  private updateSnapshot(
    providerId: string,
    health: ProviderHealth,
    lastError: string | null,
  ): ProviderHealthSnapshot {
    const previous = this.snapshots.get(providerId);
    const recovering = health.status !== "ok";
    const consecutiveFailures = recovering
      ? (previous?.consecutiveFailures ?? 0) + 1
      : 0;
    const recoveryProbeDueAt = recovering
      ? new Date(health.checkedAt.getTime() + this.probeIntervalMs)
      : null;

    const current: ProviderHealthSnapshot = {
      providerId,
      health,
      checkedAt: new Date(health.checkedAt.getTime()),
      recovering,
      consecutiveFailures,
      recoveryProbeDueAt,
      lastError,
    };

    const currentClone = cloneSnapshot(current);
    this.snapshots.set(providerId, currentClone);

    const previousClone = previous === undefined ? null : cloneSnapshot(previous);
    if (hasMeaningfulStatusChange(previousClone, currentClone)) {
      this.emitStatusChange({
        providerId,
        previous: previousClone,
        current: cloneSnapshot(currentClone),
      });
    }

    return cloneSnapshot(currentClone);
  }

  private emitStatusChange(event: ProviderHealthChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures are isolated to protect the health loop.
      }
    }
  }

  private resolveProvider(providerId: string): ModelProvider | undefined {
    const inlineProvider = this.providersById.get(providerId);
    if (inlineProvider !== undefined) {
      return inlineProvider;
    }
    return this.providerRegistry?.get(providerId);
  }

  private listProviders(): Map<string, ModelProvider> {
    const providers = new Map<string, ModelProvider>();

    for (const [providerId, provider] of this.providersById.entries()) {
      providers.set(providerId, provider);
    }

    if (this.providerRegistry !== undefined) {
      for (const provider of this.providerRegistry.listAll()) {
        const providerId = normalizeProviderId(provider.id);
        if (providerId === null || providers.has(providerId)) {
          continue;
        }
        providers.set(providerId, provider);
      }
    }

    return providers;
  }
}

export function createProviderHealthManager(
  options: ProviderHealthManagerOptions = {},
): ProviderHealthManager {
  return new ProviderHealthManager(options);
}

function normalizeProbeIntervalMs(
  value: number,
  locale: ProviderHealthLocale,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ProviderHealthError("INVALID_PROBE_INTERVAL_MS", locale);
  }
  return Math.floor(value);
}

function buildProviderMap(
  providers: ProviderHealthManagerOptions["providers"],
): Map<string, ModelProvider> {
  const providerMap = new Map<string, ModelProvider>();
  if (providers === undefined) {
    return providerMap;
  }

  if (Array.isArray(providers)) {
    for (const provider of providers as readonly ModelProvider[]) {
      const providerId = normalizeProviderId(provider.id);
      if (providerId === null) {
        continue;
      }
      providerMap.set(providerId, provider);
    }
    return providerMap;
  }

  const record = providers as Record<string, ModelProvider>;
  for (const provider of Object.values(record)) {
    const providerId = normalizeProviderId(provider.id);
    if (providerId === null) {
      continue;
    }
    providerMap.set(providerId, provider);
  }

  return providerMap;
}

function normalizeProviderId(providerId: string): string | null {
  const trimmed = providerId.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function normalizeHealth(health: ProviderHealth, fallbackCheckedAt: Date): ProviderHealth {
  const status = normalizeHealthStatus(health.status);
  const latencyMs = normalizeLatencyMs(health.latencyMs);
  const checkedAt = normalizeCheckedAt(health.checkedAt, fallbackCheckedAt);
  const message = normalizeMessage(health.message);

  return {
    status,
    latencyMs,
    checkedAt,
    message,
  };
}

function toUnavailableHealth(checkedAt: Date, error: unknown): ProviderHealth {
  return {
    status: "unreachable",
    latencyMs: 0,
    checkedAt: new Date(checkedAt.getTime()),
    message: normalizeMessage(toErrorMessage(error)) ?? "health check failed",
  };
}

function normalizeHealthStatus(status: ProviderHealth["status"]): ProviderHealth["status"] {
  return status;
}

function normalizeLatencyMs(latencyMs: number): number {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    return 0;
  }
  return latencyMs;
}

function normalizeCheckedAt(value: Date, fallback: Date): Date {
  if (isValidDate(value)) {
    return new Date(value.getTime());
  }
  return new Date(fallback.getTime());
}

function normalizeMessage(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function cloneSnapshot(snapshot: ProviderHealthSnapshot): ProviderHealthSnapshot {
  return {
    providerId: snapshot.providerId,
    health: {
      status: snapshot.health.status,
      latencyMs: snapshot.health.latencyMs,
      checkedAt: new Date(snapshot.health.checkedAt.getTime()),
      message: snapshot.health.message,
    },
    checkedAt: new Date(snapshot.checkedAt.getTime()),
    recovering: snapshot.recovering,
    consecutiveFailures: snapshot.consecutiveFailures,
    recoveryProbeDueAt:
      snapshot.recoveryProbeDueAt === null
        ? null
        : new Date(snapshot.recoveryProbeDueAt.getTime()),
    lastError: snapshot.lastError,
  };
}

function hasMeaningfulStatusChange(
  previous: ProviderHealthSnapshot | null,
  current: ProviderHealthSnapshot,
): boolean {
  if (previous === null) {
    return true;
  }

  return (
    previous.health.status !== current.health.status ||
    previous.health.message !== current.health.message ||
    previous.health.latencyMs !== current.health.latencyMs ||
    previous.recovering !== current.recovering ||
    previous.consecutiveFailures !== current.consecutiveFailures ||
    previous.lastError !== current.lastError
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
    return error.name;
  }

  if (typeof error === "string") {
    const trimmed = error.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return "Unknown provider health check error";
}

function messageForErrorCode(
  code: ProviderHealthErrorCode,
  locale: ProviderHealthLocale,
): string {
  switch (code) {
    case "INVALID_PROVIDER_ID":
      return text(
        locale,
        "Provider id must be a non-empty string.",
        "Provider id 必须是非空字符串。",
      );
    case "INVALID_PROBE_INTERVAL_MS":
      return text(
        locale,
        "Probe interval must be a positive number.",
        "探测间隔必须是正数。",
      );
    case "PROVIDER_NOT_FOUND":
      return text(
        locale,
        "Provider is not registered.",
        "Provider 未注册。",
      );
    default:
      return text(
        locale,
        "Unknown provider health error.",
        "未知 Provider 健康检查错误。",
      );
  }
}

function text(
  locale: ProviderHealthLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
}
