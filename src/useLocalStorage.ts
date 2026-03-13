import { useCallback, useRef, useSyncExternalStore } from "react";

type Serializer<T> = (value: T) => string;
type Deserializer<T> = (value: string) => T;

interface UseLocalStorageOptions<T> {
  serializer?: Serializer<T>;
  deserializer?: Deserializer<T>;
  validate?: (value: unknown) => value is T;
  storage?: Storage; // allow sessionStorage or custom storage
}

function isBrowser() {
  return typeof window !== "undefined";
}

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: UseLocalStorageOptions<T>
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    validate,
    storage = isBrowser() ? window.localStorage : createMemoryStorage(),
  } = options || {};

  const storageRef = useRef(storage);

  const getSnapshot = useCallback((): T => {
    try {
      const raw = storageRef.current.getItem(key);
      if (!raw) return initialValue;

      const parsed = deserializer(raw);

      if (validate && !validate(parsed)) {
        return initialValue;
      }

      return parsed;
    } catch {
      return initialValue;
    }
  }, [key, initialValue, deserializer, validate]);

  const subscribe = useCallback((callback: () => void) => {
    if (!isBrowser()) return () => {};

    const handler = (event: StorageEvent) => {
      if (event.key === key) callback();
    };

    window.addEventListener("storage", handler);

    return () => window.removeEventListener("storage", handler);
  }, [key]);

  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => initialValue
  );

  const setValue = useCallback(
    (input: T | ((prev: T) => T)) => {
      try {
        const current = getSnapshot();
        const valueToStore =
          input instanceof Function ? input(current) : input;

        storageRef.current.setItem(key, serializer(valueToStore));

        // Sync same tab
        if (isBrowser()) {
          window.dispatchEvent(
            new StorageEvent("storage", { key })
          );
        }
      } catch {
        // Fail silently (quota exceeded, private mode, etc.)
      }
    },
    [key, serializer, getSnapshot]
  );

  const remove = useCallback(() => {
    try {
      storageRef.current.removeItem(key);

      if (isBrowser()) {
        window.dispatchEvent(
          new StorageEvent("storage", { key })
        );
      }
    } catch {}
  }, [key]);

  return [value, setValue, remove];
}