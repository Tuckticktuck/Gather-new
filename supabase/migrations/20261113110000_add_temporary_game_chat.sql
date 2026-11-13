create table if not exists public.gather_game_chat_messages (
 id uuid primary key default gen_random_uuid(),
 game_type text not null check(game_type in ('tag','uno','ludo')),
 game_id uuid not null,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 1200),
 created_at timestamptz not null default now()
);
create index if not exists gather_game_chat_messages_game_created_idx
 on public.gather_game_chat_messages(game_type,game_id,created_at);
alter table public.gather_game_chat_messages enable row level security;
revoke all on public.gather_game_chat_messages from public,anon,authenticated;

create or replace function private.gather_game_chat_list(p_game_type text,p_game_id uuid)
returns table(id uuid,game_type text,game_id uuid,sender_id uuid,body text,created_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_member boolean:=false;
begin
 if v_uid is null then raise exception 'Sign in to view game chat.'; end if;
 if p_game_type='tag' then
  select exists(select 1 from public.gather_tag_players where lobby_id=p_game_id and user_id=v_uid and status='joined') into v_member;
 elsif p_game_type in ('uno','ludo') then
  select exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status='joined') into v_member;
 end if;
 if not v_member then raise exception 'Join this game to view its temporary chat.'; end if;
 return query select m.id,m.game_type,m.game_id,m.sender_id,m.body,m.created_at from public.gather_game_chat_messages m
 where m.game_type=p_game_type and m.game_id=p_game_id order by m.created_at asc limit 150;
end $$;

create or replace function private.gather_game_chat_send(p_game_type text,p_game_id uuid,p_body text)
returns public.gather_game_chat_messages language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid();v_member boolean:=false;v_row public.gather_game_chat_messages;
begin
 if v_uid is null then raise exception 'Sign in to send a game message.'; end if;
 if char_length(btrim(coalesce(p_body,''))) not between 1 and 1200 then raise exception 'Messages must be between 1 and 1200 characters.'; end if;
 if p_game_type='tag' then
  select exists(select 1 from public.gather_tag_players where lobby_id=p_game_id and user_id=v_uid and status='joined')
   and exists(select 1 from public.gather_tag_lobbies where id=p_game_id and status in ('lobby','active')) into v_member;
 elsif p_game_type in ('uno','ludo') then
  select exists(select 1 from public.gather_multiplayer_players where game_id=p_game_id and user_id=v_uid and status='joined')
   and exists(select 1 from public.gather_multiplayer_games where id=p_game_id and game_type=p_game_type and status='active') into v_member;
 end if;
 if not v_member then raise exception 'You must be in an active game to send messages.'; end if;
 insert into public.gather_game_chat_messages(game_type,game_id,sender_id,body) values(p_game_type,p_game_id,v_uid,btrim(p_body)) returning * into v_row;
 return v_row;
end $$;

create or replace function private.gather_game_chat_cleanup()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status in ('completed','cancelled') and old.status is distinct from new.status then
  if tg_table_name='gather_tag_lobbies' then delete from public.gather_game_chat_messages where game_type='tag' and game_id=new.id;
  elsif tg_table_name='gather_multiplayer_games' then delete from public.gather_game_chat_messages where game_type=new.game_type and game_id=new.id;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists gather_tag_chat_cleanup on public.gather_tag_lobbies;
create trigger gather_tag_chat_cleanup after update of status on public.gather_tag_lobbies for each row execute function private.gather_game_chat_cleanup();
drop trigger if exists gather_multiplayer_chat_cleanup on public.gather_multiplayer_games;
create trigger gather_multiplayer_chat_cleanup after update of status on public.gather_multiplayer_games for each row execute function private.gather_game_chat_cleanup();

create or replace function public.gather_game_chat_list(p_game_type text,p_game_id uuid)
returns table(id uuid,game_type text,game_id uuid,sender_id uuid,body text,created_at timestamptz)
language sql stable set search_path='' as $$ select * from private.gather_game_chat_list($1,$2) $$;
create or replace function public.gather_game_chat_send(p_game_type text,p_game_id uuid,p_body text)
returns public.gather_game_chat_messages language sql set search_path='' as $$ select private.gather_game_chat_send($1,$2,$3) $$;

revoke all on function public.gather_game_chat_list(text,uuid) from public,anon;
revoke all on function public.gather_game_chat_send(text,uuid,text) from public,anon;
revoke all on function private.gather_game_chat_list(text,uuid) from public,anon;
revoke all on function private.gather_game_chat_send(text,uuid,text) from public,anon;
revoke all on function private.gather_game_chat_cleanup() from public,anon,authenticated;
grant execute on function public.gather_game_chat_list(text,uuid) to authenticated;
grant execute on function public.gather_game_chat_send(text,uuid,text) to authenticated;
grant execute on function private.gather_game_chat_list(text,uuid) to authenticated;
grant execute on function private.gather_game_chat_send(text,uuid,text) to authenticated;
