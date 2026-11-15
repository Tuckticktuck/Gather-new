// Backward-compatible exports for existing tests and game work in progress.
// New shared gameplay code should import from games/core/match-contract.mjs.
export {
  authorizeMatchCommand,
  isSafePublicMatchState
} from "../core/match-contract.mjs";
