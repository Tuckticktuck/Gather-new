alter table public.profiles
  add column if not exists preferences jsonb not null
    default '{"accent":"lavender","fontSize":"normal"}'::jsonb;

create table public.profile_avatars (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  image_data text not null,
  updated_at timestamptz not null default now(),
  constraint profile_avatars_image_size_check check (char_length(image_data) <= 500000),
  constraint profile_avatars_jpeg_data_url_check check (
    image_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  )
);

alter table public.profile_avatars enable row level security;

revoke all on public.profile_avatars from public, anon, authenticated;
grant select, insert, update, delete on public.profile_avatars to authenticated;

create policy "Signed-in Gather members can view profile pictures"
  on public.profile_avatars for select to authenticated
  using (true);

create policy "Users can add their own profile picture"
  on public.profile_avatars for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own profile picture"
  on public.profile_avatars for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can remove their own profile picture"
  on public.profile_avatars for delete to authenticated
  using (user_id = (select auth.uid()));
