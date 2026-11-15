import test from "node:test";
import assert from "node:assert/strict";
import { createMatchSync } from "../games/core/match-sync.mjs";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test("initial load and change notifications produce canonical snapshots", async () => {
  let notify;
  let loads = 0;
  const received = [];
  const sync = createMatchSync({
    subscribe: callback => { notify = callback; return () => { notify = null; }; },
    loadSnapshot: async () => ({ game: { revision: ++loads } }),
    onSnapshot: snapshot => received.push(snapshot.game.revision),
    debounceMs: 1
  });

  sync.start();
  await wait(10);
  assert.deepEqual(received, [1]);

  notify();
  await wait(10);
  assert.deepEqual(received, [1, 2]);
  sync.stop();
  assert.equal(sync.getStatus().active, false);
  assert.equal(notify, null);
});

test("bursts of realtime invalidations are coalesced", async () => {
  let notify;
  let loads = 0;
  const sync = createMatchSync({
    subscribe: callback => { notify = callback; return () => {}; },
    loadSnapshot: async () => { loads += 1; return { revision: loads }; },
    onSnapshot: () => {},
    debounceMs: 8
  });

  sync.start();
  await wait(15);
  loads = 0;
  notify();
  notify();
  notify();
  await wait(15);
  assert.equal(loads, 1);
  sync.stop();
});

test("older revisions do not replace the latest accepted snapshot", async () => {
  let revision = 5;
  const received = [];
  const sync = createMatchSync({
    subscribe: () => () => {},
    loadSnapshot: async () => ({ revision }),
    onSnapshot: snapshot => received.push(snapshot.revision),
    debounceMs: 0
  });

  sync.start();
  await wait(5);
  revision = 4;
  await sync.refresh();
  assert.deepEqual(received, [5]);
  assert.equal(sync.getStatus().revision, 5);
  sync.stop();
});

test("load failures are surfaced without crashing the coordinator", async () => {
  const errors = [];
  const sync = createMatchSync({
    subscribe: () => () => {},
    loadSnapshot: async () => { throw new Error("offline"); },
    onSnapshot: () => {},
    onError: error => errors.push(error.message),
    debounceMs: 0
  });

  sync.start();
  await wait(5);
  assert.deepEqual(errors, ["offline"]);
  sync.stop();
});

test("stop cancels pending refreshes and releases the subscription", async () => {
  let loads = 0;
  let disposed = 0;
  const sync = createMatchSync({
    subscribe: () => () => { disposed += 1; },
    loadSnapshot: async () => { loads += 1; return { revision: loads }; },
    onSnapshot: () => {},
    debounceMs: 20
  });

  sync.start();
  sync.stop();
  await wait(30);
  assert.equal(loads, 0);
  assert.equal(disposed, 1);
});
