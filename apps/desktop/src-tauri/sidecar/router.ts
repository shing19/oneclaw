/**
 * JSON-RPC method router.
 *
 * Maps method names to handler functions and dispatches incoming requests.
 * Read operations are registered here; write operations will be added in P2-B3.
 */

import type { SidecarContext } from "./context.js";
import { handleAgentStatus, handleAgentHealth } from "./handlers/agent.js";
import { handleConfigGet, handleConfigValidate } from "./handlers/config.js";
import {
  handleModelList,
  handleModelListPresets,
  handleModelGetQuota,
} from "./handlers/model.js";
import { handleSecretExists, handleSecretList } from "./handlers/secret.js";
import { handleChannelFeishuStatus } from "./handlers/channel.js";
import {
  handleCostSummary,
  handleCostHistory,
  handleCostExport,
} from "./handlers/cost.js";
import { handleDoctorRun } from "./handlers/doctor.js";

const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INTERNAL_ERROR = -32603;

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: number | string;
  result: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: { code: string; recoverable: boolean };
  };
}

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

type Handler = (
  ctx: SidecarContext,
  params: Record<string, unknown>,
) => unknown | Promise<unknown>;

function buildMethodTable(): Map<string, Handler> {
  const table = new Map<string, Handler>();

  // Agent read operations
  table.set("agent.status", (ctx) => handleAgentStatus(ctx));
  table.set("agent.health", (ctx) => handleAgentHealth(ctx));

  // Config read operations
  table.set("config.get", (ctx) => handleConfigGet(ctx));
  table.set("config.validate", (ctx) => handleConfigValidate(ctx));

  // Model read operations
  table.set("model.list", (ctx) => handleModelList(ctx));
  table.set("model.listPresets", () => handleModelListPresets());
  table.set("model.getQuota", (ctx, params) =>
    handleModelGetQuota(ctx, params as { providerId: string }),
  );

  // Secret read operations
  table.set("secret.exists", (ctx, params) =>
    handleSecretExists(ctx, params as { key: string }),
  );
  table.set("secret.list", (ctx) => handleSecretList(ctx));

  // Channel read operations
  table.set("channel.feishu.status", (ctx) => handleChannelFeishuStatus(ctx));

  // Cost read operations
  table.set("cost.summary", (ctx) => handleCostSummary(ctx));
  table.set("cost.history", (ctx, params) =>
    handleCostHistory(ctx, params as { start: string; end: string }),
  );
  table.set("cost.export", (ctx, params) =>
    handleCostExport(ctx, params as { format: "csv" | "json" }),
  );

  // Doctor
  table.set("doctor.run", (ctx) => handleDoctorRun(ctx));

  return table;
}

export class Router {
  private readonly ctx: SidecarContext;
  private readonly methods: Map<string, Handler>;

  constructor(ctx: SidecarContext) {
    this.ctx = ctx;
    this.methods = buildMethodTable();
  }

  async dispatch(raw: unknown): Promise<JsonRpcResponse | null> {
    if (!isValidRequest(raw)) {
      return {
        jsonrpc: "2.0",
        id: extractId(raw),
        error: { code: JSONRPC_INVALID_REQUEST, message: "Invalid request" },
      };
    }

    const request = raw as JsonRpcRequest;

    // Notifications (no id) — no response required
    if (!("id" in request) || request.id === undefined) {
      return null;
    }

    const handler = this.methods.get(request.method);
    if (handler === undefined) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: JSONRPC_METHOD_NOT_FOUND,
          message: `Method not found: ${request.method}`,
        },
      };
    }

    try {
      const params =
        typeof request.params === "object" && request.params !== null
          ? (request.params as Record<string, unknown>)
          : {};
      const result = await Promise.resolve(handler(this.ctx, params));
      return {
        jsonrpc: "2.0",
        id: request.id,
        result,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Internal error";
      const code =
        error instanceof Error && "code" in error
          ? String((error as { code: unknown }).code)
          : "INTERNAL_ERROR";

      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: JSONRPC_INTERNAL_ERROR,
          message,
          data: { code, recoverable: true },
        },
      };
    }
  }
}

function isValidRequest(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return obj.jsonrpc === "2.0" && typeof obj.method === "string";
}

function extractId(value: unknown): number | string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const id = (value as Record<string, unknown>).id;
  if (typeof id === "number" || typeof id === "string") {
    return id;
  }
  return null;
}

export function createParseErrorResponse(): JsonRpcErrorResponse {
  return {
    jsonrpc: "2.0",
    id: null,
    error: { code: JSONRPC_PARSE_ERROR, message: "Parse error" },
  };
}
