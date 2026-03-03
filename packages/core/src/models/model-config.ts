import type {
  ApiProtocol,
  ModelConfig,
  ModelSettings,
  ProviderConfig,
  ThinkLevel,
} from "../types/model-config.js";

export type ModelConfigLocale = "zh-CN" | "en";

export interface ModelConfigValidationOptions {
  locale?: ModelConfigLocale;
}

export interface ModelConfigValidationIssue {
  path: string;
  code: string;
  message: string;
  suggestion: string;
}

export type ModelConfigValidationResult =
  | { ok: true; data: ModelConfig }
  | { ok: false; issues: ModelConfigValidationIssue[] };

export type ModelSettingsValidationResult =
  | { ok: true; data: ModelSettings }
  | { ok: false; issues: ModelConfigValidationIssue[] };

interface ZodLikeIssue {
  path: readonly (string | number)[];
  code: string;
  message: string;
  suggestion: string;
}

type ZodLikeSafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: ZodLikeIssue[] } };

export interface ModelConfigZodLikeSchema<T> {
  safeParse(
    input: unknown,
    options?: ModelConfigValidationOptions,
  ): ZodLikeSafeParseResult<T>;
}

interface ParseContext {
  locale: ModelConfigLocale;
  issues: ZodLikeIssue[];
}

export class ModelConfigValidationError extends Error {
  readonly issues: ModelConfigValidationIssue[];

  constructor(
    englishMessage: string,
    chineseMessage: string,
    locale: ModelConfigLocale,
    issues: ModelConfigValidationIssue[],
  ) {
    super(text(locale, englishMessage, chineseMessage));
    this.name = "ModelConfigValidationError";
    this.issues = issues;
  }
}

const DEFAULT_LOCALE: ModelConfigLocale = "zh-CN";
const DEFAULT_MODEL_PATTERN = /^[^/]+\/[^/]+$/;
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const CREDENTIAL_REF_PATTERN = /^oneclaw\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/;

const API_PROTOCOLS: readonly ApiProtocol[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "ollama",
];

const THINK_LEVELS: readonly ThinkLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "adaptive",
];

const TRANSPORT_VALUES: readonly NonNullable<ModelSettings["transport"]>[] = [
  "sse",
  "websocket",
  "auto",
];

const CACHE_RETENTION_VALUES: readonly NonNullable<
  ModelSettings["cacheRetention"]
>[] = ["none", "short", "long"];

export const modelSettingsZodSchema: ModelConfigZodLikeSchema<ModelSettings> = {
  safeParse: safeParseModelSettings,
};

export const modelConfigZodSchema: ModelConfigZodLikeSchema<ModelConfig> = {
  safeParse: safeParseModelConfig,
};

export function validateModelSettings(
  input: unknown,
  options: ModelConfigValidationOptions = {},
): ModelSettingsValidationResult {
  const parseResult = modelSettingsZodSchema.safeParse(input, options);

  if (parseResult.success) {
    return {
      ok: true,
      data: parseResult.data,
    };
  }

  return {
    ok: false,
    issues: parseResult.error.issues.map(toValidationIssue),
  };
}

export function validateModelConfig(
  input: unknown,
  options: ModelConfigValidationOptions = {},
): ModelConfigValidationResult {
  const parseResult = modelConfigZodSchema.safeParse(input, options);

  if (parseResult.success) {
    return {
      ok: true,
      data: parseResult.data,
    };
  }

  return {
    ok: false,
    issues: parseResult.error.issues.map(toValidationIssue),
  };
}

export function assertValidModelConfig(
  input: unknown,
  options: ModelConfigValidationOptions = {},
): ModelConfig {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const result = validateModelConfig(input, options);

  if (!result.ok) {
    throw new ModelConfigValidationError(
      "Model config validation failed.",
      "模型配置校验失败。",
      locale,
      result.issues,
    );
  }

  return result.data;
}

function safeParseModelSettings(
  input: unknown,
  options: ModelConfigValidationOptions = {},
): ZodLikeSafeParseResult<ModelSettings> {
  const ctx = createParseContext(options);
  const parsed = parseModelSettings(input, [], ctx);

  if (parsed === null || ctx.issues.length > 0) {
    return {
      success: false,
      error: {
        issues: ctx.issues,
      },
    };
  }

  return {
    success: true,
    data: parsed,
  };
}

function safeParseModelConfig(
  input: unknown,
  options: ModelConfigValidationOptions = {},
): ZodLikeSafeParseResult<ModelConfig> {
  const ctx = createParseContext(options);
  const parsed = parseModelConfig(input, [], ctx);

  if (parsed === null || ctx.issues.length > 0) {
    return {
      success: false,
      error: {
        issues: ctx.issues,
      },
    };
  }

  return {
    success: true,
    data: parsed,
  };
}

function createParseContext(options: ModelConfigValidationOptions): ParseContext {
  return {
    locale: options.locale ?? DEFAULT_LOCALE,
    issues: [],
  };
}

function parseModelConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): ModelConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(
    objectValue,
    path,
    ["providers", "fallbackChain", "defaultModel", "perModelSettings"],
    ctx,
  );

  const providersRaw = expectRequiredField(objectValue, "providers", path, ctx);
  const fallbackChainRaw = expectRequiredField(objectValue, "fallbackChain", path, ctx);
  const defaultModelRaw = expectRequiredField(objectValue, "defaultModel", path, ctx);
  const perModelSettingsRaw = expectRequiredField(
    objectValue,
    "perModelSettings",
    path,
    ctx,
  );

  const providers = parseProviders(providersRaw, [...path, "providers"], ctx);
  const fallbackChain = parseFallbackChain(fallbackChainRaw, [...path, "fallbackChain"], ctx);
  const defaultModel = parseDefaultModel(defaultModelRaw, [...path, "defaultModel"], ctx);
  const perModelSettings = parsePerModelSettings(
    perModelSettingsRaw,
    [...path, "perModelSettings"],
    ctx,
  );

  if (
    providers === null ||
    fallbackChain === null ||
    defaultModel === null ||
    perModelSettings === null
  ) {
    return null;
  }

  enforceCrossFieldRules(
    {
      providers,
      fallbackChain,
      defaultModel,
      perModelSettings,
    },
    path,
    ctx,
  );

  return {
    providers,
    fallbackChain,
    defaultModel,
    perModelSettings,
  };
}

function parseProviders(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): ProviderConfig[] | null {
  if (!Array.isArray(value)) {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected an array of providers.",
      "providers 应为数组。",
      "Provide providers as an array.",
      "请将 providers 配置为数组。",
    );
    return null;
  }

  if (value.length === 0) {
    addIssue(
      ctx,
      path,
      "too_small",
      "At least one provider is required.",
      "至少需要一个 provider。",
      "Add one enabled provider entry.",
      "请至少添加一个启用的 provider。",
    );
  }

  const parsedProviders: ProviderConfig[] = [];
  const seenProviderIds = new Set<string>();

  for (const [index, item] of value.entries()) {
    const parsed = parseProviderConfig(item, [...path, index], ctx);
    if (parsed === null) {
      continue;
    }

    if (seenProviderIds.has(parsed.id)) {
      addIssue(
        ctx,
        [...path, index, "id"],
        "not_unique",
        `Duplicate provider id "${parsed.id}".`,
        `存在重复 provider id "${parsed.id}"。`,
        "Use a unique provider id for each provider entry.",
        "每个 provider 必须使用唯一 id。",
      );
      continue;
    }

    seenProviderIds.add(parsed.id);
    parsedProviders.push(parsed);
  }

  return parsedProviders;
}

function parseFallbackChain(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): string[] | null {
  const fallbackChain = expectStringArray(value, path, ctx, {
    nonEmptyItems: true,
    uniqueItems: true,
  });

  if (fallbackChain === null) {
    return null;
  }

  if (fallbackChain.length === 0) {
    addIssue(
      ctx,
      path,
      "too_small",
      "Fallback chain must contain at least one provider id.",
      "fallbackChain 至少需要一个 provider id。",
      "Add provider ids in failover order.",
      "请按故障切换顺序添加 provider id。",
    );
  }

  return fallbackChain;
}

function parseDefaultModel(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): string | null {
  return expectString(value, path, ctx, {
    nonEmpty: true,
    pattern: DEFAULT_MODEL_PATTERN,
  });
}

function parsePerModelSettings(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): Record<string, ModelSettings> | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  const result: Record<string, ModelSettings> = {};

  for (const [key, entry] of Object.entries(objectValue)) {
    if (!DEFAULT_MODEL_PATTERN.test(key)) {
      addIssue(
        ctx,
        [...path, key],
        "invalid_key",
        `Invalid model key "${key}".`,
        `模型键 "${key}" 格式不合法。`,
        "Use provider/model format.",
        "请使用 provider/model 格式。",
      );
      continue;
    }

    const parsed = parseModelSettings(entry, [...path, key], ctx);
    if (parsed !== null) {
      result[key] = parsed;
    }
  }

  return result;
}

function parseProviderConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): ProviderConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(
    objectValue,
    path,
    ["id", "enabled", "credentialRef", "baseUrl", "protocol", "models"],
    ctx,
  );

  const id = expectString(expectRequiredField(objectValue, "id", path, ctx), [...path, "id"], ctx, {
    nonEmpty: true,
    pattern: PROVIDER_ID_PATTERN,
  });

  const enabled = expectBoolean(
    expectRequiredField(objectValue, "enabled", path, ctx),
    [...path, "enabled"],
    ctx,
  );

  const credentialRef = expectString(
    expectRequiredField(objectValue, "credentialRef", path, ctx),
    [...path, "credentialRef"],
    ctx,
    {
      nonEmpty: true,
      pattern: CREDENTIAL_REF_PATTERN,
    },
  );

  const baseUrl = expectString(
    expectRequiredField(objectValue, "baseUrl", path, ctx),
    [...path, "baseUrl"],
    ctx,
    {
      nonEmpty: true,
      uri: true,
    },
  );

  const protocol = expectEnumValue(
    expectRequiredField(objectValue, "protocol", path, ctx),
    [...path, "protocol"],
    ctx,
    API_PROTOCOLS,
  );

  const models = expectStringArray(
    expectRequiredField(objectValue, "models", path, ctx),
    [...path, "models"],
    ctx,
    {
      nonEmptyItems: true,
      uniqueItems: true,
    },
  );

  if (models !== null && models.length === 0) {
    addIssue(
      ctx,
      [...path, "models"],
      "too_small",
      "Provider models must contain at least one model id.",
      "provider.models 至少需要一个模型 ID。",
      "Add at least one model to the provider.",
      "请至少为该 provider 添加一个模型。",
    );
  }

  if (
    id === null ||
    enabled === null ||
    credentialRef === null ||
    baseUrl === null ||
    protocol === null ||
    models === null
  ) {
    return null;
  }

  return {
    id,
    enabled,
    credentialRef,
    baseUrl,
    protocol,
    models,
  };
}

function parseModelSettings(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): ModelSettings | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(
    objectValue,
    path,
    [
      "temperature",
      "maxTokens",
      "thinking",
      "timeout",
      "transport",
      "streaming",
      "cacheRetention",
    ],
    ctx,
  );

  const result: ModelSettings = {};

  if ("temperature" in objectValue) {
    const temperature = expectNumber(objectValue.temperature, [...path, "temperature"], ctx, {
      min: 0,
      max: 2,
    });
    if (temperature !== null) {
      result.temperature = temperature;
    }
  }

  if ("maxTokens" in objectValue) {
    const maxTokens = expectNumber(objectValue.maxTokens, [...path, "maxTokens"], ctx, {
      integer: true,
      min: 1,
    });
    if (maxTokens !== null) {
      result.maxTokens = maxTokens;
    }
  }

  if ("thinking" in objectValue) {
    const thinking = expectEnumValue(
      objectValue.thinking,
      [...path, "thinking"],
      ctx,
      THINK_LEVELS,
    );
    if (thinking !== null) {
      result.thinking = thinking;
    }
  }

  if ("timeout" in objectValue) {
    const timeout = expectNumber(objectValue.timeout, [...path, "timeout"], ctx, {
      integer: true,
      min: 1,
    });
    if (timeout !== null) {
      result.timeout = timeout;
    }
  }

  if ("transport" in objectValue) {
    const transport = expectEnumValue(
      objectValue.transport,
      [...path, "transport"],
      ctx,
      TRANSPORT_VALUES,
    );
    if (transport !== null) {
      result.transport = transport;
    }
  }

  if ("streaming" in objectValue) {
    const streaming = expectBoolean(objectValue.streaming, [...path, "streaming"], ctx);
    if (streaming !== null) {
      result.streaming = streaming;
    }
  }

  if ("cacheRetention" in objectValue) {
    const cacheRetention = expectEnumValue(
      objectValue.cacheRetention,
      [...path, "cacheRetention"],
      ctx,
      CACHE_RETENTION_VALUES,
    );
    if (cacheRetention !== null) {
      result.cacheRetention = cacheRetention;
    }
  }

  return result;
}

function enforceCrossFieldRules(
  config: ModelConfig,
  path: readonly (string | number)[],
  ctx: ParseContext,
): void {
  const providerById = new Map<string, ProviderConfig>();

  for (const provider of config.providers) {
    providerById.set(provider.id, provider);
  }

  for (const [index, fallbackProviderId] of config.fallbackChain.entries()) {
    const provider = providerById.get(fallbackProviderId);
    if (provider === undefined) {
      addIssue(
        ctx,
        [...path, "fallbackChain", index],
        "unknown_provider",
        `Fallback provider "${fallbackProviderId}" is not defined in providers.`,
        `fallback provider "${fallbackProviderId}" 未在 providers 中定义。`,
        "Add the provider or remove it from fallbackChain.",
        "请添加该 provider 或将其从 fallbackChain 中移除。",
      );
      continue;
    }

    if (!provider.enabled) {
      addIssue(
        ctx,
        [...path, "fallbackChain", index],
        "disabled_provider",
        `Fallback provider "${fallbackProviderId}" is disabled.`,
        `fallback provider "${fallbackProviderId}" 已禁用。`,
        "Enable this provider before adding it to fallbackChain.",
        "在 fallbackChain 使用该 provider 前请先启用。",
      );
    }
  }

  const defaultModelParts = config.defaultModel.split("/", 2);
  const defaultProviderId = defaultModelParts[0];
  const defaultProviderModel = defaultModelParts[1];

  if (defaultProviderId === undefined || defaultProviderModel === undefined) {
    addIssue(
      ctx,
      [...path, "defaultModel"],
      "invalid_string",
      "defaultModel must be in provider/model format.",
      "defaultModel 必须为 provider/model 格式。",
      "Use a value like deepseek/deepseek-chat.",
      "请使用例如 deepseek/deepseek-chat 的值。",
    );
    return;
  }

  const defaultProvider = providerById.get(defaultProviderId);
  if (defaultProvider === undefined) {
    addIssue(
      ctx,
      [...path, "defaultModel"],
      "unknown_provider",
      `Default model provider "${defaultProviderId}" is not configured.`,
      `defaultModel 的 provider "${defaultProviderId}" 未配置。`,
      "Configure this provider or change defaultModel.",
      "请配置该 provider 或修改 defaultModel。",
    );
    return;
  }

  if (!defaultProvider.enabled) {
    addIssue(
      ctx,
      [...path, "defaultModel"],
      "disabled_provider",
      `Default model provider "${defaultProviderId}" is disabled.`,
      `defaultModel 的 provider "${defaultProviderId}" 已禁用。`,
      "Enable this provider or choose another defaultModel.",
      "请启用该 provider 或使用其他 defaultModel。",
    );
  }

  if (!defaultProvider.models.includes(defaultProviderModel)) {
    addIssue(
      ctx,
      [...path, "defaultModel"],
      "unknown_model",
      `Model "${defaultProviderModel}" is not enabled for provider "${defaultProviderId}".`,
      `模型 "${defaultProviderModel}" 未在 provider "${defaultProviderId}" 中启用。`,
      "Add this model to provider.models or switch defaultModel.",
      "请在 provider.models 中添加该模型或切换 defaultModel。",
    );
  }

  for (const key of Object.keys(config.perModelSettings)) {
    const [providerId, modelId] = key.split("/", 2);
    const provider = providerById.get(providerId ?? "");

    if (provider === undefined) {
      addIssue(
        ctx,
        [...path, "perModelSettings", key],
        "unknown_provider",
        `perModelSettings key "${key}" refers to unknown provider "${providerId ?? ""}".`,
        `perModelSettings 键 "${key}" 引用了未知 provider "${providerId ?? ""}"。`,
        "Add the provider to providers or remove this perModelSettings key.",
        "请将该 provider 加入 providers，或删除该 perModelSettings 键。",
      );
      continue;
    }

    if (modelId === undefined || !provider.models.includes(modelId)) {
      addIssue(
        ctx,
        [...path, "perModelSettings", key],
        "unknown_model",
        `perModelSettings key "${key}" refers to model not enabled in provider "${providerId}".`,
        `perModelSettings 键 "${key}" 引用了 provider "${providerId}" 中未启用的模型。`,
        "Add this model to provider.models or remove this perModelSettings key.",
        "请在 provider.models 中添加该模型，或删除该 perModelSettings 键。",
      );
    }
  }
}

function expectObject(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected an object.",
      "应为对象类型。",
      "Provide a JSON object at this path.",
      "请在该路径提供 JSON 对象。",
    );
    return null;
  }

  return value;
}

function expectBoolean(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): boolean | null {
  if (typeof value !== "boolean") {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected a boolean.",
      "应为布尔值。",
      "Use true or false.",
      "请使用 true 或 false。",
    );
    return null;
  }

  return value;
}

function expectNumber(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
  options?: {
    integer?: boolean;
    min?: number;
    max?: number;
  },
): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected a number.",
      "应为数字类型。",
      "Provide a numeric value.",
      "请提供数字值。",
    );
    return null;
  }

  if (options?.integer === true && !Number.isInteger(value)) {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected an integer.",
      "应为整数。",
      "Provide a whole number.",
      "请提供整数值。",
    );
  }

  if (options?.min !== undefined && value < options.min) {
    addIssue(
      ctx,
      path,
      "too_small",
      `Value must be >= ${options.min}.`,
      `该值必须 >= ${options.min}。`,
      "Increase this value to meet the minimum requirement.",
      "请增大该值以满足最小要求。",
    );
  }

  if (options?.max !== undefined && value > options.max) {
    addIssue(
      ctx,
      path,
      "too_big",
      `Value must be <= ${options.max}.`,
      `该值必须 <= ${options.max}。`,
      "Decrease this value to meet the maximum requirement.",
      "请减小该值以满足最大要求。",
    );
  }

  return value;
}

function expectString(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
  options?: {
    nonEmpty?: boolean;
    pattern?: RegExp;
    uri?: boolean;
  },
): string | null {
  if (typeof value !== "string") {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected a string.",
      "应为字符串类型。",
      "Provide a string value.",
      "请提供字符串值。",
    );
    return null;
  }

  if (options?.nonEmpty === true && value.length === 0) {
    addIssue(
      ctx,
      path,
      "too_small",
      "String must not be empty.",
      "字符串不能为空。",
      "Provide a non-empty string value.",
      "请提供非空字符串值。",
    );
  }

  if (options?.pattern !== undefined && !options.pattern.test(value)) {
    addIssue(
      ctx,
      path,
      "invalid_string",
      "String format is invalid.",
      "字符串格式不合法。",
      "Update this value to match the required format.",
      "请将该值修改为符合要求的格式。",
    );
  }

  if (options?.uri === true) {
    try {
      // URL constructor is sufficient for RFC-3986 compatible absolute URIs.
      // eslint-disable-next-line no-new
      new URL(value);
    } catch {
      addIssue(
        ctx,
        path,
        "invalid_uri",
        "Value must be a valid URI.",
        "该值必须是合法 URI。",
        "Provide a URI including scheme, such as https://example.com.",
        "请提供包含协议的 URI，例如 https://example.com。",
      );
    }
  }

  return value;
}

function expectStringArray(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
  options?: {
    nonEmptyItems?: boolean;
    uniqueItems?: boolean;
  },
): string[] | null {
  if (!Array.isArray(value)) {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected an array.",
      "应为数组类型。",
      "Provide an array value.",
      "请提供数组值。",
    );
    return null;
  }

  const result: string[] = [];

  for (const [index, item] of value.entries()) {
    const parsed = expectString(item, [...path, index], ctx, {
      nonEmpty: options?.nonEmptyItems ?? false,
    });

    if (parsed !== null) {
      result.push(parsed);
    }
  }

  if (options?.uniqueItems === true) {
    const seenValues = new Set<string>();
    for (const [index, item] of result.entries()) {
      if (seenValues.has(item)) {
        addIssue(
          ctx,
          [...path, index],
          "not_unique",
          `Duplicate item "${item}".`,
          `存在重复项 "${item}"。`,
          "Remove duplicated values.",
          "请移除重复值。",
        );
      } else {
        seenValues.add(item);
      }
    }
  }

  return result;
}

function expectEnumValue<T extends string>(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
  allowedValues: readonly T[],
): T | null {
  if (typeof value !== "string") {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected a string enum value.",
      "应为字符串枚举值。",
      `Use one of: ${allowedValues.join(", ")}.`,
      `请使用以下值之一：${allowedValues.join("、")}。`,
    );
    return null;
  }

  if (!allowedValues.includes(value as T)) {
    addIssue(
      ctx,
      path,
      "invalid_enum_value",
      `Invalid value "${value}".`,
      `非法枚举值 "${value}"。`,
      `Use one of: ${allowedValues.join(", ")}.`,
      `请使用以下值之一：${allowedValues.join("、")}。`,
    );
    return null;
  }

  return value as T;
}

function checkStrictKeys(
  value: Record<string, unknown>,
  path: readonly (string | number)[],
  allowed: readonly string[],
  ctx: ParseContext,
): void {
  const allowedSet = new Set(allowed);

  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      addIssue(
        ctx,
        [...path, key],
        "unrecognized_key",
        `Unexpected field "${key}".`,
        `存在未定义字段 "${key}"。`,
        "Remove this field or add it to the schema.",
        "删除该字段或在 Schema 中声明它。",
      );
    }
  }
}

function expectRequiredField(
  value: Record<string, unknown>,
  key: string,
  path: readonly (string | number)[],
  ctx: ParseContext,
): unknown {
  if (!(key in value)) {
    addIssue(
      ctx,
      [...path, key],
      "required",
      `Missing required field "${key}".`,
      `缺少必填字段 "${key}"。`,
      "Add the missing field.",
      "请补充缺失字段。",
    );
    return undefined;
  }

  return value[key];
}

function addIssue(
  ctx: ParseContext,
  path: readonly (string | number)[],
  code: string,
  englishMessage: string,
  chineseMessage: string,
  englishSuggestion: string,
  chineseSuggestion: string,
): void {
  ctx.issues.push({
    path,
    code,
    message: text(ctx.locale, englishMessage, chineseMessage),
    suggestion: text(ctx.locale, englishSuggestion, chineseSuggestion),
  });
}

function toValidationIssue(issue: ZodLikeIssue): ModelConfigValidationIssue {
  return {
    path: toPathString(issue.path),
    code: issue.code,
    message: issue.message,
    suggestion: issue.suggestion,
  };
}

function toPathString(path: readonly (string | number)[]): string {
  if (path.length === 0) {
    return "/";
  }

  const escaped = path.map((segment) =>
    String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
  );
  return `/${escaped.join("/")}`;
}

function text(locale: ModelConfigLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
