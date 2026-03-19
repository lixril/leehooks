/**
 * useSmartQuery — SWR-like data fetching backed by LRU cache
 *
 * Features:
 *  - React Suspense-first via `use()`
 *  - LRU-bounded in-memory cache (configurable)
 *  - Automatic deduplication of in-flight requests
 *  - `deps` array for reactive refetching
 *  - `enabled` flag for conditional fetching
 *  - `onSuccess` / `onError` callbacks
 *  - `mutate()` for optimistic updates
 *  - `prefetch()` for cache warming
 *  - `useSmartQueryClient()` for imperative cache access
 *  - Object/array keys (auto-serialized)
 */

import { LRUCache } from "lru-cache";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type QueryKey = string | readonly unknown[];

export type FetchFn<TData> = () => Promise<TData>;

export interface QueryOptions<TData, TError = Error> {
  /** Time in ms before cached data is considered stale. Default: Infinity */
  staleTime?: number;

  /**
   * Like useEffect deps — when any value changes the query refetches.
   * Stable references matter (useMemo / primitive values).
   */
  deps?: readonly unknown[];

  /**
   * Set to false to skip fetching entirely.
   * Useful when waiting for auth or a required ID.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Minimum time in ms to suppress duplicate requests for the same key.
   * During this window, concurrent callers share the in-flight promise.
   * Default: 2000
   */
  dedupingInterval?: number;

  /** Called once with resolved data after a successful fetch. */
  onSuccess?: (data: TData) => void;

  /** Called with the thrown error after a failed fetch. */
  onError?: (error: TError) => void;
}

export interface QueryResult<TData> {
  /** Resolved data (throws Suspense promise while loading) */
  data: TData;

  /**
   * Imperatively invalidate the cache entry and re-trigger the fetch.
   * Safe to call from event handlers or effects.
   */
  refetch: () => void;

  /**
   * Apply an optimistic update without a network round-trip.
   * Pass the new data directly or a updater function `(prev) => next`.
   */
  mutate: (updater: TData | ((prev: TData) => TData)) => void;
}

interface CacheEntry<T> {
  /** The settled-or-pending promise stored for `use()` */
  promise: Promise<T>;
  /** Wall-clock time of the last successful resolution */
  timestamp: number;
  /** The resolved value, available after settlement */
  resolved?: T;
}

// Global cache configuration

let globalCache = new LRUCache<string, CacheEntry<any>>({ max: 500 });

export interface CacheConfig {
  /** Maximum number of unique query keys to hold in memory. Default: 500 */
  max?: number;
  /** Global TTL for cache entries in ms. Default: none */
  ttl?: number;
}

/**
 * Call once at app startup (e.g. in main.tsx) to tune cache behaviour.
 *
 * @example
 * configureCache({ max: 200, ttl: 60_000 })
 */

export function configureCache(config: CacheConfig) {
  globalCache = new LRUCache<string, CacheEntry<any>>({
    max: config.max ?? 500,
    ttl: config.ttl,
  });
}

// Key serialization
function serializeKey(key: QueryKey): string {
  if (typeof key === "string") return key;
  return JSON.stringify(key);
}

function createFetcher<TData>(
  rawKey: string,
  fetchFn: FetchFn<TData>,
  staleTime: number,
  dedupingInterval: number,
  onSuccess?: (data: TData) => void,
  onError?: (error: unknown) => void,
): Promise<TData> {
  const entry = globalCache.get(rawKey);
  const now = Date.now();

  // Return cached promise if still within staleTime
  if (entry) {
    const age = now - entry.timestamp;
    if (age < staleTime) return entry.promise as Promise<TData>;
    // Within deduping window — reuse the in-flight promise
    if (age < dedupingInterval && !entry.resolved)
      return entry.promise as Promise<TData>;
  }

  const promise = fetchFn()
    .then(async (res): Promise<TData> => {
      // Transparent Response unwrapping for fetch()-style usage
      if (res instanceof Response) {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json() as Promise<TData>;
      }
      return res;
    })
    .then((data: TData) => {
      // Overwrite with a resolved promise so future reads are synchronous
      const settled: CacheEntry<TData> = {
        promise: Promise.resolve(data),
        timestamp: Date.now(),
        resolved: data,
      };
      globalCache.set(rawKey, settled);
      onSuccess?.(data);
      return data;
    })
    .catch((err: unknown) => {
      globalCache.delete(rawKey);
      onError?.(err);
      throw err;
    });

  // Store pending promise immediately for deduplication
  globalCache.set(rawKey, { promise, timestamp: now });
  return promise;
}

export interface SmartQueryClient {
  /** Evict a key from the cache (triggers refetch on next render) */
  invalidate: (key: QueryKey) => void;

  /** Read cached data without suspending — returns undefined on miss */
  peek: <TData>(key: QueryKey) => TData | undefined;

  /**
   * Warm the cache before a component mounts.
   * Safe to call in event handlers, route loaders, etc.
   */
  prefetch: <TData>(
    key: QueryKey,
    fetchFn: FetchFn<TData>,
    options?: Pick<QueryOptions<TData>, "staleTime" | "dedupingInterval">,
  ) => Promise<TData>;

  /** Evict all entries */
  clear: () => void;
}

export const smartQueryClient: SmartQueryClient = {
  invalidate(key) {
    globalCache.delete(serializeKey(key));
  },

  peek<TData>(key: QueryKey): TData | undefined {
    return globalCache.get(serializeKey(key))?.resolved as TData | undefined;
  },

  // type Any Bypass
  prefetch<TData>(key: any, fetchFn: any, options: any = {}) {
    return createFetcher<TData>(
      serializeKey(key),
      fetchFn,
      options.staleTime ?? Infinity,
      options.dedupingInterval ?? 2000,
    );
  },

  clear() {
    globalCache.clear();
  },
};

/**
 * Hook form of the client — identical API, just ergonomic for components.
 *
 * @example
 * const client = useSmartQueryClient()
 * client.invalidate(['user', id])
 */
export function useSmartQueryClient(): SmartQueryClient {
  return smartQueryClient;
}

/**
 * useSmartQuery — suspense-first data fetching with LRU cache.
 *
 * Must be used inside a `<Suspense>` boundary.
 *
 * @example
 * const { data, refetch, mutate } = useSmartQuery(
 *   ['user', userId],
 *   () => fetch(`/api/user/${userId}`),
 *   { staleTime: 30_000, deps: [userId] }
 * )
 */
export function useSmartQuery<TData, TError = Error>(
  key: QueryKey,
  fetchFn: FetchFn<TData>,
  options: QueryOptions<TData, TError> = {},
): QueryResult<TData> {
  const {
    staleTime = Infinity,
    deps = [],
    enabled = true,
    dedupingInterval = 2_000,
    onSuccess,
    onError,
  } = options;

  // version bump forces a new cache key → refetch
  const [version, setVersion] = useState(0);

  const serializedKey = serializeKey(key);
  const effectiveKey = `${serializedKey}::v${version}`;

  // Stable callback refs — don't invalidate the memo when inline fns change
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Stable fetchFn ref
  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const promise = useMemo(() => {
    if (!enabled) {
      // Return a never-resolving promise — Suspense will hold indefinitely
      // until enabled flips true and version bumps.
      return new Promise<TData>(() => {});
    }
    return createFetcher<TData>(
      effectiveKey,
      () => fetchFnRef.current(),
      staleTime,
      dedupingInterval,
      (d) => onSuccessRef.current?.(d),
      (e) => onErrorRef.current?.(e as TError),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey, enabled, staleTime, dedupingInterval]);

  // Reactive refetch on deps change
  const depsRef = useRef<readonly unknown[]>([]);
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      depsRef.current = deps;
      return;
    }
    const changed = deps.some((dep, i) => dep !== depsRef.current[i]);
    if (changed) {
      depsRef.current = deps;
      globalCache.delete(effectiveKey);
      setVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Suspense — throws the promise if not yet resolved
  const data = use(promise);

  const refetch = useCallback(() => {
    globalCache.delete(effectiveKey);
    setVersion((v) => v + 1);
  }, [effectiveKey]);

  const mutate = useCallback(
    (updater: TData | ((prev: TData) => TData)) => {
      const entry = globalCache.get(effectiveKey);
      const prev = entry?.resolved as TData | undefined;
      const next =
        typeof updater === "function"
          ? (updater as (prev: TData) => TData)(prev as TData)
          : updater;

      const settled: CacheEntry<TData> = {
        promise: Promise.resolve(next),
        timestamp: Date.now(),
        resolved: next,
      };
      globalCache.set(effectiveKey, settled);
      // Force re-render so `use()` picks up the new settled promise
      setVersion((v) => v + 1);
    },
    [effectiveKey],
  );

  return { data, refetch, mutate };
}
