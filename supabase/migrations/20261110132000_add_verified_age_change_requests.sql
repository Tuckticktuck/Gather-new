create table if not exists public.age_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_birth_date date not null,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists age_change_requests_user_submitted_idx
  on public.age_change_requests(user_id, submitted_at desc);
create unique index if not exists age_change_requests_one_pending_per_user
  on public.age_change_requests(user_id) where status='pending';
alter table public.age_change_requests enable row level security;
revoke all on public.age_change_requests from anon, authenticated;
grant all on public.age_change_requests to service_role;

create or replace function private.request_my_age_change(p_new_birth_date date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_birth_date date;
  v_proposed_group text;
  v_current_group text;
begin
  if v_user_id is null then raise exception 'Sign in to request an age correction.'; end if;
  select birth_date into v_current_birth_date
  from private.member_age_records where user_id=v_user_id;
  if not found then raise exception 'Add and confirm your age first.'; end if;
  if p_new_birth_date is null or p_new_birth_date > current_date then
    raise exception 'Enter a valid date of birth that is not in the future.';
  end if;
  if p_new_birth_date = v_current_birth_date then
    raise exception 'That date of birth is already saved.';
  end if;
  v_current_group := private.member_age_group(v_user_id);
  v_proposed_group := case
    when extract(year from age(current_date,p_new_birth_date)) between 12 and 14 then '12-14'
    when extract(year from age(current_date,p_new_birth_date)) between 15 and 18 then '15-18'
    else null
  end;
  if v_current_group is null then
    raise exception 'This account does not currently have an eligible age confirmation. Contact Gather Admin for help.';
  end if;
  if v_proposed_group is null then
    raise exception 'Age corrections must keep the account within Gather’s supported age range of 12–18. Contact Gather Admin if this is not correct.';
  end if;
  if exists(select 1 from public.age_change_requests where user_id=v_user_id and status='pending') then
    raise exception 'You already have an age correction awaiting Admin review.';
  end if;
  insert into public.age_change_requests(user_id,requested_birth_date)
  values(v_user_id,p_new_birth_date);
  return jsonb_build_object('success',true,'status','pending','current_age_group',v_current_group,'proposed_age_group',v_proposed_group);
end;
$$;

create or replace function private.my_age_change_status()
returns jsonb language sql security definer set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
      'status',r.status,
      'submitted_at',r.submitted_at,
      'reviewed_at',r.reviewed_at,
      'proposed_age_group',
        case
          when extract(year from age(current_date,r.requested_birth_date)) between 12 and 14 then '12-14'
          when extract(year from age(current_date,r.requested_birth_date)) between 15 and 18 then '15-18'
          else null
        end
    )
    from public.age_change_requests r
    where r.user_id=auth.uid()
    order by r.submitted_at desc
    limit 1),
    '{}'::jsonb
  );
$$;

create or replace function private.admin_list_age_change_requests()
returns table (
  request_id uuid,
  user_id uuid,
  submitted_at timestamptz,
  current_age_group text,
  proposed_age_group text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_gather_admin_user(auth.uid()) then
    raise exception 'Gather Admin access is required.';
  end if;
  return query
  select r.id,r.user_id,r.submitted_at,
    private.member_age_group(r.user_id),
    case
      when extract(year from age(current_date,r.requested_birth_date)) between 12 and 14 then '12-14'
      when extract(year from age(current_date,r.requested_birth_date)) between 15 and 18 then '15-18'
      else null
    end
  from public.age_change_requests r
  where r.status='pending'
  order by r.submitted_at asc
  limit 200;
end;
$$;

create or replace function private.admin_review_age_change_request(p_request_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.age_change_requests%rowtype;
  v_old_group text;
  v_new_group text;
begin
  if v_actor is null or not private.is_gather_admin_user(v_actor) then
    raise exception 'Gather Admin access is required.';
  end if;
  select * into v_request
  from public.age_change_requests
  where id=p_request_id and status='pending'
  for update;
  if not found then raise exception 'That age correction is no longer awaiting review.'; end if;
  v_old_group := private.member_age_group(v_request.user_id);
  v_new_group := case
    when extract(year from age(current_date,v_request.requested_birth_date)) between 12 and 14 then '12-14'
    when extract(year from age(current_date,v_request.requested_birth_date)) between 15 and 18 then '15-18'
    else null
  end;
  if v_new_group is null then raise exception 'That age correction is outside Gather’s supported age range.'; end if;
  if p_approve then
    update private.member_age_records
      set birth_date=v_request.requested_birth_date, confirmed_at=now()
      where user_id=v_request.user_id;
    if not found then raise exception 'The member’s current age record could not be found.'; end if;
  end if;
  update public.age_change_requests
    set status=case when p_approve then 'approved' else 'declined' end,
        reviewed_at=now(),reviewed_by=v_actor
    where id=v_request.id;
  insert into public.admin_action_logs(actor_id,target_user_id,action,details)
  values(v_actor,v_request.user_id,
    case when p_approve then 'age_change_approved' else 'age_change_declined' end,
    jsonb_build_object('request_id',v_request.id,'previous_age_group',v_old_group,'proposed_age_group',v_new_group));
  return jsonb_build_object('success',true,'status',case when p_approve then 'approved' else 'declined' end,
    'user_id',v_request.user_id,'age_group',case when p_approve then v_new_group else v_old_group end);
end;
$$;

create or replace function public.request_my_age_change(p_new_birth_date date)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.request_my_age_change(p_new_birth_date); $$;
create or replace function public.get_my_age_change_status()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.my_age_change_status(); $$;
create or replace function public.admin_list_age_change_requests()
returns table (
  request_id uuid,user_id uuid,submitted_at timestamptz,current_age_group text,proposed_age_group text
)
language sql security invoker set search_path = ''
as $$ select * from private.admin_list_age_change_requests(); $$;
create or replace function public.admin_review_age_change_request(p_request_id uuid,p_approve boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.admin_review_age_change_request(p_request_id,p_approve); $$;

revoke all on function private.request_my_age_change(date) from public,anon,authenticated;
revoke all on function private.my_age_change_status() from public,anon,authenticated;
revoke all on function private.admin_list_age_change_requests() from public,anon,authenticated;
revoke all on function private.admin_review_age_change_request(uuid,boolean) from public,anon,authenticated;
revoke all on function public.request_my_age_change(date) from public,anon;
revoke all on function public.get_my_age_change_status() from public,anon;
revoke all on function public.admin_list_age_change_requests() from public,anon;
revoke all on function public.admin_review_age_change_request(uuid,boolean) from public,anon;
grant execute on function public.request_my_age_change(date) to authenticated;
grant execute on function public.get_my_age_change_status() to authenticated;
grant execute on function public.admin_list_age_change_requests() to authenticated;
grant execute on function public.admin_review_age_change_request(uuid,boolean) to authenticated;

alter table public.admin_action_logs drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs add constraint admin_action_logs_action_check
check (action = any (array[
  'profile_updated','user_banned','user_unbanned','user_deleted','message_reported_user',
  'report_status_updated','account_approval_approved','account_approval_declined',
  'account_approval_revoked','admin_direct_message_sent','messaging_restricted',
  'messaging_restriction_removed','intergroup_request_approved','intergroup_request_declined',
  'intergroup_permission_revoked','age_confirmation_reset','age_change_approved','age_change_declined'
]));
