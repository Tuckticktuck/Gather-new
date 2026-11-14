create or replace function public.gather_uno_end(p_game_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare g public.gather_multiplayer_games; s jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into g from public.gather_multiplayer_games where id=p_game_id and game_type='uno' for update;
 if g.id is null or g.status<>'active' then raise exception 'This UNO game is not active.'; end if;
 if g.created_by<>auth.uid() then raise exception 'Only the host can end this UNO game.'; end if;
 select payload into s from private.gather_uno_private_states where game_id=p_game_id for update;
 if s is not null then s:=jsonb_set(s,'{finished}','true'::jsonb,true); update private.gather_uno_private_states set payload=s,updated_at=now() where game_id=p_game_id; end if;
 update public.gather_multiplayer_games set status='completed',state=state||jsonb_build_object('finished',true,'ended_by',auth.uid()),revision=revision+1,updated_at=now() where id=p_game_id;
 return true;
end $function$;
revoke all on function public.gather_uno_end(uuid) from public,anon;
grant execute on function public.gather_uno_end(uuid) to authenticated;