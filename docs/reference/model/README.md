# 国内大模型 API 定价调研

> 调研时间：2026-03-02 | 价格单位：元/百万 Tokens（除非特别注明）

## 总览对比表

| 厂商 | 旗舰模型 | 输入价格 | 输出价格 | 缓存命中价 | 免费额度 | OpenAI 兼容 API |
|------|---------|---------|---------|-----------|---------|----------------|
| **DeepSeek** | V3.1 | 4.0 | 12.0 | 0.5 | 注册送少量 | ✅ |
| **DeepSeek** | R1 | 4.0 | 16.0 | 1.0 | 同上 | ✅ |
| **阿里云百炼** | Qwen3.5-Plus | 0.8 | 2.0 | — | 100万Token | ✅ |
| **阿里云百炼** | Qwen-Max | 2.4 | 9.6 | — | 同上 | ✅ |
| **智谱 AI** | GLM-4.7 | ~5.0 | ~5.0 | — | Flash版免费 | ✅ |
| **智谱 AI** | GLM-4.5 | ~0.8 | ~0.8 | — | 同上 | ✅ |
| **月之暗面** | Kimi K2.5 | ~4.2 | ~21.0 | ~1.05 | 注册送少量 | ✅ |
| **MiniMax** | M2.5 | ~0.7 | ~9.5 | 0.21 | — | ✅ |
| **MiniMax** | Agent | 2.1 | 8.4 | 0.21 | — | ✅ |
| **字节豆包** | Doubao-pro-32k | 0.8 | 2.0 | — | 50万Token/月 | ✅ |
| **字节豆包** | Doubao-lite-32k | 0.3 | 0.6 | — | 同上 | ✅ |
| **腾讯混元** | 混元-lite | **免费** | **免费** | — | 无限 | ✅ |
| **讯飞星火** | Lite | **免费** | **免费** | — | 永久免费 | ✅ |
| **讯飞星火** | Pro/Max | ~2.1 | ~2.1 | — | — | ✅ |
| **阶跃星辰** | Step 系列 | 待确认 | 待确认 | — | — | ✅ |
| **硅基流动** | 聚合平台 | 按模型定价 | 按模型定价 | — | 注册送额度 | ✅ |

> 注：部分价格为近似换算值（美元→人民币按 7.0 汇率），实际以官方最新公告为准。

---

## 各厂商详情

### 1. DeepSeek（深度求索）

- **官网**：[deepseek.com](https://www.deepseek.com)
- **API 文档**：[api-docs.deepseek.com](https://api-docs.deepseek.com)
- **主力模型**：
  - DeepSeek-V3.1：输入 0.5（缓存）/ 4.0（未缓存），输出 12.0
  - DeepSeek-R1：输入 1.0（缓存）/ 4.0（未缓存），输出 16.0
- **夜间优惠**：00:30-08:30 V3 半价，R1 仅 25%
- **特点**：完全兼容 OpenAI API 格式，代码能力极强，性价比标杆
- **编程能力**：DeepSeek-Coder-V2（128K 上下文，338种语言）

### 2. 阿里云百炼（通义千问）

- **官网**：[百炼定价](https://help.aliyun.com/zh/model-studio/model-pricing)
- **主力模型**：
  - Qwen3.5-Plus：输入 0.8，输出 2.0 — **同级别最低**
  - Qwen-Max：输入 2.4，输出 9.6
- **Batch API**：按实时价格 50% 计费
- **免费额度**：新用户 100 万 Token
- **特点**：模型种类最全，支持阶梯计费，Coding Plan 首月 7.9 元

### 3. 智谱 AI（GLM）

- **官网**：[bigmodel.cn](https://bigmodel.cn/pricing)
- **主力模型**：
  - GLM-4.7：355B MoE，200K 上下文，~5元/百万Token
  - GLM-4.5：低至 ~0.8元/百万Token
  - GLM Flash：**免费**（含视觉能力）
- **Batch API**：50% 折扣
- **特点**：编程助手 CodeGeeX 免费，GLM Coding Plan 20 元/月起

### 4. 月之暗面（Kimi）

- **官网**：[platform.moonshot.ai](https://platform.moonshot.ai/docs/pricing/chat)
- **主力模型**：
  - Kimi K2.5：输入 $0.60（~4.2元），输出 $3.00（~21元）
  - 缓存命中 75% 折扣
- **特点**：超长上下文（128K+），K2 系列 Agentic 能力强
- **Web 搜索**：$0.005/次

### 5. MiniMax

- **官网**：[minimaxi.com/pricing](https://www.minimaxi.com/pricing)
- **主力模型**：
  - M2.5：输入 ~0.7元，输出 ~9.5元
  - Agent 模型：输入 2.1，输出 8.4，缓存 0.21
  - M1（旧版）：更便宜
- **特点**：Token 调用量国内第一，Coding Plan 29 元/月起

### 6. 字节豆包（Doubao / 火山引擎）

- **官网**：[volcengine.com](https://www.volcengine.com)
- **主力模型**：
  - Doubao-pro-32k：输入 0.8，输出 2.0
  - Doubao-lite-32k：输入 0.3，输出 0.6
  - Doubao-Seed-Code：专为编程优化
- **免费额度**：50 万 Token/月
- **特点**：火山方舟 Coding Plan 首月 8.9 元，支持 4 大编程模型

### 7. 腾讯混元

- **官网**：[cloud.tencent.com](https://cloud.tencent.com/document/product/1729/97731)
- **主力模型**：
  - 混元-lite：**完全免费**，256K 上下文
  - 其他模型低至 0.0008 元/千 Token
- **免费额度**：新用户 100 万 Token
- **特点**：lite 版永久免费，适合低成本场景

### 8. 讯飞星火

- **主力模型**：
  - Lite：**永久免费**
  - Pro/Max：低至 0.21 元/万 Token
- **特点**：中文理解能力强，教育场景优势明显

### 9. 硅基流动（SiliconFlow）

- **官网**：[siliconflow.cn/pricing](https://siliconflow.cn/pricing)
- **定位**：模型聚合平台（Model API as a Service）
- **特点**：
  - **完全兼容 OpenAI API 格式**
  - 聚合多家模型（DeepSeek、Qwen、GLM 等）
  - 注册送免费额度
  - 国产芯片华为昇腾部署

### 10. 阶跃星辰（StepFun）

- **官网**：[platform.stepfun.com](https://platform.stepfun.com/docs/pricing/details)
- **特点**：Step 系列模型，具体定价需查官网

---

## OneClaw 选型建议

### 默认推荐（性价比最优）
1. **DeepSeek V3.1** — 代码能力顶级，夜间更便宜
2. **Qwen3.5-Plus** — 0.8 元/百万 Token，极致性价比
3. **Doubao-lite** — 0.3 元/百万 Token，简单任务首选

### 免费方案
1. **腾讯混元-lite** — 永久免费
2. **讯飞星火 Lite** — 永久免费
3. **智谱 GLM Flash** — 免费含视觉

### Coding Plan（固定月费，不限 Token 焦虑）
1. **阿里云百炼** — 首月 7.9 元，18000 次请求
2. **火山方舟** — 首月 8.9 元，4 大编程模型
3. **MiniMax** — 29 元/月，无每周限额

---

## 参考链接

- [AI 排行榜 - 大模型价格对比](https://aigcrank.cn/llmprice)
- [2026 大模型 API 价格大比拼](https://www.80aj.com/2026/02/08/llm-api-price-comparison-2026/)
- [14款主流大模型 API 价格对比 - 知乎](https://zhuanlan.zhihu.com/p/19285396878)
- [2026 大模型 API 免费额度汇总 - 腾讯云](https://cloud.tencent.com/developer/article/2626756)
- [DeepSeek 官方定价](https://api-docs.deepseek.com/quick_start/pricing)
- [阿里云百炼定价](https://help.aliyun.com/zh/model-studio/model-pricing)
- [硅基流动定价](https://siliconflow.cn/pricing)
