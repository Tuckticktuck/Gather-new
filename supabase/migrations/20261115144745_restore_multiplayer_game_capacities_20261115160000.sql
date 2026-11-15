-- Restore supported multiplayer capacities after the temporary two-player lobby clamp.
-- Existing matches are not rewritten: only new lobby creation and seat admission rules change.

drop trigger if exists gather_multiplayer_players_two_player_limit
  on public.gather_multiplayer_players;
drop trigger if exists gather_multiplayer_games_two_player_settings
  on public.gather_multiplayer_games;

create or replace function public.gather_uno_create(
  p_conversation_id uuid,
  p_join_mode text,
  p_invited_user_ids uuid[] default '{}'::uuid[],
  p_max_players integer default 10
)
returns public.gather_multiplayer_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.gather_multiplayer_games;
  v_invites uuid[] := coalesce(p_invited_user_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_max_players not between 2 and 10 then
    raise exception 'UNO supports between two and ten players.';
  end if;
  if p_join_mode not in ('open','invite') then
    raise exception 'Choose open or invite-only joining.';
  end if;
  if p_join_mode = 'invite' and cardinality(v_invites) = 0 then
    raise exception 'Choose at least one person to invite.';
  end if;
  if cardinality(v_invites) > p_max_players - 1 then
    raise exception 'The invitations exceed the selected UNO player limit.';
  end if;
  if p_join_mode = 'open' and cardinality(v_invites) <> 0 then
    raise exception 'Open lobbies cannot include private invitations.';
  end if;

  v_game := public.gather_multiplayer_create(
    p_conversation_id,
    'uno',
    p_join_mode,
    v_invites,
    jsonb_build_object(
      'max_players', p_max_players,
      'house_rules', jsonb_build_object(
        'starting_hand_size', 7,
        'draw_until_playable', false,
        'wild4_anytime', false
      )
    ),
    jsonb_build_object('version', 1, 'started', false),
    '#40826D'
  );

  -- The host must explicitly ready up like every other participant.
  update public.gather_multiplayer_players
     set ready = false
   where game_id = v_game.id and user_id = auth.uid();

  if p_join_mode = 'invite' then
    insert into public.notifications(recipient_id, actor_id, kind, title, body, conversation_id)
    select p.user_id, auth.uid(), 'uno_invite', 'UNO lobby invitation', v_game.id::text, p_conversation_id
      from public.gather_multiplayer_players p
     where p.game_id = v_game.id and p.status = 'invited' and p.user_id <> auth.uid()
    on conflict do nothing;
  end if;
  return v_game;
end;
$$;

create or replace function public.gather_ludo_create(
  p_conversation_id uuid,
  p_join_mode text,
  p_invited_user_ids uuid[] default '{}'::uuid[],
  p_max_players integer default 4,
  p_creator_color text default '#D85A60'
)
returns public.gather_multiplayer_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.gather_multiplayer_games;
  v_invites uuid[] := coalesce(p_invited_user_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then raise exception 'Sign in to create a Ludo lobby.'; end if;
  if p_max_players not between 2 and 4 then
    raise exception 'Ludo supports between two and four players.';
  end if;
  if p_join_mode not in ('open','invite') then
    raise exception 'Choose open or invite-only joining.';
  end if;
  if lower(coalesce(p_creator_color, '')) not in ('#d85a60','#39a96b','#d9ad45','#4f83d1') then
    raise exception 'Choose an available Ludo color.';
  end if;
  if p_join_mode = 'invite' and cardinality(v_invites) = 0 then
    raise exception 'Choose at least one person to invite.';
  end if;
  if cardinality(v_invites) > p_max_players - 1 then
    raise exception 'The invitations exceed the selected Ludo player limit.';
  end if;
  if p_join_mode = 'open' and cardinality(v_invites) <> 0 then
    raise exception 'Open lobbies cannot include private invitations.';
  end if;

  v_game := public.gather_multiplayer_create(
    p_conversation_id,
    'ludo',
    p_join_mode,
    v_invites,
    jsonb_build_object('max_players', p_max_players),
    jsonb_build_object('version', 1, 'started', false, 'message', 'Waiting for players.'),
    upper(p_creator_color)
  );

  update public.gather_multiplayer_players
     set ready = false
   where game_id = v_game.id and user_id = auth.uid();
  return v_game;
end;
$$;

create or replace function public.gather_dominoes_create(
  p_join_mode text,
  p_invited_user_ids uuid[],
  p_mode text,
  p_preset text default 'classic'
)
returns public.gather_multiplayer_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target integer;
  v_game public.gather_multiplayer_games;
  v_invites uuid[] := coalesce(p_invited_user_ids, '{}'::uuid[]);
  v_invite uuid;
begin
  if v_uid is null then raise exception 'Sign in to create a Dominoes lobby.'; end if;
  if p_mode not in ('free_for_all','teams') then
    raise exception 'Choose free-for-all or team mode.';
  end if;
  if p_preset not in ('quick','classic','marathon') then
    raise exception 'Choose a Dominoes rule preset.';
  end if;
  v_target := case p_preset when 'quick' then 50 when 'marathon' then 150 else 100 end;
  if p_join_mode not in ('invite','open') then
    raise exception 'Choose invite-only or open joining.';
  end if;
  if p_join_mode = 'invite' and cardinality(v_invites) = 0 then
    raise exception 'Choose at least one person to invite.';
  end if;
  if cardinality(v_invites) > 3 then
    raise exception 'Dominoes supports up to four players including the host.';
  end if;
  if p_join_mode = 'open' and cardinality(v_invites) <> 0 then
    raise exception 'Open lobbies cannot include private invitations.';
  end if;
  if p_mode = 'teams' and (cardinality(v_invites) <> 3 or p_join_mode <> 'invite') then
    raise exception 'Team mode needs four players. Invite three people to fill both opposing teams.';
  end if;
  if exists (
    select 1
      from public.gather_multiplayer_games
     where created_by = v_uid and game_type = 'dominoes' and status = 'active'
  ) then
    raise exception 'You already have an active Dominoes lobby or match.';
  end if;

  v_game := public.gather_multiplayer_create(
    null,
    'dominoes',
    p_join_mode,
    v_invites,
    jsonb_build_object(
      'mode', p_mode,
      'preset', p_preset,
      'target_score', v_target,
      'max_players', 4,
      'starting_hand', 7,
      'turn_timer', null,
      'tile_theme', 'cyan',
      'pip_style', 'classic',
      'border_style', 'glow'
    ),
    jsonb_build_object(
      'version', 1,
      'started', false,
      'phase', 'lobby',
      'mode', p_mode,
      'message', 'Waiting for players.'
    ),
    '#22D3EE'
  );

  update public.gather_multiplayer_players
     set ready = false
   where game_id = v_game.id and user_id = v_uid;

  if p_join_mode = 'invite' then
    foreach v_invite in array v_invites loop
      insert into public.notifications(recipient_id, actor_id, kind, title, body)
      values (v_invite, v_uid, 'dominoes_invite', 'Dominoes invitation', v_game.id::text);
    end loop;
  end if;
  return v_game;
end;
$$;
