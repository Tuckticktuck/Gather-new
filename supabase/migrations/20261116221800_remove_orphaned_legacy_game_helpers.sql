-- Final cleanup for two orphaned legacy game helpers missed by the original retirement filter.
drop function if exists public.gather_public_lobby_action(uuid, text, text);
drop function if exists private.normalize_two_player_lobby_settings();