import type {
  ModelInfo,
  ModelProvider,
  PresetProvider,
  ProviderRegistry,
} from "../types/model-config.js";

export type ProviderRegistryLocale = "zh-CN" | "en";

export type ProviderRegistryErrorCode =
  | "INVALID_PROVIDER_ID"
  | "DUPLICATE_PROVIDER_ID";

export interface ProviderRegistryOptions {
  locale?: ProviderRegistryLocale;
  presets?: readonly PresetProvider[];
  allowProviderOverwrite?: boolean;
}

export class ProviderRegistryError extends Error {
  readonly code: ProviderRegistryErrorCode;

  constructor(code: ProviderRegistryErrorCode, locale: ProviderRegistryLocale) {
    super(messageForErrorCode(code, locale));
    this.name = "ProviderRegistryError";
    this.code = code;
  }
}

const DEFAULT_PRESET_PROVIDERS: readonly PresetProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        contextWindow: 64_000,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek Reasoner",
        contextWindow: 64_000,
      },
    ],
    signupUrl: "https://platform.deepseek.com/",
    pricingRef: "docs/reference/model/README.md",
    setupGuide:
      "zh-CN: 在 DeepSeek 开放平台创建 API Key 并存入 SecretStore。 en: Create an API key in DeepSeek Platform and store it in SecretStore.",
  },
  {
    id: "bailian",
    name: "阿里云百炼",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      {
        id: "qwen-plus",
        name: "Qwen Plus",
        contextWindow: 128_000,
      },
      {
        id: "qwen-max",
        name: "Qwen Max",
        contextWindow: 128_000,
      },
    ],
    signupUrl:
      "https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen",
    pricingRef: "docs/reference/model/README.md",
    setupGuide:
      "zh-CN: 在阿里云百炼创建 API Key，配置 credentialRef 到 SecretStore。 en: Create a Bailian API key and map credentialRef to SecretStore.",
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      {
        id: "glm-4.5",
        name: "GLM-4.5",
        contextWindow: 128_000,
      },
      {
        id: "glm-4.7",
        name: "GLM-4.7",
        contextWindow: 200_000,
      },
      {
        id: "glm-4-flash",
        name: "GLM-4-Flash",
        contextWindow: 128_000,
      },
    ],
    signupUrl: "https://open.bigmodel.cn/",
    pricingRef: "docs/reference/model/README.md",
    setupGuide:
      "zh-CN: 在智谱开放平台获取 API Key，推荐优先启用 GLM-4-Flash 做免费探活。 en: Get API key from Zhipu Open Platform and use GLM-4-Flash for free health probes.",
  },
];

export class DefaultProviderRegistry implements ProviderRegistry {
  private readonly locale: ProviderRegistryLocale;
  private readonly allowProviderOverwrite: boolean;
  private readonly providers: Map<string, ModelProvider>;
  private readonly presets: readonly PresetProvider[];

  constructor(options: ProviderRegistryOptions = {}) {
    this.locale = options.locale ?? "zh-CN";
    this.allowProviderOverwrite = options.allowProviderOverwrite ?? true;
    this.providers = new Map<string, ModelProvider>();
    this.presets = [...(options.presets ?? DEFAULT_PRESET_PROVIDERS)].map(
      clonePresetProvider,
    );
  }

  register(provider: ModelProvider): void {
    const normalizedId = normalizeProviderId(provider.id);
    if (normalizedId === null) {
      throw new ProviderRegistryError("INVALID_PROVIDER_ID", this.locale);
    }

    if (!this.allowProviderOverwrite && this.providers.has(normalizedId)) {
      throw new ProviderRegistryError("DUPLICATE_PROVIDER_ID", this.locale);
    }

    this.providers.set(normalizedId, provider);
  }

  get(id: string): ModelProvider | undefined {
    const normalizedId = normalizeProviderId(id);
    if (normalizedId === null) {
      return undefined;
    }
    return this.providers.get(normalizedId);
  }

  listAll(): ModelProvider[] {
    return [...this.providers.values()];
  }

  listPresets(): PresetProvider[] {
    return this.presets.map(clonePresetProvider);
  }
}

export function createProviderRegistry(
  options: ProviderRegistryOptions = {},
): ProviderRegistry {
  return new DefaultProviderRegistry(options);
}

export function listDefaultProviderPresets(): PresetProvider[] {
  return DEFAULT_PRESET_PROVIDERS.map(clonePresetProvider);
}

function normalizeProviderId(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.toLowerCase();
}

function clonePresetProvider(preset: PresetProvider): PresetProvider {
  return {
    ...preset,
    models: preset.models.map(cloneModelInfo),
  };
}

function cloneModelInfo(model: ModelInfo): ModelInfo {
  return { ...model };
}

function messageForErrorCode(
  code: ProviderRegistryErrorCode,
  locale: ProviderRegistryLocale,
): string {
  switch (code) {
    case "INVALID_PROVIDER_ID":
      return text(
        locale,
        "Provider id must be a non-empty string.",
        "Provider id 必须是非空字符串。",
      );
    case "DUPLICATE_PROVIDER_ID":
      return text(
        locale,
        "Provider id already exists in registry.",
        "Provider id 已存在于注册表中。",
      );
    default:
      return text(
        locale,
        "Unknown provider registry error.",
        "未知 Provider 注册表错误。",
      );
  }
}

function text(
  locale: ProviderRegistryLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
}
