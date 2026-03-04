import type { ThemeContext } from "@/hooks/use-theme";
import { layout, transitions } from "@/theme";
import type { PageId } from "./types";

interface NavItem {
  id: PageId;
  label: string;
  /** SVG path data for 20x20 viewBox. */
  icon: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    // Grid/dashboard icon
    icon: "M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z",
  },
  {
    id: "cost-panel",
    label: "费用",
    // Coin/cost icon
    icon: "M10 2a8 8 0 100 16 8 8 0 000-16zm1 12.93A6.01 6.01 0 0016 10a6.01 6.01 0 00-5-5.93V3a7 7 0 110 14v-1.07zM9 7h2v1h1a1 1 0 011 1v1a1 1 0 01-1 1h-2v1h2a1 1 0 011 1v1a1 1 0 01-1 1h-1v1H9v-1H8a1 1 0 01-1-1v-1a1 1 0 011-1h2v-1H8a1 1 0 01-1-1V9a1 1 0 011-1h1V7z",
  },
  {
    id: "model-config",
    label: "模型",
    // Cube/model icon
    icon: "M10 2L3 6v8l7 4 7-4V6l-7-4zm0 2.24L14.5 7 10 9.76 5.5 7 10 4.24zM5 8.47l4 2.28v4.78l-4-2.28V8.47zm10 0v4.78l-4 2.28v-4.78l4-2.28z",
  },
  {
    id: "channel-config",
    label: "通信",
    // Chat/message icon
    icon: "M4 4h12a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3V6a2 2 0 012-2z",
  },
  {
    id: "settings",
    label: "设置",
    // Gear icon
    icon: "M10 13a3 3 0 100-6 3 3 0 000 6zm7.32-3.68l1.18.69-.5.87a8 8 0 01-.68 1.18l-.5.87-1.18-.69a6 6 0 01-1.36.78v1.37l-1 .01h-1.37a8 8 0 01-1.37 0l-1-.01v-1.37a6 6 0 01-1.36-.78l-1.18.69-.5-.87a8 8 0 01-.68-1.18l-.5-.87 1.18-.69A6 6 0 014.96 10H3.6l-.01-1v-.37a8 8 0 010-1.37l.01-1h1.37A6 6 0 015.64 5l-1.18-.69.5-.87A8 8 0 015.64 2.26l.5-.87 1.18.69A6 6 0 018.68 1.3V-.07l1-.01h1.37a8 8 0 011.37 0l1 .01V1.3a6 6 0 011.36.78l1.18-.69.5.87a8 8 0 01.68 1.18l.5.87L16.46 5a6 6 0 01.58 1.32h1.37l.01 1v.37a8 8 0 010 1.37l-.01 1h-1.37a6 6 0 01-.58 1.32l1.18.69-.5.87a8 8 0 01-.68 1.18l-.5.87-1.18-.69a6 6 0 01-1.36.78v1.37l-1 .01h-1.37",
  },
] as const;

interface IconRailProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  theme: ThemeContext;
}

export default function IconRail({
  activePage,
  onNavigate,
  theme,
}: IconRailProps): React.JSX.Element {
  const { colors } = theme;

  return (
    <nav
      style={{
        width: layout.iconRailWidth,
        height: "100vh",
        backgroundColor: colors.bgIconRail,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 12,
        gap: 4,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border}`,
        transition: `background-color ${transitions.duration} ${transitions.easing}`,
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = activePage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            style={{
              width: layout.iconRailItemHeight,
              height: layout.iconRailItemHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isActive
                ? `${colors.iconRailActiveIndicator}22`
                : "transparent",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              transition: `background-color ${transitions.duration} ${transitions.easing}`,
              position: "relative",
            }}
          >
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 3,
                  height: 20,
                  borderRadius: "0 2px 2px 0",
                  backgroundColor: colors.iconRailActiveIndicator,
                }}
              />
            )}
            <svg
              width={layout.iconRailIconSize}
              height={layout.iconRailIconSize}
              viewBox="0 0 20 20"
              fill={isActive ? colors.textIconRailActive : colors.textIconRail}
              style={{
                transition: `fill ${transitions.duration} ${transitions.easing}`,
              }}
            >
              <path d={item.icon} />
            </svg>
          </button>
        );
      })}
    </nav>
  );
}
