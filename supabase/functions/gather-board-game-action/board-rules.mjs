const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function reject(message) {
  throw new Error(message);
}

function winnerOnLine(board, lines, tokens) {
  const winners = new Set();
  for (const line of lines) {
    const token = board[line[0]];
    if (token && tokens.includes(token) && token === board[line[1]] && token === board[line[2]]) {
      winners.add(token);
    }
  }
  return winners;
}

function tttWinner(board) {
  const winners = winnerOnLine(board, TTT_LINES, ["x", "o"]);
  return winners.size === 1 ? [...winners][0] : null;
}

function applyTicTacToe(game, actorId, action) {
  const state = game.state || {};
  const board = state.board;
  if (!Array.isArray(board) || board.length !== 9 || board.some(cell => !["", "x", "o"].includes(cell))) {
    reject("This Tic-Tac-Toe board is invalid. Start a new match.");
  }
  const xCount = board.filter(cell => cell === "x").length;
  const oCount = board.filter(cell => cell === "o").length;
  if (xCount !== oCount && xCount !== oCount + 1) reject("This Tic-Tac-Toe board is inconsistent. Start a new match.");
  const expectedTurn = xCount === oCount ? "x" : "o";
  const existingWinners = winnerOnLine(board, TTT_LINES, ["x", "o"]);
  if (state.turn !== expectedTurn || existingWinners.size > 0 || (xCount + oCount === 9)) {
    reject("This Tic-Tac-Toe match is already finished or has an invalid turn.");
  }
  const isPlayerOne = actorId === game.player_one_id;
  const mark = isPlayerOne ? "x" : "o";
  if (state.turn !== mark || action?.type !== "place" || !Number.isInteger(action.index) || action.index < 0 || action.index > 8) {
    reject("That Tic-Tac-Toe move is not valid.");
  }
  if (board[action.index] !== "") reject("That square is already occupied.");

  const nextBoard = board.slice();
  nextBoard[action.index] = mark;
  const winner = tttWinner(nextBoard);
  const draw = !winner && nextBoard.every(Boolean);
  const nextTurn = mark === "x" ? "o" : "x";
  const nextTurnUserId = winner || draw ? null : (nextTurn === "x" ? game.player_one_id : game.player_two_id);
  const result = winner ? (isPlayerOne ? "player_one_won" : "player_two_won") : (draw ? "draw" : null);
  return {
    state: { board: nextBoard, turn: nextTurn, moves: xCount + oCount + 1 },
    nextTurnUserId,
    result
  };
}

function connectFourWinners(board) {
  const winners = new Set();
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const token = board[row * 7 + col];
      if (!token) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const endRow = row + dr * 3;
        const endCol = col + dc * 3;
        if (endRow < 0 || endRow >= 6 || endCol < 0 || endCol >= 7) continue;
        if ([1, 2, 3].every(step => board[(row + dr * step) * 7 + col + dc * step] === token)) {
          winners.add(token);
        }
      }
    }
  }
  return winners;
}

function applyConnectFour(game, actorId, action) {
  const state = game.state || {};
  const board = state.board;
  if (!Array.isArray(board) || board.length !== 42 || board.some(cell => !["", "R", "Y"].includes(cell))) {
    reject("This Connect Four board is invalid. Start a new match.");
  }
  for (let col = 0; col < 7; col++) {
    let emptyBelow = false;
    for (let row = 5; row >= 0; row--) {
      const cell = board[row * 7 + col];
      if (!cell) emptyBelow = true;
      else if (emptyBelow) reject("This Connect Four board has a floating disc. Start a new match.");
    }
  }
  const redCount = board.filter(cell => cell === "R").length;
  const yellowCount = board.filter(cell => cell === "Y").length;
  if (redCount !== yellowCount && redCount !== yellowCount + 1) reject("This Connect Four board is inconsistent. Start a new match.");
  const expectedTurn = redCount === yellowCount ? "red" : "yellow";
  const winners = connectFourWinners(board);
  if (state.turn !== expectedTurn || winners.size > 0 || board.every(Boolean)) {
    reject("This Connect Four match is already finished or has an invalid turn.");
  }
  const isPlayerOne = actorId === game.player_one_id;
  const color = isPlayerOne ? "red" : "yellow";
  const token = isPlayerOne ? "R" : "Y";
  if (state.turn !== color || action?.type !== "drop" || !Number.isInteger(action.column) || action.column < 0 || action.column > 6) {
    reject("That Connect Four move is not valid.");
  }
  let row = -1;
  for (let r = 5; r >= 0; r--) {
    if (!board[r * 7 + action.column]) { row = r; break; }
  }
  if (row < 0) reject("That column is full.");
  const nextBoard = board.slice();
  nextBoard[row * 7 + action.column] = token;
  const nextWinners = connectFourWinners(nextBoard);
  const won = nextWinners.has(token);
  const draw = !won && nextBoard.every(Boolean);
  const nextTurn = color === "red" ? "yellow" : "red";
  return {
    state: { board: nextBoard, turn: nextTurn, moves: redCount + yellowCount + 1 },
    nextTurnUserId: won || draw ? null : (nextTurn === "red" ? game.player_one_id : game.player_two_id),
    result: won ? (isPlayerOne ? "player_one_won" : "player_two_won") : (draw ? "draw" : null)
  };
}

function checkerSide(piece) {
  if (!piece || piece === ".") return null;
  return piece.toLowerCase() === "w" ? "white" : "black";
}

function checkerDirections(piece) {
  const side = checkerSide(piece);
  const directions = [];
  if (piece === "W" || piece === "B" || side === "white") directions.push([-1, -1], [-1, 1]);
  if (piece === "W" || piece === "B" || side === "black") directions.push([1, -1], [1, 1]);
  return directions;
}

function checkersLegalMoves(state) {
  const board = String(state.board || "").split("");
  if (board.length !== 64) return [];
  const captures = [];
  const normal = [];
  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (checkerSide(piece) !== state.turn) continue;
    if (state.forcedIndex !== null && state.forcedIndex !== undefined && Number(state.forcedIndex) !== from) continue;
    const row = Math.floor(from / 8);
    const col = from % 8;
    checkerDirections(piece).forEach(([dr, dc]) => {
      const r1 = row + dr;
      const c1 = col + dc;
      const r2 = row + dr * 2;
      const c2 = col + dc * 2;
      if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) return;
      const adjacent = r1 * 8 + c1;
      if (checkerSide(board[adjacent]) && checkerSide(board[adjacent]) !== state.turn &&
          r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && board[r2 * 8 + c2] === ".") {
        captures.push({ from, to: r2 * 8 + c2, captured: adjacent });
      } else if (board[adjacent] === ".") {
        normal.push({ from, to: adjacent, captured: null });
      }
    });
  }
  return captures.length ? captures : (state.forcedIndex !== null && state.forcedIndex !== undefined ? [] : normal);
}

function checkerCount(board, side) {
  return board.split("").filter(piece => checkerSide(piece) === side).length;
}

function applyCheckers(game, actorId, action) {
  const state = game.state || {};
  const boardText = state.board;
  if (typeof boardText !== "string" || boardText.length !== 64 || /[^.wbWB]/.test(boardText)) {
    reject("This Checkers board is invalid. Start a new match.");
  }
  for (let index = 0; index < 64; index++) {
    const piece = boardText[index];
    const row = Math.floor(index / 8);
    const col = index % 8;
    if (piece !== "." && (row + col) % 2 !== 1) reject("This Checkers board contains a piece on an invalid square.");
  }
  if (!["white", "black"].includes(state.turn)) reject("This Checkers turn is invalid.");
  const isPlayerOne = actorId === game.player_one_id;
  const side = isPlayerOne ? "white" : "black";
  if (state.turn !== side || action?.type !== "move" ||
      !Number.isInteger(action.from) || !Number.isInteger(action.to) ||
      action.from < 0 || action.from > 63 || action.to < 0 || action.to > 63) {
    reject("That Checkers move is not valid.");
  }
  if (state.forcedIndex !== null && state.forcedIndex !== undefined &&
      (!Number.isInteger(state.forcedIndex) || state.forcedIndex < 0 || state.forcedIndex > 63)) {
    reject("This Checkers multi-jump state is invalid. Start a new match.");
  }
  const pieces = boardText.split("");
  if (pieces.filter(piece => checkerSide(piece) === "white").length > 12 ||
      pieces.filter(piece => checkerSide(piece) === "black").length > 12) {
    reject("This Checkers board is invalid. Start a new match.");
  }
  const legalMoves = checkersLegalMoves(state);
  if (!legalMoves.length) reject("This Checkers position has no legal move. Start a new match.");
  const move = legalMoves.find(candidate => candidate.from === action.from && candidate.to === action.to);
  if (!move) reject("That Checkers move is not legal. Captures must be taken when available.");

  const piece = pieces[move.from];
  pieces[move.from] = ".";
  if (move.captured !== null) pieces[move.captured] = ".";
  pieces[move.to] = piece;
  const row = Math.floor(move.to / 8);
  const promoted = (piece === "w" && row === 0) || (piece === "b" && row === 7);
  if (promoted) pieces[move.to] = piece.toUpperCase();

  let nextTurn = state.turn === "white" ? "black" : "white";
  let forcedIndex = null;
  if (move.captured !== null && !promoted) {
    const continuation = checkersLegalMoves({ board: pieces.join(""), turn: state.turn, forcedIndex: move.to });
    if (continuation.length) {
      nextTurn = state.turn;
      forcedIndex = move.to;
    }
  }
  const nextBoard = pieces.join("");
  const nextState = {
    board: nextBoard,
    turn: nextTurn,
    forcedIndex,
    moves: (Number.isSafeInteger(state.moves) && state.moves >= 0 ? state.moves : 0) + 1
  };
  let result = null;
  let nextTurnUserId = nextTurn === "white" ? game.player_one_id : game.player_two_id;
  if (checkerCount(nextBoard, nextTurn) === 0 ||
      checkersLegalMoves({ board: nextBoard, turn: nextTurn, forcedIndex: null }).length === 0) {
    result = isPlayerOne ? "player_one_won" : "player_two_won";
    nextTurnUserId = null;
    nextState.forcedIndex = null;
  }
  return { state: nextState, nextTurnUserId, result };
}

export function applyBoardGameMove(game, actorId, action) {
  if (!game || !actorId || !game.player_one_id || !game.player_two_id ||
      ![game.player_one_id, game.player_two_id].includes(actorId)) {
    reject("Only the two players can make moves.");
  }
  switch (game.game_type) {
    case "tic_tac_toe":
      return applyTicTacToe(game, actorId, action);
    case "connect_four":
      return applyConnectFour(game, actorId, action);
    case "checkers":
      return applyCheckers(game, actorId, action);
    default:
      reject("That board game is not supported by this move validator.");
  }
}
