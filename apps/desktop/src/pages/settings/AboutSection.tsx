import { useState, useCallback } from "react";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import { ipcCallSafe } from "@/ipc/client";

interface AboutSectionProps {
  colors: ColorTokens;
  language: AppLanguage;
}

const T = {
  "zh-CN": {
    title: "关于",
    appName: "OneClaw",
    appDescription: "一键部署 AI Agent 平台",
    version: "版本",
    versionValue: "1.0.0-alpha",
    resetConfig: "重置配置",
    resetConfirm: "确认重置所有配置为默认值？",
    resetSuccess: "配置已重置",
    resetError: "重置失败",
    cancel: "取消",
    configValidation: "配置校验",
    validate: "校验",
    validating: "校验中...",
    configValid: "配置有效",
    configInvalid: "配置存在问题",
    validationError: "校验失败",
  },
  en: {
    title: "About",
    appName: "OneClaw",
    appDescription: "One-click AI Agent platform",
    version: "Version",
    versionValue: "1.0.0-alpha",
    resetConfig: "Reset Configuration",
    resetConfirm: "Reset all configuration to defaults?",
    resetSuccess: "Configuration reset",
    resetError: "Reset failed",
    cancel: "Cancel",
    configValidation: "Config Validation",
    validate: "Validate",
    validating: "Validating...",
    configValid: "Configuration is valid",
    configInvalid: "Configuration has issues",
    validationError: "Validation failed",
  },
} as const;

export default function AboutSection({
  colors,
  language,
}: AboutSectionProps): React.JSX.Element {
  const t = T[language];
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetResult, setResetResult] = useState<"success" | "error" | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    issues: { path: string; message: string }[];
  } | null>(null);

  const handleReset = useCallback(async () => {
    setResetting(true);
    const result = await ipcCallSafe("config.reset", {} as Record<string, never>);
    setResetResult(result.ok ? "success" : "error");
    setResetting(false);
    setResetConfirm(false);
    setTimeout(() => setResetResult(null), 3000);
  }, []);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    const result = await ipcCallSafe("config.validate", {} as Record<string, never>);
    if (result.ok) {
      setValidationResult({
        valid: result.data.valid,
        issues: result.data.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    } else {
      setValidationResult(null);
    }
    setValidating(false);
  }, []);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.md}px 0`,
    borderBottom: `1px solid ${colors.borderLight}`,
  };

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
          fontSize: typography.fontSizeLg,
          fontWeight: typography.fontWeightBold,
          color: colors.textPrimary,
          marginBottom: spacing.xl,
        }}
      >
        {t.title}
      </div>

      {/* App info */}
      <div style={rowStyle}>
        <div>
          <div
            style={{
              fontSize: typography.fontSizeBase,
              color: colors.textPrimary,
              fontWeight: typography.fontWeightMedium,
            }}
          >
            {t.appName}
          </div>
          <div
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textDisabled,
            }}
          >
            {t.appDescription}
          </div>
        </div>
        <span
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            fontFamily: "monospace",
          }}
        >
          {t.version} {t.versionValue}
        </span>
      </div>

      {/* Config validation */}
      <div style={rowStyle}>
        <div>
          <div
            style={{
              fontSize: typography.fontSizeBase,
              color: colors.textPrimary,
              fontWeight: typography.fontWeightMedium,
            }}
          >
            {t.configValidation}
          </div>
          {validationResult !== null && (
            <div
              style={{
                fontSize: typography.fontSizeSm,
                color: validationResult.valid ? colors.success : colors.warning,
                marginTop: 2,
              }}
            >
              {validationResult.valid ? t.configValid : t.configInvalid}
              {validationResult.issues.length > 0 && (
                <ul
                  style={{
                    margin: `${spacing.xs}px 0 0 ${spacing.lg}px`,
                    padding: 0,
                    listStyle: "disc",
                  }}
                >
                  {validationResult.issues.map((issue) => (
                    <li key={issue.path} style={{ marginBottom: 2 }}>
                      <code style={{ fontSize: typography.fontSizeSm }}>
                        {issue.path}
                      </code>
                      : {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(): void => {
            void handleValidate();
          }}
          disabled={validating}
          style={{
            padding: `${spacing.sm}px ${spacing.lg}px`,
            fontSize: typography.fontSizeSm,
            fontFamily: "inherit",
            fontWeight: typography.fontWeightMedium,
            color: validating ? colors.textDisabled : colors.accent,
            backgroundColor: "transparent",
            border: `1px solid ${validating ? colors.borderLight : colors.accent}`,
            borderRadius: borderRadius.md,
            cursor: validating ? "not-allowed" : "pointer",
            transition: `all ${transitions.duration} ${transitions.easing}`,
          }}
        >
          {validating ? t.validating : t.validate}
        </button>
      </div>

      {/* Reset config */}
      <div style={{ ...rowStyle, borderBottom: "none" }}>
        <div>
          <div
            style={{
              fontSize: typography.fontSizeBase,
              color: colors.textPrimary,
              fontWeight: typography.fontWeightMedium,
            }}
          >
            {t.resetConfig}
          </div>
          {resetResult === "success" && (
            <div
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.success,
                marginTop: 2,
              }}
            >
              {t.resetSuccess}
            </div>
          )}
          {resetResult === "error" && (
            <div
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.error,
                marginTop: 2,
              }}
            >
              {t.resetError}
            </div>
          )}
        </div>
        {resetConfirm ? (
          <div style={{ display: "flex", gap: spacing.sm }}>
            <button
              type="button"
              onClick={(): void => {
                void handleReset();
              }}
              disabled={resetting}
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                fontSize: typography.fontSizeSm,
                fontFamily: "inherit",
                fontWeight: typography.fontWeightMedium,
                color: "#ffffff",
                backgroundColor: colors.error,
                border: "none",
                borderRadius: borderRadius.md,
                cursor: resetting ? "not-allowed" : "pointer",
                transition: `all ${transitions.duration} ${transitions.easing}`,
              }}
            >
              {resetting ? "..." : t.resetConfirm}
            </button>
            <button
              type="button"
              onClick={() => setResetConfirm(false)}
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                fontSize: typography.fontSizeSm,
                fontFamily: "inherit",
                color: colors.textSecondary,
                backgroundColor: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.md,
                cursor: "pointer",
              }}
            >
              {t.cancel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setResetConfirm(true)}
            style={{
              padding: `${spacing.sm}px ${spacing.lg}px`,
              fontSize: typography.fontSizeSm,
              fontFamily: "inherit",
              fontWeight: typography.fontWeightMedium,
              color: colors.error,
              backgroundColor: "transparent",
              border: `1px solid ${colors.error}`,
              borderRadius: borderRadius.md,
              cursor: "pointer",
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {t.resetConfig}
          </button>
        )}
      </div>
    </div>
  );
}
