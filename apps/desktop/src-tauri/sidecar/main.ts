/**
 * OneClaw Sidecar — JSON-RPC 2.0 server over stdio.
 *
 * Entry point for the sidecar process. Reads JSON-RPC requests from stdin
 * (one per line), dispatches to the router, and writes responses to stdout.
 *
 * Usage:
 *   bun run apps/desktop/src-tauri/sidecar/main.ts        (development)
 *   ./oneclaw-sidecar                                      (production, bun-compiled)
 */

import { createInterface } from "node:readline";
import { SidecarContext } from "./context.js";
import { Router, createParseErrorResponse } from "./router.js";

const SIDECAR_VERSION = "0.1.0";

async function main(): Promise<void> {
  const ctx = new SidecarContext();
  const router = new Router(ctx);

  // Signal readiness to the Rust host.
  const readyNotification = JSON.stringify({
    jsonrpc: "2.0",
    method: "ready",
    params: { version: SIDECAR_VERSION },
  });
  process.stdout.write(readyNotification + "\n");

  // Read JSON-RPC requests line-by-line from stdin.
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      const errorResponse = createParseErrorResponse();
      process.stdout.write(JSON.stringify(errorResponse) + "\n");
      continue;
    }

    const response = await router.dispatch(parsed);
    if (response !== null) {
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Sidecar fatal error: ${message}\n`);
  process.exit(1);
});
