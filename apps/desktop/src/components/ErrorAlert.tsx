/**
 * Reusable error alert component with localized actionable guidance.
 *
 * Displays a styled error banner with title, guidance, and optional dismiss.
 */

import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import { resolveErrorGuidance } from "./error-guidance";

interface ErrorAlertProps {
  /** Application error code (e.g. "CHANNEL_AUTH_FAILED", "IPC_ERROR"). */
  code: string;
  /** Raw error message from the IPC layer. */
  message: string;
  /** Whether the error is recoverable. */
  recoverable?: boolean;
  /** Current app language. */
  language: AppLanguage;
  /** Theme color tokens. */
  colors: ColorTokens;
  /** Optional dismiss handler. If omitted, no dismiss button is shown. */
  onDismiss?: () => void;
  /** Compact mode — single line, smaller padding. */
  compact?: boolean;
}

export default function ErrorAlert({
  code,
  message,
  recoverable,
  language,
  colors,
  onDismiss,
  compact = false,
}: ErrorAlertProps): React.JSX.Element {
  const guidance = resolveErrorGuidance(language, code);

  const padY = compact ? spacing.sm : spacing.md;
  const padX = compact ? spacing.md : spacing.lg;

  return (
    <div
      role="alert"
      style={{
        padding: `${padY}px ${padX}px`,
        backgroundColor: colors.error + "10",
        border: `1px solid ${colors.error}30`,
        borderRadius: borderRadius.md,
        transition: `all ${transitions.duration} ${transitions.easing}`,
      }}
    >
      {/* Header row: title + dismiss */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <div
          style={{
            fontSize: compact ? typography.fontSizeSm : typography.fontSizeBase,
            fontWeight: typography.fontWeightMedium,
            color: colors.error,
          }}
        >
          {guidance.title}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={language === "zh-CN" ? "关闭" : "Dismiss"}
            style={{
              background: "none",
              border: "none",
              color: colors.textSecondary,
              cursor: "pointer",
              fontSize: typography.fontSizeBase,
              padding: `0 ${spacing.xs}px`,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Guidance / action */}
      {!compact && (
        <div
          style={{
            marginTop: spacing.xs,
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          {guidance.action}
        </div>
      )}

      {/* Technical detail (collapsed) */}
      {!compact && message && (
        <div
          style={{
            marginTop: spacing.sm,
            fontSize: 11,
            color: colors.textDisabled,
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}
        >
          {code !== "IPC_ERROR" && code !== "INTERNAL_ERROR" ? `[${code}] ` : ""}
          {message}
        </div>
      )}

      {/* Recoverable hint */}
      {!compact && recoverable === true && (
        <div
          style={{
            marginTop: spacing.xs,
            fontSize: 11,
            color: colors.textDisabled,
          }}
        >
          {language === "zh-CN" ? "此错误可恢复，请按提示操作。" : "This error is recoverable. Follow the guidance above."}
        </div>
      )}
    </div>
  );
}
