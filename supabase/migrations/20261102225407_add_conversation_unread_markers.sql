CREATE TABLE public.conversation_unread_markers (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

ALTER TABLE public.conversation_unread_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversation_unread_markers FROM PUBLIC, anon, authenticated;
CREATE INDEX conversation_unread_markers_message_idx
  ON public.conversation_unread_markers (message_id);

CREATE OR REPLACE FUNCTION public.mark_conversation_unread(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_me uuid := (SELECT auth.uid());
  v_message_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = p_conversation_id
      AND cm.user_id = v_me
  ) THEN
    RAISE EXCEPTION 'You are not a member of this conversation.';
  END IF;

  SELECT m.id
    INTO v_message_id
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id <> v_me
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_deleted_messages udm
      WHERE udm.message_id = m.id
        AND udm.user_id = v_me
    )
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_message_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.conversation_unread_markers(user_id, conversation_id, message_id)
  VALUES (v_me, p_conversation_id, v_message_id)
  ON CONFLICT (user_id, conversation_id)
  DO UPDATE SET message_id = EXCLUDED.message_id, marked_at = now();

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_conversation_unread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_unread(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.get_my_unread_counts()
RETURNS TABLE(conversation_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT m.conversation_id, count(*)::bigint AS unread_count
  FROM public.messages m
  JOIN public.conversation_members cm
    ON cm.conversation_id = m.conversation_id
   AND cm.user_id = (SELECT auth.uid())
  LEFT JOIN public.message_reads mr
    ON mr.message_id = m.id
   AND mr.user_id = (SELECT auth.uid())
  LEFT JOIN public.user_deleted_messages udm
    ON udm.message_id = m.id
   AND udm.user_id = (SELECT auth.uid())
  LEFT JOIN public.conversation_unread_markers marker
    ON marker.conversation_id = m.conversation_id
   AND marker.user_id = (SELECT auth.uid())
  LEFT JOIN public.messages marker_message
    ON marker_message.id = marker.message_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND m.sender_id <> (SELECT auth.uid())
    AND udm.message_id IS NULL
    AND (
      mr.message_id IS NULL
      OR (
        marker_message.id IS NOT NULL
        AND (m.created_at, m.id) >= (marker_message.created_at, marker_message.id)
      )
    )
  GROUP BY m.conversation_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_oldest_unread_message(p_conversation_id uuid)
RETURNS TABLE(message_id uuid, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT m.id, m.created_at
  FROM public.messages m
  LEFT JOIN public.message_reads mr
    ON mr.message_id = m.id
   AND mr.user_id = (SELECT auth.uid())
  LEFT JOIN public.user_deleted_messages udm
    ON udm.message_id = m.id
   AND udm.user_id = (SELECT auth.uid())
  LEFT JOIN public.conversation_unread_markers marker
    ON marker.conversation_id = m.conversation_id
   AND marker.user_id = (SELECT auth.uid())
  LEFT JOIN public.messages marker_message
    ON marker_message.id = marker.message_id
  WHERE p_conversation_id IS NOT NULL
    AND (SELECT auth.uid()) IS NOT NULL
    AND m.conversation_id = p_conversation_id
    AND m.sender_id <> (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = m.conversation_id
        AND cm.user_id = (SELECT auth.uid())
    )
    AND udm.message_id IS NULL
    AND (
      mr.message_id IS NULL
      OR (
        marker_message.id IS NOT NULL
        AND (m.created_at, m.id) >= (marker_message.created_at, marker_message.id)
      )
    )
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION private.mark_conversation_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_me uuid := (SELECT auth.uid());
  v_inserted integer;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  IF NOT private.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'You are not a member of this conversation.';
  END IF;

  DELETE FROM public.conversation_unread_markers
  WHERE conversation_id = p_conversation_id
    AND user_id = v_me;

  WITH inserted AS (
    INSERT INTO public.message_reads(message_id, conversation_id, user_id)
    SELECT m.id, m.conversation_id, v_me
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_me
      AND NOT EXISTS (
        SELECT 1
        FROM public.message_reads mr
        WHERE mr.message_id = m.id
          AND mr.user_id = v_me
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_deleted_messages udm
        WHERE udm.message_id = m.id
          AND udm.user_id = v_me
      )
    ON CONFLICT (message_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;

  RETURN v_inserted;
END;
$function$;
