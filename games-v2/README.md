# Gather Game Foundation v2

This directory is a clean replacement for the retired game engine. It intentionally contains no game-specific rules, rendering, lobby UI, or direct database access.

## Contracts

- `contracts.mjs` validates invitation, match snapshot, and append-only event shapes.
- `lifecycle.mjs` defines the universal match state machine, invitation responses, and optimistic version checks.

## Non-negotiable invariants

1. A game invitation belongs to exactly one existing conversation and one persistent message.
2. The creator is included in the invited player set; player IDs are unique.
3. Every invited participant is a member of the source conversation. The server must derive and verify this; clients cannot choose arbitrary recipients.
4. An invitation message is created once. Its rendered card is updated from the match snapshot; moves do not create new chat messages.
5. Only accepted players can act. The server validates membership, game-specific rules, turn ownership, and expected match version.
6. Every accepted action increments the match version and appends one ordered event in the same transaction.
7. A stale client receives a version conflict and refreshes; it must not silently overwrite newer state.
8. Closing the full-screen overlay only closes the view. It never cancels or deletes a match.
9. Realtime is a delivery mechanism, not an authorization boundary. Every action is validated server-side.
10. The first release is conversation-scoped. No public lobby discovery, spectators, standalone game chat, or independent game workspace is part of this foundation.

## Match lifecycle

`invited → active → completed`

An invited match may be cancelled by an authorized participant. An active match may be completed or cancelled. Completed and cancelled matches are terminal.

Participants move from `pending` to `accepted` or `declined`; removed is reserved for a later server-authorized moderation/removal flow.

## Invitation policy

The client requests an invitation with a game type and source conversation. The server loads the current conversation membership and snapshots every eligible member into the invitation. The creator is included automatically. The client cannot submit a custom recipient list.

## UI contract

The message card presents the game identity, participant avatars/names, invitation or match status, a compact game-provided preview, current turn when relevant, and an **Open Game** action. Opening uses a full-screen overlay above the existing conversation. The close control returns to the same conversation and preserves the match.

## Persistence boundary

The next phase will add the Supabase schema, RLS, and transactional RPCs. The browser must never write match state or events directly. Game modules will be pure rule adapters called by trusted server-side action handlers.

## Deliberately deferred

Game catalog and first playable game, game-specific rules, visual game board, realtime subscriptions, notification copy, rematches, spectators, public discovery, and game chat are later phases.
