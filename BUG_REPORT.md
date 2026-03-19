# BUG Report

## 1. useSmartQuery

1. StaleCard with staleTime: 0 — onSuccess fires pushEvent("miss", ...) but staleTime: 0 means every useMemo recompute (any parent re-render) treats the entry as stale and re-fetches. The fix: use staleTime: 0 correctly as a manual-refetch-only demo, not triggered by parent renders. The real issue is onSuccess should be pushEvent("hit", ...) when served from cache, and miss only on actual network. We need to separate the event logging from onSuccess and instead hook it into createFetcher — but since we can't modify the hook internals from the demo, the pragmatic fix is to not use onSuccess for miss logging in StaleCard and instead track it via refetch click.
   
2. CallbacksInner with staleTime: 0 — same problem. Every render re-fetches and spams pushEvent("miss", ...) into the log bar even when the user hasn't done anything.
   
3. The onSuccess callback is being used as a "miss" detector throughout the app — but onSuccess fires on every resolution including cache hits after a mutate. It should only be pushEvent("miss") when a real network call happened.