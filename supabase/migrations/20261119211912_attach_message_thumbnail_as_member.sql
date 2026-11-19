CREATE OR REPLACE FUNCTION private.attach_message_thumbnail(
  p_message_id uuid,
  p_thumbnail_path text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_conversation_id uuid;
  v_attachment_path text;
  v_existing_thumbnail text;
  v_expected_path text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT m.conversation_id, m.attachment_path, m.thumbnail_path
    INTO v_conversation_id, v_attachment_path, v_existing_thumbnail
  FROM public.messages m
  WHERE m.id = p_message_id;

  IF NOT FOUND OR v_attachment_path IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_conversation_id
      AND cm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You are not a member of this conversation';
  END IF;

  IF v_existing_thumbnail IS NOT NULL THEN
    RETURN v_existing_thumbnail;
  END IF;

  IF v_attachment_path !~ '^[0-9a-fA-F-]{36}/[^/]+\.(jpg|jpeg|png|webp)$' THEN
    RETURN NULL;
  END IF;

  v_expected_path :=
    v_conversation_id::text || '/' ||
    regexp_replace(split_part(v_attachment_path, '/', 2), '\.[^.]+$', '.thumb.webp');

  IF p_thumbnail_path IS DISTINCT FROM v_expected_path THEN
    RAISE EXCEPTION 'Invalid thumbnail path';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'gather-message-images'
      AND o.name = p_thumbnail_path
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.messages
  SET thumbnail_path = p_thumbnail_path
  WHERE id = p_message_id
    AND conversation_id = v_conversation_id
    AND attachment_path = v_attachment_path
    AND thumbnail_path IS NULL;

  SELECT m.thumbnail_path
    INTO v_existing_thumbnail
  FROM public.messages m
  WHERE m.id = p_message_id;

  RETURN v_existing_thumbnail;
END
$function$;

REVOKE ALL ON FUNCTION private.attach_message_thumbnail(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.attach_message_thumbnail(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_message_thumbnail(
  p_message_id uuid,
  p_thumbnail_path text
)
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.attach_message_thumbnail(p_message_id, p_thumbnail_path);
$function$;

REVOKE ALL ON FUNCTION public.attach_message_thumbnail(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_message_thumbnail(uuid, text) TO authenticated;
