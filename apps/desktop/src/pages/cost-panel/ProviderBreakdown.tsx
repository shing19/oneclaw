import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface ProviderBreakdownProps {
  byProvider: Record<string, number>;
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

const PROVIDER_COLORS = [
  "#1677ff",
  "#52c41a",
  "#faad14",
  "#ff4d4f",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#fa8c16",
];

function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export default function ProviderBreakdown({
  byProvider,
  colors,
  language,
}: ProviderBreakdownProps): React.JSX.Element {
  const entries = Object.entries(byProvider)
    .filter(([, cost]) => cost > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, cost]) => sum + cost, 0);
  const title = language === "zh-CN" ? "服务商费用分布" : "Provider Breakdown";
  const emptyText =
    language === "zh-CN" ? "暂无服务商数据" : "No provider data";

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        border: `1px solid ${colors.borderLight}`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
        flex: 1,
        minWidth: 240,
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

      {entries.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: `${spacing.lg}px 0`,
            color: colors.textSecondary,
            fontSize: typography.fontSizeSm,
          }}
        >
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
          {entries.map(([provider, cost], i) => {
            const percentage = total > 0 ? (cost / total) * 100 : 0;
            const barColor = PROVIDER_COLORS[i % PROVIDER_COLORS.length];
            return (
              <div key={provider}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: spacing.xs,
                    fontSize: typography.fontSizeSm,
                  }}
                >
                  <span style={{ color: colors.textPrimary, fontWeight: typography.fontWeightMedium }}>
                    {provider}
                  </span>
                  <span style={{ color: colors.textSecondary }}>
                    {formatCurrency(cost)} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    height: 6,
                    backgroundColor: colors.borderLight,
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${percentage}%`,
                      backgroundColor: barColor,
                      borderRadius: 3,
                      transition: `width ${transitions.duration} ${transitions.easing}`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
