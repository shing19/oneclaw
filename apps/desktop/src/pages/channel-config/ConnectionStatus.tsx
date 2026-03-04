import type { IpcChannelStatus, IpcChannelErrorInfo } from "@/ipc/methods/channel";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface ConnectionStatusProps {
  status: IpcChannelStatus;
  error?: IpcChannelErrorInfo;
  lastTestLatency?: number;
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

export default function ConnectionStatus({
  status,
  error,
  lastTestLatency,
  colors,
  language,
}: ConnectionStatusProps): React.JSX.Element {
  const statusConfig: Record<
    IpcChannelStatus,
    { color: string; zh: string; en: string }
  > = {
    connected: { color: colors.success, zh: "已连接", en: "Connected" },
    disconnected: { color: colors.textDisabled, zh: "未连接", en: "Disconnected" },
    error: { color: colors.error, zh: "连接错误", en: "Error" },
  };

  const cfg = statusConfig[status];
  const label = language === "zh-CN" ? cfg.zh : cfg.en;

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.borderLight}`,
        padding: `${spacing.xl}px`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: typography.fontSizeSm,
          fontWeight: typography.fontWeightMedium,
          color: colors.textSecondary,
          marginBottom: spacing.lg,
          textTransform: "uppercase" as const,
          letterSpacing: "0.5px",
        }}
      >
        {language === "zh-CN" ? "连接状态" : "Connection Status"}
      </div>

      {/* Status indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: cfg.color,
            boxShadow:
              status === "connected" ? `0 0 8px ${cfg.color}` : "none",
            transition: `all ${transitions.duration} ${transitions.easing}`,
          }}
        />
        <span
          style={{
            fontSize: typography.fontSizeLg,
            fontWeight: typography.fontWeightMedium,
            color: colors.textPrimary,
          }}
        >
          {label}
        </span>
        {lastTestLatency !== undefined && lastTestLatency > 0 && (
          <span
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textSecondary,
            }}
          >
            ({lastTestLatency}ms)
          </span>
        )}
      </div>

      {/* Error details */}
      {error && (
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
          <div style={{ fontWeight: typography.fontWeightMedium }}>
            {error.code}
          </div>
          <div style={{ marginTop: spacing.xs, color: colors.textSecondary }}>
            {error.message}
          </div>
          {error.recoverable && (
            <div style={{ marginTop: spacing.xs, color: colors.textDisabled }}>
              {language === "zh-CN" ? "此错误可恢复" : "This error is recoverable"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
