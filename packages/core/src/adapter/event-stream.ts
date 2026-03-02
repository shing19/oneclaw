import type {
  CostEvent,
  ErrorInfo,
  KernelStatus,
  LogEntry,
} from "../types/agent-adapter.js";
import type { Disposable } from "../types/model-config.js";

export interface AgentKernelEventStreamOptions {
  cloneLog?: (entry: LogEntry) => LogEntry;
  cloneStatus?: (status: KernelStatus) => KernelStatus;
  cloneCost?: (event: CostEvent) => CostEvent;
  cloneError?: (error: ErrorInfo) => ErrorInfo;
}

export class AgentKernelEventStream {
  private readonly logListeners: Set<(entry: LogEntry) => void>;
  private readonly statusListeners: Set<(status: KernelStatus) => void>;
  private readonly costListeners: Set<(event: CostEvent) => void>;
  private readonly errorListeners: Set<(error: ErrorInfo) => void>;
  private readonly cloneLog: (entry: LogEntry) => LogEntry;
  private readonly cloneStatus: (status: KernelStatus) => KernelStatus;
  private readonly cloneCost: (event: CostEvent) => CostEvent;
  private readonly cloneError: (error: ErrorInfo) => ErrorInfo;

  constructor(options: AgentKernelEventStreamOptions = {}) {
    this.logListeners = new Set<(entry: LogEntry) => void>();
    this.statusListeners = new Set<(status: KernelStatus) => void>();
    this.costListeners = new Set<(event: CostEvent) => void>();
    this.errorListeners = new Set<(error: ErrorInfo) => void>();
    this.cloneLog = options.cloneLog ?? cloneIdentity;
    this.cloneStatus = options.cloneStatus ?? cloneIdentity;
    this.cloneCost = options.cloneCost ?? cloneIdentity;
    this.cloneError = options.cloneError ?? cloneIdentity;
  }

  onLog(callback: (entry: LogEntry) => void): Disposable {
    this.logListeners.add(callback);
    return {
      dispose: (): void => {
        this.logListeners.delete(callback);
      },
    };
  }

  onStatus(callback: (status: KernelStatus) => void): Disposable {
    this.statusListeners.add(callback);
    return {
      dispose: (): void => {
        this.statusListeners.delete(callback);
      },
    };
  }

  onCost(callback: (event: CostEvent) => void): Disposable {
    this.costListeners.add(callback);
    return {
      dispose: (): void => {
        this.costListeners.delete(callback);
      },
    };
  }

  onError(callback: (error: ErrorInfo) => void): Disposable {
    this.errorListeners.add(callback);
    return {
      dispose: (): void => {
        this.errorListeners.delete(callback);
      },
    };
  }

  emitLog(entry: LogEntry): void {
    this.emitEvent(this.logListeners, entry, this.cloneLog);
  }

  emitStatus(status: KernelStatus): void {
    this.emitEvent(this.statusListeners, status, this.cloneStatus);
  }

  emitCost(event: CostEvent): void {
    this.emitEvent(this.costListeners, event, this.cloneCost);
  }

  emitError(error: ErrorInfo): void {
    this.emitEvent(this.errorListeners, error, this.cloneError);
  }

  clearAll(): void {
    this.logListeners.clear();
    this.statusListeners.clear();
    this.costListeners.clear();
    this.errorListeners.clear();
  }

  private emitEvent<T>(
    listeners: Set<(event: T) => void>,
    event: T,
    clone: (event: T) => T,
  ): void {
    const snapshot = clone(event);
    for (const listener of listeners) {
      try {
        listener(clone(snapshot));
      } catch {
        // Listener failures are isolated to keep the kernel event loop stable.
      }
    }
  }
}

function cloneIdentity<T>(value: T): T {
  return value;
}
