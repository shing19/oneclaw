import { useState, useCallback } from "react";
import type { AgentStatus } from "@/stores/agent-store";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcError } from "@/ipc/client";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import ErrorAlert from "@/components/ErrorAlert";

interface QuickActionsProps {
  status: AgentStatus;
  onStatusChange: (status: AgentStatus) => void;
  colors: ColorTokens;
  language: "zh-CN" | "en";
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant: "primary" | "danger" | "default";
  colors: ColorTokens;
  loading: boolean;
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant,
  colors,
  loading,
}: ActionButtonProps): React.JSX.Element {
  const bgColor =
    variant === "primary"
      ? colors.accent
      : variant === "danger"
        ? colors.error
        : colors.bgSecondary;
  const textColor =
    variant === "primary" || variant === "danger"
      ? "#ffffff"
      : colors.textPrimary;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: `${spacing.sm}px ${spacing.xl}px`,
        fontSize: typography.fontSizeBase,
        fontWeight: typography.fontWeightMedium,
        fontFamily: "inherit",
        color: disabled ? colors.textDisabled : textColor,
        backgroundColor: disabled ? colors.bgSecondary : bgColor,
        border: `1px solid ${disabled ? colors.borderLight : variant === "default" ? colors.border : bgColor}`,
        borderRadius: borderRadius.md,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: `all ${transitions.duration} ${transitions.easing}`,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? "..." : label}
    </button>
  );
}

export default function QuickActions({
  status,
  onStatusChange,
  colors,
  language,
}: QuickActionsProps): React.JSX.Element {
  const [loading, setLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<IpcError | null>(null);

  const handleStart = useCallback(async () => {
    setLoading("start");
    setActionError(null);
    onStatusChange("starting");
    const result = await ipcCallSafe("agent.start", {} as Record<string, never>);
    if (!result.ok) {
      onStatusChange("error");
      setActionError(result.error);
    }
    setLoading(null);
  }, [onStatusChange]);

  const handleStop = useCallback(async () => {
    setLoading("stop");
    setActionError(null);
    const result = await ipcCallSafe("agent.stop", {} as Record<string, never>);
    if (result.ok) {
      onStatusChange("stopped");
    } else {
      onStatusChange("error");
      setActionError(result.error);
    }
    setLoading(null);
  }, [onStatusChange]);

  const handleRestart = useCallback(async () => {
    setLoading("restart");
    setActionError(null);
    onStatusChange("starting");
    const result = await ipcCallSafe("agent.restart", {} as Record<string, never>);
    if (!result.ok) {
      onStatusChange("error");
      setActionError(result.error);
    }
    setLoading(null);
  }, [onStatusChange]);

  const isRunning = status === "running";
  const isStopped = status === "stopped";
  const isTransitioning = status === "starting";

  const labels =
    language === "zh-CN"
      ? { start: "启动", stop: "停止", restart: "重启" }
      : { start: "Start", stop: "Stop", restart: "Restart" };

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
          marginBottom: spacing.md,
          fontWeight: typography.fontWeightMedium,
        }}
      >
        {language === "zh-CN" ? "快速操作" : "Quick Actions"}
      </div>
      <div style={{ display: "flex", gap: spacing.sm, flexWrap: "wrap" }}>
        <ActionButton
          label={labels.start}
          onClick={(): void => { void handleStart(); }}
          disabled={!isStopped || isTransitioning}
          variant="primary"
          colors={colors}
          loading={loading === "start"}
        />
        <ActionButton
          label={labels.stop}
          onClick={(): void => { void handleStop(); }}
          disabled={!isRunning || isTransitioning}
          variant="danger"
          colors={colors}
          loading={loading === "stop"}
        />
        <ActionButton
          label={labels.restart}
          onClick={(): void => { void handleRestart(); }}
          disabled={!isRunning || isTransitioning}
          variant="default"
          colors={colors}
          loading={loading === "restart"}
        />
      </div>
      {actionError && (
        <div style={{ marginTop: spacing.md }}>
          <ErrorAlert
            code={actionError.code}
            message={actionError.message}
            recoverable={actionError.recoverable}
            language={language}
            colors={colors}
            onDismiss={() => setActionError(null)}
            compact
          />
        </div>
      )}
    </div>
  );
}
