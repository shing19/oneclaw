import { useState } from "react";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { ColorTokens } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import { ipcCallSafe } from "@/ipc/client";

const TEXT = {
  apiKeyLabel: { "zh-CN": "API Key", en: "API Key" },
  apiKeyPlaceholder: {
    "zh-CN": "粘贴你从供应商获取的 API Key",
    en: "Paste the API Key from your provider",
  },
  endpointLabel: {
    "zh-CN": "API 地址（可选，通常不用修改）",
    en: "API Endpoint (optional, usually no change needed)",
  },
  endpointPlaceholder: {
    "zh-CN": "https://api.example.com/v1",
    en: "https://api.example.com/v1",
  },
  validateBtn: { "zh-CN": "验证连接", en: "Validate Connection" },
  validating: { "zh-CN": "验证中...", en: "Validating..." },
  saveBtn: { "zh-CN": "保存凭证", en: "Save Credentials" },
  saving: { "zh-CN": "保存中...", en: "Saving..." },
  saved: { "zh-CN": "凭证已保存", en: "Credentials saved" },
  success: {
    "zh-CN": "连接成功！供应商可用。",
    en: "Connection successful! Provider is reachable.",
  },
  failed: {
    "zh-CN": "连接失败，请检查 API Key 和网络。",
    en: "Connection failed. Please check your API Key and network.",
  },
  hint: {
    "zh-CN": "API Key 将加密存储在本地密钥库中，不会上传或泄露。",
    en: "API Key is encrypted and stored locally. It will never be uploaded or leaked.",
  },
} as const;

interface ConfigStepProps {
  providerId: string | null;
  language: AppLanguage;
  colors: ColorTokens;
  onValidated: (success: boolean) => void;
}

export default function ConfigStep({
  providerId,
  language,
  colors,
  onValidated,
}: ConfigStepProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationResult, setValidationResult] = useState<
    "success" | "failed" | null
  >(null);

  const handleValidate = async (): Promise<void> => {
    if (!providerId || !apiKey.trim()) return;
    setValidating(true);
    setValidationResult(null);

    // First save the key so the test can use it
    const secretKey = `oneclaw/provider/${providerId}/api-key`;
    await ipcCallSafe("secret.set", { key: secretKey, value: apiKey.trim() });

    const result = await ipcCallSafe("model.testProvider", {
      providerId,
    });
    if (result.ok && result.data.health.status !== "unreachable") {
      setValidationResult("success");
      onValidated(true);
    } else {
      setValidationResult("failed");
      onValidated(false);
    }
    setValidating(false);
  };

  const handleSave = async (): Promise<void> => {
    if (!providerId || !apiKey.trim()) return;
    setSaving(true);

    const secretKey = `oneclaw/provider/${providerId}/api-key`;
    const result = await ipcCallSafe("secret.set", {
      key: secretKey,
      value: apiKey.trim(),
    });
    if (result.ok) {
      setSaved(true);
      onValidated(true);
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bgPrimary,
    color: colors.textPrimary,
    fontSize: typography.fontSizeBase,
    outline: "none",
    transition: `border-color ${transitions.duration} ${transitions.easing}`,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: typography.fontSizeSm,
    fontWeight: typography.fontWeightMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing.lg }}>
      {/* API Key */}
      <div>
        <label style={labelStyle}>{TEXT.apiKeyLabel[language]}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={TEXT.apiKeyPlaceholder[language]}
          style={inputStyle}
        />
      </div>

      {/* Endpoint (optional) */}
      <div>
        <label style={labelStyle}>{TEXT.endpointLabel[language]}</label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={TEXT.endpointPlaceholder[language]}
          style={inputStyle}
        />
      </div>

      {/* Security hint */}
      <div
        style={{
          fontSize: typography.fontSizeSm,
          color: colors.textSecondary,
          padding: spacing.md,
          backgroundColor: colors.bgSecondary,
          borderRadius: borderRadius.md,
        }}
      >
        🔒 {TEXT.hint[language]}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: spacing.md }}>
        <button
          type="button"
          onClick={() => void handleValidate()}
          disabled={!apiKey.trim() || validating}
          style={{
            padding: `${spacing.sm}px ${spacing.lg}px`,
            border: `1px solid ${colors.accent}`,
            borderRadius: borderRadius.md,
            backgroundColor: "transparent",
            color: validating ? colors.textDisabled : colors.accent,
            cursor: !apiKey.trim() || validating ? "not-allowed" : "pointer",
            fontSize: typography.fontSizeBase,
            transition: `all ${transitions.duration} ${transitions.easing}`,
          }}
        >
          {validating ? TEXT.validating[language] : TEXT.validateBtn[language]}
        </button>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!apiKey.trim() || saving}
          style={{
            padding: `${spacing.sm}px ${spacing.lg}px`,
            border: "none",
            borderRadius: borderRadius.md,
            backgroundColor:
              !apiKey.trim() || saving ? colors.textDisabled : colors.accent,
            color: "#ffffff",
            cursor: !apiKey.trim() || saving ? "not-allowed" : "pointer",
            fontSize: typography.fontSizeBase,
            fontWeight: typography.fontWeightMedium,
            transition: `all ${transitions.duration} ${transitions.easing}`,
          }}
        >
          {saving ? TEXT.saving[language] : TEXT.saveBtn[language]}
        </button>
      </div>

      {/* Result feedback */}
      {validationResult && (
        <div
          style={{
            padding: spacing.md,
            borderRadius: borderRadius.md,
            backgroundColor:
              validationResult === "success"
                ? `${colors.success}15`
                : `${colors.error}15`,
            color:
              validationResult === "success" ? colors.success : colors.error,
            fontSize: typography.fontSizeSm,
          }}
        >
          {validationResult === "success"
            ? TEXT.success[language]
            : TEXT.failed[language]}
        </div>
      )}

      {saved && !validationResult && (
        <div
          style={{
            padding: spacing.md,
            borderRadius: borderRadius.md,
            backgroundColor: `${colors.success}15`,
            color: colors.success,
            fontSize: typography.fontSizeSm,
          }}
        >
          {TEXT.saved[language]}
        </div>
      )}
    </div>
  );
}
