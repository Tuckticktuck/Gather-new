const DELTA = Object.freeze({
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0]
});

const OPPOSITE = Object.freeze({
  up: "down",
  down: "up",
  left: "right",
  right: "left"
});

function validPoint(point) {
  return point && Number.isInteger(point.x) && Number.isInteger(point.y);
}

function samePoint(a, b) {
  return a?.x === b?.x && a?.y === b?.y;
}

function directionFor(snake, requested) {
  if (!Object.prototype.hasOwnProperty.call(DELTA, requested)) return snake.direction;
  return OPPOSITE[snake.direction] === requested ? snake.direction : requested;
}

function seededRandom(seed) {
  let value = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
}

function findFreeFood(state, snakes, seed) {
  const occupied = new Set();
  for (const obstacle of state.obstacles || []) {
    if (validPoint(obstacle)) occupied.add(obstacle.x + "," + obstacle.y);
  }
  for (const snake of snakes) {
    for (const point of snake.segments || []) {
      if (validPoint(point)) occupied.add(point.x + "," + point.y);
    }
  }
  const free = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (!occupied.has(x + "," + y)) free.push({ x, y });
    }
  }
  if (!free.length) return null;
  const random = seededRandom(seed);
  return free[Math.floor(random() * free.length)];
}

function compareScores(snakes) {
  const ranked = snakes.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  if (!ranked.length) return null;
  const highest = Number(ranked[0].score || 0);
  const tied = ranked.filter(snake => Number(snake.score || 0) === highest);
  return tied.length === 1 ? tied[0].user_id : null;
}

export function advanceSnakeState(sourceState, inputs = {}, nowMs = Date.now(), seed = 1) {
  if (!sourceState || sourceState.phase !== "active") {
    return { state: sourceState, advanced: false, reason: "not-active" };
  }

  const state = structuredClone(sourceState);
  const lastTickMs = Date.parse(state.lastTickAt);
  const endsAtMs = Date.parse(state.endsAt);
  const interval = Number.isInteger(state.tickIntervalMs) ? state.tickIntervalMs : 300;

  if (!Number.isFinite(lastTickMs) || !Number.isFinite(endsAtMs) ||
      !Number.isInteger(state.width) || !Number.isInteger(state.height) ||
      state.width < 10 || state.height < 8 || interval < 100 || interval > 1000 ||
      !Array.isArray(state.snakes) || state.snakes.length < 2) {
    return { state: sourceState, advanced: false, reason: "invalid-state" };
  }

  if (nowMs < lastTickMs + interval) {
    return { state: sourceState, advanced: false, reason: "not-due" };
  }

  if (nowMs >= endsAtMs) {
    state.phase = "finished";
    state.winnerId = compareScores(state.snakes);
    state.finishReason = "time";
    state.lastTickAt = new Date(nowMs).toISOString();
    return { state, advanced: true, reason: "time" };
  }

  const alive = state.snakes.filter(snake => snake.alive);
  if (alive.length < 1) {
    state.phase = "finished";
    state.winnerId = null;
    state.finishReason = "no-players-alive";
    state.lastTickAt = new Date(nowMs).toISOString();
    return { state, advanced: true, reason: "finished" };
  }

  const food = validPoint(state.food) ? state.food : null;
  const proposals = new Map();

  for (const snake of alive) {
    const direction = directionFor(snake, inputs[snake.user_id]);
    const [dx, dy] = DELTA[direction];
    const head = snake.segments?.[0];
    if (!validPoint(head) || !Array.isArray(snake.segments) || snake.segments.length < 1) {
      continue;
    }
    const nextHead = { x: head.x + dx, y: head.y + dy };
    proposals.set(snake.user_id, {
      snake,
      direction,
      head: nextHead,
      growing: !!food && samePoint(nextHead, food),
      dead: false
    });
  }

  const proposalValues = [...proposals.values()];
  const obstacles = state.obstacles || [];

  for (const proposal of proposalValues) {
    const { snake, head, growing } = proposal;
    if (head.x < 0 || head.x >= state.width || head.y < 0 || head.y >= state.height ||
        obstacles.some(obstacle => samePoint(obstacle, head))) {
      proposal.dead = true;
      continue;
    }

    const selfBody = growing ? snake.segments : snake.segments.slice(0, -1);
    if (selfBody.some(point => samePoint(point, head))) proposal.dead = true;

    for (const other of state.snakes) {
      if (other.user_id === snake.user_id || !Array.isArray(other.segments)) continue;
      const otherProposal = proposals.get(other.user_id);
      const otherWillGrow = !!otherProposal?.growing;
      const otherBody = other.alive && otherProposal && !otherWillGrow
        ? other.segments.slice(0, -1)
        : other.segments;
      if (otherBody.some(point => samePoint(point, head))) proposal.dead = true;
    }
  }

  for (let i = 0; i < proposalValues.length; i++) {
    for (let j = i + 1; j < proposalValues.length; j++) {
      const a = proposalValues[i];
      const b = proposalValues[j];
      const aOld = a.snake.segments[0];
      const bOld = b.snake.segments[0];
      if (samePoint(a.head, b.head) || (samePoint(a.head, bOld) && samePoint(b.head, aOld))) {
        a.dead = true;
        b.dead = true;
      }
    }
  }

  const nextSnakes = state.snakes.map(snake => {
    const proposal = proposals.get(snake.user_id);
    if (!snake.alive || !proposal) return snake;
    if (proposal.dead) return { ...snake, alive: false, direction: proposal.direction };

    const segments = [proposal.head, ...snake.segments];
    if (!proposal.growing) segments.pop();
    return {
      ...snake,
      segments,
      direction: proposal.direction,
      score: Number(snake.score || 0) + (proposal.growing ? 1 : 0)
    };
  });

  const ateFood = proposalValues.some(proposal => !proposal.dead && proposal.growing);
  const nextState = {
    ...state,
    snakes: nextSnakes,
    food: ateFood ? findFreeFood(state, nextSnakes, Number(seed) + Number(state.tick || 0) + 1) : food,
    tick: Number(state.tick || 0) + 1,
    lastTickAt: new Date(nowMs).toISOString()
  };

  const remaining = nextSnakes.filter(snake => snake.alive);
  if (remaining.length <= 1) {
    nextState.phase = "finished";
    nextState.winnerId = remaining.length === 1 ? remaining[0].user_id : null;
    nextState.finishReason = remaining.length === 1 ? "last-player" : "collision-draw";
  } else if (ateFood && !nextState.food) {
    nextState.phase = "finished";
    nextState.winnerId = compareScores(nextSnakes);
    nextState.finishReason = "board-filled";
  }

  return { state: nextState, advanced: true, reason: nextState.finishReason || "tick" };
}

export function canQueueSnakeDirection(current, requested) {
  return Object.prototype.hasOwnProperty.call(DELTA, requested) &&
    Object.prototype.hasOwnProperty.call(DELTA, current) &&
    OPPOSITE[current] !== requested;
}
