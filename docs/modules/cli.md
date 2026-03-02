# 模块计划：CLI

> CLI 是 Phase 1 的主要交互方式，与 GUI 共享同一份配置。

---

## 范围

- 命令行界面，覆盖所有 OneClaw 操作
- Phase 1 的主入口（GUI 在 Phase 2）
- 交互式向导（init、channel setup）

---

## 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 运行时 | Bun / Node.js | 与 OpenClaw 生态一致 |
| 命令解析 | Commander.js | 轻量、广泛使用 |
| 交互提示 | @inquirer/prompts | 交互式输入 |
| 输出格式化 | chalk + cli-table3 | 彩色输出 + 表格 |

---

## 命令清单

### 核心

| 命令 | 说明 |
|------|------|
| `oneclaw init` | 交互式初始化配置（Setup Wizard CLI 版） |
| `oneclaw start` | 启动 Agent（前台或守护模式） |
| `oneclaw stop` | 停止运行中的 Agent |
| `oneclaw restart` | 用最新配置重启 |
| `oneclaw status` | 显示 Agent 状态、健康、当前模型 |

### 配置

| 命令 | 说明 |
|------|------|
| `oneclaw config show` | 展示当前配置（密钥脱敏） |
| `oneclaw config set <key> <value>` | 设置配置项 |
| `oneclaw config validate` | 校验配置是否合法 |
| `oneclaw config backup` | 手动备份 |
| `oneclaw config rollback [version]` | 回滚到历史版本 |

### 模型

| 命令 | 说明 |
|------|------|
| `oneclaw model list` | 列出已配置的供应商和模型 |
| `oneclaw model test [provider]` | 测试供应商连通性 |
| `oneclaw model priority` | 查看/设置 fallback 链顺序 |

### 成本

| 命令 | 说明 |
|------|------|
| `oneclaw cost` | 今日成本摘要 |
| `oneclaw cost history [--range 7d]` | 历史成本数据 |
| `oneclaw cost export [--format csv]` | 导出成本数据 |

### 通信

| 命令 | 说明 |
|------|------|
| `oneclaw channel setup feishu` | 交互式飞书配置 |
| `oneclaw channel test [channel]` | 发送测试消息 |
| `oneclaw channel status` | 通信渠道连接状态 |

### 诊断

| 命令 | 说明 |
|------|------|
| `oneclaw doctor` | 全面健康检查 + 修复建议 |
| `oneclaw logs [--tail 50]` | 查看 Agent 日志 |
| `oneclaw version` | 版本信息 |

---

## 输出格式

- **默认**：彩色人类可读输出
- `--json`：机器可读 JSON
- `--quiet`：最少输出（脚本友好）

## 交互模式

- `oneclaw init` 和 `oneclaw channel setup` 使用交互提示
- 密钥通过交互输入，**不** 接受命令行参数
- 破坏性操作需确认提示

---

## 依赖

- 配置系统、密钥存储、模型管理、Agent 适配层、通信渠道

## 文件清单

```
src/cli/
  index.ts                         — 入口 + Commander 配置
  commands/
    init.ts
    start.ts
    stop.ts
    status.ts
    config.ts
    model.ts
    cost.ts
    channel.ts
    doctor.ts
    logs.ts
  formatters/
    table.ts
    json.ts
    status.ts
  prompts/
    init-wizard.ts
    channel-setup.ts
  __tests__/
    commands/
    formatters/
```

## 测试策略

- **单元测试**：命令解析、输出格式化
- **集成测试**：完整命令流程（mock adapter）
- **快照测试**：CLI 输出回归

## 工作量估算

- 核心命令：~2 周
- 交互向导：~1 周
