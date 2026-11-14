-- Allow each authenticated member to permanently dismiss only their own notifications.
-- The recipient predicate is enforced by Postgres RLS, not client-side filtering.
grant delete on public.notifications to authenticated;

create policy "Members can delete their own notifications"
on public.notifications
for delete
to authenticated
using ((select auth.uid()) = recipient_id);
