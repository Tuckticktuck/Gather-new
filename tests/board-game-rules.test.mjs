import test from "node:test";
import assert from "node:assert/strict";
import { applyBoardGameMove } from "../supabase/functions/gather-board-game-action/board-rules.mjs";

const p1 = "player-one";
const p2 = "player-two";
const game = (game_type, state) => ({
  game_type, state, player_one_id: p1, player_two_id: p2
});
const emptyConnectBoard = () => Array(42).fill("");

test("Tic-Tac-Toe applies one empty-square placement and alternates turns", () => {
  const result = applyBoardGameMove(game("tic_tac_toe", {
    board: Array(9).fill(""), turn: "x", moves: 0
  }), p1, { type: "place", index: 4 });
  assert.equal(result.state.board[4], "x");
  assert.equal(result.state.turn, "o");
  assert.equal(result.nextTurnUserId, p2);
  assert.equal(result.result, null);
});

test("Tic-Tac-Toe detects a win from the validated placement", () => {
  const result = applyBoardGameMove(game("tic_tac_toe", {
    board: ["x", "x", "", "o", "o", "", "", "", ""], turn: "x", moves: 4
  }), p1, { type: "place", index: 2 });
  assert.equal(result.result, "player_one_won");
  assert.equal(result.nextTurnUserId, null);
});

test("Tic-Tac-Toe rejects occupied squares and impossible turn counts", () => {
  assert.throws(() => applyBoardGameMove(game("tic_tac_toe", {
    board: ["x", "", "", "", "", "", "", "", ""], turn: "o"
  }), p2, { type: "place", index: 0 }), /already occupied/);
  assert.throws(() => applyBoardGameMove(game("tic_tac_toe", {
    board: ["x", "x", "x", "", "", "", "", "", ""], turn: "o"
  }), p2, { type: "place", index: 3 }), /inconsistent|already finished|invalid turn/);
});

test("Connect Four drops into the lowest free cell of the selected column", () => {
  const result = applyBoardGameMove(game("connect_four", {
    board: emptyConnectBoard(), turn: "red", moves: 0
  }), p1, { type: "drop", column: 2 });
  assert.equal(result.state.board[37], "R");
  assert.equal(result.state.turn, "yellow");
  assert.equal(result.nextTurnUserId, p2);
});

test("Connect Four detects a horizontal win and rejects floating discs", () => {
  const board = emptyConnectBoard();
  board[36] = "R"; board[37] = "R"; board[38] = "R";
  board[34] = "Y"; board[33] = "Y";
  const result = applyBoardGameMove(game("connect_four", {
    board, turn: "red", moves: 5
  }), p1, { type: "drop", column: 0 });
  assert.equal(result.result, "player_one_won");
  const floating = emptyConnectBoard();
  floating[0] = "R";
  assert.throws(() => applyBoardGameMove(game("connect_four", {
    board: floating, turn: "yellow", moves: 1
  }), p2, { type: "drop", column: 1 }), /floating disc/);
});

function initialCheckersBoard() {
  return Array.from({ length: 64 }, (_, i) => {
    const row = Math.floor(i / 8);
    const col = i % 8;
    if ((row + col) % 2 !== 1) return ".";
    if (row <= 2) return "b";
    if (row >= 5) return "w";
    return ".";
  }).join("");
}

test("Checkers applies a legal diagonal move and changes the turn", () => {
  const result = applyBoardGameMove(game("checkers", {
    board: initialCheckersBoard(), turn: "white", forcedIndex: null, moves: 0
  }), p1, { type: "move", from: 40, to: 33 });
  assert.equal(result.state.board[40], ".");
  assert.equal(result.state.board[33], "w");
  assert.equal(result.state.turn, "black");
  assert.equal(result.nextTurnUserId, p2);
});

test("Checkers enforces mandatory captures and supports forced multi-jumps", () => {
  const board = Array(64).fill(".");
  board[40] = "w";
  board[33] = "b";
  board[17] = "b";
  const first = applyBoardGameMove(game("checkers", {
    board: board.join(""), turn: "white", forcedIndex: null, moves: 0
  }), p1, { type: "move", from: 40, to: 26 });
  assert.equal(first.state.board[33], ".");
  assert.equal(first.state.forcedIndex, 26);
  assert.equal(first.state.turn, "white");
  assert.equal(first.nextTurnUserId, p1);
  assert.throws(() => applyBoardGameMove(game("checkers", {
    board: board.join(""), turn: "white", forcedIndex: null, moves: 0
  }), p1, { type: "move", from: 40, to: 33 }), /not legal/);
});

test("Checkers rejects out-of-turn and malformed board actions", () => {
  assert.throws(() => applyBoardGameMove(game("checkers", {
    board: initialCheckersBoard(), turn: "white", forcedIndex: null
  }), p2, { type: "move", from: 40, to: 33 }), /not valid/);
  assert.throws(() => applyBoardGameMove(game("checkers", {
    board: ".".repeat(63), turn: "white", forcedIndex: null
  }), p1, { type: "move", from: 40, to: 33 }), /invalid/);
});
