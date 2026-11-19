-- LiveKit carries audio through the SFU. Realtime now signals only call lifecycle events;
-- SDP and ICE candidates are no longer sent through Gather chat broadcasts.
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
      WHERE cm.conversation_id = NULLIF(substring((SELECT realtime.topic()), '^gather-chat:([0-9a-fA-F-]{36})$'), '')::uuid
        AND cm.user_id = (SELECT auth.uid())
    )
  )
  OR
  (
    extension = 'broadcast'
    AND octet_length(payload::text) <= 24000
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members sender
      WHERE sender.conversation_id = NULLIF(substring((SELECT realtime.topic()), '^gather-chat:([0-9a-fA-F-]{36})$'), '')::uuid
        AND sender.user_id = (SELECT auth.uid())
    )
    AND (
      (
        event = 'typing'
        AND payload->>'user_id' = (SELECT auth.uid())::text
        AND payload->>'typing' IN ('true', 'false')
      )
      OR
      (
        event = 'call-signal'
        AND payload->>'from_user_id' = (SELECT auth.uid())::text
        AND payload->>'conversation_id' = substring((SELECT realtime.topic()), '^gather-chat:([0-9a-fA-F-]{36})$')
        AND payload->>'call_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND payload->>'type' IN ('invite','accept','decline','busy','no-answer','hangup')
        AND EXISTS (
          SELECT 1
          FROM public.conversations c
          WHERE c.id = NULLIF(substring((SELECT realtime.topic()), '^gather-chat:([0-9a-fA-F-]{36})$'), '')::uuid
            AND c.kind = 'direct'
            AND (
              SELECT count(*)
              FROM public.conversation_members cm_count
              WHERE cm_count.conversation_id = c.id
            ) = 2
        )
        AND EXISTS (
          SELECT 1
          FROM public.conversation_members recipient
          WHERE recipient.conversation_id = NULLIF(substring((SELECT realtime.topic()), '^gather-chat:([0-9a-fA-F-]{36})$'), '')::uuid
            AND recipient.user_id = NULLIF(payload->>'to_user_id', '')::uuid
            AND recipient.user_id <> (SELECT auth.uid())
        )
      )
    )
  )
);
