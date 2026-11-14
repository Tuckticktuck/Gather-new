# Gather application audit report

Follow-up audit date: 2026-11-14  
Repository: `Tuckticktuck/Gather-new`  
Supabase project: `xrwldphmeafiakittcof`

## Summary

A source-code and live-database audit was performed. Confirmed party-system defects, a service-worker cache mismatch, a trigger-function permission issue, a turn-based result authorization gap, and missing foreign-key indexes were corrected.

This is **not** a certification that every user flow is bug-free. Browser-based testing with separate authenticated accounts was not available, and some historical migrations cannot safely be reconstructed from the current live schema alone.

## Repairs implemented

| Area | Repair |
|---|---|
| Party voting UI | A null vote no longer appears as a vote for option zero |
| Party voting RPC | Only a joined party leader can create a vote |
| Two-player Quick Play | Only an exact two-member direct conversation is eligible |
| Multiplayer Quick Play | Returned UNO, Ludo, and Tag lobby rosters are checked against the party before opening |
| People picker | The configured selection limit is enforced and capped at 20 |
| Temporary game chat | Direct execution of the trigger-only cleanup function was revoked from API roles |
| Turn-based results | A player cannot report the opponent as the winner through the turn-based move RPC |
| Database performance | Nine application foreign-key indexes were added |
| PWA caching | Service-worker shell URLs match current index asset versions; cache version is checked by CI |
| Snake collision resolution | Simultaneous collision handling now keeps a doomed snake's tail occupied, with regression tests for both vacating and non-vacating tail cases |
| CI | All repository JavaScript is syntax-checked; Tag TypeScript is compiled; both Phase 1 Supabase Edge Functions are Deno type-checked; deterministic rules tests and static HTML/assets/CSS/cache validations run before deploy |

## Source-code checks

- All repository JavaScript files passed JavaScript syntax parsing.
- GitHub Actions compiles `tag-engine.ts` and type-checks the Snake and board-game Supabase Edge Functions.
- The deterministic test suite covers Snake Arena, Chess/Checkers/Tic-Tac-Toe/Connect Four rules, and the shared multiplayer contract.
- No duplicate HTML element IDs were found (429 IDs checked).
- Static validation checks 20 local assets, 7 CSS files, and service-worker cache alignment.
- The frontend RPC names inspected were present in the live public database function catalog.
- User-facing dynamic content in the inspected application components is inserted through text nodes/textContent; inspected `innerHTML` assignments were static UI templates.

## Supabase checks

- The party vote function now checks the leader role in SQL.
- `gather_game_chat_cleanup()` is no longer directly executable by `anon` or `authenticated`; its database trigger remains functional.
- The security advisor reports 63 public SECURITY DEFINER functions; 56 are callable by authenticated users, none by `anon`, and all 56 authenticated-callable functions use an empty search path and contain an `auth.uid()` check. These signed-in RPCs were not blanket-revoked.
- The advisor reports 11 RLS-enabled tables without policies. The private Snake input, UNO private-state, UNO rematch-offer, and age-record tables were checked and have no direct `anon`/`authenticated` SELECT or INSERT privileges.
- The Phase 1 foreign-key index warning was addressed. The performance advisor currently reports 23 unused-index notices (informational), and the health advisor reports no findings.
- Supabase Auth still reports leaked-password protection as disabled. This is a project Auth setting, not a game RPC or Phase 1 migration.

## Migration history

See [MIGRATION_RECONCILIATION.md](./MIGRATION_RECONCILIATION.md).

Current snapshot (2026-11-14):
- 154 applied database migration records.
- 117 SQL migration files in the repository.
- 111 applied migration names have a same-named repository source.
- 43 applied migration names have no matching source file in the current branch.
- Six repository migration names have no matching applied migration record.
- 34 same-name matches have different repository and database version timestamps.

No migration history was deleted or rewritten. No production data was reset. The unmatched historical migrations require trusted source recovery or a reviewed schema baseline; they must not be blindly replayed.

## Important unresolved issues

### Authenticated multiplayer and device testing

The source-level game-integrity work is in place, but the highest-value acceptance coverage remains outstanding:

- No authenticated two-player plus observer browser test has been performed.
- UNO recap, rematch, and leave-during-recap need a real two-account test.
- The full regression sweep for UNO, Ludo, Tag, Battleship, Chess, Checkers, Tic-Tac-Toe, and Connect Four has not been completed through live sessions.
- iPhone Safari, Chromebook Chrome, and desktop visual/control checks have not been performed.
- Reconnect timing, simultaneous inputs, dropped requests, background-tab behavior, and Snake tick-driver handoff still need measured results.

Do not treat deterministic unit tests or static validation as substitutes for these release gates.

### Snake runtime limitation

Snake movement, collisions, scoring, and the round deadline are calculated in the JWT-verified Edge Function and committed through server-only RPCs. The next tick is prompted by a joined player's browser, with another joined player able to take over. This is server-authoritative game state, but it is not a continuously running dedicated simulation process; latency and background-tab behavior must be measured before making production-scale claims.

### Migration reconciliation

The live project has 154 applied migration records and the repository has 117 SQL migration files. 43 applied migration names still lack same-named source files, and 6 repository migrations have no same-name applied record. Do not replay or rewrite unmatched migration history without recovering trusted source SQL or comparing a reviewed schema baseline.

### Testing limitations

- No authenticated two-account end-to-end test was performed.
- Messaging workflows, invitations, game turns, rematches, and party voting were not exercised through real browser sessions.
- iPhone, Chromebook, and desktop visual regression tests were not performed.
- Deterministic tests now cover the Snake engine and server-side move validators for Chess, Checkers, Tic-Tac-Toe, and Connect Four, but they do not replace live multi-account gameplay tests.
- The Snake and board-game Edge Functions are deployed and ACTIVE with JWT verification enabled. CI type-checks both functions; that does not exercise their live network/database behavior.

## Deployment

The current main-branch workflow performs the Phase 1 Deno Edge Function type checks, Tag TypeScript compilation, deterministic tests, JavaScript syntax checks, static validation, artifact upload, and GitHub Pages deployment. The latest successful run for the pre-hardening baseline was commit `c38daa514949a17733fa9e1fce069d81d5635093`; the release hardening that follows is tracked in the live [GitHub Actions workflow history](https://github.com/Tuckticktuck/Gather-new/actions/workflows/pages.yml).
