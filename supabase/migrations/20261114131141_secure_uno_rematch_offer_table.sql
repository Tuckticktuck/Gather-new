-- UNO rematch offers contain participant IDs and response state.
-- The table is private and should only be accessed through the SECURITY DEFINER
-- RPCs owned by postgres; client roles must never query or mutate it directly.
ALTER TABLE private.gather_uno_rematch_offers
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.gather_uno_rematch_offers
  FROM PUBLIC, anon, authenticated;
