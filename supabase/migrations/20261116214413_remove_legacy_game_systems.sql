-- Remove all legacy Gather game systems while preserving core chat data and schema.
delete from public.notifications
where kind in (
  'uno_invite','uno_rematch','uno_rematch_result',
  'dominoes_invite','dominoes_spectate',
  'ludo_invite','game_invite','game_rematch','game_spectate'
);

alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind = any (array[
    'message'::text,
    'friend_request'::text,
    'chat_request'::text,
    'feedback_reply'::text,
    'report'::text,
    'announcement'::text
  ]));

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private')
      and p.prokind = 'f'
      and (
        p.proname like 'gather_game%'
        or p.proname like 'gather_party_%'
        or p.proname like 'gather_tag_%'
        or p.proname like 'gather_uno_%'
        or p.proname like 'gather_ludo_%'
        or p.proname like 'gather_dominoes_%'
        or p.proname like 'gather_snake_%'
        or p.proname like 'gather_board_game_%'
        or p.proname in (
          'dominoes_finish_round',
          'dominoes_start_round',
          'gather_can_invite_game_person',
          'gather_game_chat_cleanup',
          'gather_game_chat_list',
          'gather_game_chat_send',
          'gather_game_invitable_people',
          'gather_uno_public_state',
          'is_multiplayer_game_player',
          'is_tag_lobby_player',
          'prevent_legacy_gameplay_before_start',
          'gather_public_game_lobbies'
        )
      )
    order by n.nspname, p.proname
  loop
    execute format(
      'drop function if exists %I.%I(%s) cascade',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end
$$;

drop table if exists
  public.gather_battleship_fleets,
  public.gather_dominoes_achievements,
  public.gather_dominoes_boneyard,
  public.gather_dominoes_hands,
  public.gather_dominoes_stats,
  public.gather_game_chat_messages,
  public.gather_game_party_votes,
  public.gather_game_party_polls,
  public.gather_game_party_members,
  public.gather_game_parties,
  public.gather_games,
  public.gather_multiplayer_players,
  public.gather_tag_players,
  public.gather_tag_lobbies,
  public.gather_multiplayer_games
cascade;

drop table if exists
  private.gather_snake_inputs,
  private.gather_uno_private_states,
  private.gather_uno_rematch_offers
cascade;
