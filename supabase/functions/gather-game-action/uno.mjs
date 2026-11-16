import { GameRuleError } from "./engine.mjs";

export const UNO_COLORS = Object.freeze(["red", "yellow", "green", "blue"]);
export const UNO_MAX_PLAYERS = 20;
const VALUES = Object.freeze(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function makeDeck(copies = 1) {
  const deck = [];
  for (let deckCopy = 0; deckCopy < copies; deckCopy++) {
    const prefix = `${deckCopy}:`;
    for (const color of UNO_COLORS) {
      deck.push({ id: `${prefix}${color}:0:0`, color, value: "0" });
      for (const value of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"]) {
        for (let copy = 0; copy < 2; copy++) {
          deck.push({ id: `${prefix}${color}:${value}:${copy}`, color, value });
        }
      }
    }
    for (let copy = 0; copy < 4; copy++) {
      deck.push({ id: `${prefix}wild:wild:${copy}`, color: null, value: "wild" });
      deck.push({ id: `${prefix}wild:wild4:${copy}`, color: null, value: "wild4" });
    }
  }
  return deck;
}

function randomIndex(privateState, maxExclusive) {
  let x = privateState.rngState >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  privateState.rngState = x >>> 0;
  return privateState.rngState % maxExclusive;
}

function shuffle(deck, privateState) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomIndex(privateState, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function parseSeed(seed) {
  if (typeof seed !== "string" || !/^[0-9a-f]{64}$/i.test(seed)) {
    throw new GameRuleError("The server could not initialize a secure UNO shuffle.");
  }
  const parsed = Number.parseInt(seed.slice(0, 8), 16) >>> 0;
  return parsed || 0x9e3779b9;
}

function orderedPlayers(players) {
  return players
    .filter((player) => player.response === "accepted")
    .sort((a, b) => a.player_order - b.player_order)
    .map((player) => player.user_id);
}

function nextPlayerId(order, fromId, direction, steps = 1) {
  const index = order.indexOf(fromId);
  if (index < 0) throw new GameRuleError("The current player is not in this UNO match.");
  const nextIndex = ((index + direction * steps) % order.length + order.length) % order.length;
  return order[nextIndex];
}

function isPlayable(card, publicState) {
  if (card.value === "wild" || card.value === "wild4") return true;
  return card.color === publicState.currentColor ||
    card.value === publicState.discardTop.value;
}

function updateHandCounts(publicState, privateState) {
  publicState.handCounts = Object.fromEntries(
    publicState.playerOrder.map((userId) => [userId, privateState.hands[userId].length]),
  );
}

function reshuffleIfNeeded(privateState) {
  if (privateState.drawPile.length) return;
  if (privateState.discardPile.length <= 1) {
    throw new GameRuleError("There are no cards left to draw.");
  }
  const topCard = privateState.discardPile.pop();
  privateState.drawPile = shuffle(privateState.discardPile.splice(0), privateState);
  privateState.discardPile = [topCard];
}

function drawCards(privateState, userId, count) {
  const hand = privateState.hands[userId];
  for (let i = 0; i < count; i++) {
    reshuffleIfNeeded(privateState);
    hand.push(privateState.drawPile.pop());
  }
}

function createInitialState(players, actorId, serverSeed) {
  const playerOrder = orderedPlayers(players);
  if (playerOrder.length < 2) throw new GameRuleError("UNO requires at least two accepted players.");
  if (playerOrder.length > UNO_MAX_PLAYERS) {
    throw new GameRuleError(`UNO supports a maximum of ${UNO_MAX_PLAYERS} players.`);
  }
  if (playerOrder[0] !== actorId) {
    throw new GameRuleError("Only the first player can initialize this UNO match.");
  }

  const privateState = {
    hands: Object.fromEntries(playerOrder.map((userId) => [userId, []])),
    drawPile: [],
    discardPile: [],
    drawnCardId: null,
    challengeWasIllegal: null,
    rngState: parseSeed(serverSeed),
  };
  const deckCopies = Math.max(1, Math.ceil((playerOrder.length * 7 + 1) / 108));\n  privateState.drawPile = shuffle(makeDeck(deckCopies), privateState);

  for (let card = 0; card < 7; card++) {
    for (const userId of playerOrder) {
      privateState.hands[userId].push(privateState.drawPile.pop());
    }
  }

  let openingCard = privateState.drawPile.pop();
  while (openingCard.value === "wild" || openingCard.value === "wild4" ||
      openingCard.value === "skip" || openingCard.value === "reverse" ||
      openingCard.value === "draw2") {
    privateState.drawPile.unshift(openingCard);
    openingCard = privateState.drawPile.pop();
  }
  privateState.discardPile.push(openingCard);

  const publicState = {
    schemaVersion: 1,
    started: true,
    playerOrder,
    currentPlayerId: playerOrder[0],
    handCounts: {},
    discardTop: { id: openingCard.id, color: openingCard.color, value: openingCard.value },
    currentColor: openingCard.color,
    direction: 1,
    pendingDraw: null,
    pendingUnoPlayerId: null,
    winnerId: null,
  };
  updateHandCounts(publicState, privateState);
  return { publicState, privateState };
}

function applyUnoAction({ state, privateState, action, actorId, players, serverSeed }) {
  if (!isRecord(action) || typeof action.type !== "string") {
    throw new GameRuleError("A valid UNO action is required.");
  }

  if (action.type === "initialize") {
    if (state?.started === true) throw new GameRuleError("UNO has already been initialized.");
    const initialized = createInitialState(players, actorId, serverSeed);
    return {
      nextState: initialized.publicState,
      nextPrivateState: initialized.privateState,
      eventType: "uno_started",
      eventPayload: {
        playerCount: initialized.publicState.playerOrder.length,
        firstPlayerId: initialized.publicState.currentPlayerId,
        cardsPerPlayer: 7,
      },
      nextTurnUserId: initialized.publicState.currentPlayerId,
    };
  }

  if (!isRecord(state) || state.started !== true ||
      !isRecord(privateState) || !isRecord(privateState.hands)) {
    throw new GameRuleError("UNO is not initialized yet.");
  }

  const nextState = structuredClone(state);
  const nextPrivateState = structuredClone(privateState);
  const hand = nextPrivateState.hands[actorId];
  if (!Array.isArray(hand)) throw new GameRuleError("Your UNO hand is unavailable.");
  if (nextState.currentPlayerId !== actorId) throw new GameRuleError("It is not your turn.");

  const order = nextState.playerOrder;
  const pendingDraw = nextState.pendingDraw;
  const clearPendingUno = () => { nextState.pendingUnoPlayerId = null; };
  let nextTurnUserId = actorId;
  let nextStatus = "active";
  let eventType = "";
  let eventPayload = {};

  if (action.type === "catch_uno") {
    const targetId = nextState.pendingUnoPlayerId;
    if (!targetId || targetId === actorId || nextPrivateState.hands[targetId]?.length !== 1) {
      throw new GameRuleError("There is no uncalled UNO to catch.");
    }
    drawCards(nextPrivateState, targetId, 2);
    nextState.pendingUnoPlayerId = null;
    eventType = "uno_caught";
    eventPayload = { caughtPlayerId: targetId, penaltyCards: 2 };
  } else if (pendingDraw && action.type === "challenge") {
    if (pendingDraw.kind !== "wild4" || nextPrivateState.challengeWasIllegal === null) {
      throw new GameRuleError("Only a Wild Draw Four can be challenged.");
    }
    clearPendingUno();
    if (nextPrivateState.challengeWasIllegal) {
      drawCards(nextPrivateState, pendingDraw.offenderId, 4);
      nextState.pendingDraw = null;
      nextPrivateState.challengeWasIllegal = null;
      eventType = "wild4_challenge_success";
      eventPayload = { offenderId: pendingDraw.offenderId, penaltyCards: 4, challengerWon: true };
    } else {
      drawCards(nextPrivateState, actorId, 6);
      nextState.pendingDraw = null;
      nextPrivateState.challengeWasIllegal = null;
      nextTurnUserId = nextPlayerId(order, actorId, nextState.direction);
      eventType = "wild4_challenge_failed";
      eventPayload = { challengerId: actorId, penaltyCards: 6, challengerWon: false };
    }
  } else if (pendingDraw && action.type === "draw") {
    clearPendingUno();
    const amount = pendingDraw.amount;
    drawCards(nextPrivateState, actorId, amount);
    nextState.pendingDraw = null;
    nextPrivateState.challengeWasIllegal = null;
    nextTurnUserId = nextPlayerId(order, actorId, nextState.direction);
    eventType = "penalty_drawn";
    eventPayload = { playerId: actorId, cards: amount, reason: pendingDraw.kind };
  } else if (pendingDraw) {
    throw new GameRuleError("You must draw the penalty cards or challenge the Wild Draw Four.");
  } else if (action.type === "draw") {
    clearPendingUno();
    if (nextPrivateState.drawnCardId) throw new GameRuleError("You have already drawn this turn.");
    drawCards(nextPrivateState, actorId, 1);
    const drawnCard = hand[hand.length - 1];
    nextPrivateState.drawnCardId = drawnCard.id;
    eventType = "card_drawn";
    eventPayload = { playerId: actorId, cardCount: 1 };
  } else if (action.type === "pass") {
    if (!nextPrivateState.drawnCardId) {
      throw new GameRuleError("Draw a card before passing.");
    }
    clearPendingUno();
    nextPrivateState.drawnCardId = null;
    nextTurnUserId = nextPlayerId(order, actorId, nextState.direction);
    eventType = "turn_passed";
    eventPayload = { playerId: actorId };
  } else if (action.type === "play") {
    clearPendingUno();
    if (typeof action.cardId !== "string") throw new GameRuleError("Choose a card from your hand.");
    if (action.callUno !== undefined && typeof action.callUno !== "boolean") {\n      throw new GameRuleError("callUno must be true or false.");\n    }\n    if (action.callUno === true && hand.length !== 2) {\n      throw new GameRuleError("Call UNO only when this play leaves you with one card.");\n    }\n    const cardIndex = hand.findIndex((card) => card.id === action.cardId);
    if (cardIndex < 0) throw new GameRuleError("That card is not in your hand.");
    const card = hand[cardIndex];
    if (nextPrivateState.drawnCardId && card.id !== nextPrivateState.drawnCardId) {
      throw new GameRuleError("After drawing, you may only play the card you just drew.");
    }
    if (!isPlayable(card, nextState)) {
      throw new GameRuleError("That card does not match the current color or symbol.");
    }

    let chosenColor = card.color;
    if (card.value === "wild" || card.value === "wild4") {
      if (!UNO_COLORS.includes(action.chosenColor)) {
        throw new GameRuleError("Choose a color when playing a Wild card.");
      }
      chosenColor = action.chosenColor;
    } else if (action.chosenColor !== undefined) {
      throw new GameRuleError("Only a Wild card can choose a new color.");
    }

    const wild4WasIllegal = card.value === "wild4" &&
      hand.some((heldCard, index) => index !== cardIndex && heldCard.color === nextState.currentColor);

    hand.splice(cardIndex, 1);
    nextPrivateState.drawnCardId = null;
    nextPrivateState.discardPile.push(card);
    nextState.discardTop = { id: card.id, color: card.color, value: card.value };
    nextState.currentColor = chosenColor;

    if (hand.length === 0) {
      nextState.handCounts[actorId] = 0;
      nextState.winnerId = actorId;
      nextState.pendingDraw = null;
      nextState.pendingUnoPlayerId = null;
      nextPrivateState.challengeWasIllegal = null;
      nextStatus = "completed";
      nextTurnUserId = null;
    } else {
      nextState.pendingUnoPlayerId = hand.length === 1 && action.callUno !== true ? actorId : null;
      if (action.callUno !== undefined && typeof action.callUno !== "boolean") {
        throw new GameRuleError("callUno must be true or false.");
      }

      let steps = 1;
      if (card.value === "skip") steps = 2;
      if (card.value === "reverse") {
        nextState.direction *= -1;
        if (order.length === 2) steps = 2;
      }
      if (card.value === "draw2") {
        nextState.pendingDraw = { amount: 2, kind: "draw2", offenderId: actorId };
      } else if (card.value === "wild4") {
        nextState.pendingDraw = { amount: 4, kind: "wild4", offenderId: actorId };
        nextPrivateState.challengeWasIllegal = wild4WasIllegal;
      } else {
        nextState.pendingDraw = null;
        nextPrivateState.challengeWasIllegal = null;
      }
      nextTurnUserId = nextPlayerId(order, actorId, nextState.direction, steps);
    }

    eventType = "card_played";
    eventPayload = {
      playerId: actorId,
      card: { id: card.id, color: card.color, value: card.value },
      chosenColor,
      cardsRemaining: hand.length,
      calledUno: action.callUno === true,
    };
  } else {
    throw new GameRuleError("Unsupported UNO action.");
  }

  updateHandCounts(nextState, nextPrivateState);
  nextState.currentPlayerId = nextTurnUserId;
  return {
    nextState,
    nextPrivateState,
    eventType,
    eventPayload,
    nextTurnUserId,
    nextStatus,
  };
}

export const unoEngine = Object.freeze({
  key: "uno",
  applyAction: applyUnoAction,
});

export const unoInternals = Object.freeze({
  makeDeck,
  isPlayable,
  createInitialState,
});
