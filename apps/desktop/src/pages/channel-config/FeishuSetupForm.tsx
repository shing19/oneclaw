import { useState, useCallback } from "react";
import { ipcCallSafe } from "@/ipc/client";
import type { IpcError } from "@/ipc/client";
import type { IpcTestResult, IpcChannelStatus, IpcChannelErrorInfo } from "@/ipc/methods/channel";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import ErrorAlert from "@/components/ErrorAlert";

interface FeishuSetupFormProps {
  colors: ColorTokens;
  language: "zh-CN" | "en";
  currentStatus: IpcChannelStatus;
  onSetupComplete: (testResult: IpcTestResult) => void;
  onStatusRefresh: (status: IpcChannelStatus, error?: IpcChannelErrorInfo) => void;
}

export default function FeishuSetupForm({
  colors,
  language,
  currentStatus,
  onSetupComplete,
  onStatusRefresh,
}: FeishuSetupFormProps): React.JSX.Element {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [setupResult, setSetupResult] = useState<IpcTestResult | null>(null);
  const [setupError, setSetupError] = useState<IpcError | null>(null);

  const t = language === "zh-CN"
    ? {
        title: "飞书配置",
        description: "配置飞书应用凭据以启用消息通道",
        appId: "App ID",
        appIdPlaceholder: "输入飞书应用 App ID",
        appSecret: "App Secret",
        appSecretPlaceholder: "输入飞书应用 App Secret",
        webhookUrl: "Webhook URL（可选）",
        webhookUrlPlaceholder: "https://open.feishu.cn/...",
        webhookToken: "Webhook Token（可选）",
        webhookTokenPlaceholder: "输入 Webhook 验证 Token",
        save: "保存并连接",
        saving: "配置中...",
        test: "测试连接",
        testing: "测试中...",
        required: "必填",
        optional: "可选",
        setupSuccess: "配置成功，连接已建立",
        setupFailed: "配置失败",
        testSuccess: "连接测试通过",
        testFailed: "连接测试失败",
      }
    : {
        title: "Feishu Configuration",
        description: "Configure Feishu app credentials to enable the message channel",
        appId: "App ID",
        appIdPlaceholder: "Enter Feishu App ID",
        appSecret: "App Secret",
        appSecretPlaceholder: "Enter Feishu App Secret",
        webhookUrl: "Webhook URL (optional)",
        webhookUrlPlaceholder: "https://open.feishu.cn/...",
        webhookToken: "Webhook Token (optional)",
        webhookTokenPlaceholder: "Enter Webhook verification token",
        save: "Save & Connect",
        saving: "Configuring...",
        test: "Test Connection",
        testing: "Testing...",
        required: "Required",
        optional: "Optional",
        setupSuccess: "Configuration saved, connection established",
        setupFailed: "Configuration failed",
        testSuccess: "Connection test passed",
        testFailed: "Connection test failed",
      };

  const handleSetup = useCallback(async () => {
    if (!appId.trim() || !appSecret.trim()) return;
    setSaving(true);
    setSetupError(null);
    setSetupResult(null);

    const result = await ipcCallSafe("channel.feishu.setup", {
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
      ...(webhookToken.trim() ? { webhookToken: webhookToken.trim() } : {}),
    });

    if (result.ok) {
      setSetupResult(result.data.testResult);
      setAppSecret("");
      setWebhookToken("");
      onSetupComplete(result.data.testResult);
    } else {
      setSetupError(result.error);
    }
    setSaving(false);
  }, [appId, appSecret, webhookUrl, webhookToken, onSetupComplete]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setSetupError(null);
    setSetupResult(null);

    const result = await ipcCallSafe("channel.feishu.test", {});
    if (result.ok) {
      setSetupResult(result.data);
      onStatusRefresh(result.data.status, result.data.error);
    } else {
      setSetupError(result.error);
    }
    setTesting(false);
  }, [onStatusRefresh]);

  const canSave = appId.trim() && appSecret.trim() && !saving;

  const inputStyle = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: typography.fontSizeBase,
    fontFamily: "inherit",
    color: colors.textPrimary,
    backgroundColor: colors.bgPrimary,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.sm,
    outline: "none",
    boxSizing: "border-box" as const,
    transition: `border-color ${transitions.duration} ${transitions.easing}`,
  };

  const labelStyle = {
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    display: "flex" as const,
    alignItems: "center" as const,
    gap: spacing.sm,
  };

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        border: `1px solid ${colors.borderLight}`,
        padding: `${spacing.xl}px`,
        transition: `all ${transitions.duration} ${transitions.easing}`,
      }}
    >
      {/* Section header */}
      <div style={{ marginBottom: spacing.xl }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            marginBottom: spacing.xs,
          }}
        >
          {/* Feishu icon */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: borderRadius.sm,
              backgroundColor: "#3370ff18",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: typography.fontSizeBase,
              fontWeight: typography.fontWeightBold,
              color: "#3370ff",
              flexShrink: 0,
            }}
          >
            飞
          </div>
          <span
            style={{
              fontSize: typography.fontSizeLg,
              fontWeight: typography.fontWeightMedium,
              color: colors.textPrimary,
            }}
          >
            {t.title}
          </span>
        </div>
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
          }}
        >
          {t.description}
        </div>
      </div>

      {/* Form fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
        {/* App ID */}
        <div>
          <div style={labelStyle}>
            {t.appId}
            <span
              style={{
                fontSize: 11,
                color: colors.error,
                fontWeight: typography.fontWeightNormal,
              }}
            >
              {t.required}
            </span>
          </div>
          <input
            type="text"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder={t.appIdPlaceholder}
            style={inputStyle}
          />
        </div>

        {/* App Secret */}
        <div>
          <div style={labelStyle}>
            {t.appSecret}
            <span
              style={{
                fontSize: 11,
                color: colors.error,
                fontWeight: typography.fontWeightNormal,
              }}
            >
              {t.required}
            </span>
          </div>
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder={
              currentStatus === "connected"
                ? "••••••••"
                : t.appSecretPlaceholder
            }
            style={inputStyle}
          />
        </div>

        {/* Webhook URL */}
        <div>
          <div style={labelStyle}>
            {t.webhookUrl}
            <span
              style={{
                fontSize: 11,
                color: colors.textDisabled,
                fontWeight: typography.fontWeightNormal,
              }}
            >
              {t.optional}
            </span>
          </div>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={t.webhookUrlPlaceholder}
            style={inputStyle}
          />
        </div>

        {/* Webhook Token */}
        <div>
          <div style={labelStyle}>
            {t.webhookToken}
            <span
              style={{
                fontSize: 11,
                color: colors.textDisabled,
                fontWeight: typography.fontWeightNormal,
              }}
            >
              {t.optional}
            </span>
          </div>
          <input
            type="password"
            value={webhookToken}
            onChange={(e) => setWebhookToken(e.target.value)}
            placeholder={t.webhookTokenPlaceholder}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.md,
          marginTop: spacing.xl,
        }}
      >
        {/* Save & Connect */}
        <button
          type="button"
          onClick={(): void => {
            void handleSetup();
          }}
          disabled={!canSave}
          style={{
            padding: `${spacing.sm}px ${spacing.xl}px`,
            fontSize: typography.fontSizeBase,
            fontFamily: "inherit",
            color: "#ffffff",
            backgroundColor: canSave ? colors.accent : colors.textDisabled,
            border: "none",
            borderRadius: borderRadius.sm,
            cursor: canSave ? "pointer" : "not-allowed",
            transition: `all ${transitions.duration} ${transitions.easing}`,
          }}
        >
          {saving ? t.saving : t.save}
        </button>

        {/* Test Connection (only if already configured) */}
        {currentStatus !== "disconnected" && (
          <button
            type="button"
            onClick={(): void => {
              void handleTest();
            }}
            disabled={testing}
            style={{
              padding: `${spacing.sm}px ${spacing.xl}px`,
              fontSize: typography.fontSizeBase,
              fontFamily: "inherit",
              color: colors.accent,
              backgroundColor: "transparent",
              border: `1px solid ${colors.accent}`,
              borderRadius: borderRadius.sm,
              cursor: testing ? "not-allowed" : "pointer",
              opacity: testing ? 0.7 : 1,
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {testing ? t.testing : t.test}
          </button>
        )}
      </div>

      {/* Result feedback */}
      {setupResult && (
        <div
          style={{
            marginTop: spacing.lg,
            padding: `${spacing.sm}px ${spacing.md}px`,
            backgroundColor: setupResult.success
              ? colors.success + "10"
              : colors.error + "10",
            border: `1px solid ${setupResult.success ? colors.success : colors.error}30`,
            borderRadius: borderRadius.sm,
            fontSize: typography.fontSizeSm,
            color: setupResult.success ? colors.success : colors.error,
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <span>{setupResult.success ? "✓" : "✗"}</span>
          <span>
            {setupResult.success
              ? t.setupSuccess
              : setupResult.message ?? t.setupFailed}
          </span>
          {setupResult.latencyMs > 0 && (
            <span style={{ color: colors.textSecondary }}>
              ({setupResult.latencyMs}ms)
            </span>
          )}
        </div>
      )}

      {setupError && (
        <div style={{ marginTop: spacing.lg }}>
          <ErrorAlert
            code={setupError.code}
            message={setupError.message}
            recoverable={setupError.recoverable}
            language={language}
            colors={colors}
            onDismiss={() => setSetupError(null)}
          />
        </div>
      )}
    </div>
  );
}
