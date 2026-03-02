import { randomUUID } from "node:crypto";

import type { CostEvent, LogEntry } from "../types/agent-adapter.js";

export type ProcessOutputSource = "stdout" | "stderr";

export interface OpenClawParsedLogLine {
  logEntry: LogEntry;
  costEvent: CostEvent | null;
  activeAgents: number | null;
}

export interface OpenClawLogParserOptions {
  timestamp?: Date;
  createTraceId?: () => string;
}

export function parseOpenClawLogLine(
  line: string,
  source: ProcessOutputSource,
  options: OpenClawLogParserOptions = {},
): OpenClawParsedLogLine | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const timestamp = options.timestamp ?? new Date();
  const createTraceId = options.createTraceId ?? randomUUID;
  const parsed = tryParseJsonRecord(trimmed);

  if (parsed === null) {
    return {
      logEntry: {
        level: source === "stderr" ? "error" : "info",
        message: trimmed,
        timestamp,
        traceId: createTraceId(),
        metadata: {
          source,
          format: "text",
        },
      },
      costEvent: null,
      activeAgents: null,
    };
  }

  const level = parseLogLevel(parsed.level ?? parsed.severity, source);
  const traceId =
    readString(parsed.traceId) ??
    readString(parsed.trace_id) ??
    readString(parsed.requestId) ??
    createTraceId();
  const message =
    readString(parsed.message) ??
    readString(parsed.msg) ??
    readString(parsed.event) ??
    trimmed;

  return {
    logEntry: {
      level,
      message,
      timestamp,
      traceId,
      metadata: {
        source,
        payload: parsed,
      },
    },
    costEvent: toCostEvent(parsed, traceId, timestamp),
    activeAgents: readNumber(parsed.activeAgents),
  };
}

function toCostEvent(
  payload: Record<string, unknown>,
  traceId: string,
  timestamp: Date,
): CostEvent | null {
  const provider =
    readString(payload.provider) ?? readString(payload.providerId) ?? null;
  const model = readString(payload.model) ?? readString(payload.modelId) ?? null;
  const inputTokens =
    readNumber(payload.inputTokens) ??
    readNumber(payload.promptTokens) ??
    readNumber(payload.prompt_tokens);
  const outputTokens =
    readNumber(payload.outputTokens) ??
    readNumber(payload.completionTokens) ??
    readNumber(payload.completion_tokens);
  const estimatedCostYuan =
    readNumber(payload.estimatedCostYuan) ??
    readNumber(payload.estimated_cost_yuan) ??
    readNumber(payload.costYuan) ??
    readNumber(payload.cost_yuan);

  if (
    provider === null ||
    model === null ||
    inputTokens === null ||
    outputTokens === null ||
    estimatedCostYuan === null
  ) {
    return null;
  }

  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    estimatedCostYuan,
    timestamp,
    traceId,
  };
}

function parseLogLevel(
  value: unknown,
  source: ProcessOutputSource,
): LogEntry["level"] {
  if (typeof value !== "string") {
    return source === "stderr" ? "error" : "info";
  }

  const normalized = value.toLowerCase();
  if (normalized === "debug") {
    return "debug";
  }
  if (normalized === "info") {
    return "info";
  }
  if (normalized === "warn" || normalized === "warning") {
    return "warn";
  }
  if (normalized === "error" || normalized === "fatal") {
    return "error";
  }

  return source === "stderr" ? "error" : "info";
}

function tryParseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}
