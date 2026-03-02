import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { parseOpenClawLogLine } from "../log-parser.js";

describe("openclaw log parser", () => {
  it("returns null for empty or whitespace-only lines", () => {
    assert.equal(parseOpenClawLogLine("", "stdout"), null);
    assert.equal(parseOpenClawLogLine("   \n\t", "stderr"), null);
  });

  it("parses plain stdout text as info log with generated trace id", () => {
    const timestamp = new Date("2026-03-02T00:00:00.000Z");
    const parsed = parseOpenClawLogLine("  startup completed  ", "stdout", {
      timestamp,
      createTraceId: () => "trace-text-1",
    });

    assert.ok(parsed);
    assert.equal(parsed.logEntry.level, "info");
    assert.equal(parsed.logEntry.message, "startup completed");
    assert.equal(parsed.logEntry.traceId, "trace-text-1");
    assert.equal(parsed.logEntry.timestamp, timestamp);
    assert.deepEqual(parsed.logEntry.metadata, {
      source: "stdout",
      format: "text",
    });
    assert.equal(parsed.costEvent, null);
    assert.equal(parsed.activeAgents, null);
  });

  it("parses plain stderr text as error log", () => {
    const parsed = parseOpenClawLogLine("process crashed", "stderr", {
      createTraceId: () => "trace-stderr-1",
    });

    assert.ok(parsed);
    assert.equal(parsed.logEntry.level, "error");
    assert.equal(parsed.logEntry.message, "process crashed");
    assert.equal(parsed.logEntry.traceId, "trace-stderr-1");
    assert.equal(parsed.costEvent, null);
  });

  it("parses json payload, normalizes level, and extracts cost and active agents", () => {
    const timestamp = new Date("2026-03-02T01:00:00.000Z");
    const line = JSON.stringify({
      severity: "warning",
      msg: "fallback triggered",
      trace_id: "trace-json-1",
      provider: "deepseek",
      model: "deepseek-chat",
      prompt_tokens: 120,
      completion_tokens: 32,
      cost_yuan: 0.0321,
      activeAgents: 3,
    });

    const parsed = parseOpenClawLogLine(line, "stdout", {
      timestamp,
      createTraceId: () => "unused-trace-id",
    });

    assert.ok(parsed);
    assert.equal(parsed.logEntry.level, "warn");
    assert.equal(parsed.logEntry.message, "fallback triggered");
    assert.equal(parsed.logEntry.traceId, "trace-json-1");
    assert.equal(parsed.logEntry.timestamp, timestamp);
    assert.equal(parsed.activeAgents, 3);
    assert.deepEqual(parsed.costEvent, {
      provider: "deepseek",
      model: "deepseek-chat",
      inputTokens: 120,
      outputTokens: 32,
      estimatedCostYuan: 0.0321,
      traceId: "trace-json-1",
      timestamp,
    });
  });

  it("falls back to source-based level for unknown json levels", () => {
    const stdoutParsed = parseOpenClawLogLine(
      JSON.stringify({ level: "notice", message: "stdout message" }),
      "stdout",
      { createTraceId: () => "trace-stdout-unknown" },
    );
    const stderrParsed = parseOpenClawLogLine(
      JSON.stringify({ level: "notice", message: "stderr message" }),
      "stderr",
      { createTraceId: () => "trace-stderr-unknown" },
    );

    assert.ok(stdoutParsed);
    assert.ok(stderrParsed);
    assert.equal(stdoutParsed.logEntry.level, "info");
    assert.equal(stderrParsed.logEntry.level, "error");
  });

  it("does not emit cost event when required fields are missing or invalid", () => {
    const missingField = parseOpenClawLogLine(
      JSON.stringify({
        providerId: "zhipu",
        modelId: "glm-4-flash",
        inputTokens: 10,
        outputTokens: 5,
      }),
      "stdout",
      { createTraceId: () => "trace-missing-cost" },
    );
    const invalidField = parseOpenClawLogLine(
      JSON.stringify({
        provider: "zhipu",
        model: "glm-4-flash",
        inputTokens: -1,
        outputTokens: 5,
        estimatedCostYuan: 0.01,
      }),
      "stdout",
      { createTraceId: () => "trace-invalid-cost" },
    );

    assert.ok(missingField);
    assert.ok(invalidField);
    assert.equal(missingField.costEvent, null);
    assert.equal(invalidField.costEvent, null);
  });

  it("treats non-object json values as text lines", () => {
    const parsed = parseOpenClawLogLine('"plain json string"', "stdout", {
      createTraceId: () => "trace-non-object",
    });

    assert.ok(parsed);
    assert.equal(parsed.logEntry.message, '"plain json string"');
    assert.equal(parsed.logEntry.level, "info");
    assert.deepEqual(parsed.logEntry.metadata, {
      source: "stdout",
      format: "text",
    });
    assert.equal(parsed.costEvent, null);
  });
});
