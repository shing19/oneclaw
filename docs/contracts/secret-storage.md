# 契约：密钥存储

> 安全存储 API Key、Token、Webhook Secret 等敏感信息。平台原生后端优先，加密文件兜底。

---

## 设计约束

- 密钥 **永不** 写入明文配置文件
- 密钥 **永不** 出现在日志中（即使 debug 级别）
- GUI 显示脱敏值（如 `sk-****7f3a`）
- CLI 通过交互式 prompt 输入密钥，**永不** 接受命令行参数传入

---

## 接口定义

### SecretStore

```typescript
interface SecretStore {
  set(key: string, value: string): Promise<void>
  get(key: string): Promise<string | null>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
  list(): Promise<string[]>      // 只返回 key 名称，不返回值
}
```

### Key 命名规范

格式：`oneclaw/{category}/{identifier}`

```
oneclaw/provider/deepseek/api-key-1
oneclaw/provider/deepseek/api-key-2
oneclaw/provider/bailian/api-key
oneclaw/channel/feishu/app-secret
oneclaw/channel/feishu/webhook-token
oneclaw/service/search/api-key
```

---

## 平台后端

| 平台 | 后端 | 库 |
|------|------|-----|
| macOS | Keychain | Tauri plugin / node-keytar |
| Windows | Credential Manager | wincred |
| Linux | Secret Service API (GNOME Keyring / KDE Wallet) | libsecret |
| Fallback | AES-256-GCM 加密 JSON 文件 | Node.js crypto |

### Fallback 加密文件

- 存储位置：`{configDir}/secrets.enc`
- 加密算法：AES-256-GCM
- 密钥派生：PBKDF2(machine-id + user-password, 100000 iterations)
- 首次使用时提示用户设置密码
- 密码丢失 = 密钥丢失（无法恢复，需重新填入所有 Key）

---

## 迁移

```typescript
interface SecretMigration {
  migrate(from: SecretStore, to: SecretStore): Promise<MigrationReport>
}

interface MigrationReport {
  total: number
  migrated: number
  failed: string[]               // 失败的 key 名称
}
```

- 场景：用户从 Linux（GNOME Keyring）切换到加密文件，或版本升级更换加密方案

---

## 错误类型

```typescript
type SecretStoreErrorCode =
  | 'STORE_UNAVAILABLE'          // 平台后端不可用
  | 'SECRET_NOT_FOUND'           // Key 不存在
  | 'DECRYPTION_FAILED'          // 加密文件损坏或密码错误
  | 'PERMISSION_DENIED'          // 无权访问系统密钥库

interface SecretStoreError extends Error {
  code: SecretStoreErrorCode
}
```

---

## 审计

- 所有密钥访问操作记录：key 名称、操作类型（get/set/delete）、时间戳
- **永不** 记录 value
- 审计日志可通过 `oneclaw doctor` 查看
