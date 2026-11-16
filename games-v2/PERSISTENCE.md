# Game Foundation v2 — persistence contract

Phase 2 adds the database layer for conversation-based games. It does not restore the retired Games workspace or any legacy game implementation.

## Tables

- `game_matches`: one durable match per invitation, linked to its originating conversation and one persistent `messages` row. Stores the game key, lifecycle status, JSON state, monotonically increasing version, and current turn.
- `game_match_players`: one row per conversation member invited to the match. The creator is accepted automatically; other members begin as invited. Responses are pending, accepted, declined, or left.
- `game_match_events`: append-only ordered event history. A unique `(match_id, version)` constraint prevents two events from claiming the same match version.

## Access model

All three tables have RLS enabled. Signed-in members of the originating conversation may read the match, participant list, and event history. Clients receive SELECT only; direct client INSERT, UPDATE, and DELETE privileges are revoked. Match creation and invitation responses use narrow RPC entry points. Their private SECURITY DEFINER helpers are outside the exposed API schema, pin their search path, derive the actor from `auth.uid()`, and verify current conversation membership.

## Invitation transaction

`create_game_invitation(conversation_id, game_key)` accepts no client-supplied participant list. It checks the caller's conversation and messaging permissions, derives every current conversation member from `conversation_members`, inserts the match, inserts one marker message in that same conversation, links the message to the match, creates participant rows, and writes version 1 of the event history in one database transaction.

The message body marker is `[GATHER_GAME_V2:<match-uuid>]`. The message card renderer will be added in the UI phase; this marker is not intended as user-facing copy.

`respond_to_game_invitation(match_id, response)` locks the match row, accepts only a pending participant's accepted/declined response, updates the lifecycle when all responses arrive, increments the match version, and appends the corresponding event atomically. A match activates only when at least two members accept; otherwise it is cancelled after all invitees respond.

## Realtime and future move validation

The three persistence tables are added to `supabase_realtime`. Realtime is a delivery mechanism only; RLS remains the read boundary.

`commit_validated_game_transition(...)` is the atomic commit boundary for trusted server-side game handlers. It is executable only by `service_role`, locks the match row, checks the expected version, verifies that the actor is an accepted participant and (when a turn is assigned) the current player, verifies the next turn belongs to an accepted player, then updates the snapshot and appends the event under the next version in one transaction. It is not callable by browser clients. A trusted Edge Function must validate the game-specific rules before invoking it; this foundation deliberately does not treat client-provided JSON as proof of a legal move.
