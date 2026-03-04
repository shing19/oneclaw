/**
 * Sidecar handlers for `secret.*` operations.
 *
 * Read:
 *   secret.exists — check if a secret key exists
 *   secret.list   — list all secret keys (values never returned)
 *
 * Write:
 *   secret.set    — store a secret value
 *   secret.delete — remove a secret
 */

import type { SidecarContext } from "../context.js";
import { mapSecretError, SidecarHandlerError } from "./errors.js";

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

export async function handleSecretSet(
  ctx: SidecarContext,
  params: { key: string; value: string },
): Promise<{ ok: true }> {
  const store = await ctx.getSecretStore();

  try {
    await store.set(params.key, params.value);
    return { ok: true };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapSecretError(error, ctx.locale));
  }
}

export async function handleSecretDelete(
  ctx: SidecarContext,
  params: { key: string },
): Promise<{ ok: true }> {
  const store = await ctx.getSecretStore();

  try {
    await store.delete(params.key);
    return { ok: true };
  } catch (error: unknown) {
    throw new SidecarHandlerError(mapSecretError(error, ctx.locale));
  }
}
