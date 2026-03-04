/**
 * Sidecar service context — lazy-initialized core module instances.
 *
 * Each getter creates the service on first access and caches it.
 * This avoids heavy upfront initialization and allows the sidecar
 * to start accepting JSON-RPC requests immediately.
 */

import {
  ConfigManager,
  createProviderRegistry,
  createQuotaTracker,
  createSecretStore,
  createOpenClawAdapter,
  createFeishuAdapter,
  createProviderHealthManager,
  type OneclawConfig,
  type ProviderRegistry,
  type QuotaTracker,
  type SecretStoreManager,
  type OpenClawAdapter,
  type ChannelAdapter,
  type ProviderHealthManager,
  type Disposable,
} from "@oneclaw/core";
import {
  emitLogEvent,
  emitStatusEvent,
  emitCostEvent,
} from "./event-emitter.js";

export type SidecarLocale = "zh-CN" | "en";

export interface SidecarContextOptions {
  locale?: SidecarLocale;
}

export class SidecarContext {
  readonly locale: SidecarLocale;

  private configManagerInstance: ConfigManager | null = null;
  private secretStoreInstance: SecretStoreManager | null = null;
  private secretStorePromise: Promise<SecretStoreManager> | null = null;
  private providerRegistryInstance: ProviderRegistry | null = null;
  private quotaTrackerInstance: QuotaTracker | null = null;
  private agentKernelInstance: OpenClawAdapter | null = null;
  private feishuAdapterInstance: ChannelAdapter | null = null;
  private providerHealthManagerInstance: ProviderHealthManager | null = null;
  private readonly eventSubscriptions: Disposable[] = [];

  constructor(options: SidecarContextOptions = {}) {
    this.locale = options.locale ?? "zh-CN";
  }

  getConfigManager(): ConfigManager {
    if (this.configManagerInstance === null) {
      this.configManagerInstance = new ConfigManager({ locale: this.locale });
    }
    return this.configManagerInstance;
  }

  async getSecretStore(): Promise<SecretStoreManager> {
    if (this.secretStoreInstance !== null) {
      return this.secretStoreInstance;
    }
    if (this.secretStorePromise !== null) {
      return this.secretStorePromise;
    }
    this.secretStorePromise = createSecretStore({ locale: this.locale }).then(
      (store) => {
        this.secretStoreInstance = store;
        this.secretStorePromise = null;
        return store;
      },
    );
    return this.secretStorePromise;
  }

  getProviderRegistry(): ProviderRegistry {
    if (this.providerRegistryInstance === null) {
      this.providerRegistryInstance = createProviderRegistry({
        locale: this.locale,
      });
    }
    return this.providerRegistryInstance;
  }

  getQuotaTracker(): QuotaTracker {
    if (this.quotaTrackerInstance === null) {
      this.quotaTrackerInstance = createQuotaTracker({ locale: this.locale });
    }
    return this.quotaTrackerInstance;
  }

  /**
   * Get or create the agent kernel (OpenClawAdapter).
   * The kernel manages its own lifecycle (start/stop/restart).
   * Automatically subscribes to kernel events and forwards them as
   * JSON-RPC notifications to stdout (→ Rust bridge → Tauri events).
   */
  getAgentKernel(): OpenClawAdapter {
    if (this.agentKernelInstance === null) {
      const kernel = createOpenClawAdapter({
        locale: this.locale,
      });
      this.subscribeKernelEvents(kernel);
      this.agentKernelInstance = kernel;
    }
    return this.agentKernelInstance;
  }

  /**
   * Get the current Feishu adapter, or null if not yet set up.
   */
  getFeishuAdapter(): ChannelAdapter | null {
    return this.feishuAdapterInstance;
  }

  /**
   * Create and store a new Feishu adapter instance for channel operations.
   * Called during channel.feishu.setup to initialize the adapter.
   */
  async createFeishuAdapter(): Promise<ChannelAdapter> {
    const secretStore = await this.getSecretStore();
    const adapter = createFeishuAdapter({
      locale: this.locale,
      resolveSecret: async (ref: string) => {
        const value = await secretStore.get(ref);
        return value;
      },
    });
    this.feishuAdapterInstance = adapter;
    return adapter;
  }

  /**
   * Get or create the provider health manager.
   */
  getProviderHealthManager(): ProviderHealthManager {
    if (this.providerHealthManagerInstance === null) {
      this.providerHealthManagerInstance = createProviderHealthManager({
        locale: this.locale,
        providerRegistry: this.getProviderRegistry(),
      });
    }
    return this.providerHealthManagerInstance;
  }

  async loadConfig(): Promise<OneclawConfig> {
    return this.getConfigManager().load();
  }

  /**
   * Dispose all event subscriptions. Called on sidecar shutdown.
   */
  dispose(): void {
    for (const sub of this.eventSubscriptions) {
      sub.dispose();
    }
    this.eventSubscriptions.length = 0;
  }

  /**
   * Subscribe to kernel log/status/cost events and forward as
   * JSON-RPC notifications via stdout.
   */
  private subscribeKernelEvents(kernel: OpenClawAdapter): void {
    const logSub = kernel.onLog((entry) => {
      emitLogEvent({
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp.toISOString(),
        traceId: entry.traceId,
        metadata: entry.metadata,
      });
    });

    const statusSub = kernel.onStatusChange((status) => {
      emitStatusEvent({
        state: status.state,
        uptime: status.uptime,
        activeAgents: status.activeAgents,
        lastError:
          status.lastError === undefined
            ? undefined
            : {
                code: status.lastError.code,
                message: status.lastError.message,
                timestamp: status.lastError.timestamp.toISOString(),
              },
      });
    });

    const costSub = kernel.onCostEvent((event) => {
      emitCostEvent({
        provider: event.provider,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        estimatedCostYuan: event.estimatedCostYuan,
        timestamp: event.timestamp.toISOString(),
        traceId: event.traceId,
      });
    });

    this.eventSubscriptions.push(logSub, statusSub, costSub);
  }
}
