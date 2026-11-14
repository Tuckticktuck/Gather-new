create table public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_pkey primary key (user_id, friend_id),
  constraint friendships_no_self check (user_id <> friend_id)
);

create index friendships_friend_id_idx on public.friendships(friend_id);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_pair_key unique (sender_id, recipient_id),
  constraint friend_requests_no_self check (sender_id <> recipient_id),
  constraint friend_requests_status_check check (status = any (array['pending'::text,'accepted'::text,'declined'::text]))
);

create index friend_requests_recipient_pending_idx on public.friend_requests(recipient_id, created_at desc) where status = 'pending';
create index friend_requests_sender_pending_idx on public.friend_requests(sender_id, created_at desc) where status = 'pending';

alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;

create policy "Users can view their own friendships" on public.friendships
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Participants can view their friend requests" on public.friend_requests
  for select to authenticated using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

revoke all on public.friendships, public.friend_requests from public, anon, authenticated;
grant select on public.friendships, public.friend_requests to authenticated;

create or replace function private.send_friend_request(p_recipient_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_request_id uuid;
  v_status text;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_recipient_id is null or p_recipient_id = v_me then raise exception 'Choose another member.'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_recipient_id) then raise exception 'That member could not be found.'; end if;
  if private.is_blocked_between(v_me, p_recipient_id) then return jsonb_build_object('status', 'blocked'); end if;
  if exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = p_recipient_id) then
    return jsonb_build_object('status', 'friends');
  end if;

  select r.id into v_request_id from public.friend_requests r
  where r.sender_id = p_recipient_id and r.recipient_id = v_me and r.status = 'pending' limit 1;
  if v_request_id is not null then return jsonb_build_object('status', 'incoming', 'request_id', v_request_id); end if;

  insert into public.friend_requests (sender_id, recipient_id) values (v_me, p_recipient_id)
  on conflict (sender_id, recipient_id) do update
    set status = 'pending', created_at = now(), responded_at = null
    where public.friend_requests.status <> 'pending'
  returning id into v_request_id;

  if v_request_id is null then
    select r.id, r.status into v_request_id, v_status from public.friend_requests r
    where r.sender_id = v_me and r.recipient_id = p_recipient_id;
  else v_status := 'pending';
  end if;
  return jsonb_build_object('status', coalesce(v_status, 'pending'), 'request_id', v_request_id);
end;
$function$;

create or replace function private.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_sender_id uuid;
  v_status text;
  v_conversation_id uuid;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  select r.sender_id, r.status into v_sender_id, v_status
  from public.friend_requests r where r.id = p_request_id and r.recipient_id = v_me for update;
  if v_sender_id is null then raise exception 'That friend request was not found.'; end if;
  if v_status <> 'pending' then raise exception 'This friend request has already been handled.'; end if;

  if not coalesce(p_accept, false) then
    update public.friend_requests set status = 'declined', responded_at = now() where id = p_request_id;
    return jsonb_build_object('status', 'declined');
  end if;

  if private.is_blocked_between(v_me, v_sender_id) then
    update public.friend_requests set status = 'declined', responded_at = now() where id = p_request_id;
    return jsonb_build_object('status', 'blocked');
  end if;

  insert into public.friendships (user_id, friend_id) values (v_me, v_sender_id), (v_sender_id, v_me)
  on conflict (user_id, friend_id) do nothing;

  select c.id into v_conversation_id from public.conversations c
  where c.kind = 'direct'
    and (select count(*) from public.conversation_members cm where cm.conversation_id = c.id) = 2
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = v_me)
    and exists (select 1 from public.conversation_members cm where cm.conversation_id = c.id and cm.user_id = v_sender_id)
  order by c.created_at desc limit 1;

  if v_conversation_id is null then
    insert into public.conversations (kind, title, created_by) values ('direct', null, v_me) returning id into v_conversation_id;
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conversation_id, v_me, 'owner'), (v_conversation_id, v_sender_id, 'member');
  end if;

  update public.friend_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  update public.friend_requests set status = 'accepted', responded_at = now()
  where sender_id = v_me and recipient_id = v_sender_id and status = 'pending';
  return jsonb_build_object('status', 'accepted', 'conversation_id', v_conversation_id);
end;
$function$;

create or replace function private.remove_friend(p_friend_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_removed integer;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_friend_id is null or p_friend_id = v_me then raise exception 'Choose another member.'; end if;
  delete from public.friendships
  where (user_id = v_me and friend_id = p_friend_id) or (user_id = p_friend_id and friend_id = v_me);
  get diagnostics v_removed = row_count;
  return jsonb_build_object('status', case when v_removed > 0 then 'removed' else 'not_friends' end);
end;
$function$;

create or replace function public.send_friend_request(p_recipient_id uuid)
returns jsonb language sql set search_path to ''
as $function$ select private.send_friend_request(p_recipient_id); $function$;

create or replace function public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb language sql set search_path to ''
as $function$ select private.respond_to_friend_request(p_request_id, p_accept); $function$;

create or replace function public.remove_friend(p_friend_id uuid)
returns jsonb language sql set search_path to ''
as $function$ select private.remove_friend(p_friend_id); $function$;

revoke all on function private.send_friend_request(uuid) from public, anon;
revoke all on function private.respond_to_friend_request(uuid, boolean) from public, anon;
revoke all on function private.remove_friend(uuid) from public, anon;
grant execute on function private.send_friend_request(uuid) to authenticated;
grant execute on function private.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function private.remove_friend(uuid) to authenticated;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

create or replace function private.dismiss_pending_requests_when_blocked()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  update public.conversation_requests set status = 'declined', responded_at = now()
  where status = 'pending' and (
    (sender_id = new.blocker_id and recipient_id = new.blocked_id)
    or (sender_id = new.blocked_id and recipient_id = new.blocker_id)
  );
  update public.friend_requests set status = 'declined', responded_at = now()
  where status = 'pending' and (
    (sender_id = new.blocker_id and recipient_id = new.blocked_id)
    or (sender_id = new.blocked_id and recipient_id = new.blocker_id)
  );
  return new;
end;
$function$;

do $block$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests') then
      execute 'alter publication supabase_realtime add table public.friend_requests';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships') then
      execute 'alter publication supabase_realtime add table public.friendships';
    end if;
  end if;
end;
$block$;
