create table public.group_avatars (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  image_data text not null,
  updated_at timestamptz not null default now(),
  constraint group_avatars_image_size_check check (char_length(image_data) <= 500000),
  constraint group_avatars_jpeg_data_url_check check (
    image_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  )
);

alter table public.group_avatars enable row level security;

revoke all on public.group_avatars from public, anon, authenticated;
grant select, insert, update, delete on public.group_avatars to authenticated;

create policy "Group members can view group pictures"
  on public.group_avatars for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = group_avatars.conversation_id and c.kind = 'group'
    )
    and private.is_conversation_member(conversation_id)
  );

create policy "Group owners can add group pictures"
  on public.group_avatars for insert to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = group_avatars.conversation_id and c.kind = 'group'
    )
    and private.is_conversation_admin(conversation_id)
  );

create policy "Group owners can update group pictures"
  on public.group_avatars for update to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = group_avatars.conversation_id and c.kind = 'group'
    )
    and private.is_conversation_admin(conversation_id)
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = group_avatars.conversation_id and c.kind = 'group'
    )
    and private.is_conversation_admin(conversation_id)
  );

create policy "Group owners can remove group pictures"
  on public.group_avatars for delete to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = group_avatars.conversation_id and c.kind = 'group'
    )
    and private.is_conversation_admin(conversation_id)
  );
