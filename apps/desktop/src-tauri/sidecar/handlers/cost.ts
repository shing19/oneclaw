/**
 * Sidecar handlers for `cost.*` read operations.
 *
 * cost.summary — today/week/month cost overview
 * cost.history — daily cost history for a date range
 * cost.export  — export cost data in CSV or JSON
 */

import type { DailyCostSummary } from "@oneclaw/core";
import type { SidecarContext } from "../context.js";

interface IpcDailyCostSummary {
  date: string;
  totalCostYuan: number;
  byProvider: Record<string, number>;
  totalRequests: number;
}

function serializeDailySummary(summary: DailyCostSummary): IpcDailyCostSummary {
  return {
    date: summary.date.toISOString().slice(0, 10),
    totalCostYuan: summary.totalCostYuan,
    byProvider: { ...summary.byProvider },
    totalRequests: summary.totalRequests,
  };
}

function aggregateSummaries(
  summaries: IpcDailyCostSummary[],
): { totalCostYuan: number; totalRequests: number; byProvider: Record<string, number> } {
  let totalCostYuan = 0;
  let totalRequests = 0;
  const byProvider: Record<string, number> = {};

  for (const s of summaries) {
    totalCostYuan += s.totalCostYuan;
    totalRequests += s.totalRequests;
    for (const [provider, cost] of Object.entries(s.byProvider)) {
      byProvider[provider] = (byProvider[provider] ?? 0) + cost;
    }
  }

  return { totalCostYuan, totalRequests, byProvider };
}

export function handleCostSummary(ctx: SidecarContext): {
  today: IpcDailyCostSummary;
  week: { totalCostYuan: number; totalRequests: number; byProvider: Record<string, number> };
  month: { totalCostYuan: number; totalRequests: number; byProvider: Record<string, number> };
} {
  const tracker = ctx.getQuotaTracker();
  const now = new Date();

  const today = serializeDailySummary(tracker.getDailySummary(now));

  // Week: Monday to today
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const weekHistory = tracker.getHistory({ start: weekStart, end: now });
  const weekSummaries = weekHistory.daily.map(serializeDailySummary);
  const week = aggregateSummaries(weekSummaries);

  // Month: 1st to today
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthHistory = tracker.getHistory({ start: monthStart, end: now });
  const monthSummaries = monthHistory.daily.map(serializeDailySummary);
  const month = aggregateSummaries(monthSummaries);

  return { today, week, month };
}

export function handleCostHistory(
  ctx: SidecarContext,
  params: { start: string; end: string },
): {
  range: { start: string; end: string };
  daily: IpcDailyCostSummary[];
} {
  const tracker = ctx.getQuotaTracker();
  const start = new Date(params.start);
  const end = new Date(params.end);
  const history = tracker.getHistory({ start, end });

  return {
    range: {
      start: history.range.start.toISOString().slice(0, 10),
      end: history.range.end.toISOString().slice(0, 10),
    },
    daily: history.daily.map(serializeDailySummary),
  };
}

export function handleCostExport(
  ctx: SidecarContext,
  params: { format: "csv" | "json" },
): { data: string; format: "csv" | "json" } {
  const tracker = ctx.getQuotaTracker();
  const data = tracker.export(params.format);
  return { data, format: params.format };
}
