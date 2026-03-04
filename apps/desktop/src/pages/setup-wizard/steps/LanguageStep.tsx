import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";

const LANGUAGES: { id: AppLanguage; label: string; description: string }[] = [
  {
    id: "zh-CN",
    label: "中文（简体）",
    description: "推荐中国大陆用户使用",
  },
  {
    id: "en",
    label: "English",
    description: "For English-speaking users",
  },
];

interface LanguageStepProps {
  value: AppLanguage;
  onChange: (lang: AppLanguage) => void;
  colors: ColorTokens;
}

export default function LanguageStep({
  value,
  onChange,
  colors,
}: LanguageStepProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
      {LANGUAGES.map((lang) => {
        const isSelected = value === lang.id;
        return (
          <button
            key={lang.id}
            type="button"
            onClick={() => onChange(lang.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: spacing.lg,
              padding: `${spacing.lg}px ${spacing.xl}px`,
              border: `2px solid ${isSelected ? colors.accent : colors.border}`,
              borderRadius: borderRadius.lg,
              backgroundColor: isSelected
                ? `${colors.accent}11`
                : colors.bgPrimary,
              cursor: "pointer",
              transition: `all ${transitions.duration} ${transitions.easing}`,
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: `2px solid ${isSelected ? colors.accent : colors.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSelected && (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: colors.accent,
                  }}
                />
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: typography.fontSizeLg,
                  fontWeight: typography.fontWeightMedium,
                  color: colors.textPrimary,
                }}
              >
                {lang.label}
              </div>
              <div
                style={{
                  fontSize: typography.fontSizeSm,
                  color: colors.textSecondary,
                  marginTop: spacing.xs,
                }}
              >
                {lang.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
