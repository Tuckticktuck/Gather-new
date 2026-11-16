# Gather Game Action Engine

This is the trusted server-side move pipeline for Game Foundation v2. It deliberately contains no browser-authoritative game logic.

## Request flow

1. Supabase Edge Gateway validates the caller's JWT (verify_jwt remains enabled).
2. The function independently resolves the JWT with Supabase Auth and derives the actor ID. A user ID in the JSON body is never accepted.
3. The server loads the match and participants using its private service credential.
4. It requires an active match, matching optimistic version, an accepted participant, and current membership in the originating conversation.
5. The registered server-side adapter validates the game-specific action and computes the next state.
6. The server calls the service-role-only commit_validated_game_transition RPC. Postgres locks the match, rechecks version, status, accepted-player status, current conversation membership, turn ownership, and next-turn membership, then updates the snapshot, lifecycle status, and appends the event atomically. A completed match is terminal and cannot receive further actions.

The browser never sends a trusted next-state snapshot and cannot call the commit RPC.

## Adapter contract

A registered adapter has a unique key and an applyAction({ state, action, actorId, players, currentTurnUserId }) method. It must be deterministic and side-effect free. It returns:

- nextState: a JSON object with the complete next snapshot.
- eventType: a lowercase event identifier.
- eventPayload: a JSON object describing the accepted action.
- nextTurnUserId: an accepted participant ID, or null when the game has no assigned turn.
- nextStatus: active by default, or completed when the validated ruleset ends the match. Completed matches must clear the current turn.

Adapters throw GameRuleError for an illegal move. The gateway returns 422 for rejected rules, 409 for stale versions or inactive matches, and 403 for authorization failures.

## Limits

- Request body: 16 KiB.
- Action payload: 8 KiB.
- Resulting state: 64 KiB.
- Event payload: 8 KiB.

## Current registry status

The production registry is intentionally empty. No game was selected as the first new ruleset after the previous game system was retired. Until a complete adapter and its rule tests are added, the endpoint rejects actions with 422 and is not deployed. The tests use an isolated test-only grid adapter to verify the contract; it is not a production game.

## Deployment

Keep the Edge Function's JWT verification enabled. Configure the Supabase project server secret as SUPABASE_SERVICE_ROLE_KEY; it must never be placed in frontend code or GitHub Pages assets. Deploy only after at least one production adapter has been reviewed and registered.
