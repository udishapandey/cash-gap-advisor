"use client";

import { useEffect, useState } from "react";
import { readAiCache, writeAiCache } from "@/lib/ai-cache";
import { hashInput, stableStringify } from "@/lib/hash";

export type AiResource<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: T; fromCache: boolean }
  | { status: "failed"; message: string };

const CLIENT_TIMEOUT_MS = 30_000;

/**
 * Fetch an AI answer for `request` from one of our own routes. It waits a moment before asking (so dragging a slider
 * doesn't fire a call per step), cancels a request that is out of date, and reuses a saved answer for an identical
 * request. While the numbers have changed and the new answer isn't ready, it reports "loading", never the old text.
 */
export function useAiResource<T>(opts: {
  endpoint: string;
  /** The request body. null means "don't ask yet". */
  request: unknown | null;
  isValid: (v: unknown) => v is T;
  /** Only answers that pass this are saved in the browser. */
  isCacheable?: (v: T) => boolean;
  debounceMs?: number;
}): AiResource<T> {
  const { endpoint, request, isValid, isCacheable, debounceMs = 0 } = opts;
  const requestKey = request === null ? null : stableStringify(request);
  const [held, setHeld] = useState<{ forKey: string; resource: AiResource<T> } | null>(null);

  useEffect(() => {
    if (requestKey === null) return;
    const controller = new AbortController();

    const run = async () => {
      const hash = await hashInput({ endpoint, request: JSON.parse(requestKey) });
      try {
        const hit = readAiCache(sessionStorage, hash, isValid);
        if (hit) {
          if (!controller.signal.aborted) setHeld({ forKey: requestKey, resource: { status: "ready", value: hit, fromCache: true } });
          return;
        }
      } catch {}
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestKey,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok || !isValid(data.outcome)) throw new Error("bad response");
        const value = data.outcome as T;
        if (!isCacheable || isCacheable(value)) writeAiCache(sessionStorage, hash, value);
        if (!controller.signal.aborted) setHeld({ forKey: requestKey, resource: { status: "ready", value, fromCache: false } });
      } catch {
        if (controller.signal.aborted) return;
        setHeld({ forKey: requestKey, resource: { status: "failed", message: "Couldn't reach the AI service." } });
      }
    };

    const timer = setTimeout(run, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, requestKey, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (requestKey === null) return { status: "idle" };
  return held && held.forKey === requestKey ? held.resource : { status: "loading" };
}
