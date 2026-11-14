-- Prevent duplicate direct conversations for a pair of users.
-- All direct-chat creation paths use the same transaction-scoped advisory lock.

create or replace function private.send_direct_chat_request(p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_request_id uuid;
  v_status text;
  v_conversation_id uuid;
  v_my_group text;
  v_other_group text;
  v_lock_first text;
  v_lock_second text;
begin
  if v_me is null then raise exception 'You must be signed in to send a chat request.'; end if;
  if p_recipient_id is null or p_recipient_id=v_me then raise exception 'Choose another member.'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_recipient_id) then raise exception 'That member could not be found.'; end if;
  if private.users_are_blocked(v_me,p_recipient_id) then return jsonb_build_object('status','blocked'); end if;

  v_my_group:=private.member_age_group(v_me);
  v_other_group:=private.member_age_group(p_recipient_id);
  if v_my_group is null or v_other_group is null then return jsonb_build_object('status','age_verification_required'); end if;
  if v_my_group<>v_other_group and not private.has_intergroup_permission(v_me,p_recipient_id) then
    return jsonb_build_object('status','intergroup_approval_required');
  end if;

  v_lock_first:=case when v_me::text<p_recipient_id::text then v_me::text else p_recipient_id::text end;
  v_lock_second:=case when v_me::text<p_recipient_id::text then p_recipient_id::text else v_me::text end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_lock_first),pg_catalog.hashtext(v_lock_second));

  select c.id into v_conversation_id
  from public.conversations c
  where c.kind='direct'
    and coalesce(c.admin_initiated,false)=false
    and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_me)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=p_recipient_id)
  order by c.updated_at desc,c.created_at asc
  limit 1;
  if v_conversation_id is not null then return jsonb_build_object('status','existing','conversation_id',v_conversation_id); end if;

  select r.id into v_request_id
  from public.conversation_requests r
  where r.sender_id=p_recipient_id and r.recipient_id=v_me and r.status='pending'
  limit 1;
  if v_request_id is not null then return jsonb_build_object('status','incoming','request_id',v_request_id); end if;

  insert into public.conversation_requests(sender_id,recipient_id)
  values(v_me,p_recipient_id)
  on conflict(sender_id,recipient_id) do update
    set status='pending',conversation_id=null,responded_at=null,created_at=now()
    where public.conversation_requests.status='declined'
       or (public.conversation_requests.status='accepted' and public.conversation_requests.conversation_id is null)
  returning id into v_request_id;

  if v_request_id is null then
    select r.id,r.status into v_request_id,v_status
    from public.conversation_requests r
    where r.sender_id=v_me and r.recipient_id=p_recipient_id;
    return jsonb_build_object('status',coalesce(v_status,'pending'),'request_id',v_request_id);
  end if;
  return jsonb_build_object('status','pending','request_id',v_request_id);
end;
$function$;

create or replace function private.respond_to_direct_chat_request(p_request_id uuid,p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_sender_id uuid;
  v_status text;
  v_conversation_id uuid;
  v_lock_first text;
  v_lock_second text;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  select r.sender_id into v_sender_id
  from public.conversation_requests r
  where r.id=p_request_id and r.recipient_id=v_me;
  if v_sender_id is null then raise exception 'That chat request was not found.'; end if;

  v_lock_first:=case when v_me::text<v_sender_id::text then v_me::text else v_sender_id::text end;
  v_lock_second:=case when v_me::text<v_sender_id::text then v_sender_id::text else v_me::text end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_lock_first),pg_catalog.hashtext(v_lock_second));

  select r.status into v_status
  from public.conversation_requests r
  where r.id=p_request_id and r.recipient_id=v_me
  for update;
  if v_status is null then raise exception 'That chat request was not found.'; end if;
  if v_status<>'pending' then raise exception 'This chat request has already been handled.'; end if;

  if not coalesce(p_accept,false) then
    update public.conversation_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','declined');
  end if;
  if private.users_are_blocked(v_me,v_sender_id) then
    update public.conversation_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','blocked');
  end if;
  if not private.can_pair_message(v_me,v_sender_id) then
    return jsonb_build_object('status','intergroup_approval_required');
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.kind='direct'
    and coalesce(c.admin_initiated,false)=false
    and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_me)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_sender_id)
  order by c.updated_at desc,c.created_at asc
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.conversations(kind,title,created_by) values('direct',null,v_me)
    returning id into v_conversation_id;
    insert into public.conversation_members(conversation_id,user_id,role)
    values(v_conversation_id,v_me,'owner'),(v_conversation_id,v_sender_id,'member');
  end if;

  update public.conversation_requests
  set status='accepted',conversation_id=v_conversation_id,responded_at=now()
  where id=p_request_id;
  return jsonb_build_object('status','accepted','conversation_id',v_conversation_id);
end;
$function$;

create or replace function private.respond_to_friend_request(p_request_id uuid,p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_sender_id uuid;
  v_status text;
  v_conversation_id uuid;
  v_lock_first text;
  v_lock_second text;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  select r.sender_id into v_sender_id
  from public.friend_requests r
  where r.id=p_request_id and r.recipient_id=v_me;
  if v_sender_id is null then raise exception 'That friend request was not found.'; end if;

  v_lock_first:=case when v_me::text<v_sender_id::text then v_me::text else v_sender_id::text end;
  v_lock_second:=case when v_me::text<v_sender_id::text then v_sender_id::text else v_me::text end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_lock_first),pg_catalog.hashtext(v_lock_second));

  select r.status into v_status
  from public.friend_requests r
  where r.id=p_request_id and r.recipient_id=v_me
  for update;
  if v_status is null then raise exception 'That friend request was not found.'; end if;
  if v_status<>'pending' then raise exception 'This friend request has already been handled.'; end if;

  if not coalesce(p_accept,false) then
    update public.friend_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','declined');
  end if;
  if private.users_are_blocked(v_me,v_sender_id) then
    update public.friend_requests set status='declined',responded_at=now() where id=p_request_id;
    return jsonb_build_object('status','blocked');
  end if;

  insert into public.friendships(user_id,friend_id)
  values(v_me,v_sender_id),(v_sender_id,v_me)
  on conflict(user_id,friend_id) do nothing;

  if private.can_pair_message(v_me,v_sender_id) then
    select c.id into v_conversation_id
    from public.conversations c
    where c.kind='direct'
      and coalesce(c.admin_initiated,false)=false
      and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_me)
      and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_sender_id)
    order by c.updated_at desc,c.created_at asc
    limit 1
    for update;

    if v_conversation_id is null then
      insert into public.conversations(kind,title,created_by) values('direct',null,v_me)
      returning id into v_conversation_id;
      insert into public.conversation_members(conversation_id,user_id,role)
      values(v_conversation_id,v_me,'owner'),(v_conversation_id,v_sender_id,'member');
    end if;
  end if;

  update public.friend_requests set status='accepted',responded_at=now() where id=p_request_id;
  update public.friend_requests
  set status='accepted',responded_at=now()
  where sender_id=v_me and recipient_id=v_sender_id and status='pending';
  return jsonb_build_object('status','accepted','conversation_id',v_conversation_id);
end;
$function$;

-- Keep the Admin RPC on the same pair-lock convention as regular direct chats.
create or replace function private.admin_send_direct_message(p_user_id uuid,p_body text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body,''));
  v_conversation_id uuid;
  v_message_id uuid;
  v_lock_first text;
  v_lock_second text;
begin
  if v_admin_id is null or not private.is_feedback_admin() then
    raise exception using errcode='42501',message='Only Gather Admin can send admin direct messages.';
  end if;
  if p_user_id is null or p_user_id=v_admin_id then
    raise exception using errcode='22023',message='Choose another member account.';
  end if;
  if char_length(v_body)<1 or char_length(v_body)>4000 then
    raise exception using errcode='22023',message='The message must be between 1 and 4,000 characters.';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then
    raise exception using errcode='P0002',message='That member account could not be found.';
  end if;
  if private.is_blocked_between(v_admin_id,p_user_id) then
    raise exception using errcode='42501',message='This member cannot be contacted because a block is in place between the accounts.';
  end if;

  v_lock_first:=case when v_admin_id::text<p_user_id::text then v_admin_id::text else p_user_id::text end;
  v_lock_second:=case when v_admin_id::text<p_user_id::text then p_user_id::text else v_admin_id::text end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_lock_first),pg_catalog.hashtext(v_lock_second));

  select c.id into v_conversation_id
  from public.conversations c
  where c.kind='direct'
    and (coalesce(c.admin_initiated,false)=false or c.created_by=v_admin_id)
    and (select count(*) from public.conversation_members cm where cm.conversation_id=c.id)=2
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_admin_id)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=p_user_id)
  order by (c.admin_initiated=true and c.created_by=v_admin_id) desc,c.updated_at desc
  limit 1
  for update;

  if v_conversation_id is null then
    insert into public.conversations(kind,created_by,admin_initiated)
    values('direct',v_admin_id,true)
    returning id into v_conversation_id;
    insert into public.conversation_members(conversation_id,user_id,role)
    values(v_conversation_id,v_admin_id,'member'),(v_conversation_id,p_user_id,'member');
  else
    update public.conversations
    set admin_initiated=true,created_by=v_admin_id,updated_at=now()
    where id=v_conversation_id and admin_initiated=false;
  end if;

  insert into public.messages(conversation_id,sender_id,body,is_admin_message)
  values(v_conversation_id,v_admin_id,v_body,true)
  returning id into v_message_id;
  update public.conversations set updated_at=now() where id=v_conversation_id;

  insert into public.admin_action_logs(actor_id,target_user_id,action,details)
  values(v_admin_id,p_user_id,'admin_direct_message_sent',
    jsonb_build_object('conversation_id',v_conversation_id,'message_id',v_message_id,'reused_existing_conversation',true));

  return jsonb_build_object('conversation_id',v_conversation_id,'message_id',v_message_id);
end;
$function$;

-- Remove only empty duplicate direct threads. Keep the most active conversation
-- for each user pair, and relink any requests or notifications before deletion.
do $cleanup$
declare
  v_duplicate record;
  v_deleted integer;
begin
  for v_duplicate in
    with direct_chats as (
      select c.id,c.created_at,c.updated_at,
        array_agg(cm.user_id order by cm.user_id) as member_pair,
        (select count(*) from public.messages m where m.conversation_id=c.id) as message_count
      from public.conversations c
      join public.conversation_members cm on cm.conversation_id=c.id
      where c.kind='direct' and coalesce(c.admin_initiated,false)=false
      group by c.id,c.created_at,c.updated_at
      having count(*)=2
    ),
    ranked as (
      select id,message_count,
        first_value(id) over(partition by member_pair order by message_count desc,updated_at desc,created_at asc,id asc) as keep_id,
        row_number() over(partition by member_pair order by message_count desc,updated_at desc,created_at asc,id asc) as row_number
      from direct_chats
    )
    select id,keep_id from ranked where row_number>1 and message_count=0
  loop
    update public.conversation_requests set conversation_id=v_duplicate.keep_id
    where conversation_id=v_duplicate.id;
    update public.notifications set conversation_id=v_duplicate.keep_id
    where conversation_id=v_duplicate.id;
    update public.conversations
    set updated_at=greatest(updated_at,(select c2.updated_at from public.conversations c2 where c2.id=v_duplicate.id))
    where id=v_duplicate.keep_id;

    delete from public.conversations c
    where c.id=v_duplicate.id
      and c.kind='direct'
      and coalesce(c.admin_initiated,false)=false
      and not exists(select 1 from public.messages m where m.conversation_id=c.id);
    get diagnostics v_deleted=row_count;
    if v_deleted<>1 then raise exception 'Could not safely remove an empty duplicate direct conversation.'; end if;
  end loop;
end;
$cleanup$;
