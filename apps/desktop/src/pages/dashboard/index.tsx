import { useEffect, useCallback, useState } from "react";
import { useAgentStore } from "@/stores/agent-store";
import { useCostStore } from "@/stores/cost-store";
import { useConfigStore } from "@/stores/config-store";
import { useTheme } from "@/hooks/use-theme";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcError } from "@/ipc/client";
import { spacing } from "@/theme";
import ErrorAlert from "@/components/ErrorAlert";
import StatusCard from "./StatusCard";
import CostCards from "./CostCards";
import QuickActions from "./QuickActions";
import RecentLogs from "./RecentLogs";

export default function DashboardPage(): React.JSX.Element {
  const { colors } = useTheme();
  const language = useConfigStore((s) => s.language);

  const status = useAgentStore((s) => s.status);
  const lastStatusChange = useAgentStore((s) => s.lastStatusChange);
  const recentLogs = useAgentStore((s) => s.recentLogs);
  const setStatus = useAgentStore((s) => s.setStatus);
  const clearLogs = useAgentStore((s) => s.clearLogs);

  const today = useCostStore((s) => s.today);
  const week = useCostStore((s) => s.week);
  const month = useCostStore((s) => s.month);
  const updateToday = useCostStore((s) => s.updateToday);
  const updateWeek = useCostStore((s) => s.updateWeek);
  const updateMonth = useCostStore((s) => s.updateMonth);

  const [fetchError, setFetchError] = useState<IpcError | null>(null);

  // Fetch initial data on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchInitialData(): Promise<void> {
      const [statusResult, costResult] = await Promise.all([
        ipcCallSafe("agent.status", {} as Record<string, never>),
        ipcCallSafe("cost.summary", {} as Record<string, never>),
      ]);

      if (cancelled) return;

      if (statusResult.ok) {
        const state = statusResult.data.state;
        if (state === "running" || state === "stopped" || state === "starting" || state === "error") {
          setStatus(state);
        }
      } else {
        setFetchError(statusResult.error);
      }

      if (costResult.ok) {
        const overview = costResult.data;
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
      }
    }

    void fetchInitialData();
    return (): void => {
      cancelled = true;
    };
  }, [setStatus, updateToday, updateWeek, updateMonth]);

  const handleStatusChange = useCallback(
    (newStatus: "stopped" | "starting" | "running" | "error") => {
      setStatus(newStatus);
    },
    [setStatus],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing.xl,
        height: "100%",
      }}
    >
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

      {/* Top row: Status + Quick Actions */}
      <div style={{ display: "flex", gap: spacing.lg, flexWrap: "wrap" }}>
        <StatusCard
          status={status}
          lastStatusChange={lastStatusChange}
          colors={colors}
          language={language}
        />
        <QuickActions
          status={status}
          onStatusChange={handleStatusChange}
          colors={colors}
          language={language}
        />
      </div>

      {/* Cost summary cards */}
      <CostCards
        today={today}
        week={week}
        month={month}
        colors={colors}
        language={language}
      />

      {/* Recent logs */}
      <RecentLogs
        logs={recentLogs}
        onClear={clearLogs}
        colors={colors}
        language={language}
      />
    </div>
  );
}
