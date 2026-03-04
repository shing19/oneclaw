import type { AgentStatus } from "@/stores/agent-store";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface StatusCardProps {
  status: AgentStatus;
  lastStatusChange: string | null;
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

const STATUS_LABELS: Record<AgentStatus, { zh: string; en: string }> = {
  stopped: { zh: "已停止", en: "Stopped" },
  starting: { zh: "启动中", en: "Starting" },
  running: { zh: "运行中", en: "Running" },
  error: { zh: "异常", en: "Error" },
};

function getStatusColor(status: AgentStatus, colors: ColorTokens): string {
  switch (status) {
    case "running":
      return colors.success;
    case "starting":
      return colors.warning;
    case "error":
      return colors.error;
    case "stopped":
      return colors.textDisabled;
  }
}

function formatUptime(lastStatusChange: string | null, language: "zh-CN" | "en"): string {
  if (!lastStatusChange) {
    return language === "zh-CN" ? "—" : "—";
  }
  const diffMs = Date.now() - new Date(lastStatusChange).getTime();
  if (diffMs < 0) return "—";

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return language === "zh-CN"
      ? `${hours}小时 ${minutes}分钟`
      : `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return language === "zh-CN"
      ? `${minutes}分钟 ${seconds}秒`
      : `${minutes}m ${seconds}s`;
  }
  return language === "zh-CN" ? `${seconds}秒` : `${seconds}s`;
}

export default function StatusCard({
  status,
  lastStatusChange,
  colors,
  language,
}: StatusCardProps): React.JSX.Element {
  const label = language === "zh-CN" ? STATUS_LABELS[status].zh : STATUS_LABELS[status].en;
  const statusColor = getStatusColor(status, colors);
  const uptime = status === "running" ? formatUptime(lastStatusChange, language) : null;

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        border: `1px solid ${colors.borderLight}`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
        flex: 1,
        minWidth: 200,
      }}
    >
      <div
        style={{
          fontSize: typography.fontSizeSm,
          color: colors.textSecondary,
          marginBottom: spacing.sm,
          fontWeight: typography.fontWeightMedium,
        }}
      >
        {language === "zh-CN" ? "运行状态" : "Agent Status"}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: statusColor,
            boxShadow: status === "running" ? `0 0 8px ${statusColor}` : "none",
          }}
        />
        <span
          style={{
            fontSize: typography.fontSizeXl,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
          }}
        >
          {label}
        </span>
      </div>
      {uptime !== null && (
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
          }}
        >
          {language === "zh-CN" ? `运行时间: ${uptime}` : `Uptime: ${uptime}`}
        </div>
      )}
    </div>
  );
}
