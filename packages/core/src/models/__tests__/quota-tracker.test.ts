import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  DefaultQuotaTracker,
  QuotaTrackerError,
} from "../quota-tracker.js";
import type { UsageEvent } from "../../types/model-config.js";

describe("quota tracker", () => {
  it("applies DeepSeek night discount and computes token usage", () => {
    const now = new Date(2026, 0, 1, 3, 0, 0, 0);
    const tracker = new DefaultQuotaTracker({
      now: () => now,
    });
    const eventTimestamp = new Date(2026, 0, 1, 2, 0, 0, 0);

    tracker.record(
      createUsageEvent({
        provider: "deepseek",
        model: "deepseek-reasoner",
        inputTokens: 1_000_000,
        outputTokens: 0,
        timestamp: eventTimestamp,
        traceId: "trace-night-discount",
      }),
    );

    const status = tracker.getStatus("deepseek");
    const summary = tracker.getDailySummary(eventTimestamp);

    assert.equal(status.used, 1_000_000);
    assert.equal(summary.totalRequests, 1);
    assert.equal(summary.totalCostYuan, 1);
  });

  it("tracks request-based usage and emits threshold callback once", () => {
    const now = new Date(2026, 0, 2, 10, 0, 0, 0);
    const tracker = new DefaultQuotaTracker({
      now: () => now,
      providers: [
        {
          providerId: "coding-plan",
          type: "request_based",
          window: "daily",
          limit: 2,
          warningThreshold: 50,
          requestPricing: {
            perRequestPriceYuan: 2,
          },
        },
      ],
    });

    const thresholdStatuses: number[] = [];
    const disposable = tracker.onThresholdReached((status) => {
      thresholdStatuses.push(status.used);
    });

    tracker.record(
      createUsageEvent({
        provider: "coding-plan",
        model: "plan-model",
        inputTokens: 10,
        outputTokens: 20,
        timestamp: now,
        traceId: "trace-1",
      }),
    );
    tracker.record(
      createUsageEvent({
        provider: "coding-plan",
        model: "plan-model",
        inputTokens: 5,
        outputTokens: 5,
        timestamp: now,
        traceId: "trace-2",
      }),
    );

    const status = tracker.getStatus("coding-plan");
    assert.equal(status.used, 2);
    assert.equal(status.estimatedCostYuan, 4);
    assert.equal(status.exhausted, true);
    assert.deepEqual(thresholdStatuses, [1]);

    disposable.dispose();
    tracker.record(
      createUsageEvent({
        provider: "coding-plan",
        model: "plan-model",
        inputTokens: 1,
        outputTokens: 1,
        timestamp: now,
        traceId: "trace-3",
      }),
    );
    assert.deepEqual(thresholdStatuses, [1]);
  });

  it("returns daily history and export output, and validates ranges", () => {
    const now = new Date(2026, 0, 11, 12, 0, 0, 0);
    const tracker = new DefaultQuotaTracker({
      now: () => now,
      providers: [
        {
          providerId: "custom-provider",
          type: "token_based",
          window: "none",
          tokenPricing: {
            inputPricePerMillion: 1,
            outputPricePerMillion: 2,
          },
        },
      ],
    });

    const dayOne = new Date(2026, 0, 10, 9, 0, 0, 0);
    const dayTwo = new Date(2026, 0, 11, 9, 0, 0, 0);

    tracker.record(
      createUsageEvent({
        provider: "custom-provider",
        model: "model-a",
        inputTokens: 1_000,
        outputTokens: 2_000,
        timestamp: dayOne,
        traceId: "trace-a",
      }),
    );
    tracker.record(
      createUsageEvent({
        provider: "custom-provider",
        model: "model-b",
        inputTokens: 3_000,
        outputTokens: 1_000,
        timestamp: dayTwo,
        traceId: "trace-b",
      }),
    );

    const history = tracker.getHistory({
      start: dayOne,
      end: dayTwo,
    });
    assert.equal(history.daily.length, 2);
    assert.equal(history.daily[0]!.totalRequests, 1);
    assert.equal(history.daily[1]!.totalRequests, 1);

    const csv = tracker.export("csv");
    assert.ok(csv.includes("timestamp,provider,model,inputTokens,outputTokens"));
    assert.ok(csv.includes("trace-a"));
    assert.ok(csv.includes("trace-b"));

    const jsonText = tracker.export("json");
    const exported = JSON.parse(jsonText) as {
      events?: unknown[];
    };
    assert.ok(Array.isArray(exported.events));
    assert.equal(exported.events?.length, 2);

    assert.throws(
      () => {
        tracker.getHistory({
          start: dayTwo,
          end: dayOne,
        });
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof QuotaTrackerError);
        assert.equal(error.code, "INVALID_DATE_RANGE");
        return true;
      },
    );
  });
});

function createUsageEvent(overrides: UsageEvent): UsageEvent {
  return {
    provider: overrides.provider,
    model: overrides.model,
    inputTokens: overrides.inputTokens,
    outputTokens: overrides.outputTokens,
    timestamp: overrides.timestamp,
    traceId: overrides.traceId,
  };
}
