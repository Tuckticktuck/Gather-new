insert into public.account_approval_requests (user_id, message)
select u.id, ''
from auth.users as u
where coalesce(u.is_anonymous, false) = false
  and coalesce(u.raw_app_meta_data ->> 'gather_role', '') <> 'admin'
  and not exists (
    select 1
    from public.account_approval_requests as r
    where r.user_id = u.id
      and r.status = 'pending'
  )
on conflict (user_id) where status = 'pending' do nothing;
