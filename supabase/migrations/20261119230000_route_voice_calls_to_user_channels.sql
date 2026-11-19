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
  AND substring((SELECT realtime.topic()), '^gather-call:([0-9a-fA-F-]{36})
      = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Gather users can send voice call signals to conversation member" ON realtime.messages;
CREATE POLICY "Gather users can send voice call signals to conversation member"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'broadcast'
  AND substring((SELECT realtime.topic()), '^gather-call:([0-9a-fA-F-]{36})$') IS NOT NULL
  AND substring((SELECT realtime.topic()), '^gather-call:([0-9a-fA-F-]{36})$')
      <> (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_members sender ON sender.conversation_id = c.id
    JOIN public.conversation_members recipient ON recipient.conversation_id = c.id
    WHERE c.kind = 'direct'
      AND sender.user_id = (SELECT auth.uid())
      AND recipient.user_id::text =
        substring((SELECT realtime.topic()), '^gather-call:([0-9a-fA-F-]{36})$')
      AND (
        SELECT count(*)
        FROM public.conversation_members cm_count
        WHERE cm_count.conversation_id = c.id
      ) = 2
  )
);
