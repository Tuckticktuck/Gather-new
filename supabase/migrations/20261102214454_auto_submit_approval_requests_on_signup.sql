create or replace function public.enqueue_account_approval_request_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Anonymous sessions and administrators are not candidates for member approval.
  if coalesce(new.is_anonymous, false)
     or coalesce(new.raw_app_meta_data ->> 'gather_role', '') = 'admin' then
    return new;
  end if;

  -- New accounts automatically enter the admin review queue.
  -- The partial unique index keeps this safe if the operation is retried.
  insert into public.account_approval_requests (user_id)
  values (new.id)
  on conflict (user_id) where status = 'pending' do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_account_approval_request_on_signup() from public;
revoke all on function public.enqueue_account_approval_request_on_signup() from anon, authenticated;
grant execute on function public.enqueue_account_approval_request_on_signup() to supabase_auth_admin;

drop trigger if exists gather_enqueue_account_approval_on_signup on auth.users;
create trigger gather_enqueue_account_approval_on_signup
after insert on auth.users
for each row
execute function public.enqueue_account_approval_request_on_signup();
