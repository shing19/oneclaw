import { useEffect, useState } from "react";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import type { ModelPlan } from "./ModelPlanStep";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcPresetProvider } from "@/ipc/methods/model";

/** Provider suggestions vary by chosen model plan. */
const PLAN_PROVIDER_MAP: Record<ModelPlan, string[]> = {
  "coding-plan": ["bailian", "volcengine", "zhipu"],
  "api-key": ["deepseek", "bailian", "zhipu", "minimax", "moonshot"],
  "free-trial": ["hunyuan", "spark"],
};

const TEXT = {
  title: {
    "zh-CN": "选择供应商并注册",
    en: "Choose a Provider & Sign Up",
  },
  description: {
    "zh-CN": "根据你的方案，以下是推荐的供应商。点击链接前往注册并获取凭证。",
    en: "Based on your plan, here are recommended providers. Click links to sign up and get credentials.",
  },
  signUp: { "zh-CN": "注册 / 获取 Key", en: "Sign Up / Get Key" },
  pricing: { "zh-CN": "查看定价", en: "View Pricing" },
  guide: { "zh-CN": "设置引导", en: "Setup Guide" },
  models: { "zh-CN": "可用模型", en: "Available Models" },
  loading: { "zh-CN": "加载供应商列表...", en: "Loading providers..." },
} as const;

interface ProviderStepProps {
  modelPlan: ModelPlan;
  selectedProvider: string | null;
  onSelectProvider: (id: string) => void;
  language: AppLanguage;
  colors: ColorTokens;
}

export default function ProviderStep({
  modelPlan,
  selectedProvider,
  onSelectProvider,
  language,
  colors,
}: ProviderStepProps): React.JSX.Element {
  const [presets, setPresets] = useState<IpcPresetProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const result = await ipcCallSafe(
        "model.listPresets",
        {} as Record<string, never>,
      );
      if (controller.signal.aborted) return;
      if (result.ok) {
        setPresets(result.data.presets);
      }
      setLoading(false);
    })();
    return () => controller.abort();
  }, []);

  const suggestedIds = PLAN_PROVIDER_MAP[modelPlan];
  const suggested = presets.filter((p) => suggestedIds.includes(p.id));
  const others = presets.filter((p) => !suggestedIds.includes(p.id));

  if (loading) {
    return (
      <div style={{ color: colors.textSecondary, padding: spacing.xl }}>
        {TEXT.loading[language]}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
      {suggested.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isSelected={selectedProvider === provider.id}
          onSelect={() => onSelectProvider(provider.id)}
          language={language}
          colors={colors}
        />
      ))}

      {others.length > 0 && (
        <>
          <div
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textSecondary,
              borderTop: `1px solid ${colors.borderLight}`,
              paddingTop: spacing.md,
              marginTop: spacing.sm,
            }}
          >
            {language === "zh-CN" ? "其他供应商" : "Other Providers"}
          </div>
          {others.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isSelected={selectedProvider === provider.id}
              onSelect={() => onSelectProvider(provider.id)}
              language={language}
              colors={colors}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  isSelected,
  onSelect,
  language,
  colors,
}: {
  provider: IpcPresetProvider;
  isSelected: boolean;
  onSelect: () => void;
  language: AppLanguage;
  colors: ColorTokens;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing.sm,
        padding: spacing.lg,
        border: `2px solid ${isSelected ? colors.accent : colors.border}`,
        borderRadius: borderRadius.lg,
        backgroundColor: isSelected ? `${colors.accent}11` : colors.bgPrimary,
        cursor: "pointer",
        transition: `all ${transitions.duration} ${transitions.easing}`,
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: typography.fontSizeLg,
            fontWeight: typography.fontWeightMedium,
            color: colors.textPrimary,
          }}
        >
          {provider.name}
        </div>
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
          }}
        >
          {provider.models.length} {TEXT.models[language]}
        </div>
      </div>

      <div style={{ display: "flex", gap: spacing.md, flexWrap: "wrap" }}>
        <a
          href={provider.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.accent,
            textDecoration: "none",
          }}
        >
          {TEXT.signUp[language]} →
        </a>
        <a
          href={provider.pricingRef}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.accent,
            textDecoration: "none",
          }}
        >
          {TEXT.pricing[language]} →
        </a>
      </div>
    </button>
  );
}
