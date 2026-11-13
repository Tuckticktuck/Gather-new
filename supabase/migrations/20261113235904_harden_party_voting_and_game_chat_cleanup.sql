create or replace function public.gather_party_poll_create(
  p_party_id uuid,
  p_question text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_options text[] := coalesce(p_options,'{}'::text[]);
  v_poll_id uuid;
  v_party_size integer;
begin
  if v_uid is null then raise exception 'Sign in to create a vote.'; end if;
  if not exists (
    select 1 from public.gather_game_party_members m
    join public.gather_game_parties p on p.id=m.party_id
    where m.party_id=p_party_id and m.user_id=v_uid
      and m.role='leader' and m.status='joined' and p.status='active'
  ) then raise exception 'Only the party leader can create a vote.'; end if;
  if char_length(btrim(coalesce(p_question,''))) not between 1 and 90 then
    raise exception 'The vote question must be 1–90 characters.';
  end if;
  if cardinality(v_options) not between 2 and 8 then raise exception 'Choose between 2 and 8 options.'; end if;
  if exists (
    select 1 from unnest(v_options) as opt(value)
    where value not in ('chess','checkers','tic_tac_toe','connect_four','battleship','uno','ludo','tag')
  ) then raise exception 'One of those games is not available for voting.'; end if;
  if (select count(distinct value) from unnest(v_options) as opt(value)) <> cardinality(v_options) then
    raise exception 'Vote options must be unique.'; end if;
  select count(*) into v_party_size from public.gather_game_party_members
    where party_id=p_party_id and status='joined';
  if v_party_size < 2 then raise exception 'At least two party members must join before voting.'; end if;
  if v_party_size > 2 and exists (
    select 1 from unnest(v_options) as opt(value)
    where value in ('chess','checkers','tic_tac_toe','connect_four','battleship')
  ) then raise exception 'Head-to-head games can only be voted on by two-player parties.'; end if;
  if v_party_size > 4 and 'ludo'=any(v_options) then raise exception 'Ludo supports up to four players.'; end if;
  if v_party_size > 12 and 'tag'=any(v_options) then raise exception 'Tag lobbies support up to twelve players.'; end if;

  update public.gather_game_party_polls set status='closed'
    where party_id=p_party_id and status='open';
  insert into public.gather_game_party_polls(party_id,created_by,question,options,closes_at)
  values(p_party_id,v_uid,btrim(p_question),v_options,now()+interval '3 minutes')
  returning id into v_poll_id;
  update public.gather_game_parties set updated_at=now() where id=p_party_id;
  return v_poll_id;
end;
$$;

-- This is a trigger-only function. PostgreSQL does not require callers to have
-- EXECUTE on a trigger function when the trigger fires.
revoke execute on function public.gather_game_chat_cleanup() from public, anon, authenticated;
