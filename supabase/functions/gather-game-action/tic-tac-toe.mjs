import { GameRuleError } from "./engine.mjs";

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];
function acceptedPlayers(players) {
  return players.filter(player => player.response === "accepted")
    .sort((a,b) => a.player_order-b.player_order).map(player => player.user_id);
}
function applyTicTacToeAction({state,action,actorId,players,currentTurnUserId}) {
  if (!action || typeof action !== "object" || Array.isArray(action) || typeof action.type !== "string") {
    throw new GameRuleError("A valid Tic-Tac-Toe action is required.");
  }
  const order=acceptedPlayers(players);
  if(order.length!==2)throw new GameRuleError("Tic-Tac-Toe requires exactly two accepted players.");
  if(!order.includes(actorId))throw new GameRuleError("You are not a player in this match.");
  if(action.type==="initialize"){
    if(state?.started===true)throw new GameRuleError("Tic-Tac-Toe has already started.");
    if(order[0]!==actorId)throw new GameRuleError("The first player starts as X.");
    return {
      nextState:{schemaVersion:1,started:true,board:Array(9).fill(null),playerOrder:order,xUserId:order[0],oUserId:order[1],currentSymbol:"X",winningCells:[],winnerId:null,result:null},
      eventType:"tic_tac_toe_started",eventPayload:{playerOrder:order},nextTurnUserId:order[0],
    };
  }
  if(state?.started!==true||!Array.isArray(state.board)||state.board.length!==9||
    !Array.isArray(state.playerOrder)||state.playerOrder.length!==2){
    throw new GameRuleError("The Tic-Tac-Toe board is not initialized.");
  }
  if(action.type==="resign"){
    const winnerId=state.playerOrder.find(id=>id!==actorId);
    const nextState={...structuredClone(state),winnerId,result:"resignation",winningCells:[]};
    return {nextState,eventType:"tic_tac_toe_resigned",eventPayload:{resignedBy:actorId,winnerId},nextTurnUserId:null,nextStatus:"completed"};
  }
  if(action.type!=="place")throw new GameRuleError("Unsupported Tic-Tac-Toe action.");
  if(currentTurnUserId&&currentTurnUserId!==actorId)throw new GameRuleError("It is not your turn.");
  const cell=action.cell;
  if(!Number.isInteger(cell)||cell<0||cell>=9)throw new GameRuleError("Choose a square on the board.");
  if(state.board[cell]!==null)throw new GameRuleError("That square is already occupied.");
  const symbol=actorId===state.xUserId?"X":actorId===state.oUserId?"O":null;
  if(!symbol||symbol!==state.currentSymbol)throw new GameRuleError("It is not your turn.");
  const board=[...state.board];board[cell]=symbol;
  const line=WIN_LINES.find(cells=>cells.every(index=>board[index]===symbol))||null;
  const draw=!line&&board.every(Boolean);
  const winnerId=line?actorId:null;
  const nextState={...structuredClone(state),board,winningCells:line||[],winnerId,result:line?"win":draw?"draw":null,
    currentSymbol:line||draw?null:symbol==="X"?"O":"X"};
  const nextTurnUserId=line||draw?null:state.playerOrder.find(id=>id!==actorId);
  return {
    nextState,eventType:line?"tic_tac_toe_won":draw?"tic_tac_toe_drawn":"tic_tac_toe_move",
    eventPayload:{cell,symbol,winnerId,result:nextState.result},
    nextTurnUserId,nextStatus:line||draw?"completed":"active",
  };
}
export const ticTacToeEngine={key:"tic-tac-toe",applyAction:applyTicTacToeAction};
