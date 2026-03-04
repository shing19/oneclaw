/**
 * Design tokens for OneClaw desktop app.
 * Based on Ant Design token system; will be expanded in P2-A3.
 */

/** Layout dimension tokens (px). */
export const layout = {
  /** Icon rail width. */
  iconRailWidth: 48,
  /** Sidebar width. */
  sidebarWidth: 240,
  /** Minimum sidebar width when collapsed. */
  sidebarCollapsedWidth: 0,
  /** Content area minimum width. */
  contentMinWidth: 480,
} as const;

/** Color tokens — light theme baseline. */
export const lightColors = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f5f5f5",
  bgSidebar: "#fafafa",
  textPrimary: "rgba(0, 0, 0, 0.88)",
  textSecondary: "rgba(0, 0, 0, 0.65)",
  border: "#d9d9d9",
  accent: "#1677ff",
} as const;

/** Color tokens — dark theme baseline. */
export const darkColors = {
  bgPrimary: "#141414",
  bgSecondary: "#1f1f1f",
  bgSidebar: "#1a1a1a",
  textPrimary: "rgba(255, 255, 255, 0.88)",
  textSecondary: "rgba(255, 255, 255, 0.65)",
  border: "#424242",
  accent: "#1668dc",
} as const;
