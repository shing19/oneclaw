import type { IpcDailyCostSummary } from "@/ipc/methods/cost";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface TrendChartProps {
  daily: readonly IpcDailyCostSummary[];
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

function formatDate(iso: string, language: "zh-CN" | "en"): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  if (language === "zh-CN") {
    return `${month}/${day}`;
  }
  return `${month}/${day}`;
}

function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export default function TrendChart({
  daily,
  colors,
  language,
}: TrendChartProps): React.JSX.Element {
  const maxCost = Math.max(...daily.map((d) => d.totalCostYuan), 0.01);
  const barMaxHeight = 160;

  const title = language === "zh-CN" ? "每日费用趋势" : "Daily Cost Trend";
  const emptyText =
    language === "zh-CN" ? "暂无费用数据" : "No cost data available";

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        border: `1px solid ${colors.borderLight}`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
      }}
    >
      <div
        style={{
          fontSize: typography.fontSizeLg,
          fontWeight: typography.fontWeightBold,
          color: colors.textPrimary,
          marginBottom: spacing.lg,
        }}
      >
        {title}
      </div>

      {daily.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: `${spacing.xxl}px 0`,
            color: colors.textSecondary,
            fontSize: typography.fontSizeSm,
          }}
        >
          {emptyText}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: Math.max(2, Math.floor(400 / daily.length) - 24),
            height: barMaxHeight + 40,
            paddingTop: spacing.sm,
          }}
        >
          {daily.map((day) => {
            const height = Math.max(
              2,
              (day.totalCostYuan / maxCost) * barMaxHeight,
            );
            return (
              <div
                key={day.date}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {/* Cost label */}
                <div
                  style={{
                    fontSize: 10,
                    color: colors.textSecondary,
                    marginBottom: spacing.xs,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "100%",
                  }}
                >
                  {formatCurrency(day.totalCostYuan)}
                </div>
                {/* Bar */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 32,
                    height,
                    backgroundColor: colors.accent,
                    borderRadius: `${borderRadius.sm}px ${borderRadius.sm}px 0 0`,
                    transition: `height ${transitions.duration} ${transitions.easing}`,
                    opacity: 0.85,
                  }}
                />
                {/* Date label */}
                <div
                  style={{
                    fontSize: 10,
                    color: colors.textSecondary,
                    marginTop: spacing.xs,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDate(day.date, language)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
