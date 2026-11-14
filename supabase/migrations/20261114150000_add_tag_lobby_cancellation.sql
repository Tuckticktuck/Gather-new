-- Let the Tag host close the entire lobby, not only return an active round.
CREATE OR REPLACE FUNCTION private.gather_tag_cancel(p_lobby_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lobby public.gather_tag_lobbies;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first.';
  END IF;

  SELECT * INTO v_lobby
    FROM public.gather_tag_lobbies
   WHERE id = p_lobby_id
   FOR UPDATE;

  IF v_lobby.id IS NULL OR v_lobby.status NOT IN ('lobby', 'active', 'completed') THEN
    RAISE EXCEPTION 'This Tag lobby is no longer available.';
  END IF;

  IF v_lobby.created_by <> v_uid THEN
    RAISE EXCEPTION 'Only the host can close this Tag lobby.';
  END IF;

  UPDATE public.gather_tag_lobbies
     SET status = 'cancelled',
         winner_user_id = NULL,
         winning_team = NULL,
         ends_at = NULL,
         updated_at = now()
   WHERE id = p_lobby_id;

  UPDATE public.gather_tag_players
     SET status = 'left',
         ready = false,
         is_it = false,
         team = NULL,
         updated_at = now()
   WHERE lobby_id = p_lobby_id
     AND status IN ('invited', 'joined', 'eliminated');

  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.gather_tag_cancel(p_lobby_id uuid)
RETURNS boolean
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT private.gather_tag_cancel($1)
$function$;

REVOKE ALL ON FUNCTION private.gather_tag_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.gather_tag_cancel(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.gather_tag_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gather_tag_cancel(uuid) TO authenticated, service_role;
