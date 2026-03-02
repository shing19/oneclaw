export interface ModelProvider {
  id: string;
  name: string;
  type: "api_key" | "coding_plan" | "custom_endpoint";
  authenticate(credentials: Credentials): Promise<AuthResult>;
  listModels(): ModelInfo[];
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  getQuota(): Promise<QuotaStatus>;
  getHealth(): Promise<ProviderHealth>;
}

export interface Credentials {
  apiKeys: string[];
  baseUrl: string;
  customHeaders?: Record<string, string>;
  protocol: ApiProtocol;
}

export type ApiProtocol =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "ollama";

export interface AuthResult {
  success: boolean;
  message?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  usage?: ChatUsage;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealth {
  status: "ok" | "degraded" | "unreachable";
  latencyMs: number;
  checkedAt: Date;
  message?: string;
}

export interface ModelConfig {
  providers: ProviderConfig[];
  fallbackChain: string[];
  defaultModel: string;
  perModelSettings: Record<string, ModelSettings>;
}

export interface ProviderConfig {
  id: string;
  enabled: boolean;
  credentialRef: string;
  baseUrl: string;
  protocol: ApiProtocol;
  models: string[];
}

export interface ModelSettings {
  temperature?: number;
  maxTokens?: number;
  thinking?: ThinkLevel;
  timeout?: number;
  transport?: "sse" | "websocket" | "auto";
  streaming?: boolean;
  cacheRetention?: "none" | "short" | "long";
}

export type ThinkLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "adaptive";

export interface QuotaStatus {
  type: "token_based" | "request_based" | "unlimited" | "unknown";
  used: number;
  limit: number | null;
  resetAt: Date | null;
  estimatedCostYuan: number;
  warningThreshold: number;
  exhausted: boolean;
}

export interface QuotaTracker {
  record(event: UsageEvent): void;
  getStatus(providerId: string): QuotaStatus;
  getDailySummary(date: Date): DailyCostSummary;
  getHistory(range: DateRange): CostHistory;
  onThresholdReached(callback: (status: QuotaStatus) => void): Disposable;
  export(format: "csv" | "json"): string;
}

export interface UsageEvent {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
  traceId: string;
}

export interface DailyCostSummary {
  date: Date;
  totalCostYuan: number;
  byProvider: Record<string, number>;
  totalRequests: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface CostHistory {
  range: DateRange;
  daily: DailyCostSummary[];
}

export interface FallbackOrchestrator {
  execute(request: ChatRequest): AsyncIterable<ChatChunk>;
  onFallback(callback: (event: FallbackEvent) => void): Disposable;
}

export interface FallbackEvent {
  from: string;
  to: string;
  reason: FailoverReason;
  timestamp: Date;
}

export type FailoverReason =
  | "rate_limit"
  | "billing"
  | "auth"
  | "timeout"
  | "model_not_found"
  | "unknown";

export interface ProviderRegistry {
  register(provider: ModelProvider): void;
  get(id: string): ModelProvider | undefined;
  listAll(): ModelProvider[];
  listPresets(): PresetProvider[];
}

export interface PresetProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: ModelInfo[];
  signupUrl: string;
  pricingRef: string;
  setupGuide: string;
}

export interface Disposable {
  dispose(): void;
}
