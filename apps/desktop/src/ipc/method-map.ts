/**
 * Unified type-safe method map for all JSON-RPC methods.
 *
 * Provides compile-time enforcement: every method string maps to
 * exactly one params type and one result type.
 *
 * Used by:
 * - Frontend `invoke()` wrapper to type request/response
 * - Sidecar router to dispatch handlers
 * - Tests to verify contract compatibility
 */

import type {
  AgentStartParams,
  AgentStartResult,
  AgentStopParams,
  AgentStopResult,
  AgentRestartParams,
  AgentRestartResult,
  AgentStatusParams,
  AgentStatusResult,
  AgentHealthParams,
  AgentHealthResult,
} from "./methods/agent.js";

import type {
  ConfigGetParams,
  ConfigGetResult,
  ConfigUpdateParams,
  ConfigUpdateResult,
  ConfigResetParams,
  ConfigResetResult,
  ConfigValidateParams,
  ConfigValidateResult,
} from "./methods/config.js";

import type {
  ModelListParams,
  ModelListResult,
  ModelListPresetsParams,
  ModelListPresetsResult,
  ModelSetFallbackChainParams,
  ModelSetFallbackChainResult,
  ModelTestProviderParams,
  ModelTestProviderResult,
  ModelGetQuotaParams,
  ModelGetQuotaResult,
} from "./methods/model.js";

import type {
  SecretSetParams,
  SecretSetResult,
  SecretDeleteParams,
  SecretDeleteResult,
  SecretExistsParams,
  SecretExistsResult,
  SecretListParams,
  SecretListResult,
} from "./methods/secret.js";

import type {
  ChannelFeishuSetupParams,
  ChannelFeishuSetupResult,
  ChannelFeishuTestParams,
  ChannelFeishuTestResult,
  ChannelFeishuStatusParams,
  ChannelFeishuStatusResult,
  ChannelFeishuSendTestParams,
  ChannelFeishuSendTestResult,
} from "./methods/channel.js";

import type {
  CostSummaryParams,
  CostSummaryResult,
  CostHistoryParams,
  CostHistoryResult,
  CostExportParams,
  CostExportResult,
} from "./methods/cost.js";

import type {
  DoctorRunParams,
  DoctorRunResult,
} from "./methods/doctor.js";

/**
 * Complete mapping: JSON-RPC method name → { params, result }.
 *
 * This is the single source of truth for all IPC methods.
 */
export interface IpcMethodMap {
  // ── agent ──
  "agent.start": { params: AgentStartParams; result: AgentStartResult };
  "agent.stop": { params: AgentStopParams; result: AgentStopResult };
  "agent.restart": { params: AgentRestartParams; result: AgentRestartResult };
  "agent.status": { params: AgentStatusParams; result: AgentStatusResult };
  "agent.health": { params: AgentHealthParams; result: AgentHealthResult };

  // ── config ──
  "config.get": { params: ConfigGetParams; result: ConfigGetResult };
  "config.update": { params: ConfigUpdateParams; result: ConfigUpdateResult };
  "config.reset": { params: ConfigResetParams; result: ConfigResetResult };
  "config.validate": { params: ConfigValidateParams; result: ConfigValidateResult };

  // ── model ──
  "model.list": { params: ModelListParams; result: ModelListResult };
  "model.listPresets": { params: ModelListPresetsParams; result: ModelListPresetsResult };
  "model.setFallbackChain": { params: ModelSetFallbackChainParams; result: ModelSetFallbackChainResult };
  "model.testProvider": { params: ModelTestProviderParams; result: ModelTestProviderResult };
  "model.getQuota": { params: ModelGetQuotaParams; result: ModelGetQuotaResult };

  // ── secret ──
  "secret.set": { params: SecretSetParams; result: SecretSetResult };
  "secret.delete": { params: SecretDeleteParams; result: SecretDeleteResult };
  "secret.exists": { params: SecretExistsParams; result: SecretExistsResult };
  "secret.list": { params: SecretListParams; result: SecretListResult };

  // ── channel ──
  "channel.feishu.setup": { params: ChannelFeishuSetupParams; result: ChannelFeishuSetupResult };
  "channel.feishu.test": { params: ChannelFeishuTestParams; result: ChannelFeishuTestResult };
  "channel.feishu.status": { params: ChannelFeishuStatusParams; result: ChannelFeishuStatusResult };
  "channel.feishu.sendTest": { params: ChannelFeishuSendTestParams; result: ChannelFeishuSendTestResult };

  // ── cost ──
  "cost.summary": { params: CostSummaryParams; result: CostSummaryResult };
  "cost.history": { params: CostHistoryParams; result: CostHistoryResult };
  "cost.export": { params: CostExportParams; result: CostExportResult };

  // ── doctor ──
  "doctor.run": { params: DoctorRunParams; result: DoctorRunResult };
}

/** All valid IPC method names. */
export type IpcMethodName = keyof IpcMethodMap;

/** Extract params type for a given method. */
export type IpcParams<M extends IpcMethodName> = IpcMethodMap[M]["params"];

/** Extract result type for a given method. */
export type IpcResult<M extends IpcMethodName> = IpcMethodMap[M]["result"];
