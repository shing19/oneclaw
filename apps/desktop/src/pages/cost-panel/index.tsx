import { useEffect, useState } from "react";
import { useCostStore } from "@/stores/cost-store";
import { useConfigStore } from "@/stores/config-store";
import { useTheme } from "@/hooks/use-theme";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcError } from "@/ipc/client";
import type { IpcDailyCostSummary } from "@/ipc/methods/cost";
import { spacing, typography } from "@/theme";
import ErrorAlert from "@/components/ErrorAlert";
import CostCards from "@/pages/dashboard/CostCards";
import TrendChart from "./TrendChart";
import ProviderBreakdown from "./ProviderBreakdown";
import ExportButton from "./ExportButton";

function getDateRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

type RangeKey = "7d" | "14d" | "30d";

const RANGE_OPTIONS: readonly { key: RangeKey; days: number; zh: string; en: string }[] = [
  { key: "7d", days: 7, zh: "近7天", en: "7 days" },
  { key: "14d", days: 14, zh: "近14天", en: "14 days" },
  { key: "30d", days: 30, zh: "近30天", en: "30 days" },
];

export default function CostPanelPage(): React.JSX.Element {
  const { colors } = useTheme();
  const language = useConfigStore((s) => s.language);

  const today = useCostStore((s) => s.today);
  const week = useCostStore((s) => s.week);
  const month = useCostStore((s) => s.month);
  const updateToday = useCostStore((s) => s.updateToday);
  const updateWeek = useCostStore((s) => s.updateWeek);
  const updateMonth = useCostStore((s) => s.updateMonth);

  const [daily, setDaily] = useState<readonly IpcDailyCostSummary[]>([]);
  const [activeRange, setActiveRange] = useState<RangeKey>("7d");
  const [monthByProvider, setMonthByProvider] = useState<Record<string, number>>({});
  const [fetchError, setFetchError] = useState<IpcError | null>(null);

  // Fetch summary + history on mount and range change
  useEffect(() => {
    let cancelled = false;

    async function fetchData(): Promise<void> {
      const rangeOption = RANGE_OPTIONS.find((r) => r.key === activeRange);
      const days = rangeOption?.days ?? 7;
      const range = getDateRange(days);

      const [summaryResult, historyResult] = await Promise.all([
        ipcCallSafe("cost.summary", {} as Record<string, never>),
        ipcCallSafe("cost.history", range),
      ]);

      if (cancelled) return;

      if (summaryResult.ok) {
        const overview = summaryResult.data;
        updateToday({
          amount: overview.today.totalCostYuan,
          requests: overview.today.totalRequests,
          tokens: 0,
        });
        updateWeek({
          amount: overview.week.totalCostYuan,
          requests: overview.week.totalRequests,
          tokens: 0,
        });
        updateMonth({
          amount: overview.month.totalCostYuan,
          requests: overview.month.totalRequests,
          tokens: 0,
        });
        setMonthByProvider(overview.month.byProvider);
        setFetchError(null);
      } else {
        setFetchError(summaryResult.error);
      }

      if (historyResult.ok) {
        setDaily(historyResult.data.daily);
      }
    }

    void fetchData();
    return (): void => {
      cancelled = true;
    };
  }, [activeRange, updateToday, updateWeek, updateMonth]);

  const pageTitle = language === "zh-CN" ? "费用总览" : "Cost Overview";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing.xl,
        height: "100%",
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: typography.fontSizeXl,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
          }}
        >
          {pageTitle}
        </h1>
        <ExportButton colors={colors} language={language} />
      </div>

      {/* Fetch error */}
      {fetchError && (
        <ErrorAlert
          code={fetchError.code}
          message={fetchError.message}
          recoverable={fetchError.recoverable}
          language={language}
          colors={colors}
          onDismiss={() => setFetchError(null)}
        />
      )}

      {/* Summary cards */}
      <CostCards
        today={today}
        week={week}
        month={month}
        colors={colors}
        language={language}
      />

      {/* Range selector + Trend chart */}
      <div>
        <div
          style={{
            display: "flex",
            gap: spacing.sm,
            marginBottom: spacing.md,
          }}
        >
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setActiveRange(opt.key)}
              style={{
                padding: `${spacing.xs}px ${spacing.md}px`,
                fontSize: typography.fontSizeSm,
                fontWeight:
                  activeRange === opt.key
                    ? typography.fontWeightBold
                    : typography.fontWeightNormal,
                border: `1px solid ${activeRange === opt.key ? colors.accent : colors.border}`,
                borderRadius: 4,
                backgroundColor:
                  activeRange === opt.key ? `${colors.accent}15` : "transparent",
                color:
                  activeRange === opt.key
                    ? colors.accent
                    : colors.textSecondary,
                cursor: "pointer",
              }}
            >
              {language === "zh-CN" ? opt.zh : opt.en}
            </button>
          ))}
        </div>
        <TrendChart daily={daily} colors={colors} language={language} />
      </div>

      {/* Provider breakdown */}
      <ProviderBreakdown
        byProvider={monthByProvider}
        colors={colors}
        language={language}
      />
    </div>
  );
}
