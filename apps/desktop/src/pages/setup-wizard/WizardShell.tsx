import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";

export interface WizardShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  colors: ColorTokens;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  nextLabel: string;
  backLabel: string;
  skipLabel: string;
  nextDisabled?: boolean;
  showBack: boolean;
  isLastStep: boolean;
}

export default function WizardShell({
  children,
  title,
  subtitle,
  colors,
  onNext,
  onBack,
  onSkip,
  nextLabel,
  backLabel,
  skipLabel,
  nextDisabled,
  showBack,
  isLastStep,
}: WizardShellProps): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        maxWidth: 560,
        margin: "0 auto",
        flex: 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: spacing.xl,
          width: "100%",
        }}
      >
        <h2
          style={{
            fontSize: typography.fontSizeXl,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
            margin: `0 0 ${spacing.sm}px 0`,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              fontSize: typography.fontSizeBase,
              color: colors.textSecondary,
              margin: 0,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          width: "100%",
          flex: 1,
          overflowY: "auto",
          marginBottom: spacing.xl,
        }}
      >
        {children}
      </div>

      {/* Footer buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          paddingTop: spacing.lg,
          borderTop: `1px solid ${colors.borderLight}`,
        }}
      >
        <div>
          {showBack && (
            <button
              onClick={onBack}
              type="button"
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.md,
                backgroundColor: "transparent",
                color: colors.textSecondary,
                cursor: "pointer",
                fontSize: typography.fontSizeBase,
                transition: `all ${transitions.duration} ${transitions.easing}`,
              }}
            >
              {backLabel}
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: spacing.md }}>
          {!isLastStep && (
            <button
              onClick={onSkip}
              type="button"
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                border: "none",
                borderRadius: borderRadius.md,
                backgroundColor: "transparent",
                color: colors.textSecondary,
                cursor: "pointer",
                fontSize: typography.fontSizeBase,
                transition: `all ${transitions.duration} ${transitions.easing}`,
              }}
            >
              {skipLabel}
            </button>
          )}

          <button
            onClick={onNext}
            disabled={nextDisabled}
            type="button"
            style={{
              padding: `${spacing.sm}px ${spacing.xl}px`,
              border: "none",
              borderRadius: borderRadius.md,
              backgroundColor: nextDisabled
                ? colors.textDisabled
                : colors.accent,
              color: "#ffffff",
              cursor: nextDisabled ? "not-allowed" : "pointer",
              fontSize: typography.fontSizeBase,
              fontWeight: typography.fontWeightMedium,
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
