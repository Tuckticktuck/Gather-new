-- Keep privileged multiplayer implementation in the private schema.
grant usage on schema private to authenticated;
alter function public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb) set schema private;
alter function public.gather_multiplayer_join(uuid,text) set schema private;
alter function public.gather_multiplayer_move(uuid,numeric,numeric) set schema private;
alter function public.gather_multiplayer_leave(uuid) set schema private;
alter function public.gather_multiplayer_end(uuid) set schema private;
alter function public.gather_multiplayer_update_state(uuid,bigint,jsonb) set schema private;
grant execute on function private.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb) to authenticated;
grant execute on function private.gather_multiplayer_join(uuid,text) to authenticated;
grant execute on function private.gather_multiplayer_move(uuid,numeric,numeric) to authenticated;
grant execute on function private.gather_multiplayer_leave(uuid) to authenticated;
grant execute on function private.gather_multiplayer_end(uuid) to authenticated;
grant execute on function private.gather_multiplayer_update_state(uuid,bigint,jsonb) to authenticated;
create or replace function public.gather_multiplayer_create(p_conversation_id uuid,p_game_type text,p_join_mode text,p_invited_user_ids uuid[] default '{}',p_settings jsonb default '{}'::jsonb,p_initial_state jsonb default '{}'::jsonb)
returns public.gather_multiplayer_games language sql security invoker set search_path='' as $$ select private.gather_multiplayer_create($1,$2,$3,$4,$5,$6) $$;
create or replace function public.gather_multiplayer_join(p_game_id uuid,p_color text)
returns public.gather_multiplayer_players language sql security invoker set search_path='' as $$ select private.gather_multiplayer_join($1,$2) $$;
create or replace function public.gather_multiplayer_move(p_game_id uuid,p_x numeric,p_y numeric)
returns jsonb language sql security invoker set search_path='' as $$ select private.gather_multiplayer_move($1,$2,$3) $$;
create or replace function public.gather_multiplayer_leave(p_game_id uuid)
returns boolean language sql security invoker set search_path='' as $$ select private.gather_multiplayer_leave($1) $$;
create or replace function public.gather_multiplayer_end(p_game_id uuid)
returns boolean language sql security invoker set search_path='' as $$ select private.gather_multiplayer_end($1) $$;
create or replace function public.gather_multiplayer_update_state(p_game_id uuid,p_expected_revision bigint,p_state jsonb)
returns public.gather_multiplayer_games language sql security invoker set search_path='' as $$ select private.gather_multiplayer_update_state($1,$2,$3) $$;
revoke all on function public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb) from public,anon;
revoke all on function public.gather_multiplayer_join(uuid,text) from public,anon;
revoke all on function public.gather_multiplayer_move(uuid,numeric,numeric) from public,anon;
revoke all on function public.gather_multiplayer_leave(uuid) from public,anon;
revoke all on function public.gather_multiplayer_end(uuid) from public,anon;
revoke all on function public.gather_multiplayer_update_state(uuid,bigint,jsonb) from public,anon;
grant execute on function public.gather_multiplayer_create(uuid,text,text,uuid[],jsonb,jsonb) to authenticated;
grant execute on function public.gather_multiplayer_join(uuid,text) to authenticated;
grant execute on function public.gather_multiplayer_move(uuid,numeric,numeric) to authenticated;
grant execute on function public.gather_multiplayer_leave(uuid) to authenticated;
grant execute on function public.gather_multiplayer_end(uuid) to authenticated;
grant execute on function public.gather_multiplayer_update_state(uuid,bigint,jsonb) to authenticated;
