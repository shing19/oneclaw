# OneClaw 总体实施计划

> 从契约到产品的完整路径。4 个 Phase，16 个里程碑。

---

## 依赖关系图

```
Phase 1 — MVP（CLI + macOS/Linux）
═══════════════════════════════════

M1.0 契约定稿 + 项目脚手架
  │
  ├──→ M1.1 配置系统 + 密钥存储
  │      │
  │      ├──→ M1.2 模型管理（供应商注册 + fallback + 额度追踪）
  │      │
  │      └──→ M1.3 Agent 适配层（OpenClaw）
  │              │
  │              └──→ M1.4 CLI
  │                     │
  │                     └──→ M1.5 飞书通信渠道
  │
  └──→ M1.6 分发（npm + 安装脚本 + 国内镜像）

Phase 2 — GUI + 全平台
═══════════════════════
M2.1 Tauri + React 脚手架
  ├──→ M2.2 设置页（模型 + 通信）
  ├──→ M2.3 Dashboard（状态 + 成本 + 日志）
  ├──→ M2.4 Setup Wizard
  └──→ M2.5 Windows 支持 + 安装包

Phase 3 — 生态完善
═══════════════════
M3.1 钉钉通信渠道
M3.2 企业微信通信渠道
M3.3 自动更新机制
M3.4 技能市场设计

Phase 4 — 内核独立
═══════════════════
M4.1 自研内核原型
M4.2 适配层切换 + 兼容性测试
```

---

## Phase 1：MVP（CLI + macOS/Linux）

### M1.0 契约定稿 + 项目脚手架

- **交付物**：
  - 3 份契约文档定稿（已完成 v0）
  - TypeScript 项目初始化（monorepo: turbo/pnpm）
  - CI 流水线（lint + type check + test）
  - ESLint + Prettier 配置
- **验收标准**：`tsc --noEmit` 通过，契约类型可导入

### M1.1 配置系统 + 密钥存储

- **契约**：[secret-storage](contracts/secret-storage.md)
- **模块计划**：[config-system](modules/config-system.md)
- **交付物**：
  - 配置加载 / 保存 / 校验（JSON Schema）
  - 密钥存储（macOS Keychain + Linux Secret Service + 加密文件 fallback）
  - 配置备份 + 回滚机制
- **验收标准**：配置 round-trip 测试通过，密钥存入平台密钥库

### M1.2 模型管理

- **契约**：[model-config](contracts/model-config.md)
- **模块计划**：[model-management](modules/model-management.md)
- **交付物**：
  - ProviderRegistry + 3 个预置供应商（DeepSeek、百炼、智谱）
  - FallbackOrchestrator
  - KeyRotator
  - QuotaTracker（Token + 请求数两种模式）
- **验收标准**：通过每个供应商完成一次对话，429 时触发 fallback，额度正确显示

### M1.3 Agent 适配层

- **契约**：[agent-adapter](contracts/agent-adapter.md)
- **模块计划**：[agent-adapter](modules/agent-adapter.md)
- **交付物**：
  - OpenClaw 进程管理（spawn/stop/restart）
  - 配置翻译（OneClaw schema → openclaw.json）
  - 日志解析 + 事件流
- **验收标准**：通过适配层启停 OpenClaw，状态上报正确，日志可解析

### M1.4 CLI

- **模块计划**：[cli](modules/cli.md)
- **交付物**：
  - `oneclaw init` / `start` / `stop` / `status` / `config` / `cost` / `doctor`
  - 交互式模型配置向导
- **验收标准**：从 `oneclaw init` 到 Agent 运行的完整流程

### M1.5 飞书通信渠道

- **模块计划**：[communication](modules/communication.md)
- **交付物**：
  - 飞书机器人集成（收发消息）
  - CLI 配置向导（含权限列表一键复制）
  - 测试消息发送
- **验收标准**：消息从飞书到 Agent 并返回

### M1.6 分发（macOS + Linux）

- **模块计划**：[distribution](modules/distribution.md)
- **交付物**：
  - npm 包发布
  - 一键安装脚本（国内镜像自动检测）
  - CI release 流水线
- **验收标准**：全新 macOS 和 Ubuntu 上 clean install 成功

### Phase 1 退出标准

- [ ] 全新 macOS 用户从安装到飞书收到 Agent 消息 < 10 分钟
- [ ] 模型 fallback 在限流时自动触发
- [ ] 配置修改后重启失败自动回滚
- [ ] `oneclaw doctor` 检测并报告所有常见问题

---

## Phase 2：GUI + 全平台

### M2.1 Tauri + React 脚手架

- 项目结构、构建流程、Tauri 配置
- Ant Design 主题定制、Zustand 状态管理
- Tauri IPC 层与后端 Rust 命令

### M2.2 设置页

- 模型供应商卡片（LobeHub ModelProviderCard 风格）
- 通信渠道配置页
- 环境变量管理
- 技能列表

### M2.3 Dashboard

- Agent 状态面板（运行/停止、运行时间）
- 成本可视化（日/周/月、余额预估）
- 实时日志查看器
- 健康检查状态

### M2.4 Setup Wizard

- 全屏引导流程（vision.md 3.3 定义的 7 步）
- 供应商注册引导（带截图）
- 配置验证 + 测试消息

### M2.5 Windows 支持

- Tauri Windows 构建
- Windows Credential Manager 密钥后端
- .exe 安装包 + Scoop 支持

### Phase 2 退出标准

- [ ] GUI 完成所有 CLI 能做的操作
- [ ] macOS / Windows / Linux 均有可下载安装包
- [ ] Setup Wizard 引导全新用户完成配置

---

## Phase 3：生态完善

### M3.1 钉钉通信渠道
### M3.2 企业微信通信渠道
### M3.3 自动更新机制（国内 CDN + 断点续传 + 签名校验）
### M3.4 技能市场设计（浏览 + 一键安装）

---

## Phase 4：内核独立

### M4.1 自研内核原型
### M4.2 适配层切换 + 兼容性测试 + 独立品牌发布

---

## 风险登记

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|---------|
| OpenClaw 破坏性更新 | 适配层失效 | 中 | 锁定 OpenClaw 版本，适配层隔离 |
| 供应商 API 变更 | Provider 实现需修改 | 高 | 统一 OpenAI Compatible 协议，变更仅影响单个 Provider |
| Coding Plan 涨价/取消 | 用户成本上升 | 中 | 多供应商支持，自动切换 |
| Tauri 2.0 Windows 成熟度 | GUI 质量问题 | 低 | Phase 2 才涉及 Windows，届时 Tauri 更成熟 |
| 国内监管变化 | 功能受限 | 低 | 只做合规功能，不涉及内容审查绕过 |

---

## 待定决策

1. Monorepo 工具选择：turborepo vs nx vs pnpm workspace 纯用？
2. 配置存储：JSON 文件（config）+ SQLite（时序数据如成本历史）？
3. 域名：oneclaw.dev（国际）+ oneclaw.cn（国内）？
4. Apple Developer 账号：个人 vs 组织？
5. OpenClaw 进程管理：子进程 vs Docker 容器？
