import { readFileSync } from "node:fs";

import type {
  ConcurrencySettings,
  MountPoint,
  SkillConfig,
} from "../types/agent-adapter.js";
import type {
  ModelConfig,
  ModelSettings,
  ProviderConfig,
} from "../types/model-config.js";

export type ValidationLocale = "zh-CN" | "en";

export interface GeneralConfig {
  language: ValidationLocale;
  theme: "light" | "dark" | "system";
  workspace: string;
}

export interface FeishuConfig {
  appId: string;
  appSecretRef: string;
  webhookUrl?: string;
  webhookTokenRef?: string;
  enabled?: boolean;
}

export interface ExtensibleChannelConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface ChannelsConfig {
  feishu?: FeishuConfig;
  dingtalk?: ExtensibleChannelConfig;
  wechatWork?: ExtensibleChannelConfig;
}

export interface AgentSectionConfig {
  concurrency: ConcurrencySettings;
  skills: SkillConfig[];
  mountPoints: MountPoint[];
  timeoutSeconds: number;
}

export interface AutomationTask {
  id: string;
  enabled: boolean;
  [key: string]: unknown;
}

export interface AutomationConfig {
  tasks: AutomationTask[];
}

export interface QuotaLimitsConfig {
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  warningThreshold: number;
}

export interface OneclawConfig {
  version: number;
  general: GeneralConfig;
  models: ModelConfig;
  channels: ChannelsConfig;
  agent: AgentSectionConfig;
  automation: AutomationConfig;
  quotas: QuotaLimitsConfig;
}

export interface ConfigValidationIssue {
  source: "zod" | "json-schema";
  path: string;
  code: string;
  message: string;
  suggestion: string;
}

export type ConfigValidationResult =
  | { ok: true; data: OneclawConfig }
  | { ok: false; issues: ConfigValidationIssue[] };

export interface ValidationOptions {
  locale?: ValidationLocale;
}

interface ZodLikeIssue {
  path: readonly (string | number)[];
  code: string;
  message: string;
  suggestion: string;
}

type ZodLikeSafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: ZodLikeIssue[] } };

export interface ZodLikeSchema<T> {
  safeParse(
    input: unknown,
    options?: ValidationOptions,
  ): ZodLikeSafeParseResult<T>;
}

interface ParseContext {
  locale: ValidationLocale;
  issues: ZodLikeIssue[];
}

interface JsonSchemaNode {
  $ref?: string;
  type?:
    | "object"
    | "array"
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "null";
  enum?: readonly unknown[];
  pattern?: string;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  required?: readonly string[];
  properties?: Record<string, JsonSchemaNode>;
  propertyNames?: JsonSchemaNode;
  additionalProperties?: boolean | JsonSchemaNode;
  items?: JsonSchemaNode;
  uniqueItems?: boolean;
  format?: "uri" | string;
  $defs?: Record<string, JsonSchemaNode>;
}

const DEFAULT_LOCALE: ValidationLocale = "zh-CN";

const DEFAULT_MODEL_PATTERN = /^[^/]+\/[^/]+$/;
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;
const CREDENTIAL_REF_PATTERN = /^oneclaw\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/;
const FEISHU_SECRET_REF_PATTERN = /^oneclaw\/channel\/feishu\/[a-z0-9-]+$/;

function text(
  locale: ValidationLocale,
  english: string,
  chinese: string,
): string {
  return locale === "zh-CN" ? chinese : english;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
        "Remove the field or add it to the schema.",
        "删除该字段或在 Schema 中声明它。",
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

function expectString(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
  options?: {
    minLength?: number;
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

  if (options?.minLength !== undefined && value.length < options.minLength) {
    addIssue(
      ctx,
      path,
      "too_small",
      `String must be at least ${options.minLength} characters.`,
      `字符串长度必须至少为 ${options.minLength}。`,
      "Provide a non-empty value.",
      "请提供非空值。",
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
      // URL constructor is sufficient for RFC-3986 compliant absolute URIs.
       
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

function expectStringArray(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
  options?: {
    unique?: boolean;
    nonEmpty?: boolean;
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

  const parsed: string[] = [];
  for (const [index, item] of value.entries()) {
    const parsedString = expectString(item, [...path, index], ctx, {
      minLength: options?.nonEmpty === true ? 1 : undefined,
    });

    if (parsedString !== null) {
      parsed.push(parsedString);
    }
  }

  if (options?.unique === true) {
    const seen = new Set<string>();
    for (const [index, item] of parsed.entries()) {
      if (seen.has(item)) {
        addIssue(
          ctx,
          [...path, index],
          "not_unique",
          "Array items must be unique.",
          "数组项必须唯一。",
          "Remove duplicated entries.",
          "请移除重复项。",
        );
      }
      seen.add(item);
    }
  }

  return parsed;
}

function expectEnumValue<T extends string>(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
  values: readonly T[],
): T | null {
  if (typeof value !== "string") {
    addIssue(
      ctx,
      path,
      "invalid_type",
      "Expected a string enum value.",
      "应为字符串枚举值。",
      `Use one of: ${values.join(", ")}.`,
      `请使用以下值之一：${values.join("、")}。`,
    );
    return null;
  }

  if (!values.includes(value as T)) {
    addIssue(
      ctx,
      path,
      "invalid_enum_value",
      `Invalid value "${value}".`,
      `非法枚举值 "${value}"。`,
      `Use one of: ${values.join(", ")}.`,
      `请使用以下值之一：${values.join("、")}。`,
    );
    return null;
  }

  return value as T;
}

function expectRequiredField(
  object: Record<string, unknown>,
  key: string,
  path: readonly (string | number)[],
  ctx: ParseContext,
): unknown {
  if (!(key in object)) {
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

  return object[key];
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
      ["off", "minimal", "low", "medium", "high", "xhigh", "adaptive"],
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
      ["sse", "websocket", "auto"],
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
      ["none", "short", "long"],
    );
    if (cacheRetention !== null) {
      result.cacheRetention = cacheRetention;
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
    { pattern: CREDENTIAL_REF_PATTERN },
  );
  const baseUrl = expectString(
    expectRequiredField(objectValue, "baseUrl", path, ctx),
    [...path, "baseUrl"],
    ctx,
    { uri: true },
  );
  const protocol = expectEnumValue(
    expectRequiredField(objectValue, "protocol", path, ctx),
    [...path, "protocol"],
    ctx,
    [
      "openai-completions",
      "openai-responses",
      "anthropic-messages",
      "ollama",
    ],
  );
  const models = expectStringArray(
    expectRequiredField(objectValue, "models", path, ctx),
    [...path, "models"],
    ctx,
    { unique: true, nonEmpty: true },
  );

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

  let providers: ProviderConfig[] | null = null;
  if (Array.isArray(providersRaw)) {
    providers = [];
    for (const [index, item] of providersRaw.entries()) {
      const parsed = parseProviderConfig(item, [...path, "providers", index], ctx);
      if (parsed !== null) {
        providers.push(parsed);
      }
    }
  } else {
    addIssue(
      ctx,
      [...path, "providers"],
      "invalid_type",
      "Expected providers to be an array.",
      "providers 应为数组。",
      "Provide an array of provider configurations.",
      "请提供 provider 配置数组。",
    );
  }

  const fallbackChain = expectStringArray(fallbackChainRaw, [...path, "fallbackChain"], ctx, {
    nonEmpty: true,
  });

  // defaultModel may be empty on fresh/reset config (no model selected yet).
  // Only enforce provider/model pattern when non-empty.
  const defaultModel = expectString(defaultModelRaw, [...path, "defaultModel"], ctx);
  if (defaultModel !== null && defaultModel !== "" && !DEFAULT_MODEL_PATTERN.test(defaultModel)) {
    addIssue(
      ctx,
      [...path, "defaultModel"],
      "invalid_string",
      "String format is invalid. Expected 'provider/model'.",
      "字符串格式不合法，应为 'provider/model' 格式。",
      "Use format like 'deepseek/deepseek-chat'.",
      "请使用如 'deepseek/deepseek-chat' 的格式。",
    );
  }

  let perModelSettings: Record<string, ModelSettings> | null = null;
  const perModelObject = expectObject(perModelSettingsRaw, [...path, "perModelSettings"], ctx);
  if (perModelObject !== null) {
    perModelSettings = {};
    for (const [key, item] of Object.entries(perModelObject)) {
      if (!DEFAULT_MODEL_PATTERN.test(key)) {
        addIssue(
          ctx,
          [...path, "perModelSettings", key],
          "invalid_key",
          `Invalid model key "${key}".`,
          `模型键 "${key}" 格式不合法。`,
          "Use provider/model format.",
          "请使用 provider/model 格式。",
        );
        continue;
      }

      const parsed = parseModelSettings(item, [...path, "perModelSettings", key], ctx);
      if (parsed !== null) {
        perModelSettings[key] = parsed;
      }
    }
  }

  if (
    providers === null ||
    fallbackChain === null ||
    defaultModel === null ||
    perModelSettings === null
  ) {
    return null;
  }

  return {
    providers,
    fallbackChain,
    defaultModel,
    perModelSettings,
  };
}

function parseFeishuConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): FeishuConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(
    objectValue,
    path,
    ["appId", "appSecretRef", "webhookUrl", "webhookTokenRef", "enabled"],
    ctx,
  );

  const appId = expectString(
    expectRequiredField(objectValue, "appId", path, ctx),
    [...path, "appId"],
    ctx,
    { minLength: 1 },
  );
  const appSecretRef = expectString(
    expectRequiredField(objectValue, "appSecretRef", path, ctx),
    [...path, "appSecretRef"],
    ctx,
    { pattern: FEISHU_SECRET_REF_PATTERN },
  );

  let webhookUrl: string | undefined;
  if ("webhookUrl" in objectValue) {
    const parsed = expectString(objectValue.webhookUrl, [...path, "webhookUrl"], ctx, {
      uri: true,
    });
    if (parsed !== null) {
      webhookUrl = parsed;
    }
  }

  let webhookTokenRef: string | undefined;
  if ("webhookTokenRef" in objectValue) {
    const parsed = expectString(
      objectValue.webhookTokenRef,
      [...path, "webhookTokenRef"],
      ctx,
      { pattern: FEISHU_SECRET_REF_PATTERN },
    );
    if (parsed !== null) {
      webhookTokenRef = parsed;
    }
  }

  let enabled: boolean | undefined;
  if ("enabled" in objectValue) {
    const parsed = expectBoolean(objectValue.enabled, [...path, "enabled"], ctx);
    if (parsed !== null) {
      enabled = parsed;
    }
  }

  if (appId === null || appSecretRef === null) {
    return null;
  }

  return {
    appId,
    appSecretRef,
    webhookUrl,
    webhookTokenRef,
    enabled,
  };
}

function parseExtensibleChannelConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): ExtensibleChannelConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  if ("enabled" in objectValue) {
    expectBoolean(objectValue.enabled, [...path, "enabled"], ctx);
  }

  return objectValue;
}

function parseChannelsConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): ChannelsConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(objectValue, path, ["feishu", "dingtalk", "wechatWork"], ctx);

  const parsed: ChannelsConfig = {};

  if ("feishu" in objectValue) {
    const feishu = parseFeishuConfig(objectValue.feishu, [...path, "feishu"], ctx);
    if (feishu !== null) {
      parsed.feishu = feishu;
    }
  }

  if ("dingtalk" in objectValue) {
    const dingtalk = parseExtensibleChannelConfig(
      objectValue.dingtalk,
      [...path, "dingtalk"],
      ctx,
    );
    if (dingtalk !== null) {
      parsed.dingtalk = dingtalk;
    }
  }

  if ("wechatWork" in objectValue) {
    const wechatWork = parseExtensibleChannelConfig(
      objectValue.wechatWork,
      [...path, "wechatWork"],
      ctx,
    );
    if (wechatWork !== null) {
      parsed.wechatWork = wechatWork;
    }
  }

  return parsed;
}

function parseSkillConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): SkillConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(objectValue, path, ["id", "enabled", "options"], ctx);

  const id = expectString(
    expectRequiredField(objectValue, "id", path, ctx),
    [...path, "id"],
    ctx,
    { minLength: 1 },
  );
  const enabled = expectBoolean(
    expectRequiredField(objectValue, "enabled", path, ctx),
    [...path, "enabled"],
    ctx,
  );

  let options: Record<string, unknown> | undefined;
  if ("options" in objectValue) {
    const parsed = expectObject(objectValue.options, [...path, "options"], ctx);
    if (parsed !== null) {
      options = parsed;
    }
  }

  if (id === null || enabled === null) {
    return null;
  }

  return {
    id,
    enabled,
    options,
  };
}

function parseMountPoint(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): MountPoint | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(objectValue, path, ["hostPath", "containerPath", "readonly"], ctx);

  const hostPath = expectString(
    expectRequiredField(objectValue, "hostPath", path, ctx),
    [...path, "hostPath"],
    ctx,
    { minLength: 1 },
  );
  const containerPath = expectString(
    expectRequiredField(objectValue, "containerPath", path, ctx),
    [...path, "containerPath"],
    ctx,
    { minLength: 1 },
  );
  const readonly = expectBoolean(
    expectRequiredField(objectValue, "readonly", path, ctx),
    [...path, "readonly"],
    ctx,
  );

  if (hostPath === null || containerPath === null || readonly === null) {
    return null;
  }

  return {
    hostPath,
    containerPath,
    readonly,
  };
}

function parseConcurrencySettings(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): ConcurrencySettings | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(objectValue, path, ["maxConcurrent", "subagents"], ctx);

  const maxConcurrent = expectNumber(
    expectRequiredField(objectValue, "maxConcurrent", path, ctx),
    [...path, "maxConcurrent"],
    ctx,
    { integer: true, min: 1 },
  );

  const subagentsValue = expectObject(
    expectRequiredField(objectValue, "subagents", path, ctx),
    [...path, "subagents"],
    ctx,
  );

  let subagents: ConcurrencySettings["subagents"] | null = null;
  if (subagentsValue !== null) {
    checkStrictKeys(
      subagentsValue,
      [...path, "subagents"],
      ["maxConcurrent", "maxSpawnDepth", "maxChildrenPerAgent"],
      ctx,
    );

    const subMaxConcurrent = expectNumber(
      expectRequiredField(subagentsValue, "maxConcurrent", [...path, "subagents"], ctx),
      [...path, "subagents", "maxConcurrent"],
      ctx,
      { integer: true, min: 1 },
    );
    const maxSpawnDepth = expectNumber(
      expectRequiredField(subagentsValue, "maxSpawnDepth", [...path, "subagents"], ctx),
      [...path, "subagents", "maxSpawnDepth"],
      ctx,
      { integer: true, min: 1, max: 5 },
    );
    const maxChildrenPerAgent = expectNumber(
      expectRequiredField(
        subagentsValue,
        "maxChildrenPerAgent",
        [...path, "subagents"],
        ctx,
      ),
      [...path, "subagents", "maxChildrenPerAgent"],
      ctx,
      { integer: true, min: 1, max: 20 },
    );

    if (
      subMaxConcurrent !== null &&
      maxSpawnDepth !== null &&
      maxChildrenPerAgent !== null
    ) {
      subagents = {
        maxConcurrent: subMaxConcurrent,
        maxSpawnDepth,
        maxChildrenPerAgent,
      };
    }
  }

  if (maxConcurrent === null || subagents === null) {
    return null;
  }

  return {
    maxConcurrent,
    subagents,
  };
}

function parseAgentSectionConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): AgentSectionConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(
    objectValue,
    path,
    ["concurrency", "skills", "mountPoints", "timeoutSeconds"],
    ctx,
  );

  const concurrency = parseConcurrencySettings(
    expectRequiredField(objectValue, "concurrency", path, ctx),
    [...path, "concurrency"],
    ctx,
  );

  const skillsRaw = expectRequiredField(objectValue, "skills", path, ctx);
  let skills: SkillConfig[] | null = null;
  if (Array.isArray(skillsRaw)) {
    skills = [];
    for (const [index, item] of skillsRaw.entries()) {
      const parsed = parseSkillConfig(item, [...path, "skills", index], ctx);
      if (parsed !== null) {
        skills.push(parsed);
      }
    }
  } else {
    addIssue(
      ctx,
      [...path, "skills"],
      "invalid_type",
      "Expected skills to be an array.",
      "skills 应为数组。",
      "Provide a skills array.",
      "请提供 skills 数组。",
    );
  }

  const mountPointsRaw = expectRequiredField(objectValue, "mountPoints", path, ctx);
  let mountPoints: MountPoint[] | null = null;
  if (Array.isArray(mountPointsRaw)) {
    mountPoints = [];
    for (const [index, item] of mountPointsRaw.entries()) {
      const parsed = parseMountPoint(item, [...path, "mountPoints", index], ctx);
      if (parsed !== null) {
        mountPoints.push(parsed);
      }
    }
  } else {
    addIssue(
      ctx,
      [...path, "mountPoints"],
      "invalid_type",
      "Expected mountPoints to be an array.",
      "mountPoints 应为数组。",
      "Provide a mount point array.",
      "请提供 mountPoints 数组。",
    );
  }

  const timeoutSeconds = expectNumber(
    expectRequiredField(objectValue, "timeoutSeconds", path, ctx),
    [...path, "timeoutSeconds"],
    ctx,
    { integer: true, min: 1 },
  );

  if (
    concurrency === null ||
    skills === null ||
    mountPoints === null ||
    timeoutSeconds === null
  ) {
    return null;
  }

  return {
    concurrency,
    skills,
    mountPoints,
    timeoutSeconds,
  };
}

function parseAutomationTask(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): AutomationTask | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  const id = expectString(
    expectRequiredField(objectValue, "id", path, ctx),
    [...path, "id"],
    ctx,
    { minLength: 1 },
  );
  const enabled = expectBoolean(
    expectRequiredField(objectValue, "enabled", path, ctx),
    [...path, "enabled"],
    ctx,
  );

  if (id === null || enabled === null) {
    return null;
  }

  return {
    ...objectValue,
    id,
    enabled,
  };
}

function parseAutomationConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): AutomationConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(objectValue, path, ["tasks"], ctx);

  const tasksRaw = expectRequiredField(objectValue, "tasks", path, ctx);
  if (!Array.isArray(tasksRaw)) {
    addIssue(
      ctx,
      [...path, "tasks"],
      "invalid_type",
      "Expected tasks to be an array.",
      "tasks 应为数组。",
      "Provide an array of task objects.",
      "请提供任务对象数组。",
    );
    return null;
  }

  const tasks: AutomationTask[] = [];
  for (const [index, item] of tasksRaw.entries()) {
    const parsed = parseAutomationTask(item, [...path, "tasks", index], ctx);
    if (parsed !== null) {
      tasks.push(parsed);
    }
  }

  return { tasks };
}

function parseQuotaLimitsConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): QuotaLimitsConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(
    objectValue,
    path,
    ["dailyLimit", "weeklyLimit", "monthlyLimit", "warningThreshold"],
    ctx,
  );

  const warningThreshold = expectNumber(
    expectRequiredField(objectValue, "warningThreshold", path, ctx),
    [...path, "warningThreshold"],
    ctx,
    { min: 0, max: 100 },
  );

  let dailyLimit: number | undefined;
  if ("dailyLimit" in objectValue) {
    const parsed = expectNumber(objectValue.dailyLimit, [...path, "dailyLimit"], ctx, {
      min: 0,
    });
    if (parsed !== null) {
      dailyLimit = parsed;
    }
  }

  let weeklyLimit: number | undefined;
  if ("weeklyLimit" in objectValue) {
    const parsed = expectNumber(objectValue.weeklyLimit, [...path, "weeklyLimit"], ctx, {
      min: 0,
    });
    if (parsed !== null) {
      weeklyLimit = parsed;
    }
  }

  let monthlyLimit: number | undefined;
  if ("monthlyLimit" in objectValue) {
    const parsed = expectNumber(objectValue.monthlyLimit, [...path, "monthlyLimit"], ctx, {
      min: 0,
    });
    if (parsed !== null) {
      monthlyLimit = parsed;
    }
  }

  if (warningThreshold === null) {
    return null;
  }

  return {
    dailyLimit,
    weeklyLimit,
    monthlyLimit,
    warningThreshold,
  };
}

function parseGeneralConfig(
  value: unknown,
  path: readonly (string | number)[],
  ctx: ParseContext,
): GeneralConfig | null {
  const objectValue = expectObject(value, path, ctx);
  if (objectValue === null) {
    return null;
  }

  checkStrictKeys(objectValue, path, ["language", "theme", "workspace"], ctx);

  const language = expectEnumValue(
    expectRequiredField(objectValue, "language", path, ctx),
    [...path, "language"],
    ctx,
    ["zh-CN", "en"],
  );
  const theme = expectEnumValue(
    expectRequiredField(objectValue, "theme", path, ctx),
    [...path, "theme"],
    ctx,
    ["light", "dark", "system"],
  );
  const workspace = expectString(
    expectRequiredField(objectValue, "workspace", path, ctx),
    [...path, "workspace"],
    ctx,
    { minLength: 1 },
  );

  if (language === null || theme === null || workspace === null) {
    return null;
  }

  return {
    language,
    theme,
    workspace,
  };
}

function safeParseWithRuntimeSchema(
  input: unknown,
  options?: ValidationOptions,
): ZodLikeSafeParseResult<OneclawConfig> {
  const ctx: ParseContext = {
    locale: options?.locale ?? DEFAULT_LOCALE,
    issues: [],
  };

  const root = expectObject(input, [], ctx);
  if (root === null) {
    return {
      success: false,
      error: {
        issues: ctx.issues,
      },
    };
  }

  checkStrictKeys(
    root,
    [],
    ["version", "general", "models", "channels", "agent", "automation", "quotas"],
    ctx,
  );

  const version = expectNumber(
    expectRequiredField(root, "version", [], ctx),
    ["version"],
    ctx,
    { integer: true, min: 1 },
  );
  const general = parseGeneralConfig(
    expectRequiredField(root, "general", [], ctx),
    ["general"],
    ctx,
  );
  const models = parseModelConfig(
    expectRequiredField(root, "models", [], ctx),
    ["models"],
    ctx,
  );
  const channels = parseChannelsConfig(
    expectRequiredField(root, "channels", [], ctx),
    ["channels"],
    ctx,
  );
  const agent = parseAgentSectionConfig(
    expectRequiredField(root, "agent", [], ctx),
    ["agent"],
    ctx,
  );
  const automation = parseAutomationConfig(
    expectRequiredField(root, "automation", [], ctx),
    ["automation"],
    ctx,
  );
  const quotas = parseQuotaLimitsConfig(
    expectRequiredField(root, "quotas", [], ctx),
    ["quotas"],
    ctx,
  );

  if (
    ctx.issues.length > 0 ||
    version === null ||
    general === null ||
    models === null ||
    channels === null ||
    agent === null ||
    automation === null ||
    quotas === null
  ) {
    return {
      success: false,
      error: {
        issues: ctx.issues,
      },
    };
  }

  return {
    success: true,
    data: {
      version,
      general,
      models,
      channels,
      agent,
      automation,
      quotas,
    },
  };
}

export const oneclawConfigZodSchema: ZodLikeSchema<OneclawConfig> = {
  safeParse: safeParseWithRuntimeSchema,
};

function readJsonSchema(): JsonSchemaNode {
  const schemaUrl = new URL("./schema.json", import.meta.url);
  const rawText = readFileSync(schemaUrl, "utf8");
  const parsed = JSON.parse(rawText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Config schema root must be an object.");
  }

  return parsed as JsonSchemaNode;
}

const oneclawConfigJsonSchema = readJsonSchema();

function resolveReference(
  root: JsonSchemaNode,
  ref: string,
): JsonSchemaNode | null {
  if (!ref.startsWith("#/")) {
    return null;
  }

  const segments = ref.slice(2).split("/");
  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current)) {
      return null;
    }

    const unescaped = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    current = current[unescaped];
  }

  if (!isRecord(current)) {
    return null;
  }

  return current as JsonSchemaNode;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => sameJsonValue(value, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      if (!sameJsonValue(left[key], right[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function addJsonSchemaIssue(
  issues: ConfigValidationIssue[],
  locale: ValidationLocale,
  path: readonly (string | number)[],
  code: string,
  englishMessage: string,
  chineseMessage: string,
  englishSuggestion: string,
  chineseSuggestion: string,
): void {
  issues.push({
    source: "json-schema",
    path: toPathString(path),
    code,
    message: text(locale, englishMessage, chineseMessage),
    suggestion: text(locale, englishSuggestion, chineseSuggestion),
  });
}

function validateAgainstJsonSchemaNode(
  value: unknown,
  schema: JsonSchemaNode,
  rootSchema: JsonSchemaNode,
  path: readonly (string | number)[],
  locale: ValidationLocale,
  issues: ConfigValidationIssue[],
): void {
  if (schema.$ref !== undefined) {
    const resolved = resolveReference(rootSchema, schema.$ref);
    if (resolved === null) {
      addJsonSchemaIssue(
        issues,
        locale,
        path,
        "invalid_ref",
        `Unable to resolve schema reference "${schema.$ref}".`,
        `无法解析 Schema 引用 "${schema.$ref}"。`,
        "Fix the schema reference path.",
        "请修复 Schema 引用路径。",
      );
      return;
    }

    validateAgainstJsonSchemaNode(value, resolved, rootSchema, path, locale, issues);
    return;
  }

  if (schema.enum !== undefined && !schema.enum.some((item) => Object.is(item, value))) {
    addJsonSchemaIssue(
      issues,
      locale,
      path,
      "invalid_enum",
      "Value is not in enum list.",
      "该值不在枚举范围内。",
      "Use one of the allowed enum values.",
      "请使用允许的枚举值。",
    );
  }

  if (schema.type !== undefined) {
    const typeIsValid =
      (schema.type === "string" && typeof value === "string") ||
      (schema.type === "number" && typeof value === "number" && !Number.isNaN(value)) ||
      (schema.type === "integer" && typeof value === "number" && Number.isInteger(value)) ||
      (schema.type === "boolean" && typeof value === "boolean") ||
      (schema.type === "array" && Array.isArray(value)) ||
      (schema.type === "object" && isRecord(value)) ||
      (schema.type === "null" && value === null);

    if (!typeIsValid) {
      addJsonSchemaIssue(
        issues,
        locale,
        path,
        "type_mismatch",
        `Expected type "${schema.type}".`,
        `类型应为 "${schema.type}"。`,
        "Fix the value type to match schema.",
        "请按 Schema 要求修正值类型。",
      );
      return;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      addJsonSchemaIssue(
        issues,
        locale,
        path,
        "min_length",
        `String length must be >= ${schema.minLength}.`,
        `字符串长度必须 >= ${schema.minLength}。`,
        "Provide a longer string value.",
        "请提供更长的字符串值。",
      );
    }

    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      addJsonSchemaIssue(
        issues,
        locale,
        path,
        "pattern",
        "String does not match required pattern.",
        "字符串不符合要求的正则格式。",
        "Update the value format.",
        "请修改值格式。",
      );
    }

    if (schema.format === "uri") {
      try {
         
        new URL(value);
      } catch {
        addJsonSchemaIssue(
          issues,
          locale,
          path,
          "uri",
          "String must be a valid URI.",
          "字符串必须是合法 URI。",
          "Provide a URI with scheme.",
          "请提供包含协议的 URI。",
        );
      }
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      addJsonSchemaIssue(
        issues,
        locale,
        path,
        "minimum",
        `Number must be >= ${schema.minimum}.`,
        `数字必须 >= ${schema.minimum}。`,
        "Increase the value to satisfy minimum.",
        "请增大该值以满足最小值要求。",
      );
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      addJsonSchemaIssue(
        issues,
        locale,
        path,
        "maximum",
        `Number must be <= ${schema.maximum}.`,
        `数字必须 <= ${schema.maximum}。`,
        "Decrease the value to satisfy maximum.",
        "请减小该值以满足最大值要求。",
      );
    }
  }

  if (Array.isArray(value)) {
    if (schema.uniqueItems === true) {
      for (let left = 0; left < value.length; left += 1) {
        for (let right = left + 1; right < value.length; right += 1) {
          if (sameJsonValue(value[left], value[right])) {
            addJsonSchemaIssue(
              issues,
              locale,
              [...path, right],
              "unique_items",
              "Array items must be unique.",
              "数组项必须唯一。",
              "Remove duplicated array entries.",
              "请移除重复数组项。",
            );
          }
        }
      }
    }

    if (schema.items !== undefined) {
      for (const [index, item] of value.entries()) {
        validateAgainstJsonSchemaNode(
          item,
          schema.items,
          rootSchema,
          [...path, index],
          locale,
          issues,
        );
      }
    }
  }

  if (isRecord(value)) {
    if (schema.required !== undefined) {
      for (const key of schema.required) {
        if (!(key in value)) {
          addJsonSchemaIssue(
            issues,
            locale,
            [...path, key],
            "required",
            `Missing required field "${key}".`,
            `缺少必填字段 "${key}"。`,
            "Add the missing field.",
            "请补充缺失字段。",
          );
        }
      }
    }

    if (schema.properties !== undefined) {
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateAgainstJsonSchemaNode(
            value[key],
            propertySchema,
            rootSchema,
            [...path, key],
            locale,
            issues,
          );
        }
      }
    }

    if (schema.propertyNames !== undefined) {
      for (const key of Object.keys(value)) {
        validateAgainstJsonSchemaNode(
          key,
          schema.propertyNames,
          rootSchema,
          [...path, key],
          locale,
          issues,
        );
      }
    }

    const knownKeys = schema.properties === undefined ? new Set<string>() : new Set(Object.keys(schema.properties));

    for (const [key, propertyValue] of Object.entries(value)) {
      if (knownKeys.has(key)) {
        continue;
      }

      if (schema.additionalProperties === false) {
        addJsonSchemaIssue(
          issues,
          locale,
          [...path, key],
          "additional_properties",
          `Field "${key}" is not allowed.`,
          `字段 "${key}" 不被允许。`,
          "Remove this field or update schema.",
          "请删除该字段或更新 Schema。",
        );
      } else if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== true
      ) {
        validateAgainstJsonSchemaNode(
          propertyValue,
          schema.additionalProperties,
          rootSchema,
          [...path, key],
          locale,
          issues,
        );
      }
    }
  }
}

function dedupeIssues(
  issues: readonly ConfigValidationIssue[],
): ConfigValidationIssue[] {
  const deduped = new Map<string, ConfigValidationIssue>();

  for (const issue of issues) {
    const key = [issue.source, issue.path, issue.code, issue.message].join("|");
    if (!deduped.has(key)) {
      deduped.set(key, issue);
    }
  }

  return [...deduped.values()];
}

function localeFromOptions(options?: ValidationOptions): ValidationLocale {
  return options?.locale ?? DEFAULT_LOCALE;
}

export function validateWithZodSchema(
  input: unknown,
  options?: ValidationOptions,
): ConfigValidationResult {
  const parseResult = oneclawConfigZodSchema.safeParse(input, options);

  if (parseResult.success) {
    return {
      ok: true,
      data: parseResult.data,
    };
  }

  return {
    ok: false,
    issues: parseResult.error.issues.map((issue) => ({
      source: "zod",
      path: toPathString(issue.path),
      code: issue.code,
      message: issue.message,
      suggestion: issue.suggestion,
    })),
  };
}

export function validateWithJsonSchema(
  input: unknown,
  options?: ValidationOptions,
): ConfigValidationIssue[] {
  const locale = localeFromOptions(options);
  const issues: ConfigValidationIssue[] = [];

  validateAgainstJsonSchemaNode(
    input,
    oneclawConfigJsonSchema,
    oneclawConfigJsonSchema,
    [],
    locale,
    issues,
  );

  return dedupeIssues(issues);
}

export class ConfigValidationError extends Error {
  readonly issues: ConfigValidationIssue[];

  constructor(issues: readonly ConfigValidationIssue[]) {
    super("Oneclaw config validation failed.");
    this.name = "ConfigValidationError";
    this.issues = [...issues];
  }
}

export function validateConfig(
  input: unknown,
  options?: ValidationOptions,
): ConfigValidationResult {
  const zodResult = validateWithZodSchema(input, options);
  const jsonSchemaIssues = validateWithJsonSchema(input, options);

  if (!zodResult.ok) {
    return {
      ok: false,
      issues: dedupeIssues([...zodResult.issues, ...jsonSchemaIssues]),
    };
  }

  if (jsonSchemaIssues.length > 0) {
    return {
      ok: false,
      issues: jsonSchemaIssues,
    };
  }

  return zodResult;
}

export function assertValidConfig(
  input: unknown,
  options?: ValidationOptions,
): OneclawConfig {
  const result = validateConfig(input, options);
  if (!result.ok) {
    throw new ConfigValidationError(result.issues);
  }

  return result.data;
}
