update public.gather_games
set started_at=coalesce(updated_at,created_at),
    player_one_ready=true,
    player_two_ready=true
where status='active' and started_at is null;
