# OneClaw Harness 工程规范

> 基于 [Harness Engineering](https://openai.com) 五原则，转化为本项目的可执行规则。
> 这些规则是**强制性的**，不是建议。

---

## 原则一：看不见的东西不存在

> All decisions, context, and knowledge must live in the repository.

### 规则 1.1：接口先于实现

- 每个子系统边界都有对应的契约文档（`docs/contracts/`）
- 契约包含 TypeScript 接口定义，作为类型真相源
- **契约变更必须先改文档，再改代码**

### 规则 1.2：决策记录在 repo 中

- 架构决策写在相关文档中，不留在聊天记录里
- 格式：背景 → 决策 → 后果
- 如果一个决策没有写在 repo 里，它不存在

---

## 原则二：问缺了什么能力，而非为什么失败

> When something goes wrong, instrument the environment — don't debug the output.

### 规则 2.1：每个 Phase 开始前做能力缺口分析

- 列出该阶段需要但尚未存在的抽象
- 当前已知缺口：
  - 额度追踪抽象（Quota Tracker）— 上游 OpenClaw 不提供
  - 统一供应商接口 — OpenClaw 默认 Anthropic 优先
  - 配置迁移/回滚引擎

### 规则 2.2：优先使用"无聊"的技术

- 选择稳定、文档丰富、API 稳定的技术栈
- 如果一个库的行为不可预测，考虑自己实现一个聚焦子集
- 当前选型（Tauri、React、Ant Design、Zustand）均满足此标准

---

## 原则三：机械化执行优于文档约定

> Encode constraints into code, not just docs.

### 规则 3.1：TypeScript strict 模式，禁止 `any`

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 规则 3.2：契约文档必须有对应的 TypeScript 类型

- `docs/contracts/*.md` 中的接口定义是真相源
- `src/*/types.ts` 中的类型必须与契约一致
- CI 检查类型通过：`tsc --noEmit`

### 规则 3.3：配置必须有 Schema 校验

- 所有配置文件在加载时用 JSON Schema 校验
- 非法配置 = 硬失败 + 具体字段级错误信息
- 错误信息为中文，附带修复建议

### 规则 3.4：CI 是最终裁判

- 构建通过、类型检查通过、测试通过，缺一不可
- 无绿 CI 不合并

---

## 原则四：给 Agent 装上眼睛

> Make the system's behavior visible and measurable.

### 规则 4.1：所有外部调用必须有可观测性

- 每次 API 调用记录：延迟、成功/失败、错误类型、fallback 触发
- 数据呈现在 GUI Dashboard 和 CLI `oneclaw status`

### 规则 4.2：结构化日志

- 所有日志为 JSON 格式，带 traceId
- 不用 `console.log` 裸字符串
- 敏感信息（API Key）永不出现在日志中

### 规则 4.3：持续健康检查

- 不只首次启动检查 — 运行时持续心跳检测
- 状态变化时通知用户（Dashboard 实时更新 / 飞书推送）
- `oneclaw doctor` 命令一键诊断所有问题

---

## 原则五：给地图，不给手册

> Provide concise navigation, not exhaustive documentation.

### 规则 5.1：MAP.md 是唯一入口

- MAP.md 必须在每次新增文档/模块时同步更新
- MAP.md 严格控制在 100 行以内
- 如果从 MAP.md 到不了的文档，它不存在

### 规则 5.2：每个文档自包含

- 开头 3 行内说明本文目的
- 前置依赖用链接引用，不假设读者已知
- 描述"什么不属于这里"比描述"什么属于这里"更有价值

### 规则 5.3：统一模板

- contracts：目的 → 约束 → 接口定义 → TypeScript 类型 → 错误处理
- modules：契约引用 → 范围 → 技术方案 → 依赖 → 文件清单 → 测试策略 → 工作量 → 待定问题
