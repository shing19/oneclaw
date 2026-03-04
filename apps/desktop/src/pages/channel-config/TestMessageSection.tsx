import { useState, useCallback } from "react";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcChannelStatus, IpcSendResult } from "@/ipc/methods/channel";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface TestMessageSectionProps {
  colors: ColorTokens;
  language: "zh-CN" | "en";
  connectionStatus: IpcChannelStatus;
}

export default function TestMessageSection({
  colors,
  language,
  connectionStatus,
}: TestMessageSectionProps): React.JSX.Element {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<IpcSendResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const t = language === "zh-CN"
    ? {
        title: "发送测试消息",
        description: "向飞书发送一条测试消息以验证通道是否正常工作",
        placeholder: "输入测试消息内容（留空使用默认消息）",
        send: "发送测试",
        sending: "发送中...",
        success: "消息已发送",
        failed: "发送失败",
        notConnected: "请先完成飞书配置并建立连接",
        messageId: "消息 ID",
      }
    : {
        title: "Send Test Message",
        description: "Send a test message to Feishu to verify the channel is working",
        placeholder: "Enter test message content (leave empty for default)",
        send: "Send Test",
        sending: "Sending...",
        success: "Message sent successfully",
        failed: "Failed to send",
        notConnected: "Please configure and connect Feishu first",
        messageId: "Message ID",
      };

  const disabled = connectionStatus !== "connected";

  const handleSend = useCallback(async () => {
    setSending(true);
    setSendResult(null);
    setSendError(null);

    const result = await ipcCallSafe("channel.feishu.sendTest", {
      ...(message.trim() ? { message: message.trim() } : {}),
    });

    if (result.ok) {
      setSendResult(result.data);
      if (result.data.success) {
        setMessage("");
      }
    } else {
      setSendError(result.error.message);
    }
    setSending(false);
  }, [message]);

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.borderLight}`,
        padding: `${spacing.xl}px`,
        opacity: disabled ? 0.6 : 1,
        transition: `all ${transitions.duration} ${transitions.easing}`,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: spacing.lg }}>
        <div
          style={{
            fontSize: typography.fontSizeLg,
            fontWeight: typography.fontWeightMedium,
            color: colors.textPrimary,
            marginBottom: spacing.xs,
          }}
        >
          {t.title}
        </div>
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
          }}
        >
          {disabled ? t.notConnected : t.description}
        </div>
      </div>

      {/* Message input + send button */}
      <div style={{ display: "flex", gap: spacing.sm }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.placeholder}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !disabled && !sending) {
              void handleSend();
            }
          }}
          style={{
            flex: 1,
            padding: `${spacing.sm}px ${spacing.md}px`,
            fontSize: typography.fontSizeBase,
            fontFamily: "inherit",
            color: colors.textPrimary,
            backgroundColor: disabled ? colors.bgSecondary : colors.bgPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.sm,
            outline: "none",
            boxSizing: "border-box",
            transition: `border-color ${transitions.duration} ${transitions.easing}`,
          }}
        />
        <button
          type="button"
          onClick={(): void => {
            void handleSend();
          }}
          disabled={disabled || sending}
          style={{
            padding: `${spacing.sm}px ${spacing.xl}px`,
            fontSize: typography.fontSizeBase,
            fontFamily: "inherit",
            color: "#ffffff",
            backgroundColor:
              disabled || sending ? colors.textDisabled : colors.accent,
            border: "none",
            borderRadius: borderRadius.sm,
            cursor: disabled || sending ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: `all ${transitions.duration} ${transitions.easing}`,
          }}
        >
          {sending ? t.sending : t.send}
        </button>
      </div>

      {/* Send result feedback */}
      {sendResult && (
        <div
          style={{
            marginTop: spacing.md,
            padding: `${spacing.sm}px ${spacing.md}px`,
            backgroundColor: sendResult.success
              ? colors.success + "10"
              : colors.error + "10",
            border: `1px solid ${sendResult.success ? colors.success : colors.error}30`,
            borderRadius: borderRadius.sm,
            fontSize: typography.fontSizeSm,
            color: sendResult.success ? colors.success : colors.error,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
            <span>{sendResult.success ? "✓" : "✗"}</span>
            <span>
              {sendResult.success
                ? t.success
                : sendResult.error?.message ?? t.failed}
            </span>
          </div>
          {sendResult.success && sendResult.messageId && (
            <div
              style={{
                marginTop: spacing.xs,
                color: colors.textSecondary,
                fontFamily: "monospace",
                fontSize: 11,
              }}
            >
              {t.messageId}: {sendResult.messageId}
            </div>
          )}
        </div>
      )}

      {sendError && (
        <div
          style={{
            marginTop: spacing.md,
            padding: `${spacing.sm}px ${spacing.md}px`,
            backgroundColor: colors.error + "10",
            border: `1px solid ${colors.error}30`,
            borderRadius: borderRadius.sm,
            fontSize: typography.fontSizeSm,
            color: colors.error,
          }}
        >
          {sendError}
        </div>
      )}
    </div>
  );
}
