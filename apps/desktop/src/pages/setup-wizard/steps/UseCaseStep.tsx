import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";

export type UseCase = "coding" | "team" | "automation";

interface UseCaseOption {
  id: UseCase;
  icon: string;
  label: { "zh-CN": string; en: string };
  description: { "zh-CN": string; en: string };
}

const USE_CASES: UseCaseOption[] = [
  {
    id: "coding",
    icon: "💻",
    label: { "zh-CN": "个人编程助手", en: "Personal Coding Assistant" },
    description: {
      "zh-CN": "AI 帮你写代码、调试、重构，提升开发效率",
      en: "AI helps you write code, debug, and refactor",
    },
  },
  {
    id: "team",
    icon: "👥",
    label: { "zh-CN": "团队协作", en: "Team Collaboration" },
    description: {
      "zh-CN": "通过飞书等通信渠道，团队成员共享 AI Agent",
      en: "Share AI Agent with team members via Feishu and other channels",
    },
  },
  {
    id: "automation",
    icon: "⚡",
    label: { "zh-CN": "自动化任务", en: "Automation Tasks" },
    description: {
      "zh-CN": "定时执行代码审查、测试、部署等自动化工作流",
      en: "Schedule automated workflows like code review, testing, and deployment",
    },
  },
];

interface UseCaseStepProps {
  value: UseCase | null;
  onChange: (useCase: UseCase) => void;
  language: AppLanguage;
  colors: ColorTokens;
}

export default function UseCaseStep({
  value,
  onChange,
  language,
  colors,
}: UseCaseStepProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
      {USE_CASES.map((uc) => {
        const isSelected = value === uc.id;
        return (
          <button
            key={uc.id}
            type="button"
            onClick={() => onChange(uc.id)}
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
            <div style={{ fontSize: 28, lineHeight: 1 }}>{uc.icon}</div>
            <div>
              <div
                style={{
                  fontSize: typography.fontSizeLg,
                  fontWeight: typography.fontWeightMedium,
                  color: colors.textPrimary,
                }}
              >
                {uc.label[language]}
              </div>
              <div
                style={{
                  fontSize: typography.fontSizeSm,
                  color: colors.textSecondary,
                  marginTop: spacing.xs,
                }}
              >
                {uc.description[language]}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
