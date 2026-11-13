create index if not exists gather_uno_rematch_offers_requested_by_idx
  on private.gather_uno_rematch_offers(requested_by);
create index if not exists gather_battleship_fleets_player_id_idx
  on public.gather_battleship_fleets(player_id);
create index if not exists gather_game_chat_messages_sender_id_idx
  on public.gather_game_chat_messages(sender_id);
create index if not exists gather_games_created_by_idx
  on public.gather_games(created_by);
create index if not exists gather_games_turn_user_id_idx
  on public.gather_games(turn_user_id);
create index if not exists gather_games_winner_id_idx
  on public.gather_games(winner_id);
create index if not exists gather_tag_lobbies_created_by_idx
  on public.gather_tag_lobbies(created_by);
create index if not exists intergroup_message_requests_reviewed_by_idx
  on public.intergroup_message_requests(reviewed_by);
create index if not exists message_restrictions_created_by_idx
  on public.message_restrictions(created_by);
