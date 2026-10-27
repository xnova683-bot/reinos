-- WoW Imperial - mundo compartido con regiones poligonales
-- Ejecuta TODO este archivo en Supabase > SQL Editor > Run.
-- Es idempotente: se puede volver a ejecutar sin perder partidas.
-- Registro solo con teléfono (correo interno: <telefono>@reinos.local).
-- Cuenta de administración: usuario "admin", contraseña "Reinos#2026".
-- IMPORTANTE: desactiva "Confirm email" en Supabase > Authentication > Providers > Email.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  email text,
  race text not null check (race in ('horda', 'alianza', 'enanos')),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists x numeric;
alter table public.profiles add column if not exists y numeric;
alter table public.profiles add column if not exists region_id integer;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
create index if not exists profiles_phone_idx on public.profiles (phone);
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists last_seen timestamptz;
alter table public.profiles add column if not exists shield_until timestamptz;
alter table public.profiles add column if not exists pvp_wins integer not null default 0;
alter table public.profiles add column if not exists pvp_losses integer not null default 0;

create table if not exists public.regions (
  id serial primary key,
  name text not null,
  points jsonb not null,
  bbox jsonb not null,
  locked boolean not null default true,
  capacity integer not null default 25,
  updated_at timestamptz not null default now()
);

create table if not exists public.world_settings (
  id integer primary key default 1 check (id = 1),
  map_image text,
  updated_at timestamptz not null default now()
);

insert into public.world_settings (id, map_image)
values (1, null)
on conflict (id) do nothing;

create table if not exists public.pvp_hits (
  attacker uuid not null references public.profiles (id) on delete cascade,
  target uuid not null references public.profiles (id) on delete cascade,
  last_hit timestamptz not null default now(),
  primary key (attacker, target)
);

create table if not exists public.world_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  attacker text,
  target text,
  winner text,
  loot integer not null default 0,
  text text not null
);

alter table public.regions enable row level security;
alter table public.world_settings enable row level security;
alter table public.pvp_hits enable row level security;
alter table public.world_events enable row level security;

drop policy if exists "regions_read" on public.regions;
create policy "regions_read" on public.regions for select to authenticated using (true);

drop policy if exists "settings_read" on public.world_settings;
create policy "settings_read" on public.world_settings for select to authenticated using (true);

drop policy if exists "world_events_read" on public.world_events;
create policy "world_events_read" on public.world_events for select to authenticated using (true);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- ============================================================
-- 20 regiones poligonales (hexágonos irregulares) en rejilla 5x4
-- Solo las dos primeras empiezan desbloqueadas.
-- ============================================================

do $seed$
declare
  names text[] := array[
    'Valle de Aria', 'Bosque Umbrío', 'Páramo Gris', 'Colinas de Tévar',
    'Ribera del Cuervo', 'Cañón Rojo', 'Lago Sereno', 'Dunas de Kadesh',
    'Selva de Vharn', 'Cumbre Blanca', 'Estepa Dorada', 'Ruinas de Oren',
    'Marisma Negra', 'Paso del Titán', 'Abadía de Lumen', 'Fiordo Helado',
    'Bosque de Espinos', 'Meseta de Khar', 'Delta de Plata', 'Volcán Yermo'
  ];
  i integer;
  col integer;
  row integer;
  cx numeric;
  cy numeric;
  rx numeric := 0.075;
  ry numeric := 0.095;
  ang numeric;
  pts jsonb;
  k integer;
  px numeric;
  py numeric;
  minx numeric;
  maxx numeric;
  miny numeric;
  maxy numeric;
begin
  if (select count(*) from public.regions) > 0 then
    return;
  end if;

  for i in 0..19 loop
    col := i % 5;
    row := i / 5;
    cx := 0.1 + col * 0.2 + (row % 2) * 0.025;
    cy := 0.14 + row * 0.24;
    pts := '[]'::jsonb;
    minx := 2; maxx := -1; miny := 2; maxy := -1;

    for k in 0..5 loop
      ang := radians(30 + k * 60);
      px := cx + rx * cos(ang) * (1 + 0.08 * sin((i + 1) * 1.7));
      py := cy + ry * sin(ang);
      minx := least(minx, px);
      maxx := greatest(maxx, px);
      miny := least(miny, py);
      maxy := greatest(maxy, py);
      pts := pts || jsonb_build_array(jsonb_build_array(px, py));
    end loop;

    insert into public.regions (name, points, bbox, locked, capacity)
    values (
      names[i + 1],
      pts,
      jsonb_build_object('x0', minx, 'y0', miny, 'x1', maxx, 'y1', maxy),
      i > 1,
      25
    );
  end loop;
end;
$seed$;

-- ============================================================
-- Utilidades
-- ============================================================

create or replace function public.state_power(s jsonb)
returns integer
language sql
immutable
as $fn$
  with m as (
    select
      case s->>'race' when 'horda' then 1.25 when 'enanos' then 0.8 else 1.0 end as atk,
      case s->>'race' when 'horda' then 1.25 when 'enanos' then 0.8 else 1.0 end as def,
      case s->>'race' when 'horda' then 1.25 when 'enanos' then 0.8 else 1.0 end as hp
  )
  select round(coalesce(sum(
    coalesce((s->'troops'->>t)::numeric, 0) * (
      (case t when 'lanceros' then 6 when 'arqueros' then 11 when 'jinetes' then 18 else 0 end) * m.atk
      + (case t when 'lanceros' then 8 when 'arqueros' then 4 when 'jinetes' then 10 else 0 end) * m.def
      + (case t when 'lanceros' then 30 when 'arqueros' then 22 when 'jinetes' then 55 else 0 end) * m.hp / 4
    )
  ), 0))::integer
  from (values ('lanceros'), ('arqueros'), ('jinetes')) as x(t), m;
$fn$;

create or replace function public.state_storage(s jsonb)
returns numeric
language sql
immutable
as $fn$
  select 2000
    + coalesce((s->'buildings'->>'granero')::numeric, 1) * 1500
    + coalesce((s->'buildings'->>'ayuntamiento')::numeric, 1) * 800;
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$fn$;

grant execute on function public.is_admin() to authenticated;

-- ============================================================
-- Alta de aldea: asigna la primera región abierta con plazas
-- ============================================================

create or replace function public.prepare_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  reg public.regions%rowtype;
  n integer;
  slot integer;
  jitter integer;
  bx numeric;
  by numeric;
  bw numeric;
  bh numeric;
begin
  if new.region_id is null or new.x is null or new.y is null then
    select r.* into reg
    from public.regions r
    where r.locked = false
      and (select count(*) from public.profiles p where p.region_id = r.id) < r.capacity
    order by r.id
    limit 1;

    if reg.id is not null then
      select count(*) into n from public.profiles p where p.region_id = reg.id;
      slot := n % 25;

      bx := (reg.bbox->>'x0')::numeric;
      by := (reg.bbox->>'y0')::numeric;
      bw := (reg.bbox->>'x1')::numeric - bx;
      bh := (reg.bbox->>'y1')::numeric - by;
      jitter := ('x' || substr(md5(new.id::text), 1, 8))::bit(32)::bigint % 1000;

      new.region_id := reg.id;
      new.x := bx + bw * (0.25 + (slot % 5) * 0.125) + ((jitter % 5) - 2) * 0.005;
      new.y := by + bh * (0.25 + (slot / 5) * 0.125) + (((jitter / 5) % 5) - 2) * 0.005;
    end if;
  end if;

  if new.phone is null and new.email is not null then
    new.phone := substring(new.email from '^([0-9]{6,15})@reinos\.local$');
  end if;

  new.last_seen := now();
  if new.shield_until is null then
    new.shield_until := now() + interval '12 hours';
  end if;
  return new;
end;
$fn$;

drop trigger if exists profiles_prepare on public.profiles;
create trigger profiles_prepare
  before insert or update on public.profiles
  for each row execute function public.prepare_profile();

-- Evita que un jugador se haga admin a sí mismo
create or replace function public.guard_admin_flag()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.is_admin and auth.uid() is not null then
      new.is_admin := false;
    end if;
    return new;
  end if;

  if auth.uid() is not null
     and new.is_admin is distinct from old.is_admin
     and not coalesce(old.is_admin, false) then
    raise exception 'not allowed';
  end if;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard_admin on public.profiles;
create trigger profiles_guard_admin
  before insert or update on public.profiles
  for each row execute function public.guard_admin_flag();

-- ============================================================
-- Estado del mundo: regiones, ajustes, aldeas y actividad
-- ============================================================

create or replace function public.world_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is not null then
    update public.profiles set last_seen = now() where id = uid;
  end if;

  select jsonb_build_object(
    'me', coalesce((
      select jsonb_build_object(
        'id', p.id, 'admin', p.is_admin, 'region', p.region_id,
        'wins', p.pvp_wins,
        'shield', (p.shield_until is not null and p.shield_until > now())
      )
      from public.profiles p where p.id = uid
    ), '{}'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(nullif(p.username, ''), 'Señor sin nombre'),
        'race', p.race,
        'x', p.x,
        'y', p.y,
        'region', p.region_id,
        'power', public.state_power(p.state),
        'shield', (p.shield_until is not null and p.shield_until > now()),
        'online', (p.last_seen is not null and p.last_seen > now() - interval '2 minutes'),
        'wins', p.pvp_wins
      ) order by p.pvp_wins desc, p.updated_at desc)
      from public.profiles p
      where p.x is not null
    ), '[]'::jsonb),
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'points', r.points,
        'bbox', r.bbox,
        'locked', r.locked,
        'capacity', r.capacity,
        'villages', (select count(*) from public.profiles p where p.region_id = r.id)
      ) order by r.id)
      from public.regions r
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_build_object('map', coalesce(s.map_image, ''))
      from public.world_settings s where s.id = 1
    ), '{}'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', e.created_at, 'text', e.text, 'winner', e.winner
      ) order by e.created_at desc)
      from (select * from public.world_events order by created_at desc limit 12) e
    ), '[]'::jsonb),
    'online', coalesce((
      select count(*) from public.profiles p
      where p.last_seen is not null and p.last_seen > now() - interval '2 minutes'
    ), 0),
    'phones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(nullif(p.username, ''), '—'),
        'phone', coalesce(p.phone, '—'),
        'region', p.region_id,
        'wins', p.pvp_wins
      ) order by p.updated_at desc)
      from public.profiles p
      where (select coalesce(a.is_admin, false) from public.profiles a where a.id = uid)
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$fn$;

grant execute on function public.world_state() to authenticated;

-- ============================================================
-- PvP (solo entre regiones desbloqueadas)
-- ============================================================

create or replace function public.attack_rival(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  a public.profiles%rowtype;
  d public.profiles%rowtype;
  a_power numeric;
  d_power numeric;
  a_eff numeric;
  d_eff numeric;
  won boolean;
  a_loss_frac numeric;
  d_loss_frac numeric;
  a_state jsonb;
  d_state jsonb;
  res text;
  gain numeric;
  cur numeric;
  cap numeric;
  total_loot integer := 0;
  a_losses integer := 0;
  d_losses integer := 0;
  cnt integer;
  dead integer;
  t text;
  target_name text;
  battle_text text;
  ts bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = target_id then raise exception 'cannot attack yourself'; end if;

  select * into a from public.profiles where id = me for update;
  if not found then raise exception 'attacker profile missing'; end if;
  select * into d from public.profiles where id = target_id for update;
  if not found then raise exception 'target not found'; end if;

  if exists (select 1 from public.regions rg where rg.id in (a.region_id, d.region_id) and rg.locked) then
    raise exception 'region locked';
  end if;

  if d.shield_until is not null and d.shield_until > now() then
    raise exception 'target shielded';
  end if;

  if exists (
    select 1 from public.pvp_hits
    where attacker = me and target = target_id and last_hit > now() - interval '5 minutes'
  ) then
    raise exception 'cooldown';
  end if;

  a_power := public.state_power(a.state);
  d_power := public.state_power(d.state);
  if a_power <= 0 then raise exception 'no troops'; end if;

  a_eff := a_power * (0.9 + random() * 0.25);
  d_eff := d_power * (0.9 + random() * 0.25) * 1.1;
  won := a_eff > d_eff;

  if won then
    a_loss_frac := least(0.55, greatest(0.02, (d_eff / greatest(a_eff, 1)) * 0.3));
    d_loss_frac := least(0.6, greatest(0.02, (a_eff / greatest(d_eff, 1)) * 0.35));
  else
    a_loss_frac := least(0.85, greatest(0.45, 0.45 + (d_eff / greatest(a_eff, 1)) * 0.2));
    d_loss_frac := least(0.35, greatest(0.01, (a_eff / greatest(d_eff, 1)) * 0.1));
  end if;

  a_state := jsonb_set(coalesce(a.state, '{}'::jsonb), '{troops}', coalesce(a.state->'troops', '{}'::jsonb), true);
  a_state := jsonb_set(a_state, '{res}', coalesce(a.state->'res', '{}'::jsonb), true);
  d_state := jsonb_set(coalesce(d.state, '{}'::jsonb), '{troops}', coalesce(d.state->'troops', '{}'::jsonb), true);
  d_state := jsonb_set(d_state, '{res}', coalesce(d.state->'res', '{}'::jsonb), true);

  foreach t in array array['lanceros', 'arqueros', 'jinetes'] loop
    cnt := coalesce((a_state->'troops'->>t)::integer, 0);
    dead := least(cnt, round(cnt * a_loss_frac)::integer);
    a_state := jsonb_set(a_state, array['troops', t], to_jsonb(cnt - dead), true);
    a_losses := a_losses + dead;

    cnt := coalesce((d_state->'troops'->>t)::integer, 0);
    dead := least(cnt, round(cnt * d_loss_frac)::integer);
    d_state := jsonb_set(d_state, array['troops', t], to_jsonb(cnt - dead), true);
    d_losses := d_losses + dead;
  end loop;

  if won then
    cap := public.state_storage(a.state);
    foreach res in array array['oro', 'madera', 'comida', 'piedra'] loop
      cur := coalesce((a_state->'res'->>res)::numeric, 0);
      gain := floor(coalesce((d_state->'res'->>res)::numeric, 0) * 0.12);
      gain := least(gain, greatest(0, cap - cur));
      if gain > 0 then
        a_state := jsonb_set(a_state, array['res', res], to_jsonb(cur + gain), true);
        d_state := jsonb_set(d_state, array['res', res], to_jsonb(greatest(0, coalesce((d_state->'res'->>res)::numeric, 0) - gain)), true);
        total_loot := total_loot + gain::integer;
      end if;
    end loop;
  end if;

  target_name := coalesce(nullif(d.username, ''), 'Señor sin nombre');
  battle_text := case
    when won then 'Victoria de ' || coalesce(nullif(a.username, ''), 'un señor') || ' sobre ' || target_name
      || ' · botín ' || total_loot || ' · bajas ' || a_losses || '/' || d_losses
    else 'Derrota de ' || coalesce(nullif(a.username, ''), 'un señor') || ' ante ' || target_name
      || ' · bajas ' || a_losses || '/' || d_losses
  end;

  a_state := jsonb_set(a_state, '{log}',
    jsonb_build_array(jsonb_build_object('t', ts, 'text', battle_text, 'kind', case when won then 'good' else 'bad' end))
      || coalesce(a_state->'log', '[]'::jsonb), true);

  d_state := jsonb_set(d_state, '{log}',
    jsonb_build_array(jsonb_build_object(
      't', ts,
      'text', case when won
        then 'Fuiste atacado por ' || coalesce(nullif(a.username, ''), 'un señor') || ' y perdiste ' || total_loot || ' recursos.'
        else 'Resististe el ataque de ' || coalesce(nullif(a.username, ''), 'un señor') || '.'
      end,
      'kind', case when won then 'bad' else 'good' end
    )) || coalesce(d_state->'log', '[]'::jsonb), true);

  update public.profiles
    set state = a_state, updated_at = now(),
        pvp_wins = pvp_wins + case when won then 1 else 0 end,
        pvp_losses = pvp_losses + case when won then 0 else 1 end
    where id = me;

  update public.profiles
    set state = d_state, updated_at = now(),
        pvp_wins = pvp_wins + case when won then 0 else 1 end,
        pvp_losses = pvp_losses + case when won then 1 else 0 end
    where id = target_id;

  insert into public.pvp_hits (attacker, target, last_hit)
  values (me, target_id, now())
  on conflict (attacker, target) do update set last_hit = excluded.last_hit;

  insert into public.world_events (attacker, target, winner, loot, text)
  values (
    coalesce(nullif(a.username, ''), 'Señor sin nombre'),
    target_name,
    case when won then 'attacker' else 'defender' end,
    total_loot,
    battle_text
  );

  return jsonb_build_object(
    'win', won, 'loot', total_loot,
    'attacker_losses', a_losses, 'defender_losses', d_losses,
    'target', target_name, 'target_power', d_power, 'attacker_power', a_power,
    'text', battle_text
  );
end;
$fn$;

grant execute on function public.attack_rival(uuid) to authenticated;

-- ============================================================
-- Administración del mapa (solo is_admin)
-- ============================================================

create or replace function public.admin_move_region(rid integer, dx numeric, dy numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  pts jsonb;
  newpts jsonb := '[]'::jsonb;
  pt jsonb;
  nx numeric;
  ny numeric;
  minx numeric := 2;
  maxx numeric := -1;
  miny numeric := 2;
  maxy numeric := -1;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select points into pts from public.regions where id = rid;
  if pts is null then raise exception 'region not found'; end if;

  for pt in select value from jsonb_array_elements(pts) loop
    nx := (pt->>0)::numeric + dx;
    ny := (pt->>1)::numeric + dy;
    nx := least(0.995, greatest(0.005, nx));
    ny := least(0.995, greatest(0.005, ny));
    minx := least(minx, nx); maxx := greatest(maxx, nx);
    miny := least(miny, ny); maxy := greatest(maxy, ny);
    newpts := newpts || jsonb_build_array(jsonb_build_array(nx, ny));
  end loop;

  update public.regions
    set points = newpts,
        bbox = jsonb_build_object('x0', minx, 'y0', miny, 'x1', maxx, 'y1', maxy),
        updated_at = now()
    where id = rid;

  update public.profiles
    set x = least(0.995, greatest(0.005, x + dx)),
        y = least(0.995, greatest(0.005, y + dy))
    where region_id = rid;

  return jsonb_build_object('ok', true, 'points', newpts);
end;
$fn$;

create or replace function public.admin_move_village(target_id uuid, nx numeric, ny numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  px numeric := least(0.995, greatest(0.005, nx));
  py numeric := least(0.995, greatest(0.005, ny));
  reg integer;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  select r.id into reg
  from public.regions r
  where px between (r.bbox->>'x0')::numeric and (r.bbox->>'x1')::numeric
    and py between (r.bbox->>'y0')::numeric and (r.bbox->>'y1')::numeric
  order by r.id
  limit 1;

  update public.profiles
    set x = px,
        y = py,
        region_id = coalesce(reg, region_id)
    where id = target_id;
  if not found then raise exception 'village not found'; end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.admin_set_region_locked(rid integer, is_locked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.regions set locked = is_locked, updated_at = now() where id = rid;
  if not found then raise exception 'region not found'; end if;
  return jsonb_build_object('ok', true, 'locked', is_locked);
end;
$fn$;

create or replace function public.admin_rename_region(rid integer, new_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.regions set name = left(new_name, 60), updated_at = now() where id = rid;
  if not found then raise exception 'region not found'; end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.admin_set_map_image(url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.world_settings set map_image = nullif(url, ''), updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.admin_move_region(integer, numeric, numeric) to authenticated;
grant execute on function public.admin_move_village(uuid, numeric, numeric) to authenticated;
grant execute on function public.admin_set_region_locked(integer, boolean) to authenticated;
grant execute on function public.admin_rename_region(integer, text) to authenticated;
grant execute on function public.admin_set_map_image(text) to authenticated;

create or replace function public.admin_set_password(target_id uuid, new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if length(coalesce(new_password, '')) < 6 then
    raise exception 'password too short';
  end if;

  update auth.users
    set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = target_id;
  if not found then raise exception 'user not found'; end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.admin_set_password(uuid, text) to authenticated;

-- ============================================================
-- Ranking y administrador
-- ============================================================

drop view if exists public.ranking;
create view public.ranking as
select
  p.id,
  coalesce(nullif(p.username, ''), 'Señor sin nombre') as username,
  p.race,
  p.pvp_wins,
  p.pvp_losses,
  coalesce((p.state ->> 'campsCleared')::int, 0) as incursiones,
  coalesce((p.state -> 'buildings' ->> 'ayuntamiento')::int, 1) as ayuntamiento,
  p.updated_at
from public.profiles p;

grant select on public.ranking to anon, authenticated;

-- Marca al administrador (se ejecuta después de que exista su cuenta)
update public.profiles
  set is_admin = true
  where lower(email) in ('yordano159753@gmail.com', 'admin@reinos.local');

-- ============================================================
-- Cuenta de administración (usuario: admin / contraseña: Reinos#2026)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

do $admin$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = 'admin@reinos.local' limit 1;

  if admin_id is null then
    admin_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      'admin@reinos.local', extensions.crypt('Reinos#2026', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"username":"admin"}'::jsonb,
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), admin_id, admin_id::text,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@reinos.local'),
      'email', now(), now(), now()
    );
  end if;

  insert into public.profiles (id, username, email, race, state, is_admin)
  values (admin_id, 'admin', 'admin@reinos.local', 'alianza', '{}'::jsonb, true)
  on conflict (id) do update
    set username = 'admin',
        is_admin = true,
        email = 'admin@reinos.local';
end;
$admin$;
