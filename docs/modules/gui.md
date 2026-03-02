# 模块计划：GUI

> 视觉参考：[LobeHub (LobeChat)](https://github.com/lobehub/lobehub)
> 差异化定位：Agent 管理 Dashboard，非聊天界面。

---

## 范围

- 桌面应用：Tauri 2.0 壳 + React 前端
- 核心页面：Dashboard、模型配置、通信配置、设置、Setup Wizard

---

## 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 桌面壳 | Tauri 2.0 | 跨平台、轻量、安全沙箱 |
| 前端框架 | React + TypeScript | 生态成熟 |
| 组件库 | Ant Design + 自定义主题 | 参考 @lobehub/ui |
| 状态管理 | Zustand | 轻量、乐观更新 |
| 动效 | Motion/React | 流畅原生感 |
| IPC | Tauri invoke API | 前端 ↔ Rust 后端 |

---

## 布局架构

```
┌──────────────────────────────────────────────────┐
│ ┌──┐ ┌──────────┐ ┌────────────────────────────┐ │
│ │  │ │          │ │                            │ │
│ │图│ │  侧边栏   │ │       主内容区              │ │
│ │标│ │ (~240px) │ │                            │ │
│ │栏│ │          │ │                            │ │
│ │  │ │          │ │                            │ │
│ │48│ │          │ │                            │ │
│ │px│ │          │ │                            │ │
│ └──┘ └──────────┘ └────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- **左侧图标栏**：Dashboard / 模型 / 通信 / 设置
- **侧边栏**：当前页面的子导航（可折叠）
- **主内容区**：当前视图

---

## 页面清单

### Dashboard（首页）

- Agent 状态卡片（运行/停止、运行时长、活跃 Agent 数）
- 成本可视化面板：
  - API Key 用户：消耗金额（日/周/月）
  - Coding Plan 用户：余额百分比 + 预计耗尽时间
- 最近活动日志（最近 20 条）
- 快捷操作：启动/停止 Agent、打开配置

### 模型配置

- 供应商卡片列表（LobeHub ModelProviderCard 风格）
  - Logo、名称、状态指示灯
  - 展开：API Key 输入（脱敏）、Endpoint 配置、模型列表开关
- Fallback 链：拖拽排序
- Per-model 高级设置（抽屉/手风琴面板）
- 内联定价参考

### 通信配置

- 飞书配置向导（分步引导 + 截图）
- 连接状态指示
- 测试消息按钮
- Future：钉钉/企业微信 tab

### 设置

- 通用：语言、主题、工作目录
- 安全：密钥库状态、重加密
- 自动化：任务列表、cron 表达式
- 关于：版本、更新检查、反馈

### Setup Wizard（首次运行）

- 全屏覆盖引导
- 7 步流程（vision.md 3.3 定义）
- 进度指示、跳过按钮、返回导航

---

## Tauri 集成

- **Rust 命令**：进程管理、文件系统、密钥存储
- **IPC**：Tauri invoke（前端调 Rust）
- **实时数据**：Tauri event（后端推送状态/日志到前端）

## 状态管理

- Zustand stores：`agentStore`、`modelStore`、`configStore`、`costStore`
- 配置变更使用乐观更新
- 后端状态通过 Tauri event 实时推送

## 主题系统

- 深色/浅色模式，跟随系统
- Ant Design theme token 定制
- CSS 自定义属性，运行时切换

---

## 依赖

- 所有其他模块（GUI 是集成层）

## 文件清单

```
src-tauri/                         — Rust 后端
  src/
    main.rs
    commands/                      — Tauri 命令
src/                               — React 前端
  app/                             — 入口
  pages/
    dashboard/
    model-config/
    channel-config/
    settings/
    setup-wizard/
  components/                      — 共享 UI 组件
  stores/                          — Zustand stores
  hooks/                           — 自定义 hooks
  theme/                           — Ant Design 主题配置
```

## 测试策略

- **组件测试**：React Testing Library
- **E2E**：Playwright 或 Tauri WebDriver
- **视觉回归**：截图对比（可选，v0 不做）

## 工作量估算

- 脚手架 + 布局：1 周
- Dashboard + 成本面板：2 周
- 模型配置页：2 周
- 通信配置 + 向导：1.5 周
- 设置 + Setup Wizard：1.5 周
- 主题打磨：1 周
- **合计：~9 周**
