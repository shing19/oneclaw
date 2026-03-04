import type { ThemeContext } from "@/hooks/use-theme";
import { layout, typography, spacing, transitions } from "@/theme";
import type { PageId } from "./types";

const PAGE_TITLES: Record<PageId, { zh: string; en: string }> = {
  dashboard: { zh: "仪表盘", en: "Dashboard" },
  "model-config": { zh: "模型配置", en: "Model Config" },
  "channel-config": { zh: "通信配置", en: "Channel Config" },
  settings: { zh: "设置", en: "Settings" },
};

interface SidebarProps {
  activePage: PageId;
  theme: ThemeContext;
  language: "zh-CN" | "en";
}

export default function Sidebar({
  activePage,
  theme,
  language,
}: SidebarProps): React.JSX.Element {
  const { colors } = theme;
  const titles = PAGE_TITLES[activePage];
  const title = language === "zh-CN" ? titles.zh : titles.en;

  return (
    <aside
      style={{
        width: layout.sidebarWidth,
        height: "100vh",
        backgroundColor: colors.bgSidebar,
        borderRight: `1px solid ${colors.borderLight}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        transition: `background-color ${transitions.duration} ${transitions.easing}, border-color ${transitions.duration} ${transitions.easing}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: `${spacing.lg}px ${spacing.xl}px`,
          borderBottom: `1px solid ${colors.borderLight}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: typography.fontSizeLg,
            fontWeight: typography.fontWeightBold,
            color: colors.textPrimary,
            transition: `color ${transitions.duration} ${transitions.easing}`,
          }}
        >
          {title}
        </h2>
      </div>
      <div
        style={{
          flex: 1,
          padding: `${spacing.md}px ${spacing.lg}px`,
          color: colors.textSecondary,
          fontSize: typography.fontSizeSm,
          transition: `color ${transitions.duration} ${transitions.easing}`,
        }}
      >
        {/* Sub-navigation will be populated per-page in P2-C tasks */}
      </div>
    </aside>
  );
}
