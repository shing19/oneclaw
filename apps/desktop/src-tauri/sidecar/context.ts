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
  type ConfigManagerOptions,
  type OneclawConfig,
  type ProviderRegistry,
  type QuotaTracker,
  type SecretStoreManager,
} from "@oneclaw/core";

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

  async loadConfig(): Promise<OneclawConfig> {
    return this.getConfigManager().load();
  }
}
