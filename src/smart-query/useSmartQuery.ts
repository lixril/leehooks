/**
 * useSmartQuery - SWR-like data fetching backed by LRU cache
 *
 * Features:
 *  - React Suspense-first via `use()`
 *  - Optional non-Suspense API for loading/error states
 *  - LRU-bounded in-memory cache (configurable)
 *  - Automatic deduplication of in-flight requests
 *  - `deps` array for reactive refetching
 *  - `enabled` flag for conditional fetching
 *  - `onSuccess` / `onError` callbacks
 *  - `mutate()` for optimistic updates
 *  - `prefetch()` for cache warming
 *  - `useSmartQueryClient()` for imperative cache access
 *  - Object/array keys (auto-serialized)
 *  - AbortController support for cancellation
 *  - Retry support
 *  - Focus/interval background refetching (optional)
 *  - Infinite query helpers
 *  - Mutation helpers
 *  - Devtools hooks for cache inspection
 */

import { LRUCache } from "lru-cache";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type QueryKey = string | readonly unknown[];

export interface FetchContext {
  signal: AbortSignal;
}

export type FetchFn<TData> = (context?: FetchContext) => Promise<TData>;

type RetryDecision =
  | number
  | ((failureCount: number, error: unknown) => boolean);

type RetryDelay = number | ((failureCount: number, error: unknown) => number);

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

  /**
   * Retry policy for failed requests.
   * number: max retry count. function: decide per failure.
   * Default: 0
   */
  retry?: RetryDecision;

  /**
   * Delay between retries in ms. Can be a function of attempt count.
   * Default: 1000
   */
  retryDelay?: RetryDelay;

  /**
   * Refetch in background when window regains focus.
   * Default: false
   */
  refetchOnWindowFocus?: boolean;

  /**
   * Refetch in background on a fixed interval (ms).
   * Default: undefined (disabled)
   */
  refetchInterval?: number;

  /**
   * Allow interval refetching while the tab is hidden.
   * Default: false
   */
  refetchIntervalInBackground?: boolean;

  /**
   * When focus/interval refetching, keep current data and update in background.
   * Default: true
   */
  backgroundRefetch?: boolean;

  /** Called once with resolved data after a successful fetch. */
  onSuccess?: (data: TData) => void;

  /** Called with the thrown error after a failed fetch. */
  onError?: (error: TError) => void;
}

export interface QueryResult<TData> {
  /** Resolved data (throws Suspense promise while loading) */
  data: TData;

  /** True when a background fetch is in-flight for this key. */
  isFetching: boolean;

  /**
   * Imperatively invalidate the cache entry and re-trigger the fetch.
   * Safe to call from event handlers or effects.
   */
  refetch: () => void;

  /**
   * Cancel any in-flight fetch for this query.
   * Requires the fetcher to respect AbortSignal.
   */
  cancel: () => void;

  /**
   * Apply an optimistic update without a network round-trip.
   * Pass the new data directly or a updater function `(prev) => next`.
   */
  mutate: (updater: TData | ((prev: TData) => TData)) => void;
}

export type QueryStatus = "idle" | "loading" | "success" | "error";

export interface QueryStateResult<TData, TError = Error> {
  data?: TData;
  error?: TError;
  status: QueryStatus;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
  cancel: () => void;
  mutate: (updater: TData | ((prev: TData) => TData)) => void;
}

interface CacheEntry<T> {
  /** The settled-or-pending promise stored for `use()` */
  promise: Promise<T>;
  /** Wall-clock time of the last successful resolution */
  timestamp: number;
  /** The resolved value, available after settlement */
  resolved?: T;
  /** Last error (if any) */
  error?: unknown;
  /** Current status */
  status: "pending" | "success" | "error";
  /** In-flight background revalidate promise */
  backgroundPromise?: Promise<T>;
  /** Whether a background fetch is in-flight */
  isFetching?: boolean;
  /** Abort controller for in-flight request */
  abort?: AbortController;
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

function serializeParam(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(retry: RetryDecision | undefined, count: number, error: unknown) {
  if (retry === undefined) return false;
  if (typeof retry === "number") return count <= retry;
  return retry(count, error);
}

function getRetryDelay(
  retryDelay: RetryDelay | undefined,
  count: number,
  error: unknown,
) {
  if (retryDelay === undefined) return 1000;
  if (typeof retryDelay === "number") return retryDelay;
  return retryDelay(count, error);
}

function emitDevtoolsEvent(event: SmartQueryDevtoolsEvent) {
  devtoolsEvents.push(event);
  if (devtoolsEvents.length > MAX_DEVTOOLS_EVENTS) devtoolsEvents.shift();
  devtoolsListeners.forEach((listener) => listener(event));
}

function abortEntry(key: string) {
  const entry = globalCache.get(key);
  if (entry?.abort) {
    entry.abort.abort();
    emitDevtoolsEvent({ type: "abort", key });
  }
}

function setResolvedCacheEntry<TData>(key: string, data: TData) {
  const settled: CacheEntry<TData> = {
    promise: Promise.resolve(data),
    timestamp: Date.now(),
    resolved: data,
    status: "success",
  };
  globalCache.set(key, settled);
  emitDevtoolsEvent({ type: "set", key, entry: settled });
}

interface FetcherOptions<TData> {
  staleTime: number;
  dedupingInterval: number;
  retry?: RetryDecision;
  retryDelay?: RetryDelay;
  background?: boolean;
  onSuccess?: (data: TData) => void;
  onError?: (error: unknown) => void;
}

function createFetcher<TData>(
  rawKey: string,
  fetchFn: FetchFn<TData>,
  options: FetcherOptions<TData>,
): Promise<TData> {
  const entry = globalCache.get(rawKey) as CacheEntry<TData> | undefined;
  const now = Date.now();

  if (entry) {
    const age = now - entry.timestamp;
    if (entry.status === "success" && age < options.staleTime) {
      console.log("[useSmartQuery] cache hit (fresh)", { key: rawKey, age });
      return entry.promise as Promise<TData>;
    }
    if (entry.status === "pending" && age < options.dedupingInterval) {
      console.log("[useSmartQuery] dedupe in-flight", { key: rawKey, age });
      return entry.promise as Promise<TData>;
    }
    if (entry.backgroundPromise && age < options.dedupingInterval) {
      console.log("[useSmartQuery] reuse background promise", { key: rawKey, age });
      return entry.backgroundPromise as Promise<TData>;
    }
  }

  if (entry?.abort) {
    entry.abort.abort();
    emitDevtoolsEvent({ type: "abort", key: rawKey });
  }

  const controller = new AbortController();
  const context = { signal: controller.signal };

  const attemptFetch = async (attempt: number): Promise<TData> => {
    try {
      const res = await fetchFn(context);
      if (res instanceof Response) {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json() as Promise<TData>;
      }
      return res;
    } catch (err) {
      if (controller.signal.aborted) throw err;
      const failureCount = attempt + 1;
      if (shouldRetry(options.retry, failureCount, err)) {
        const delay = getRetryDelay(options.retryDelay, failureCount, err);
        await sleep(delay);
        return attemptFetch(failureCount);
      }
      throw err;
    }
  };

  const promise = attemptFetch(0)
    .then((data: TData) => {
      const settled: CacheEntry<TData> = {
        promise: Promise.resolve(data),
        timestamp: Date.now(),
        resolved: data,
        status: "success",
      };
      globalCache.set(rawKey, settled);
      emitDevtoolsEvent({ type: "fetchSuccess", key: rawKey, entry: settled });
      options.onSuccess?.(data);
      return data;
    })
    .catch((err: unknown) => {
      const rejected = Promise.reject(err);
      rejected.catch(() => undefined);
      const errorEntry: CacheEntry<TData> = {
        promise: rejected,
        timestamp: Date.now(),
        error: err,
        status: "error",
      };
      globalCache.set(rawKey, errorEntry);
      emitDevtoolsEvent({ type: "fetchError", key: rawKey, error: err, entry: errorEntry });
      options.onError?.(err);
      throw err;
    });

  if (options.background && entry?.status === "success") {
    const backgroundEntry: CacheEntry<TData> = {
      ...entry,
      isFetching: true,
      backgroundPromise: promise,
      abort: controller,
      status: entry.status ?? "success",
    };
    globalCache.set(rawKey, backgroundEntry);
    emitDevtoolsEvent({ type: "fetchStart", key: rawKey, entry: backgroundEntry });
    promise
      .catch((err) => {
        if (entry?.status === "success") {
          const withError: CacheEntry<TData> = {
            ...backgroundEntry,
            isFetching: false,
            backgroundPromise: undefined,
            error: err,
          };
          globalCache.set(rawKey, withError);
          emitDevtoolsEvent({ type: "set", key: rawKey, entry: withError });
        }
      })
      .finally(() => {
        const current = globalCache.get(rawKey) as CacheEntry<TData> | undefined;
        if (current?.backgroundPromise === promise) {
          const cleared: CacheEntry<TData> = {
            ...current,
            isFetching: false,
            backgroundPromise: undefined,
          };
          globalCache.set(rawKey, cleared);
          emitDevtoolsEvent({ type: "set", key: rawKey, entry: cleared });
        }
      });
    return promise;
  }

  const pendingEntry: CacheEntry<TData> = {
    promise,
    timestamp: now,
    resolved: entry?.resolved,
    status: "pending",
    abort: controller,
  };
  globalCache.set(rawKey, pendingEntry);
  emitDevtoolsEvent({ type: "fetchStart", key: rawKey, entry: pendingEntry });
  console.log("[useSmartQuery] fetch start", { key: rawKey });
  return promise;
}

export interface SmartQueryClient {
  /** Evict a key from the cache (triggers refetch on next render) */
  invalidate: (key: QueryKey) => void;

  /** Cancel any in-flight fetch for the given key */
  cancel: (key: QueryKey) => void;

  /** Read cached data without suspending — returns undefined on miss */
  peek: <TData>(key: QueryKey) => TData | undefined;

  /**
   * Warm the cache before a component mounts.
   * Safe to call in event handlers, route loaders, etc.
   */
  prefetch: <TData>(
    key: QueryKey,
    fetchFn: FetchFn<TData>,
    options?: Pick<QueryOptions<TData>, "staleTime" | "dedupingInterval" | "retry" | "retryDelay">,
  ) => Promise<TData>;

  /** Evict all entries */
  clear: () => void;
}

export const smartQueryClient: SmartQueryClient = {
  invalidate(key) {
    const rawKey = serializeKey(key);
    abortEntry(rawKey);
    globalCache.delete(rawKey);
    emitDevtoolsEvent({ type: "delete", key: rawKey });
  },

  cancel(key) {
    abortEntry(serializeKey(key));
  },

  peek<TData>(key: QueryKey): TData | undefined {
    return globalCache.get(serializeKey(key))?.resolved as TData | undefined;
  },

  // type Any Bypass
  prefetch<TData>(key: any, fetchFn: any, options: any = {}) {
    return createFetcher<TData>(serializeKey(key), fetchFn, {
      staleTime: options.staleTime ?? Infinity,
      dedupingInterval: options.dedupingInterval ?? 2000,
      retry: options.retry ?? 0,
      retryDelay: options.retryDelay,
    });
  },

  clear() {
    globalCache.clear();
    emitDevtoolsEvent({ type: "clear" });
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

type SmartQueryDevtoolsEventType =
  | "set"
  | "delete"
  | "clear"
  | "fetchStart"
  | "fetchSuccess"
  | "fetchError"
  | "abort";

export interface SmartQueryDevtoolsEvent {
  type: SmartQueryDevtoolsEventType;
  key?: string;
  entry?: CacheEntry<any>;
  error?: unknown;
}

export interface SmartQueryDevtoolsSnapshot {
  size: number;
  entries: Array<{
    key: string;
    status: CacheEntry<any>["status"];
    timestamp: number;
    age: number;
    hasData: boolean;
    hasError: boolean;
    isFetching: boolean;
    data?: unknown;
    error?: unknown;
  }>;
  events: SmartQueryDevtoolsEvent[];
}

const devtoolsListeners = new Set<(event: SmartQueryDevtoolsEvent) => void>();
const devtoolsEvents: SmartQueryDevtoolsEvent[] = [];
const MAX_DEVTOOLS_EVENTS = 200;

export const smartQueryDevtools = {
  subscribe(listener: (event: SmartQueryDevtoolsEvent) => void) {
    devtoolsListeners.add(listener);
    return () => {
      devtoolsListeners.delete(listener);
    };
  },
  getSnapshot(): SmartQueryDevtoolsSnapshot {
    const entries = Array.from(globalCache.entries()).map(([key, entry]) => {
      const age = Date.now() - entry.timestamp;
      return {
        key,
        status: entry.status,
        timestamp: entry.timestamp,
        age,
        hasData: entry.resolved !== undefined,
        hasError: entry.error !== undefined,
        isFetching: Boolean(entry.isFetching || entry.status === "pending"),
        data: entry.resolved,
        error: entry.error,
      };
    });
    return {
      size: globalCache.size,
      entries,
      events: [...devtoolsEvents],
    };
  },
  clearEvents() {
    devtoolsEvents.length = 0;
  },
};

export function useSmartQueryDevtools() {
  const [, bump] = useState(0);
  useEffect(() => smartQueryDevtools.subscribe(() => bump((v) => v + 1)), []);
  return smartQueryDevtools.getSnapshot();
}

function getQueryState<TData, TError>(
  entry: CacheEntry<TData> | undefined,
  enabled: boolean,
): QueryStateResult<TData, TError> {
  if (!enabled) {
    return {
      status: "idle",
      isLoading: false,
      isFetching: false,
      refetch: () => undefined,
      cancel: () => undefined,
      mutate: () => undefined,
    };
  }

  const status: QueryStatus = entry
    ? entry.status === "pending"
      ? "loading"
      : entry.status
    : "loading";

  const isFetching = Boolean(entry?.isFetching || entry?.status === "pending");

  return {
    data: entry?.resolved as TData | undefined,
    error: entry?.error as TError | undefined,
    status,
    isLoading: status === "loading",
    isFetching,
    refetch: () => undefined,
    cancel: () => undefined,
    mutate: () => undefined,
  };
}

function useRefetchOnFocus(
  enabled: boolean,
  handler: () => void,
  refetchOnWindowFocus: boolean,
) {
  useEffect(() => {
    if (!enabled || !refetchOnWindowFocus) return undefined;
    if (typeof window === "undefined") return undefined;

    const onFocus = () => {
      console.log("[useSmartQuery] refetch on window focus");
      handler();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log("[useSmartQuery] refetch on visibility change");
        handler();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, handler, refetchOnWindowFocus]);
}

function useRefetchInterval(
  enabled: boolean,
  handler: () => void,
  refetchInterval: number | undefined,
  refetchIntervalInBackground: boolean,
) {
  useEffect(() => {
    if (!enabled || !refetchInterval) return undefined;
    if (typeof window === "undefined") return undefined;

    const timer = window.setInterval(() => {
      if (!refetchIntervalInBackground && document.visibilityState === "hidden") {
        return;
      }
      handler();
    }, refetchInterval);

    return () => window.clearInterval(timer);
  }, [enabled, handler, refetchInterval, refetchIntervalInBackground]);
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
    retry = 0,
    retryDelay,
    refetchOnWindowFocus = false,
    refetchInterval,
    refetchIntervalInBackground = false,
    backgroundRefetch = true,
    onSuccess,
    onError,
  } = options;

  // version bump forces a new cache key → refetch
  const [version, setVersion] = useState(0);
  // rerender without changing key (used by mutate)
  const [rerenderTick, setRerenderTick] = useState(0);

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

  const entry = globalCache.get(effectiveKey) as CacheEntry<TData> | undefined;
  const entryAge = entry ? Date.now() - entry.timestamp : 0;
  const isStale = Boolean(entry?.status === "success" && entryAge >= staleTime);

  const promise = useMemo(() => {
    if (!enabled) {
      return new Promise<TData>(() => undefined);
    }
    if (backgroundRefetch && isStale && entry?.status === "success") {
      console.log("[useSmartQuery] stale cache reused (background revalidate)", {
        key: effectiveKey,
        age: entryAge,
      });
      return entry.promise as Promise<TData>;
    }
    return createFetcher<TData>(effectiveKey, (ctx) => fetchFnRef.current(ctx), {
      staleTime,
      dedupingInterval,
      retry,
      retryDelay,
      onSuccess: (d) => onSuccessRef.current?.(d),
      onError: (e) => onErrorRef.current?.(e as TError),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveKey,
    enabled,
    staleTime,
    dedupingInterval,
    retry,
    retryDelay,
    rerenderTick,
    backgroundRefetch,
    isStale,
    entry?.status,
    entry?.promise,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!backgroundRefetch) return;
    if (!isStale) return;
    console.log("[useSmartQuery] background revalidate start", {
      key: effectiveKey,
      age: entryAge,
    });
    createFetcher<TData>(effectiveKey, (ctx) => fetchFnRef.current(ctx), {
      staleTime,
      dedupingInterval,
      retry,
      retryDelay,
      background: true,
      onSuccess: (d) => onSuccessRef.current?.(d),
      onError: (e) => onErrorRef.current?.(e as TError),
    }).catch(() => undefined);
  }, [
    enabled,
    backgroundRefetch,
    isStale,
    effectiveKey,
    staleTime,
    dedupingInterval,
    retry,
    retryDelay,
  ]);

  const revalidateInBackground = useCallback(() => {
    if (!enabled) return;
    createFetcher<TData>(effectiveKey, (ctx) => fetchFnRef.current(ctx), {
      staleTime,
      dedupingInterval,
      retry,
      retryDelay,
      background: backgroundRefetch,
      onSuccess: (d) => onSuccessRef.current?.(d),
      onError: (e) => onErrorRef.current?.(e as TError),
    }).catch(() => undefined);
  }, [
    enabled,
    effectiveKey,
    staleTime,
    dedupingInterval,
    retry,
    retryDelay,
    backgroundRefetch,
  ]);

  useRefetchOnFocus(enabled, revalidateInBackground, refetchOnWindowFocus);
  useRefetchInterval(
    enabled,
    revalidateInBackground,
    refetchInterval,
    refetchIntervalInBackground,
  );

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
      emitDevtoolsEvent({ type: "delete", key: effectiveKey });
      setVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Suspense — throws the promise if not yet resolved
  const data = use(promise);

  const refetch = useCallback(() => {
    abortEntry(effectiveKey);
    globalCache.delete(effectiveKey);
    emitDevtoolsEvent({ type: "delete", key: effectiveKey });
    setVersion((v) => v + 1);
  }, [effectiveKey]);

  const cancel = useCallback(() => {
    abortEntry(effectiveKey);
  }, [effectiveKey]);

  const mutate = useCallback(
    (updater: TData | ((prev: TData) => TData)) => {
      const entry = globalCache.get(effectiveKey) as CacheEntry<TData> | undefined;
      const prev = entry?.resolved as TData | undefined;
      const next =
        typeof updater === "function"
          ? (updater as (prev: TData) => TData)(prev as TData)
          : updater;

      const settled: CacheEntry<TData> = {
        promise: Promise.resolve(next),
        timestamp: Date.now(),
        resolved: next,
        status: "success",
      };
      globalCache.set(effectiveKey, settled);
      emitDevtoolsEvent({ type: "set", key: effectiveKey, entry: settled });
      setRerenderTick((v) => v + 1);
    },
    [effectiveKey],
  );

  const isFetching = Boolean(entry?.isFetching || entry?.status === "pending");

  return { data, refetch, mutate, cancel, isFetching };
}

/**
 * useSmartQueryState — non-Suspense API with loading/error states.
 */
export function useSmartQueryState<TData, TError = Error>(
  key: QueryKey,
  fetchFn: FetchFn<TData>,
  options: QueryOptions<TData, TError> = {},
): QueryStateResult<TData, TError> {
  const {
    staleTime = Infinity,
    deps = [],
    enabled = true,
    dedupingInterval = 2_000,
    retry = 0,
    retryDelay,
    refetchOnWindowFocus = false,
    refetchInterval,
    refetchIntervalInBackground = false,
    backgroundRefetch = true,
    onSuccess,
    onError,
  } = options;

  const [version, setVersion] = useState(0);
  const serializedKey = serializeKey(key);
  const effectiveKey = `${serializedKey}::v${version}`;

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const fetchFnRef = useRef(fetchFn);
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const buildState = useCallback(() => {
    const entry = globalCache.get(effectiveKey) as CacheEntry<TData> | undefined;
    return getQueryState<TData, TError>(entry, enabled);
  }, [effectiveKey, enabled]);

  const [state, setState] = useState<QueryStateResult<TData, TError>>(buildState);

  useEffect(() => {
    const unsubscribe = smartQueryDevtools.subscribe((event) => {
      if (event.key === effectiveKey || event.type === "clear") {
        setState(buildState());
      }
    });
    return unsubscribe;
  }, [effectiveKey, buildState]);

  useEffect(() => {
    if (!enabled) {
      setState(buildState());
      return;
    }
    createFetcher<TData>(effectiveKey, (ctx) => fetchFnRef.current(ctx), {
      staleTime,
      dedupingInterval,
      retry,
      retryDelay,
      onSuccess: (d) => onSuccessRef.current?.(d),
      onError: (e) => onErrorRef.current?.(e as TError),
    }).catch(() => undefined);
    setState(buildState());
  }, [
    enabled,
    effectiveKey,
    staleTime,
    dedupingInterval,
    retry,
    retryDelay,
    buildState,
  ]);

  const revalidateInBackground = useCallback(() => {
    if (!enabled) return;
    createFetcher<TData>(effectiveKey, (ctx) => fetchFnRef.current(ctx), {
      staleTime,
      dedupingInterval,
      retry,
      retryDelay,
      background: backgroundRefetch,
      onSuccess: (d) => onSuccessRef.current?.(d),
      onError: (e) => onErrorRef.current?.(e as TError),
    }).catch(() => undefined);
  }, [
    enabled,
    effectiveKey,
    staleTime,
    dedupingInterval,
    retry,
    retryDelay,
    backgroundRefetch,
  ]);

  useRefetchOnFocus(enabled, revalidateInBackground, refetchOnWindowFocus);
  useRefetchInterval(
    enabled,
    revalidateInBackground,
    refetchInterval,
    refetchIntervalInBackground,
  );

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
      emitDevtoolsEvent({ type: "delete", key: effectiveKey });
      setVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = useCallback(() => {
    abortEntry(effectiveKey);
    globalCache.delete(effectiveKey);
    emitDevtoolsEvent({ type: "delete", key: effectiveKey });
    setVersion((v) => v + 1);
  }, [effectiveKey]);

  const cancel = useCallback(() => {
    abortEntry(effectiveKey);
  }, [effectiveKey]);

  const mutate = useCallback(
    (updater: TData | ((prev: TData) => TData)) => {
      const entry = globalCache.get(effectiveKey) as CacheEntry<TData> | undefined;
      const prev = entry?.resolved as TData | undefined;
      const next =
        typeof updater === "function"
          ? (updater as (prev: TData) => TData)(prev as TData)
          : updater;

      setResolvedCacheEntry(effectiveKey, next);
    },
    [effectiveKey],
  );

  return {
    ...state,
    refetch,
    cancel,
    mutate,
  };
}
export interface MutationOptions<TData, TError = Error, TVariables = void, TContext = unknown> {
  mutationFn: (variables: TVariables, context: FetchContext) => Promise<TData>;
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void;
  onError?: (error: TError, variables: TVariables, context: TContext) => void;
  onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: TContext) => void;
  retry?: RetryDecision;
  retryDelay?: RetryDelay;
}

export interface MutationResult<TData, TError = Error, TVariables = void> {
  data?: TData;
  error?: TError;
  status: "idle" | "pending" | "success" | "error";
  isPending: boolean;
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
  cancel: () => void;
}

export function useSmartMutation<TData, TError = Error, TVariables = void, TContext = unknown>(
  options: MutationOptions<TData, TError, TVariables, TContext>,
): MutationResult<TData, TError, TVariables> {
  const {
    mutationFn,
    onMutate,
    onSuccess,
    onError,
    onSettled,
    retry = 0,
    retryDelay,
  } = options;

  const [data, setData] = useState<TData | undefined>(undefined);
  const [error, setError] = useState<TError | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  const abortRef = useRef<AbortController | null>(null);
  const runMutation = useCallback(
    async (variables: TVariables) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("pending");
      setError(undefined);

      let context = undefined as TContext | undefined;
      if (onMutate) {
        context = await onMutate(variables);
      }

      const attempt = async (attemptCount: number): Promise<TData> => {
        try {
          return await mutationFn(variables, { signal: controller.signal });
        } catch (err) {
          if (controller.signal.aborted) throw err;
          const failureCount = attemptCount + 1;
          if (shouldRetry(retry, failureCount, err)) {
            const delay = getRetryDelay(retryDelay, failureCount, err);
            await sleep(delay);
            return attempt(failureCount);
          }
          throw err;
        }
      };

      try {
        const result = await attempt(0);
        setData(result);
        setStatus("success");
        onSuccess?.(result, variables, context as TContext);
        onSettled?.(result, null, variables, context as TContext);
        return result;
      } catch (err) {
        setError(err as TError);
        setStatus("error");
        onError?.(err as TError, variables, context as TContext);
        onSettled?.(undefined, err as TError, variables, context as TContext);
        throw err;
      }
    },
    [mutationFn, onMutate, onSuccess, onError, onSettled, retry, retryDelay],
  );

  const mutate = useCallback(
    (variables: TVariables) => {
      runMutation(variables).catch(() => undefined);
    },
    [runMutation],
  );

  const mutateAsync = useCallback(
    (variables: TVariables) => runMutation(variables),
    [runMutation],
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setStatus("idle");
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    data,
    error,
    status,
    isPending: status === "pending",
    mutate,
    mutateAsync,
    reset,
    cancel,
  };
}

export interface InfiniteQueryOptions<TData, TError = Error, TPageParam = unknown>
  extends Omit<QueryOptions<TData, TError>, "onSuccess" | "onError"> {
  initialPageParam: TPageParam;
  getNextPageParam: (lastPage: TData, allPages: TData[]) => TPageParam | undefined;
}

export interface InfiniteData<TData, TPageParam = unknown> {
  pages: TData[];
  pageParams: TPageParam[];
}

export interface InfiniteQueryResult<TData, TError = Error, TPageParam = unknown> {
  data?: InfiniteData<TData, TPageParam>;
  error?: TError;
  status: QueryStatus;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<void>;
  refetch: () => void;
  reset: () => void;
  cancel: () => void;
}

export type InfiniteQueryFn<TData, TPageParam> = (
  context: FetchContext & { pageParam: TPageParam },
) => Promise<TData>;

export function useSmartInfiniteQuery<TData, TError = Error, TPageParam = unknown>(
  key: QueryKey,
  queryFn: InfiniteQueryFn<TData, TPageParam>,
  options: InfiniteQueryOptions<TData, TError, TPageParam>,
): InfiniteQueryResult<TData, TError, TPageParam> {
  const {
    staleTime = Infinity,
    enabled = true,
    dedupingInterval = 2_000,
    retry = 0,
    retryDelay,
    refetchOnWindowFocus = false,
    refetchInterval,
    refetchIntervalInBackground = false,
    backgroundRefetch = true,
    initialPageParam,
    getNextPageParam,
  } = options;

  const [version, setVersion] = useState(0);
  const serializedKey = serializeKey(key);
  const effectiveKey = `${serializedKey}::v${version}`;

  const queryFnRef = useRef(queryFn);
  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  const initialData = useMemo(() => {
    const cached = globalCache.get(effectiveKey) as CacheEntry<
      InfiniteData<TData, TPageParam>
    > | undefined;
    return cached?.resolved;
  }, [effectiveKey]);

  const [data, setData] = useState<InfiniteData<TData, TPageParam> | undefined>(
    initialData,
  );
  const [error, setError] = useState<TError | undefined>(undefined);
  const [status, setStatus] = useState<QueryStatus>(enabled ? "loading" : "idle");
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const currentPageKeyRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (pageParam: TPageParam, append: boolean) => {
      const pageKey = `${effectiveKey}::page::${serializeParam(pageParam)}`;
      currentPageKeyRef.current = pageKey;
      setIsFetching(true);
      if (append) setIsFetchingNextPage(true);

      try {
        const page = await createFetcher<TData>(
          pageKey,
          (ctx) => queryFnRef.current({ ...(ctx as FetchContext), pageParam }),
          {
            staleTime,
            dedupingInterval,
            retry,
            retryDelay,
          },
        );

        setData((prev) => {
          const prevPages = prev?.pages ?? [];
          const prevParams = prev?.pageParams ?? [];
          const nextPages = append ? [...prevPages, page] : [page];
          const nextParams = append ? [...prevParams, pageParam] : [pageParam];
          const nextData = { pages: nextPages, pageParams: nextParams };
          setResolvedCacheEntry(effectiveKey, nextData);
          return nextData;
        });

        setStatus("success");
        setError(undefined);
      } catch (err) {
        setError(err as TError);
        setStatus("error");
      } finally {
        setIsFetching(false);
        setIsFetchingNextPage(false);
      }
    },
    [
      dedupingInterval,
      effectiveKey,
      retry,
      retryDelay,
      staleTime,
    ],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    if (data?.pages?.length) return;
    fetchPage(initialPageParam, false).catch(() => undefined);
  }, [enabled, fetchPage, initialPageParam, data?.pages?.length]);

  const revalidateInBackground = useCallback(() => {
    if (!enabled || !data?.pageParams?.length) return;
    if (!backgroundRefetch) return;
    const pageParams = data.pageParams;
    pageParams.forEach((pageParam, index) => {
      const pageKey = `${effectiveKey}::page::${serializeParam(pageParam)}`;
      createFetcher<TData>(
        pageKey,
        (ctx) => queryFnRef.current({ ...(ctx as FetchContext), pageParam }),
        {
          staleTime,
          dedupingInterval,
          retry,
          retryDelay,
          background: true,
        },
      )
        .then((page) => {
          setData((prev) => {
            if (!prev) return prev;
            const nextPages = [...prev.pages];
            nextPages[index] = page;
            const nextData = { pages: nextPages, pageParams: [...prev.pageParams] };
            setResolvedCacheEntry(effectiveKey, nextData);
            return nextData;
          });
        })
        .catch(() => undefined);
    });
  }, [
    backgroundRefetch,
    data?.pageParams,
    dedupingInterval,
    effectiveKey,
    enabled,
    retry,
    retryDelay,
    staleTime,
  ]);

  useRefetchOnFocus(enabled, revalidateInBackground, refetchOnWindowFocus);
  useRefetchInterval(
    enabled,
    revalidateInBackground,
    refetchInterval,
    refetchIntervalInBackground,
  );

  const fetchNextPage = useCallback(async () => {
    if (!data?.pages?.length) return;
    const lastPage = data.pages[data.pages.length - 1];
    const nextParam = getNextPageParam(lastPage, data.pages);
    if (nextParam === undefined) return;
    await fetchPage(nextParam, true);
  }, [data, fetchPage, getNextPageParam]);

  const refetch = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setStatus(enabled ? "loading" : "idle");
    setVersion((v) => v + 1);
    fetchPage(initialPageParam, false).catch(() => undefined);
  }, [enabled, fetchPage, initialPageParam]);

  const reset = useCallback(() => {
    setData(undefined);
    setError(undefined);
    setStatus("idle");
    setVersion((v) => v + 1);
  }, []);

  const cancel = useCallback(() => {
    if (currentPageKeyRef.current) {
      abortEntry(currentPageKeyRef.current);
    }
  }, []);

  const hasNextPage = Boolean(
    data?.pages?.length &&
      getNextPageParam(data.pages[data.pages.length - 1], data.pages) !== undefined,
  );

  return {
    data,
    error,
    status,
    isLoading: status === "loading",
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    reset,
    cancel,
  };
}
