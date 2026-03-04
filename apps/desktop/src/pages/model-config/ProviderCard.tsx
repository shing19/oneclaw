import { useState, useCallback } from "react";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcError } from "@/ipc/client";
import type { IpcProviderSummary, IpcProviderHealth } from "@/ipc/methods/model";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import ErrorAlert from "@/components/ErrorAlert";

interface ProviderCardProps {
  provider: IpcProviderSummary;
  colors: ColorTokens;
  language: "zh-CN" | "en";
  hasApiKey: boolean;
  onApiKeySaved: (providerId: string) => void;
  onToggleEnabled: (providerId: string, enabled: boolean) => void;
  onSelectModel: (providerId: string, modelId: string) => void;
}

function HealthDot({
  status,
  colors,
}: {
  status: IpcProviderHealth["status"];
  colors: ColorTokens;
}): React.JSX.Element {
  const color =
    status === "ok"
      ? colors.success
      : status === "degraded"
        ? colors.warning
        : colors.error;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: status === "ok" ? `0 0 4px ${color}` : "none",
      }}
    />
  );
}

function HealthLabel({
  health,
  language,
  colors,
}: {
  health: IpcProviderHealth;
  language: "zh-CN" | "en";
  colors: ColorTokens;
}): React.JSX.Element {
  const labels: Record<IpcProviderHealth["status"], { zh: string; en: string }> = {
    ok: { zh: "正常", en: "Healthy" },
    degraded: { zh: "降级", en: "Degraded" },
    unreachable: { zh: "不可达", en: "Unreachable" },
  };
  const label = language === "zh-CN" ? labels[health.status].zh : labels[health.status].en;
  return (
    <span style={{ fontSize: typography.fontSizeSm, color: colors.textSecondary }}>
      {label}
      {health.latencyMs > 0 ? ` (${health.latencyMs}ms)` : ""}
    </span>
  );
}

export default function ProviderCard({
  provider,
  colors,
  language,
  hasApiKey,
  onApiKeySaved,
  onToggleEnabled,
  onSelectModel,
}: ProviderCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<IpcProviderHealth | null>(null);
  const [cardError, setCardError] = useState<IpcError | null>(null);

  const handleSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    setCardError(null);
    const result = await ipcCallSafe("secret.set", {
      key: `oneclaw/provider/${provider.id}/api-key`,
      value: apiKeyInput.trim(),
    });
    if (result.ok) {
      setApiKeyInput("");
      onApiKeySaved(provider.id);
    } else {
      setCardError(result.error);
    }
    setSavingKey(false);
  }, [apiKeyInput, provider.id, onApiKeySaved]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setCardError(null);
    const result = await ipcCallSafe("model.testProvider", { providerId: provider.id });
    if (result.ok) {
      setTestResult(result.data.health);
    } else {
      setCardError(result.error);
    }
    setTesting(false);
  }, [provider.id]);

  const t = language === "zh-CN"
    ? {
        models: "模型",
        apiKey: "API 密钥",
        apiKeySet: "已配置",
        apiKeyNotSet: "未配置",
        save: "保存",
        saving: "保存中...",
        test: "测试连接",
        testing: "测试中...",
        endpoint: "API 端点",
        enabled: "已启用",
        disabled: "已禁用",
        expand: "展开",
        collapse: "收起",
        contextWindow: "上下文窗口",
        quota: "配额",
        used: "已用",
        unlimited: "无限制",
      }
    : {
        models: "Models",
        apiKey: "API Key",
        apiKeySet: "Configured",
        apiKeyNotSet: "Not configured",
        save: "Save",
        saving: "Saving...",
        test: "Test Connection",
        testing: "Testing...",
        endpoint: "API Endpoint",
        enabled: "Enabled",
        disabled: "Disabled",
        expand: "Expand",
        collapse: "Collapse",
        contextWindow: "Context Window",
        quota: "Quota",
        used: "Used",
        unlimited: "Unlimited",
      };

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        border: `1px solid ${provider.enabled ? colors.borderLight : colors.border}`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
        overflow: "hidden",
      }}
    >
      {/* Card Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.md,
          padding: `${spacing.lg}px ${spacing.xl}px`,
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Provider logo placeholder + name */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: borderRadius.md,
            backgroundColor: colors.accent + "18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: typography.fontSizeLg,
            fontWeight: typography.fontWeightBold,
            color: colors.accent,
            flexShrink: 0,
          }}
        >
          {provider.name.charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
            <span
              style={{
                fontSize: typography.fontSizeBase,
                fontWeight: typography.fontWeightMedium,
                color: colors.textPrimary,
              }}
            >
              {provider.name}
            </span>
            <HealthDot status={provider.health.status} colors={colors} />
            <HealthLabel health={provider.health} language={language} colors={colors} />
          </div>
          <div
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textSecondary,
              marginTop: 2,
            }}
          >
            {provider.models.length} {t.models}
            {" · "}
            {hasApiKey ? t.apiKeySet : t.apiKeyNotSet}
          </div>
        </div>

        {/* Enable/disable toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleEnabled(provider.id, !provider.enabled);
          }}
          style={{
            padding: `${spacing.xs}px ${spacing.md}px`,
            fontSize: typography.fontSizeSm,
            fontFamily: "inherit",
            color: provider.enabled ? colors.success : colors.textDisabled,
            backgroundColor: "transparent",
            border: `1px solid ${provider.enabled ? colors.success : colors.border}`,
            borderRadius: borderRadius.sm,
            cursor: "pointer",
            transition: `all ${transitions.duration} ${transitions.easing}`,
          }}
        >
          {provider.enabled ? t.enabled : t.disabled}
        </button>

        {/* Expand chevron */}
        <span
          style={{
            color: colors.textSecondary,
            fontSize: typography.fontSizeSm,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform ${transitions.duration} ${transitions.easing}`,
            display: "inline-block",
          }}
        >
          ▼
        </span>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div
          style={{
            borderTop: `1px solid ${colors.borderLight}`,
            padding: `${spacing.lg}px ${spacing.xl}px`,
            display: "flex",
            flexDirection: "column",
            gap: spacing.lg,
          }}
        >
          {/* API Key section */}
          <div>
            <div
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
                fontWeight: typography.fontWeightMedium,
              }}
            >
              {t.apiKey}
            </div>
            <div style={{ display: "flex", gap: spacing.sm }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={hasApiKey ? "••••••••" : "sk-..."}
                style={{
                  flex: 1,
                  padding: `${spacing.sm}px ${spacing.md}px`,
                  fontSize: typography.fontSizeBase,
                  fontFamily: "inherit",
                  color: colors.textPrimary,
                  backgroundColor: colors.bgPrimary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={(): void => { void handleSaveApiKey(); }}
                disabled={savingKey || !apiKeyInput.trim()}
                style={{
                  padding: `${spacing.sm}px ${spacing.lg}px`,
                  fontSize: typography.fontSizeBase,
                  fontFamily: "inherit",
                  color: "#ffffff",
                  backgroundColor: savingKey || !apiKeyInput.trim() ? colors.textDisabled : colors.accent,
                  border: "none",
                  borderRadius: borderRadius.sm,
                  cursor: savingKey || !apiKeyInput.trim() ? "not-allowed" : "pointer",
                  transition: `all ${transitions.duration} ${transitions.easing}`,
                }}
              >
                {savingKey ? t.saving : t.save}
              </button>
            </div>
          </div>

          {/* Endpoint display */}
          <div>
            <div
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
                fontWeight: typography.fontWeightMedium,
              }}
            >
              {t.endpoint}
            </div>
            <div
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                fontSize: typography.fontSizeSm,
                color: colors.textSecondary,
                backgroundColor: colors.bgPrimary,
                border: `1px solid ${colors.borderLight}`,
                borderRadius: borderRadius.sm,
                fontFamily: "monospace",
              }}
            >
              {/* Provider base URL is in config, show a read-only display */}
              {provider.id}
            </div>
          </div>

          {/* Test connection */}
          <div style={{ display: "flex", alignItems: "center", gap: spacing.md }}>
            <button
              type="button"
              onClick={(): void => { void handleTestConnection(); }}
              disabled={testing}
              style={{
                padding: `${spacing.sm}px ${spacing.lg}px`,
                fontSize: typography.fontSizeBase,
                fontFamily: "inherit",
                color: colors.accent,
                backgroundColor: "transparent",
                border: `1px solid ${colors.accent}`,
                borderRadius: borderRadius.sm,
                cursor: testing ? "not-allowed" : "pointer",
                transition: `all ${transitions.duration} ${transitions.easing}`,
                opacity: testing ? 0.7 : 1,
              }}
            >
              {testing ? t.testing : t.test}
            </button>
            {testResult && (
              <span style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
                <HealthDot status={testResult.status} colors={colors} />
                <HealthLabel health={testResult} language={language} colors={colors} />
              </span>
            )}
          </div>

          {/* Quota info */}
          {provider.quota.type !== "unknown" && (
            <div
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.textSecondary,
              }}
            >
              {t.quota}: {t.used} ¥{provider.quota.estimatedCostYuan.toFixed(2)}
              {provider.quota.limit !== null
                ? ` / ¥${provider.quota.limit.toFixed(2)}`
                : ` (${t.unlimited})`}
            </div>
          )}

          {/* Error feedback */}
          {cardError && (
            <ErrorAlert
              code={cardError.code}
              message={cardError.message}
              recoverable={cardError.recoverable}
              language={language}
              colors={colors}
              onDismiss={() => setCardError(null)}
              compact
            />
          )}

          {/* Model list */}
          <div>
            <div
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.textSecondary,
                marginBottom: spacing.sm,
                fontWeight: typography.fontWeightMedium,
              }}
            >
              {t.models}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: spacing.xs }}>
              {provider.models.map((model) => (
                <div
                  key={model.id}
                  onClick={() => onSelectModel(provider.id, model.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    backgroundColor: colors.bgPrimary,
                    border: `1px solid ${colors.borderLight}`,
                    borderRadius: borderRadius.sm,
                    cursor: "pointer",
                    transition: `background-color ${transitions.duration} ${transitions.easing}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: typography.fontSizeBase,
                      color: colors.textPrimary,
                    }}
                  >
                    {model.name}
                  </span>
                  {model.contextWindow && (
                    <span
                      style={{
                        fontSize: typography.fontSizeSm,
                        color: colors.textSecondary,
                      }}
                    >
                      {t.contextWindow}: {(model.contextWindow / 1000).toFixed(0)}K
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
