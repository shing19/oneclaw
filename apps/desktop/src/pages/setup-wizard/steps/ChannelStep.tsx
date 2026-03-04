import { useState } from "react";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import { ipcCallSafe } from "@/ipc/client";

const TEXT = {
  title: {
    "zh-CN": "配置通信渠道",
    en: "Configure Communication Channel",
  },
  subtitle: {
    "zh-CN": "设置飞书机器人，让团队成员通过飞书与 AI Agent 交互。此步骤可跳过。",
    en: "Set up a Feishu bot so team members can interact with your AI Agent via Feishu. This step is optional.",
  },
  appIdLabel: { "zh-CN": "App ID", en: "App ID" },
  appIdPlaceholder: { "zh-CN": "飞书应用的 App ID", en: "Feishu App ID" },
  appSecretLabel: { "zh-CN": "App Secret", en: "App Secret" },
  appSecretPlaceholder: {
    "zh-CN": "飞书应用的 App Secret",
    en: "Feishu App Secret",
  },
  webhookLabel: {
    "zh-CN": "Webhook URL（可选）",
    en: "Webhook URL (optional)",
  },
  webhookPlaceholder: {
    "zh-CN": "https://open.feishu.cn/...",
    en: "https://open.feishu.cn/...",
  },
  connectBtn: { "zh-CN": "保存并连接", en: "Save & Connect" },
  connecting: { "zh-CN": "连接中...", en: "Connecting..." },
  success: {
    "zh-CN": "飞书渠道连接成功！",
    en: "Feishu channel connected successfully!",
  },
  failed: {
    "zh-CN": "连接失败，请检查凭证。",
    en: "Connection failed. Please check your credentials.",
  },
  skipHint: {
    "zh-CN": "你可以跳过此步骤，稍后在通信配置页面中设置。",
    en: "You can skip this step and configure it later in the Channel settings page.",
  },
} as const;

interface ChannelStepProps {
  language: AppLanguage;
  colors: ColorTokens;
  onConnected: (success: boolean) => void;
}

export default function ChannelStep({
  language,
  colors,
  onConnected,
}: ChannelStepProps): React.JSX.Element {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<"success" | "failed" | null>(null);

  const handleConnect = async (): Promise<void> => {
    if (!appId.trim() || !appSecret.trim()) return;
    setConnecting(true);
    setResult(null);

    const setupResult = await ipcCallSafe("channel.feishu.setup", {
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      webhookUrl: webhookUrl.trim() || undefined,
    });

    if (setupResult.ok && setupResult.data.testResult.success) {
      setResult("success");
      onConnected(true);
    } else {
      setResult("failed");
      onConnected(false);
    }
    setConnecting(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bgPrimary,
    color: colors.textPrimary,
    fontSize: typography.fontSizeBase,
    outline: "none",
    transition: `border-color ${transitions.duration} ${transitions.easing}`,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
      {/* Skip hint */}
      <div
        style={{
          fontSize: typography.fontSizeSm,
          color: colors.textSecondary,
          padding: spacing.md,
          backgroundColor: colors.bgSecondary,
          borderRadius: borderRadius.md,
        }}
      >
        {TEXT.skipHint[language]}
      </div>

      {/* App ID */}
      <div>
        <label style={labelStyle}>{TEXT.appIdLabel[language]}</label>
        <input
          type="text"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder={TEXT.appIdPlaceholder[language]}
          style={inputStyle}
        />
      </div>

      {/* App Secret */}
      <div>
        <label style={labelStyle}>{TEXT.appSecretLabel[language]}</label>
        <input
          type="password"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          placeholder={TEXT.appSecretPlaceholder[language]}
          style={inputStyle}
        />
      </div>

      {/* Webhook URL */}
      <div>
        <label style={labelStyle}>{TEXT.webhookLabel[language]}</label>
        <input
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder={TEXT.webhookPlaceholder[language]}
          style={inputStyle}
        />
      </div>

      {/* Connect button */}
      <button
        type="button"
        onClick={() => void handleConnect()}
        disabled={!appId.trim() || !appSecret.trim() || connecting}
        style={{
          padding: `${spacing.sm}px ${spacing.xl}px`,
          border: "none",
          borderRadius: borderRadius.md,
          backgroundColor:
            !appId.trim() || !appSecret.trim() || connecting
              ? colors.textDisabled
              : colors.accent,
          color: "#ffffff",
          cursor:
            !appId.trim() || !appSecret.trim() || connecting
              ? "not-allowed"
              : "pointer",
          fontSize: typography.fontSizeBase,
          fontWeight: typography.fontWeightMedium,
          transition: `all ${transitions.duration} ${transitions.easing}`,
          alignSelf: "flex-start",
        }}
      >
        {connecting ? TEXT.connecting[language] : TEXT.connectBtn[language]}
      </button>

      {/* Result feedback */}
      {result && (
        <div
          style={{
            padding: spacing.md,
            borderRadius: borderRadius.md,
            backgroundColor:
              result === "success"
                ? `${colors.success}15`
                : `${colors.error}15`,
            color: result === "success" ? colors.success : colors.error,
            fontSize: typography.fontSizeSm,
          }}
        >
          {result === "success"
            ? TEXT.success[language]
            : TEXT.failed[language]}
        </div>
      )}
    </div>
  );
}
