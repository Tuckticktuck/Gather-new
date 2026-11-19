-- Route voice-call lifecycle signals through each recipient's private user topic.
-- Audio remains on LiveKit; this channel carries only invite/accept/decline/busy/no-answer/hangup.

DROP POLICY IF EXISTS "Gather members can send private chat presence" ON realtime.messages;

CREATE POLICY "Gather members can send private chat presence"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (
    extension = 'presence'
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = NULLIF(
        substring((SELECT realtime.topic()), '^gather-chat:([0-9a-fA-F-]{36})$'), ''
      )::uuid
      AND cm.user_id = (SELECT auth.uid())
    )
  )
  OR
  (
    extension = 'broadcast'
    AND event = 'typing'
    AND octet_length(payload::text) <= 4000
    AND payload->>'user_id' = (SELECT auth.uid())::text
    AND payload->>'typing' IN ('true', 'false')
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = NULLIF(
        substring((SELECT realtime.topic()), '^gather-chat:([0-9a-fA-F-]{36})$'), ''
      )::uuid
      AND cm.user_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "Gather users can receive own voice call signals" ON realtime.messages;
CREATE POLICY "Gather users can receive own voice call signals"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'broadcast'
  AND event = 'call-signal'
  AND substring((SELECT realtime.topic()), '^gather-call:([0-9a-fA-F-]{36})$')
      = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Gather users can send voice call signals to conversation member" ON realtime.messages;
CREATE POLICY "Gather users can send voice call signals to conversation member"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND event = 'call-signal'
  AND octet_length(payload::text) <= 8000
  AND substring((SELECT realtime.topic()), '^gather-call:([0-9a-fA-F-]{36})$')
      = payload->>'to_user_id'
  AND payload->>'from_user_id' = (SELECT auth.uid())::text
  AND payload->>'to_user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND payload->>'conversation_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND payload->>'call_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND payload->>'type' IN ('invite','accept','decline','busy','no-answer','hangup')
  AND payload->>'to_user_id' <> (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id::text = payload->>'conversation_id'
      AND c.kind = 'direct'
      AND (
        SELECT count(*)
        FROM public.conversation_members cm_count
        WHERE cm_count.conversation_id = c.id
      ) = 2
  )
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members sender
    WHERE sender.conversation_id::text = payload->>'conversation_id'
      AND sender.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.conversation_members recipient
    WHERE recipient.conversation_id::text = payload->>'conversation_id'
      AND recipient.user_id::text = payload->>'to_user_id'
  )
);
