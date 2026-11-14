create index if not exists admin_action_logs_actor_id_idx
  on public.admin_action_logs(actor_id) where actor_id is not null;

create index if not exists admin_bans_created_by_idx
  on public.admin_bans(created_by) where created_by is not null;
