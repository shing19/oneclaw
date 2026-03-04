import type { CostSummary } from "@/stores/cost-store";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";

interface CostCardsProps {
  today: CostSummary;
  week: CostSummary;
  month: CostSummary;
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

interface SingleCostCardProps {
  title: string;
  summary: CostSummary;
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

function formatNumber(n: number): string {
  if (n >= 10000) {
    return `${(n / 10000).toFixed(1)}万`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return String(n);
}

function SingleCostCard({
  title,
  summary,
  colors,
  language,
}: SingleCostCardProps): React.JSX.Element {
  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        border: `1px solid ${colors.borderLight}`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
        flex: 1,
        minWidth: 140,
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
        {title}
      </div>
      <div
        style={{
          fontSize: typography.fontSizeXl,
          fontWeight: typography.fontWeightBold,
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        }}
      >
        {formatCurrency(summary.amount)}
      </div>
      <div
        style={{
          fontSize: typography.fontSizeSm,
          color: colors.textSecondary,
          display: "flex",
          gap: spacing.lg,
        }}
      >
        <span>
          {formatNumber(summary.requests)}{" "}
          {language === "zh-CN" ? "请求" : "requests"}
        </span>
        <span>{formatNumber(summary.tokens)} tokens</span>
      </div>
    </div>
  );
}

export default function CostCards({
  today,
  week,
  month,
  colors,
  language,
}: CostCardsProps): React.JSX.Element {
  const titles =
    language === "zh-CN"
      ? { today: "今日费用", week: "本周费用", month: "本月费用" }
      : { today: "Today", week: "This Week", month: "This Month" };

  return (
    <div style={{ display: "flex", gap: spacing.lg, flexWrap: "wrap" }}>
      <SingleCostCard
        title={titles.today}
        summary={today}
        colors={colors}
        language={language}
      />
      <SingleCostCard
        title={titles.week}
        summary={week}
        colors={colors}
        language={language}
      />
      <SingleCostCard
        title={titles.month}
        summary={month}
        colors={colors}
        language={language}
      />
    </div>
  );
}
