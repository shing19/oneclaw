import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface RecentLogsProps {
  logs: readonly string[];
  onClear: () => void;
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

function getLogLevelColor(entry: string, colors: ColorTokens): string {
  if (entry.startsWith("[error]")) return colors.error;
  if (entry.startsWith("[warn]")) return colors.warning;
  if (entry.startsWith("[info]")) return colors.accent;
  if (entry.startsWith("[debug]")) return colors.textDisabled;
  return colors.textSecondary;
}

export default function RecentLogs({
  logs,
  onClear,
  colors,
  language,
}: RecentLogsProps): React.JSX.Element {
  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        border: `1px solid ${colors.borderLight}`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
        flex: 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: spacing.md,
        }}
      >
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            fontWeight: typography.fontWeightMedium,
          }}
        >
          {language === "zh-CN" ? "最近活动" : "Recent Activity"}
        </div>
        {logs.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textSecondary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: borderRadius.sm,
              fontFamily: "inherit",
              transition: `color ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {language === "zh-CN" ? "清除" : "Clear"}
          </button>
        )}
      </div>

      {logs.length === 0 ? (
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textDisabled,
            padding: `${spacing.xl}px 0`,
            textAlign: "center",
          }}
        >
          {language === "zh-CN" ? "暂无活动记录" : "No activity yet"}
        </div>
      ) : (
        <div
          style={{
            maxHeight: 300,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {logs.map((entry, i) => (
            <div
              key={`${i}-${entry.slice(0, 40)}`}
              style={{
                fontSize: typography.fontSizeSm,
                fontFamily: "monospace",
                color: getLogLevelColor(entry, colors),
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: borderRadius.sm,
                backgroundColor:
                  i % 2 === 0 ? "transparent" : `${colors.bgPrimary}40`,
                lineHeight: 1.6,
                wordBreak: "break-all",
              }}
            >
              {entry}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
