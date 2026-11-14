drop policy if exists "Members can view their own account approval requests" on public.account_approval_requests;
create policy "Members can view their own account approval requests"
  on public.account_approval_requests for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) = false
  );

drop policy if exists "Members can submit their own pending approval requests" on public.account_approval_requests;
create policy "Members can submit their own pending approval requests"
  on public.account_approval_requests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) = false
    and (((select auth.jwt())->'app_metadata'->>'gather_role') is distinct from 'admin')
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and review_note = ''
  );

revoke select on table public.approved_accounts from authenticated;
grant select (user_id) on table public.approved_accounts to authenticated;

drop policy if exists "Signed-in members can view approved account badges" on public.approved_accounts;
create policy "Signed-in members can view approved account badges"
  on public.approved_accounts for select to authenticated
  using (
    (select auth.uid()) is not null
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) = false
  );
