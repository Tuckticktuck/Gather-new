-- Require an explicit valid color when playing either kind of Wild card.
CREATE OR REPLACE FUNCTION public.gather_uno_action(p_game_id uuid, p_action text, p_card_id text DEFAULT NULL::text, p_color text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.gather_multiplayer_games; s jsonb; hand jsonb; deck jsonb; disc jsonb; order_ids uuid[]; idx int; dir int; n int; nextidx int; uid uuid:=auth.uid(); card jsonb; target uuid; targethand jsonb; prevuid uuid; currentcolor text; penalty int:=0; skipturn boolean:=false; foundcard boolean:=false; i int; counts jsonb;
begin
 select * into g from public.gather_multiplayer_games where id=p_game_id for update;
 if g.id is null or g.game_type<>'uno' or g.status<>'active' then raise exception 'UNO is not active.'; end if;
 if not private.is_conversation_member(g.conversation_id) or not private.can_send_message(g.conversation_id) then raise exception 'Game access is unavailable.'; end if;
 select payload into s from private.gather_uno_private_states where game_id=p_game_id for update;
 if s is null or not coalesce((s->>'started')::boolean,false) then raise exception 'UNO has not started.'; end if;
 if s->>'winner_id' is not null then raise exception 'This UNO game is already over.'; end if;
 if s->>'turn_user_id'<>uid::text and p_action not in ('call_uno') then raise exception 'It is not your turn.'; end if;
 hand:=s->'hands'->uid::text; deck:=s->'deck'; disc:=s->'discard'; order_ids:=array(select jsonb_array_elements_text(s->'order')::uuid); idx:=(s->>'turn_index')::int; dir:=(s->>'direction')::int; n:=array_length(order_ids,1); currentcolor:=s->>'current_color'; if p_action<>'call_uno' then prevuid:=order_ids[mod(idx-dir+n,n)+1]; if jsonb_array_length(coalesce(s->'hands'->prevuid::text,'[]'::jsonb))=1 and not coalesce((s->'uno_called'->>prevuid::text)::boolean,false) then targethand:=s->'hands'->prevuid::text; for i in 1..2 loop if jsonb_array_length(deck)=0 then exit; end if; targethand:=targethand||jsonb_build_array(deck->0); deck:=deck - 0; end loop; s:=jsonb_set(s,array['hands',prevuid::text],targethand,true); s:=jsonb_set(s,array['uno_called',prevuid::text],'true'::jsonb,true); end if; end if;
 if p_action='call_uno' then
  if jsonb_array_length(hand)>1 then raise exception 'Call UNO when you have one card.'; end if;
  s:=jsonb_set(s,array['uno_called',uid::text],'true'::jsonb,true);
 elsif p_action='draw' then
  if s->>'drawn_card_id' is not null then raise exception 'You already drew one card this turn. Play it if legal or pass.'; end if;
  if jsonb_array_length(deck)=0 then
   if jsonb_array_length(disc)>1 then
    select coalesce(jsonb_agg(x order by random()),'[]'::jsonb) into deck from jsonb_array_elements(disc) x where x->>'id'<>(disc->(jsonb_array_length(disc)-1)->>'id');
    disc:=jsonb_build_array(disc->(jsonb_array_length(disc)-1));
   end if;
  end if;
  if jsonb_array_length(deck)=0 then raise exception 'There are no cards left to draw.'; end if;
  card:=deck->0;
  hand:=hand||jsonb_build_array(card); deck:=deck - 0;
  s:=jsonb_set(s,array['hands',uid::text],hand,true);
  s:=jsonb_set(s,'{deck}',deck,false);
  s:=jsonb_set(s,'{drawn_card_id}',to_jsonb(card->>'id'),true);
  s:=jsonb_set(s,'{message}',to_jsonb('You drew one card. Play it if it is legal, or pass.'::text),true);
 elsif p_action='pass' then
  if s->>'drawn_card_id' is null then raise exception 'Draw one card before passing.'; end if;
  idx:=mod(idx+dir+n,n);
  s:=jsonb_set(s,'{turn_index}',to_jsonb(idx),false);
  s:=jsonb_set(s,'{turn_user_id}',to_jsonb(order_ids[idx+1]),false);
  s:=jsonb_set(s,'{drawn_card_id}','null'::jsonb,true);
  s:=jsonb_set(s,'{message}',to_jsonb('A card was played.'::text),true);
  s:=jsonb_set(s,'{message}',to_jsonb('You passed after drawing.'::text),true); elsif p_action='play' then
  if p_card_id is null then raise exception 'Choose a card.'; end if;
  for i in 0..jsonb_array_length(hand)-1 loop
   if hand->i->>'id'=p_card_id then card:=hand->i; foundcard:=true; exit; end if;
  end loop;
  if not foundcard then raise exception 'That card is not in your hand.'; end if;
  if s->>'drawn_card_id' is not null and s->>'drawn_card_id'<>p_card_id then
   raise exception 'After drawing, you can only play the card you just drew or pass.';
  end if;
  if card->>'color'<>'wild' and card->>'color'<>currentcolor and card->>'value'<>(disc->(jsonb_array_length(disc)-1)->>'value') then raise exception 'That card does not match the color or number.'; end if;
  if card->>'kind'='wild4' and exists(select 1 from jsonb_array_elements(hand) x where x->>'color'=currentcolor and x->>'id'<>p_card_id) then raise exception 'You can only play Wild Draw Four when you have no card matching the current color.'; end if;
  if card->>'color'='wild' and coalesce(p_color,'') not in ('red','blue','green','yellow') then raise exception 'Choose a color for your wild card.'; end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into hand from jsonb_array_elements(hand) x where x->>'id'<>p_card_id;
  disc:=disc||jsonb_build_array(card); currentcolor:=case when card->>'color'='wild' then p_color else card->>'color' end;
  if jsonb_array_length(hand)=0 then
   s:=jsonb_set(s,'{winner_id}',to_jsonb(uid),false);
  else
   if card->>'kind'='skip' then skipturn:=true; elsif card->>'kind'='reverse' then dir:=dir*-1; skipturn:=true; elsif card->>'kind'='draw2' then penalty:=2; skipturn:=true; elsif card->>'kind'='wild4' then penalty:=4; skipturn:=true; end if;
   nextidx:=mod(idx+dir*(case when skipturn then 2 else 1 end)+n*2,n);
   target:=order_ids[mod(idx+dir+n*2,n)+1];
   if penalty>0 then
    targethand:=s->'hands'->target::text;
    for i in 1..penalty loop
     if jsonb_array_length(deck)=0 then exit; end if;
     targethand:=targethand||jsonb_build_array(deck->0); deck:=deck - 0;
    end loop;
    s:=jsonb_set(s,array['hands',target::text],targethand,true);
   end if;
   s:=jsonb_set(s,'{turn_index}',to_jsonb(nextidx),false); s:=jsonb_set(s,'{turn_user_id}',to_jsonb(order_ids[nextidx+1]),false);
  end if;
  s:=jsonb_set(s,array['hands',uid::text],hand,true);
  s:=jsonb_set(s,'{discard}',disc,false); s:=jsonb_set(s,'{deck}',deck,false); s:=jsonb_set(s,'{current_color}',to_jsonb(currentcolor),false); s:=jsonb_set(s,'{direction}',to_jsonb(dir),false);
  s:=jsonb_set(s,'{uno_called}',jsonb_build_object(),false);
  s:=jsonb_set(s,'{drawn_card_id}','null'::jsonb,true);
 else raise exception 'Unknown UNO action.'; end if;
 update private.gather_uno_private_states set payload=s,updated_at=now() where game_id=p_game_id;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'card_count',jsonb_array_length(coalesce(s->'hands'->p.user_id::text,'[]'::jsonb)),'ready',p.ready,'status',p.status) order by p.joined_at),'[]'::jsonb) into counts from public.gather_multiplayer_players p where p.game_id=p_game_id and p.status in ('joined','invited');
 update public.gather_multiplayer_games set state=jsonb_build_object('version',1,'started',true,'top_card',disc->(jsonb_array_length(disc)-1),'current_color',currentcolor,'direction',dir,'turn_user_id',s->>'turn_user_id','winner_id',s->'winner_id','deck_count',jsonb_array_length(deck),'players',counts,'message',s->'message','drawn_pending',s->>'drawn_card_id' is not null),revision=revision+1,updated_at=now() where id=p_game_id;
 return public.gather_uno_get_state(p_game_id);
end $function$
;
revoke all on function public.gather_uno_action(uuid,text,text,text) from public,anon;
grant execute on function public.gather_uno_action(uuid,text,text,text) to authenticated;
