function readRevision(snapshot) {
  const candidate = snapshot?.game?.revision
    ?? snapshot?.match?.revision
    ?? snapshot?.revision;
  return Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : -1;
}

/**
 * Coalesces database change notifications into canonical snapshot reads.
 * Realtime is treated as an invalidation signal, never as trusted game state.
 */
export function createMatchSync(options) {
  if (!options || typeof options !== "object") throw new TypeError("Match sync options are required.");
  const { subscribe, loadSnapshot, onSnapshot, onError = () => {}, debounceMs = 60 } = options;
  if (typeof subscribe !== "function") throw new TypeError("subscribe must be a function.");
  if (typeof loadSnapshot !== "function") throw new TypeError("loadSnapshot must be a function.");
  if (typeof onSnapshot !== "function") throw new TypeError("onSnapshot must be a function.");
  if (!Number.isFinite(debounceMs) || debounceMs < 0 || debounceMs > 5000) {
    throw new TypeError("debounceMs must be between 0 and 5000.");
  }

  let active = false;
  let unsubscribe = null;
  let timer = null;
  let refreshPromise = null;
  let refreshAgain = false;
  let latestSnapshot = null;
  let latestRevision = -1;

  function cancelScheduledRefresh() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function refresh() {
    if (!active) return latestSnapshot;
    if (refreshPromise) {
      refreshAgain = true;
      return refreshPromise;
    }

    refreshPromise = (async () => {
      do {
        refreshAgain = false;
        try {
          const next = await loadSnapshot();
          if (!active) break;
          const revision = readRevision(next);
          if (revision >= latestRevision) {
            latestRevision = revision;
            latestSnapshot = next;
            onSnapshot(next, { revision, previousRevision: revision === latestRevision ? revision : latestRevision });
          }
        } catch (error) {
          if (active) onError(error);
        }
      } while (active && refreshAgain);
      return latestSnapshot;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
      if (active && refreshAgain) void refresh();
    }
  }

  function scheduleRefresh() {
    if (!active) return;
    cancelScheduledRefresh();
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, debounceMs);
  }

  function start() {
    if (active) return;
    active = true;
    try {
      const result = subscribe(scheduleRefresh);
      unsubscribe = typeof result === "function" ? result : null;
    } catch (error) {
      onError(error);
    }
    scheduleRefresh();
  }

  function stop() {
    active = false;
    cancelScheduledRefresh();
    refreshAgain = false;
    const dispose = unsubscribe;
    unsubscribe = null;
    if (dispose) {
      try { dispose(); } catch (error) { onError(error); }
    }
  }

  function getStatus() {
    return Object.freeze({
      active,
      refreshing: refreshPromise !== null,
      revision: latestRevision,
      hasSnapshot: latestSnapshot !== null
    });
  }

  return Object.freeze({ start, stop, refresh, getStatus });
}
