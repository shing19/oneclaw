/**
 * IPC contracts for `doctor.*` namespace.
 *
 * Environment diagnostic checks — validates that dependencies,
 * credentials, and connectivity are properly configured.
 */

// ── Serializable types ─────────────────────────────────────────────

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface IpcDoctorCheck {
  readonly id: string;
  readonly label: {
    readonly "zh-CN": string;
    readonly en: string;
  };
  readonly status: DoctorCheckStatus;
  readonly message: {
    readonly "zh-CN": string;
    readonly en: string;
  };
  /** ISO 8601 timestamp. */
  readonly checkedAt: string;
}

export interface IpcDoctorReport {
  readonly overall: DoctorCheckStatus;
  readonly checks: IpcDoctorCheck[];
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
}

// ── Request params ─────────────────────────────────────────────────

/** `doctor.run` — run all diagnostic checks. */
export type DoctorRunParams = Record<string, never>;

// ── Response results ───────────────────────────────────────────────

/** `doctor.run` result. */
export type DoctorRunResult = IpcDoctorReport;
