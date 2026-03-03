import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import type { Command } from "commander";

import {
  ConfigManager,
  createSecretStore,
  listDefaultProviderPresets,
  type OneclawConfig,
  type ProviderConfig,
  type SecretStore,
  type ValidationLocale,
} from "../../../core/src/index.js";

type CliLocale = "zh-CN" | "en";

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface ModelProviderSummary {
  id: string;
  name: string;
  enabled: boolean;
  protocol: ProviderConfig["protocol"];
  baseUrl: string;
  credentialRef: string;
  models: string[];
  fallbackOrder: number | null;
  isDefaultProvider: boolean;
}

interface ModelListSummary {
  configPath: string;
  defaultModel: string;
  fallbackChain: string[];
  providers: ModelProviderSummary[];
  message: string;
}

interface ModelTestCommandOptions {
  includeDisabled?: boolean;
}

interface ProviderConnectivityResult {
  providerId: string;
  providerName: string;
  enabled: boolean;
  protocol: ProviderConfig["protocol"];
  endpoint: string;
  statusCode: number | null;
  latencyMs: number | null;
  ok: boolean;
  message: string;
}

interface ModelTestSummary {
  configPath: string;
  requestedProvider: string | null;
  includeDisabled: boolean;
  total: number;
  passed: number;
  failed: number;
  results: ProviderConnectivityResult[];
  message: string;
}

interface ModelPrioritySummary {
  configPath: string;
  updated: boolean;
  fallbackChain: string[];
  previousFallbackChain: string[];
  message: string;
}

interface ModelPriorityCommandOptions {
  set?: string;
}

interface ProbeResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  message: string;
}

const DEFAULT_CONNECTION_TIMEOUT_MS = 8_000;

export function registerModelCommand(program: Command): void {
  const modelCommand = program
    .command("model")
    .description("Inspect and manage model providers / 查看和管理模型供应商");

  modelCommand
    .command("list")
    .description("List configured providers and models / 列出已配置供应商和模型")
    .action(async (_options: unknown, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      try {
        const summary = await listConfiguredProviders(locale);
        emitListSummary(globalOptions, summary);
      } catch (error: unknown) {
        emitError(globalOptions, toErrorMessage(error, locale));
        process.exitCode = 1;
      }
    });

  modelCommand
    .command("test [provider]")
    .description("Test provider connectivity / 测试供应商连通性")
    .option(
      "--include-disabled",
      "Include disabled providers when provider is omitted / 未指定 provider 时也测试已禁用项",
      false,
    )
    .action(
      async (
        providerId: string | undefined,
        options: ModelTestCommandOptions,
        command: Command,
      ) => {
        const globalOptions = resolveGlobalOptions(command);
        const locale = globalOptions.locale;

        try {
          const summary = await testProviderConnectivity(
            locale,
            providerId,
            options,
          );
          emitTestSummary(globalOptions, summary);
          if (summary.failed > 0) {
            process.exitCode = 1;
          }
        } catch (error: unknown) {
          emitError(globalOptions, toErrorMessage(error, locale));
          process.exitCode = 1;
        }
      },
    );

  modelCommand
    .command("priority [chain]")
    .description("View or update fallback priority chain / 查看或设置 fallback 优先级")
    .option(
      "--set <chain>",
      "Comma-separated provider ids, e.g. deepseek,bailian / 用逗号分隔 provider id",
    )
    .action(
      async (
        chainInput: string | undefined,
        options: ModelPriorityCommandOptions,
        command: Command,
      ) => {
        const globalOptions = resolveGlobalOptions(command);
        const locale = globalOptions.locale;

        try {
          const summary = await managePriorityChain(
            locale,
            chainInput,
            options,
          );
          emitPrioritySummary(globalOptions, summary);
        } catch (error: unknown) {
          emitError(globalOptions, toErrorMessage(error, locale));
          process.exitCode = 1;
        }
      },
    );
}

async function listConfiguredProviders(locale: CliLocale): Promise<ModelListSummary> {
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const presetNameMap = createPresetNameMap();
  const fallbackOrder = createFallbackOrderMap(config.models.fallbackChain);

  const providers: ModelProviderSummary[] = config.models.providers.map((provider) => ({
    id: provider.id,
    name: presetNameMap.get(normalizeProviderId(provider.id)) ?? provider.id,
    enabled: provider.enabled,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    credentialRef: provider.credentialRef,
    models: [...provider.models],
    fallbackOrder: fallbackOrder.get(normalizeProviderId(provider.id)) ?? null,
    isDefaultProvider: isDefaultProvider(config, provider),
  }));

  return {
    configPath: configManager.getPaths().configFilePath,
    defaultModel: config.models.defaultModel,
    fallbackChain: [...config.models.fallbackChain],
    providers,
    message: text(
      locale,
      "Loaded configured model providers.",
      "已加载模型供应商配置。",
    ),
  };
}

async function testProviderConnectivity(
  locale: CliLocale,
  requestedProviderId: string | undefined,
  options: ModelTestCommandOptions,
): Promise<ModelTestSummary> {
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const selectedProviders = selectProvidersForTest(
    config,
    requestedProviderId,
    options.includeDisabled === true,
    locale,
  );
  const presetNameMap = createPresetNameMap();
  const secretStore = await createRuntimeSecretStore(locale);
  const results: ProviderConnectivityResult[] = [];

  for (const provider of selectedProviders) {
    const apiKey = await secretStore.get(provider.credentialRef);
    if (apiKey === null) {
      results.push({
        providerId: provider.id,
        providerName: presetNameMap.get(normalizeProviderId(provider.id)) ?? provider.id,
        enabled: provider.enabled,
        protocol: provider.protocol,
        endpoint: resolveProbeEndpoint(provider),
        statusCode: null,
        latencyMs: null,
        ok: false,
        message: text(
          locale,
          `Secret not found: ${provider.credentialRef}`,
          `密钥不存在：${provider.credentialRef}`,
        ),
      });
      continue;
    }

    const probe = await probeProvider(provider, apiKey, locale);
    results.push({
      providerId: provider.id,
      providerName: presetNameMap.get(normalizeProviderId(provider.id)) ?? provider.id,
      enabled: provider.enabled,
      protocol: provider.protocol,
      endpoint: resolveProbeEndpoint(provider),
      statusCode: probe.statusCode,
      latencyMs: probe.latencyMs,
      ok: probe.ok,
      message: probe.message,
    });
  }

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  return {
    configPath: configManager.getPaths().configFilePath,
    requestedProvider: normalizeOptionalString(requestedProviderId) ?? null,
    includeDisabled: options.includeDisabled === true,
    total: results.length,
    passed,
    failed,
    results,
    message:
      failed === 0
        ? text(
            locale,
            "All provider checks passed.",
            "所有供应商连通性测试通过。",
          )
        : text(
            locale,
            "Some provider checks failed.",
            "部分供应商连通性测试失败。",
          ),
  };
}

function selectProvidersForTest(
  config: OneclawConfig,
  requestedProviderId: string | undefined,
  includeDisabled: boolean,
  locale: CliLocale,
): ProviderConfig[] {
  const providers = config.models.providers;
  const requestedNormalized = normalizeOptionalString(requestedProviderId);

  if (requestedNormalized !== undefined) {
    const target = providers.find(
      (provider) => normalizeProviderId(provider.id) === normalizeProviderId(requestedNormalized),
    );
    if (target === undefined) {
      throw new Error(
        text(
          locale,
          `Provider not found: ${requestedNormalized}`,
          `未找到供应商：${requestedNormalized}`,
        ),
      );
    }
    return [target];
  }

  const selected =
    includeDisabled
      ? [...providers]
      : providers.filter((provider) => provider.enabled);

  if (selected.length === 0) {
    throw new Error(
      text(
        locale,
        includeDisabled
          ? "No providers are configured."
          : "No enabled providers found. Use --include-disabled to test all providers.",
        includeDisabled
          ? "未配置任何供应商。"
          : "未找到已启用供应商。可使用 --include-disabled 测试全部供应商。",
      ),
    );
  }

  return selected;
}

async function probeProvider(
  provider: ProviderConfig,
  apiKey: string,
  locale: CliLocale,
): Promise<ProbeResult> {
  const endpoint = resolveProbeEndpoint(provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_CONNECTION_TIMEOUT_MS);
  const startedAtMs = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildProbeHeaders(provider, apiKey),
      signal: controller.signal,
    });

    const latencyMs = Math.max(0, Date.now() - startedAtMs);
    const bodyText = await response.text();
    const bodyHint = summarizeResponseBody(bodyText);

    if (response.ok) {
      return {
        ok: true,
        statusCode: response.status,
        latencyMs,
        message: text(
          locale,
          "Connectivity check passed.",
          "连通性测试通过。",
        ),
      };
    }

    return {
      ok: false,
      statusCode: response.status,
      latencyMs,
      message:
        bodyHint === undefined
          ? text(
              locale,
              `HTTP ${String(response.status)} returned from provider endpoint.`,
              `供应商接口返回 HTTP ${String(response.status)}。`,
            )
          : text(
              locale,
              `HTTP ${String(response.status)}: ${bodyHint}`,
              `HTTP ${String(response.status)}：${bodyHint}`,
            ),
    };
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return {
        ok: false,
        statusCode: null,
        latencyMs: DEFAULT_CONNECTION_TIMEOUT_MS,
        message: text(
          locale,
          `Connection timeout after ${String(DEFAULT_CONNECTION_TIMEOUT_MS)}ms.`,
          `连接超时（${String(DEFAULT_CONNECTION_TIMEOUT_MS)}ms）。`,
        ),
      };
    }

    return {
      ok: false,
      statusCode: null,
      latencyMs: null,
      message: toErrorMessage(error, locale),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProbeHeaders(
  provider: ProviderConfig,
  apiKey: string,
): Record<string, string> {
  if (provider.protocol === "anthropic-messages") {
    return {
      accept: "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

function resolveProbeEndpoint(provider: ProviderConfig): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");

  if (provider.protocol === "ollama") {
    return `${baseUrl}/api/tags`;
  }

  return `${baseUrl}/models`;
}

function summarizeResponseBody(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177)}...`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function managePriorityChain(
  locale: CliLocale,
  chainInput: string | undefined,
  options: ModelPriorityCommandOptions,
): Promise<ModelPrioritySummary> {
  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const requestedChain = resolvePriorityInput(chainInput, options, locale);
  const previousFallbackChain = [...config.models.fallbackChain];

  if (requestedChain === undefined) {
    return {
      configPath: configManager.getPaths().configFilePath,
      updated: false,
      fallbackChain: previousFallbackChain,
      previousFallbackChain,
      message: text(
        locale,
        "Loaded current fallback chain.",
        "已加载当前 fallback 链。",
      ),
    };
  }

  const nextFallbackChain = normalizeFallbackChain(
    requestedChain,
    config.models.providers,
    locale,
  );

  const nextConfig: OneclawConfig = {
    ...config,
    models: {
      ...config.models,
      fallbackChain: nextFallbackChain,
    },
  };
  await configManager.save(nextConfig);

  return {
    configPath: configManager.getPaths().configFilePath,
    updated: true,
    fallbackChain: [...nextFallbackChain],
    previousFallbackChain,
    message: text(
      locale,
      "Fallback chain updated successfully.",
      "fallback 链更新成功。",
    ),
  };
}

function resolvePriorityInput(
  chainInput: string | undefined,
  options: ModelPriorityCommandOptions,
  locale: CliLocale,
): string | undefined {
  const positional = normalizeOptionalString(chainInput);
  const optionSet = normalizeOptionalString(options.set);

  if (positional === undefined) {
    return optionSet;
  }

  if (optionSet === undefined) {
    return positional;
  }

  if (normalizeProviderId(positional) === normalizeProviderId(optionSet)) {
    return positional;
  }

  throw new Error(
    text(
      locale,
      "Do not pass both positional chain and --set with different values.",
      "请勿同时传入位置参数链和不同值的 --set。",
    ),
  );
}

function normalizeFallbackChain(
  chainInput: string,
  providers: readonly ProviderConfig[],
  locale: CliLocale,
): string[] {
  const parts = chainInput
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    throw new Error(
      text(
        locale,
        "Fallback chain cannot be empty.",
        "fallback 链不能为空。",
      ),
    );
  }

  const providerIdMap = new Map<string, string>();
  for (const provider of providers) {
    providerIdMap.set(normalizeProviderId(provider.id), provider.id);
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of parts) {
    const key = normalizeProviderId(item);
    if (key.length === 0) {
      continue;
    }

    if (seen.has(key)) {
      throw new Error(
        text(
          locale,
          `Duplicate provider id in chain: ${item}`,
          `链路中存在重复 provider id：${item}`,
        ),
      );
    }

    const resolved = providerIdMap.get(key);
    if (resolved === undefined) {
      throw new Error(
        text(
          locale,
          `Unknown provider id: ${item}`,
          `未知 provider id：${item}`,
        ),
      );
    }

    seen.add(key);
    normalized.push(resolved);
  }

  return normalized;
}

function createPresetNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const preset of listDefaultProviderPresets()) {
    map.set(normalizeProviderId(preset.id), preset.name);
  }
  return map;
}

function createFallbackOrderMap(chain: readonly string[]): Map<string, number> {
  const orderMap = new Map<string, number>();
  for (const [index, providerId] of chain.entries()) {
    orderMap.set(normalizeProviderId(providerId), index + 1);
  }
  return orderMap;
}

function isDefaultProvider(config: OneclawConfig, provider: ProviderConfig): boolean {
  return config.models.defaultModel.startsWith(`${provider.id}/`);
}

function emitListSummary(options: CliGlobalOptions, summary: ModelListSummary): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: true,
          configPath: summary.configPath,
          defaultModel: summary.defaultModel,
          fallbackChain: summary.fallbackChain,
          providers: summary.providers,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write(`${summary.providers.map((provider) => provider.id).join(",")}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`);
  output.write(`${text(options.locale, "Default model", "默认模型")}: ${summary.defaultModel}\n`);
  output.write(
    `${text(options.locale, "Fallback chain", "Fallback 链")}: ${summary.fallbackChain.join(" -> ")}\n`,
  );
  output.write(`${text(options.locale, "Providers", "供应商")}:\n`);

  for (const provider of summary.providers) {
    const flags = [
      provider.enabled ? "enabled" : "disabled",
      provider.isDefaultProvider ? "default" : undefined,
      provider.fallbackOrder === null
        ? undefined
        : `${text(options.locale, "fallback#", "fallback#")}${String(provider.fallbackOrder)}`,
    ]
      .filter((flag): flag is string => flag !== undefined)
      .join(", ");

    output.write(`- ${provider.name} (${provider.id}) [${flags}]\n`);
    output.write(
      `  ${text(options.locale, "Protocol", "协议")}: ${provider.protocol} | ${text(options.locale, "Base URL", "基础 URL")}: ${provider.baseUrl}\n`,
    );
    output.write(
      `  ${text(options.locale, "Models", "模型")}: ${provider.models.join(", ")}\n`,
    );
  }
}

function emitTestSummary(options: CliGlobalOptions, summary: ModelTestSummary): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: summary.failed === 0,
          configPath: summary.configPath,
          requestedProvider: summary.requestedProvider,
          includeDisabled: summary.includeDisabled,
          total: summary.total,
          passed: summary.passed,
          failed: summary.failed,
          results: summary.results,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write(summary.failed === 0 ? "ok\n" : "failed\n");
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`);
  output.write(
    `${text(options.locale, "Result", "结果")}: ${String(summary.passed)}/${String(summary.total)} ${text(options.locale, "passed", "通过")}\n`,
  );

  for (const result of summary.results) {
    const statusText = result.ok ? "ok" : "failed";
    output.write(
      `- ${result.providerName} (${result.providerId}) [${statusText}] ${text(
        options.locale,
        "status",
        "状态",
      )}=${result.statusCode === null ? "-" : String(result.statusCode)} ${text(
        options.locale,
        "latency",
        "延迟",
      )}=${result.latencyMs === null ? "-" : `${String(result.latencyMs)}ms`}\n`,
    );
    output.write(`  ${text(options.locale, "Endpoint", "端点")}: ${result.endpoint}\n`);
    output.write(`  ${text(options.locale, "Message", "信息")}: ${result.message}\n`);
  }
}

function emitPrioritySummary(
  options: CliGlobalOptions,
  summary: ModelPrioritySummary,
): void {
  if (options.json) {
    output.write(
      `${JSON.stringify(
        {
          ok: true,
          updated: summary.updated,
          configPath: summary.configPath,
          fallbackChain: summary.fallbackChain,
          previousFallbackChain: summary.previousFallbackChain,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.quiet) {
    output.write(`${summary.fallbackChain.join(",")}\n`);
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`);
  if (summary.updated) {
    output.write(
      `${text(options.locale, "Previous", "更新前")}: ${summary.previousFallbackChain.join(" -> ")}\n`,
    );
  }
  output.write(
    `${text(options.locale, "Current", "当前")}: ${summary.fallbackChain.join(" -> ")}\n`,
  );
}

function emitError(options: CliGlobalOptions, message: string): void {
  if (options.json) {
    output.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    return;
  }

  output.write(`${message}\n`);
}

function resolveGlobalOptions(command: Command): CliGlobalOptions {
  const options = command.optsWithGlobals<{
    json?: unknown;
    quiet?: unknown;
    locale?: unknown;
  }>();

  return {
    json: options.json === true,
    quiet: options.quiet === true,
    locale: normalizeLocale(options.locale),
  };
}

function normalizeLocale(value: unknown): CliLocale {
  return value === "en" ? "en" : "zh-CN";
}

function text(locale: CliLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function toErrorMessage(error: unknown, locale: CliLocale): string {
  if (error instanceof Error) {
    return error.message;
  }

  return text(
    locale,
    `Unexpected error: ${String(error)}`,
    `未知错误：${String(error)}`,
  );
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

async function createRuntimeSecretStore(locale: CliLocale): Promise<SecretStore> {
  const cachedPassword = {
    value: "",
    resolved: false,
  };

  const passwordProvider = async (): Promise<string> => {
    if (cachedPassword.resolved) {
      return cachedPassword.value;
    }

    const password = await promptSecretPassword(locale);
    cachedPassword.value = password;
    cachedPassword.resolved = true;
    return password;
  };

  return createSecretStore({
    locale,
    passwordProvider,
  });
}

function isInteractiveTerminal(): boolean {
  return input.isTTY && output.isTTY;
}

async function promptSecretPassword(locale: ValidationLocale): Promise<string> {
  if (!isInteractiveTerminal()) {
    throw new Error(
      text(
        locale,
        "Secret store password is required. Set ONECLAW_SECRETS_PASSWORD in non-interactive mode.",
        "需要密钥存储密码。非交互模式请设置 ONECLAW_SECRETS_PASSWORD。",
      ),
    );
  }

  const rl = createInterface({
    input,
    output,
    terminal: true,
  });

  try {
    for (;;) {
      const answer = (
        await rl.question(
          `${text(
            locale,
            "Enter secret store password:",
            "请输入密钥存储密码：",
          )} `,
        )
      ).trim();

      if (answer.length > 0) {
        return answer;
      }

      output.write(
        `${text(
          locale,
          "Password cannot be empty.",
          "密码不能为空。",
        )}\n`,
      );
    }
  } finally {
    rl.close();
  }
}
