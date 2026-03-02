# 模块计划：配置系统

> 契约：[docs/contracts/secret-storage.md](../contracts/secret-storage.md)（密钥存储部分）

---

## 范围

- 统一配置存储，GUI 和 CLI 共享
- JSON Schema 校验
- 变更前自动备份
- 重启失败自动回滚
- 版本历史 + 手动回滚

---

## 技术方案

### 配置文件位置

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/oneclaw/config.json` |
| Linux | `~/.config/oneclaw/config.json` |
| Windows | `%APPDATA%/oneclaw/config.json` |
| 覆盖 | `ONECLAW_CONFIG_PATH` 环境变量 |

### 配置结构

```typescript
interface OneclawConfig {
  version: number                  // schema 版本号
  general: {
    language: 'zh-CN' | 'en'
    theme: 'light' | 'dark' | 'system'
    workspace: string              // 工作目录路径
  }
  models: {
    providers: ProviderConfig[]
    fallbackChain: string[]
    defaultModel: string
    perModelSettings: Record<string, ModelSettings>
  }
  channels: {
    feishu?: FeishuConfig
    dingtalk?: DingtalkConfig
    wechatWork?: WechatWorkConfig
  }
  agent: {
    concurrency: ConcurrencySettings
    skills: SkillConfig[]
    mountPoints: MountPoint[]
    timeoutSeconds: number
  }
  automation: {
    tasks: AutomationTask[]
  }
  quotas: {
    dailyLimit?: number            // 元
    weeklyLimit?: number
    monthlyLimit?: number
    warningThreshold: number       // 百分比
  }
}
```

注：**密钥不在配置中**，通过 `credentialRef` 引用 SecretStore 中的 key。

### 备份与回滚

- **自动备份**：每次 `config.save()` 前复制到 `backups/config-{timestamp}.json`
- **保留数量**：最近 20 份（可配置）
- **失败回滚**：
  1. 配置变更 → 保存新配置
  2. 重启 Agent
  3. 如果 30s 内未启动成功 → 自动恢复上一份配置
  4. 通知用户回滚原因
- **手动回滚**：列出备份 → 选择 → 恢复

### 配置监听

- `fs.watch` 监听配置文件变更
- 外部修改时重新校验 + 通知 GUI/CLI
- 防抖 500ms 避免频繁触发

### JSON Schema 校验

- Schema 文件：`src/config/schema.json`
- 加载和保存时均校验
- 非法配置 = 硬失败 + 具体字段级中文错误信息

### Schema 迁移

- `version` 字段标识 schema 版本
- 低版本自动迁移到高版本
- 迁移函数注册表：`migrations[1→2]`、`migrations[2→3]` ...

---

## 关于存储介质

- **配置**：JSON 文件（人类可编辑、git 友好）
- **时序数据**（成本历史）：SQLite（聚合查询友好）
- SQLite 位置：与配置同目录 `data/oneclaw.db`

---

## 依赖

- **密钥存储**：配置引用密钥 key 名，不存值

## 文件清单

```
src/config/
  types.ts                         — 配置类型定义
  schema.json                      — JSON Schema
  config-manager.ts                — 加载/保存/监听
  backup-manager.ts                — 备份/回滚
  validator.ts                     — Schema 校验
  migrator.ts                      — 版本迁移
  paths.ts                         — 平台路径解析
  __tests__/
    config-manager.test.ts
    backup-manager.test.ts
    validator.test.ts
    migrator.test.ts
```

## 测试策略

- **单元测试**：校验、备份、回滚、迁移
- **集成测试**：配置变更 → 重启失败 → 自动回滚

## 工作量估算

~2 周（1 人）

## 待定问题

- SQLite vs JSON 用于成本历史数据？（当前建议：SQLite）
- 配置文件是否需要加密？（当前建议：不加密，密钥在 SecretStore 中）
