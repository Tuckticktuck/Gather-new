-- Gather age confirmation, age-band messaging, and pair-specific intergroup approval.
-- Birth dates live only in the private schema. Public/admin surfaces expose age bands only.

create schema if not exists private;

create table if not exists private.member_age_records (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  confirmed_at timestamptz not null default now(),
  constraint member_age_records_birth_date_not_future check (birth_date <= current_date)
);
revoke all on private.member_age_records from public, anon, authenticated;

create table if not exists public.intergroup_message_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  requester_age_group text not null check (requester_age_group in ('12-14','15-18')),
  target_age_group text not null check (target_age_group in ('12-14','15-18')),
  status text not null default 'pending' check (status in ('pending','approved','declined','revoked')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint intergroup_message_requests_no_self check (requester_id <> target_user_id),
  constraint intergroup_message_requests_cross_group check (requester_age_group <> target_age_group)
);
create index if not exists intergroup_requests_pending_idx on public.intergroup_message_requests(requested_at desc) where status='pending';
create index if not exists intergroup_requests_requester_idx on public.intergroup_message_requests(requester_id,requested_at desc);
create index if not exists intergroup_requests_target_idx on public.intergroup_message_requests(target_user_id,requested_at desc);
alter table public.intergroup_message_requests enable row level security;
revoke all on public.intergroup_message_requests from public,anon,authenticated;
grant select on public.intergroup_message_requests to authenticated;
drop policy if exists "Members and admins can view relevant intergroup requests" on public.intergroup_message_requests;
create policy "Members and admins can view relevant intergroup requests"
  on public.intergroup_message_requests for select to authenticated
  using (requester_id=(select auth.uid()) or target_user_id=(select auth.uid()) or (select private.is_feedback_admin()));

create or replace function private.member_age_group(p_user_id uuid)
returns text language sql stable security definer set search_path=''
as $function$
  select case
    when extract(year from age(current_date,r.birth_date)) between 12 and 14 then '12-14'
    when extract(year from age(current_date,r.birth_date)) between 15 and 18 then '15-18'
    else null
  end
  from private.member_age_records r where r.user_id=p_user_id;
$function$;

create or replace function private.is_age_eligible(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$ select private.member_age_group(p_user_id) is not null; $function$;

create or replace function private.is_gather_admin_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
  select coalesce((select u.raw_app_meta_data->>'gather_role' from auth.users u where u.id=p_user_id),'')='admin';
$function$;

create or replace function private.users_are_blocked(p_user_a uuid,p_user_b uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists(select 1 from public.user_blocks b
    where (b.blocker_id=p_user_a and b.blocked_id=p_user_b)
       or (b.blocker_id=p_user_b and b.blocked_id=p_user_a));
$function$;

create or replace function private.has_intergroup_permission(p_user_a uuid,p_user_b uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists(
    select 1 from public.intergroup_message_requests r
    where r.status='approved'
      and (
        (r.requester_id=p_user_a and r.target_user_id=p_user_b
          and r.requester_age_group=private.member_age_group(p_user_a)
          and r.target_age_group=private.member_age_group(p_user_b))
        or
        (r.requester_id=p_user_b and r.target_user_id=p_user_a
          and r.requester_age_group=private.member_age_group(p_user_b)
          and r.target_age_group=private.member_age_group(p_user_a))
      )
  );
$function$;

create or replace function private.can_pair_message(p_user_a uuid,p_user_b uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $function$
declare v_group_a text; v_group_b text;
begin
  if p_user_a is null or p_user_b is null or p_user_a=p_user_b then return false; end if;
  if private.users_are_blocked(p_user_a,p_user_b) then return false; end if;
  if private.is_gather_admin_user(p_user_a) or private.is_gather_admin_user(p_user_b) then return true; end if;
  v_group_a:=private.member_age_group(p_user_a);
  v_group_b:=private.member_age_group(p_user_b);
  if v_group_a is null or v_group_b is null then return false; end if;
  if v_group_a=v_group_b then return true; end if;
  return private.has_intergroup_permission(p_user_a,p_user_b);
end;
$function$;

create or replace function private.my_age_status()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_user_id uuid:=(select auth.uid()); v_birth_date date; v_group text; v_age integer;
begin
  if v_user_id is null then raise exception 'You must be signed in.'; end if;
  if private.is_gather_admin_user(v_user_id) then
    return jsonb_build_object('verified',true,'is_admin',true,'age_group',null);
  end if;
  select r.birth_date into v_birth_date from private.member_age_records r where r.user_id=v_user_id;
  if v_birth_date is null then return jsonb_build_object('verified',false,'eligible',false,'age_group',null); end if;
  v_age:=extract(year from age(current_date,v_birth_date))::integer;
  v_group:=private.member_age_group(v_user_id);
  return jsonb_build_object('verified',true,'eligible',v_group is not null,'age_group',v_group,'age',v_age);
end;
$function$;

create or replace function private.confirm_my_age(p_birth_date date)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_user_id uuid:=(select auth.uid()); v_age integer; v_group text;
begin
  if v_user_id is null then raise exception 'You must be signed in.'; end if;
  if private.is_gather_admin_user(v_user_id) then return jsonb_build_object('verified',true,'is_admin',true,'age_group',null); end if;
  if p_birth_date is null or p_birth_date>current_date then raise exception 'Enter a valid date of birth.'; end if;
  if exists(select 1 from private.member_age_records r where r.user_id=v_user_id) then
    raise exception 'Your age has already been confirmed. Contact Gather Admin if the date needs correction.';
  end if;
  v_age:=extract(year from age(current_date,p_birth_date))::integer;
  v_group:=case when v_age between 12 and 14 then '12-14' when v_age between 15 and 18 then '15-18' else null end;
  -- Keep the first self-declared response even if ineligible. Admin reset is required to correct it.
  insert into private.member_age_records(user_id,birth_date) values(v_user_id,p_birth_date);
  return jsonb_build_object('verified',true,'eligible',v_group is not null,'age_group',v_group,'age',v_age);
end;
$function$;

create or replace function public.get_my_age_status()
returns jsonb language sql security invoker set search_path=''
as $function$ select private.my_age_status(); $function$;
create or replace function public.confirm_my_age(p_birth_date date)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.confirm_my_age(p_birth_date); $function$;
create or replace function public.get_member_age_group(p_user_id uuid)
returns text language plpgsql security invoker set search_path=''
as $function$
begin
  if (select auth.uid()) is null then raise exception 'You must be signed in.'; end if;
  return private.member_age_group(p_user_id);
end;
$function$;

create or replace function private.request_intergroup_message(p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_me uuid:=(select auth.uid()); v_my_group text; v_target_group text; v_existing public.intergroup_message_requests%rowtype; v_id uuid;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_target_user_id is null or p_target_user_id=v_me then raise exception 'Choose another member.'; end if;
  v_my_group:=private.member_age_group(v_me); v_target_group:=private.member_age_group(p_target_user_id);
  if v_my_group is null then raise exception 'Complete age confirmation before requesting intergroup messaging.'; end if;
  if v_target_group is null then raise exception 'That member has not completed age confirmation or is outside Gather age limits.'; end if;
  if v_my_group=v_target_group then raise exception 'This member is already in your age group. A regular chat request is available instead.'; end if;
  if private.users_are_blocked(v_me,p_target_user_id) then raise exception 'Intergroup messaging cannot be requested because one account has blocked the other.'; end if;
  if private.has_intergroup_permission(v_me,p_target_user_id) then return jsonb_build_object('status','approved'); end if;
  select r.* into v_existing from public.intergroup_message_requests r
  where r.status='pending'
    and ((r.requester_id=v_me and r.target_user_id=p_target_user_id) or (r.requester_id=p_target_user_id and r.target_user_id=v_me))
  order by r.requested_at desc limit 1;
  if v_existing.id is not null then return jsonb_build_object('status','pending','request_id',v_existing.id); end if;
  insert into public.intergroup_message_requests(requester_id,target_user_id,requester_age_group,target_age_group)
  values(v_me,p_target_user_id,v_my_group,v_target_group) returning id into v_id;
  return jsonb_build_object('status','pending','request_id',v_id);
end;
$function$;
create or replace function public.request_intergroup_message(p_target_user_id uuid)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.request_intergroup_message(p_target_user_id); $function$;

create or replace function private.get_direct_chat_status(p_other_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_me uuid:=(select auth.uid()); v_i_blocked boolean; v_they_blocked boolean;
  v_my_group text; v_other_group text; v_request_status text; v_pair_allowed boolean;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_other_user_id is null or p_other_user_id=v_me then raise exception 'Choose another member.'; end if;
  select exists(select 1 from public.user_blocks b where b.blocker_id=v_me and b.blocked_id=p_other_user_id) into v_i_blocked;
  select exists(select 1 from public.user_blocks b where b.blocker_id=p_other_user_id and b.blocked_id=v_me) into v_they_blocked;
  v_my_group:=private.member_age_group(v_me); v_other_group:=private.member_age_group(p_other_user_id);
  v_pair_allowed:=private.can_pair_message(v_me,p_other_user_id);
  select r.status into v_request_status from public.intergroup_message_requests r
  where (r.requester_id=v_me and r.target_user_id=p_other_user_id) or (r.requester_id=p_other_user_id and r.target_user_id=v_me)
  order by r.requested_at desc limit 1;
  return jsonb_build_object(
    'i_blocked',v_i_blocked,'they_blocked',v_they_blocked,'can_message',v_pair_allowed,
    'my_age_group',v_my_group,'other_age_group',v_other_group,
    'is_intergroup',v_my_group is not null and v_other_group is not null and v_my_group<>v_other_group,
    'intergroup_permission',private.has_intergroup_permission(v_me,p_other_user_id),
    'intergroup_request_status',v_request_status
  );
end;
$function$;
create or replace function public.get_direct_chat_status(p_other_user_id uuid)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.get_direct_chat_status(p_other_user_id); $function$;

create or replace function private.can_send_message(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists(
    select 1 from public.conversations c
    where c.id=p_conversation_id
      and exists(select 1 from public.conversation_members mine where mine.conversation_id=c.id and mine.user_id=(select auth.uid()))
      and (
        (c.kind='direct'
          and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
          and not exists(
            select 1 from public.conversation_members a join public.conversation_members b
              on b.conversation_id=a.conversation_id and b.user_id<>a.user_id
            where a.conversation_id=c.id and not private.can_pair_message(a.user_id,b.user_id)
          )
        )
        or
        (c.kind='group'
          and not exists(
            select 1 from public.conversation_members a join public.conversation_members b
              on b.conversation_id=a.conversation_id and b.user_id>a.user_id
            where a.conversation_id=c.id and not private.can_pair_message(a.user_id,b.user_id)
          )
        )
      )
  );
$function$;

create or replace function private.can_add_conversation_member(p_conversation_id uuid,p_user_id uuid,p_role text)
returns boolean language sql stable security definer set search_path=''
as $function$
  select exists(
    select 1 from public.conversations c where c.id=p_conversation_id
      and (
        (p_user_id=(select auth.uid()) and p_role='owner' and c.created_by=(select auth.uid())
          and not exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id)
          and (private.is_age_eligible(p_user_id) or private.is_gather_admin_user(p_user_id)))
        or
        (p_user_id<>(select auth.uid()) and p_role='member' and c.kind='group'
          and private.is_conversation_manager(c.id)
          and (private.is_age_eligible(p_user_id) or private.is_gather_admin_user(p_user_id))
          and not exists(
            select 1 from public.conversation_members cm
            where cm.conversation_id=c.id and not private.can_pair_message(cm.user_id,p_user_id)
          ))
      )
  );
$function$;

create or replace function private.create_group_chat(p_title text,p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_me uuid:=(select auth.uid()); v_count integer; v_conversation_id uuid;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_title is null or char_length(btrim(p_title))<1 or char_length(btrim(p_title))>60 then raise exception 'Enter a group name between 1 and 60 characters.'; end if;
  if not (private.is_age_eligible(v_me) or private.is_gather_admin_user(v_me)) then raise exception 'Complete age confirmation before creating a group.'; end if;
  select count(distinct x) into v_count from unnest(coalesce(p_member_ids,'{}'::uuid[])) as t(x) where x is not null;
  if v_count<2 then raise exception 'Choose at least two other members for a group chat.'; end if;
  if exists(select 1 from unnest(p_member_ids) as t(x) where x=v_me) then raise exception 'You are already included in the group.'; end if;
  if exists(
    select 1 from (select distinct x from unnest(p_member_ids) as t(x) where x is not null) ids
    left join public.profiles p on p.id=ids.x
    where p.id is null or not (private.is_age_eligible(ids.x) or private.is_gather_admin_user(ids.x))
  ) then raise exception 'One or more selected members have not completed age confirmation or are outside Gather age limits.'; end if;
  if exists(
    select 1 from (select distinct x from unnest(p_member_ids) as t(x) where x is not null) ids
    where not private.can_pair_message(v_me,ids.x)
  ) then raise exception 'Group members must be in your age group or have admin-approved intergroup messaging.'; end if;
  if exists(
    select 1 from
      (select distinct x from unnest(p_member_ids) as t(x) where x is not null) a
      join (select distinct x from unnest(p_member_ids) as t(x) where x is not null) b on b.x>a.x
    where not private.can_pair_message(a.x,b.x)
  ) then raise exception 'Every cross-group member pair needs admin approval before they can share a group chat.'; end if;
  insert into public.conversations(kind,title,created_by) values('group',btrim(p_title),v_me) returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id,user_id,role) values(v_conversation_id,v_me,'owner');
  insert into public.conversation_members(conversation_id,user_id,role)
    select v_conversation_id,ids.x,'member' from (select distinct x from unnest(p_member_ids) as t(x) where x is not null) ids;
  return v_conversation_id;
end;
$function$;

create or replace function private.send_direct_chat_request(p_recipient_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_me uuid:=(select auth.uid()); v_request_id uuid; v_status text; v_conversation_id uuid;
  v_my_group text; v_other_group text;
begin
  if v_me is null then raise exception 'You must be signed in to send a chat request.'; end if;
  if p_recipient_id is null or p_recipient_id=v_me then raise exception 'Choose another member.'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_recipient_id) then raise exception 'That member could not be found.'; end if;
  if private.users_are_blocked(v_me,p_recipient_id) then return jsonb_build_object('status','blocked'); end if;
  v_my_group:=private.member_age_group(v_me); v_other_group:=private.member_age_group(p_recipient_id);
  if v_my_group is null or v_other_group is null then return jsonb_build_object('status','age_verification_required'); end if;
  if v_my_group<>v_other_group and not private.has_intergroup_permission(v_me,p_recipient_id) then
    return jsonb_build_object('status','intergroup_approval_required');
  end if;
  select c.id into v_conversation_id from public.conversations c
  where c.kind='direct'
    and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_me)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=p_recipient_id)
  limit 1;
  if v_conversation_id is not null then return jsonb_build_object('status','existing','conversation_id',v_conversation_id); end if;
  select r.id into v_request_id from public.conversation_requests r
  where r.sender_id=p_recipient_id and r.recipient_id=v_me and r.status='pending' limit 1;
  if v_request_id is not null then return jsonb_build_object('status','incoming','request_id',v_request_id); end if;
  insert into public.conversation_requests(sender_id,recipient_id) values(v_me,p_recipient_id)
  on conflict(sender_id,recipient_id) do update
    set status='pending',conversation_id=null,responded_at=null,created_at=now()
    where public.conversation_requests.status='declined'
       or (public.conversation_requests.status='accepted' and public.conversation_requests.conversation_id is null)
  returning id into v_request_id;
  if v_request_id is null then
    select r.id,r.status into v_request_id,v_status from public.conversation_requests r
    where r.sender_id=v_me and r.recipient_id=p_recipient_id;
    return jsonb_build_object('status',coalesce(v_status,'pending'),'request_id',v_request_id);
  end if;
  return jsonb_build_object('status','pending','request_id',v_request_id);
end;
$function$;

create or replace function private.respond_to_direct_chat_request(p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_me uuid:=(select auth.uid()); v_sender_id uuid; v_status text; v_conversation_id uuid;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  select r.sender_id,r.status into v_sender_id,v_status from public.conversation_requests r
  where r.id=p_request_id and r.recipient_id=v_me for update;
  if v_sender_id is null then raise exception 'That chat request was not found.'; end if;
  if v_status<>'pending' then raise exception 'This chat request has already been handled.'; end if;
  if not p_accept then
    update public.conversation_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','declined');
  end if;
  if private.users_are_blocked(v_me,v_sender_id) then
    update public.conversation_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','blocked');
  end if;
  if not private.can_pair_message(v_me,v_sender_id) then return jsonb_build_object('status','intergroup_approval_required'); end if;
  insert into public.conversations(kind,title,created_by) values('direct',null,v_me) returning id into v_conversation_id;
  insert into public.conversation_members(conversation_id,user_id,role) values(v_conversation_id,v_me,'owner'),(v_conversation_id,v_sender_id,'member');
  update public.conversation_requests set status='accepted',conversation_id=v_conversation_id,responded_at=now() where id=p_request_id;
  return jsonb_build_object('status','accepted','conversation_id',v_conversation_id);
end;
$function$;

create or replace function private.respond_to_friend_request(p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_me uuid:=(select auth.uid()); v_sender_id uuid; v_status text; v_conversation_id uuid;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  select r.sender_id,r.status into v_sender_id,v_status from public.friend_requests r
  where r.id=p_request_id and r.recipient_id=v_me for update;
  if v_sender_id is null then raise exception 'That friend request was not found.'; end if;
  if v_status<>'pending' then raise exception 'This friend request has already been handled.'; end if;
  if not coalesce(p_accept,false) then
    update public.friend_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','declined');
  end if;
  if private.users_are_blocked(v_me,v_sender_id) then
    update public.friend_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','blocked');
  end if;
  insert into public.friendships(user_id,friend_id) values(v_me,v_sender_id),(v_sender_id,v_me) on conflict(user_id,friend_id) do nothing;
  if private.can_pair_message(v_me,v_sender_id) then
    select c.id into v_conversation_id from public.conversations c
    where c.kind='direct'
      and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_me)
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_sender_id)
    order by c.created_at desc limit 1;
    if v_conversation_id is null then
      insert into public.conversations(kind,title,created_by) values('direct',null,v_me) returning id into v_conversation_id;
      insert into public.conversation_members(conversation_id,user_id,role) values(v_conversation_id,v_me,'owner'),(v_conversation_id,v_sender_id,'member');
    end if;
  end if;
  update public.friend_requests set status='accepted',responded_at=now() where id=p_request_id;
  update public.friend_requests set status='accepted',responded_at=now() where sender_id=v_me and recipient_id=v_sender_id and status='pending';
  return jsonb_build_object('status','accepted','conversation_id',v_conversation_id);
end;
$function$;

create or replace function public.send_direct_chat_request(p_recipient_id uuid)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.send_direct_chat_request(p_recipient_id); $function$;
create or replace function public.respond_to_direct_chat_request(p_request_id uuid,p_accept boolean)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.respond_to_direct_chat_request(p_request_id,p_accept); $function$;
create or replace function public.respond_to_friend_request(p_request_id uuid,p_accept boolean)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.respond_to_friend_request(p_request_id,p_accept); $function$;
create or replace function public.create_group_chat(p_title text,p_member_ids uuid[])
returns uuid language sql security invoker set search_path=''
as $function$ select private.create_group_chat(p_title,p_member_ids); $function$;

create or replace function public.admin_get_age_groups(p_user_ids uuid[])
returns jsonb language plpgsql security invoker set search_path=''
as $function$
declare v_result jsonb;
begin
  if not (select private.is_feedback_admin()) then raise exception using errcode='42501',message='Only Gather Admin can view age-group review details.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',ids.x,'age_group',private.member_age_group(ids.x))),'[]'::jsonb)
  into v_result from (select distinct unnest(coalesce(p_user_ids,'{}'::uuid[])) as x) ids;
  return v_result;
end;
$function$;

create or replace function private.reset_member_age_confirmation(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_admin_id uuid:=(select auth.uid()); v_deleted integer;
begin
  if v_admin_id is null or not private.is_feedback_admin() then
    raise exception using errcode='42501',message='Only Gather Admin can reset age confirmation.';
  end if;
  if p_user_id is null or p_user_id=v_admin_id or private.is_gather_admin_user(p_user_id) then
    raise exception using errcode='22023',message='That account cannot have its age confirmation reset.';
  end if;
  delete from private.member_age_records where user_id=p_user_id;
  get diagnostics v_deleted=row_count;
  if v_deleted>0 then
    update public.intergroup_message_requests
      set status='revoked',reviewed_at=now(),reviewed_by=v_admin_id
    where status='approved' and (requester_id=p_user_id or target_user_id=p_user_id);
    insert into public.admin_action_logs(actor_id,target_user_id,action,details)
    values(v_admin_id,p_user_id,'age_confirmation_reset','{}'::jsonb);
  end if;
  return jsonb_build_object('reset',v_deleted>0);
end;
$function$;
create or replace function public.reset_member_age_confirmation(p_user_id uuid)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.reset_member_age_confirmation(p_user_id); $function$;

revoke all on function private.member_age_group(uuid) from public,anon,authenticated;
revoke all on function private.is_age_eligible(uuid) from public,anon,authenticated;
revoke all on function private.is_gather_admin_user(uuid) from public,anon,authenticated;
revoke all on function private.users_are_blocked(uuid,uuid) from public,anon,authenticated;
revoke all on function private.has_intergroup_permission(uuid,uuid) from public,anon,authenticated;
revoke all on function private.can_pair_message(uuid,uuid) from public,anon,authenticated;
revoke all on function private.my_age_status() from public,anon,authenticated;
revoke all on function private.confirm_my_age(date) from public,anon,authenticated;
revoke all on function private.request_intergroup_message(uuid) from public,anon,authenticated;
revoke all on function private.reset_member_age_confirmation(uuid) from public,anon,authenticated;
grant execute on function private.member_age_group(uuid) to authenticated;
grant execute on function private.is_age_eligible(uuid) to authenticated;
grant execute on function private.is_gather_admin_user(uuid) to authenticated;
grant execute on function private.users_are_blocked(uuid,uuid) to authenticated;
grant execute on function private.has_intergroup_permission(uuid,uuid) to authenticated;
grant execute on function private.can_pair_message(uuid,uuid) to authenticated;
grant execute on function private.my_age_status() to authenticated;
grant execute on function private.confirm_my_age(date) to authenticated;
grant execute on function private.request_intergroup_message(uuid) to authenticated;
grant execute on function private.reset_member_age_confirmation(uuid) to authenticated;

revoke all on function public.get_my_age_status() from public,anon;
revoke all on function public.confirm_my_age(date) from public,anon;
revoke all on function public.get_member_age_group(uuid) from public,anon;
revoke all on function public.request_intergroup_message(uuid) from public,anon;
revoke all on function public.admin_get_age_groups(uuid[]) from public,anon;
revoke all on function public.reset_member_age_confirmation(uuid) from public,anon;
grant execute on function public.get_my_age_status() to authenticated;
grant execute on function public.confirm_my_age(date) to authenticated;
grant execute on function public.get_member_age_group(uuid) to authenticated;
grant execute on function public.request_intergroup_message(uuid) to authenticated;
grant execute on function public.admin_get_age_groups(uuid[]) to authenticated;
grant execute on function public.reset_member_age_confirmation(uuid) to authenticated;

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id=(select auth.uid())
    and is_admin_message=false
    and (select private.is_conversation_member(conversation_id))
    and (select private.can_send_message(conversation_id))
    and not (select private.is_message_restricted((select auth.uid())))
    and (reply_to_id is null or (select private.reply_target_is_in_conversation(reply_to_id,conversation_id)))
    and (attachment_path is null or split_part(attachment_path,'/',1)=conversation_id::text)
    and (forwarded_from_id is null or (select private.forwarded_message_is_accessible(forwarded_from_id)))
  );

drop policy if exists "Senders can edit their own message text" on public.messages;
create policy "Senders can edit their own message text"
  on public.messages for update to authenticated
  using (
    sender_id=(select auth.uid())
    and is_admin_message=false
    and (select private.is_conversation_member(conversation_id))
    and (select private.can_send_message(conversation_id))
    and not (select private.is_message_restricted((select auth.uid())))
  )
  with check (
    sender_id=(select auth.uid())
    and is_admin_message=false
    and (select private.is_conversation_member(conversation_id))
    and (select private.can_send_message(conversation_id))
    and not (select private.is_message_restricted((select auth.uid())))
    and (attachment_path is null or split_part(attachment_path,'/',1)=conversation_id::text)
  );

drop policy if exists "Signed-in users can view profiles" on public.profiles;
drop policy if exists "Signed-in users can view eligible profiles" on public.profiles;
create policy "Signed-in users can view eligible profiles"
  on public.profiles for select to authenticated
  using (id=(select auth.uid()) or (select private.is_feedback_admin()) or private.is_age_eligible(id));

alter table public.admin_action_logs drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs add constraint admin_action_logs_action_check
  check (action in (
    'profile_updated','user_banned','user_unbanned','user_deleted','message_reported_user',
    'report_status_updated','account_approval_approved','account_approval_declined','account_approval_revoked',
    'admin_direct_message_sent','messaging_restricted','messaging_restriction_removed',
    'intergroup_request_approved','intergroup_request_declined','intergroup_permission_revoked','age_confirmation_reset'
  ));

do $publication$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='intergroup_message_requests') then
    alter publication supabase_realtime add table public.intergroup_message_requests;
  end if;
end
$publication$;

notify pgrst,'reload schema';
