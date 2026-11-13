create or replace function public.gather_uno_create(p_conversation_id uuid,p_join_mode text,p_invited_user_ids uuid[] default '{}'::uuid[],p_max_players integer default 10)
returns public.gather_multiplayer_games language plpgsql security definer set search_path=''
as $function$
declare v_game public.gather_multiplayer_games;
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 if p_max_players<2 or p_max_players>20 then raise exception 'Choose between 2 and 20 players.'; end if;
 if p_join_mode not in ('open','invite') then raise exception 'Choose open or invite-only joining.'; end if;
 if p_join_mode='invite' and cardinality(coalesce(p_invited_user_ids,'{}'::uuid[]))>p_max_players-1 then raise exception 'The invitation list is larger than this match allows.'; end if;
 v_game:=public.gather_multiplayer_create(p_conversation_id,'uno',p_join_mode,coalesce(p_invited_user_ids,'{}'::uuid[]),jsonb_build_object('max_players',p_max_players),jsonb_build_object('version',1,'started',false),'#40826D');
 update public.gather_multiplayer_players set ready=true where game_id=v_game.id and user_id=auth.uid();
 if p_join_mode='invite' then
  insert into public.notifications(recipient_id,actor_id,kind,title,body,conversation_id)
  select p.user_id,auth.uid(),'uno_invite','UNO lobby invitation',v_game.id::text,p_conversation_id
  from public.gather_multiplayer_players p where p.game_id=v_game.id and p.status='invited' and p.user_id<>auth.uid()
  on conflict do nothing;
 end if;
 return v_game;
end $function$;

create or replace function public.gather_uno_leave(p_game_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare g public.gather_multiplayer_games; s jsonb; old_index integer; new_order text[]; leaving_index integer; remaining integer; next_user text; old_order text[];
begin
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into g from public.gather_multiplayer_games where id=p_game_id and game_type='uno' and status='active' for update;
 if g.id is null then raise exception 'This UNO lobby is no longer active.'; end if;
 if g.created_by=auth.uid() then raise exception 'The host cannot leave. Use End game instead.'; end if;
 select payload into s from private.gather_uno_private_states where game_id=p_game_id for update;
 update public.gather_multiplayer_players set status='left',ready=false where game_id=p_game_id and user_id=auth.uid() and status='joined';
 if not found then raise exception 'You are not in this UNO lobby.'; end if;
 if s is not null and coalesce((s->>'started')::boolean,false) then
  select coalesce(array_agg(value order by ordinality),'{}'::text[]) into old_order from jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb)) with ordinality;
  old_index:=coalesce((s->>'turn_index')::integer,0);
  select ordinality-1 into leaving_index from jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb)) with ordinality where value=auth.uid()::text limit 1;
  select coalesce(array_agg(value order by ordinality),'{}'::text[]) into new_order from jsonb_array_elements_text(coalesce(s->'order','[]'::jsonb)) with ordinality where value<>auth.uid()::text;
  remaining:=cardinality(new_order);
  s:=jsonb_set(s,'{order}',to_jsonb(new_order),true);
  s:=s #- array['hands',auth.uid()::text]; s:=s #- array['done',auth.uid()::text]; s:=s #- array['uno_called',auth.uid()::text];
  if remaining<2 then
   s:=jsonb_set(s,'{finished}','true'::jsonb,true); s:=jsonb_set(s,'{turn_user_id}','null'::jsonb,true);
   update public.gather_multiplayer_games set state=state||jsonb_build_object('finished',true,'turn_user_id',null),revision=revision+1,updated_at=now() where id=p_game_id;
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
revoke all on function public.gather_uno_create(uuid,text,uuid[],integer) from public,anon;
grant execute on function public.gather_uno_create(uuid,text,uuid[],integer) to authenticated;
revoke all on function public.gather_uno_leave(uuid) from public,anon;
grant execute on function public.gather_uno_leave(uuid) to authenticated;