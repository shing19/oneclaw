# 国内 AI Coding Plan 编程套餐调研

> 调研时间：2026-03-02

## 一、什么是 Coding Plan

2025 年下半年起，国内大模型厂商密集推出**面向开发者的编程订阅套餐**，以固定月费替代按 Token 计费，降低 AI 编程的使用门槛和心理负担。这些套餐通常兼容 Claude Code、Cursor、Cline 等主流 AI 编程工具。

---

## 二、总览对比表

| 厂商 | 套餐 | 月费 | 首购优惠 | 请求额度 | 模型 | 支持工具 | 智能路由 |
|------|------|------|---------|---------|------|---------|---------|
| **火山方舟** | Lite | ¥40 | ¥8.9 | 1,200次/5h | Doubao-Seed-Code, GLM-4.7, DeepSeek-V3.2, Kimi-K2-Thinking | Claude Code, Cursor, Cline, Codex CLI, OpenClaw | ✅ Auto 模式 |
| **火山方舟** | Pro | ¥200 | ¥44.9 | 6,000次/5h | 同上 | 同上 | ✅ |
| **阿里云百炼** | Lite | — | ¥7.9 | 18,000次/月 | Qwen3.5-Plus, Qwen3-Coder, GLM-5, MiniMax M2.5, Kimi-K2.5 | Qwen Code, Claude Code, Cline, OpenClaw | — |
| **阿里云百炼** | Pro | — | ¥39.9 | 90,000次/月 | 同上 | 同上 | — |
| **智谱 GLM** | Lite | ¥26+ | 曾有首购优惠（2026.2 取消） | — | GLM-4.7 (355B MoE, 200K ctx) | Claude Code, Cline, Cursor, Roo Code, Kilo Code | — |
| **智谱 GLM** | Pro | ¥130+ | 同上 | — | 同上 | 同上 | — |
| **MiniMax** | Starter | ¥29 | — | 40次/5h，无每周限额 | MiniMax M2.5 | Claude Code, Cursor, Cline, Cherry Studio, OpenCode | — |
| **Kimi** | Coding | ¥49 | — | 受缓存影响大 | Kimi K2 系列 | Kimi CLI, Claude Code | — |
| **无问芯穹** | 入门 | ¥19.9 | — | 接近百炼额度 | 聚合多模型 | — | — |

---

## 三、各厂商详细分析

### 1. 火山方舟（字节跳动）

**最大优势**：多模型切换 + 智能路由

- **套餐**：Lite（¥40/月）、Pro（¥200/月）
- **首月优惠**：Lite ¥8.9，Pro ¥44.9（2.2 折）
- **额度机制**：每 5 小时重置（Lite 1,200 次，Pro 6,000 次）
- **支持模型**：
  - Doubao-Seed-Code（字节自研编程模型）
  - GLM-4.7（智谱）
  - DeepSeek-V3.2
  - Kimi-K2-Thinking（月之暗面）
- **Auto 模式**：基于"效果+速度"双维度智能匹配最优模型
- **兼容工具**：Claude Code、Cursor、Cline、Codex CLI、Kilo Code、Roo Code、OpenCode
- **实战案例**：有 [OpenClaw + 火山方舟 + 飞书实战指南](https://zhuanlan.zhihu.com/p/2004269521456875262)

**适合**：需要多模型切换、高频使用的开发者

---

### 2. 阿里云百炼

**最大优势**：额度最大 + 模型最全 + 首购最便宜

- **套餐**：Lite、Pro
- **首月优惠**：Lite ¥7.9（**全场最低**），Pro ¥39.9
- **额度机制**：月度总包（Lite 18,000 次/月，Pro 90,000 次/月）— 不按 5 小时重置
- **支持模型**：
  - Qwen3.5-Plus、Qwen3-Max、Qwen3-Coder-Next、Qwen3-Coder-Plus
  - 第三方：MiniMax M2.5、GLM-5、Kimi-K2.5
- **消耗说明**：简单任务 5-10 次调用，复杂任务 10-30+ 次
- **兼容工具**：Qwen Code、Claude Code、Cline、OpenClaw

**适合**：预算敏感、需要大额度的个人开发者

---

### 3. 智谱 GLM Coding Plan

**最大优势**：自研顶级编程模型 + CodeGeeX 生态

- **套餐**：Lite（¥26 起）、Pro（¥130 起）
- **注意**：2026 年 2 月涨价 30%，取消首购优惠
- **模型**：GLM-4.7（355B MoE，200K 上下文）
  - SWE-bench Verified、LiveCodeBench 开源国产第一
  - 编程能力对齐 Claude Sonnet 4.5
- **特点**："一次订阅，多工具通用" — 无需为每个编程工具单独付费
- **编程助手**：[CodeGeeX](https://codegeex.cn/)（免费 IDE 插件，13B 参数代码模型）
- **兼容工具**：Claude Code、Cline、Cursor、Roo Code、Kilo Code
- **性价比宣称**：约 Claude Code 官方价的 1/7，用量约 Claude Pro 的 3 倍

**适合**：追求编程质量、使用 CodeGeeX 生态的开发者

---

### 4. MiniMax Coding Plan

**最大优势**：无每周限额 + 最新模型

- **套餐**：Starter（¥29/月）
- **额度机制**：40 次/5 小时，无每周硬限制
- **模型**：MiniMax M2.5（最新，性能对齐顶级模型）
- **特点**：价格约 Claude 对应方案的 1/10
- **兼容工具**：Claude Code、Cursor、Cline、Cherry Studio、OpenCode

**适合**：需要连续使用、不想被每周限额打断的开发者

---

### 5. Kimi Coding Plan（月之暗面）

**注意：不太推荐新手**

- **月费**：¥49
- **模型**：Kimi K2 系列
- **工具**：Kimi CLI（macOS/Linux，需 uv 安装）、Claude Code
- **问题**：
  - 额度受缓存影响大，实际可用量波动
  - 工具限制较多
  - 尚处 Technical Preview 阶段

**适合**：已在使用 Kimi 生态的开发者

---

### 6. 无问芯穹（Infini）

- **月费**：¥19.9
- **定位**：聚合平台，入门档额度接近百炼
- **特点**：价格仅百炼的一半，适合预算极敏感的轻度开发者

---

## 四、编程助手/IDE 工具对比

除 Coding Plan 外，各厂商还有独立的 AI 编程助手产品：

| 产品 | 厂商 | 类型 | 价格 | 特点 |
|------|------|------|------|------|
| **通义灵码** | 阿里 | IDE 插件 | 免费 | 行级/函数级续写，单元测试生成，阿里云场景调优 |
| **MarsCode** | 字节 | IDE 插件 + 独立 IDE | 免费 | 字节内部 70% 工程师使用，月贡献百万行代码 |
| **CodeGeeX** | 智谱 | IDE 插件 | 免费 | 13B 代码模型，20+ 语言支持 |
| **文心快码** | 百度 | IDE 插件 | 免费 | 基于文心大模型 |
| **腾讯云 AI 代码助手** | 腾讯 | IDE 插件 | 免费 | 基于混元大模型 |
| **DeepSeek Coder** | 深度求索 | 模型 API | 按量付费 | 128K 上下文，338 种语言，开源 |
| **Kimi CLI** | 月之暗面 | CLI 工具 | Coding Plan | 命令行 Agent 工具 |

---

## 五、OneClaw 推荐策略

### 首选集成（性价比最优）

```
阿里云百炼 Lite (¥7.9首月) → 火山方舟 Lite (¥8.9首月)
```

两者均支持多模型，首月极低价可以让用户零成本体验。

### 推荐默认配置

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| **入门体验** | 阿里云百炼 Lite | 首月 ¥7.9，18000 次/月，最宽裕 |
| **高频开发** | 火山方舟 Pro | 多模型 Auto 路由，6000 次/5h |
| **长期使用** | MiniMax Starter | ¥29/月无每周限额，稳定 |
| **追求质量** | 智谱 GLM Pro | GLM-4.7 编程能力顶级 |
| **极致省钱** | 无问芯穹 | ¥19.9/月 |
| **免费方案** | 通义灵码 + DeepSeek API 夜间价 | 完全免费 IDE 插件 + 夜间半价 API |

### OneClaw 核心价值

1. **一键切换 Coding Plan** — 用户选择厂商后自动配置 API endpoint
2. **智能路由** — 根据任务复杂度自动选择模型（简单用 lite，复杂用 pro）
3. **成本透明** — 实时显示剩余额度和费用估算
4. **多厂商热切换** — 一个厂商额度用完自动切换到下一个

---

## 参考链接

- [2026 国内 AI Coding Plan 全对比 - 博客园](https://www.cnblogs.com/wzxNote/p/19648084)
- [国内 AI 编程 Coding Plan 深度调研 - CSDN](https://blog.csdn.net/coolyoung520/article/details/158321671)
- [码力榜 Coding Plan 对比](https://coding.iamle.com)
- [CodingPlan.org 完整指南](https://gist.github.com/junbaor/171023a696acb06968056a4e62e98255)
- [2026 国产 AI Coding Plan 省钱攻略 - 知乎](https://zhuanlan.zhihu.com/p/2011036064391915427)
- [火山方舟 Coding Plan 权益扩展](https://zhuanlan.zhihu.com/p/1994838186065691730)
- [阿里云百炼 Coding Plan](https://help.aliyun.com/zh/model-studio/coding-plan)
- [智谱 GLM Coding Plan](https://bigmodel.cn/glm-coding)
- [MiniMax Coding Plan](https://platform.minimaxi.com/docs/coding-plan/intro)
- [OpenClaw + 火山方舟实战指南](https://zhuanlan.zhihu.com/p/2004269521456875262)
- [AI 编程工具全景测评 2026 - 知乎](https://zhuanlan.zhihu.com/p/1999804779141030200)
