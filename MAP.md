# OneClaw Map

> 项目导航入口。找任何东西，从这里开始。

## 什么是 OneClaw

一键安装的个人 AI Agent 平台，专为中国大陆用户设计。当前基于 OpenClaw，通过适配层解耦，未来可切换自研内核。

## 架构总览

```
用户 ─→ GUI (Tauri + React) ─┐
         CLI (Bun/Node)  ────┤
                              ↓
                     ┌─ 配置系统 (Config) ──→ 密钥存储 (SecretStore)
                     │
                     ├─ 模型管理 (Model Manager)
                     │   ├─ 供应商注册表 (Provider Registry)
                     │   ├─ Fallback 编排器
                     │   ├─ Key 轮换器
                     │   └─ 额度追踪器 (Quota Tracker)
                     │
                     ├─ Agent 适配层 (Adapter)
                     │   └─ OpenClaw 内核（当前）→ 自研内核（未来）
                     │
                     └─ 通信渠道 (Channels)
                         └─ 飞书 → 钉钉 → 企业微信
```

## 文档索引

### 规划与规范

| 文档 | 说明 |
|------|------|
| [产品愿景](docs/vision.md) | 功能规划、用户配置项、国内用户专项、视觉参考、技术选型、路线图 |
| [总体计划](docs/master-plan.md) | 4 Phase 实施计划、里程碑、依赖图、风险登记 |
| [Harness 工程规范](docs/harness.md) | 5 条 Harness 原则在本项目中的可执行规则 |

### 接口契约（实现前必须存在）

| 契约 | 定义 |
|------|------|
| [Agent 适配层](docs/contracts/agent-adapter.md) | AgentKernel 接口、生命周期、事件流、错误处理 |
| [模型配置](docs/contracts/model-config.md) | ModelProvider、QuotaTracker、FallbackOrchestrator、ProviderRegistry |
| [密钥存储](docs/contracts/secret-storage.md) | SecretStore 接口、平台后端、命名规范 |

### 模块计划

| 模块 | 计划 | Phase |
|------|------|-------|
| Agent 适配层 | [docs/modules/agent-adapter.md](docs/modules/agent-adapter.md) | 1 |
| 模型管理 | [docs/modules/model-management.md](docs/modules/model-management.md) | 1 |
| 配置系统 | [docs/modules/config-system.md](docs/modules/config-system.md) | 1 |
| CLI | [docs/modules/cli.md](docs/modules/cli.md) | 1 |
| 通信渠道 | [docs/modules/communication.md](docs/modules/communication.md) | 1 |
| 分发安装 | [docs/modules/distribution.md](docs/modules/distribution.md) | 1-3 |
| GUI | [docs/modules/gui.md](docs/modules/gui.md) | 2 |

### 调研资料

| 主题 | 文档 |
|------|------|
| OpenClaw 生态 | [docs/reference/infra/README.md](docs/reference/infra/README.md) |
| 国内模型定价 | [docs/reference/model/README.md](docs/reference/model/README.md) |
| Coding Plan 对比 | [docs/reference/coding-plan/README.md](docs/reference/coding-plan/README.md) |

## 术语表

| 术语 | 含义 |
|------|------|
| Adapter | 适配层，隔离 OneClaw 上层与底层 Agent 内核 |
| Coding Plan | 国内厂商提供的固定月费编程订阅套餐 |
| Fallback Chain | 模型优先级链，主模型不可用时自动切换备用 |
| Provider | 模型供应商（百炼、火山方舟、智谱等） |
| Quota | 用量额度，按 Token 或请求数计 |
| SecretStore | 密钥存储，API Key 等敏感信息的加密存储层 |
