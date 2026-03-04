import { useEffect, useState } from "react";
import { useConfigStore } from "@/stores";
import { lightColors, darkColors } from "@/theme";
import type { ColorTokens } from "@/theme";

type ResolvedTheme = "light" | "dark";

function getSystemTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export interface ThemeContext {
  resolved: ResolvedTheme;
  colors: ColorTokens;
}

export function useTheme(): ThemeContext {
  const themePreference = useConfigStore((s) => s.theme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent): void => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return (): void => {
      mql.removeEventListener("change", handler);
    };
  }, []);

  const resolved: ResolvedTheme =
    themePreference === "system" ? systemTheme : themePreference;
  const colors = resolved === "dark" ? darkColors : lightColors;

  return { resolved, colors };
}
