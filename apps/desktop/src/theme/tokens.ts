/**
 * Design tokens for OneClaw desktop app.
 * Based on Ant Design token system.
 */

/** Layout dimension tokens (px). */
export const layout = {
  iconRailWidth: 48,
  sidebarWidth: 240,
  sidebarCollapsedWidth: 0,
  contentMinWidth: 480,
  contentPadding: 24,
  iconRailIconSize: 20,
  iconRailItemHeight: 48,
} as const;

/** Spacing scale (px). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Typography tokens. */
export const typography = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontSizeSm: 12,
  fontSizeBase: 14,
  fontSizeLg: 16,
  fontSizeXl: 20,
  fontWeightNormal: 400,
  fontWeightMedium: 500,
  fontWeightBold: 600,
  lineHeight: 1.5715,
} as const;

/** Transition tokens. */
export const transitions = {
  duration: "0.2s",
  easing: "cubic-bezier(0.645, 0.045, 0.355, 1)",
} as const;

/** Z-index scale. */
export const zIndex = {
  iconRail: 100,
  sidebar: 90,
  content: 1,
  overlay: 1000,
} as const;

/** Border-radius tokens (px). */
export const borderRadius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const;

/** Color tokens — light theme baseline. */
export const lightColors = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f5f5f5",
  bgSidebar: "#fafafa",
  bgIconRail: "#001529",
  textPrimary: "rgba(0, 0, 0, 0.88)",
  textSecondary: "rgba(0, 0, 0, 0.65)",
  textDisabled: "rgba(0, 0, 0, 0.25)",
  textIconRail: "rgba(255, 255, 255, 0.65)",
  textIconRailActive: "#ffffff",
  border: "#d9d9d9",
  borderLight: "#f0f0f0",
  accent: "#1677ff",
  accentHover: "#4096ff",
  success: "#52c41a",
  warning: "#faad14",
  error: "#ff4d4f",
  iconRailActiveIndicator: "#1677ff",
} as const;

/** Color tokens — dark theme baseline. */
export const darkColors = {
  bgPrimary: "#141414",
  bgSecondary: "#1f1f1f",
  bgSidebar: "#1a1a1a",
  bgIconRail: "#000000",
  textPrimary: "rgba(255, 255, 255, 0.88)",
  textSecondary: "rgba(255, 255, 255, 0.65)",
  textDisabled: "rgba(255, 255, 255, 0.25)",
  textIconRail: "rgba(255, 255, 255, 0.65)",
  textIconRailActive: "#ffffff",
  border: "#424242",
  borderLight: "#303030",
  accent: "#1668dc",
  accentHover: "#3c89e8",
  success: "#49aa19",
  warning: "#d89614",
  error: "#d32029",
  iconRailActiveIndicator: "#1668dc",
} as const;

/** Structural type for color token objects (widened from literal strings). */
export type ColorTokens = { readonly [K in keyof typeof lightColors]: string };
