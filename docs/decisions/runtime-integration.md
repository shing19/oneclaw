# 架构决策：GUI 运行时集成策略

> Tauri 桌面前端如何调用 TypeScript 核心模块（`@oneclaw/core`）。

---

## 背景

OneClaw 桌面应用使用 Tauri 2（Rust 壳 + React 前端）。核心业务逻辑全部在 TypeScript `@oneclaw/core` 包中：

- `ConfigManager` — 配置读写、监听、备份回滚
- `OpenClawAdapter` — Agent 内核生命周期管理（启动/停止/重启/健康检查）
- `SecretStore` — 平台密钥存储
- `ProviderRegistry` / `FallbackOrchestrator` / `QuotaTracker` — 模型管理
- `FeishuAdapter` — 飞书通信

这些模块使用 Node.js API（`child_process.spawn`、`node:fs`、`node:crypto`、`node:readline`），无法直接在 Rust 或浏览器中运行。

CLI 已证明这些模块在 Bun/Node.js 运行时中工作正常。

---

## 候选方案

### 方案 A：Tauri Rust 命令直接包装

Rust 端嵌入 Node.js 运行时或将核心编译为 WASM，直接在 Tauri 进程内调用。

| 维度 | 评估 |
|------|------|
| 可行性 | 极低。核心依赖 `child_process.spawn`（进程管理）、`node:fs`（文件系统）、平台 Keychain API，无法编译为 WASM。嵌入 Node.js 运行时需要 libnode（~40MB+），构建复杂度高 |
| 性能 | 零 IPC 开销，理论最优 |
| 构建复杂度 | 极高。Node.js 嵌入无成熟方案，跨平台构建矩阵复杂 |
| 维护成本 | 极高。核心每次变更需同步 FFI 绑定 |

**结论：排除。**

### 方案 B：Sidecar 进程 + JSON-RPC over stdio

Tauri 启动一个独立进程（Bun 编译的单文件可执行），通过 stdin/stdout 交换 JSON-RPC 消息。

| 维度 | 评估 |
|------|------|
| 可行性 | 高。`bun build --compile` 可将 TypeScript 核心打包为零依赖单文件可执行，Tauri `tauri-plugin-shell` 原生支持 sidecar 管理 |
| 性能 | IPC 延迟 ~1-5ms（stdio 管道），事件流实时推送，满足 GUI 交互需求 |
| 构建复杂度 | 中。需在 CI 中为每个平台编译 sidecar 二进制 |
| 维护成本 | 低。TypeScript 核心无需任何改造，IPC 契约是唯一新增面 |

### 方案 C：Sidecar 进程 + HTTP/WebSocket

Sidecar 启动 HTTP 服务器，前端通过 `fetch()` / `WebSocket` 直接通信。

| 维度 | 评估 |
|------|------|
| 可行性 | 高。但需解决端口冲突、防火墙提示（Windows/macOS）、localhost 安全校验 |
| 性能 | IPC 延迟 ~2-10ms（TCP），略高于 stdio |
| 构建复杂度 | 中。同方案 B |
| 维护成本 | 中。多了端口管理、健康检查、跨域配置 |

**与方案 B 对比**：HTTP 增加了端口分配和平台防火墙问题，但工具链（`curl` 调试）更友好。对于桌面应用，stdio 管道更可靠。

---

## 决策

**采用方案 B：Sidecar 进程 + JSON-RPC over stdio。**

---

## 架构

```
┌─────────────────────────────────────────────┐
│                 Tauri 进程                    │
│                                             │
│  ┌─────────────┐    invoke()    ┌─────────┐ │
│  │ React 前端   │ ←──────────→  │ Rust    │ │
│  │ (Zustand)   │    listen()   │ Commands│ │
│  └─────────────┘               └────┬────┘ │
│                                     │       │
│                              stdin/stdout   │
│                              (JSON-RPC)     │
│                                     │       │
│  ┌──────────────────────────────────┴──────┐│
│  │          Sidecar 进程                    ││
│  │   (bun build --compile 单文件)          ││
│  │                                         ││
│  │   ┌─ ConfigManager                      ││
│  │   ├─ SecretStore                        ││
│  │   ├─ ProviderRegistry                   ││
│  │   ├─ FallbackOrchestrator               ││
│  │   ├─ QuotaTracker                       ││
│  │   ├─ FeishuAdapter                      ││
│  │   └─ OpenClawAdapter ──→ openclaw 进程  ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### 数据流

**请求/响应（前端 → 后端）：**

1. React 组件调用 `invoke('ipc_request', { method, params })`
2. Rust 命令写入 sidecar stdin：`{"jsonrpc":"2.0","id":1,"method":"agent.start","params":{...}}\n`
3. Sidecar 读取 stdin，路由到对应 handler，调用 `@oneclaw/core`
4. Sidecar 写入 stdout：`{"jsonrpc":"2.0","id":1,"result":{...}}\n`
5. Rust 命令解析响应，返回给前端

**事件推送（后端 → 前端）：**

1. Sidecar 内部监听 `OpenClawAdapter.onLog()` / `.onStatusChange()` / `.onCostEvent()`
2. 事件发生时写入 stdout：`{"jsonrpc":"2.0","method":"event.log","params":{...}}\n`（无 `id` 表示通知）
3. Rust 端持续读取 stdout，识别通知消息
4. Rust 通过 `app.emit("agent-log", payload)` 发送 Tauri 事件
5. React 通过 `listen("agent-log", callback)` 接收并更新 Zustand store

### Sidecar 生命周期

| 阶段 | 行为 |
|------|------|
| 启动 | Tauri `setup()` 中通过 `tauri-plugin-shell` 的 sidecar 功能启动 |
| 就绪 | Sidecar 启动后发送 `{"jsonrpc":"2.0","method":"ready","params":{"version":"..."}}\n` |
| 运行 | 持续监听 stdin，处理请求，推送事件到 stdout |
| 关闭 | Tauri 窗口关闭时 → 发送 `shutdown` 请求 → 等 3s → SIGKILL |
| 崩溃 | Rust 端检测 sidecar 退出 → 自动重启一次 → 失败则通知用户 |

### JSON-RPC 方法命名空间

| 命名空间 | 方法示例 | 方向 |
|----------|---------|------|
| `agent.*` | `agent.start`, `agent.stop`, `agent.status`, `agent.health` | 请求/响应 |
| `config.*` | `config.get`, `config.update`, `config.reset` | 请求/响应 |
| `model.*` | `model.list`, `model.setFallbackChain`, `model.testProvider` | 请求/响应 |
| `secret.*` | `secret.set`, `secret.delete`, `secret.exists` | 请求/响应 |
| `channel.*` | `channel.feishu.setup`, `channel.feishu.test` | 请求/响应 |
| `cost.*` | `cost.summary`, `cost.history` | 请求/响应 |
| `doctor.*` | `doctor.run` | 请求/响应 |
| `event.*` | `event.log`, `event.status`, `event.cost` | 通知（服务端推送） |

### Sidecar 构建

```bash
# 开发模式：直接用 bun 运行
bun run apps/desktop/src-tauri/sidecar/main.ts

# 生产构建：编译为平台原生可执行文件
bun build apps/desktop/src-tauri/sidecar/main.ts --compile --outfile oneclaw-sidecar

# CI 矩阵（与 Tauri 构建同步）
# macOS:  oneclaw-sidecar-aarch64-apple-darwin, oneclaw-sidecar-x86_64-apple-darwin
# Windows: oneclaw-sidecar-x86_64-pc-windows-msvc.exe
# Linux:  oneclaw-sidecar-x86_64-unknown-linux-gnu
```

Tauri `tauri.conf.json` 中配置 sidecar 路径，构建时自动打包进安装包。

### 文件结构

```
apps/desktop/src-tauri/
  sidecar/
    main.ts              — 入口：stdio 读取、JSON-RPC 分发
    router.ts            — 方法路由表
    handlers/
      agent.ts           — agent.* 方法处理
      config.ts          — config.* 方法处理
      model.ts           — model.* 方法处理
      secret.ts          — secret.* 方法处理
      channel.ts         — channel.* 方法处理
      cost.ts            — cost.* 方法处理
      doctor.ts          — doctor.* 方法处理
  src/
    commands/
      mod.rs             — Tauri 命令入口
      ipc.rs             — JSON-RPC 请求转发 + 事件监听
      sidecar.rs         — Sidecar 进程管理（启动/停止/重启）
```

---

## 后果

### 正面

- **零改造成本**：`@oneclaw/core` 无需任何修改，直接 import
- **与 CLI 架构一致**：CLI 和 GUI 共享同一套核心代码路径
- **调试友好**：sidecar 可独立运行，用 stdin/stdout 手动测试
- **类型安全**：JSON-RPC 契约定义为 TypeScript 接口，前后端共享
- **平台隔离**：Rust 只做转发和事件桥接，不包含业务逻辑

### 负面

- **包体积增加**：sidecar 二进制 ~50-80MB（Bun 运行时内嵌），整体安装包 ~120-150MB
- **IPC 开销**：每次请求 ~1-5ms 延迟（JSON 序列化 + 管道传输），不影响用户感知
- **进程管理**：需在 Rust 端实现 sidecar 健康检查和崩溃恢复
- **调试两个进程**：开发时需同时关注 Tauri 和 sidecar 日志

### 风险缓解

| 风险 | 缓解措施 |
|------|---------|
| Sidecar 启动慢 | 预热：Tauri `setup()` 阶段即启动，前端显示加载状态 |
| Sidecar 崩溃 | 自动重启一次 + 用户通知 + 错误日志保留 |
| 包体积过大 | 监控 Bun 编译产物大小，考虑 `--minify` 和 tree-shaking |
| stdio 阻塞 | 使用行分隔 JSON（`\n` 分隔），异步读取 |

---

## 参考

- [Tauri 2 Sidecar](https://v2.tauri.app/develop/sidecar/) — 官方 sidecar 文档
- [Bun Build --compile](https://bun.sh/docs/bundler/executables) — 单文件可执行编译
- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification) — 协议规范
- [Agent 适配层契约](../contracts/agent-adapter.md) — 核心接口定义
- [GUI 模块计划](../modules/gui.md) — 页面和 IPC 说明
