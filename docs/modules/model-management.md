# 模块计划：模型管理

> 契约：[docs/contracts/model-config.md](../contracts/model-config.md)

---

## 范围

- 供应商注册表（预置 10 个国内供应商 + 自定义）
- Fallback 链编排
- API Key 轮换
- 额度追踪（Token 计费 + 请求数计费）
- 成本计算 + 历史记录

---

## 技术方案

### 供应商注册表

- 内置 10 个国内供应商预设（见契约中的预置供应商表）
- 每个预设包含：id、name、baseUrl、models、pricingInfo、signupUrl、setupGuide
- 用户可通过配置添加自定义供应商
- 所有供应商统一实现 `ModelProvider` 接口

### Provider 实现

- `OpenAICompatibleProvider` 基类：绝大多数国内供应商使用 OpenAI 兼容协议
- 供应商特有行为通过子类覆盖：
  - DeepSeek：夜间价格检测（00:30-08:30）
  - 火山方舟：Auto 路由模型
  - 智谱：GLM Flash 免费模型
- `chat()` 返回 `AsyncIterable<ChatChunk>`，原生支持流式

### Fallback 链

- `FallbackOrchestrator` 按 `fallbackChain` 顺序尝试
- 错误分类处理（详见契约 Fallback 行为规则表）
- 限流探测：主模型被限流后每 30s 尝试一次恢复
- 每次 fallback 触发 `FallbackEvent`，上报 Dashboard

### Key 轮换

- `KeyRotator` 类，per-provider 实例
- 429 时轮换，非 429 不轮换
- Rate-limited Key 冷却期（默认 60s，可配置）
- Key 列表去重

### 额度追踪

- `TokenQuotaTracker`：从响应中提取 token 数 × 定价 = 费用
- `RequestQuotaTracker`：纯计数，用于 Coding Plan
- 持久化存储：SQLite（时序数据友好）
- 聚合：日/周/月汇总
- 阈值告警：达到配置百分比时触发回调

### 成本计算

- 定价数据内嵌构建产物（来源：`docs/reference/model/README.md`）
- 用户可在配置中覆盖定价
- DeepSeek 夜间优惠自动识别

---

## 依赖

- **密钥存储**：获取 API Key
- **配置系统**：读取供应商配置、模型设置

## 文件清单

```
src/model/
  types.ts                         — 契约接口
  provider-registry.ts             — 注册表
  providers/
    openai-compatible.ts           — 基类
    deepseek.ts
    bailian.ts
    zhipu.ts
    minimax.ts
    kimi.ts
    volcengine.ts
    hunyuan.ts
    spark.ts
    siliconflow.ts
  fallback-orchestrator.ts
  key-rotator.ts
  quota/
    tracker.ts                     — QuotaTracker 接口实现
    token-tracker.ts
    request-tracker.ts
    storage.ts                     — SQLite 持久化
  cost-calculator.ts
  __tests__/
    fallback-orchestrator.test.ts
    key-rotator.test.ts
    quota-tracker.test.ts
    cost-calculator.test.ts
    providers/
      openai-compatible.test.ts
```

## 测试策略

- **单元测试**：Key 轮换逻辑、fallback 规则、成本计算、额度阈值
- **集成测试**：调用免费供应商（腾讯混元-lite、讯飞星火 Lite）
- **Mock 测试**：模拟 429/timeout/auth 错误，验证 fallback 行为

## 工作量估算

~3 周（1 人）

## 待定问题

- Coding Plan 剩余额度如何检测？（各供应商 API 不同）
- 定价数据是否需要运行时更新？（还是只在构建时内嵌）
