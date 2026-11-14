alter table public.conversations
  add column if not exists description text
  check (description is null or char_length(description) <= 280);

alter table public.messages
  add column if not exists reply_to_id uuid
  references public.messages(id) on delete set null;

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
    and (select private.can_send_message(conversation_id))
    and (
      reply_to_id is null
      or exists (
        select 1 from public.messages parent
        where parent.id = messages.reply_to_id
          and parent.conversation_id = messages.conversation_id
      )
    )
  );

create index if not exists messages_conversation_created_id_idx
  on public.messages(conversation_id, created_at desc, id desc);

create table public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  constraint message_reads_pkey primary key (message_id,user_id)
);

create index message_reads_conversation_idx
  on public.message_reads(conversation_id, message_id);

alter table public.message_reads enable row level security;
revoke all on public.message_reads from public, anon, authenticated;
grant select, insert on public.message_reads to authenticated;

create policy "Members can view read receipts in their conversations"
  on public.message_reads for select to authenticated
  using ((select private.is_conversation_member(conversation_id)));

create policy "Members can mark messages as read for themselves"
  on public.message_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
    and exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
        and m.conversation_id = message_reads.conversation_id
        and m.sender_id <> (select auth.uid())
    )
  );

create or replace function private.update_group_settings(p_conversation_id uuid,p_title text,p_description text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_title text := nullif(btrim(p_title), '');
  v_description text := nullif(btrim(p_description), '');
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if v_title is null or char_length(v_title) > 60 then raise exception 'Group names must be between 1 and 60 characters.'; end if;
  if v_description is not null and char_length(v_description) > 280 then raise exception 'Group descriptions must be 280 characters or fewer.'; end if;
  if not exists (select 1 from public.conversations c where c.id=p_conversation_id and c.kind='group') then raise exception 'That group could not be found.'; end if;
  if not private.is_conversation_admin(p_conversation_id) then raise exception 'Only a group owner can change group settings.'; end if;
  update public.conversations set title=v_title,description=v_description,updated_at=now() where id=p_conversation_id;
  return jsonb_build_object('status','updated');
end;
$function$;

create or replace function private.remove_group_member(p_conversation_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_removed integer;
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_user_id is null or p_user_id=v_me then raise exception 'Choose another group member to remove.'; end if;
  if not exists (select 1 from public.conversations c where c.id=p_conversation_id and c.kind='group') then raise exception 'That group could not be found.'; end if;
  if not private.is_conversation_admin(p_conversation_id) then raise exception 'Only a group owner can manage members.'; end if;
  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=p_user_id and role='member';
  get diagnostics v_removed=row_count;
  if v_removed=0 then raise exception 'That member is not removable. Group owners must transfer ownership before they can be removed.'; end if;
  return jsonb_build_object('status','removed');
end;
$function$;

create or replace function private.transfer_group_ownership(p_conversation_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'You must be signed in.'; end if;
  if p_user_id is null or p_user_id=v_me then raise exception 'Choose another member to become the group owner.'; end if;
  if not exists (select 1 from public.conversations c where c.id=p_conversation_id and c.kind='group') then raise exception 'That group could not be found.'; end if;
  if not private.is_conversation_admin(p_conversation_id) then raise exception 'Only a group owner can transfer ownership.'; end if;
  if not exists (select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=p_user_id and cm.role='member') then raise exception 'Choose an existing group member.'; end if;
  update public.conversation_members set role='member' where conversation_id=p_conversation_id and user_id=v_me and role='owner';
  update public.conversation_members set role='owner' where conversation_id=p_conversation_id and user_id=p_user_id and role='member';
  update public.conversations set created_by=p_user_id,updated_at=now() where id=p_conversation_id;
  return jsonb_build_object('status','transferred','new_owner_id',p_user_id);
end;
$function$;

create or replace function public.update_group_settings(uuid,text,text)
returns jsonb language sql set search_path = ''
as $function$ select private.update_group_settings($1,$2,$3); $function$;
create or replace function public.remove_group_member(uuid,uuid)
returns jsonb language sql set search_path = ''
as $function$ select private.remove_group_member($1,$2); $function$;
create or replace function public.transfer_group_ownership(uuid,uuid)
returns jsonb language sql set search_path = ''
as $function$ select private.transfer_group_ownership($1,$2); $function$;

revoke all on function private.update_group_settings(uuid,text,text) from public,anon;
revoke all on function private.remove_group_member(uuid,uuid) from public,anon;
revoke all on function private.transfer_group_ownership(uuid,uuid) from public,anon;
grant execute on function private.update_group_settings(uuid,text,text) to authenticated;
grant execute on function private.remove_group_member(uuid,uuid) to authenticated;
grant execute on function private.transfer_group_ownership(uuid,uuid) to authenticated;
revoke all on function public.update_group_settings(uuid,text,text) from public,anon;
revoke all on function public.remove_group_member(uuid,uuid) from public,anon;
revoke all on function public.transfer_group_ownership(uuid,uuid) from public,anon;
grant execute on function public.update_group_settings(uuid,text,text) to authenticated;
grant execute on function public.remove_group_member(uuid,uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid,uuid) to authenticated;

drop policy if exists "Gather members can receive private chat presence" on realtime.messages;
drop policy if exists "Gather members can send private chat presence" on realtime.messages;
create policy "Gather members can receive private chat presence"
  on realtime.messages for select to authenticated
  using (
    extension in ('presence','broadcast')
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id=substring((select realtime.topic()) from '^gather-chat:([0-9a-fA-F-]{36})$')::uuid
        and cm.user_id=(select auth.uid())
    )
  );
create policy "Gather members can send private chat presence"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('presence','broadcast')
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id=substring((select realtime.topic()) from '^gather-chat:([0-9a-fA-F-]{36})$')::uuid
        and cm.user_id=(select auth.uid())
    )
  );

do $publish$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_reads') then
    execute 'alter publication supabase_realtime add table public.message_reads';
  end if;
end;
$publish$;
