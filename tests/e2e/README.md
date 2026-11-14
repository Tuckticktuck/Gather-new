# Gather multiplayer E2E matrix

For the detailed Snake Arena Phase 1 sequence, use [PHASE_1_SNAKE_RELEASE.md](./PHASE_1_SNAKE_RELEASE.md).

Status: test plan only; no automated browser accounts or secrets have been provisioned.

## Why this is not yet executable in CI

GitHub Pages serves a static client and the current repository does not include dedicated test accounts, credentials, or a browser automation environment. Do not place Supabase service-role keys or real user passwords in repository files or GitHub Actions logs. The E2E runner must use two dedicated test users and narrowly scoped repository secrets, or a separately provisioned local test environment.

## Required setup

- Two dedicated authenticated Supabase test accounts (host and participant).
- A disposable test conversation/fixture accepted by the Gather invitation rules.
- Browser automation runner (Playwright) with pinned version and Chromium.
- Public Supabase URL and publishable/anon key only; never service-role key in browser tests.
- Secrets supplied at runtime, not committed:
  - `GATHER_E2E_SUPABASE_URL`
  - `GATHER_E2E_SUPABASE_ANON_KEY`
  - `GATHER_E2E_HOST_EMAIL`
  - `GATHER_E2E_HOST_PASSWORD`
  - `GATHER_E2E_PLAYER_EMAIL`
  - `GATHER_E2E_PLAYER_PASSWORD`

The test suite must refuse to run against production user accounts. Use a dedicated test project or explicitly approved disposable test data.

## Required scenarios

| Area | Host account | Second account | Expected result |
|---|---|---|---|
| Create | Creates invite-only match | Sees invite | Exactly one match record |
| Join | Watches roster | Accepts/joins invite | One joined roster row per account |
| Spectate | Admits an invited/friend observer | Watches without joining | Observer is read-only and excluded from player count/readiness |
| Ready | Sets ready | Sets ready | State reflects both ready flags |
| Start | Starts match | Observes canonical active state | Only host can start |
| Mutation | Sends valid action | Sends valid action | Server validates each accepted action |
| Authorization | Attempts action as host | Attempts host-only action | Non-host rejected |
| Revision | Sends current revision | Sends stale revision | Stale action rejected without state change |
| Reconnect | Reloads page | Reloads page | Both recover same canonical public revision |
| End | Ends match | Observes result | One canonical completed result |
| Rematch | Requests rematch | Accepts rematch | New clean match state, no stale score/timer |

## Required negative cases

- Unauthenticated action.
- Invited-but-not-joined action.
- Spectator movement, ready, host-control, tick-driving, or temporary-chat mutation.
- Non-invited user attempting to spectate an invite-only lobby.
- Non-friend attempting to spectate an open lobby.
- Spectator attempting to count toward the configured player limit.
- Non-host settings/start/cancel action.
- Stale revision and duplicate action.
- Oversized or malformed payload.
- Client-submitted score, winner, or timer value.
- Attempt to read another player's private state.
- Attempt to read hidden Draw & Guess word as a non-drawer.
- Concurrent join at capacity and duplicate create.
- Reconnect during an in-progress round.

## Release rule

Phase 1 must not be accepted until this matrix runs with two separate authenticated player accounts plus a third observer against a dedicated test environment, and the existing UNO, Ludo, Tag, Battleship, Chess, Checkers, Tic-Tac-Toe, and Connect Four games have passed their regression flows.
