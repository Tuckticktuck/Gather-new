import test from "node:test";
import assert from "node:assert/strict";
import { ticTacToeEngine } from "./tic-tac-toe.mjs";
const players=[
 {user_id:"player-one",response:"accepted",player_order:0},
 {user_id:"player-two",response:"accepted",player_order:1},
];
function act(action,actorId,state,currentTurnUserId=null){
 return ticTacToeEngine.applyAction({state,action,actorId,players,currentTurnUserId});
}
test("initializes a two-player board with X moving first",()=>{
 const result=act({type:"initialize"},"player-one",{});
 assert.equal(result.nextState.started,true);
 assert.equal(result.nextState.board.length,9);
 assert.equal(result.nextState.currentSymbol,"X");
 assert.equal(result.nextTurnUserId,"player-one");
});
test("alternates turns and completes a winning line",()=>{
 let state=act({type:"initialize"},"player-one",{}).nextState;
 let move=act({type:"place",cell:0},"player-one",state,"player-one");state=move.nextState;
 assert.equal(move.nextTurnUserId,"player-two");
 move=act({type:"place",cell:3},"player-two",state,"player-two");state=move.nextState;
 move=act({type:"place",cell:1},"player-one",state,"player-one");state=move.nextState;
 move=act({type:"place",cell:4},"player-two",state,"player-two");state=move.nextState;
 move=act({type:"place",cell:2},"player-one",state,"player-one");
 assert.equal(move.nextStatus,"completed");
 assert.equal(move.nextState.winnerId,"player-one");
 assert.deepEqual(move.nextState.winningCells,[0,1,2]);
 assert.equal(move.nextTurnUserId,null);
});
test("detects a draw",()=>{
 let state=act({type:"initialize"},"player-one",{}).nextState;
 for(const [actor,cell] of [["player-one",0],["player-two",1],["player-one",2],["player-two",4],["player-one",3],["player-two",5],["player-one",7],["player-two",6],["player-one",8]]){
  state=act({type:"place",cell},actor,state,actor).nextState;
 }
 assert.equal(state.result,"draw");
});
test("rejects occupied squares and invalid positions",()=>{
 const state=act({type:"initialize"},"player-one",{}).nextState;
 const first=act({type:"place",cell:4},"player-one",state,"player-one").nextState;
 assert.throws(()=>act({type:"place",cell:4},"player-two",first,"player-two"),/occupied/);
 assert.throws(()=>act({type:"place",cell:9},"player-two",first,"player-two"),/square/);
});
test("supports resignation",()=>{
 const state=act({type:"initialize"},"player-one",{}).nextState;
 const result=act({type:"resign"},"player-one",state);
 assert.equal(result.nextStatus,"completed");
 assert.equal(result.nextState.winnerId,"player-two");
});
