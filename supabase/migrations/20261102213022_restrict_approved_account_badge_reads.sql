revoke select on table public.approved_accounts from authenticated;
revoke select (approved_at, approved_by) on table public.approved_accounts from authenticated;
grant select (user_id) on table public.approved_accounts to authenticated;
