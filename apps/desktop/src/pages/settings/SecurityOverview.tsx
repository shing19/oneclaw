import { useState, useCallback } from "react";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { AppLanguage } from "@/stores/config-store";
import { ipcCallSafe } from "@/ipc/client";

interface SecurityOverviewProps {
  secretKeys: string[];
  onRefresh: () => void;
  colors: ColorTokens;
  language: AppLanguage;
}

const T = {
  "zh-CN": {
    title: "安全概览",
    keystoreLabel: "密钥存储",
    keystoreActive: "已启用",
    keystoreDescription: "敏感凭据通过系统密钥链安全存储",
    storedSecrets: "已存储密钥",
    secretCount: (n: number) => `${n} 个密钥`,
    noSecrets: "暂无存储密钥",
    deleteConfirm: "确认删除此密钥？",
    delete: "删除",
    refresh: "刷新",
    secretNeverExposed: "密钥值不会在界面中显示",
  },
  en: {
    title: "Security Overview",
    keystoreLabel: "Keystore",
    keystoreActive: "Active",
    keystoreDescription: "Sensitive credentials are securely stored via system keychain",
    storedSecrets: "Stored Secrets",
    secretCount: (n: number) => `${n} secret${n === 1 ? "" : "s"}`,
    noSecrets: "No stored secrets",
    deleteConfirm: "Delete this secret?",
    delete: "Delete",
    refresh: "Refresh",
    secretNeverExposed: "Secret values are never displayed in the UI",
  },
} as const;

function SecretKeyItem({
  secretKey,
  colors,
  language,
  onDelete,
}: {
  secretKey: string;
  colors: ColorTokens;
  language: AppLanguage;
  onDelete: (key: string) => void;
}): React.JSX.Element {
  const t = T[language];
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(() => {
    if (!deleting) {
      setDeleting(true);
      return;
    }
    onDelete(secretKey);
    setDeleting(false);
  }, [deleting, onDelete, secretKey]);

  const handleCancelDelete = useCallback(() => {
    setDeleting(false);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderBottom: `1px solid ${colors.borderLight}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
        <span
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            fontFamily: "monospace",
          }}
        >
          {secretKey}
        </span>
      </div>
      <div style={{ display: "flex", gap: spacing.xs }}>
        {deleting ? (
          <>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                padding: `2px ${spacing.sm}px`,
                fontSize: typography.fontSizeSm,
                fontFamily: "inherit",
                color: "#ffffff",
                backgroundColor: colors.error,
                border: "none",
                borderRadius: borderRadius.sm,
                cursor: "pointer",
              }}
            >
              {t.deleteConfirm}
            </button>
            <button
              type="button"
              onClick={handleCancelDelete}
              style={{
                padding: `2px ${spacing.sm}px`,
                fontSize: typography.fontSizeSm,
                fontFamily: "inherit",
                color: colors.textSecondary,
                backgroundColor: "transparent",
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.sm,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleDelete}
            style={{
              padding: `2px ${spacing.sm}px`,
              fontSize: typography.fontSizeSm,
              fontFamily: "inherit",
              color: colors.error,
              backgroundColor: "transparent",
              border: `1px solid ${colors.borderLight}`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {t.delete}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SecurityOverview({
  secretKeys,
  onRefresh,
  colors,
  language,
}: SecurityOverviewProps): React.JSX.Element {
  const t = T[language];

  const handleDeleteSecret = useCallback(
    async (key: string) => {
      await ipcCallSafe("secret.delete", { key });
      onRefresh();
    },
    [onRefresh],
  );

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        border: `1px solid ${colors.borderLight}`,
      }}
    >
      <div
        style={{
          fontSize: typography.fontSizeLg,
          fontWeight: typography.fontWeightBold,
          color: colors.textPrimary,
          marginBottom: spacing.xl,
        }}
      >
        {t.title}
      </div>

      {/* Keystore status */}
      <div style={{ marginBottom: spacing.xl }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            marginBottom: spacing.xs,
          }}
        >
          <span
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.textSecondary,
              fontWeight: typography.fontWeightMedium,
            }}
          >
            {t.keystoreLabel}
          </span>
          <span
            style={{
              fontSize: typography.fontSizeSm,
              color: colors.success,
              fontWeight: typography.fontWeightMedium,
              backgroundColor: `${colors.success}18`,
              padding: `1px ${spacing.sm}px`,
              borderRadius: borderRadius.sm,
            }}
          >
            {t.keystoreActive}
          </span>
        </div>
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textDisabled,
          }}
        >
          {t.keystoreDescription}
        </div>
      </div>

      {/* Stored secrets */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: spacing.md,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: spacing.sm }}>
            <span
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.textSecondary,
                fontWeight: typography.fontWeightMedium,
              }}
            >
              {t.storedSecrets}
            </span>
            <span
              style={{
                fontSize: typography.fontSizeSm,
                color: colors.textDisabled,
              }}
            >
              ({t.secretCount(secretKeys.length)})
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            style={{
              padding: `2px ${spacing.sm}px`,
              fontSize: typography.fontSizeSm,
              fontFamily: "inherit",
              color: colors.accent,
              backgroundColor: "transparent",
              border: `1px solid ${colors.borderLight}`,
              borderRadius: borderRadius.sm,
              cursor: "pointer",
              transition: `all ${transitions.duration} ${transitions.easing}`,
            }}
          >
            {t.refresh}
          </button>
        </div>

        <div
          style={{
            border: `1px solid ${colors.borderLight}`,
            borderRadius: borderRadius.md,
            overflow: "hidden",
          }}
        >
          {secretKeys.length === 0 ? (
            <div
              style={{
                padding: spacing.lg,
                textAlign: "center",
                color: colors.textDisabled,
                fontSize: typography.fontSizeSm,
              }}
            >
              {t.noSecrets}
            </div>
          ) : (
            secretKeys.map((key) => (
              <SecretKeyItem
                key={key}
                secretKey={key}
                colors={colors}
                language={language}
                onDelete={(k): void => {
                  void handleDeleteSecret(k);
                }}
              />
            ))
          )}
        </div>

        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textDisabled,
            marginTop: spacing.sm,
          }}
        >
          {t.secretNeverExposed}
        </div>
      </div>
    </div>
  );
}
