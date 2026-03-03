import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "cli",
      include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      exclude: ["src/**/*.integration.test.ts"]
    }
  })
);
