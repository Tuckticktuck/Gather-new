import { GameRuleError } from "./engine.mjs";

const FLEET_SPECS = [
  { type: "carrier", label: "Carrier", length: 5 },
  { type: "battleship", label: "Battleship", length: 4 },
  { type: "cruiser", label: "Cruiser", length: 3 },
  { type: "submarine", label: "Submarine", length: 3 },
  { type: "destroyer", label: "Destroyer", length: 2 },
];
const BOARD_SIZE = 10;
const TOTAL_SHIP_CELLS = FLEET_SPECS.reduce((sum, ship) => sum + ship.length, 0);

function acceptedPlayers(players) {
  return players.filter((player) => player.response === "accepted")
    .sort((a, b) => a.player_order - b.player_order).map((player) => player.user_id);
}

function normalizeFleet(input) {
  if (!Array.isArray(input) || input.length !== FLEET_SPECS.length) {
    throw new GameRuleError("Your fleet must contain all five ships.");
  }
  const ships = input.map((rawCells) => {
    if (!Array.isArray(rawCells) || ![2, 3, 4, 5].includes(rawCells.length)) {
      throw new GameRuleError("Each ship must have a valid length.");
    }
    if (rawCells.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= 100)) {
      throw new GameRuleError("Ship positions must be inside the 10 by 10 board.");
    }
    const cells = [...rawCells].sort((a, b) => a - b);
    if (new Set(cells).size !== cells.length) {
      throw new GameRuleError("A ship cannot occupy the same square twice.");
    }
    const rows = cells.map((cell) => Math.floor(cell / BOARD_SIZE));
    const cols = cells.map((cell) => cell % BOARD_SIZE);
    const horizontal = rows.every((row) => row === rows[0]) &&
      cols.every((col, index) => index === 0 || col === cols[index - 1] + 1);
    const vertical = cols.every((col) => col === cols[0]) &&
      rows.every((row, index) => index === 0 || row === rows[index - 1] + 1);
    if (!horizontal && !vertical) {
      throw new GameRuleError("Ships must be placed in a straight horizontal or vertical line.");
    }
    return { length: cells.length, cells };
  });
  const actualLengths = ships.map((ship) => ship.length).sort((a, b) => b - a);
  const expectedLengths = FLEET_SPECS.map((ship) => ship.length);
  if (actualLengths.some((length, index) => length !== expectedLengths[index])) {
    throw new GameRuleError("Your fleet must have ships of lengths 5, 4, 3, 3, and 2.");
  }
  const occupied = new Set();
  for (const ship of ships) {
    for (const cell of ship.cells) {
      if (occupied.has(cell)) throw new GameRuleError("Ships cannot overlap.");
      occupied.add(cell);
    }
  }
  ships.sort((a, b) => b.length - a.length);
  return ships.map((ship, index) => ({
    type: FLEET_SPECS[index].type,
    label: FLEET_SPECS[index].label,
    length: ship.length,
    cells: ship.cells,
  }));
}

function opponentOf(order, actorId) {
  const opponent = order.find((userId) => userId !== actorId);
  if (!opponent) throw new GameRuleError("Your opponent could not be found.");
  return opponent;
}

function applyBattleshipAction({ state, privateState, action, actorId, players, currentTurnUserId }) {
  if (!action || typeof action !== "object" || Array.isArray(action) || typeof action.type !== "string") {
    throw new GameRuleError("A valid Battleship action is required.");
  }
  const order = acceptedPlayers(players);
  if (order.length !== 2) throw new GameRuleError("Battleship requires exactly two accepted players.");
  if (!order.includes(actorId)) throw new GameRuleError("You are not a player in this Battleship match.");

  if (action.type === "initialize") {
    if (state?.started === true) throw new GameRuleError("Battleship has already been initialized.");
    if (order[0] !== actorId) throw new GameRuleError("The first player initializes the Battleship match.");
    return {
      nextState: {
        schemaVersion: 1,
        started: true,
        stage: "placement",
        playerOrder: order,
        currentPlayerId: null,
        readyPlayerIds: [],
        shotsByPlayer: { [order[0]]: [], [order[1]]: [] },
        sunkShipsByPlayer: { [order[0]]: 0, [order[1]]: 0 },
        winnerId: null,
        result: null,
      },
      nextPrivateState: { fleets: {} },
      eventType: "battleship_started",
      eventPayload: { playerOrder: order, boardSize: BOARD_SIZE },
      nextTurnUserId: null,
    };
  }

  if (state?.started !== true || !Array.isArray(state.playerOrder) ||
      state.playerOrder.length !== 2 || !["placement", "battle"].includes(state.stage)) {
    throw new GameRuleError("The Battleship match is not ready for this action.");
  }
  const nextState = structuredClone(state);
  const nextPrivateState = privateState && typeof privateState === "object"
    ? structuredClone(privateState) : { fleets: {} };
  if (!nextPrivateState.fleets || typeof nextPrivateState.fleets !== "object" ||
      Array.isArray(nextPrivateState.fleets)) nextPrivateState.fleets = {};

  if (action.type === "place_fleet") {
    if (state.stage !== "placement") throw new GameRuleError("Fleet placement is already complete.");
    if (nextPrivateState.fleets[actorId]) throw new GameRuleError("You have already deployed your fleet.");
    nextPrivateState.fleets[actorId] = normalizeFleet(action.fleet);
    nextState.readyPlayerIds = [...new Set([...(nextState.readyPlayerIds || []), actorId])];
    let nextTurnUserId = null;
    if (nextState.readyPlayerIds.length === 2) {
      nextState.stage = "battle";
      nextState.currentPlayerId = order[0];
      nextTurnUserId = order[0];
    }
    return {
      nextState, nextPrivateState,
      eventType: "battleship_fleet_deployed",
      eventPayload: { playerId: actorId, readyCount: nextState.readyPlayerIds.length },
      nextTurnUserId,
    };
  }

  if (action.type === "resign") {
    const winnerId = opponentOf(order, actorId);
    nextState.stage = "completed";
    nextState.winnerId = winnerId;
    nextState.result = "resignation";
    return {
      nextState, nextPrivateState,
      eventType: "battleship_resigned",
      eventPayload: { resignedBy: actorId, winnerId },
      nextTurnUserId: null,
      nextStatus: "completed",
    };
  }

  if (action.type !== "fire") throw new GameRuleError("Unsupported Battleship action.");
  if (state.stage !== "battle") throw new GameRuleError("Both players must deploy their fleets before the match begins.");
  if (currentTurnUserId && currentTurnUserId !== actorId) throw new GameRuleError("It is not your turn.");
  if (state.currentPlayerId !== actorId) throw new GameRuleError("It is not your turn.");
  const cell = action.cell;
  if (!Number.isInteger(cell) || cell < 0 || cell >= 100) {
    throw new GameRuleError("Choose a square on the opponent's board.");
  }
  const targetId = opponentOf(order, actorId);
  const shots = Array.isArray(nextState.shotsByPlayer?.[actorId]) ? [...nextState.shotsByPlayer[actorId]] : [];
  if (shots.some((shot) => shot.cell === cell)) throw new GameRuleError("You have already chosen that square.");
  const targetFleet = nextPrivateState.fleets[targetId];
  if (!Array.isArray(targetFleet) || targetFleet.length !== FLEET_SPECS.length) {
    throw new GameRuleError("Your opponent's fleet is not ready yet.");
  }

  const ship = targetFleet.find((item) => item.cells.includes(cell)) || null;
  const outcome = ship ? "hit" : "miss";
  const priorHits = new Set(shots.filter((shot) => shot.outcome === "hit").map((shot) => shot.cell));
  const shipSunk = !!ship && ship.cells.every((shipCell) => shipCell === cell || priorHits.has(shipCell));
  shots.push({ cell, outcome, shipSunk, ...(shipSunk ? { shipLength: ship.length } : {}) });
  nextState.shotsByPlayer = { ...(nextState.shotsByPlayer || {}), [actorId]: shots };
  if (shipSunk) {
    nextState.sunkShipsByPlayer = {
      ...(nextState.sunkShipsByPlayer || {}),
      [actorId]: (nextState.sunkShipsByPlayer?.[actorId] || 0) + 1,
    };
  }
  const completed = shots.filter((shot) => shot.outcome === "hit").length >= TOTAL_SHIP_CELLS;
  if (completed) {
    nextState.stage = "completed";
    nextState.winnerId = actorId;
    nextState.result = "all_ships_found";
    nextState.currentPlayerId = null;
  } else {
    nextState.currentPlayerId = targetId;
  }
  return {
    nextState, nextPrivateState,
    eventType: completed ? "battleship_finished" : "battleship_shot",
    eventPayload: {
      playerId: actorId, targetId, cell, outcome, shipSunk,
      ...(shipSunk ? { shipLength: ship.length } : {}),
      completed,
    },
    nextTurnUserId: completed ? null : targetId,
    nextStatus: completed ? "completed" : "active",
  };
}

export const battleshipEngine = Object.freeze({
  key: "battleship",
  applyAction: applyBattleshipAction,
});

export const battleshipInternals = Object.freeze({ normalizeFleet, fleetSpecs: FLEET_SPECS, boardSize: BOARD_SIZE });
