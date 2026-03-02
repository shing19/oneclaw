# OneClaw 产品愿景

> 一键安装、无忧享用的个人 AI Agent 平台，专为中国大陆用户设计。
> 本文档持续迭代中。

---

## 一、架构原则

### 1.1 内核可替换

- 当前内核：OpenClaw（开源版）
- 所有对 OpenClaw 的修改**不直接改源码**，而是通过适配层（adapter/wrapper）实现
- 未来替换为自研 Agent 内核时，只需重写适配层，上层配置/UI/通信全部复用
- 适配层接口设计应提前定义清楚，作为内核契约

### 1.2 全平台支持

- macOS（Intel + Apple Silicon）
- Windows（x64 + ARM）
- Linux（x64 + ARM，含常见发行版）
- 安装方式：
  - **Release 安装包**：`.dmg` / `.exe` / `.AppImage` / `.deb`
  - **包管理器**：`bun install -g oneclaw` / `brew install oneclaw`
  - **Docker**：`docker run oneclaw`（面向服务器部署场景）

### 1.3 双交互模式

- **GUI**：图形化管理界面（配置、状态监控、日志查看）
- **CLI**：命令行交互（开发者友好，支持脚本化）
- 两者共享同一份配置，任意入口修改都实时同步

---

## 二、用户可配置项

### 2.1 模型配置

- **接入方案选择**：
  - Coding Plan（固定月费，选厂商即可）
  - API Key（按量付费，填 key 即用）
  - 自定义 OpenAI Compatible endpoint（自建或第三方中转）
- **供应商选择**：
  - 预置国内厂商列表（百炼、火山方舟、智谱、MiniMax、Kimi、DeepSeek...）
  - 每个厂商带有：官方链接、注册引导、当前定价参考
  - 支持自定义添加任意 OpenAI Compatible 供应商
- **模型优先级**：
  - 用户拖拽排序，设定默认模型和 fallback 链
  - 例：DeepSeek V3 → Qwen3.5-Plus → GLM-4.5（逐个 fallback）
- **高级选项**（参考 OpenClaw `openclaw.json` 配置体系，per-model 粒度）：
  - **生成参数**：
    - `temperature`：随机性（0-2）
    - `maxTokens`：最大输出 Token 数
    - `thinking`：推理深度（off / minimal / low / medium / high / xhigh / adaptive），推理模型默认 low，非推理默认 off
  - **网络与传输**：
    - `timeout`：单次请求超时（秒）
    - `transport`：流式传输方式（sse / websocket / auto）
    - `streaming`：是否启用流式响应
  - **缓存策略**：
    - `cacheRetention`：提示词缓存（none / short / long），适用于支持 prompt caching 的厂商（百炼、DeepSeek 等）
  - **并发控制**：
    - Agent 最大并发数（默认 4）
    - 子 Agent 并发（默认 8）、嵌套深度（1-5）、单 Agent 最大子任务数（1-20）
  - **API Key 轮换**：
    - 同一供应商可填多个 Key，429 限流时自动轮换
    - 非限流错误不轮换，直接报错
  - **Fallback 行为**：
    - 上下文溢出不触发 fallback（更小的模型只会更差）
    - 限流时每 30 秒探测主模型恢复状态
    - 认证/计费异常直接跳过该供应商
  - **自定义供应商**：
    - `baseUrl` + `apiKey` + API 协议（openai-completions / openai-responses / anthropic-messages / ollama）
    - 自定义模型列表（ID、名称、上下文窗口、是否推理、输入模态）
    - 自定义 HTTP Headers

### 2.2 通信渠道

- **当前支持**：飞书
- **规划中**：钉钉、企业微信
- **配置引导**：
  - 步骤式教程（带截图），引导用户创建机器人、获取密钥
  - 一键复制所需权限列表（如飞书自建应用的权限范围）
  - 配置完成后自动发送测试消息验证连通性

### 2.3 技能管理

- 列出已安装技能，显示说明和状态
- 用户可手动编辑技能配置
- 支持启用/禁用单个技能
- （未来）技能市场：在线浏览和一键安装社区技能

### 2.4 环境变量

- 第三方服务的 URL / 密钥管理（网页搜索、图片生成等）
- 分类展示，标注必填/可选
- 敏感信息加密存储，界面上脱敏显示

### 2.5 挂载目录

- 用户选择本地路径，挂载到 Agent 运行空间
- Agent 只能访问挂载的目录，无法触及系统其他文件
- 可配置只读/读写权限
- 默认挂载用户 home 下的 `~/oneclaw-workspace/`

### 2.6 自动化任务

- 查看、启用/禁用自动化任务列表
- 每个任务显示：触发条件、执行频率、上次执行时间、状态
- 支持 cron 表达式或自然语言设定触发时间

### 2.7 配置安全机制

- 配置更新前自动备份当前配置
- 重启服务应用新配置
- 重启失败自动回滚到备份
- 保留最近 N 份配置历史，支持手动回滚到任意版本

---

## 三、国内用户专项

### 3.1 运行时零外网依赖

- **所有 API 调用走国内 endpoint**，不依赖任何需要翻墙的服务
- **首次启动连通性检查**：
  - 自动测试所有已配置的 API endpoint 是否可达
  - 不可达的标红提示 + 给出排查建议
  - 如果全部不可达，引导用户检查网络或切换供应商

### 3.2 自动更新机制

- 支持手动检查更新 + 自动后台检查
- 下载更新包用断点续传（国内网络不稳定）
- 更新失败不影响当前运行版本
- 显示更新日志

### 3.3 一键引导式设置（Setup Wizard）

> 目标用户可能不知道什么是 API Key，什么是 Coding Plan。

- **首次启动**进入引导流程：
  1. 选择语言（默认中文）
  2. 选择使用场景（个人编程助手 / 团队协作 / 自动化任务）
  3. 选择模型方案 — 用大白话解释：
     - 「按月付费，不限次数焦虑」→ Coding Plan
     - 「用多少算多少」→ API Key
     - 「先免费试试」→ 腾讯混元-lite / 讯飞星火 Lite
  4. 跳转到所选厂商的注册页面，带步骤截图引导
  5. 填入配置信息，自动验证
  6. 配置通信渠道（可跳过）
  7. 发送一条测试消息确认一切正常
- **每一步都可以跳过**，后续从设置页补充

### 3.4 成本可视化

> 国内用户对费用极其敏感，「不知道用了多少钱」是最大焦虑。

- **实时用量面板**：
  - 今日/本周/本月已用次数和估算费用
  - Coding Plan 用户显示剩余额度百分比 + 预计耗尽时间
  - API Key 用户显示已消耗金额
- **费用预警**：
  - 可设置日/周/月费用上限，达到后暂停调用并通知用户
  - Coding Plan 额度低于 20% 时提醒
- **账单历史**：按日汇总，可导出

### 3.5 错误信息本地化

- 所有错误信息中文展示，附带解决建议
- 常见错误场景预设方案：
  - `ECONNREFUSED` → 「无法连接到模型服务，请检查网络或更换供应商」
  - `401 Unauthorized` → 「API Key 无效，请前往设置页重新填写」
  - `429 Rate Limited` → 「请求频率超限，正在自动切换到备用模型...」
  - `ETIMEDOUT` → 「连接超时，可能是网络波动，正在重试...」
- 错误日志支持一键复制，方便用户反馈

### 3.6 社区与支持

- 中文文档站（部署在国内可达的域名）
- 用户交流渠道：微信群 / 飞书群 / QQ 群
- 常见问题 FAQ（内置到应用中，离线可查）
- 问题反馈：应用内一键提交（自动附带系统信息 + 脱敏日志）

---

## 四、视觉与交互参考

> 视觉风格参考 [LobeHub (LobeChat)](https://github.com/lobehub/lobehub) — 开源 AI 界面设计标杆，72K+ Stars。

### 4.1 借鉴的设计语言

- **现代极简风**：大量留白、流畅动效、自适应布局，体感接近原生应用
- **三栏布局**：
  - 左侧窄图标栏（~48px）— 功能区切换（聊天、Agent、设置）
  - 可折叠侧边栏（~240px）— 会话列表 / Agent 列表 / 设置导航
  - 主内容区 — 聊天窗口 / 配置表单 / 状态面板
- **主题系统**：多套主题色 + 多级灰度 + 自动跟随系统深浅模式
- **供应商卡片（ModelProviderCard）**：每个供应商独立卡片，含 logo、API Key 输入、endpoint 配置、模型列表开关

### 4.2 OneClaw 差异化交互

| LobeChat | OneClaw |
|----------|---------|
| 面向聊天对话的 UI | 面向 Agent 管理 + 运维监控的 Dashboard |
| 50+ 供应商平铺 | 精选国内供应商，带注册引导和定价参考 |
| 英文优先 | 原生中文，零英文暴露 |
| 纯 Web 应用 | 桌面客户端（Tauri）+ Web 双形态 |
| 无成本概念 | 成本可视化作为核心面板 |

---

## 五、技术选型方向（待定）

> 以下仅为初步思考，具体技术栈待后续讨论确定。

| 层 | 候选方案 | 备注 |
|----|---------|------|
| GUI | Tauri 2.0 (Rust + Web) | 跨平台、轻量、安全 |
| 前端框架 | React + TypeScript | 与 LobeHub 生态一致，组件可复用 |
| 组件库 | Ant Design + 自定义主题 | 参考 LobeHub 的 `@lobehub/ui` |
| 状态管理 | Zustand | 轻量、支持乐观更新 |
| 动效 | Motion/React (Framer Motion) | 流畅的原生感动效 |
| CLI | Node.js / Bun | 与 OpenClaw 生态一致 |
| 配置存储 | SQLite / JSON 文件 | 轻量、无外部依赖 |
| Agent 内核 | OpenClaw（当前）→ 自研（未来） | 通过适配层解耦 |
| 打包分发 | Tauri bundler + GitHub Actions | 自动构建全平台安装包 |
| 国内分发 | 阿里云 OSS + CDN | Release 镜像 |

---

## 六、路线图草案

### Phase 1 — MVP（最小可用）

- [ ] OpenClaw 适配层设计与实现
- [ ] CLI 版本：模型配置 + 飞书通信 + 基础技能
- [ ] 支持 macOS + Linux
- [ ] 国内安装链路（npmmirror / 国内 CDN）

### Phase 2 — GUI + 全平台

- [ ] Tauri GUI 实现（设置页 + 状态面板 + 日志）
- [ ] Windows 支持
- [ ] Setup Wizard 引导流程
- [ ] 成本可视化面板

### Phase 3 — 生态完善

- [ ] 钉钉 / 企业微信通信渠道
- [ ] 技能市场
- [ ] 自动更新机制
- [ ] 社区建设（文档站 + 交流群）

### Phase 4 — 内核替换

- [ ] 自研 Agent 内核开发
- [ ] 适配层切换
- [ ] 性能与功能对齐 OpenClaw
- [ ] 独立品牌发布

---

## 参考

- [调研：OpenClaw 生态](./reference/infra/README.md)
- [调研：国内模型定价](./reference/model/README.md)
- [调研：Coding Plan 对比](./reference/coding-plan/README.md)
- [LobeHub (LobeChat)](https://github.com/lobehub/lobehub) — 视觉与交互参考
- [OpenClaw 配置文档](https://docs.openclaw.ai/concepts/model-providers) — 模型配置参考
