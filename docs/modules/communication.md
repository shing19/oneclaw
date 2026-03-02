# 模块计划：通信渠道

> 无独立契约，接口定义于此。

---

## 范围

- Phase 1：飞书（Feishu/Lark）机器人集成
- Phase 3：钉钉、企业微信

---

## 接口定义

```typescript
interface CommunicationChannel {
  connect(config: ChannelConfig): Promise<void>
  disconnect(): Promise<void>
  sendMessage(message: OutboundMessage): Promise<SendResult>
  onMessage(callback: (message: InboundMessage) => void): Disposable
  testConnection(): Promise<TestResult>
  getStatus(): ChannelStatus
}

interface InboundMessage {
  text: string
  sender: string
  channel: string
  timestamp: Date
  attachments?: Attachment[]
}

interface OutboundMessage {
  text: string
  format: 'plain' | 'markdown' | 'card'
  recipient?: string
}

type ChannelStatus = 'connected' | 'disconnected' | 'error'
```

---

## 飞书实现（Phase 1）

### 配置需求

- 飞书自建应用（企业内部应用）
- App ID + App Secret
- 事件订阅 Webhook URL
- 所需权限列表

### 技术方案

- 飞书 Open API v2
- 消息接收：事件订阅 → Webhook → 本地 HTTP 服务器
- 消息发送：飞书消息 API
- 富消息：飞书卡片（Interactive Card）格式，用于状态更新、成本告警

### 配置向导（CLI）

1. 提示用户登录飞书管理后台
2. 引导创建自建应用
3. 一键复制所需权限范围到剪贴板
4. 提示填入 App ID 和 App Secret
5. 自动配置 Webhook URL
6. 发送测试消息验证

### 安全

- Webhook 请求签名校验
- App Secret 存入 SecretStore
- 定期刷新 access token

---

## 钉钉实现（Phase 3）

### 与飞书差异

- 钉钉自定义机器人 API
- 安全方式：签名模式 或 IP 白名单
- 消息格式：Markdown、ActionCard

---

## 企业微信实现（Phase 3）

### 与飞书差异

- 企业微信机器人 API
- 消息类型：text、markdown、image、file
- 回调 URL 需要加密/解密

---

## 依赖

- **密钥存储**：App Secret、Webhook Token
- **配置系统**：渠道配置
- **Agent 适配层**：接收 Agent 输出用于转发

## 文件清单

```
src/channels/
  types.ts                         — 接口定义
  feishu/
    client.ts                      — 飞书 API 客户端
    message-formatter.ts           — 消息格式转换
    webhook-server.ts              — 事件接收 HTTP 服务
    setup-wizard.ts                — CLI 配置向导
  dingtalk/                        — Phase 3
  wechat-work/                     — Phase 3
  __tests__/
    feishu/
      client.test.ts
      message-formatter.test.ts
```

## 测试策略

- **单元测试**：消息格式化、配置校验
- **集成测试**：飞书沙箱环境测试
- **Mock 测试**：Webhook endpoint 模拟器

## 工作量估算

- 飞书：~2 周
- 钉钉：~1.5 周（模式已建立）
- 企业微信：~1.5 周

## 参考

- 现有钉钉插件：[soimy/openclaw-channel-dingtalk](https://github.com/soimy/openclaw-channel-dingtalk)
