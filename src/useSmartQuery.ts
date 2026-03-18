import { LRUCache } from "lru-cache";
import {
  useState,
  use,
  useCallback,
  useEffect,
  useMemo,
} from "react";

type Entry<T> = {
  promise: Promise<T>;
  timestamp: number;
};

const cache = new LRUCache<string, Entry<any>>({ max: 500 });

function createFetcher<T>(
  key: string,
  fetchFn: () => Promise<T>,
  staleTime: number
): Promise<T> {
  const entry = cache.get(key);
  const now = Date.now();

  if (entry && now - entry.timestamp < staleTime) {
    return entry.promise;
  }

  const promise = fetchFn()
    .then(async (res) => {
      if (res instanceof Response) {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }
      return res;
    })
    .then((data) => {
      cache.set(key, { promise: Promise.resolve(data), timestamp: Date.now() });
      return data;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });

  cache.set(key, { promise, timestamp: now });
  return promise;
}

function invalidate(key: string) {
  cache.delete(key);
}

type Options = {
  staleTime?: number;
  // deps?: D;
};

export function useSmartQuery<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: Options = {}
) {
  const staleTime = options.staleTime ?? Infinity;
  const [version, setVersion] = useState(0);

  const effectiveKey = `${key}-${version}`;

  // ✅ promise is memoized — critical for Suspense
  const promise = useMemo(
    () => createFetcher<T>(effectiveKey, fetchFn, staleTime),
    [effectiveKey, fetchFn, staleTime]
  );

  const data = use(promise);

  // refetch on deps change
  // useEffect(() => {
  //   if (options.deps?.length) {
  //     invalidate(effectiveKey);
  //     setVersion((v) => v + 1);
  //   }
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [...(options.deps || [])]);


  const refetch = useCallback(() => {
    invalidate(effectiveKey);
    setVersion((v) => v + 1);
  }, [effectiveKey]);

  return { data, refetch };
}