# 契约：模型配置

> 统一接口管理所有模型供应商交互，包括供应商注册、fallback 编排、Key 轮换、额度追踪。

---

## 设计约束

- 所有供应商通过统一的 `ModelProvider` 接口访问
- 额度追踪同时支持 Token 计费（API Key）和请求数计费（Coding Plan）
- Fallback 逻辑与具体供应商无关
- 敏感信息（API Key）通过 SecretStore 获取，不存在于配置文件中

---

## 接口定义

### ModelProvider

```typescript
interface ModelProvider {
  id: string                     // e.g. 'deepseek', 'bailian'
  name: string                   // 显示名称（中文）
  type: 'api_key' | 'coding_plan' | 'custom_endpoint'
  authenticate(credentials: Credentials): Promise<AuthResult>
  listModels(): ModelInfo[]
  chat(request: ChatRequest): AsyncIterable<ChatChunk>
  getQuota(): Promise<QuotaStatus>
  getHealth(): Promise<ProviderHealth>
}

interface Credentials {
  apiKeys: string[]              // 支持多 Key 轮换
  baseUrl: string
  customHeaders?: Record<string, string>
  protocol: ApiProtocol
}

type ApiProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'ollama'
```

### ModelConfig

```typescript
interface ModelConfig {
  providers: ProviderConfig[]    // 按优先级排序
  fallbackChain: string[]        // provider ID 列表
  defaultModel: string           // provider/model 格式
  perModelSettings: Record<string, ModelSettings>
}

interface ProviderConfig {
  id: string
  enabled: boolean
  credentialRef: string          // SecretStore 中的 key
  baseUrl: string
  protocol: ApiProtocol
  models: string[]               // 启用的模型列表
}
```

### ModelSettings（per-model 粒度）

```typescript
interface ModelSettings {
  temperature?: number           // 0-2
  maxTokens?: number
  thinking?: ThinkLevel
  timeout?: number               // 秒
  transport?: 'sse' | 'websocket' | 'auto'
  streaming?: boolean
  cacheRetention?: 'none' | 'short' | 'long'
}

type ThinkLevel =
  | 'off' | 'minimal' | 'low'
  | 'medium' | 'high' | 'xhigh'
  | 'adaptive'
```

### QuotaStatus（核心缺失抽象）

```typescript
interface QuotaStatus {
  type: 'token_based' | 'request_based' | 'unlimited' | 'unknown'
  used: number
  limit: number | null
  resetAt: Date | null           // 下次重置时间
  estimatedCostYuan: number
  warningThreshold: number       // 百分比，默认 80
  exhausted: boolean
}
```

### QuotaTracker

```typescript
interface QuotaTracker {
  record(event: UsageEvent): void
  getStatus(providerId: string): QuotaStatus
  getDailySummary(date: Date): DailyCostSummary
  getHistory(range: DateRange): CostHistory
  onThresholdReached(callback: (status: QuotaStatus) => void): Disposable
  export(format: 'csv' | 'json'): string
}

interface UsageEvent {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  timestamp: Date
  traceId: string
}

interface DailyCostSummary {
  date: Date
  totalCostYuan: number
  byProvider: Record<string, number>
  totalRequests: number
}
```

### FallbackOrchestrator

```typescript
interface FallbackOrchestrator {
  execute(request: ChatRequest): AsyncIterable<ChatChunk>
  onFallback(callback: (event: FallbackEvent) => void): Disposable
}

interface FallbackEvent {
  from: string                   // provider ID
  to: string                     // provider ID
  reason: FailoverReason
  timestamp: Date
}

type FailoverReason =
  | 'rate_limit'
  | 'billing'
  | 'auth'
  | 'timeout'
  | 'model_not_found'
  | 'unknown'
```

### ProviderRegistry

```typescript
interface ProviderRegistry {
  register(provider: ModelProvider): void
  get(id: string): ModelProvider | undefined
  listAll(): ModelProvider[]
  listPresets(): PresetProvider[]
}

interface PresetProvider {
  id: string
  name: string
  baseUrl: string
  models: ModelInfo[]
  signupUrl: string              // 注册链接
  pricingRef: string             // 定价参考（指向 reference/model）
  setupGuide: string             // 配置引导文本
}
```

---

## 预置供应商

| ID | 名称 | Base URL | 协议 | 备注 |
|----|------|----------|------|------|
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | openai-completions | 夜间半价 |
| `bailian` | 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | openai-completions | Coding Plan 支持 |
| `zhipu` | 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` | openai-completions | GLM Flash 免费 |
| `minimax` | MiniMax | `https://api.minimax.chat/v1` | openai-completions | Coding Plan 支持 |
| `kimi` | 月之暗面 | `https://api.moonshot.cn/v1` | openai-completions | 128K 上下文 |
| `volcengine` | 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | openai-completions | Auto 路由 |
| `hunyuan` | 腾讯混元 | `https://api.hunyuan.cloud.tencent.com/v1` | openai-completions | lite 免费 |
| `spark` | 讯飞星火 | `https://spark-api-open.xf-yun.com/v1` | openai-completions | Lite 免费 |
| `siliconflow` | 硅基流动 | `https://api.siliconflow.cn/v1` | openai-completions | 聚合平台 |
| `doubao` | 字节豆包 | `https://ark.cn-beijing.volces.com/api/v3` | openai-completions | 与火山方舟共用 |

---

## Fallback 行为规则

| 错误类型 | 行为 | 原因 |
|---------|------|------|
| 上下文溢出 | **不** fallback | 更小的模型只会更差 |
| 429 限流 | fallback + 每 30s 探测主模型 | 限流通常是临时的 |
| 认证失败 (401) | 跳过该供应商 | 直到用户修改配置 |
| 计费异常 (402) | 跳过该供应商 | 直到充值 |
| 超时 | 重试一次，再失败则 fallback | 可能是网络波动 |
| 用户中断 (Abort) | **不** fallback | 用户主动行为 |

## Key 轮换协议

- 同一供应商可配多个 Key
- 遇 429：轮换到下一个 Key，标记当前 Key 为 rate-limited
- Rate-limited Key 冷却后恢复（默认 60s，可配置）
- 非 429 错误：不轮换，直接报错

---

## 成本计算

```
单次成本 = input_tokens × input_price + output_tokens × output_price
```

- 定价数据内嵌于构建产物（来源：`docs/reference/model/README.md`）
- 用户可在配置中覆盖定价
- Coding Plan 用户：`成本 = 月费 / 总请求数`
- DeepSeek 夜间优惠（00:30-08:30）自动识别
