import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { formatJson, formatJsonError } from "../../formatters/json.js";

describe("json formatter", () => {
  it("formats JSON with default indent and trailing newline", () => {
    const output = formatJson({ ok: true, value: 1 });
    assert.ok(output.endsWith("\n"));

    const parsed = JSON.parse(output) as unknown;
    assert.deepEqual(parsed, { ok: true, value: 1 });
  });

  it("supports disabling trailing newline", () => {
    const output = formatJson({ ok: true }, { trailingNewline: false });
    assert.equal(output, '{\n  "ok": true\n}');
  });

  it("formats structured JSON error payload", () => {
    const output = formatJsonError("boom");
    const parsed = JSON.parse(output) as unknown;

    assert.deepEqual(parsed, {
      ok: false,
      error: "boom",
    });
  });

  it("falls back to safe payload when serialization fails", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    const output = formatJson(value);
    const parsed = JSON.parse(output) as unknown;

    assert.deepEqual(parsed, {
      ok: false,
      error: "Failed to serialize JSON output.",
    });
  });
});
