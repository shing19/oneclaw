import { create } from "zustand";

/** Agent runtime status. */
export type AgentStatus = "stopped" | "starting" | "running" | "error";

export interface AgentState {
  /** Current agent runtime status. */
  status: AgentStatus;
  /** ISO timestamp of last status change. */
  lastStatusChange: string | null;
  /** Recent log entries (most recent first, max 20). */
  recentLogs: readonly string[];

  setStatus: (status: AgentStatus) => void;
  addLog: (entry: string) => void;
  clearLogs: () => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  status: "stopped",
  lastStatusChange: null,
  recentLogs: [],

  setStatus: (status) =>
    set({ status, lastStatusChange: new Date().toISOString() }),

  addLog: (entry) =>
    set((state) => ({
      recentLogs: [entry, ...state.recentLogs].slice(0, 20),
    })),

  clearLogs: () => set({ recentLogs: [] }),
}));
