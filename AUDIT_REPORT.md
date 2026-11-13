# Gather application audit report

Audit date: 2026-11-13  
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
| PWA caching | Service-worker shell URLs now match current index asset versions; cache version advanced to v73 |
| CI | All repository JavaScript is syntax-checked; Tag TypeScript is compiled; static HTML, assets, CSS structure, JSON, cache alignment, and regression invariants are checked |

## Source-code checks

- All nine primary JavaScript files passed JavaScript syntax parsing.
- GitHub Actions compiled `tag-engine.ts` successfully.
- No duplicate HTML element IDs were found (429 IDs checked).
- All 18 local script, stylesheet, icon, and manifest references were found in the repository and matched the service-worker shell.
- All six primary stylesheets had balanced braces.
- The frontend RPC names inspected were present in the live public database function catalog.
- User-facing dynamic content in the inspected application components is inserted through text nodes/textContent; inspected `innerHTML` assignments were static UI templates.

## Supabase checks

- The party vote function now checks the leader role in SQL.
- `gather_game_chat_cleanup()` is no longer directly executable by `anon` or `authenticated`; its database trigger remains functional.
- The nine tables reported by the RLS-without-policy advisor have no direct SELECT/INSERT/UPDATE/DELETE privileges for `anon` or `authenticated`.
- All audited public SECURITY DEFINER functions use an empty search path. The non-user-facing trigger functions are not ordinary application RPCs.
- The nine application foreign-key index warnings were addressed.
- The health advisor returned no findings.
- The performance advisor now reports unused indexes only (22 informational findings); this includes newly added indexes that have not yet accumulated workload.
- Supabase Auth still reports leaked-password protection as disabled. This is an Auth dashboard setting and was not changed through SQL.

## Migration history

See [MIGRATION_RECONCILIATION.md](./MIGRATION_RECONCILIATION.md).

Current snapshot:
- 138 applied database migration records.
- 101 SQL migration files in the repository.
- 95 applied migration names have a same-named repository source.
- 43 applied migration names have no matching source file in the current branch.
- Six repository migration names have no matching applied migration record.
- 33 same-name matches have different repository and database version timestamps.

No migration history was deleted or rewritten. No production data was reset. The unmatched historical migrations require trusted source recovery or a reviewed schema baseline; they must not be blindly replayed.

## Important unresolved issues

### Turn-based game legality

The database move RPC now prevents a player from declaring the opponent the winner. However, it still accepts a client-submitted game state after checking membership, turn, revision, size, and basic object shape. It does **not** independently replay and validate every legal move for Chess, Checkers, Tic-Tac-Toe, and Connect Four.

A malicious player could potentially submit a forged board state or an incorrect draw result. Full protection requires moving each game's state transition and win/draw validation into trusted server-side logic. This remains a high-priority game-integrity task.

### Testing limitations

- No authenticated two-account end-to-end test was performed.
- Messaging workflows, invitations, game turns, rematches, and party voting were not exercised through real browser sessions.
- iPhone, Chromebook, and desktop visual regression tests were not performed.
- No full game-rule unit-test suite exists yet; current CI adds syntax, compilation, asset, and targeted regression-invariant checks.
- The Edge Function was inspected for bearer-token validation and admin-role checks but was not deployed or independently type-checked as part of this audit.

## Deployment

The CI build and static validation completed successfully for the audited source. GitHub Pages publishing experienced an artifact-metadata failure on a workflow retry (the retry saw duplicate `github-pages` artifacts). This was a GitHub Actions/Pages artifact lookup issue after the build and upload steps, not a source-validation failure. The deployment status should be checked against the newest clean workflow run before treating the latest repository commit as published.
