import { useState, useEffect, useCallback } from "react";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcChannelStatus, IpcChannelErrorInfo, IpcTestResult } from "@/ipc/methods/channel";
import { useTheme } from "@/hooks/use-theme";
import { useConfigStore } from "@/stores";
import { spacing, typography } from "@/theme";
import ConnectionStatus from "./ConnectionStatus";
import FeishuSetupForm from "./FeishuSetupForm";
import TestMessageSection from "./TestMessageSection";

export default function ChannelConfigPage(): React.JSX.Element {
  const { colors } = useTheme();
  const language = useConfigStore((s) => s.language);

  const [status, setStatus] = useState<IpcChannelStatus>("disconnected");
  const [error, setError] = useState<IpcChannelErrorInfo | undefined>();
  const [lastLatency, setLastLatency] = useState<number | undefined>();

  // Fetch initial channel status
  useEffect(() => {
    const abortCtrl = new AbortController();

    async function fetchStatus(): Promise<void> {
      const result = await ipcCallSafe("channel.feishu.status", {});
      if (abortCtrl.signal.aborted) return;
      if (result.ok) {
        setStatus(result.data.status);
        setError(result.data.error);
      }
    }

    void fetchStatus();
    return () => {
      abortCtrl.abort();
    };
  }, []);

  const handleSetupComplete = useCallback((testResult: IpcTestResult) => {
    setStatus(testResult.status);
    setError(testResult.error);
    if (testResult.latencyMs > 0) {
      setLastLatency(testResult.latencyMs);
    }
  }, []);

  const handleStatusRefresh = useCallback(
    (newStatus: IpcChannelStatus, newError?: IpcChannelErrorInfo) => {
      setStatus(newStatus);
      setError(newError);
    },
    [],
  );

  const t = language === "zh-CN"
    ? { title: "通信配置", description: "管理飞书等消息通道的连接和设置" }
    : { title: "Channel Config", description: "Manage message channel connections and settings" };

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: spacing.xl }}>
        <h2
          style={{
            fontSize: typography.fontSizeXl,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
            margin: 0,
            marginBottom: spacing.xs,
          }}
        >
          {t.title}
        </h2>
        <p
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            margin: 0,
          }}
        >
          {t.description}
        </p>
      </div>

      {/* Content sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.xl }}>
        {/* Connection status */}
        <ConnectionStatus
          status={status}
          error={error}
          lastTestLatency={lastLatency}
          colors={colors}
          language={language}
        />

        {/* Feishu setup form */}
        <FeishuSetupForm
          colors={colors}
          language={language}
          currentStatus={status}
          onSetupComplete={handleSetupComplete}
          onStatusRefresh={handleStatusRefresh}
        />

        {/* Test message */}
        <TestMessageSection
          colors={colors}
          language={language}
          connectionStatus={status}
        />
      </div>
    </div>
  );
}
