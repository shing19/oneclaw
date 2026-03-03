import { stdin as input, stdout as output } from "node:process";
import { createInterface, type Interface } from "node:readline/promises";

import type { Command } from "commander";

import {
  ConfigManager,
  createFeishuAdapter,
  createSecretStore,
  type FeishuChannelConfig,
  type FeishuConfig,
  type OneclawConfig,
  type SecretStore,
  type ValidationLocale,
} from "../../../core/src/index.js";

type CliLocale = "zh-CN" | "en";

interface CliGlobalOptions {
  json: boolean;
  quiet: boolean;
  locale: CliLocale;
}

interface ChannelSetupCommandOptions {
  skipTest?: boolean;
}

interface ChannelTestCommandOptions {
  message?: string;
}

type SupportedChannel = "feishu";

interface FeishuSetupInputs {
  appId: string;
  appSecret: string | null;
  appSecretRef: string;
  webhookUrl: string;
  webhookToken: string | null;
  webhookTokenRef: string | null;
  enabled: boolean;
  shouldTest: boolean;
}

interface ChannelTestSummary {
  channel: SupportedChannel;
  success: boolean;
  messageId: string | null;
  sentAt: string | null;
  testMessage: string;
  message: string;
}

interface ChannelSetupSummary {
  channel: SupportedChannel;
  configPath: string;
  appId: string;
  appSecretRef: string;
  webhookUrl: string;
  webhookTokenRef: string | null;
  enabled: boolean;
  tested: boolean;
  test: ChannelTestSummary | null;
  message: string;
}

const FEISHU_APP_SECRET_REF = "oneclaw/channel/feishu/app-secret";
const FEISHU_WEBHOOK_TOKEN_REF = "oneclaw/channel/feishu/webhook-token";

export function registerChannelCommand(program: Command): void {
  const channelCommand = program
    .command("channel")
    .description("Configure communication channels / 配置通信渠道");

  channelCommand
    .command("setup [channel]")
    .description("Run interactive channel setup wizard / 运行交互式渠道配置向导")
    .option("--skip-test", "Skip test message after setup / 配置后跳过测试消息", false)
    .action(
      async (
        channelName: string | undefined,
        options: ChannelSetupCommandOptions,
        command: Command,
      ) => {
        const globalOptions = resolveGlobalOptions(command);
        const locale = globalOptions.locale;

        try {
          const channel = resolveChannelName(channelName, locale);
          if (channel !== "feishu") {
            throw new Error(
              text(
                locale,
                `Unsupported channel: ${channel}`,
                `不支持的渠道：${channel}`,
              ),
            );
          }

          if (!isInteractiveTerminal()) {
            throw new Error(
              text(
                locale,
                "`oneclaw channel setup` requires an interactive terminal.",
                "`oneclaw channel setup` 需要交互式终端。",
              ),
            );
          }

          const summary = await setupFeishuChannel(locale, options);
          emitSetupSummary(globalOptions, summary);
          if (summary.tested && summary.test !== null && !summary.test.success) {
            process.exitCode = 1;
          }
        } catch (error: unknown) {
          emitError(globalOptions, toErrorMessage(error, locale));
          process.exitCode = 1;
        }
      },
    );

  channelCommand
    .command("test [channel]")
    .description("Send test message to configured channel / 向已配置渠道发送测试消息")
    .option(
      "--message <text>",
      "Custom test message text / 自定义测试消息内容",
    )
    .action(
      async (
        channelName: string | undefined,
        options: ChannelTestCommandOptions,
        command: Command,
      ) => {
        const globalOptions = resolveGlobalOptions(command);
        const locale = globalOptions.locale;

        try {
          const channel = resolveChannelName(channelName, locale);
          const summary = await testChannel(channel, locale, options.message);
          emitTestSummary(globalOptions, summary);
          if (!summary.success) {
            process.exitCode = 1;
          }
        } catch (error: unknown) {
          emitError(globalOptions, toErrorMessage(error, locale));
          process.exitCode = 1;
        }
      },
    );
}

async function setupFeishuChannel(
  locale: CliLocale,
  options: ChannelSetupCommandOptions,
): Promise<ChannelSetupSummary> {
  const configManager = new ConfigManager({ locale });
  const currentConfig = await configManager.load();
  const existingFeishu = currentConfig.channels.feishu;
  const wizard = new ChannelWizardPrompter(locale);

  try {
    emitInfo(
      {
        json: false,
        quiet: false,
        locale,
      },
      text(
        locale,
        "Channel setup wizard (Feishu): app credentials, webhook, and test message.",
        "渠道配置向导（飞书）：应用凭证、Webhook 和测试消息。",
      ),
    );

    const setupInput = await collectFeishuSetupInputs(
      wizard,
      locale,
      options,
      existingFeishu,
    );
    const secretStore = await createRuntimeSecretStore(locale);

    if (setupInput.appSecret !== null) {
      await secretStore.set(setupInput.appSecretRef, setupInput.appSecret);
    }

    if (
      setupInput.webhookTokenRef !== null &&
      setupInput.webhookToken !== null
    ) {
      await secretStore.set(setupInput.webhookTokenRef, setupInput.webhookToken);
    }

    const nextConfig = applyFeishuConfig(currentConfig, {
      appId: setupInput.appId,
      appSecretRef: setupInput.appSecretRef,
      webhookUrl: setupInput.webhookUrl,
      webhookTokenRef: setupInput.webhookTokenRef ?? undefined,
      enabled: setupInput.enabled,
    });

    await configManager.save(nextConfig);

    const testSummary = setupInput.shouldTest
      ? await sendFeishuTestMessage({
          locale,
          secretStore,
          feishu: nextConfig.channels.feishu,
          message: undefined,
        })
      : null;

    return {
      channel: "feishu",
      configPath: configManager.getPaths().configFilePath,
      appId: setupInput.appId,
      appSecretRef: setupInput.appSecretRef,
      webhookUrl: setupInput.webhookUrl,
      webhookTokenRef: setupInput.webhookTokenRef,
      enabled: setupInput.enabled,
      tested: setupInput.shouldTest,
      test: testSummary,
      message: text(
        locale,
        "Feishu channel configuration saved.",
        "飞书渠道配置已保存。",
      ),
    };
  } finally {
    wizard.close();
  }
}

async function collectFeishuSetupInputs(
  wizard: ChannelWizardPrompter,
  locale: CliLocale,
  options: ChannelSetupCommandOptions,
  existing: FeishuConfig | undefined,
): Promise<FeishuSetupInputs> {
  const appId = await wizard.askRequired(
    text(locale, "Feishu App ID:", "飞书 App ID："),
    normalizeOptionalString(existing?.appId),
  );

  const existingAppSecretRef =
    normalizeOptionalString(existing?.appSecretRef) ?? FEISHU_APP_SECRET_REF;
  const hasExistingAppSecret = normalizeOptionalString(existing?.appSecretRef) !== undefined;
  const shouldUpdateAppSecret = hasExistingAppSecret
    ? await wizard.confirm(
        text(
          locale,
          "Update App Secret now? [y/N]",
          "现在更新 App Secret 吗？[y/N]",
        ),
        false,
      )
    : true;

  const appSecret = shouldUpdateAppSecret
    ? await wizard.askRequired(
        text(locale, "Feishu App Secret:", "飞书 App Secret："),
      )
    : null;

  const webhookUrl = await wizard.askRequired(
    text(locale, "Feishu Webhook URL:", "飞书 Webhook URL："),
    normalizeOptionalString(existing?.webhookUrl),
  );

  const existingWebhookTokenRef = normalizeOptionalString(existing?.webhookTokenRef);
  const shouldConfigureWebhookToken = await wizard.confirm(
    text(
      locale,
      "Configure webhook token signature secret? [y/N]",
      "配置 Webhook Token 签名密钥吗？[y/N]",
    ),
    existingWebhookTokenRef !== undefined,
  );

  let webhookToken: string | null = null;
  let webhookTokenRef: string | null = null;
  if (shouldConfigureWebhookToken) {
    webhookToken = await wizard.askRequired(
      text(locale, "Feishu Webhook Token:", "飞书 Webhook Token："),
    );
    webhookTokenRef = FEISHU_WEBHOOK_TOKEN_REF;
  }

  const enabled = await wizard.confirm(
    text(
      locale,
      "Enable Feishu channel after setup? [Y/n]",
      "配置完成后启用飞书渠道吗？[Y/n]",
    ),
    existing?.enabled ?? true,
  );

  const shouldTest = options.skipTest === true
    ? false
    : await wizard.confirm(
        text(
          locale,
          "Send test message now? [Y/n]",
          "现在发送测试消息吗？[Y/n]",
        ),
        true,
      );

  return {
    appId,
    appSecret,
    appSecretRef: existingAppSecretRef,
    webhookUrl,
    webhookToken,
    webhookTokenRef,
    enabled,
    shouldTest,
  };
}

async function testChannel(
  channel: SupportedChannel,
  locale: CliLocale,
  message: string | undefined,
): Promise<ChannelTestSummary> {
  if (channel !== "feishu") {
    throw new Error(
      text(
        locale,
        `Unsupported channel: ${channel}`,
        `不支持的渠道：${channel}`,
      ),
    );
  }

  const configManager = new ConfigManager({ locale });
  const config = await configManager.load();
  const feishu = config.channels.feishu;
  if (feishu === undefined) {
    throw new Error(
      text(
        locale,
        "Feishu channel is not configured. Run `oneclaw channel setup feishu` first.",
        "飞书渠道尚未配置，请先运行 `oneclaw channel setup feishu`。",
      ),
    );
  }

  const secretStore = await createRuntimeSecretStore(locale);
  return sendFeishuTestMessage({
    locale,
    secretStore,
    feishu,
    message,
  });
}

async function sendFeishuTestMessage(input: {
  locale: CliLocale;
  secretStore: SecretStore;
  feishu: FeishuConfig | undefined;
  message: string | undefined;
}): Promise<ChannelTestSummary> {
  const testMessage =
    normalizeOptionalString(input.message) ??
    defaultTestMessage(input.locale);

  if (input.feishu === undefined) {
    return {
      channel: "feishu",
      success: false,
      messageId: null,
      sentAt: null,
      testMessage,
      message: text(
        input.locale,
        "Feishu channel is not configured.",
        "飞书渠道尚未配置。",
      ),
    };
  }

  const adapter = createFeishuAdapter({
    locale: input.locale,
    resolveSecret: async (secretRef: string): Promise<string | null> =>
      input.secretStore.get(secretRef),
  });

  const config = toFeishuChannelConfig(input.feishu);
  try {
    await adapter.connect(config);

    const sendResult = await adapter.sendMessage({
      text: testMessage,
      format: "plain",
    });

    if (!sendResult.success) {
      return {
        channel: "feishu",
        success: false,
        messageId: null,
        sentAt: sendResult.timestamp.toISOString(),
        testMessage,
        message:
          sendResult.error?.message ??
          text(
            input.locale,
            "Failed to send test message.",
            "发送测试消息失败。",
          ),
      };
    }

    return {
      channel: "feishu",
      success: true,
      messageId: sendResult.messageId ?? null,
      sentAt: sendResult.timestamp.toISOString(),
      testMessage,
      message: text(
        input.locale,
        "Test message sent successfully.",
        "测试消息发送成功。",
      ),
    };
  } catch (error: unknown) {
    return {
      channel: "feishu",
      success: false,
      messageId: null,
      sentAt: null,
      testMessage,
      message: toErrorMessage(error, input.locale),
    };
  } finally {
    await adapter.disconnect().catch(() => undefined);
  }
}

function toFeishuChannelConfig(config: FeishuConfig): FeishuChannelConfig {
  return {
    channel: "feishu",
    appId: config.appId,
    appSecretRef: config.appSecretRef,
    webhookUrl: config.webhookUrl,
    webhookTokenRef: config.webhookTokenRef,
    enabled: config.enabled ?? true,
  };
}

function applyFeishuConfig(
  config: OneclawConfig,
  feishu: FeishuConfig,
): OneclawConfig {
  return {
    ...config,
    channels: {
      ...config.channels,
      feishu,
    },
  };
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

function defaultTestMessage(locale: CliLocale): string {
  const timestamp = new Date().toISOString();
  return text(
    locale,
    `[OneClaw] Feishu test message ${timestamp}`,
    `[OneClaw] 飞书测试消息 ${timestamp}`,
  );
}

function resolveChannelName(
  channelName: string | undefined,
  locale: CliLocale,
): SupportedChannel {
  const normalized = normalizeOptionalString(channelName)?.toLowerCase() ?? "feishu";
  if (normalized === "feishu") {
    return normalized;
  }

  throw new Error(
    text(
      locale,
      `Unsupported channel: ${normalized}`,
      `不支持的渠道：${normalized}`,
    ),
  );
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

function emitSetupSummary(
  options: CliGlobalOptions,
  summary: ChannelSetupSummary,
): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(`${text(options.locale, "Channel", "渠道")}: ${summary.channel}\n`);
  output.write(`${text(options.locale, "App ID", "App ID")}: ${summary.appId}\n`);
  output.write(
    `${text(options.locale, "App Secret Ref", "App Secret 引用")}: ${summary.appSecretRef}\n`,
  );
  output.write(
    `${text(options.locale, "Webhook URL", "Webhook URL")}: ${summary.webhookUrl}\n`,
  );
  output.write(
    `${text(options.locale, "Webhook Token Ref", "Webhook Token 引用")}: ${
      summary.webhookTokenRef ?? "-"
    }\n`,
  );
  output.write(
    `${text(options.locale, "Enabled", "是否启用")}: ${String(summary.enabled)}\n`,
  );
  output.write(
    `${text(options.locale, "Config file", "配置文件")}: ${summary.configPath}\n`,
  );

  if (summary.tested && summary.test !== null) {
    output.write(
      `${text(options.locale, "Test result", "测试结果")}: ${summary.test.message}\n`,
    );
  }
}

function emitTestSummary(options: CliGlobalOptions, summary: ChannelTestSummary): void {
  if (options.json) {
    output.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (options.quiet) {
    return;
  }

  output.write(`${summary.message}\n`);
  output.write(
    `${text(options.locale, "Channel", "渠道")}: ${summary.channel}\n`,
  );
  output.write(
    `${text(options.locale, "Success", "是否成功")}: ${String(summary.success)}\n`,
  );
  output.write(
    `${text(options.locale, "Message ID", "消息 ID")}: ${summary.messageId ?? "-"}\n`,
  );
  output.write(
    `${text(options.locale, "Sent At", "发送时间")}: ${summary.sentAt ?? "-"}\n`,
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
    output.write(
      `${JSON.stringify(
        {
          ok: false,
          error: message,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  output.write(`${message}\n`);
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

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isInteractiveTerminal(): boolean {
  return Boolean(input.isTTY && output.isTTY);
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
    while (true) {
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

class ChannelWizardPrompter {
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

  async askRequired(label: string, defaultValue?: string): Promise<string> {
    while (true) {
      const suffix =
        defaultValue !== undefined && defaultValue.length > 0
          ? ` (${defaultValue})`
          : "";
      const answer = (await this.rl.question(`${label}${suffix} `)).trim();

      if (answer.length > 0) {
        return answer;
      }
      if (defaultValue !== undefined && defaultValue.length > 0) {
        return defaultValue;
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
      const answer = (await this.rl.question(`${label} `)).trim().toLowerCase();
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
}
