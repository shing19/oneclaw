import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  formatStatusError,
  formatStatusSummary,
  type StatusSummary,
} from "../../formatters/status.js";

describe("status formatter", () => {
  it("renders status summary as JSON when --json is enabled", () => {
    const summary = createSummary();
    const output = formatStatusSummary(summary, {
      json: true,
      quiet: false,
      locale: "en",
    });

    const parsed = JSON.parse(output) as unknown;
    assert.deepEqual(parsed, summary);
  });

  it("renders quiet mode as only runtime state", () => {
    const output = formatStatusSummary(createSummary(), {
      json: false,
      quiet: true,
      locale: "en",
    });

    assert.equal(output, "running\n");
  });

  it("renders localized human-readable status table", () => {
    const output = formatStatusSummary(createSummary(), {
      json: false,
      quiet: false,
      locale: "zh-CN",
    });

    assert.match(output, /Agent 正在正常运行。/);
    assert.match(output, /字段/);
    assert.match(output, /模型/);
  });

  it("includes last error row only when present", () => {
    const withError = formatStatusSummary(
      createSummary({
        health: "degraded",
        message: "Agent is running with warnings.",
        lastError: "something failed",
      }),
      {
        json: false,
        quiet: false,
        locale: "en",
      },
    );

    const withoutError = formatStatusSummary(createSummary(), {
      json: false,
      quiet: false,
      locale: "en",
    });

    assert.match(withError, /Last error/);
    assert.doesNotMatch(withoutError, /Last error/);
  });

  it("formats status errors for json and human modes", () => {
    const jsonOutput = formatStatusError("broken", {
      json: true,
      quiet: false,
      locale: "en",
    });
    const parsed = JSON.parse(jsonOutput) as unknown;
    assert.deepEqual(parsed, {
      ok: false,
      error: "broken",
    });

    const humanOutput = formatStatusError("broken", {
      json: false,
      quiet: false,
      locale: "en",
    });
    assert.equal(humanOutput, "broken\n");
  });
});

function createSummary(overrides: Partial<StatusSummary> = {}): StatusSummary {
  return {
    running: true,
    state: "running",
    health: "ok",
    mode: "daemon",
    pid: 123,
    pidAlive: true,
    currentModel: "deepseek/deepseek-chat",
    configPath: "/tmp/oneclaw/config.json",
    pidFilePath: "/tmp/oneclaw/agent-daemon.pid",
    stateFilePath: "/tmp/oneclaw/agent-daemon-state.json",
    logFilePath: "/tmp/oneclaw/agent-daemon.log",
    startedAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:01:00.000Z",
    uptimeMs: 60_000,
    message: "Agent is running normally.",
    ...overrides,
  };
}
