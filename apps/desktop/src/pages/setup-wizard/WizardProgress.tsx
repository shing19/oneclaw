import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";

export interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
  colors: ColorTokens;
}

export default function WizardProgress({
  currentStep,
  totalSteps,
  stepLabels,
  colors,
}: WizardProgressProps): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        padding: `${spacing.lg}px 0`,
      }}
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.xs,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: typography.fontSizeSm,
                  fontWeight: typography.fontWeightMedium,
                  transition: `all ${transitions.duration} ${transitions.easing}`,
                  backgroundColor: isCompleted
                    ? colors.success
                    : isActive
                      ? colors.accent
                      : colors.bgSecondary,
                  color:
                    isCompleted || isActive
                      ? "#ffffff"
                      : colors.textSecondary,
                  border: isActive
                    ? `2px solid ${colors.accent}`
                    : "2px solid transparent",
                }}
              >
                {isCompleted ? "✓" : i + 1}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: isActive
                    ? colors.textPrimary
                    : colors.textSecondary,
                  fontWeight: isActive
                    ? typography.fontWeightMedium
                    : typography.fontWeightNormal,
                  maxWidth: 64,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {stepLabels[i]}
              </div>
            </div>
            {i < totalSteps - 1 && (
              <div
                style={{
                  width: 32,
                  height: 2,
                  backgroundColor: i < currentStep
                    ? colors.success
                    : colors.borderLight,
                  borderRadius: borderRadius.sm,
                  transition: `background-color ${transitions.duration} ${transitions.easing}`,
                  marginBottom: 18,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
