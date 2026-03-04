import { useState, useCallback } from "react";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import type { IpcDoctorCheck, DoctorCheckStatus } from "@/ipc/methods/doctor";
import { ipcCallSafe } from "@/ipc/client";

interface DoctorPanelProps {
  colors: ColorTokens;
  language: AppLanguage;
}

const T = {
  "zh-CN": {
    title: "系统诊断",
    description: "检查运行环境、配置和依赖状态",
    runDoctor: "运行诊断",
    running: "检查中...",
    overallPass: "全部通过",
    overallWarn: "存在警告",
    overallFail: "存在错误",
    noResults: "点击上方按钮运行诊断",
    error: "诊断失败",
  },
  en: {
    title: "System Diagnostics",
    description: "Check runtime environment, config, and dependency status",
    runDoctor: "Run Diagnostics",
    running: "Checking...",
    overallPass: "All Passed",
    overallWarn: "Warnings Found",
    overallFail: "Errors Found",
    noResults: "Click the button above to run diagnostics",
    error: "Diagnostics failed",
  },
} as const;

const STATUS_COLORS: Record<DoctorCheckStatus, (c: ColorTokens) => string> = {
  pass: (c) => c.success,
  warn: (c) => c.warning,
  fail: (c) => c.error,
};

const STATUS_SYMBOLS: Record<DoctorCheckStatus, string> = {
  pass: "●",
  warn: "▲",
  fail: "✕",
};

function CheckItem({
  check,
  colors,
  language,
}: {
  check: IpcDoctorCheck;
  colors: ColorTokens;
  language: AppLanguage;
}): React.JSX.Element {
  const statusColor = STATUS_COLORS[check.status](colors);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: spacing.md,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderBottom: `1px solid ${colors.borderLight}`,
      }}
    >
      <span
        style={{
          color: statusColor,
          fontSize: typography.fontSizeBase,
          lineHeight: `${typography.fontSizeBase * typography.lineHeight}px`,
          flexShrink: 0,
          width: 16,
          textAlign: "center",
        }}
      >
        {STATUS_SYMBOLS[check.status]}
      </span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: typography.fontSizeBase,
            color: colors.textPrimary,
            fontWeight: typography.fontWeightMedium,
          }}
        >
          {check.label[language]}
        </div>
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: check.status === "pass" ? colors.textDisabled : statusColor,
            marginTop: 2,
          }}
        >
          {check.message[language]}
        </div>
      </div>
    </div>
  );
}

export default function DoctorPanel({
  colors,
  language,
}: DoctorPanelProps): React.JSX.Element {
  const t = T[language];
  const [checks, setChecks] = useState<IpcDoctorCheck[]>([]);
  const [overall, setOverall] = useState<DoctorCheckStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    const result = await ipcCallSafe("doctor.run", {} as Record<string, never>);
    if (result.ok) {
      setChecks(result.data.checks);
      setOverall(result.data.overall);
    } else {
      setError(result.error.message);
      setChecks([]);
      setOverall(null);
    }
    setRunning(false);
  }, []);

  const overallLabel =
    overall === "pass"
      ? t.overallPass
      : overall === "warn"
        ? t.overallWarn
        : overall === "fail"
          ? t.overallFail
          : null;

  const overallColor =
    overall !== null ? STATUS_COLORS[overall](colors) : colors.textDisabled;

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        border: `1px solid ${colors.borderLight}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: spacing.md,
        }}
      >
        <div>
          <div
            style={{
              fontSize: typography.fontSizeLg,
              fontWeight: typography.fontWeightBold,
              color: colors.textPrimary,
            }}
          >
            {t.title}
          </div>
          <div
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textDisabled,
              marginTop: 2,
            }}
          >
            {t.description}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
          {overallLabel !== null && (
            <span
              style={{
                fontSize: typography.fontSizeSm,
                fontWeight: typography.fontWeightMedium,
                color: overallColor,
              }}
            >
              {overallLabel}
            </span>
          )}
          <button
            type="button"
            onClick={(): void => {
              void handleRun();
            }}
            disabled={running}
            style={{
              padding: `${spacing.sm}px ${spacing.lg}px`,
              fontSize: typography.fontSizeSm,
              fontFamily: "inherit",
              fontWeight: typography.fontWeightMedium,
              color: running ? colors.textDisabled : "#ffffff",
              backgroundColor: running ? colors.bgSecondary : colors.accent,
              border: `1px solid ${running ? colors.border : colors.accent}`,
              borderRadius: borderRadius.md,
              cursor: running ? "not-allowed" : "pointer",
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {running ? t.running : t.runDoctor}
          </button>
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${colors.borderLight}`,
          borderRadius: borderRadius.md,
          overflow: "hidden",
        }}
      >
        {error !== null ? (
          <div
            style={{
              padding: spacing.lg,
              color: colors.error,
              fontSize: typography.fontSizeSm,
            }}
          >
            {t.error}: {error}
          </div>
        ) : checks.length === 0 ? (
          <div
            style={{
              padding: spacing.lg,
              textAlign: "center",
              color: colors.textDisabled,
              fontSize: typography.fontSizeSm,
            }}
          >
            {t.noResults}
          </div>
        ) : (
          checks.map((check) => (
            <CheckItem
              key={check.id}
              check={check}
              colors={colors}
              language={language}
            />
          ))
        )}
      </div>
    </div>
  );
}
