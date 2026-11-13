-- Restore all previously active players for the next Tag round and index result lookups.
create index if not exists gather_tag_lobbies_winner_user_idx
  on public.gather_tag_lobbies(winner_user_id)
  where winner_user_id is not null;

create or replace function public.gather_tag_return_lobby(p_lobby_id uuid)
returns public.gather_tag_lobbies
language plpgsql
security definer
set search_path=''
as $$
declare v_lobby public.gather_tag_lobbies;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into v_lobby from public.gather_tag_lobbies where id=p_lobby_id for update;
  if v_lobby.id is null then raise exception 'Tag lobby not found.'; end if;
  if v_lobby.created_by<>auth.uid() then raise exception 'Only the host can return everyone to the lobby.'; end if;
  if v_lobby.status not in ('active','completed') then raise exception 'This round cannot be returned to the lobby.'; end if;
  if not private.is_conversation_member(v_lobby.conversation_id) then raise exception 'Lobby access is unavailable.'; end if;
  update public.gather_tag_players set
    status=case when status='eliminated' then 'joined' else status end,
    ready=false,is_it=false,team=null,tags_received=0,updated_at=now()
    where lobby_id=p_lobby_id and status in ('joined','eliminated');
  update public.gather_tag_lobbies set
    status='lobby',started_at=null,ends_at=null,winner_user_id=null,winning_team=null,updated_at=now()
    where id=p_lobby_id returning * into v_lobby;
  return v_lobby;
end
$$;
revoke all on function public.gather_tag_return_lobby(uuid) from public,anon;
grant execute on function public.gather_tag_return_lobby(uuid) to authenticated;
