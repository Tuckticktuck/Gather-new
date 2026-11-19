ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND conname = 'messages_thumbnail_path_same_conversation'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_thumbnail_path_same_conversation
      CHECK (
        thumbnail_path IS NULL
        OR split_part(thumbnail_path, '/', 1) = conversation_id::text
      );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
