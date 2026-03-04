import { useEffect, useCallback, useState } from "react";
import { useConfigStore } from "@/stores";
import { useTheme } from "@/hooks";
import { spacing, typography } from "@/theme";
import { ipcCallSafe } from "@/ipc/client";
import GeneralSettings from "./GeneralSettings";
import SecurityOverview from "./SecurityOverview";
import DoctorPanel from "./DoctorPanel";
import AboutSection from "./AboutSection";

export default function SettingsPage(): React.JSX.Element {
  const { colors } = useTheme();
  const language = useConfigStore((s) => s.language);
  const theme = useConfigStore((s) => s.theme);
  const workspaceDir = useConfigStore((s) => s.workspaceDir);
  const setLanguage = useConfigStore((s) => s.setLanguage);
  const setTheme = useConfigStore((s) => s.setTheme);
  const setWorkspaceDir = useConfigStore((s) => s.setWorkspaceDir);

  const [secretKeys, setSecretKeys] = useState<string[]>([]);

  const fetchSecrets = useCallback(async () => {
    const result = await ipcCallSafe("secret.list", {} as Record<string, never>);
    if (result.ok) {
      setSecretKeys(result.data.keys);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const result = await ipcCallSafe("config.get", {} as Record<string, never>);
    if (result.ok) {
      setLanguage(result.data.general.language);
      setTheme(result.data.general.theme);
      setWorkspaceDir(result.data.general.workspace || null);
    }
  }, [setLanguage, setTheme, setWorkspaceDir]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([fetchConfig(), fetchSecrets()]);
    return () => controller.abort();
  }, [fetchConfig, fetchSecrets]);

  const pageTitle = language === "zh-CN" ? "设置" : "Settings";

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          fontSize: typography.fontSizeXl,
          fontWeight: typography.fontWeightBold,
          color: colors.textPrimary,
          marginBottom: spacing.xl,
        }}
      >
        {pageTitle}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: spacing.xl }}>
        <GeneralSettings
          language={language}
          theme={theme}
          workspaceDir={workspaceDir}
          onLanguageChange={setLanguage}
          onThemeChange={setTheme}
          onWorkspaceDirChange={setWorkspaceDir}
          colors={colors}
        />

        <SecurityOverview
          secretKeys={secretKeys}
          onRefresh={(): void => {
            void fetchSecrets();
          }}
          colors={colors}
          language={language}
        />

        <DoctorPanel colors={colors} language={language} />

        <AboutSection colors={colors} language={language} />
      </div>
    </div>
  );
}
