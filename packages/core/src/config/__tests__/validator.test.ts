import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  ConfigValidationError,
  assertValidConfig,
  validateConfig,
  validateWithJsonSchema,
  validateWithZodSchema,
} from "../validator.js";
import { createValidConfig } from "./fixtures.js";

function hasIssues(error: unknown): error is { issues: unknown[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

describe("config validator", () => {
  it("accepts a valid config", () => {
    const config = createValidConfig();
    const result = validateConfig(config, { locale: "en" });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.models.defaultModel, "deepseek/deepseek-chat");
      assert.equal(result.data.general.language, "zh-CN");
    }
  });

  it("returns localized validation issues for invalid fields", () => {
    const base = createValidConfig();
    const invalidConfig: unknown = {
      ...base,
      general: {
        ...base.general,
        language: "jp",
        extraField: true,
      },
    };

    const result = validateConfig(invalidConfig, { locale: "en" });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.issues.some(
          (issue) =>
            issue.path === "/general/language" &&
            issue.code === "invalid_enum_value",
        ),
      );
      assert.ok(
        result.issues.some(
          (issue) =>
            issue.path === "/general/extraField" &&
            issue.source === "json-schema",
        ),
      );
    }
  });

  it("assertValidConfig throws ConfigValidationError", () => {
    const invalidConfig: unknown = {
      version: 1,
      general: {
        language: "zh-CN",
      },
    };

    assert.throws(
      () => {
        assertValidConfig(invalidConfig);
      },
      (error: unknown): boolean => {
        assert.ok(error instanceof ConfigValidationError);
        assert.ok(hasIssues(error));
        if (hasIssues(error)) {
          assert.ok(error.issues.length > 0);
        }
        return true;
      },
    );
  });

  it("json schema validator reports root type mismatch", () => {
    const issues = validateWithJsonSchema("invalid", { locale: "en" });

    assert.ok(
      issues.some((issue) => issue.path === "/" && issue.code === "type_mismatch"),
    );
  });

  it("zod-like validator emits chinese errors by default", () => {
    const result = validateWithZodSchema({ version: 0 });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.issues.some(
          (issue) =>
            issue.message.includes("缺少必填字段") ||
            issue.message.includes("应为"),
        ),
      );
    }
  });
});
