/**
 * IPC contracts for `secret.*` namespace.
 *
 * Maps to SecretStore operations in @oneclaw/core.
 * Secret values are NEVER returned to the frontend.
 * Only existence checks and masked previews are exposed.
 */

// ── Request params ─────────────────────────────────────────────────

/** `secret.set` — store a secret value. */
export interface SecretSetParams {
  readonly key: string;
  readonly value: string;
}

/** `secret.delete` — remove a secret. */
export interface SecretDeleteParams {
  readonly key: string;
}

/** `secret.exists` — check if a secret exists. */
export interface SecretExistsParams {
  readonly key: string;
}

/** `secret.list` — list all secret keys (values are never returned). */
export type SecretListParams = Record<string, never>;

// ── Response results ───────────────────────────────────────────────

/** `secret.set` result. */
export interface SecretSetResult {
  readonly ok: true;
}

/** `secret.delete` result. */
export interface SecretDeleteResult {
  readonly ok: true;
}

/** `secret.exists` result. */
export interface SecretExistsResult {
  readonly exists: boolean;
}

/** `secret.list` result. Returns keys only, never values. */
export interface SecretListResult {
  readonly keys: string[];
}
