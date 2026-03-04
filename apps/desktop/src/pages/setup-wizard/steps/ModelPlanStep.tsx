import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";

export type ModelPlan = "coding-plan" | "api-key" | "free-trial";

interface PlanOption {
  id: ModelPlan;
  icon: string;
  label: { "zh-CN": string; en: string };
  tagline: { "zh-CN": string; en: string };
  description: { "zh-CN": string; en: string };
  badge?: { "zh-CN": string; en: string };
}

const PLANS: PlanOption[] = [
  {
    id: "coding-plan",
    icon: "📦",
    label: { "zh-CN": "Coding Plan（月费套餐）", en: "Coding Plan (Monthly)" },
    tagline: { "zh-CN": "按月付费，不限次数无焦虑", en: "Fixed monthly fee, unlimited usage" },
    description: {
      "zh-CN": "选择一个厂商的编程月费套餐，每月固定费用，不用担心超额。适合日常高频使用。",
      en: "Subscribe to a provider's monthly coding plan. Fixed cost, no overage worries. Best for daily heavy usage.",
    },
    badge: { "zh-CN": "推荐", en: "Recommended" },
  },
  {
    id: "api-key",
    icon: "🔑",
    label: { "zh-CN": "API Key（按量付费）", en: "API Key (Pay-as-you-go)" },
    tagline: { "zh-CN": "用多少算多少，灵活控制", en: "Pay only for what you use" },
    description: {
      "zh-CN": "从供应商获取 API Key，按实际 Token 用量计费。适合用量不固定或需要多供应商切换的用户。",
      en: "Get an API Key from a provider and pay by token usage. Best for variable usage or multi-provider setups.",
    },
  },
  {
    id: "free-trial",
    icon: "🎁",
    label: { "zh-CN": "先免费试试", en: "Free Trial" },
    tagline: { "zh-CN": "零成本体验，马上开始", en: "Zero cost to get started" },
    description: {
      "zh-CN": "使用腾讯混元-lite 或讯飞星火 Lite 等免费模型，体验 AI Agent 的基本能力。随时可以升级。",
      en: "Try free models like Tencent Hunyuan-lite or iFlytek Spark Lite. Upgrade anytime.",
    },
  },
];

interface ModelPlanStepProps {
  value: ModelPlan | null;
  onChange: (plan: ModelPlan) => void;
  language: AppLanguage;
  colors: ColorTokens;
}

export default function ModelPlanStep({
  value,
  onChange,
  language,
  colors,
}: ModelPlanStepProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
      {PLANS.map((plan) => {
        const isSelected = value === plan.id;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onChange(plan.id)}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "flex-start",
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
            {plan.badge && (
              <div
                style={{
                  position: "absolute",
                  top: -8,
                  right: 12,
                  padding: `2px ${spacing.sm}px`,
                  backgroundColor: colors.accent,
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: typography.fontWeightMedium,
                  borderRadius: borderRadius.sm,
                }}
              >
                {plan.badge[language]}
              </div>
            )}
            <div style={{ fontSize: 28, lineHeight: 1, marginTop: 2 }}>
              {plan.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: typography.fontSizeLg,
                  fontWeight: typography.fontWeightMedium,
                  color: colors.textPrimary,
                }}
              >
                {plan.label[language]}
              </div>
              <div
                style={{
                  fontSize: typography.fontSizeSm,
                  color: colors.accent,
                  marginTop: 2,
                }}
              >
                {plan.tagline[language]}
              </div>
              <div
                style={{
                  fontSize: typography.fontSizeSm,
                  color: colors.textSecondary,
                  marginTop: spacing.sm,
                  lineHeight: 1.5,
                }}
              >
                {plan.description[language]}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
