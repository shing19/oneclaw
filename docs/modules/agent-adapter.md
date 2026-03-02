# 模块计划：Agent 适配层

> 契约：[docs/contracts/agent-adapter.md](../contracts/agent-adapter.md)

---

## 范围

- OpenClaw 进程管理（spawn / monitor / kill）
- 配置翻译（OneClaw schema → openclaw.json）
- 日志解析 + 结构化事件输出
- 事件流（状态变化、成本事件）
- 健康检查

---

## 技术方案

### 进程管理

- `child_process.spawn` 启动 OpenClaw 主进程
- stdout/stderr 通过 readline 逐行解析
- 优雅关闭：SIGTERM → 5s 超时 → SIGKILL
- 自动重启策略：崩溃后重启一次，再崩溃通知用户
- 进程心跳：每 10s 检查进程存活

### 配置翻译

- 输入：OneClaw `AgentConfig`（来自配置系统）
- 输出：OpenClaw `openclaw.json` 写入临时目录
- 映射关系：
  - `modelConfig` → `agents.defaults.model` + `agents.defaults.models`
  - `concurrency` → `agents.defaults.maxConcurrent` + `subagents`
  - `skills` → OpenClaw skills 配置
  - `workspacePaths` → 工作目录参数
- API Key 通过环境变量注入（`DEEPSEEK_API_KEY` 等），不写入配置文件

### 日志解析

- OpenClaw 日志格式识别（JSON 行 / 纯文本）
- 提取字段：模型名称、Token 用量、请求延迟、错误码、fallback 事件
- 输出为 `LogEntry` 和 `CostEvent`

---

## 依赖

- **配置系统**：读取 OneClaw 配置
- **密钥存储**：获取 API Key 注入环境变量
- **模型配置契约**：翻译模型设置

## 文件清单

```
src/adapter/
  types.ts                 — 契约中的 TypeScript 接口
  openclaw-adapter.ts      — AgentKernel 实现
  config-translator.ts     — 配置 schema 映射
  log-parser.ts            — 日志行解析
  process-manager.ts       — 子进程生命周期
  __tests__/
    config-translator.test.ts
    log-parser.test.ts
    process-manager.test.ts
```

## 测试策略

- **单元测试**：配置翻译、日志解析（mock OpenClaw 输出）
- **集成测试**：启停 OpenClaw 进程，验证状态事件
- **契约测试**：适配器满足 `AgentKernel` 接口（类型检查）

## 工作量估算

~2 周（1 人）

## 待定问题

- OpenClaw 是否暴露 HTTP API？还是只有 CLI + stdout？
- 目标锁定的 OpenClaw 版本号？
- 进程管理 vs Docker 容器管理（Phase 1 先用进程）？
