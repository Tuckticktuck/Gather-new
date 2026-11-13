create index if not exists gather_game_parties_created_by_idx
  on public.gather_game_parties(created_by);
create index if not exists gather_game_party_members_invited_by_idx
  on public.gather_game_party_members(invited_by)
  where invited_by is not null;
create index if not exists gather_game_party_polls_created_by_idx
  on public.gather_game_party_polls(created_by);
create index if not exists gather_game_party_votes_user_id_idx
  on public.gather_game_party_votes(user_id);