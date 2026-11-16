create policy "Service role manages private game state"
on public.game_match_private_state
for all
to service_role
using (true)
with check (true);
