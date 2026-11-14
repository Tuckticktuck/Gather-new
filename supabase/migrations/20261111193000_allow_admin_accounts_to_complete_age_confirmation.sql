create or replace function private.confirm_my_age(p_birth_date date)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_age integer;
  v_group text;
  v_is_admin boolean;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_birth_date is null or p_birth_date > current_date then
    raise exception 'Enter a valid date of birth.';
  end if;

  if exists (
    select 1 from private.member_age_records r
    where r.user_id = v_user_id
  ) then
    raise exception 'Your age has already been confirmed. Contact Gather Admin if the date needs correction.';
  end if;

  v_age := extract(year from age(current_date, p_birth_date))::integer;
  v_group := case
    when v_age between 12 and 14 then '12-14'
    when v_age between 15 and 18 then '15-18'
    else null
  end;
  v_is_admin := private.is_gather_admin_user(v_user_id);

  -- Admin accounts use the same private DOB record and age-group eligibility
  -- as every other account; the admin role does not waive the age requirement.
  insert into private.member_age_records(user_id, birth_date)
  values (v_user_id, p_birth_date);

  return jsonb_build_object(
    'verified', true,
    'eligible', v_group is not null,
    'is_admin', v_is_admin,
    'age_group', v_group,
    'age', v_age
  );
end;
$function$;

create or replace function private.my_age_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_birth_date date;
  v_group text;
  v_age integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select r.birth_date
  into v_birth_date
  from private.member_age_records r
  where r.user_id = v_user_id;

  if v_birth_date is null then
    return jsonb_build_object(
      'verified', false,
      'eligible', false,
      'is_admin', private.is_gather_admin_user(v_user_id),
      'age_group', null
    );
  end if;

  v_age := extract(year from age(current_date, v_birth_date))::integer;
  v_group := private.member_age_group(v_user_id);

  return jsonb_build_object(
    'verified', true,
    'eligible', v_group is not null,
    'is_admin', private.is_gather_admin_user(v_user_id),
    'age_group', v_group,
    'age', v_age
  );
end;
$function$;
