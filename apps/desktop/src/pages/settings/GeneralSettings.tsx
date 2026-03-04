import { useCallback } from "react";
import type { ColorTokens } from "@/theme";
import { spacing, typography, borderRadius, transitions } from "@/theme";
import type { AppLanguage, AppTheme } from "@/stores/config-store";
import { ipcCallSafe } from "@/ipc/client";

interface GeneralSettingsProps {
  language: AppLanguage;
  theme: AppTheme;
  workspaceDir: string | null;
  onLanguageChange: (lang: AppLanguage) => void;
  onThemeChange: (theme: AppTheme) => void;
  onWorkspaceDirChange: (dir: string | null) => void;
  colors: ColorTokens;
}

const T = {
  "zh-CN": {
    title: "通用设置",
    languageLabel: "界面语言",
    themeLabel: "主题模式",
    workspaceLabel: "工作目录",
    workspacePlaceholder: "默认: ~/.oneclaw",
    workspaceHint: "Agent 运行时的工作目录",
    themSystem: "跟随系统",
    themeLight: "浅色",
    themeDark: "深色",
    langZh: "简体中文",
    langEn: "English",
  },
  en: {
    title: "General Settings",
    languageLabel: "Interface Language",
    themeLabel: "Theme Mode",
    workspaceLabel: "Workspace Directory",
    workspacePlaceholder: "Default: ~/.oneclaw",
    workspaceHint: "Working directory for the agent runtime",
    themSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    langZh: "简体中文",
    langEn: "English",
  },
} as const;

const selectStyle = (colors: ColorTokens): React.CSSProperties => ({
  padding: `${spacing.sm}px ${spacing.md}px`,
  fontSize: typography.fontSizeBase,
  fontFamily: "inherit",
  color: colors.textPrimary,
  backgroundColor: colors.bgPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: borderRadius.md,
  cursor: "pointer",
  transition: `all ${transitions.duration} ${transitions.easing}`,
  outline: "none",
  minWidth: 160,
});

const inputStyle = (colors: ColorTokens): React.CSSProperties => ({
  padding: `${spacing.sm}px ${spacing.md}px`,
  fontSize: typography.fontSizeBase,
  fontFamily: "inherit",
  color: colors.textPrimary,
  backgroundColor: colors.bgPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: borderRadius.md,
  transition: `all ${transitions.duration} ${transitions.easing}`,
  outline: "none",
  flex: 1,
  minWidth: 200,
});

export default function GeneralSettings({
  language,
  theme,
  workspaceDir,
  onLanguageChange,
  onThemeChange,
  onWorkspaceDirChange,
  colors,
}: GeneralSettingsProps): React.JSX.Element {
  const t = T[language];

  const persistConfig = useCallback(
    async (patch: Record<string, unknown>) => {
      await ipcCallSafe("config.update", {
        patch: { general: patch } as never,
      });
    },
    [],
  );

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const lang = e.target.value as AppLanguage;
      onLanguageChange(lang);
      void persistConfig({ language: lang });
    },
    [onLanguageChange, persistConfig],
  );

  const handleThemeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const th = e.target.value as AppTheme;
      onThemeChange(th);
      void persistConfig({ theme: th });
    },
    [onThemeChange, persistConfig],
  );

  const handleWorkspaceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const dir = e.target.value.trim() || null;
      onWorkspaceDirChange(dir);
      void persistConfig({ workspace: dir ?? "" });
    },
    [onWorkspaceDirChange, persistConfig],
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

      {/* Language */}
      <div style={{ marginBottom: spacing.xl }}>
        <label
          style={{
            display: "block",
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            marginBottom: spacing.xs,
            fontWeight: typography.fontWeightMedium,
          }}
        >
          {t.languageLabel}
        </label>
        <select
          value={language}
          onChange={handleLanguageChange}
          style={selectStyle(colors)}
        >
          <option value="zh-CN">{t.langZh}</option>
          <option value="en">{t.langEn}</option>
        </select>
      </div>

      {/* Theme */}
      <div style={{ marginBottom: spacing.xl }}>
        <label
          style={{
            display: "block",
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            marginBottom: spacing.xs,
            fontWeight: typography.fontWeightMedium,
          }}
        >
          {t.themeLabel}
        </label>
        <select
          value={theme}
          onChange={handleThemeChange}
          style={selectStyle(colors)}
        >
          <option value="system">{t.themSystem}</option>
          <option value="light">{t.themeLight}</option>
          <option value="dark">{t.themeDark}</option>
        </select>
      </div>

      {/* Workspace directory */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: typography.fontSizeSm,
            color: colors.textSecondary,
            marginBottom: spacing.xs,
            fontWeight: typography.fontWeightMedium,
          }}
        >
          {t.workspaceLabel}
        </label>
        <input
          type="text"
          value={workspaceDir ?? ""}
          onChange={handleWorkspaceChange}
          placeholder={t.workspacePlaceholder}
          style={inputStyle(colors)}
        />
        <div
          style={{
            fontSize: typography.fontSizeSm,
            color: colors.textDisabled,
            marginTop: spacing.xs,
          }}
        >
          {t.workspaceHint}
        </div>
      </div>
    </div>
  );
}
