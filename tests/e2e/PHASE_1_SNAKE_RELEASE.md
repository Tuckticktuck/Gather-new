# Phase 1 — Snake Arena authenticated release checklist

Status: prepared; NOT YET EXECUTED. Passing CI does not replace signed-in multiplayer and device checks.

## Test environment and accounts

Run this against a dedicated Supabase test project with disposable test data, not the live user project. Use three distinct accounts:

- Host: creates the lobby and controls settings, start, and end.
- Player: accepts the invitation and plays.
- Observer: an accepted friend or explicitly invited observer who tests read-only spectator access.

Use separate browser profiles or devices so sessions do not overwrite one another. Never place user passwords or service-role keys in source files, issue comments, or chat. Browser automation, when added, must use only the publishable/anon key plus dedicated test-account secrets.

Record the commit SHA, Supabase migration version, browser/device, test account role, match ID, expected outcome, actual outcome, and any error. Use fresh matches for destructive scenarios.

## 1. Lobby creation, invitation, and settings

- [ ] Host creates an invite-only lobby; confirm one match record and one host roster row.
- [ ] Double-click/retry creation and refresh the page; verify no duplicate active lobby is created.
- [ ] Invite the Player; verify notification, invite card, correct lobby identity, and no automatically created chat/conversation.
- [ ] Player declines; verify invitation disappears and lobby can proceed.
- [ ] Host cannot start while any invite remains pending.
- [ ] Player accepts, joins, and sees the same lobby state as Host.
- [ ] Host and Player toggle ready; host can start only with at least two joined players and all joined players ready.
- [ ] Non-host cannot change settings, start, cancel, or end the match.
- [ ] Test every arena, obstacle, speed, round-duration, and player-capacity option. Invalid and out-of-range values must be rejected by the server.
- [ ] Capacity cannot be lowered beneath joined/invited roster size.
- [ ] Open lobby appears only to an accepted friend of the host; unrelated/non-friend accounts cannot discover or join it.
- [ ] A player already joined/invited/spectating does not see the same lobby as another open lobby to join.

## 2. Spectator admission and restrictions

- [ ] Observer is admitted as a spectator from an invited lobby or eligible open friend lobby.
- [ ] Spectator can observe a full lobby without consuming one of the configured player slots.
- [ ] Spectator is not included in joined-player count or readiness requirement.
- [ ] Spectator sees a clear read-only state and no direction controls, host controls, tick-driving controls, or temporary game-chat composer.
- [ ] Attempt direct direction/tick, ready, settings, start/end, and game-chat actions as Observer; server must reject them.
- [ ] A non-invited account cannot spectate an invite-only lobby.
- [ ] A non-friend cannot spectate an open lobby.
- [ ] A blocked account cannot spectate.
- [ ] A user already joined as a player cannot also join as spectator.
- [ ] Before the lobby starts, a spectator can switch to Join as player only when a player seat is available; readiness is then required normally.
- [ ] After the match starts, a spectator cannot promote themselves to a player.
- [ ] Observer can leave a running or finished match; leaving as spectator does not alter winner, scores, or player roster outcome.
- [ ] Spectated matches appear in the Snake panel and live-game notification surface; opening one restores spectator mode.

## 3. Game rules and authoritative state

Run a complete match with Host and Player; repeat with additional players up to the configured limit.

- [ ] Keyboard arrow keys and WASD each move the correct snake.
- [ ] Touch direction pad works on iPhone; rapid turns do not permit an illegal immediate reverse into the body.
- [ ] Food collection grows the snake and increments only the server-calculated score.
- [ ] Wall, obstacle, self-body, head-on, and head-swap collisions resolve according to the rules engine.
- [ ] Simultaneous inputs are applied against one canonical tick; clients converge on the same public state and revision.
- [ ] Round timeout uses the server-side deadline and produces the correct highest-score winner or tie.
- [ ] Eliminated players remain observers until the round ends; they cannot continue submitting movement.
- [ ] Attempt to submit fake position, body segments, score, winner, timer, or full replacement state from a client; no client-authored outcome may be accepted.
- [ ] Send a stale revision, duplicate tick, or duplicate input; it must fail safely without duplicating score or advancing the match twice.
- [ ] Test a match with the maximum supported player count and collision handling between multiple snakes.

## 4. Lifecycle, reconnect, and failure handling

- [ ] Reload both player clients while in the lobby; each restores the canonical roster, readiness, and settings.
- [ ] Reload both clients during a live round; each restores the same canonical public state and revision.
- [ ] Put the tab in the background and return; verify Snake reloads current canonical state and resumes only for joined players.
- [ ] Disconnect and restore network connectivity; verify the client refreshes after the browser's online event and Realtime re-subscription without duplicating a tick.
- [ ] Simulate a dropped request and retry; no duplicate movement, score, finish, or lobby appears.
- [ ] Put the host tab in the background or close it; confirm another joined player can take over tick prompting and state continues or recovers cleanly.
- [ ] Host leaves the lobby before start; verify handoff to the earliest eligible joined player, or safe cancellation if no joined players remain, with no stranded lobby.
- [ ] Host leaves during a match; host handoff goes to the earliest eligible joined player and game lifecycle remains valid.
- [ ] A non-host leaves during a round; the player is eliminated/removed as specified and match does not get corrupted.
- [ ] All players leave; match finishes/cleans up without orphaned active state.
- [ ] Host ends the match; result panel is consistent for all clients.
- [ ] Temporary game chat is removed when the match is completed/cancelled; confirm it cannot be read or sent after cleanup.
- [ ] Rematch creates a fresh lobby state with reset ready flags, scores, positions, food, tick counters, and timestamps; no stale round state remains.
- [ ] Duplicate rematch/end clicks do not create duplicate matches or corrupt lifecycle state.

## 5. UNO recap regression

This is a separate regression because the reported issue was missing recap actions.

- [ ] Finish an UNO match with two signed-in players; both see a recap panel.
- [ ] Both players see the buttons labelled I am done and Request rematch; after confirming, the first button changes to You are done and cannot be submitted twice.
- [ ] One player's done confirmation updates the shared progress for the other player.
- [ ] The recap closes only when all joined players confirm done and no rematch is pending.
- [ ] A player requests a rematch; the other player receives a notification and can accept or decline.
- [ ] Decline returns the match to the completed state when all players are done; requester sees the result.
- [ ] Accept from all participants starts a fresh match with a fresh deal and reset game state.
- [ ] Ensure a rematch request cannot be duplicated or submitted by a non-player.
- [ ] Attempt direct PostgREST access to private UNO rematch-offer rows as anon/authenticated; it must be denied while the authorized rematch RPC flow continues to work.
- [ ] Test both conversation-linked and standalone UNO lobbies.

## 6. Hub, notification, party, and chat integration

- [ ] Snake invitation appears in the invite section with the right host and lobby details.
- [ ] Joined live Snake match appears under Live Games and opens the correct match.
- [ ] Spectated match appears in the Snake panel/live-game surface as an observer, not as a player.
- [ ] Party Quick Play can create/open the intended lobby without creating duplicates.
- [ ] Temporary game chat is available to joined players in the lobby/round only; it is not exposed to spectators.
- [ ] Game chat is cleaned up after match completion and does not persist as an ordinary private/group conversation.

## 7. Device and accessibility checks

iPhone Safari:
- [ ] Test portrait and landscape, including safe-area top/bottom insets.
- [ ] Fullscreen arena fills the visible viewport without page scrolling or clipping the board.
- [ ] Top-right exit control remains visible/reachable and returns to the expected game surface.
- [ ] Direction pad buttons are easy to tap and do not cover the board.
- [ ] Scoreboard, recap, roster, and spectator state fit narrow screens.

Chromebook Chrome:
- [ ] Test the normal screen size and one smaller window size.
- [ ] Arrow keys and WASD work while the game has focus; buttons remain keyboard-operable.
- [ ] Sidebar/game panel and fullscreen arena do not overflow or hide controls.
- [ ] Resize during a round; canvas redraws at the correct aspect ratio and remains crisp.

Desktop and accessibility:
- [ ] Test mouse and keyboard navigation, visible focus, accessible labels, and Escape/exit behavior.
- [ ] Respect reduced-motion preference.
- [ ] Confirm text contrast and state labels for ready, invited, eliminated, spectator, completed, and rematch pending.

## 8. Performance evidence and sign-off

Record tick interval, observed input-to-visible-update delay, missed/duplicate tick count, reconnect duration, and behavior when the active tick-prompting tab is backgrounded. Record median and 95th-percentile measurements from repeated rounds rather than relying on a single playthrough.

- [ ] No divergent public state or revision between active players after repeated simultaneous play.
- [ ] No accepted client-authored position, score, winner, or timer.
- [ ] No unauthorized spectator/player/host mutation.
- [ ] No duplicate active lobby, rematch, or completion transition.
- [ ] No unresolved console errors or Supabase errors during a clean run.
- [ ] All iPhone Safari, Chromebook Chrome, and desktop checks above pass.
- [ ] Attach concise results and any bug reproduction steps to the Phase 1 release record.

Phase 1 is not accepted until the authenticated multiplayer suite and device checks are actually run. If tick cadence visibly stalls when a tab is backgrounded or players diverge, keep Phase 1 open and revisit the tick-driving architecture before moving on.
