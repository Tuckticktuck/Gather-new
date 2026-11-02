-- The privileged report-contact action now runs in the JWT-verified gather-admin Edge Function.
drop function if exists public.admin_message_reported_user(uuid, text);
