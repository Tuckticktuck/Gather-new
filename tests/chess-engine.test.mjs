import test from "node:test";
import assert from "node:assert/strict";
import { chessEngine } from "../supabase/functions/gather-game-action/chess.mjs";

const white="11111111-1111-4111-8111-111111111111";
const black="22222222-2222-4222-8222-222222222222";
const players=[
  {user_id:white,response:"accepted",player_order:0},
  {user_id:black,response:"accepted",player_order:1},
];
function start(){
  return chessEngine.applyAction({state:{},action:{type:"initialize"},actorId:white,players}).nextState;
}
function move(state,actorId,from,to,promotion){
  return chessEngine.applyAction({state,action:{type:"move",from,to,...(promotion?{promotion}:{})},actorId,players});
}

test("initializes a two-player Chess match with the standard board and 20 legal White moves",()=>{
  const state=start();
  assert.equal(state.started,true);
  assert.equal(state.board.length,64);
  assert.equal(state.board[60],"K");
  assert.equal(state.board[4],"k");
  assert.equal(state.legalMoves.length,20);
  assert.equal(state.whiteUserId,white);
  assert.equal(state.blackUserId,black);
});

test("plays legal alternating moves and rejects blocked or out-of-turn moves",()=>{
  const state=start();
  assert.throws(()=>move(state,white,"e2","e5"),/legal Chess move/);
  assert.throws(()=>move(state,black,"e7","e5"),/turn/);
  const first=move(state,white,"e2","e4");
  assert.equal(first.nextState.board[36],"P");
  assert.equal(first.nextTurnUserId,black);
  const second=move(first.nextState,black,"e7","e5");
  assert.equal(second.nextState.board[28],"p");
  assert.equal(second.nextTurnUserId,white);
});

test("detects checkmate and completes the match",()=>{
  let state=start();
  state=move(state,white,"f2","f3").nextState;
  state=move(state,black,"e7","e5").nextState;
  state=move(state,white,"g2","g4").nextState;
  const mate=move(state,black,"d8","h4");
  assert.equal(mate.nextStatus,"completed");
  assert.equal(mate.nextTurnUserId,null);
  assert.equal(mate.nextState.checkmate,true);
  assert.equal(mate.nextState.winnerId,black);
});

test("supports en passant captures",()=>{
  let state=start();
  state=move(state,white,"e2","e4").nextState;
  state=move(state,black,"a7","a6").nextState;
  state=move(state,white,"e4","e5").nextState;
  state=move(state,black,"d7","d5").nextState;
  const capture=move(state,white,"e5","d6");
  assert.equal(capture.nextState.board[19],"P");
  assert.equal(capture.nextState.board[27],null);
});

test("requires an explicit legal promotion choice",()=>{
  const board=Array(64).fill(null);
  board[60]="K";board[7]="k";board[8]="P";
  const state={started:true,board,turn:"w",castling:"",enPassant:null,halfmove:0,fullmove:1,moveHistory:[],whiteUserId:white,blackUserId:black};
  assert.throws(()=>move(state,white,"a7","a8"),/promotion piece/);
  const promoted=move(state,white,"a7","a8","q");
  assert.equal(promoted.nextState.board[0],"Q");
});

test("allows a player to resign and awards the match to the opponent",()=>{
  const state=start();
  const result=chessEngine.applyAction({state,action:{type:"resign"},actorId:white,players});
  assert.equal(result.nextStatus,"completed");
  assert.equal(result.nextState.winnerId,black);
  assert.equal(result.nextState.result,"resignation");
});
