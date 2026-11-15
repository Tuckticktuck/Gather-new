import test from "node:test";
import assert from "node:assert/strict";
import { createActionDispatcher } from "../games/core/action-dispatcher.mjs";

test("dispatch sends an intent with canonical expected revision and request ID", async () => {
  const submitted = [];
  let current = { revision: 6 };
  const dispatcher = createActionDispatcher({
    getSnapshot: async () => current,
    createRequestId: () => "request-1",
    submitAction: async envelope => {
      submitted.push(envelope);
      current = { revision: 7 };
      return { accepted: true, snapshot: { revision: 7 } };
    }
  });

  const result = await dispatcher.dispatch({ matchId: "match-1", action: "play_tile", payload: { tileId: "t1" } });
  assert.equal(result.accepted, true);
  assert.deepEqual(submitted[0], {
    matchId: "match-1",
    action: "play_tile",
    payload: { tileId: "t1" },
    expectedRevision: 6,
    requestId: "request-1"
  });
  assert.equal(dispatcher.hasPending("match-1"), false);
});

test("actions for the same match are serialized and use the latest revision", async () => {
  let revision = 0;
  const envelopes = [];
  let releaseFirst;
  const dispatcher = createActionDispatcher({
    getSnapshot: async () => ({ revision }),
    createRequestId: (() => { let n = 0; return () => "request-" + (++n); })(),
    submitAction: async envelope => {
      envelopes.push(envelope);
      if (envelopes.length === 1) {
        await new Promise(resolve => { releaseFirst = resolve; });
        revision = 1;
      } else {
        revision = 2;
      }
      return { accepted: true, snapshot: { revision } };
    }
  });

  const first = dispatcher.dispatch({ matchId: "match-1", action: "move", payload: { from: "a1", to: "a2" } });
  const second = dispatcher.dispatch({ matchId: "match-1", action: "move", payload: { from: "b1", to: "b2" } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(envelopes.length, 1);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(envelopes.map(item => item.expectedRevision), [0, 1]);
  assert.deepEqual(envelopes.map(item => item.requestId), ["request-1", "request-2"]);
});

test("actions for different matches can proceed independently", async () => {
  const submitted = [];
  const dispatcher = createActionDispatcher({
    getSnapshot: async id => ({ revision: id === "a" ? 1 : 4 }),
    createRequestId: (() => { let n = 0; return () => String(++n); })(),
    submitAction: async envelope => { submitted.push(envelope); return { accepted: true }; }
  });

  await Promise.all([
    dispatcher.dispatch({ matchId: "a", action: "move" }),
    dispatcher.dispatch({ matchId: "b", action: "move" })
  ]);
  assert.equal(submitted.length, 2);
});

test("invalid actions, payloads, revisions, and request IDs are rejected", async () => {
  const base = {
    getSnapshot: async () => ({ revision: -1 }),
    createRequestId: () => "request",
    submitAction: async () => ({ accepted: true })
  };
  const dispatcher = createActionDispatcher(base);
  await assert.rejects(dispatcher.dispatch({ matchId: "a", action: "Bad Action" }), /action must be/);
  await assert.rejects(dispatcher.dispatch({ matchId: "a", action: "move", payload: ["bad"] }), /payload/);
  await assert.rejects(dispatcher.dispatch({ matchId: "a", action: "move" }), /canonical match revision/);

  const invalidId = createActionDispatcher({
    getSnapshot: async () => ({ revision: 0 }),
    createRequestId: () => "",
    submitAction: async () => ({ accepted: true })
  });
  await assert.rejects(invalidId.dispatch({ matchId: "a", action: "move" }), /createRequestId/);
});


test("a caller can reuse the same request ID when retrying an uncertain action", async () => {
  let revision = 0;
  const submitted = [];
  let firstAttempt = true;
  const dispatcher = createActionDispatcher({
    getSnapshot: async () => ({ revision }),
    createRequestId: () => "generated-id-should-not-be-used",
    submitAction: async envelope => {
      submitted.push(envelope);
      if (firstAttempt) {
        firstAttempt = false;
        revision = 1;
        throw new Error("connection lost after commit");
      }
      return { accepted: true, snapshot: { revision } };
    }
  });

  await assert.rejects(
    dispatcher.dispatch({ matchId: "match-1", action: "play_tile", requestId: "stable-request-id" }),
    /connection lost/
  );
  await dispatcher.dispatch({ matchId: "match-1", action: "play_tile", requestId: "stable-request-id" });

  assert.deepEqual(submitted.map(item => item.requestId), ["stable-request-id", "stable-request-id"]);
  assert.deepEqual(submitted.map(item => item.expectedRevision), [0, 1]);
});
