const HOST_ONLY = new Set(["start", "cancel", "change-settings", "end"]);
const MUTATING = new Set(["ready", "start", "cancel", "change-settings", "action", "end"]);

/**
 * Pure authorization gate for deterministic game-rule tests and future RPC parity.
 * It is not a replacement for database authorization; production identity must
 * still come from auth.uid() and be checked inside trusted server-side code.
 */
export function authorizeMatchCommand(context) {
  const {
    actorId,
    hostId,
    memberStatus,
    matchStatus,
    action,
    expectedRevision,
    currentRevision
  } = context || {};

  if (!actorId) return { ok: false, reason: "unauthenticated" };
  if (!MUTATING.has(action)) return { ok: false, reason: "unknown-action" };
  if (memberStatus !== "joined") return { ok: false, reason: "not-joined" };
  if (matchStatus !== "active") return { ok: false, reason: "match-not-active" };
  if (HOST_ONLY.has(action) && actorId !== hostId) {
    return { ok: false, reason: "host-only" };
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
      !Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    return { ok: false, reason: "invalid-revision" };
  }
  if (expectedRevision !== currentRevision) {
    return { ok: false, reason: "stale-revision" };
  }
  return { ok: true, nextRevision: currentRevision + 1 };
}

export function isSafePublicMatchState(value, maxBytes = 32768) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maxBytes;
  } catch {
    return false;
  }
}
