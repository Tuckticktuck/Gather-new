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
  let generation = 0;
  let unsubscribe = null;
  let timer = null;
  let refreshPromise = null;
  let refreshGeneration = -1;
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
    const runGeneration = generation;

    if (refreshPromise) {
      refreshAgain = true;
      return refreshPromise;
    }

    refreshGeneration = runGeneration;
    refreshPromise = (async () => {
      do {
        refreshAgain = false;
        try {
          const next = await loadSnapshot();
          if (!active || generation !== runGeneration) break;
          const revision = readRevision(next);
          if (revision >= latestRevision) {
            const previousRevision = latestRevision;
            latestRevision = revision;
            latestSnapshot = next;
            onSnapshot(next, { revision, previousRevision });
          }
        } catch (error) {
          if (active && generation === runGeneration) onError(error);
        }
      } while (active && generation === runGeneration && refreshAgain);
      return latestSnapshot;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
      refreshGeneration = -1;
      if (active && (refreshAgain || generation !== runGeneration)) {
        refreshAgain = false;
        void refresh();
      }
    }
  }

  function scheduleRefresh(expectedGeneration = generation) {
    if (!active || expectedGeneration !== generation) return;
    cancelScheduledRefresh();
    timer = setTimeout(() => {
      timer = null;
      if (active && expectedGeneration === generation) void refresh();
    }, debounceMs);
  }

  function start() {
    if (active) return;
    active = true;
    generation += 1;
    const startGeneration = generation;
    try {
      const result = subscribe(() => scheduleRefresh(startGeneration));
      unsubscribe = typeof result === "function" ? result : null;
    } catch (error) {
      onError(error);
    }
    scheduleRefresh(startGeneration);
  }

  function stop() {
    active = false;
    generation += 1;
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
      hasSnapshot: latestSnapshot !== null,
      generation
    });
  }

  return Object.freeze({ start, stop, refresh, getStatus });
}
