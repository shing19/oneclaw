import type {
  CostHistory,
  DailyCostSummary,
  DateRange,
  Disposable,
  QuotaStatus,
  QuotaTracker,
  UsageEvent,
} from "../types/model-config.js";

export type QuotaTrackerLocale = "zh-CN" | "en";

export type QuotaWindow = "none" | "daily" | "weekly" | "monthly";

export interface TokenPricingConfig {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

export interface RequestPricingConfig {
  perRequestPriceYuan?: number;
  monthlyFeeYuan?: number;
  includedRequestsPerCycle?: number;
}

export interface ProviderQuotaPolicy {
  providerId: string;
  type?: QuotaStatus["type"];
  window?: QuotaWindow;
  limit?: number | null;
  warningThreshold?: number;
  resetAt?: Date | string | null;
  tokenPricing?: TokenPricingConfig;
  requestPricing?: RequestPricingConfig;
}

export interface QuotaTrackerOptions {
  locale?: QuotaTrackerLocale;
  now?: () => Date;
  providers?:
    | readonly ProviderQuotaPolicy[]
    | Record<string, Omit<ProviderQuotaPolicy, "providerId">>;
}

export type QuotaTrackerErrorCode =
  | "INVALID_PROVIDER_ID"
  | "INVALID_WARNING_THRESHOLD"
  | "INVALID_LIMIT"
  | "INVALID_DATE"
  | "INVALID_USAGE_EVENT"
  | "INVALID_DATE_RANGE"
  | "INVALID_PRICING";

interface ResolvedProviderQuotaPolicy {
  providerId: string;
  type: QuotaStatus["type"];
  window: QuotaWindow;
  limit: number | null;
  warningThreshold: number;
  resetAt: Date | null;
  tokenPricing: TokenPricingConfig | null;
  requestPricing: RequestPricingConfig | null;
}

interface UsageEventRecord extends UsageEvent {
  provider: string;
  timestamp: Date;
}

interface QuotaWindowRange {
  start: Date;
  end: Date;
}

const MILLION = 1_000_000;
const DEFAULT_WARNING_THRESHOLD = 80;

const DEFAULT_PROVIDER_POLICIES: readonly ProviderQuotaPolicy[] = [
  {
    providerId: "deepseek",
    type: "token_based",
    window: "monthly",
    warningThreshold: DEFAULT_WARNING_THRESHOLD,
    tokenPricing: {
      inputPricePerMillion: 4,
      outputPricePerMillion: 12,
    },
  },
  {
    providerId: "bailian",
    type: "token_based",
    window: "monthly",
    warningThreshold: DEFAULT_WARNING_THRESHOLD,
    tokenPricing: {
      inputPricePerMillion: 0.8,
      outputPricePerMillion: 2,
    },
  },
  {
    providerId: "zhipu",
    type: "token_based",
    window: "monthly",
    warningThreshold: DEFAULT_WARNING_THRESHOLD,
    tokenPricing: {
      inputPricePerMillion: 0.8,
      outputPricePerMillion: 0.8,
    },
  },
];

export class QuotaTrackerError extends Error {
  readonly code: QuotaTrackerErrorCode;

  constructor(code: QuotaTrackerErrorCode, locale: QuotaTrackerLocale) {
    super(messageForErrorCode(code, locale));
    this.name = "QuotaTrackerError";
    this.code = code;
  }
}

export class DefaultQuotaTracker implements QuotaTracker {
  private readonly locale: QuotaTrackerLocale;
  private readonly now: () => Date;
  private readonly events: UsageEventRecord[];
  private readonly providerPolicies: Map<string, ResolvedProviderQuotaPolicy>;
  private readonly thresholdListeners: Set<(status: QuotaStatus) => void>;

  constructor(options: QuotaTrackerOptions = {}) {
    this.locale = options.locale ?? "zh-CN";
    this.now = options.now ?? (() => new Date());
    this.events = [];
    this.thresholdListeners = new Set<(status: QuotaStatus) => void>();
    this.providerPolicies = new Map<string, ResolvedProviderQuotaPolicy>();

    for (const defaultPolicy of DEFAULT_PROVIDER_POLICIES) {
      const resolvedPolicy = resolveProviderPolicy(defaultPolicy, this.locale);
      this.providerPolicies.set(resolvedPolicy.providerId, resolvedPolicy);
    }

    const configuredProviders = normalizeProviderPoliciesInput(options.providers);
    for (const policy of configuredProviders) {
      const resolvedPolicy = resolveProviderPolicy(policy, this.locale);
      this.providerPolicies.set(resolvedPolicy.providerId, resolvedPolicy);
    }
  }

  record(event: UsageEvent): void {
    const normalizedEvent = normalizeUsageEvent(event, this.locale);
    const providerId = normalizedEvent.provider;
    const statusBefore = this.getStatus(providerId);

    this.events.push(normalizedEvent);

    const statusAfter = this.getStatus(providerId);
    if (didReachThreshold(statusBefore, statusAfter)) {
      this.emitThresholdReached(statusAfter);
    }
  }

  getStatus(providerId: string): QuotaStatus {
    const normalizedProviderId = normalizeProviderId(providerId, this.locale);
    const policy = this.getPolicyForProvider(normalizedProviderId);
    const windowRange = buildWindowRange(policy.window, this.now());
    const providerEvents = this.listProviderEventsInRange(
      normalizedProviderId,
      windowRange,
    );
    const used = computeUsedAmount(policy, providerEvents);
    const limit = resolveEffectiveLimit(policy);
    const estimatedCostYuan = roundTo6(
      computeTotalCostYuan(policy, providerEvents),
    );
    const resetAt = resolveResetAt(policy, windowRange, this.now());
    const exhausted = limit !== null && used >= limit;

    return {
      type: policy.type,
      used,
      limit,
      resetAt,
      estimatedCostYuan,
      warningThreshold: policy.warningThreshold,
      exhausted,
    };
  }

  getDailySummary(date: Date): DailyCostSummary {
    const targetDate = cloneDate(date, this.locale);
    const dayStart = startOfDay(targetDate);
    const dayEnd = addDays(dayStart, 1);
    const dayRange: QuotaWindowRange = {
      start: dayStart,
      end: dayEnd,
    };
    const events = this.listEventsInRange(dayRange);
    const byProvider: Record<string, number> = {};
    let totalCostYuan = 0;

    for (const event of events) {
      const policy = this.getPolicyForProvider(event.provider);
      const eventCost = roundTo6(computeEventCostYuan(policy, event));
      byProvider[event.provider] = roundTo6(
        (byProvider[event.provider] ?? 0) + eventCost,
      );
      totalCostYuan += eventCost;
    }

    return {
      date: dayStart,
      totalCostYuan: roundTo6(totalCostYuan),
      byProvider,
      totalRequests: events.length,
    };
  }

  getHistory(range: DateRange): CostHistory {
    const start = cloneDate(range.start, this.locale);
    const end = cloneDate(range.end, this.locale);
    if (start.getTime() > end.getTime()) {
      throw new QuotaTrackerError("INVALID_DATE_RANGE", this.locale);
    }

    const daily: DailyCostSummary[] = [];
    let cursor = startOfDay(start);
    const lastDay = startOfDay(end);

    while (cursor.getTime() <= lastDay.getTime()) {
      daily.push(this.getDailySummary(cursor));
      cursor = addDays(cursor, 1);
    }

    return {
      range: {
        start,
        end,
      },
      daily,
    };
  }

  onThresholdReached(callback: (status: QuotaStatus) => void): Disposable {
    this.thresholdListeners.add(callback);
    return {
      dispose: () => {
        this.thresholdListeners.delete(callback);
      },
    };
  }

  export(format: "csv" | "json"): string {
    if (format === "json") {
      return this.exportAsJson();
    }
    return this.exportAsCsv();
  }

  private exportAsJson(): string {
    const payload = {
      exportedAt: this.now().toISOString(),
      events: this.events.map((event) => {
        const policy = this.getPolicyForProvider(event.provider);
        return {
          provider: event.provider,
          model: event.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          totalTokens: event.inputTokens + event.outputTokens,
          timestamp: event.timestamp.toISOString(),
          traceId: event.traceId,
          costYuan: roundTo6(computeEventCostYuan(policy, event)),
        };
      }),
    };

    return JSON.stringify(payload, null, 2);
  }

  private exportAsCsv(): string {
    const lines = [
      "timestamp,provider,model,inputTokens,outputTokens,totalTokens,costYuan,traceId",
    ];

    for (const event of this.events) {
      const policy = this.getPolicyForProvider(event.provider);
      const totalTokens = event.inputTokens + event.outputTokens;
      const costYuan = roundTo6(computeEventCostYuan(policy, event));

      lines.push(
        [
          escapeCsv(event.timestamp.toISOString()),
          escapeCsv(event.provider),
          escapeCsv(event.model),
          String(event.inputTokens),
          String(event.outputTokens),
          String(totalTokens),
          String(costYuan),
          escapeCsv(event.traceId),
        ].join(","),
      );
    }

    return lines.join("\n");
  }

  private emitThresholdReached(status: QuotaStatus): void {
    for (const listener of this.thresholdListeners) {
      try {
        listener(status);
      } catch {
        // Listener errors are intentionally isolated.
      }
    }
  }

  private getPolicyForProvider(providerId: string): ResolvedProviderQuotaPolicy {
    const existingPolicy = this.providerPolicies.get(providerId);
    if (existingPolicy !== undefined) {
      return existingPolicy;
    }

    return resolveProviderPolicy(
      {
        providerId,
        type: "unknown",
        window: "monthly",
        warningThreshold: DEFAULT_WARNING_THRESHOLD,
      },
      this.locale,
    );
  }

  private listProviderEventsInRange(
    providerId: string,
    range: QuotaWindowRange | null,
  ): readonly UsageEventRecord[] {
    return this.events.filter((event: UsageEventRecord): boolean => {
      if (event.provider !== providerId) {
        return false;
      }

      if (range === null) {
        return true;
      }

      const timestampMs = event.timestamp.getTime();
      return (
        timestampMs >= range.start.getTime() && timestampMs < range.end.getTime()
      );
    });
  }

  private listEventsInRange(range: QuotaWindowRange): readonly UsageEventRecord[] {
    return this.events.filter((event: UsageEventRecord): boolean => {
      const timestampMs = event.timestamp.getTime();
      return timestampMs >= range.start.getTime() && timestampMs < range.end.getTime();
    });
  }
}

export function createQuotaTracker(
  options: QuotaTrackerOptions = {},
): QuotaTracker {
  return new DefaultQuotaTracker(options);
}

function normalizeProviderPoliciesInput(
  input: QuotaTrackerOptions["providers"],
): readonly ProviderQuotaPolicy[] {
  if (input === undefined) {
    return [];
  }

  if (Array.isArray(input)) {
    return [...(input as readonly ProviderQuotaPolicy[])];
  }

  return Object.entries(input).map(
    ([providerId, policy]): ProviderQuotaPolicy => ({
      providerId,
      ...policy,
    }),
  );
}

function resolveProviderPolicy(
  policy: ProviderQuotaPolicy,
  locale: QuotaTrackerLocale,
): ResolvedProviderQuotaPolicy {
  const providerId = normalizeProviderId(policy.providerId, locale);
  const type = normalizeQuotaType(policy.type);
  const window = normalizeQuotaWindow(policy.window);
  const limit = normalizeLimit(policy.limit, locale);
  const warningThreshold = normalizeWarningThreshold(
    policy.warningThreshold,
    locale,
  );
  const resetAt = normalizeDateLike(policy.resetAt, locale);
  const tokenPricing = normalizeTokenPricing(policy.tokenPricing, locale);
  const requestPricing = normalizeRequestPricing(policy.requestPricing, locale);

  return {
    providerId,
    type,
    window,
    limit,
    warningThreshold,
    resetAt,
    tokenPricing,
    requestPricing,
  };
}

function normalizeProviderId(
  value: string,
  locale: QuotaTrackerLocale,
): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    throw new QuotaTrackerError("INVALID_PROVIDER_ID", locale);
  }
  return trimmed;
}

function normalizeQuotaType(value: QuotaStatus["type"] | undefined): QuotaStatus["type"] {
  if (
    value === "token_based" ||
    value === "request_based" ||
    value === "unlimited" ||
    value === "unknown"
  ) {
    return value;
  }
  return "token_based";
}

function normalizeQuotaWindow(value: QuotaWindow | undefined): QuotaWindow {
  if (
    value === "none" ||
    value === "daily" ||
    value === "weekly" ||
    value === "monthly"
  ) {
    return value;
  }
  return "monthly";
}

function normalizeLimit(
  value: number | null | undefined,
  locale: QuotaTrackerLocale,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new QuotaTrackerError("INVALID_LIMIT", locale);
  }

  return value;
}

function normalizeWarningThreshold(
  value: number | undefined,
  locale: QuotaTrackerLocale,
): number {
  const warningThreshold = value ?? DEFAULT_WARNING_THRESHOLD;
  if (
    !Number.isFinite(warningThreshold) ||
    warningThreshold <= 0 ||
    warningThreshold > 100
  ) {
    throw new QuotaTrackerError("INVALID_WARNING_THRESHOLD", locale);
  }
  return warningThreshold;
}

function normalizeDateLike(
  value: Date | string | null | undefined,
  locale: QuotaTrackerLocale,
): Date | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return cloneDate(value, locale);
  }

  const parsedDate = new Date(value);
  return cloneDate(parsedDate, locale);
}

function normalizeTokenPricing(
  pricing: TokenPricingConfig | undefined,
  locale: QuotaTrackerLocale,
): TokenPricingConfig | null {
  if (pricing === undefined) {
    return null;
  }

  if (
    !isNonNegativeFiniteNumber(pricing.inputPricePerMillion) ||
    !isNonNegativeFiniteNumber(pricing.outputPricePerMillion)
  ) {
    throw new QuotaTrackerError("INVALID_PRICING", locale);
  }

  return {
    inputPricePerMillion: pricing.inputPricePerMillion,
    outputPricePerMillion: pricing.outputPricePerMillion,
  };
}

function normalizeRequestPricing(
  pricing: RequestPricingConfig | undefined,
  locale: QuotaTrackerLocale,
): RequestPricingConfig | null {
  if (pricing === undefined) {
    return null;
  }

  const perRequestPriceYuan = pricing.perRequestPriceYuan;
  if (
    perRequestPriceYuan !== undefined &&
    !isNonNegativeFiniteNumber(perRequestPriceYuan)
  ) {
    throw new QuotaTrackerError("INVALID_PRICING", locale);
  }

  const monthlyFeeYuan = pricing.monthlyFeeYuan;
  if (monthlyFeeYuan !== undefined && !isNonNegativeFiniteNumber(monthlyFeeYuan)) {
    throw new QuotaTrackerError("INVALID_PRICING", locale);
  }

  const includedRequestsPerCycle = pricing.includedRequestsPerCycle;
  if (
    includedRequestsPerCycle !== undefined &&
    (!Number.isFinite(includedRequestsPerCycle) || includedRequestsPerCycle <= 0)
  ) {
    throw new QuotaTrackerError("INVALID_PRICING", locale);
  }

  return {
    perRequestPriceYuan,
    monthlyFeeYuan,
    includedRequestsPerCycle,
  };
}

function normalizeUsageEvent(
  event: UsageEvent,
  locale: QuotaTrackerLocale,
): UsageEventRecord {
  const provider = normalizeProviderId(event.provider, locale);
  const model = normalizeNonEmptyString(event.model, locale);
  const traceId = normalizeNonEmptyString(event.traceId, locale);
  const inputTokens = normalizeTokenCount(event.inputTokens, locale);
  const outputTokens = normalizeTokenCount(event.outputTokens, locale);
  const timestamp = cloneDate(event.timestamp, locale);

  return {
    provider,
    model,
    traceId,
    inputTokens,
    outputTokens,
    timestamp,
  };
}

function normalizeNonEmptyString(
  value: string,
  locale: QuotaTrackerLocale,
): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new QuotaTrackerError("INVALID_USAGE_EVENT", locale);
  }
  return normalized;
}

function normalizeTokenCount(value: number, locale: QuotaTrackerLocale): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new QuotaTrackerError("INVALID_USAGE_EVENT", locale);
  }
  return value;
}

function cloneDate(value: Date, locale: QuotaTrackerLocale): Date {
  const copy = new Date(value.getTime());
  if (Number.isNaN(copy.getTime())) {
    throw new QuotaTrackerError("INVALID_DATE", locale);
  }
  return copy;
}

function buildWindowRange(window: QuotaWindow, now: Date): QuotaWindowRange | null {
  if (window === "none") {
    return null;
  }

  if (window === "daily") {
    const start = startOfDay(now);
    return {
      start,
      end: addDays(start, 1),
    };
  }

  if (window === "weekly") {
    const start = startOfWeek(now);
    return {
      start,
      end: addDays(start, 7),
    };
  }

  const start = startOfMonth(now);
  return {
    start,
    end: startOfNextMonth(start),
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = startOfDay(date);
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(startOfCurrentMonth: Date): Date {
  return new Date(
    startOfCurrentMonth.getFullYear(),
    startOfCurrentMonth.getMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function resolveEffectiveLimit(policy: ResolvedProviderQuotaPolicy): number | null {
  if (policy.type === "unlimited" || policy.type === "unknown") {
    return null;
  }

  if (policy.limit !== null) {
    return policy.limit;
  }

  if (
    policy.type === "request_based" &&
    policy.requestPricing?.includedRequestsPerCycle !== undefined
  ) {
    return policy.requestPricing.includedRequestsPerCycle;
  }

  return null;
}

function resolveResetAt(
  policy: ResolvedProviderQuotaPolicy,
  windowRange: QuotaWindowRange | null,
  now: Date,
): Date | null {
  if (policy.resetAt !== null && policy.resetAt.getTime() > now.getTime()) {
    return new Date(policy.resetAt.getTime());
  }

  if (windowRange === null) {
    return null;
  }

  return new Date(windowRange.end.getTime());
}

function computeUsedAmount(
  policy: ResolvedProviderQuotaPolicy,
  events: readonly UsageEventRecord[],
): number {
  if (policy.type === "request_based") {
    return events.length;
  }

  if (policy.type === "token_based") {
    return events.reduce(
      (sum: number, event: UsageEventRecord): number =>
        sum + event.inputTokens + event.outputTokens,
      0,
    );
  }

  if (policy.tokenPricing !== null) {
    return events.reduce(
      (sum: number, event: UsageEventRecord): number =>
        sum + event.inputTokens + event.outputTokens,
      0,
    );
  }

  return events.length;
}

function computeTotalCostYuan(
  policy: ResolvedProviderQuotaPolicy,
  events: readonly UsageEventRecord[],
): number {
  if (events.length === 0) {
    return 0;
  }

  if (policy.type === "request_based") {
    return computeRequestBasedCost(policy, events.length);
  }

  if (policy.tokenPricing === null) {
    return 0;
  }

  return events.reduce(
    (sum: number, event: UsageEventRecord): number =>
      sum + computeTokenBasedCost(event, policy),
    0,
  );
}

function computeEventCostYuan(
  policy: ResolvedProviderQuotaPolicy,
  event: UsageEventRecord,
): number {
  if (policy.type === "request_based") {
    return computeRequestBasedCost(policy, 1);
  }

  if (policy.tokenPricing === null) {
    return 0;
  }

  return computeTokenBasedCost(event, policy);
}

function computeTokenBasedCost(
  event: UsageEventRecord,
  policy: ResolvedProviderQuotaPolicy,
): number {
  const tokenPricing = policy.tokenPricing;
  if (tokenPricing === null) {
    return 0;
  }

  const inputCost =
    (event.inputTokens * tokenPricing.inputPricePerMillion) / MILLION;
  const outputCost =
    (event.outputTokens * tokenPricing.outputPricePerMillion) / MILLION;
  const rawCost = inputCost + outputCost;
  const deepSeekFactor = resolveDeepSeekDiscountFactor(
    policy.providerId,
    event.model,
    event.timestamp,
  );
  return rawCost * deepSeekFactor;
}

function computeRequestBasedCost(
  policy: ResolvedProviderQuotaPolicy,
  requestCount: number,
): number {
  const pricing = policy.requestPricing;
  if (pricing === null) {
    return 0;
  }

  if (pricing.perRequestPriceYuan !== undefined) {
    return pricing.perRequestPriceYuan * requestCount;
  }

  if (
    pricing.monthlyFeeYuan !== undefined &&
    pricing.includedRequestsPerCycle !== undefined
  ) {
    return (pricing.monthlyFeeYuan / pricing.includedRequestsPerCycle) * requestCount;
  }

  if (pricing.monthlyFeeYuan !== undefined) {
    return requestCount > 0 ? pricing.monthlyFeeYuan : 0;
  }

  return 0;
}

function resolveDeepSeekDiscountFactor(
  providerId: string,
  model: string,
  timestamp: Date,
): number {
  if (providerId !== "deepseek") {
    return 1;
  }

  if (!isWithinDeepSeekNightWindow(timestamp)) {
    return 1;
  }

  const normalizedModel = model.toLowerCase();
  if (
    normalizedModel.includes("r1") ||
    normalizedModel.includes("reasoner")
  ) {
    return 0.25;
  }

  return 0.5;
}

function isWithinDeepSeekNightWindow(timestamp: Date): boolean {
  const minutes = timestamp.getHours() * 60 + timestamp.getMinutes();
  const startMinutes = 30;
  const endMinutes = 8 * 60 + 30;
  return minutes >= startMinutes && minutes < endMinutes;
}

function didReachThreshold(before: QuotaStatus, after: QuotaStatus): boolean {
  const beforeUsage = computeUsagePercent(before);
  const afterUsage = computeUsagePercent(after);

  if (afterUsage === null) {
    return false;
  }

  if (afterUsage < after.warningThreshold) {
    return false;
  }

  if (beforeUsage === null) {
    return true;
  }

  return beforeUsage < after.warningThreshold;
}

function computeUsagePercent(status: QuotaStatus): number | null {
  if (status.limit === null || status.limit <= 0) {
    return null;
  }
  return (status.used / status.limit) * 100;
}

function roundTo6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function escapeCsv(value: string): string {
  if (
    !value.includes(",") &&
    !value.includes('"') &&
    !value.includes("\n") &&
    !value.includes("\r")
  ) {
    return value;
  }

  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function isNonNegativeFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function messageForErrorCode(
  code: QuotaTrackerErrorCode,
  locale: QuotaTrackerLocale,
): string {
  switch (code) {
    case "INVALID_PROVIDER_ID":
      return text(
        locale,
        "Provider id must be a non-empty string.",
        "Provider id 必须是非空字符串。",
      );
    case "INVALID_WARNING_THRESHOLD":
      return text(
        locale,
        "Warning threshold must be in range (0, 100].",
        "告警阈值必须在 (0, 100] 范围内。",
      );
    case "INVALID_LIMIT":
      return text(
        locale,
        "Quota limit must be a non-negative number or null.",
        "额度上限必须是非负数或 null。",
      );
    case "INVALID_DATE":
      return text(
        locale,
        "Date value is invalid.",
        "日期值无效。",
      );
    case "INVALID_USAGE_EVENT":
      return text(
        locale,
        "Usage event is invalid. Check provider/model/traceId and token counts.",
        "用量事件无效，请检查 provider/model/traceId 与 token 数。",
      );
    case "INVALID_DATE_RANGE":
      return text(
        locale,
        "Date range is invalid. start must not be after end.",
        "日期范围无效，start 不能晚于 end。",
      );
    case "INVALID_PRICING":
      return text(
        locale,
        "Pricing config must be non-negative numeric values.",
        "定价配置必须是非负数值。",
      );
    default:
      return text(
        locale,
        "Unknown quota tracker error.",
        "未知额度追踪错误。",
      );
  }
}

function text(
  locale: QuotaTrackerLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
}
