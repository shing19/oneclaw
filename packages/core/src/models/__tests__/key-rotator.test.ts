import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  KeyRotator,
  KeyRotatorError,
  isRateLimitError,
} from "../key-rotator.js";

describe("key rotator", () => {
  it("deduplicates and normalizes api keys", () => {
    const rotator = new KeyRotator({
      providerId: "deepseek",
      apiKeys: [" key-1 ", "key-1", "key-2", " "],
    });

    assert.deepEqual(rotator.listKeys(), ["key-1", "key-2"]);
    assert.equal(rotator.getCurrentKey(), "key-1");
  });

  it("does not rotate for non-rate-limit errors", () => {
    const rotator = new KeyRotator({
      providerId: "deepseek",
      apiKeys: ["key-1", "key-2"],
    });

    const result = rotator.handleError({ status: 500 });

    assert.equal(result.rotated, false);
    assert.equal(result.reason, "not_rate_limit");
    assert.equal(result.currentKey, "key-1");
    assert.equal(result.retryAfterMs, null);
  });

  it("rotates on 429 and reports cooldown when all keys are rate-limited", () => {
    let nowMs = 0;
    const rotator = new KeyRotator({
      providerId: "deepseek",
      apiKeys: ["key-1", "key-2"],
      cooldownMs: 1_000,
      now: () => nowMs,
    });

    const first = rotator.handleError({ status: 429 });
    assert.equal(first.rotated, true);
    assert.equal(first.reason, "rate_limit");
    assert.equal(first.previousKey, "key-1");
    assert.equal(first.currentKey, "key-2");

    const second = rotator.handleError({ status: 429 });
    assert.equal(second.rotated, false);
    assert.equal(second.reason, "all_keys_rate_limited");
    assert.equal(second.retryAfterMs, 1_000);

    nowMs = 1_001;
    const stateAfterCooldown = rotator.getState();
    assert.equal(stateAfterCooldown.rateLimitedKeys.length, 0);
    assert.equal(rotator.rotate(), "key-1");
  });

  it("detects rate limit across status, code and messages", () => {
    const error = new Error("Too many requests from upstream");
    const notRateLimit = { status: 400, code: "bad_request" };

    assert.equal(isRateLimitError(429), true);
    assert.equal(isRateLimitError({ status: 429 }), true);
    assert.equal(isRateLimitError({ code: "rate_limit" }), true);
    assert.equal(isRateLimitError(error), true);
    assert.equal(isRateLimitError(notRateLimit), false);
  });

  it("throws NO_API_KEYS when all configured keys are blank", () => {
    assert.throws(
      () => {
        return new KeyRotator({
          providerId: "deepseek",
          apiKeys: [" ", "\n\t"],
          locale: "en",
        });
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof KeyRotatorError);
        assert.equal(error.code, "NO_API_KEYS");
        return true;
      },
    );
  });
});
