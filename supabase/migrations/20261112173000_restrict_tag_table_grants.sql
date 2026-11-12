revoke all on table public.gather_tag_lobbies,public.gather_tag_players from public,anon;
revoke insert,update,delete on table public.gather_tag_lobbies,public.gather_tag_players from authenticated;
grant select on table public.gather_tag_lobbies,public.gather_tag_players to authenticated;