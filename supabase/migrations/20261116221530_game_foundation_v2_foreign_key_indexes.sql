create index if not exists game_matches_current_turn_user_idx
  on public.game_matches (current_turn_user_id)
  where current_turn_user_id is not null;
create index if not exists game_match_events_actor_idx
  on public.game_match_events (actor_id);