import { isSafePublicMatchState } from "./match-contract.mjs";

function getRevision(snapshot) {
  const revision = snapshot?.game?.revision ?? snapshot?.match?.revision ?? snapshot?.revision;
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

/**
 * Serializes this browser's actions for each match and sends a standard
 * intent envelope. The server must still enforce authorization, idempotency,
 * game rules, and atomic revision checks.
 */
export function createActionDispatcher(options) {
  if (!options || typeof options !== "object") throw new TypeError("Action dispatcher options are required.");
  const { getSnapshot, submitAction, createRequestId, onSnapshot = () => {} } = options;
  if (typeof getSnapshot !== "function") throw new TypeError("getSnapshot must be a function.");
  if (typeof submitAction !== "function") throw new TypeError("submitAction must be a function.");
  if (typeof createRequestId !== "function") throw new TypeError("createRequestId must be a function.");

  const queues = new Map();

  function dispatch(command) {
    if (!command || typeof command !== "object") return Promise.reject(new TypeError("Action command is required."));
    const { matchId, action, payload = {} } = command;
    if (typeof matchId !== "string" || !matchId.trim()) {
      return Promise.reject(new TypeError("matchId is required."));
    }
    if (typeof action !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(action)) {
      return Promise.reject(new TypeError("action must be a valid action identifier."));
    }
    if (!isSafePublicMatchState(payload, 16384)) {
      return Promise.reject(new TypeError("Action payload must be a bounded JSON object."));
    }

    const previous = queues.get(matchId) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const current = await getSnapshot(matchId);
      const expectedRevision = getRevision(current);
      if (expectedRevision === null) throw new Error("A valid canonical match revision is required.");

      const requestId = createRequestId();
      if (typeof requestId !== "string" || !requestId.trim() || requestId.length > 128) {
        throw new Error("createRequestId must return a non-empty string of at most 128 characters.");
      }

      const result = await submitAction({
        matchId,
        action,
        payload,
        expectedRevision,
        requestId
      });

      const canonicalSnapshot = result?.snapshot || null;
      if (canonicalSnapshot) onSnapshot(canonicalSnapshot, { matchId, action, requestId });
      return result;
    });

    queues.set(matchId, task);
    return task.finally(() => {
      if (queues.get(matchId) === task) queues.delete(matchId);
    });
  }

  return Object.freeze({
    dispatch,
    hasPending(matchId) {
      return queues.has(matchId);
    }
  });
}
