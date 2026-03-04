/**
 * React hook for type-safe Tauri event subscriptions.
 *
 * Wraps `@tauri-apps/api/event.listen()` in a `useEffect` with
 * automatic cleanup on unmount.
 */

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TauriEventMap } from "@/ipc/events";

type TauriEventName = keyof TauriEventMap;

/**
 * Subscribe to a Tauri event with type-safe payload.
 *
 * The listener is registered on mount and unregistered on unmount.
 * The callback reference is stable — updates to the callback do not
 * cause re-subscription.
 *
 * @param event - Tauri event name (e.g. "agent-log", "agent-status")
 * @param callback - Handler receiving the event payload
 */
export function useTauriEvent<E extends TauriEventName>(
  event: E,
  callback: (payload: TauriEventMap[E]) => void,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listen<TauriEventMap[E]>(event, (e) => {
      if (!cancelled) {
        callbackRef.current(e.payload);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}
