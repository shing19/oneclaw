import { useState } from "react";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import { ipcCallSafe } from "@/ipc/client";

const TEXT = {
  description: {
    "zh-CN": "发送一条测试消息，确认所有配置正常工作。",
    en: "Send a test message to confirm everything is working correctly.",
  },
  messageLabel: { "zh-CN": "测试消息内容", en: "Test Message" },
  defaultMessage: {
    "zh-CN": "你好！这是 OneClaw 的测试消息 🎉",
    en: "Hello! This is a test message from OneClaw 🎉",
  },
  sendBtn: { "zh-CN": "发送测试消息", en: "Send Test Message" },
  sending: { "zh-CN": "发送中...", en: "Sending..." },
  success: {
    "zh-CN": "测试消息发送成功！消息 ID：",
    en: "Test message sent successfully! Message ID: ",
  },
  failed: {
    "zh-CN": "发送失败，请检查通信渠道配置。",
    en: "Failed to send. Please check your channel configuration.",
  },
  noChannel: {
    "zh-CN": "未配置通信渠道，跳过测试消息。你可以稍后在通信配置页面中测试。",
    en: "No communication channel configured. You can test later in the Channel settings page.",
  },
  allDone: {
    "zh-CN": "设置完成！",
    en: "Setup Complete!",
  },
  allDoneDesc: {
    "zh-CN": "OneClaw 已准备就绪。点击「完成」开始使用。你可以随时在设置页面调整配置。",
    en: "OneClaw is ready to go. Click \"Finish\" to start using it. You can adjust settings anytime.",
  },
} as const;

interface TestStepProps {
  channelConfigured: boolean;
  language: AppLanguage;
  colors: ColorTokens;
}

export default function TestStep({
  channelConfigured,
  language,
  colors,
}: TestStepProps): React.JSX.Element {
  const [message, setMessage] = useState<string>(TEXT.defaultMessage[language]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    messageId?: string;
  } | null>(null);

  const handleSend = async (): Promise<void> => {
    setSending(true);
    setResult(null);

    const sendResult = await ipcCallSafe("channel.feishu.sendTest", {
      message: message.trim(),
    });

    if (sendResult.ok && sendResult.data.success) {
      setResult({
        success: true,
        messageId: sendResult.data.messageId,
      });
    } else {
      setResult({ success: false });
    }
    setSending(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
      {/* Completion badge */}
      <div
        style={{
          textAlign: "center",
          padding: spacing.xl,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: spacing.md }}>🎉</div>
        <div
          style={{
            fontSize: typography.fontSizeXl,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
            marginBottom: spacing.sm,
          }}
        >
          {TEXT.allDone[language]}
        </div>
        <div
          style={{
            fontSize: typography.fontSizeBase,
            color: colors.textSecondary,
          }}
        >
          {TEXT.allDoneDesc[language]}
        </div>
      </div>

      {/* Test message section */}
      {channelConfigured ? (
        <div
          style={{
            padding: spacing.lg,
            border: `1px solid ${colors.borderLight}`,
            borderRadius: borderRadius.lg,
            display: "flex",
            flexDirection: "column",
            gap: spacing.md,
          }}
        >
          <div
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textSecondary,
            }}
          >
            {TEXT.description[language]}
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: typography.fontSizeSm,
                fontWeight: typography.fontWeightMedium,
                color: colors.textPrimary,
                marginBottom: spacing.xs,
              }}
            >
              {TEXT.messageLabel[language]}
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                width: "100%",
                padding: `${spacing.sm}px ${spacing.md}px`,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.md,
                backgroundColor: colors.bgPrimary,
                color: colors.textPrimary,
                fontSize: typography.fontSizeBase,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!message.trim() || sending}
            style={{
              padding: `${spacing.sm}px ${spacing.xl}px`,
              border: "none",
              borderRadius: borderRadius.md,
              backgroundColor:
                !message.trim() || sending
                  ? colors.textDisabled
                  : colors.accent,
              color: "#ffffff",
              cursor:
                !message.trim() || sending ? "not-allowed" : "pointer",
              fontSize: typography.fontSizeBase,
              fontWeight: typography.fontWeightMedium,
              transition: `all ${transitions.duration} ${transitions.easing}`,
              alignSelf: "flex-start",
            }}
          >
            {sending ? TEXT.sending[language] : TEXT.sendBtn[language]}
          </button>

          {result && (
            <div
              style={{
                padding: spacing.md,
                borderRadius: borderRadius.md,
                backgroundColor: result.success
                  ? `${colors.success}15`
                  : `${colors.error}15`,
                color: result.success ? colors.success : colors.error,
                fontSize: typography.fontSizeSm,
              }}
            >
              {result.success
                ? `${TEXT.success[language]}${result.messageId ?? ""}`
                : TEXT.failed[language]}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: spacing.md,
            backgroundColor: colors.bgSecondary,
            borderRadius: borderRadius.md,
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
          }}
        >
          {TEXT.noChannel[language]}
        </div>
      )}
    </div>
  );
}
