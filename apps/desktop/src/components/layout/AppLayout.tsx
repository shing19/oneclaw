import { useState } from "react";
import { useConfigStore } from "@/stores";
import { useTheme } from "@/hooks/use-theme";
import { typography } from "@/theme";
import DashboardPage from "@/pages/dashboard";
import ModelConfigPage from "@/pages/model-config";
import ChannelConfigPage from "@/pages/channel-config";
import SettingsPage from "@/pages/settings";
import IconRail from "./IconRail";
import Sidebar from "./Sidebar";
import ContentPanel from "./ContentPanel";
import type { PageId } from "./types";

const PAGE_COMPONENTS: Record<PageId, React.ComponentType> = {
  dashboard: DashboardPage,
  "model-config": ModelConfigPage,
  "channel-config": ChannelConfigPage,
  settings: SettingsPage,
};

export default function AppLayout(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const theme = useTheme();
  const language = useConfigStore((s) => s.language);
  const PageComponent = PAGE_COMPONENTS[activePage];

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSizeBase,
        lineHeight: typography.lineHeight,
      }}
    >
      <IconRail
        activePage={activePage}
        onNavigate={setActivePage}
        theme={theme}
      />
      <Sidebar activePage={activePage} theme={theme} language={language} />
      <ContentPanel theme={theme}>
        <PageComponent />
      </ContentPanel>
    </div>
  );
}
