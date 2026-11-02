ALTER TABLE public.profiles
  ADD COLUMN status_message text NOT NULL DEFAULT ''
    CONSTRAINT profiles_status_message_length_check
    CHECK (char_length(status_message) <= 80),
  ADD COLUMN profile_highlights jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT profiles_profile_highlights_check
    CHECK (
      CASE
        WHEN jsonb_typeof(profile_highlights) = 'array'
        THEN jsonb_array_length(profile_highlights) <= 3
        ELSE false
      END
    );
