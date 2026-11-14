# Supabase migration reconciliation

Audit snapshot: 2026-11-14  
Repository: `Tuckticktuck/Gather-new`  
Supabase project: `xrwldphmeafiakittcof`

## Observed state

- Applied Supabase migration records: **154**
- SQL migration files in the repository: **117**
- Applied migration names with a same-named repository source file: **111**
- Applied migration records whose names have no matching source file in the current branch: **43**
- Repository migration files whose names have no matching applied migration record: **6**
- Among the 111 name matches, **34** use a repository filename timestamp that differs from the applied database version.

The timestamp differences are not proof that a migration is unapplied. The matching migration name is a stronger clue, but the source SQL still needs to be compared with the live definitions before changing filenames or history.

## Applied migrations without a same-named source file

The following records exist in the connected database but do not have a matching migration filename in the current repository branch:

| Database version | Migration name |
|---|---|
| 20261101215908 | add_private_message_image_storage |
| 20261101224719 | create_feedback_inbox |
| 20261101224940 | optimize_feedback_access_policies |
| 20261110215652 | gather_feature_pack_phase_one |
| 20261110215802 | gather_scheduled_messages_and_session_controls |
| 20261110215846 | gather_secure_feature_function_wrappers |
| 20261110220326 | gather_login_activity_log |
| 20261110220406 | gather_allow_cancel_after_permission_revoked |
| 20261110220748 | gather_feature_query_indexes |
| 20261110220948 | gather_safe_current_session_list |
| 20261110224313 | show_profile_names_to_shared_conversation_members |
| 20261110224559 | limit_shared_conversation_profile_lookup_to_names |
| 20261111005500 | reuse_existing_direct_chat_for_admin_conversations |
| 20261111005843 | attach_admin_conversation_integrity_guard |
| 20261111163219 | add_gather_multiplayer_games_with_spectators |
| 20261111163554 | allow_checkers_multi_jump_turns |
| 20261111163939 | recheck_conversation_access_on_game_moves |
| 20261111193717 | add_multiplayer_game_foundation |
| 20261111193958 | harden_multiplayer_rpc_schema |
| 20261111194203 | keep_tag_movement_realtime_smooth |
| 20261111194357 | let_every_tag_player_choose_color |
| 20261111194541 | index_multiplayer_game_creators |
| 20261111200539 | add_random_tag_arena_obstacles |
| 20261112214309 | add_uno_multiplayer_engine |
| 20261112214318 | fix_uno_deck_array_operations |
| 20261112214533 | secure_uno_rpc_and_fix_reshuffle |
| 20261112214555 | correct_uno_deck_draw_and_reshuffle |
| 20261112214606 | add_uno_end_and_rematch |
| 20261112214626 | enforce_uno_call_penalty |
| 20261112214633 | restrict_uno_end_and_rematch_rpcs |
| 20261112220114 | add_game_invitation_declines |
| 20261112225346 | uno_late_join_deal_seven_cards |
| 20261112225441 | handle_rejoining_uno_players_safely |
| 20261113021710 | count_tag_hits_only_during_active_round |
| 20261113102937 | fix_game_chat_cleanup_trigger |
| 20261113103011 | lock_down_game_chat_rpc_permissions |
| 20261113103428 | fix_game_participant_read_policies |
| 20261113103624 | harden_game_invitable_people_rpc |
| 20261113103822 | harden_temporary_game_chat_permissions |
| 20261113123623 | fix_game_access_and_duplicate_lobbies |
| 20261113123708 | prevent_duplicate_turn_based_games |
| 20261113123738 | harden_invited_game_join_checks |
| 20261113124436 | fix_standalone_uno_start_access |

## Repository migrations without a matching applied migration name

- `harden_game_invitable_people`
- `allow_game_invites_to_chat_members`
- `fix_game_opening_and_duplicate_lobbies`
- `fix_game_chat_game_id_ambiguity`
- `fix_standalone_uno_actions`
- `fix_standalone_uno_done_confirmation`

These may have been applied through direct SQL, superseded by another migration, or left pending. They must be checked against the live function definitions before any action.

## Audit corrective migrations applied

- `harden_party_voting_and_game_chat_cleanup`
  - Enforces party-leader authorization inside `gather_party_poll_create`.
  - Revokes direct API execution of the trigger-only `gather_game_chat_cleanup` function while preserving trigger execution.
- `index_application_foreign_keys`
  - Adds indexes for nine application foreign-key lookup columns.
- `harden_turn_based_game_results`
  - Prevents the player whose turn it is from declaring the opponent the winner in a turn-based move RPC.

## Safe reconciliation policy

Do not replay, delete, or mark historical migrations as applied based only on filenames. A live schema cannot reliably reconstruct every historical data transformation or intermediate state.

To fully reconcile the missing sources, recover the original SQL from a trusted repository backup or deployment artifact, or create a reviewed schema baseline from a database dump. Compare each recovered migration with the live schema before changing migration history.

No production data was reset or deleted during this audit.
