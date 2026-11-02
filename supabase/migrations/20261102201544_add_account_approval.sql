create table public.account_approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null default '',
  status text not null default 'pending'
    check (status in ('pending','approved','declined','revoked')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text not null default '',
  constraint account_approval_message_length check (char_length(message) <= 500),
  constraint account_approval_review_note_length check (char_length(review_note) <= 500)
);

create index account_approval_requests_user_created_idx
  on public.account_approval_requests(user_id, created_at desc);
create index account_approval_requests_status_created_idx
  on public.account_approval_requests(status, created_at desc);
create unique index account_approval_one_pending_per_user_idx
  on public.account_approval_requests(user_id) where status = 'pending';

create table public.approved_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null
);
create index approved_accounts_approved_at_idx
  on public.approved_accounts(approved_at desc);

alter table public.account_approval_requests enable row level security;
alter table public.approved_accounts enable row level security;

revoke all on table public.account_approval_requests from anon, authenticated;
revoke all on table public.approved_accounts from anon, authenticated;
grant select, insert on table public.account_approval_requests to authenticated;
grant select on table public.approved_accounts to authenticated;
grant all on table public.account_approval_requests to service_role;
grant all on table public.approved_accounts to service_role;

create policy "Members can view their own account approval requests"
  on public.account_approval_requests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Members can submit their own pending approval requests"
  on public.account_approval_requests for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
    and review_note = ''
  );
create policy "Signed-in members can view approved account badges"
  on public.approved_accounts for select to authenticated
  using (true);

alter table public.admin_action_logs
  drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action = any (array[
    'profile_updated',
    'user_banned',
    'user_unbanned',
    'user_deleted',
    'message_reported_user',
    'report_status_updated',
    'account_approval_approved',
    'account_approval_declined',
    'account_approval_revoked'
  ]::text[]));
