import { create } from "zustand";

export type AppLanguage = "zh-CN" | "en";
export type AppTheme = "light" | "dark" | "system";

export interface ConfigState {
  /** UI language. */
  language: AppLanguage;
  /** Theme mode. */
  theme: AppTheme;
  /** Workspace root directory. */
  workspaceDir: string | null;

  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: AppTheme) => void;
  setWorkspaceDir: (dir: string | null) => void;
}

export const useConfigStore = create<ConfigState>()((set) => ({
  language: "zh-CN",
  theme: "system",
  workspaceDir: null,

  setLanguage: (language) => set({ language }),
  setTheme: (theme) => set({ theme }),
  setWorkspaceDir: (dir) => set({ workspaceDir: dir }),
}));
