import test from "node:test";
import assert from "node:assert/strict";
import { battleshipEngine } from "./battleship.mjs";

const players = [
  { user_id: "player-one", response: "accepted", player_order: 0 },
  { user_id: "player-two", response: "accepted", player_order: 1 },
];
const fleetOne = [[0,1,2,3,4],[10,11,12,13],[20,21,22],[30,31,32],[40,41]];
const fleetTwo = [[50,51,52,53,54],[60,61,62,63],[70,71,72],[80,81,82],[90,91]];
function act(action, actorId, state, privateState=null, currentTurnUserId=null) {
  return battleshipEngine.applyAction({state,privateState,action,actorId,players,currentTurnUserId});
}
test("initializes a private two-player placement phase", () => {
  const result=act({type:"initialize"},"player-one",{});
  assert.equal(result.nextState.stage,"placement");
  assert.deepEqual(result.nextState.readyPlayerIds,[]);
  assert.equal("fleets" in result.nextState,false);
  assert.deepEqual(result.nextPrivateState.fleets,{});
  assert.equal(result.nextTurnUserId,null);
});
test("rejects overlapping and non-straight fleets", () => {
  const init=act({type:"initialize"},"player-one",{});
  assert.throws(()=>act({type:"place_fleet",fleet:[[0,1,2,3,4],[4,5,6,7],[20,21,22],[30,31,32],[40,41]]},"player-one",init.nextState,init.nextPrivateState),/overlap/i);
  assert.throws(()=>act({type:"place_fleet",fleet:[[0,1,12,13,14],[20,21,22,23],[30,31,32],[40,41,42],[50,51]]},"player-one",init.nextState,init.nextPrivateState),/straight/i);
});
test("both players deploy before the first turn is assigned", () => {
  const init=act({type:"initialize"},"player-one",{});
  const first=act({type:"place_fleet",fleet:fleetOne},"player-one",init.nextState,init.nextPrivateState);
  assert.equal(first.nextState.stage,"placement");
  assert.equal(first.nextTurnUserId,null);
  const second=act({type:"place_fleet",fleet:fleetTwo},"player-two",first.nextState,first.nextPrivateState);
  assert.equal(second.nextState.stage,"battle");
  assert.equal(second.nextTurnUserId,"player-one");
});
test("records hit and miss outcomes without exposing the opponent fleet publicly", () => {
  const init=act({type:"initialize"},"player-one",{});
  const first=act({type:"place_fleet",fleet:fleetOne},"player-one",init.nextState,init.nextPrivateState);
  const second=act({type:"place_fleet",fleet:fleetTwo},"player-two",first.nextState,first.nextPrivateState);
  const hit=act({type:"fire",cell:50},"player-one",second.nextState,second.nextPrivateState,"player-one");
  assert.equal(hit.nextState.shotsByPlayer["player-one"][0].outcome,"hit");
  assert.equal("fleets" in hit.nextState,false);
  assert.equal(hit.nextPrivateState.fleets["player-two"].length,5);
  const miss=act({type:"fire",cell:99},"player-two",hit.nextState,hit.nextPrivateState,"player-two");
  assert.equal(miss.nextState.shotsByPlayer["player-two"][0].outcome,"miss");
});
test("rejects repeat shots", () => {
  const init=act({type:"initialize"},"player-one",{});
  const first=act({type:"place_fleet",fleet:fleetOne},"player-one",init.nextState,init.nextPrivateState);
  const second=act({type:"place_fleet",fleet:fleetTwo},"player-two",first.nextState,first.nextPrivateState);
  const shot=act({type:"fire",cell:50},"player-one",second.nextState,second.nextPrivateState,"player-one");
  const reply=act({type:"fire",cell:51},"player-two",shot.nextState,shot.nextPrivateState,"player-two");
  assert.throws(()=>act({type:"fire",cell:50},"player-one",reply.nextState,reply.nextPrivateState,"player-one"),/already chosen/i);
});
