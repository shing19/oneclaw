import { create } from "zustand";

export interface ProviderInfo {
  id: string;
  name: string;
  enabled: boolean;
}

export interface ModelState {
  /** Registered model providers. */
  providers: readonly ProviderInfo[];
  /** Ordered fallback chain of provider IDs. */
  fallbackChain: readonly string[];

  setProviders: (providers: readonly ProviderInfo[]) => void;
  setFallbackChain: (chain: readonly string[]) => void;
}

export const useModelStore = create<ModelState>()((set) => ({
  providers: [],
  fallbackChain: [],

  setProviders: (providers) => set({ providers }),
  setFallbackChain: (chain) => set({ fallbackChain: chain }),
}));
