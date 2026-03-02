# OpenClaw 及类似项目调研

> 调研时间：2026-03-02

## 一、OpenClaw 是什么

[OpenClaw](https://github.com/openclaw/openclaw)（原名 Clawdbot / Moltbot）是由 Peter Steinberger 开发的**开源自主 AI Agent 平台**。

- **GitHub Stars**：160K+（2026年2月，GitHub 史上增长最快的项目之一）
- **核心定位**：可自托管的个人 AI 代理 + 自动化平台
- **功能**：执行终端命令、读写文件、运行代码、控制浏览器、聊天机器人
- **消息平台集成**：Signal、Telegram、Discord、WhatsApp、钉钉
- **模型支持**：Claude、DeepSeek、OpenAI GPT 等
- **部署方式**：本地运行，自托管，数据完全自控

**安全争议**：安全研究者称 OpenClaw 是"安全噩梦"，拥有过于广泛的系统权限，催生了大量更安全的替代方案。

---

## 二、主要替代项目

### 2.1 NanoClaw
- **GitHub**: [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw)
- **定位**：安全优先的轻量替代
- **特点**：
  - 运行在容器中，隔离环境，最小攻击面
  - 基于 Anthropic Agent SDK
  - 支持 WhatsApp、内存管理、定时任务
  - 可通过 Claude Code 动态重写自身代码
- **官网**：[nanoclaw.net](https://nanoclaw.net/)

### 2.2 Nanobot
- **GitHub**: [HKUDS/nanobot](https://github.com/HKUDS/nanobot)
- **定位**：超轻量 OpenClaw（~4,000 行 Python，比 OpenClaw 小 99%）
- **特点**：
  - 港大出品，猫猫 🐈 品牌
  - 核心功能：工具调用、记忆、消息自动化
  - **支持国内 LLM**：智谱、MiniMax、火山引擎，可配置国内 API base
  - 易于理解和扩展

### 2.3 ZeroClaw
- **定位**：极致轻量
- **特点**：Rust 编写，<5MB RAM，$10 硬件即可运行

### 2.4 Moltworker
- **定位**：Cloudflare 官方适配版
- **特点**：运行在 Cloudflare Workers 沙箱中，无本地系统访问权限，零安全风险

### 2.5 TrustClaw
- **定位**：安全云操作
- **特点**：适合需要云端安全操作的场景

### 2.6 memU Bot
- **定位**：长期运行 + 记忆优化
- **特点**：缓存洞察以降低长期上下文成本

---

## 三、中国大陆相关项目

### 3.1 OpenClaw 中文版
- **GitHub**: [MaoTouHU/OpenClawChinese](https://github.com/MaoTouHU/OpenClawChinese)
- **特点**：OpenClaw 汉化版，每小时自动同步上游，CLI + Dashboard 全中文

### 3.2 OpenClaw Manager（桌面管理工具）
- **GitHub**: [miaoxworld/openclaw-manager](https://github.com/miaoxworld/openclaw-manager)
- **技术栈**：Tauri 2.0 + React + TypeScript + Rust
- **特点**：
  - 可视化仪表盘（服务状态、内存、端口）
  - 一键启停重启
  - 可视化配置 AI 模型和消息渠道
  - 跨平台（macOS/Windows/Linux）

### 3.3 OpenClaw Installer（一键部署）
- **GitHub**: [miaoxworld/OpenClawInstaller](https://github.com/miaoxworld/OpenClawInstaller)
- **特点**：ClawdBot 一键部署工具，Docker 化部署

### 3.4 Claude Relay Service (CRS)
- **GitHub**: [Wei-Shaw/claude-relay-service](https://github.com/Wei-Shaw/claude-relay-service)
- **定位**：自建 Claude Code 镜像 + 开源中转服务
- **特点**：
  - 统一接入 Claude / OpenAI / Gemini / Droid
  - 支持拼车共享，分摊成本
  - 多账户管理、API Key 认证、代理配置、LDAP
  - ⚠️ v1.1.248 及以前有严重认证绕过漏洞，需升级到 v1.1.249+
  - 下一代项目：[Sub2API (CRS 2.0)](https://github.com/Wei-Shaw/sub2api)

### 3.5 GAC Claude Code 镜像站
- **定位**：国内直连的 Claude Code 镜像安装方案
- **安装方式**：
  ```bash
  npm install -g https://gaccode.com/claudecode/install --registry=https://registry.npmmirror.com
  ```
- **特点**：无需翻墙，直接使用

### 3.6 Claude Code 中文指南
- **GitHub**: [KimYx0207/Claude-Code-x-OpenClaw-Guide-Zh](https://github.com/KimYx0207/Claude-Code-x-OpenClaw-Guide-Zh)
- **内容**：21 篇教程，130,000+ 字，从零到企业实战

### 3.7 钉钉渠道插件
- **GitHub**: [soimy/openclaw-channel-dingtalk](https://github.com/soimy/openclaw-channel-dingtalk)
- **特点**：OpenClaw 的钉钉机器人渠道插件

### 3.8 ClawWork
- **GitHub**: [HKUDS/ClawWork](https://github.com/HKUDS/ClawWork)
- **标语**："OpenClaw as Your AI Coworker - $10K earned in 7 Hours"

---

## 四、OneClaw 差异化方向

| 维度 | 现有方案的痛点 | OneClaw 机会 |
|------|---------------|-------------|
| **安装门槛** | OpenClaw 配置复杂，CRS 需要自建服务器 | 一键安装脚本，零配置开箱即用 |
| **网络问题** | 国内访问 Anthropic API 需翻墙 | 内置国内 LLM 提供商，无需翻墙 |
| **模型选择** | 用户需自己研究各厂商 API | 预置最优性价比模型配置，智能路由 |
| **安全性** | OpenClaw 权限过大，CRS 曾有漏洞 | 容器隔离 + 最小权限原则 |
| **成本** | Claude API 费用高 | 集成国内 Coding Plan，月费低至 7.9 元 |
| **中文体验** | 汉化版仅翻译 UI，未做深度本地化 | 原生中文设计，文档/错误信息/社区全中文 |

---

## 参考链接

- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [OpenClaw 替代方案对比 - KDnuggets](https://www.kdnuggets.com/5-lightweight-and-secure-openclaw-alternatives-to-try-right-now)
- [OpenClaw 替代方案 2026 - SuperPrompt](https://superprompt.com/blog/best-openclaw-alternatives-2026)
- [Claude Code 国内使用指南 - 知乎](https://zhuanlan.zhihu.com/p/1923751642848819173)
- [Claude Code 国内使用完整指南 - 知乎](https://zhuanlan.zhihu.com/p/1951793740248245774)
- [Claude Code 低成本使用 - 博客园](https://www.cnblogs.com/javastack/p/19056340)
- [OpenClaw GitHub 增长史 - 声网](https://www.shengwang.cn/blog/blogdetail/openclaw/)
