import { useEffect, useState, useCallback } from "react";
import { useModelStore } from "@/stores/model-store";
import { useConfigStore } from "@/stores/config-store";
import { useTheme } from "@/hooks/use-theme";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcProviderSummary } from "@/ipc/methods/model";
import type { IpcModelSettings } from "@/ipc/methods/config";
import { spacing, typography } from "@/theme";
import ProviderCard from "./ProviderCard";
import FallbackChain from "./FallbackChain";
import ModelSettingsPanel from "./ModelSettingsPanel";

interface SelectedModel {
  providerId: string;
  modelId: string;
  modelName: string;
}

export default function ModelConfigPage(): React.JSX.Element {
  const { colors } = useTheme();
  const language = useConfigStore((s) => s.language);

  const fallbackChain = useModelStore((s) => s.fallbackChain);
  const setProviders = useModelStore((s) => s.setProviders);
  const setFallbackChain = useModelStore((s) => s.setFallbackChain);

  const [providerDetails, setProviderDetails] = useState<readonly IpcProviderSummary[]>([]);
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [perModelSettings, setPerModelSettings] = useState<Record<string, IpcModelSettings>>({});
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);

  // Fetch data on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchData(): Promise<void> {
      const [listResult, configResult, secretsResult] = await Promise.all([
        ipcCallSafe("model.list", {} as Record<string, never>),
        ipcCallSafe("config.get", {} as Record<string, never>),
        ipcCallSafe("secret.list", {} as Record<string, never>),
      ]);

      if (cancelled) return;

      if (listResult.ok) {
        setProviderDetails(listResult.data.providers);
        setFallbackChain(listResult.data.fallbackChain);
        setProviders(
          listResult.data.providers.map((p) => ({
            id: p.id,
            name: p.name,
            enabled: p.enabled,
          })),
        );
      }

      if (configResult.ok) {
        setPerModelSettings(configResult.data.models.perModelSettings);
      }

      if (secretsResult.ok) {
        const keyMap: Record<string, boolean> = {};
        for (const key of secretsResult.data.keys) {
          const match = /^oneclaw\/provider\/([^/]+)\/api-key$/.exec(key);
          if (match?.[1]) {
            keyMap[match[1]] = true;
          }
        }
        setApiKeyStatus(keyMap);
      }
    }

    void fetchData();
    return (): void => {
      cancelled = true;
    };
  }, [setProviders, setFallbackChain]);

  const handleReorder = useCallback(
    async (newChain: string[]) => {
      setFallbackChain(newChain);
      const result = await ipcCallSafe("model.setFallbackChain", { chain: newChain });
      if (!result.ok) {
        // Revert on failure
        const listResult = await ipcCallSafe("model.list", {} as Record<string, never>);
        if (listResult.ok) {
          setFallbackChain(listResult.data.fallbackChain);
        }
      }
    },
    [setFallbackChain],
  );

  const handleApiKeySaved = useCallback((providerId: string) => {
    setApiKeyStatus((prev) => ({ ...prev, [providerId]: true }));
  }, []);

  const handleToggleEnabled = useCallback(
    async (providerId: string, enabled: boolean) => {
      // Optimistic update
      setProviderDetails((prev) =>
        prev.map((p) => (p.id === providerId ? { ...p, enabled } : p)),
      );

      const configResult = await ipcCallSafe("config.get", {} as Record<string, never>);
      if (!configResult.ok) return;

      const updatedProviders = configResult.data.models.providers.map((p) =>
        p.id === providerId ? { ...p, enabled } : p,
      );

      await ipcCallSafe("config.update", {
        patch: {
          models: {
            ...configResult.data.models,
            providers: updatedProviders,
          },
        },
      });
    },
    [],
  );

  const handleSelectModel = useCallback(
    (providerId: string, modelId: string) => {
      const provider = providerDetails.find((p) => p.id === providerId);
      const model = provider?.models.find((m) => m.id === modelId);
      if (model) {
        setSelectedModel({
          providerId,
          modelId,
          modelName: model.name,
        });
      }
    },
    [providerDetails],
  );

  const handleSaveModelSettings = useCallback(
    async (providerId: string, modelId: string, settings: IpcModelSettings) => {
      const settingsKey = `${providerId}/${modelId}`;
      const newSettings = { ...perModelSettings, [settingsKey]: settings };
      setPerModelSettings(newSettings);
      setSelectedModel(null);

      const configResult = await ipcCallSafe("config.get", {} as Record<string, never>);
      if (!configResult.ok) return;

      await ipcCallSafe("config.update", {
        patch: {
          models: {
            ...configResult.data.models,
            perModelSettings: newSettings,
          },
        },
      });
    },
    [perModelSettings],
  );

  // Build provider name map for fallback chain display
  const providerNames: Record<string, string> = {};
  for (const p of providerDetails) {
    providerNames[p.id] = p.name;
  }

  const t = language === "zh-CN"
    ? {
        title: "模型配置",
        subtitle: "供应商管理与 Fallback 链配置",
        providers: "供应商列表",
      }
    : {
        title: "Model Configuration",
        subtitle: "Provider management and fallback chain setup",
        providers: "Providers",
      };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing.xl,
        height: "100%",
      }}
    >
      {/* Page header */}
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: typography.fontSizeXl,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
          }}
        >
          {t.title}
        </h1>
        <div
          style={{
            fontSize: typography.fontSizeBase,
            color: colors.textSecondary,
            marginTop: spacing.xs,
          }}
        >
          {t.subtitle}
        </div>
      </div>

      {/* Fallback chain */}
      <FallbackChain
        chain={[...fallbackChain]}
        providerNames={providerNames}
        colors={colors}
        language={language}
        onReorder={(newChain): void => { void handleReorder(newChain); }}
      />

      {/* Provider cards */}
      <div>
        <div
          style={{
            fontSize: typography.fontSizeLg,
            fontWeight: typography.fontWeightMedium,
            color: colors.textPrimary,
            marginBottom: spacing.lg,
          }}
        >
          {t.providers}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: spacing.md }}>
          {providerDetails.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              colors={colors}
              language={language}
              hasApiKey={apiKeyStatus[provider.id] ?? false}
              onApiKeySaved={handleApiKeySaved}
              onToggleEnabled={(id, enabled): void => { void handleToggleEnabled(id, enabled); }}
              onSelectModel={handleSelectModel}
            />
          ))}
        </div>
      </div>

      {/* Model settings drawer */}
      {selectedModel && (
        <ModelSettingsPanel
          providerId={selectedModel.providerId}
          modelId={selectedModel.modelId}
          modelName={selectedModel.modelName}
          settings={
            perModelSettings[`${selectedModel.providerId}/${selectedModel.modelId}`] ?? {}
          }
          colors={colors}
          language={language}
          onSave={(pId, mId, s): void => { void handleSaveModelSettings(pId, mId, s); }}
          onClose={() => setSelectedModel(null)}
        />
      )}
    </div>
  );
}
