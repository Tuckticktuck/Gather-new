import { GameRuleError } from "./engine.mjs";

const START_BOARD = [
  "r","n","b","q","k","b","n","r",
  "p","p","p","p","p","p","p","p",
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  "P","P","P","P","P","P","P","P",
  "R","N","B","Q","K","B","N","R",
];
const PROMOTIONS = ["q","r","b","n"];
const FILES = "abcdefgh";
const colorOf = piece => piece === null ? null : piece === piece.toUpperCase() ? "w" : "b";
const inside = (r,c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const indexOf = (r,c) => r * 8 + c;
const coords = index => [Math.floor(index / 8), index % 8];
const squareName = index => { const [r,c]=coords(index); return FILES[c]+(8-r); };
const squareIndex = value => {
  if (typeof value !== "string" || !/^[a-h][1-8]$/.test(value)) return -1;
  return (8-Number(value[1]))*8+FILES.indexOf(value[0]);
};
const opposite = color => color === "w" ? "b" : "w";
const clone = value => structuredClone(value);

function kingIndex(board,color){
  return board.findIndex(piece=>piece===(color==="w"?"K":"k"));
}
function attacked(board,target,byColor){
  const [r,c]=coords(target);
  const pawn=byColor==="w"?"P":"p";
  const pawnRow=r+(byColor==="w"?1:-1);
  for(const dc of [-1,1]) if(inside(pawnRow,c+dc)&&board[indexOf(pawnRow,c+dc)]===pawn)return true;
  const knight=byColor==="w"?"N":"n";
  for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
    if(inside(r+dr,c+dc)&&board[indexOf(r+dr,c+dc)]===knight)return true;
  }
  const king=byColor==="w"?"K":"k";
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if((dr||dc)&&inside(r+dr,c+dc)&&board[indexOf(r+dr,c+dc)]===king)return true;
  }
  const rays=[
    {dirs:[[1,0],[-1,0],[0,1],[0,-1]],pieces:["r","q"]},
    {dirs:[[1,1],[1,-1],[-1,1],[-1,-1]],pieces:["b","q"]},
  ];
  for(const ray of rays)for(const [dr,dc] of ray.dirs){
    let rr=r+dr,cc=c+dc;
    while(inside(rr,cc)){
      const piece=board[indexOf(rr,cc)];
      if(piece){
        if(colorOf(piece)===byColor&&ray.pieces.includes(piece.toLowerCase()))return true;
        break;
      }
      rr+=dr;cc+=dc;
    }
  }
  return false;
}
function rawMove(position,move){
  const next=clone(position);
  const piece=next.board[move.from];
  const captured=next.board[move.to];
  next.board[move.to]=move.promotion?(colorOf(piece)==="w"?move.promotion.toUpperCase():move.promotion):piece;
  next.board[move.from]=null;
  if(move.enPassant)next.board[move.to+(colorOf(piece)==="w"?8:-8)]=null;
  if(move.castle){
    const row=colorOf(piece)==="w"?7:0;
    const rookFrom=indexOf(row,move.castle==="king"?7:0);
    const rookTo=indexOf(row,move.castle==="king"?5:3);
    next.board[rookTo]=next.board[rookFrom];next.board[rookFrom]=null;
  }
  const rights=new Set((position.castling||"").split(""));
  if(piece==="K"){rights.delete("K");rights.delete("Q");}
  if(piece==="k"){rights.delete("k");rights.delete("q");}
  const rookRights={0:"q",7:"k",56:"Q",63:"K"};
  if(piece==="R"&&rookRights[move.from])rights.delete(rookRights[move.from]);
  if(piece==="r"&&rookRights[move.from])rights.delete(rookRights[move.from]);
  if(captured&&captured.toLowerCase()==="r"&&rookRights[move.to])rights.delete(rookRights[move.to]);
  next.castling=[..."KQkq"].filter(x=>rights.has(x)).join("");
  next.enPassant=piece.toLowerCase()==="p"&&Math.abs(move.to-move.from)===16?(move.from+move.to)/2:null;
  next.halfmove=piece.toLowerCase()==="p"||captured||move.enPassant?0:(position.halfmove||0)+1;
  if(position.turn==="b")next.fullmove=(position.fullmove||1)+1;
  next.turn=opposite(position.turn);
  next.lastMove={from:squareName(move.from),to:squareName(move.to)};
  next.moveHistory=[...(position.moveHistory||[]),{
    from:squareName(move.from),to:squareName(move.to),
    piece:piece.toLowerCase(),captured:captured?captured.toLowerCase():null,
    promotion:move.promotion||null,
  }].slice(-160);
  return next;
}
function pseudoMoves(position,color){
  const {board}=position, moves=[];
  const add=(from,to,extra={})=>{
    if(!inside(...coords(to)))return;
    const target=board[to];
    if(target&&colorOf(target)===color)return;
    if(target&&target.toLowerCase()==="k")return;
    moves.push({from,to,...extra});
  };
  for(let from=0;from<64;from++){
    const piece=board[from];if(!piece||colorOf(piece)!==color)continue;
    const [r,c]=coords(from),kind=piece.toLowerCase();
    if(kind==="p"){
      const dir=color==="w"?-1:1,start=color==="w"?6:1,last=color==="w"?0:7;
      const one=indexOf(r+dir,c);
      if(inside(r+dir,c)&&!board[one]){
        if(r+dir===last)for(const promotion of PROMOTIONS)add(from,one,{promotion});
        else add(from,one);
        const two=indexOf(r+2*dir,c);
        if(r===start&&!board[two])add(from,two);
      }
      for(const dc of [-1,1]){
        if(!inside(r+dir,c+dc))continue;
        const to=indexOf(r+dir,c+dc),target=board[to];
        if(target&&colorOf(target)!==color){
          if(r+dir===last)for(const promotion of PROMOTIONS)add(from,to,{promotion});
          else add(from,to);
        }else if(position.enPassant===to)add(from,to,{enPassant:true});
      }
    }else if(kind==="n"){
      for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        if(inside(r+dr,c+dc))add(from,indexOf(r+dr,c+dc));
    }else if(kind==="k"){
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)
        if((dr||dc)&&inside(r+dr,c+dc))add(from,indexOf(r+dr,c+dc));
      const home=color==="w"?60:4;
      const enemy=opposite(color);
      if(from===home&&!attacked(board,home,enemy)){
        const kingSide=color==="w"?"K":"k",queenSide=color==="w"?"Q":"q";
        if(position.castling?.includes(kingSide)&&!board[home+1]&&!board[home+2]&&
          board[home+3]===(color==="w"?"R":"r")&&
          !attacked(board,home+1,enemy)&&!attacked(board,home+2,enemy))
          add(from,home+2,{castle:"king"});
        if(position.castling?.includes(queenSide)&&!board[home-1]&&!board[home-2]&&!board[home-3]&&
          board[home-4]===(color==="w"?"R":"r")&&
          !attacked(board,home-1,enemy)&&!attacked(board,home-2,enemy))
          add(from,home-2,{castle:"queen"});
      }
    }else{
      const dirs=kind==="b"?[[1,1],[1,-1],[-1,1],[-1,-1]]:
        kind==="r"?[[1,0],[-1,0],[0,1],[0,-1]]:
        [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dr,dc] of dirs){
        let rr=r+dr,cc=c+dc;
        while(inside(rr,cc)){
          const to=indexOf(rr,cc);
          if(!board[to])add(from,to);
          else{if(colorOf(board[to])!==color)add(from,to);break;}
          rr+=dr;cc+=dc;
        }
      }
    }
  }
  return moves;
}
function legalMoves(position,color=position.turn){
  return pseudoMoves(position,color).filter(move=>{
    const next=rawMove(position,move);
    const king=kingIndex(next.board,color);
    return king>=0&&!attacked(next.board,king,opposite(color));
  });
}
function insufficientMaterial(board){
  const pieces=board.map((piece,index)=>piece?{piece,index}:null).filter(Boolean);
  const nonKings=pieces.filter(x=>x.piece.toLowerCase()!=="k");
  if(nonKings.length===0)return true;
  if(nonKings.length===1&&["b","n"].includes(nonKings[0].piece.toLowerCase()))return true;
  if(nonKings.every(x=>x.piece.toLowerCase()==="b")){
    const colors=new Set(nonKings.map(x=>{const [r,c]=coords(x.index);return (r+c)%2;}));
    return colors.size===1;
  }
  return false;
}
function positionStatus(position){
  const moves=legalMoves(position);
  const king=kingIndex(position.board,position.turn);
  const check=king>=0&&attacked(position.board,king,opposite(position.turn));
  if(!moves.length&&check)return {check:true,checkmate:true,stalemate:false};
  if(!moves.length)return {check:false,checkmate:false,stalemate:true};
  if(insufficientMaterial(position.board))return {check,checkmate:false,stalemate:false,draw:"insufficient_material"};
  if(position.halfmove>=100)return {check,checkmate:false,stalemate:false,draw:"50_move_rule"};
  return {check,checkmate:false,stalemate:false};
}

export const chessEngine={
  key:"chess",
  applyAction({state,action,actorId,players,currentTurnUserId}){
    if(action?.type==="initialize"){
      if(state?.started===true)throw new GameRuleError("Chess has already started.");
      const accepted=players.filter(p=>p.response==="accepted").sort((a,b)=>a.player_order-b.player_order);
      if(accepted.length!==2)throw new GameRuleError("Chess requires exactly two accepted players.");
      if(accepted[0].user_id!==actorId)throw new GameRuleError("The first player starts as White.");
      const nextState={
        started:true,board:clone(START_BOARD),turn:"w",castling:"KQkq",enPassant:null,
        halfmove:0,fullmove:1,moveHistory:[],lastMove:null,
        whiteUserId:accepted[0].user_id,blackUserId:accepted[1].user_id,
        check:false,checkmate:false,stalemate:false,
      };
      return {nextState,eventType:"chess_started",eventPayload:{whiteUserId:accepted[0].user_id,blackUserId:accepted[1].user_id},nextTurnUserId:accepted[0].user_id};
    }
    if(action?.type!=="move")throw new GameRuleError("Unsupported Chess action.");
    if(state?.started!==true||!Array.isArray(state.board)||state.board.length!==64)
      throw new GameRuleError("The Chess board is not initialized.");
    const color=actorId===state.whiteUserId?"w":actorId===state.blackUserId?"b":null;
    if(!color)throw new GameRuleError("You are not a player in this Chess match.");
    if(color!==state.turn)throw new GameRuleError("It is not your turn.");
    const from=squareIndex(action.from),to=squareIndex(action.to);
    if(from<0||to<0||from===to)throw new GameRuleError("Choose a valid source and destination square.");
    const legal=legalMoves(state,color);
    const matching=legal.filter(move=>move.from===from&&move.to===to);
    if(!matching.length)throw new GameRuleError("That is not a legal Chess move.");
    let move=matching[0];
    if(matching.some(m=>m.promotion)){
      const promotion=typeof action.promotion==="string"?action.promotion.toLowerCase():"";
      if(!PROMOTIONS.includes(promotion))throw new GameRuleError("Choose a piece for pawn promotion.");
      move=matching.find(m=>m.promotion===promotion);
    }else if(action.promotion)throw new GameRuleError("Only a promoting pawn can choose a promotion piece.");
    const nextState=rawMove(state,move);
    const status=positionStatus(nextState);
    Object.assign(nextState,status);
    const completed=!!(status.checkmate||status.stalemate||status.draw);
    const winnerId=status.checkmate?actorId:null;
    nextState.winnerId=winnerId;
    nextState.result=status.checkmate?"checkmate":status.stalemate?"stalemate":status.draw||null;
    return {
      nextState,eventType:completed?"chess_finished":"chess_move",
      eventPayload:{from:action.from,to:action.to,promotion:move.promotion||null,check:status.check,checkmate:status.checkmate,stalemate:status.stalemate,result:nextState.result},
      nextTurnUserId:completed?null:(nextState.turn==="w"?nextState.whiteUserId:nextState.blackUserId),
      nextStatus:completed?"completed":"active",
    };
  },
};

export const chessRules={legalMoves,positionStatus,squareIndex,squareName};
