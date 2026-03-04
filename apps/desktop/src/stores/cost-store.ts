import { create } from "zustand";

export interface CostSummary {
  /** Cost in CNY for the period. */
  amount: number;
  /** Number of API requests in the period. */
  requests: number;
  /** Total tokens consumed in the period. */
  tokens: number;
}

export interface CostState {
  /** Today's cost summary. */
  today: CostSummary;
  /** This week's cost summary. */
  week: CostSummary;
  /** This month's cost summary. */
  month: CostSummary;

  updateToday: (summary: CostSummary) => void;
  updateWeek: (summary: CostSummary) => void;
  updateMonth: (summary: CostSummary) => void;
}

const emptySummary: CostSummary = { amount: 0, requests: 0, tokens: 0 };

export const useCostStore = create<CostState>()((set) => ({
  today: emptySummary,
  week: emptySummary,
  month: emptySummary,

  updateToday: (summary) => set({ today: summary }),
  updateWeek: (summary) => set({ week: summary }),
  updateMonth: (summary) => set({ month: summary }),
}));
