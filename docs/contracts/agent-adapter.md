# 契约：Agent 适配层接口

> 解耦 OneClaw 上层与底层 Agent 内核。当前实现：OpenClaw 适配器。未来：替换为自研内核。

---

## 设计约束

- 适配层 **不得** 向上暴露 OpenClaw 特有类型
- 适配层 **必须** 管理内核生命周期（启动、停止、重启、健康检查）
- 适配层 **必须** 将 OneClaw 配置 Schema 翻译为内核原生配置
- 所有内核错误包装为 OneClaw 错误类型

---

## 接口定义

### AgentKernel

```typescript
interface AgentKernel {
  start(config: AgentConfig): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  getStatus(): KernelStatus
  getHealth(): Promise<HealthReport>

  // 事件流
  onLog(callback: (entry: LogEntry) => void): Disposable
  onStatusChange(callback: (status: KernelStatus) => void): Disposable
  onCostEvent(callback: (event: CostEvent) => void): Disposable
}
```

### AgentConfig

```typescript
interface AgentConfig {
  modelConfig: ModelConfig       // 引用 model-config 契约
  concurrency: ConcurrencySettings
  skills: SkillConfig[]
  workspacePaths: MountPoint[]
  timeoutSeconds: number
}

interface ConcurrencySettings {
  maxConcurrent: number          // 默认 4
  subagents: {
    maxConcurrent: number        // 默认 8
    maxSpawnDepth: number        // 1-5，默认 1
    maxChildrenPerAgent: number  // 1-20，默认 5
  }
}

interface MountPoint {
  hostPath: string
  containerPath: string
  readonly: boolean
}
```

### KernelStatus

```typescript
interface KernelStatus {
  state: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  uptime: number                 // 毫秒
  activeAgents: number
  lastError?: ErrorInfo
}
```

### HealthReport

```typescript
interface HealthReport {
  endpoints: EndpointHealth[]
  memory: { used: number; total: number }
  activeConnections: number
  timestamp: Date
}

interface EndpointHealth {
  provider: string
  url: string
  status: 'ok' | 'degraded' | 'unreachable'
  latencyMs: number
  lastChecked: Date
}
```

### 事件类型

```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: Date
  traceId: string
  metadata?: Record<string, unknown>
}

interface CostEvent {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostYuan: number
  timestamp: Date
  traceId: string
}

interface Disposable {
  dispose(): void
}
```

---

## OpenClaw 适配器实现说明

### 进程管理

- 使用 `child_process.spawn` 启动 OpenClaw 进程
- 捕获 stdout/stderr，解析结构化事件
- 优雅关闭：SIGTERM → 等待 5s → SIGKILL
- 重启：stop + 等待 + 用新配置 start

### 配置翻译

- OneClaw `AgentConfig` → OpenClaw `openclaw.json`
- 需翻译的字段：模型设置、并发参数、技能列表、工作目录
- API Key 通过环境变量注入（不写入 openclaw.json）

### 日志解析

- 解析 OpenClaw 日志格式，提取：使用的模型、Token 消耗、延迟、错误、fallback 事件
- 作为 `LogEntry` 和 `CostEvent` 发出

---

## 错误处理

```typescript
type AdapterErrorCode =
  | 'KERNEL_START_FAILED'
  | 'KERNEL_CRASHED'
  | 'CONFIG_TRANSLATION_FAILED'
  | 'PROCESS_TIMEOUT'
  | 'IPC_ERROR'

interface AdapterError extends Error {
  code: AdapterErrorCode
  cause?: Error
  recoverable: boolean
}
```

- `KERNEL_START_FAILED`：配置错误或依赖缺失 → 不可恢复，通知用户
- `KERNEL_CRASHED`：运行时崩溃 → 自动重启一次，再失败则通知用户
- `CONFIG_TRANSLATION_FAILED`：配置 Schema 不匹配 → 不可恢复
- `PROCESS_TIMEOUT`：进程无响应 → 强制 kill + 重启

---

## 未来内核迁移清单

1. 实现 `AgentKernel` 接口的新适配器
2. 通过所有类型检查（`tsc --noEmit`）
3. 通过所有集成测试
4. 在配置中切换 `kernel: 'openclaw' | 'custom'`
5. 双内核并行验证期后移除 OpenClaw 适配器
