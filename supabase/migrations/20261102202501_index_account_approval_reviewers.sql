create index if not exists account_approval_requests_reviewed_by_idx
  on public.account_approval_requests(reviewed_by);
create index if not exists approved_accounts_approved_by_idx
  on public.approved_accounts(approved_by);
