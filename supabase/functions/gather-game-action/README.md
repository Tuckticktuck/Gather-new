# Gather Game Action Engine

This is the trusted server-side move pipeline for Game Foundation v2. It deliberately contains no browser-authoritative game logic.

## Request flow

1. Supabase Edge Gateway validates the caller's JWT (verify_jwt remains enabled).
2. The function independently resolves the JWT with Supabase Auth and derives the actor ID. A user ID in the JSON body is never accepted.
3. The server loads the match and participants using its private service credential.
4. It requires an active match, matching optimistic version, an accepted participant, and current membership in the originating conversation.
5. The registered server-side adapter validates the game-specific action and computes the next public and private state.
6. The server calls the service-role-only `commit_validated_game_transition` RPC. Postgres locks the match, rechecks version, status, accepted-player status, current conversation membership, turn ownership, and next-turn eligibility, then updates the public snapshot, optional private state, lifecycle status, and appends the event atomically.

The browser never sends a trusted next-state snapshot and cannot call the commit RPC.

## Adapter contract

A registered adapter has a unique key and an `applyAction({ state, privateState, action, actorId, players, currentTurnUserId, serverSeed })` method. It must be deterministic and side-effect free. For games with hidden information, it returns:

- `nextState`: a JSON object containing only information safe for every participant.
- `nextPrivateState`: an optional JSON object stored in a table unavailable to authenticated browser clients.
- `eventType`: a lowercase event identifier.
- `eventPayload`: a JSON object describing the accepted action without leaking private hands.
- `nextTurnUserId`: an accepted participant ID, or null when the game has no assigned turn.
- `nextStatus`: active by default, or completed when the validated ruleset ends the match.

Adapters throw `GameRuleError` for an illegal move. The gateway returns 422 for rejected rules, 409 for stale versions or inactive matches, and 403 for authorization failures. Randomized setup uses a cryptographically generated server seed; the adapter's shuffle remains deterministic for that seed.

## UNO ruleset

The first registered production game is `uno`.

- 2–20 accepted players, seven cards dealt to each player.
- Classic 108-card ruleset: four colors, number cards, Skip, Reverse, Draw Two, Wild, and Wild Draw Four. A second copy is added for larger groups when needed to deal seven cards to every player (up to 20).
- A Wild card requires a chosen color. Wild Draw Four is checked against the current color and can be challenged.
- Draw Two and Wild Draw Four penalties are resolved by the server; stacking is not enabled in this initial ruleset.
- A normal draw is one card. The player may play that drawn card or pass; if played, only that drawn card may be selected.
- Reverse acts as a skip in a two-player match.
- UNO must be called on the play that leaves one card. The next player may catch an uncalled UNO before taking their turn, causing a two-card penalty.
- The match completes when a player plays their final card.

### Hidden information

Player hands, draw pile, and challenge evidence are stored in `public.game_match_private_state`. RLS is enabled and browser roles have no table privileges. The trusted game action endpoint reads and atomically updates this private state with the public match snapshot.

The `gather-game-view` Edge Function returns the shared public snapshot plus only the authenticated player's own hand and draw information. It never returns opponents' hands or the draw pile.

## Limits

- Request body: 16 KiB.
- Action payload: 8 KiB.
- Resulting public/private state: 64 KiB each.
- Event payload: 8 KiB.

## Conversation UI

The Gather client adds a Play a game option to the conversation composer, a persistent UNO invitation message card with accept/decline actions, and a full-screen overlay that returns to the same conversation when closed. The card reflects invitation state, participants, current turn, and match completion. The overlay uses the player-scoped game-view endpoint and submits moves only through the trusted action endpoint. There is no separate Games workspace, public lobby, spectator mode, or in-game chat.

## Deployment

Keep JWT verification enabled for both Edge Functions. Configure the Supabase project server secret as `SUPABASE_SERVICE_ROLE_KEY`; it must never be placed in frontend code or GitHub Pages assets. The functions are not deployed by this PR, and the GitHub Pages deploy job is skipped for this feature branch. Deploy only after the foundation PR chain is merged and the game-view/action endpoints are reviewed.
