import { homedir } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";

import type { Command } from "commander";

import {
  ConfigManager,
  createSecretStore,
  listDefaultProviderPresets,
  type OneclawConfig,
  type PresetProvider,
  type ValidationLocale,
} from "../../../core/src/index.js";

type CliLocale = "zh-CN" | "en";

interface InitCommandOptions {
  skipConnectionTest?: boolean;
}

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface InitSummary {
  providerId: string;
  providerName: string;
  model: string;
  configPath: string;
  secretRef: string;
  connectionTest: {
    attempted: boolean;
    success: boolean;
    statusCode: number | null;
    endpoint: string | null;
    message: string;
  };
}

interface ConnectionTestResult {
  success: boolean;
  statusCode: number | null;
  endpoint: string;
  message: string;
}

interface WizardSelectionResult {
  provider: PresetProvider;
  modelId: string;
  apiKey: string;
  shouldTestConnection: boolean;
}

interface WizardContext {
  globalOptions: CliGlobalOptions;
  commandOptions: InitCommandOptions;
}

const CONNECTION_TIMEOUT_MS = 8_000;
const DEFAULT_WARNING_THRESHOLD = 80;
const DEFAULT_CONFIG_VERSION = 1;
const DEFAULT_TIMEOUT_SECONDS = 120;

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description(
      "Run interactive setup wizard / 运行交互式初始化向导",
    )
    .option(
      "--skip-connection-test",
      "Skip provider connectivity check / 跳过供应商连通性测试",
      false,
    )
    .action(async (options: InitCommandOptions, command: Command) => {
      const globalOptions = resolveGlobalOptions(command);
      const locale = globalOptions.locale;

      if (!isInteractiveTerminal()) {
        const message = text(
          locale,
          "Interactive terminal is required for `oneclaw init`.",
          "`oneclaw init` 需要交互式终端环境。",
        );
        emitError(globalOptions, message);
        process.exitCode = 1;
        return;
      }

      const wizard = new WizardPrompter(locale);
      const context: WizardContext = {
        globalOptions,
        commandOptions: options,
      };

      try {
        const selection = await runWizardSelection(wizard, context);
        const connectionResult =
          selection.shouldTestConnection
            ? await testProviderConnection(
                selection.provider,
                selection.apiKey,
                locale,
              )
            : null;

        if (
          selection.shouldTestConnection &&
          connectionResult !== null &&
          !connectionResult.success
        ) {
          emitInfo(globalOptions, connectionResult.message);
          const shouldContinue = await wizard.confirm(
            text(
              locale,
              "Connection failed. Continue saving configuration anyway? [y/N]",
              "连通性测试失败。仍要继续保存配置吗？[y/N]",
            ),
            false,
          );
          if (!shouldContinue) {
            emitInfo(
              globalOptions,
              text(locale, "Initialization cancelled.", "初始化已取消。"),
            );
            return;
          }
        } else if (
          selection.shouldTestConnection &&
          connectionResult !== null &&
          connectionResult.success
        ) {
          emitInfo(globalOptions, connectionResult.message);
        }

        const credentialRef = toProviderSecretRef(selection.provider.id);
        const config = createInitialConfig({
          locale,
          provider: selection.provider,
          modelId: selection.modelId,
          credentialRef,
        });

        const configManager = new ConfigManager({ locale });
        const secretsPasswordPrompt = async (): Promise<string> =>
          wizard.askRequired(
            text(
              locale,
              "Set a password for encrypted secret storage:",
              "请设置加密密钥存储密码：",
            ),
          );
        const secretStore = await createSecretStore({
          locale,
          passwordProvider: secretsPasswordPrompt,
        });

        await secretStore.set(credentialRef, selection.apiKey);
        await configManager.save(config);

        const summary: InitSummary = {
          providerId: selection.provider.id,
          providerName: selection.provider.name,
          model: selection.modelId,
          configPath: configManager.getPaths().configFilePath,
          secretRef: credentialRef,
          connectionTest:
            connectionResult === null
              ? {
                  attempted: false,
                  success: false,
                  statusCode: null,
                  endpoint: null,
                  message: text(
                    locale,
                    "Connection test skipped.",
                    "已跳过连通性测试。",
                  ),
                }
              : {
                  attempted: true,
                  success: connectionResult.success,
                  statusCode: connectionResult.statusCode,
                  endpoint: connectionResult.endpoint,
                  message: connectionResult.message,
                },
        };

        emitSummary(globalOptions, locale, summary);
      } catch (error: unknown) {
        const message = toErrorMessage(error, locale);
        emitError(globalOptions, message);
        process.exitCode = 1;
      } finally {
        wizard.close();
      }
    });
}

async function runWizardSelection(
  wizard: WizardPrompter,
  context: WizardContext,
): Promise<WizardSelectionResult> {
  const { globalOptions, commandOptions } = context;
  const locale = globalOptions.locale;

  emitInfo(
    globalOptions,
    text(
      locale,
      "OneClaw setup wizard: provider, API key, and connectivity test.",
      "OneClaw 初始化向导：供应商、API Key、连通性测试。",
    ),
  );

  const presets = listDefaultProviderPresets();
  if (presets.length === 0) {
    throw new Error(
      text(
        locale,
        "No preset providers are available.",
        "当前没有可用的预置供应商。",
      ),
    );
  }

  const provider = await wizard.select(
    text(locale, "Select model provider:", "请选择模型供应商："),
    presets.map((preset) => ({
      label: `${preset.name} (${preset.id})`,
      value: preset,
    })),
  );

  const modelId = await wizard.select(
    text(locale, "Select default model:", "请选择默认模型："),
    provider.models.map((model) => ({
      label: `${model.name} (${model.id})`,
      value: model.id,
    })),
  );

  const apiKey = await wizard.askRequired(
    text(
      locale,
      `Enter API key for ${provider.name}:`,
      `请输入 ${provider.name} 的 API Key：`,
    ),
  );

  const shouldTestConnection = commandOptions.skipConnectionTest
    ? false
    : await wizard.confirm(
        text(
          locale,
          "Test provider connection now? [Y/n]",
          "现在测试供应商连通性吗？[Y/n]",
        ),
        true,
      );

  return {
    provider,
    modelId,
    apiKey,
    shouldTestConnection,
  };
}

async function testProviderConnection(
  provider: PresetProvider,
  apiKey: string,
  locale: CliLocale,
): Promise<ConnectionTestResult> {
  const endpoint = toModelsEndpoint(provider.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, CONNECTION_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const payload = await readJsonPayload(response);
    if (response.ok) {
      return {
        success: true,
        statusCode: response.status,
        endpoint,
        message: text(
          locale,
          `Connection test passed (${response.status}) via ${endpoint}.`,
          `连通性测试通过（${String(response.status)}），地址：${endpoint}。`,
        ),
      };
    }

    const detail = extractErrorDetail(payload);
    return {
      success: false,
      statusCode: response.status,
      endpoint,
      message: text(
        locale,
        `Connection test failed (${response.status}) via ${endpoint}${detail === null ? "." : `: ${detail}`}`,
        `连通性测试失败（${String(response.status)}），地址：${endpoint}${detail === null ? "。" : `：${detail}`}`,
      ),
    };
  } catch (error: unknown) {
    return {
      success: false,
      statusCode: null,
      endpoint,
      message: text(
        locale,
        `Connection test failed via ${endpoint}: ${toErrorMessage(error, locale)}.`,
        `连通性测试失败，地址：${endpoint}，错误：${toErrorMessage(error, locale)}。`,
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (_error: unknown) {
    return null;
  }
}

function extractErrorDetail(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message.trim();
  }

  const errorValue = payload.error;
  if (isRecord(errorValue)) {
    const message = errorValue.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }

  return null;
}

function createInitialConfig(input: {
  locale: ValidationLocale;
  provider: PresetProvider;
  modelId: string;
  credentialRef: string;
}): OneclawConfig {
  const workspacePath = join(homedir(), "oneclaw-workspace");
  const providerModel = `${input.provider.id}/${input.modelId}`;

  return {
    version: DEFAULT_CONFIG_VERSION,
    general: {
      language: input.locale,
      theme: "system",
      workspace: workspacePath,
    },
    models: {
      providers: [
        {
          id: input.provider.id,
          enabled: true,
          credentialRef: input.credentialRef,
          baseUrl: input.provider.baseUrl,
          protocol: "openai-completions",
          models: [input.modelId],
        },
      ],
      fallbackChain: [input.provider.id],
      defaultModel: providerModel,
      perModelSettings: {
        [providerModel]: {
          temperature: 0.7,
          maxTokens: 2048,
          timeout: DEFAULT_TIMEOUT_SECONDS,
          transport: "auto",
          streaming: true,
          thinking: "adaptive",
          cacheRetention: "short",
        },
      },
    },
    channels: {},
    agent: {
      concurrency: {
        maxConcurrent: 4,
        subagents: {
          maxConcurrent: 8,
          maxSpawnDepth: 2,
          maxChildrenPerAgent: 5,
        },
      },
      skills: [],
      mountPoints: [
        {
          hostPath: workspacePath,
          containerPath: "/workspace",
          readonly: false,
        },
      ],
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    },
    automation: {
      tasks: [],
    },
    quotas: {
      warningThreshold: DEFAULT_WARNING_THRESHOLD,
    },
  };
}

function toProviderSecretRef(providerId: string): string {
  return `oneclaw/provider/${providerId}/api-key-1`;
}

function toModelsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("models", normalized).toString();
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

function emitSummary(
  options: CliGlobalOptions,
  locale: CliLocale,
  summary: InitSummary,
): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    return;
  }

  output.write(`${text(locale, "Initialization completed.", "初始化完成。")}\n`);
  output.write(
    `${text(locale, "Provider", "供应商")}: ${summary.providerName} (${summary.providerId})\n`,
  );
  output.write(`${text(locale, "Model", "模型")}: ${summary.model}\n`);
  output.write(
    `${text(locale, "Config file", "配置文件")}: ${summary.configPath}\n`,
  );
  output.write(
    `${text(locale, "Secret reference", "密钥引用")}: ${summary.secretRef}\n`,
  );
}

function emitInfo(options: CliGlobalOptions, message: string): void {
  if (options.json || options.quiet) {
    return;
  }

  output.write(`${message}\n`);
}

function emitError(options: CliGlobalOptions, message: string): void {
  if (options.json) {
    const payload = {
      ok: false,
      error: message,
    };
    output.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  output.write(`${message}\n`);
}

function text(locale: CliLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInteractiveTerminal(): boolean {
  return Boolean(input.isTTY && output.isTTY);
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

class WizardPrompter {
  private readonly locale: CliLocale;
  private readonly rl: Interface;

  constructor(locale: CliLocale) {
    this.locale = locale;
    this.rl = createInterface({
      input,
      output,
      terminal: true,
    });
  }

  close(): void {
    this.rl.close();
  }

  async askRequired(label: string): Promise<string> {
    while (true) {
      const answer = (await this.rl.question(`${label} `)).trim();
      if (answer.length > 0) {
        return answer;
      }

      output.write(
        `${text(
          this.locale,
          "Input cannot be empty. Please try again.",
          "输入不能为空，请重新输入。",
        )}\n`,
      );
    }
  }

  async confirm(label: string, defaultValue: boolean): Promise<boolean> {
    const yesSet = new Set(["y", "yes"]);
    const noSet = new Set(["n", "no"]);

    while (true) {
      const answer = (
        await this.rl.question(`${label} `)
      ).trim().toLowerCase();

      if (answer.length === 0) {
        return defaultValue;
      }

      if (yesSet.has(answer)) {
        return true;
      }

      if (noSet.has(answer)) {
        return false;
      }

      output.write(
        `${text(
          this.locale,
          "Please answer with yes/y or no/n.",
          "请输入 yes/y 或 no/n。",
        )}\n`,
      );
    }
  }

  async select<T>(
    label: string,
    options: readonly { label: string; value: T }[],
  ): Promise<T> {
    if (options.length === 0) {
      throw new Error(
        text(
          this.locale,
          "No selectable options are available.",
          "没有可选择的选项。",
        ),
      );
    }

    output.write(`${label}\n`);
    options.forEach((option, index) => {
      output.write(`  ${String(index + 1)}. ${option.label}\n`);
    });

    while (true) {
      const answer = (await this.rl.question("> ")).trim();
      const parsed = Number.parseInt(answer, 10);
      const selectedIndex = parsed - 1;

      if (Number.isNaN(parsed) || selectedIndex < 0 || selectedIndex >= options.length) {
        output.write(
          `${text(
            this.locale,
            `Please enter a number between 1 and ${String(options.length)}.`,
            `请输入 1 到 ${String(options.length)} 之间的数字。`,
          )}\n`,
        );
        continue;
      }

      const selected = options[selectedIndex];
      if (selected === undefined) {
        output.write(
          `${text(
            this.locale,
            "Invalid option, please try again.",
            "无效选项，请重试。",
          )}\n`,
        );
        continue;
      }

      return selected.value;
    }
  }
}
