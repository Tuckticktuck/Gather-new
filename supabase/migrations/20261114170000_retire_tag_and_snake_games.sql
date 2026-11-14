-- Retire Tag Arena and Snake Arena from the client-facing product.
-- Preserve existing tables and rows; disable exposed RPC entry points for client roles.
DO $retire$
DECLARE
  v_routine record;
BEGIN
  FOR v_routine IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND (
         left(p.proname, 11) = 'gather_tag_'
         OR left(p.proname, 13) = 'gather_snake_'
       )
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_routine.signature
    );
  END LOOP;
END;
$retire$;
