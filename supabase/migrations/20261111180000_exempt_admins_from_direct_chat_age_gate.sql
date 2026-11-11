-- Exempt Gather Admin accounts from member age-verification checks
-- when sending direct chat requests. Non-admin accounts still require
-- eligible age confirmation, and non-admin cross-group pairs still require
-- their pair-specific Admin approval.

create or replace function private.send_direct_chat_request(p_recipient_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_me uuid:=(select auth.uid());
  v_request_id uuid;
  v_status text;
  v_conversation_id uuid;
  v_my_group text;
  v_other_group text;
  v_me_admin boolean;
  v_recipient_admin boolean;
begin
  if v_me is null then raise exception 'You must be signed in to send a chat request.'; end if;
  if p_recipient_id is null or p_recipient_id=v_me then raise exception 'Choose another member.'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_recipient_id) then raise exception 'That member could not be found.'; end if;
  if private.users_are_blocked(v_me,p_recipient_id) then return jsonb_build_object('status','blocked'); end if;

  v_me_admin:=private.is_gather_admin_user(v_me);
  v_recipient_admin:=private.is_gather_admin_user(p_recipient_id);
  v_my_group:=private.member_age_group(v_me);
  v_other_group:=private.member_age_group(p_recipient_id);

  -- Gather Admin accounts do not submit member age verification.
  -- Every non-admin account in the pair must still have an eligible age group.
  if (v_my_group is null and not v_me_admin)
     or (v_other_group is null and not v_recipient_admin) then
    return jsonb_build_object('status','age_verification_required');
  end if;

  -- Admin involvement is exempt from member-to-member age-group matching.
  if not v_me_admin and not v_recipient_admin
     and v_my_group<>v_other_group
     and not private.has_intergroup_permission(v_me,p_recipient_id) then
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
