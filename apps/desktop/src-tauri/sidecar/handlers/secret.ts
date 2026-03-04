/**
 * Sidecar handlers for `secret.*` read operations.
 *
 * secret.exists — check if a secret key exists
 * secret.list   — list all secret keys (values never returned)
 */

import type { SidecarContext } from "../context.js";

export async function handleSecretExists(
  ctx: SidecarContext,
  params: { key: string },
): Promise<{ exists: boolean }> {
  const store = await ctx.getSecretStore();
  const exists = await store.has(params.key);
  return { exists };
}

export async function handleSecretList(
  ctx: SidecarContext,
): Promise<{ keys: string[] }> {
  const store = await ctx.getSecretStore();
  const keys = await store.list();
  return { keys };
}
