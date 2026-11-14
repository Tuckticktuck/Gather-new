# Multiplayer Match Lifecycle Contract

Status: Phase 0 engineering contract (design baseline; not yet wired into existing RPCs)
Scope: Snake Arena, Draw & Guess, Word Hunt, and compatibility boundaries for existing Gather multiplayer games.

## Current production baseline (verified against live Supabase)

- `gather_multiplayer_games` is the shared match record: `id`, optional `conversation_id`, `game_type`, `status`, `created_by`, `join_mode`, `settings`, `state`, `revision`, timestamps.
- `gather_multiplayer_players` is the shared roster: `game_id`, `user_id`, `status`, `color`, `x`, `y`, `is_it`, `joined_at`, `updated_at`, `ready`.
- Lobby creation is idempotent per creator/game type while an active match exists; the private create function serializes creation with an advisory transaction lock.
- Join checks match status, invite eligibility/open-game friend eligibility, block state, and color uniqueness; it increments match revision.
- The generic `gather_multiplayer_update_state` checks authentication, joined membership, active status, expected revision, JSON object shape, and a 32 KB limit. It then accepts the supplied state as-is. This is **not** suitable for new game actions, scores, timers, outcomes, or secret information.
- RLS SELECT policies on the shared multiplayer tables call `private.is_multiplayer_game_player`. That helper currently checks roster existence, not joined status, so invited roster entries can read the match/roster rows. Do not put secret answers or per-player private state in these shared rows.
- `gather_multiplayer_games` and `gather_multiplayer_players` are in the `supabase_realtime` publication. `gather_game_chat_messages` is not in the inspected publication list.
- A trigger on `gather_multiplayer_games` deletes temporary game-chat rows when a match status changes to completed/cancelled.
- The current `status='active'` value is used for both lobby and in-progress records; game-specific state currently carries additional phase detail. Do not assume it means "actively playing".

## Canonical lifecycle for new game modules

The following is the required application contract. It does not imply that all existing RPCs already enforce it.

1. **Create** — authenticated creator becomes host and first joined participant. Settings are validated and bounded. Creation is idempotent for the same host/game type only where the product explicitly intends lobby reuse.
2. **Invite / discover** — invitations are roster entries with invited status. Open-join eligibility is checked server-side. The client never creates a second lobby merely because a refresh or double click occurs.
3. **Join** — caller identity comes from `auth.uid()`; membership and block/friend/invite policy is checked server-side. Capacity, status, and color/seat uniqueness are checked atomically.
4. **Ready** — only a joined participant may change their own ready flag. The host may start only when minimum player count and all required ready conditions pass.
5. **Start** — host-only. The server validates settings and roster, initializes canonical game state, establishes server-owned start/deadline timestamps, and increments revision.
6. **Action** — joined active players submit intent, not final state. The server validates role, phase, payload bounds, rate, expected revision/sequence, and game rules; then computes and stores the canonical result. A client may not author scores, winner, remaining time, hidden answers, positions, or full state.
7. **Observe** — spectators are read-only and must not be granted mutation RPC access. Shared Realtime rows contain only information safe for every authorized roster reader, including invitees under the current RLS helper.
8. **Reconnect** — the client reloads canonical server state and revision. Client prediction is presentation-only and is discarded/reconciled on authoritative updates.
9. **Finish** — server determines outcome and sets completed status. The existing cleanup trigger removes temporary game chat when the status transitions to completed/cancelled.
10. **Rematch** — create a clean lobby/match state with fresh revision, timers, scores, and private state. Do not carry forward stale round data or reuse completed game IDs.

## Permission matrix

| Operation | Host | Joined player | Invited player | Spectator |
|---|---:|---:|---:|---:|
| Read shared/public match state | Yes | Yes | Yes, current RLS behavior | Only if explicitly admitted |
| Join | Already joined | Already joined | If invite is valid | If game permits |
| Change own ready state | Yes | Yes | No | No |
| Change lobby settings | Yes, lobby only | No | No | No |
| Start / cancel lobby | Yes | No | No | No |
| Submit game action | If playing | If playing | No | No |
| Read private per-player state | Own only | Own only | Own only after join | No |
| Submit score / winner / timer | Never client-authored | Never client-authored | No | No |

## State and privacy boundaries

- Shared match state may contain phase, public board/arena state, public score summaries, server timestamps, and public result.
- Private player state (e.g. a drawer's secret word, hidden cards, private hand, unrevealed answer) must live behind narrowly scoped RPCs or protected tables with explicit caller checks. It must not be placed in the shared `state` JSONB while invitees can read the row.
- New game modules must not call `gather_multiplayer_update_state` to submit complete game state.
- Use per-game RPCs for action intent and server-side transitions. Each RPC locks or atomically compares the authoritative row/revision to avoid double actions and race conditions.
- Realtime is a notification/replication transport, not an authorization or simulation engine.
- High-frequency Snake movement requires a trusted server simulation design. GitHub Pages cannot host that runtime. No Netlify or Cloudflare is to be introduced.

## Legacy compatibility boundary

- `gather_games` remains the separate two-player turn-based model. Do not repurpose it for variable-player arcade games.
- `gather_game_move` currently prevents a player from declaring the opponent winner but still accepts a client-provided board state after basic shape, membership, turn, revision, and size checks. It does not replay/validate all legal moves or all win/draw conditions. This remains a separate high-priority integrity defect.
- Do not tighten the generic legacy move RPC until Chess, Checkers, Tic-Tac-Toe, and Connect Four callers and their state formats have been mapped and game-specific validators are ready. A blanket change could break legitimate moves; leaving it as-is is not a claim that it is secure.
- UNO, Ludo, and Tag must remain regression-tested against the existing shared multiplayer tables and lifecycle RPCs.

## Phase 0 acceptance gates

- [x] Live shared schema, relevant SELECT policies, multiplayer create/join/update functions, Realtime publication membership, and chat cleanup trigger inspected.
- [x] Existing turn-based state-trust weakness explicitly isolated and documented.
- [ ] Map every existing multiplayer RPC caller and lifecycle transition before changing shared RPC behavior.
- [ ] Add deterministic pure-rule test harness to CI.
- [ ] Add authenticated two-account E2E harness and test matrix; execute it before Phase 0 is marked complete.
- [ ] Decide and document a supported trusted runtime for Snake before implementing its tick loop.
- [ ] Run Supabase advisors and regression tests after any database change.

No database schema or production RPC was modified as part of this contract document.
