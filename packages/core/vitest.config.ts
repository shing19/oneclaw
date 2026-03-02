import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: "core",
      include: ["src/**/*.test.ts", "src/**/*.spec.ts"]
    }
  })
);
