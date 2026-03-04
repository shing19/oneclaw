import { useState, useCallback } from "react";
import { spacing, typography, zIndex } from "@/theme";
import { useTheme } from "@/hooks";
import { useConfigStore } from "@/stores";
import { ipcCallSafe } from "@/ipc/client";
import WizardProgress from "./WizardProgress";
import WizardShell from "./WizardShell";
import LanguageStep from "./steps/LanguageStep";
import UseCaseStep from "./steps/UseCaseStep";
import ModelPlanStep from "./steps/ModelPlanStep";
import ProviderStep from "./steps/ProviderStep";
import ConfigStep from "./steps/ConfigStep";
import ChannelStep from "./steps/ChannelStep";
import TestStep from "./steps/TestStep";
import type { AppLanguage } from "@/stores/config-store";
import type { UseCase } from "./steps/UseCaseStep";
import type { ModelPlan } from "./steps/ModelPlanStep";

const TOTAL_STEPS = 7;

const STEP_LABELS: Record<AppLanguage, string[]> = {
  "zh-CN": ["语言", "场景", "方案", "供应商", "配置", "通信", "完成"],
  en: ["Language", "Scenario", "Plan", "Provider", "Config", "Channel", "Done"],
};

const STEP_TITLES: Record<AppLanguage, { title: string; subtitle?: string }[]> = {
  "zh-CN": [
    { title: "选择语言", subtitle: "OneClaw 支持中文和英文" },
    { title: "选择使用场景", subtitle: "帮助我们推荐最合适的配置" },
    { title: "选择模型方案", subtitle: "选择最适合你的付费方式" },
    { title: "选择供应商并注册", subtitle: "根据你的方案推荐合适的供应商" },
    { title: "填入配置信息", subtitle: "输入 API Key 并验证连接" },
    { title: "配置通信渠道", subtitle: "设置飞书机器人（可跳过）" },
    { title: "确认一切正常", subtitle: "发送测试消息验证配置" },
  ],
  en: [
    { title: "Select Language", subtitle: "OneClaw supports Chinese and English" },
    { title: "Choose Your Scenario", subtitle: "Help us recommend the best configuration" },
    { title: "Choose a Model Plan", subtitle: "Pick the pricing model that works for you" },
    { title: "Choose a Provider & Sign Up", subtitle: "Recommended providers based on your plan" },
    { title: "Enter Configuration", subtitle: "Input your API Key and validate the connection" },
    { title: "Configure Communication", subtitle: "Set up Feishu bot (optional)" },
    { title: "Confirm Everything Works", subtitle: "Send a test message to verify setup" },
  ],
};

const BUTTON_TEXT: Record<AppLanguage, { next: string; back: string; skip: string; finish: string }> = {
  "zh-CN": { next: "下一步", back: "上一步", skip: "跳过", finish: "完成" },
  en: { next: "Next", back: "Back", skip: "Skip", finish: "Finish" },
};

interface SetupWizardPageProps {
  onComplete: () => void;
}

export default function SetupWizardPage({
  onComplete,
}: SetupWizardPageProps): React.JSX.Element {
  const { colors } = useTheme();
  const language = useConfigStore((s) => s.language);
  const setLanguage = useConfigStore((s) => s.setLanguage);

  const [currentStep, setCurrentStep] = useState(0);

  // Step state
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [modelPlan, setModelPlan] = useState<ModelPlan | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [_configValidated, setConfigValidated] = useState(false);
  const [channelConnected, setChannelConnected] = useState(false);

  const handleLanguageChange = useCallback(
    (lang: AppLanguage) => {
      setSelectedLanguage(lang);
      setLanguage(lang);
    },
    [setLanguage],
  );

  const handleNext = useCallback(() => {
    if (currentStep === 0) {
      // Save language preference
      void ipcCallSafe("config.update", {
        patch: { general: { language: selectedLanguage, theme: "system", workspace: "" } },
      });
    }

    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      // Last step — finish wizard
      onComplete();
    }
  }, [currentStep, selectedLanguage, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep]);

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const stepInfo = STEP_TITLES[selectedLanguage][currentStep] ?? { title: "", subtitle: "" };
  const buttons = BUTTON_TEXT[selectedLanguage];

  // Determine if Next button should be disabled
  const isNextDisabled = (() => {
    switch (currentStep) {
      case 1:
        return useCase === null;
      case 2:
        return modelPlan === null;
      case 3:
        return selectedProvider === null;
      default:
        return false;
    }
  })();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: zIndex.overlay,
        backgroundColor: colors.bgPrimary,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Logo / brand area */}
      <div
        style={{
          textAlign: "center",
          padding: `${spacing.xl}px 0 ${spacing.sm}px`,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
          }}
        >
          OneClaw
        </div>
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
          }}
        >
          {selectedLanguage === "zh-CN"
            ? "一键安装的个人 AI Agent 平台"
            : "One-click Personal AI Agent Platform"}
        </div>
      </div>

      {/* Progress indicator */}
      <WizardProgress
        currentStep={currentStep}
        totalSteps={TOTAL_STEPS}
        stepLabels={STEP_LABELS[selectedLanguage]}
        colors={colors}
      />

      {/* Step content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: `0 ${spacing.xl}px ${spacing.xl}px`,
          display: "flex",
        }}
      >
        <WizardShell
          title={stepInfo.title}
          subtitle={stepInfo.subtitle}
          colors={colors}
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          onNext={handleNext}
          onBack={handleBack}
          onSkip={handleSkip}
          nextLabel={isLastStep ? buttons.finish : buttons.next}
          backLabel={buttons.back}
          skipLabel={buttons.skip}
          nextDisabled={isNextDisabled}
          showBack={currentStep > 0}
          isLastStep={isLastStep}
        >
          {currentStep === 0 && (
            <LanguageStep
              value={selectedLanguage}
              onChange={handleLanguageChange}
              colors={colors}
            />
          )}
          {currentStep === 1 && (
            <UseCaseStep
              value={useCase}
              onChange={setUseCase}
              language={selectedLanguage}
              colors={colors}
            />
          )}
          {currentStep === 2 && (
            <ModelPlanStep
              value={modelPlan}
              onChange={setModelPlan}
              language={selectedLanguage}
              colors={colors}
            />
          )}
          {currentStep === 3 && modelPlan !== null && (
            <ProviderStep
              modelPlan={modelPlan}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
              language={selectedLanguage}
              colors={colors}
            />
          )}
          {currentStep === 4 && (
            <ConfigStep
              providerId={selectedProvider}
              language={selectedLanguage}
              colors={colors}
              onValidated={setConfigValidated}
            />
          )}
          {currentStep === 5 && (
            <ChannelStep
              language={selectedLanguage}
              colors={colors}
              onConnected={setChannelConnected}
            />
          )}
          {currentStep === 6 && (
            <TestStep
              channelConfigured={channelConnected}
              language={selectedLanguage}
              colors={colors}
            />
          )}
        </WizardShell>
      </div>
    </div>
  );
}
