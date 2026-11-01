alter table public.conversation_members
  drop constraint if exists conversation_members_role_check;
alter table public.conversation_members
  add constraint conversation_members_role_check
  check (role in ('owner','moderator','member'));

create or replace function private.is_conversation_manager(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id=p_conversation_id
      and cm.user_id=(select auth.uid())
      and cm.role in ('owner','moderator')
  );
$function$;
revoke all on function private.is_conversation_manager(uuid) from public,anon;
grant execute on function private.is_conversation_manager(uuid) to authenticated;

create or replace function private.can_add_conversation_member(p_conversation_id uuid,p_user_id uuid,p_role text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.conversations c
    where c.id=p_conversation_id and (
      (p_user_id=(select auth.uid()) and p_role='owner' and c.created_by=(select auth.uid())
       and not exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id))
      or
      (p_user_id<>(select auth.uid()) and p_role='member' and c.kind='group'
       and private.is_conversation_manager(c.id))
    )
  );
$function$;

create or replace function private.remove_group_member(p_conversation_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_me uuid:=(select auth.uid()); v_my_role text; v_target_role text; v_removed integer;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_user_id is null or p_user_id=v_me then raise exception 'Choose another group member to remove.'; end if;
  if not exists(select 1 from public.conversations c where c.id=p_conversation_id and c.kind='group') then
    raise exception 'That group could not be found.';
  end if;
  select cm.role into v_my_role from public.conversation_members cm
    where cm.conversation_id=p_conversation_id and cm.user_id=v_me;
  if coalesce(v_my_role,'') not in ('owner','moderator') then
    raise exception 'Only group owners and moderators can manage members.';
  end if;
  select cm.role into v_target_role from public.conversation_members cm
    where cm.conversation_id=p_conversation_id and cm.user_id=p_user_id;
  if v_target_role is null or v_target_role='owner' then raise exception 'Group owners cannot be removed.'; end if;
  if v_my_role='moderator' and v_target_role<>'member' then
    raise exception 'Moderators can only remove regular members.';
  end if;
  delete from public.conversation_members
    where conversation_id=p_conversation_id and user_id=p_user_id and role=v_target_role;
  get diagnostics v_removed=row_count;
  if v_removed=0 then raise exception 'That member could not be removed.'; end if;
  return jsonb_build_object('status','removed');
end;
$function$;

create or replace function private.update_group_settings(p_conversation_id uuid,p_title text,p_description text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_me uuid:=(select auth.uid()); v_title text:=nullif(btrim(p_title),''); v_description text:=nullif(btrim(p_description),'');
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if v_title is null or char_length(v_title)>60 then raise exception 'Group names must be between 1 and 60 characters.'; end if;
  if v_description is not null and char_length(v_description)>280 then raise exception 'Group descriptions must be 280 characters or fewer.'; end if;
  if not exists(select 1 from public.conversations c where c.id=p_conversation_id and c.kind='group') then
    raise exception 'That group could not be found.';
  end if;
  if not private.is_conversation_manager(p_conversation_id) then
    raise exception 'Only group owners and moderators can change group settings.';
  end if;
  update public.conversations set title=v_title,description=v_description,updated_at=now() where id=p_conversation_id;
  return jsonb_build_object('status','updated');
end;
$function$;

create or replace function private.set_group_member_role(p_conversation_id uuid,p_user_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_me uuid:=(select auth.uid()); v_updated integer;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_user_id is null or p_user_id=v_me then raise exception 'Choose another group member.'; end if;
  if p_role not in ('member','moderator') then
    raise exception 'Only regular member and moderator roles can be assigned here.';
  end if;
  if not exists(select 1 from public.conversations c where c.id=p_conversation_id and c.kind='group') then
    raise exception 'That group could not be found.';
  end if;
  if not exists(select 1 from public.conversation_members cm
    where cm.conversation_id=p_conversation_id and cm.user_id=v_me and cm.role='owner') then
    raise exception 'Only the group owner can assign moderator roles.';
  end if;
  update public.conversation_members set role=p_role
    where conversation_id=p_conversation_id and user_id=p_user_id and role in ('member','moderator');
  get diagnostics v_updated=row_count;
  if v_updated=0 then raise exception 'Choose an existing regular member or moderator.'; end if;
  return jsonb_build_object('status','updated','role',p_role);
end;
$function$;

create or replace function public.set_group_member_role(uuid,uuid,text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.set_group_member_role($1,$2,$3); $function$;
revoke all on function private.set_group_member_role(uuid,uuid,text) from public,anon;
grant execute on function private.set_group_member_role(uuid,uuid,text) to authenticated;
revoke all on function public.set_group_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_group_member_role(uuid,uuid,text) to authenticated;

drop policy if exists "Members can leave or owners can remove members" on public.conversation_members;
drop policy if exists "Members can leave or managers can remove members" on public.conversation_members;
create policy "Members can leave or managers can remove members"
  on public.conversation_members for delete to authenticated
  using (
    (user_id=(select auth.uid()) and role='member')
    or (user_id<>(select auth.uid()) and role='member'
        and (select private.is_conversation_manager(conversation_id)))
  );

create or replace function private.get_my_unread_counts()
returns table(conversation_id uuid,unread_count bigint)
language sql stable security definer set search_path = ''
as $function$
  select m.conversation_id,count(*)::bigint
  from public.messages m
  join public.conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=(select auth.uid())
  left join public.message_reads mr on mr.message_id=m.id and mr.user_id=(select auth.uid())
  left join public.user_deleted_messages udm on udm.message_id=m.id and udm.user_id=(select auth.uid())
  where (select auth.uid()) is not null and m.sender_id<>(select auth.uid())
    and mr.message_id is null and udm.message_id is null
  group by m.conversation_id;
$function$;

create or replace function private.mark_conversation_read(p_conversation_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $function$
declare v_me uuid:=(select auth.uid()); v_inserted integer;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if not private.is_conversation_member(p_conversation_id) then
    raise exception 'You are not a member of this conversation.';
  end if;
  with inserted as (
    insert into public.message_reads(message_id,conversation_id,user_id)
    select m.id,m.conversation_id,v_me
    from public.messages m
    where m.conversation_id=p_conversation_id and m.sender_id<>v_me
      and not exists(select 1 from public.message_reads mr where mr.message_id=m.id and mr.user_id=v_me)
      and not exists(select 1 from public.user_deleted_messages udm where udm.message_id=m.id and udm.user_id=v_me)
    on conflict(message_id,user_id) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from inserted;
  return v_inserted;
end;
$function$;

create or replace function public.get_my_unread_counts()
returns table(conversation_id uuid,unread_count bigint)
language sql security invoker set search_path = ''
as $function$ select * from private.get_my_unread_counts(); $function$;

create or replace function public.mark_conversation_read(uuid)
returns integer language sql security invoker set search_path = ''
as $function$ select private.mark_conversation_read($1); $function$;

revoke all on function private.get_my_unread_counts() from public,anon;
grant execute on function private.get_my_unread_counts() to authenticated;
revoke all on function private.mark_conversation_read(uuid) from public,anon;
grant execute on function private.mark_conversation_read(uuid) to authenticated;
revoke all on function public.get_my_unread_counts() from public,anon;
grant execute on function public.get_my_unread_counts() to authenticated;
revoke all on function public.mark_conversation_read(uuid) from public,anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
