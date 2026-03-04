/**
 * IPC contracts for `cost.*` namespace.
 *
 * Maps to QuotaTracker operations in @oneclaw/core.
 */

// ── Serializable types ─────────────────────────────────────────────

export interface IpcDailyCostSummary {
  /** ISO 8601 date string (YYYY-MM-DD). */
  readonly date: string;
  readonly totalCostYuan: number;
  readonly byProvider: Record<string, number>;
  readonly totalRequests: number;
}

export interface IpcCostHistory {
  readonly range: {
    /** ISO 8601 date string. */
    readonly start: string;
    /** ISO 8601 date string. */
    readonly end: string;
  };
  readonly daily: IpcDailyCostSummary[];
}

export interface IpcCostOverview {
  readonly today: IpcDailyCostSummary;
  readonly week: {
    readonly totalCostYuan: number;
    readonly totalRequests: number;
    readonly byProvider: Record<string, number>;
  };
  readonly month: {
    readonly totalCostYuan: number;
    readonly totalRequests: number;
    readonly byProvider: Record<string, number>;
  };
}

// ── Request params ─────────────────────────────────────────────────

/** `cost.summary` — get today/week/month cost overview. */
export type CostSummaryParams = Record<string, never>;

/** `cost.history` — get daily cost history for a date range. */
export interface CostHistoryParams {
  /** ISO 8601 date string (YYYY-MM-DD). */
  readonly start: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  readonly end: string;
}

/** `cost.export` — export cost data in CSV or JSON format. */
export interface CostExportParams {
  readonly format: "csv" | "json";
}

// ── Response results ───────────────────────────────────────────────

/** `cost.summary` result. */
export type CostSummaryResult = IpcCostOverview;

/** `cost.history` result. */
export type CostHistoryResult = IpcCostHistory;

/** `cost.export` result. */
export interface CostExportResult {
  readonly data: string;
  readonly format: "csv" | "json";
}
