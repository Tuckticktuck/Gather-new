-- Cover the user_id foreign key used by profile deletion cascades.
-- The primary key starts with game_id, so it cannot efficiently serve user_id-only lookups.
CREATE INDEX IF NOT EXISTS gather_snake_inputs_user_id_idx
  ON private.gather_snake_inputs (user_id);
