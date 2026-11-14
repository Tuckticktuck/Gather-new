create or replace function public.gather_uno_leave(p_game_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare g public.gather_multiplayer_games; s jsonb; old_index integer; new_index integer; new_order text[]; leaving_index integer; remaining integer; next_user text;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into g from public.gather_multiplayer_games where id=p_game_id and game_type='uno' and status='active' for update;
 if g.id is null then raise exception 'This UNO lobby is no longer active.'; end if;
 if g.created_by=auth.uid() then raise exception 'The host cannot leave. Use End game instead.'; end if;
 select payload into s from private.gather_uno_private_states where game_id=p_game_id for update;
 update public.gather_multiplayer_players set status='left',ready=false where game_id=p_game_id and user_id=auth.uid() and status='joined';
 if not found then raise exception 'You are not in this UNO lobby.'; end if;
 if s is not null and coalesce((s->>'started')::boolean,false) then
  old_index:=coalesce((s->>'turn_index')::integer,0);
  select ordinality-1 into leaving_index from jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb)) with ordinality where value=auth.uid()::text limit 1;
  select coalesce(array_agg(value order by ordinality),'{}'::text[]) into new_order from jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb)) with ordinality where value<>auth.uid()::text;
  remaining:=cardinality(new_order);
  s:=jsonb_set(s,'{order}',to_jsonb(new_order),true);
  s:=s #- array['hands',auth.uid()::text]; s:=s #- array['done',auth.uid()::text]; s:=s #- array['uno_called',auth.uid()::text];
  if remaining<2 then
   s:=jsonb_set(s,'{finished}','true'::jsonb,true); s:=jsonb_set(s,'{turn_user_id}','null'::jsonb,true);
   update public.gather_multiplayer_games set status='completed',state=state||jsonb_build_object('finished',true,'turn_user_id',null),revision=revision+1,updated_at=now() where id=p_game_id;
  else
   if leaving_index is not null and leaving_index<old_index then old_index:=old_index-1; end if;
   new_index:=mod(greatest(0,old_index),remaining); next_user:=new_order[new_index+1];
   s:=jsonb_set(s,'{turn_index}',to_jsonb(new_index),true); s:=jsonb_set(s,'{turn_user_id}',to_jsonb(next_user),true);
   update public.gather_multiplayer_games set state=state||jsonb_build_object('turn_user_id',next_user,'finished',false),revision=revision+1,updated_at=now() where id=p_game_id;
  end if;
  update private.gather_uno_private_states set payload=s,updated_at=now() where game_id=p_game_id;
 else
  update public.gather_multiplayer_games set revision=revision+1,updated_at=now() where id=p_game_id;
 end if;
 update public.notifications set read_at=now() where recipient_id=auth.uid() and kind='uno_invite' and body=p_game_id::text and read_at is null;
 return true;
end $function$;
revoke all on function public.gather_uno_leave(uuid) from public,anon;
grant execute on function public.gather_uno_leave(uuid) to authenticated;