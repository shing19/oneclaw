/**
 * Bilingual error mapping utility for sidecar handlers.
 *
 * Provides structured error creation with zh-CN and en messages,
 * mapping core module errors to JSON-RPC application error codes.
 */

import type { SidecarLocale } from "../context.js";

/**
 * Application-level JSON-RPC error codes.
 * Reserved range: -32000 to -32099.
 */
export const APP_ERROR_CODES = {
  SIDECAR_NOT_READY: -32000,
  KERNEL_ERROR: -32001,
  CONFIG_ERROR: -32002,
  SECRET_ERROR: -32003,
  CHANNEL_ERROR: -32004,
  MODEL_ERROR: -32005,
} as const;

export interface BilingualError {
  readonly jsonrpcCode: number;
  readonly appCode: string;
  readonly message: string;
  readonly recoverable: boolean;
}

function text(locale: SidecarLocale, en: string, zh: string): string {
  return locale === "zh-CN" ? zh : en;
}

/**
 * Extract a typed error code string from an unknown error.
 */
function extractErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "INTERNAL_ERROR";
}

/**
 * Extract recoverable flag from an error, defaulting to true.
 */
function extractRecoverable(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "recoverable" in error &&
    typeof (error as { recoverable: unknown }).recoverable === "boolean"
  ) {
    return (error as { recoverable: boolean }).recoverable;
  }
  return true;
}

/**
 * Create a BilingualError from a caught kernel/agent error.
 */
export function mapKernelError(
  error: unknown,
  locale: SidecarLocale,
): BilingualError {
  const code = extractErrorCode(error);
  const message =
    error instanceof Error ? error.message : text(locale, "Agent kernel error.", "Agent 内核错误。");
  return {
    jsonrpcCode: APP_ERROR_CODES.KERNEL_ERROR,
    appCode: code,
    message,
    recoverable: extractRecoverable(error),
  };
}

/**
 * Create a BilingualError from a caught config error.
 */
export function mapConfigError(
  error: unknown,
  locale: SidecarLocale,
): BilingualError {
  const code = extractErrorCode(error);
  const message =
    error instanceof Error ? error.message : text(locale, "Configuration error.", "配置错误。");
  return {
    jsonrpcCode: APP_ERROR_CODES.CONFIG_ERROR,
    appCode: code,
    message,
    recoverable: true,
  };
}

/**
 * Create a BilingualError from a caught secret store error.
 */
export function mapSecretError(
  error: unknown,
  locale: SidecarLocale,
): BilingualError {
  const code = extractErrorCode(error);
  const message =
    error instanceof Error ? error.message : text(locale, "Secret store error.", "密钥存储错误。");
  return {
    jsonrpcCode: APP_ERROR_CODES.SECRET_ERROR,
    appCode: code,
    message,
    recoverable: extractRecoverable(error),
  };
}

/**
 * Create a BilingualError from a caught channel error.
 */
export function mapChannelError(
  error: unknown,
  locale: SidecarLocale,
): BilingualError {
  const code = extractErrorCode(error);
  const message =
    error instanceof Error ? error.message : text(locale, "Channel error.", "通信渠道错误。");
  return {
    jsonrpcCode: APP_ERROR_CODES.CHANNEL_ERROR,
    appCode: code,
    message,
    recoverable: extractRecoverable(error),
  };
}

/**
 * Create a BilingualError from a caught model/provider error.
 */
export function mapModelError(
  error: unknown,
  locale: SidecarLocale,
): BilingualError {
  const code = extractErrorCode(error);
  const message =
    error instanceof Error ? error.message : text(locale, "Model provider error.", "模型提供者错误。");
  return {
    jsonrpcCode: APP_ERROR_CODES.MODEL_ERROR,
    appCode: code,
    message,
    recoverable: true,
  };
}

/**
 * Throw a structured error that the router's catch block will serialize
 * as a JSON-RPC error with application-level data.
 */
export class SidecarHandlerError extends Error {
  readonly code: string;
  readonly jsonrpcCode: number;
  readonly recoverable: boolean;

  constructor(bilingual: BilingualError) {
    super(bilingual.message);
    this.name = "SidecarHandlerError";
    this.code = bilingual.appCode;
    this.jsonrpcCode = bilingual.jsonrpcCode;
    this.recoverable = bilingual.recoverable;
  }
}
