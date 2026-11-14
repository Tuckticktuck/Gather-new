CREATE INDEX IF NOT EXISTS conversation_unread_markers_conversation_idx
  ON public.conversation_unread_markers (conversation_id);
