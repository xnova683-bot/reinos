-- WoW Imperial - mundo compartido con regiones poligonales
-- Ejecuta TODO este archivo en Supabase > SQL Editor > Run.
-- Es idempotente: se puede volver a ejecutar sin perder partidas.
-- Registro solo con teléfono (correo interno: <telefono>@reinos.local).
-- Cuenta de administración: usuario "admin", contraseña "Reinos#2026".
-- Confirmación automática: el SQL crea un trigger en auth.users que marca
-- el correo interno como confirmado al registrarse, sin tocar el panel.

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
alter table public.profiles add column if not exists kb bigint not null default 0;

create table if not exists public.regions (
  id serial primary key,
  name text not null,
  points jsonb not null,
  bbox jsonb not null,
  locked boolean not null default true,
  capacity integer not null default 25,
  updated_at timestamptz not null default now()
);

alter table public.regions add column if not exists world_x numeric;
alter table public.regions add column if not exists world_y numeric;
alter table public.regions add column if not exists image_url text;
update public.regions
  set world_x = ((bbox->>'x0')::numeric + (bbox->>'x1')::numeric) / 2
    - ((bbox->>'x1')::numeric - (bbox->>'x0')::numeric) * 0.22,
      world_y = ((bbox->>'y0')::numeric + (bbox->>'y1')::numeric) / 2
    + ((bbox->>'y1')::numeric - (bbox->>'y0')::numeric) * 0.18
where world_x is null or world_y is null;

create table if not exists public.world_settings (
  id integer primary key default 1 check (id = 1),
  map_image text,
  updated_at timestamptz not null default now()
);

alter table public.world_settings add column if not exists maintenance boolean not null default false;
alter table public.world_settings add column if not exists maintenance_message text not null default '';
alter table public.world_settings add column if not exists maintenance_version bigint not null default 0;
alter table public.world_settings add column if not exists resource_speed numeric not null default 1;
alter table public.world_settings add column if not exists movement_speed numeric not null default 1;

insert into public.world_settings (id, map_image)
values (1, null)
on conflict (id) do nothing;

create table if not exists public.road_bends (
  id bigserial primary key,
  region_id integer not null references public.regions (id) on delete cascade,
  road_key text not null,
  t numeric not null check (t > 0.1 and t < 0.9),
  x numeric not null check (x >= 0 and x <= 1),
  y numeric not null check (y >= 0 and y <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, road_key)
);

alter table public.road_bends enable row level security;

create table if not exists public.expeditions (
  id uuid primary key default gen_random_uuid(),
  attacker uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('player', 'npc', 'castle')),
  target_id uuid not null,
  target_name text not null,
  from_region integer references public.regions (id) on delete set null,
  to_region integer references public.regions (id) on delete set null,
  from_x numeric not null,
  from_y numeric not null,
  to_x numeric not null,
  to_y numeric not null,
  path jsonb not null default '[]'::jsonb,
  status text not null default 'outbound' check (status in ('outbound', 'returning', 'done')),
  depart_at timestamptz not null default now(),
  arrive_at timestamptz not null,
  return_at timestamptz not null,
  travel_seconds integer not null check (travel_seconds > 0),
  speed numeric not null default 1,
  result jsonb,
  troops jsonb,
  survivors jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists expeditions_active_idx
  on public.expeditions (status, arrive_at);
create index if not exists expeditions_attacker_idx
  on public.expeditions (attacker, created_at desc);

alter table public.expeditions add column if not exists troops jsonb;
alter table public.expeditions add column if not exists survivors jsonb;

alter table public.expeditions enable row level security;

create table if not exists public.world_maintenance (
  id integer primary key default 1 check (id = 1),
  password_hash text,
  updated_at timestamptz not null default now()
);

insert into public.world_maintenance (id, password_hash)
values (1, null)
on conflict (id) do nothing;

alter table public.world_maintenance enable row level security;

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

create table if not exists public.npcs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_id integer references public.regions (id) on delete set null,
  x numeric,
  y numeric,
  power integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.npcs enable row level security;
drop policy if exists "npcs_read" on public.npcs;
create policy "npcs_read" on public.npcs for select to authenticated using (true);

create table if not exists public.npc_hits (
  attacker uuid not null references public.profiles (id) on delete cascade,
  npc uuid not null references public.npcs (id) on delete cascade,
  last_hit timestamptz not null default now(),
  primary key (attacker, npc)
);

alter table public.npc_hits enable row level security;

create table if not exists public.castles (
  id uuid primary key default gen_random_uuid(),
  region_id integer not null unique references public.regions (id) on delete cascade,
  name text not null,
  x numeric,
  y numeric,
  power integer not null default 330,
  loot integer not null default 800,
  owner uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.castles enable row level security;
drop policy if exists "castles_read" on public.castles;
create policy "castles_read" on public.castles for select to authenticated using (true);

create table if not exists public.castle_hits (
  attacker uuid not null references public.profiles (id) on delete cascade,
  castle uuid not null references public.castles (id) on delete cascade,
  last_hit timestamptz not null default now(),
  primary key (attacker, castle)
);

alter table public.castle_hits enable row level security;

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
  x0 numeric;
  y0 numeric;
  x1 numeric;
  y1 numeric;
  pts jsonb;
begin
  if (select count(*) from public.regions) > 0 then
    return;
  end if;

  for i in 0..19 loop
    col := i % 5;
    row := i / 5;
    x0 := col * 0.2 + 0.004;
    y0 := row * 0.25 + 0.004;
    x1 := (col + 1) * 0.2 - 0.004;
    y1 := (row + 1) * 0.25 - 0.004;
    cx := (x0 + x1) / 2;
    cy := (y0 + y1) / 2;
    pts := jsonb_build_array(
      jsonb_build_array(x0, y0), jsonb_build_array(x1, y0),
      jsonb_build_array(x1, y1), jsonb_build_array(x0, y1)
    );

    insert into public.regions (name, points, bbox, locked, capacity, world_x, world_y)
    values (
      names[i + 1],
      pts,
      jsonb_build_object('x0', x0, 'y0', y0, 'x1', x1, 'y1', y1),
      i > 1,
      25,
      cx - (x1 - x0) * 0.22,
      cy + (y1 - y0) * 0.18
    );
  end loop;
end;
$seed$;

-- ============================================================
-- Aldeas NPC (3 por región)
-- ============================================================

do $npcseed$
declare
  suffixes text[] := array['Vigía', 'Campamento', 'Ruinas'];
  tx numeric[] := array[0.2265, 0.7276, 0.9320];
  ty numeric[] := array[0.1404, 0.8651, 0.5270];
  region record;
  k integer;
  bx numeric;
  oy numeric;
  bw numeric;
  bh numeric;
  sx numeric;
  sy numeric;
begin
  if (select count(*) from public.npcs) > 0 then
    return;
  end if;

  for region in select * from public.regions order by id loop
    bx := (region.bbox->>'x0')::numeric;
    oy := (region.bbox->>'y0')::numeric;
    bw := (region.bbox->>'x1')::numeric - bx;
    bh := (region.bbox->>'y1')::numeric - oy;

    for k in 0..2 loop
      sx := bx + bw / 2 + (tx[k + 1] - 0.5006237573308003) * 0.8 * bw / 0.766161189992368;
      sy := oy + bh / 2 + (ty[k + 1] - 0.46891129262306985) * 0.8 * bh / 0.786633294702648;
      sx := least(bx + bw - 0.002, greatest(bx + 0.002, sx));
      sy := least(oy + bh - 0.002, greatest(oy + 0.002, sy));

      insert into public.npcs (name, region_id, x, y, power)
      values (
        region.name || ' · ' || suffixes[k + 1],
        region.id,
        sx,
        sy,
        60 + k * 40
      );
    end loop;
  end loop;
end $npcseed$;

-- ============================================================
-- Castillo del rey en el centro de cada región
-- ============================================================

do $castleseed$
declare
  region record;
  cx numeric;
  cy numeric;
begin
  if (select count(*) from public.castles) > 0 then
    return;
  end if;

  for region in select * from public.regions order by id loop
    cx := ((region.bbox->>'x0')::numeric + (region.bbox->>'x1')::numeric) / 2;
    cy := ((region.bbox->>'y0')::numeric + (region.bbox->>'y1')::numeric) / 2;

    insert into public.castles (region_id, name, x, y, power, loot)
    values (
      region.id,
      'Castillo de ' || region.name,
      cx, cy,
      300 + region.id * 30,
      800
    );
  end loop;
end $castleseed$;

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
      (case t when 'lanceros' then 6 when 'arqueros' then 11 when 'jinetes' then 18 when 'espadachines' then 15 when 'guardianes' then 10 when 'jinetes_arqueros' then 21 when 'catapultas' then 35 when 'magos' then 28 when 'asesinos' then 42 when 'ballesteros' then 24 when 'piqueros' then 12 when 'lobos_guerra' then 26 when 'elefantes' then 30 when 'nigromantes' then 34 when 'dragones' then 60 when 'honderos' then 9 when 'arquebuseros' then 30 when 'camellos' then 22 when 'osos_guerra' then 20 when 'sacerdotes' then 18 when 'titanes' then 75 else 0 end) * m.atk
      + (case t when 'lanceros' then 8 when 'arqueros' then 4 when 'jinetes' then 10 when 'espadachines' then 15 when 'guardianes' then 30 when 'jinetes_arqueros' then 7 when 'catapultas' then 3 when 'magos' then 12 when 'asesinos' then 5 when 'ballesteros' then 8 when 'piqueros' then 22 when 'lobos_guerra' then 6 when 'elefantes' then 24 when 'nigromantes' then 16 when 'dragones' then 20 when 'honderos' then 3 when 'arquebuseros' then 10 when 'camellos' then 12 when 'osos_guerra' then 24 when 'sacerdotes' then 20 when 'titanes' then 30 else 0 end) * m.def
      + (case t when 'lanceros' then 30 when 'arqueros' then 22 when 'jinetes' then 55 when 'espadachines' then 50 when 'guardianes' then 95 when 'jinetes_arqueros' then 44 when 'catapultas' then 45 when 'magos' then 65 when 'asesinos' then 38 when 'ballesteros' then 40 when 'piqueros' then 60 when 'lobos_guerra' then 50 when 'elefantes' then 140 when 'nigromantes' then 80 when 'dragones' then 120 when 'honderos' then 20 when 'arquebuseros' then 50 when 'camellos' then 65 when 'osos_guerra' then 100 when 'sacerdotes' then 75 when 'titanes' then 180 else 0 end) * m.hp / 4
    )
  ), 0))::integer
  from (values ('lanceros'), ('arqueros'), ('jinetes'), ('espadachines'), ('guardianes'), ('jinetes_arqueros'), ('catapultas'), ('magos'), ('asesinos'), ('ballesteros'), ('piqueros'), ('lobos_guerra'), ('elefantes'), ('nigromantes'), ('dragones'), ('honderos'), ('arquebuseros'), ('camellos'), ('osos_guerra'), ('sacerdotes'), ('titanes')) as x(t), m;
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

create or replace function public.region_hops(p_from integer, p_to integer)
returns integer
language sql
immutable
as $fn$
  select case
    when p_from is null or p_to is null then 0
    when p_from = p_to then 0
    when p_from between 1 and 20 and p_to between 1 and 20 then
      abs(((p_from - 1) % 5) - ((p_to - 1) % 5))
      + abs(((p_from - 1) / 5) - ((p_to - 1) / 5))
    else 99
  end;
$fn$;

create or replace function public.region_route(p_from integer, p_to integer)
returns integer[]
language plpgsql
immutable
as $fn$
declare
  route integer[] := array[p_from];
  c integer := (p_from - 1) % 5;
  r integer := (p_from - 1) / 5;
  tc integer := (p_to - 1) % 5;
  tr integer := (p_to - 1) / 5;
begin
  if p_from = p_to then return route; end if;

  while c <> tc loop
    c := c + case when tc > c then 1 else -1 end;
    route := route || ((r * 5) + c + 1);
  end loop;
  while r <> tr loop
    r := r + case when tr > r then 1 else -1 end;
    route := route || ((r * 5) + c + 1);
  end loop;
  return route;
end;
$fn$;

create or replace function public.expedition_path(
  p_from integer,
  p_to integer,
  ax numeric,
  ay numeric,
  tx numeric,
  ty numeric
)
returns jsonb
language plpgsql
stable
set search_path = public
as $fn$
declare
  pts jsonb := jsonb_build_array(jsonb_build_array(ax, ay));
  rid integer;
  px numeric;
  py numeric;
begin
  if p_from is null or p_to is null then
    return jsonb_build_array(jsonb_build_array(ax, ay), jsonb_build_array(tx, ty));
  end if;

  if p_from <> p_to then
    foreach rid in array public.region_route(p_from, p_to) loop
      select r.world_x, r.world_y into px, py from public.regions r where r.id = rid;
      if px is not null and py is not null then
        pts := pts || jsonb_build_array(jsonb_build_array(px, py));
      end if;
    end loop;
  end if;

  pts := pts || jsonb_build_array(jsonb_build_array(tx, ty));
  return pts;
end;
$fn$;

create or replace function public.expedition_distance(path jsonb)
returns numeric
language plpgsql
immutable
as $fn$
declare
  total numeric := 0;
  i integer;
  ax numeric;
  ay numeric;
  bx numeric;
  ey numeric;
begin
  if path is null or jsonb_array_length(path) < 2 then return 0; end if;
  for i in 0..jsonb_array_length(path) - 2 loop
    ax := (path->i->>0)::numeric;
    ay := (path->i->>1)::numeric;
    bx := (path->(i + 1)->>0)::numeric;
    ey := (path->(i + 1)->>1)::numeric;
    total := total + sqrt(
      power((bx - ax) * 3182, 2) + power((ey - ay) * 2249, 2)
    );
  end loop;
  return total * 1.08;
end;
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
  j bigint;
  jx bigint;
  jy bigint;
  bx numeric;
  oy numeric;
  bw numeric;
  bh numeric;
  lx numeric;
  hx numeric;
  ly numeric;
  hy numeric;
  attempt integer;
  cand_x numeric;
  cand_y numeric;
  px numeric;
  py numeric;
  pos_ok boolean;
  v_min constant numeric := 78;
  poi_min constant numeric := 112;
begin
  if new.x is null or new.y is null then
    if new.region_id is not null then
      select r.* into reg
      from public.regions r
      where r.id = new.region_id
        and r.locked = false
        and (select count(*) from public.profiles p where p.region_id = r.id) < r.capacity;
    end if;

    if reg.id is null then
      select r.* into reg
      from public.regions r
      where r.locked = false
        and (select count(*) from public.profiles p where p.region_id = r.id) < r.capacity
      order by r.id
      limit 1;
    end if;

    if reg.id is not null then
      bx := (reg.bbox->>'x0')::numeric;
      oy := (reg.bbox->>'y0')::numeric;
      bw := (reg.bbox->>'x1')::numeric - bx;
      bh := (reg.bbox->>'y1')::numeric - oy;
      lx := bx + 0.012 * bw;
      hx := bx + bw - 0.012 * bw;
      ly := oy + 0.012 * bh;
      hy := oy + bh - 0.012 * bh;
      j := ('x' || substr(md5(new.id::text), 1, 12))::bit(48)::bigint;
      jx := j % 1000003;
      jy := (j / 1000003) % 1000003;
      new.region_id := reg.id;
      for attempt in 0..2399 loop
        px := lx + (((jx + attempt * 104729) % 1000003)::numeric / 1000003.0) * (hx - lx);
        py := ly + (((jy + attempt * 130363) % 1000033)::numeric / 1000033.0) * (hy - ly);
        pos_ok := public.point_in_polygon(px, py, reg.points);
        if pos_ok then
          pos_ok := not exists (
            select 1 from public.profiles p
            where p.id <> new.id
              and p.x is not null
              and p.y is not null
              and power((p.x - px) * 3182, 2) + power((p.y - py) * 2249, 2) < v_min * v_min
          );
        end if;
        if pos_ok then
          pos_ok := not exists (
            select 1 from public.castles c
            where power((c.x - px) * 3182, 2) + power((c.y - py) * 2249, 2) < poi_min * poi_min
          );
        end if;
        if pos_ok then
          pos_ok := not exists (
            select 1 from public.npcs q
            where power((q.x - px) * 3182, 2) + power((q.y - py) * 2249, 2) < poi_min * poi_min
          );
        end if;
        if pos_ok then
          cand_x := px;
          cand_y := py;
          exit;
        end if;
      end loop;
      new.x := cand_x;
      new.y := cand_y;
    end if;
  end if;

  if new.phone is null and new.email is not null then
    new.phone := substring(new.email from '^([0-9]{6,15})@reinos\\.local$');
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

-- La KB solo la puede entregar el administrador
create or replace function public.guard_kb()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;
  if new.kb is distinct from old.kb
     and not coalesce(public.is_admin(), false)
     and coalesce(current_setting('reinos.kb_ok', true), '') <> '1' then
    raise exception 'not allowed';
  end if;
  return new;
end;
$fn$;

drop trigger if exists profiles_guard_kb on public.profiles;
create trigger profiles_guard_kb
  before insert or update on public.profiles
  for each row execute function public.guard_kb();

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

  perform public.resolve_expeditions();

  select jsonb_build_object(
    'me', coalesce((
      select jsonb_build_object(
        'id', p.id, 'admin', p.is_admin, 'region', p.region_id,
        'wins', p.pvp_wins,
        'kb', p.kb,
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
        'wins', p.pvp_wins,
        'admin', coalesce(p.is_admin, false)
      ) order by p.pvp_wins desc, p.updated_at desc)
      from public.profiles p
      where p.x is not null and coalesce(p.is_admin, false) = false
    ), '[]'::jsonb),
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'points', r.points,
        'bbox', r.bbox,
        'world_x', r.world_x,
        'world_y', r.world_y,
        'image_url', r.image_url,
        'locked', r.locked,
        'capacity', r.capacity,
        'villages', (select count(*) from public.profiles p
          where p.region_id = r.id and coalesce(p.is_admin, false) = false)
      ) order by r.id)
      from public.regions r
    ), '[]'::jsonb),
    'castles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'region', c.region_id, 'name', c.name,
        'x', c.x, 'y', c.y, 'power', c.power, 'loot', c.loot,
        'owner', c.owner,
        'owner_name', coalesce(nullif(p.username, ''), 'Señor sin nombre'),
        'defense', greatest(c.power, coalesce(public.state_power(p.state) * 1.15, 0))
      ) order by c.region_id)
      from public.castles c
      left join public.profiles p on p.id = c.owner
    ), '[]'::jsonb),
    'npcs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'name', n.name, 'region', n.region_id,
        'x', n.x, 'y', n.y, 'power', n.power
      ) order by n.id)
      from public.npcs n
    ), '[]'::jsonb),
    'speed', coalesce((
      select s.resource_speed from public.world_settings s where s.id = 1
    ), 1),
    'move_speed', coalesce((
      select s.movement_speed from public.world_settings s where s.id = 1
    ), 1),
    'expeditions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'attacker', e.attacker,
        'attacker_name', coalesce(nullif(p.username, ''), 'Señor sin nombre'),
        'race', p.race,
        'target_type', e.target_type,
        'target_id', e.target_id,
        'target_name', e.target_name,
        'from_region', e.from_region,
        'to_region', e.to_region,
        'from_x', e.from_x,
        'from_y', e.from_y,
        'to_x', e.to_x,
        'to_y', e.to_y,
        'path', e.path,
        'status', e.status,
        'troops', e.troops,
        'survivors', e.survivors,
        'depart_at', e.depart_at,
        'arrive_at', e.arrive_at,
        'return_at', e.return_at,
        'travel_seconds', e.travel_seconds,
        'speed', e.speed,
        'result', e.result,
        'resolved_at', e.resolved_at,
        'created_at', e.created_at
      ) order by e.created_at desc)
      from (
        select * from public.expeditions x
        where x.status in ('outbound', 'returning')
           or (uid is not null and x.attacker = uid and x.resolved_at > now() - interval '10 minutes')
        order by x.created_at desc
        limit 40
      ) e
      left join public.profiles p on p.id = e.attacker
    ), '[]'::jsonb),
    'maintenance', coalesce((
      select jsonb_build_object(
        'active', coalesce(s.maintenance, false),
        'message', coalesce(s.maintenance_message, ''),
        'version', coalesce(s.maintenance_version, 0),
        'locked', (select wm.password_hash is not null from public.world_maintenance wm where wm.id = 1)
      )
      from public.world_settings s where s.id = 1
    ), '{"active":false}'::jsonb),
    'road_bends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'region', b.region_id, 'key', b.road_key,
        't', b.t, 'x', b.x, 'y', b.y
      ) order by b.id)
      from public.road_bends b
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
        'wins', p.pvp_wins,
        'kb', p.kb
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

drop function if exists public.resolve_rival_battle(uuid, uuid);

create or replace function public.resolve_rival_battle(p_attacker uuid, target_id uuid, p_modifier numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := p_attacker;
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

  if exists (
    select 1 from public.regions rg
    where rg.id = d.region_id
      and rg.locked
      and rg.id is distinct from a.region_id
  ) then
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

  a_power := public.state_power(a.state) * greatest(0.25, coalesce(p_modifier, 1));
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

  foreach t in array array['lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'] loop
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

revoke all on function public.resolve_rival_battle(uuid, uuid, numeric) from public, anon, authenticated;

create or replace function public.attack_rival(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return public.resolve_rival_battle(auth.uid(), target_id);
end;
$fn$;

grant execute on function public.attack_rival(uuid) to authenticated;

-- ============================================================
-- Incursiones contra aldeas NPC
-- ============================================================

drop function if exists public.resolve_npc_battle(uuid, uuid);

create or replace function public.resolve_npc_battle(p_attacker uuid, npc_id uuid, p_modifier numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := p_attacker;
  a public.profiles%rowtype;
  n public.npcs%rowtype;
  a_power numeric;
  a_eff numeric;
  e_eff numeric;
  won boolean;
  loss_frac numeric;
  a_state jsonb;
  losses integer := 0;
  total_loot integer := 0;
  share integer;
  cap numeric;
  cur numeric;
  gain numeric;
  cnt integer;
  dead integer;
  res text;
  t text;
  ts bigint := (extract(epoch from now()) * 1000)::bigint;
  battle_text text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into a from public.profiles where id = me for update;
  if not found then raise exception 'attacker profile missing'; end if;
  select * into n from public.npcs where id = npc_id;
  if not found then raise exception 'npc not found'; end if;

  if exists (
    select 1 from public.regions rg
    where rg.id = n.region_id
      and rg.locked
      and rg.id is distinct from a.region_id
  ) then
    raise exception 'region locked';
  end if;

  if exists (
    select 1 from public.npc_hits
    where attacker = me and npc = npc_id and last_hit > now() - interval '5 minutes'
  ) then
    raise exception 'cooldown';
  end if;

  a_power := public.state_power(a.state) * greatest(0.25, coalesce(p_modifier, 1));
  if a_power <= 0 then raise exception 'no troops'; end if;

  a_eff := a_power * (0.9 + random() * 0.2);
  e_eff := n.power * (0.9 + random() * 0.2);
  won := a_eff > e_eff;

  if won then
    loss_frac := least(0.55, greatest(0.02, (e_eff / greatest(a_eff, 1)) * 0.3));
  else
    loss_frac := least(0.85, greatest(0.45, 0.45 + (e_eff / greatest(a_eff, 1)) * 0.25));
  end if;

  a_state := jsonb_set(coalesce(a.state, '{}'::jsonb), '{troops}', coalesce(a.state->'troops', '{}'::jsonb), true);
  a_state := jsonb_set(a_state, '{res}', coalesce(a.state->'res', '{}'::jsonb), true);

  foreach t in array array['lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'] loop
    cnt := coalesce((a_state->'troops'->>t)::integer, 0);
    dead := least(cnt, round(cnt * loss_frac)::integer);
    a_state := jsonb_set(a_state, array['troops', t], to_jsonb(cnt - dead), true);
    losses := losses + dead;
  end loop;

  if won then
    cap := public.state_storage(a.state);
    share := round((n.power * 1.5 + 150) / 4);
    foreach res in array array['oro', 'madera', 'comida', 'piedra'] loop
      cur := coalesce((a_state->'res'->>res)::numeric, 0);
      gain := least(share, greatest(0, cap - cur));
      if gain > 0 then
        a_state := jsonb_set(a_state, array['res', res], to_jsonb(cur + gain), true);
        total_loot := total_loot + gain::integer;
      end if;
    end loop;
  end if;

  battle_text := case
    when won then 'Victoria en ' || n.name || ': saqueaste ' || total_loot || ' recursos. Bajas: ' || losses || '.'
    else 'Derrota en ' || n.name || '. Perdiste ' || losses || ' tropas y no hubo botín.'
  end;

  a_state := jsonb_set(a_state, '{log}',
    jsonb_build_array(jsonb_build_object('t', ts, 'text', battle_text, 'kind', case when won then 'good' else 'bad' end))
      || coalesce(a.state->'log', '[]'::jsonb), true);

  update public.profiles set state = a_state, updated_at = now() where id = me;

  insert into public.npc_hits (attacker, npc, last_hit)
  values (me, npc_id, now())
  on conflict (attacker, npc) do update set last_hit = excluded.last_hit;

  return jsonb_build_object(
    'win', won, 'loot', total_loot, 'attacker_losses', losses,
    'target', n.name, 'target_power', n.power, 'attacker_power', a_power,
    'text', battle_text
  );
end;
$fn$;

revoke all on function public.resolve_npc_battle(uuid, uuid, numeric) from public, anon, authenticated;

create or replace function public.attack_npc(npc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return public.resolve_npc_battle(auth.uid(), npc_id);
end;
$fn$;

grant execute on function public.attack_npc(uuid) to authenticated;

-- ============================================================
-- Conquista del castillo del rey
-- ============================================================

drop function if exists public.resolve_castle_battle(uuid, uuid);

create or replace function public.resolve_castle_battle(p_attacker uuid, castle_id uuid, p_modifier numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := p_attacker;
  a public.profiles%rowtype;
  o public.profiles%rowtype;
  c public.castles%rowtype;
  has_owner boolean;
  a_power numeric;
  d_power numeric;
  a_eff numeric;
  d_eff numeric;
  won boolean;
  a_loss_frac numeric;
  d_loss_frac numeric;
  a_state jsonb;
  d_state jsonb;
  losses integer := 0;
  d_losses integer := 0;
  total_loot integer := 0;
  share integer;
  cap numeric;
  cur numeric;
  gain numeric;
  cnt integer;
  dead integer;
  res text;
  t text;
  ts bigint := (extract(epoch from now()) * 1000)::bigint;
  before_name text;
  battle_text text;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into a from public.profiles where id = me for update;
  if not found then raise exception 'attacker profile missing'; end if;

  select * into c from public.castles where id = castle_id for update;
  if not found then raise exception 'castle not found'; end if;

  if exists (
    select 1 from public.regions rg
    where rg.id = c.region_id
      and rg.locked
      and rg.id is distinct from a.region_id
  ) then
    raise exception 'region locked';
  end if;

  has_owner := c.owner is not null;
  if has_owner and c.owner = me then raise exception 'already yours'; end if;

  if exists (
    select 1 from public.castle_hits
    where attacker = me and castle = castle_id and last_hit > now() - interval '10 minutes'
  ) then
    raise exception 'cooldown';
  end if;

  a_power := public.state_power(a.state) * greatest(0.25, coalesce(p_modifier, 1));
  if a_power <= 0 then raise exception 'no troops'; end if;

  d_power := c.power;
  if has_owner then
    select * into o from public.profiles where id = c.owner for update;
    if found then
      d_power := greatest(c.power, public.state_power(o.state) * 1.15);
      before_name := coalesce(nullif(o.username, ''), 'Señor sin nombre');
    end if;
  end if;
  if before_name is null then before_name := 'el rey anterior'; end if;

  a_eff := a_power * (0.9 + random() * 0.25);
  d_eff := d_power * (0.9 + random() * 0.2) * 1.1;
  won := a_eff > d_eff;

  if won then
    a_loss_frac := least(0.55, greatest(0.03, (d_eff / greatest(a_eff, 1)) * 0.3));
    d_loss_frac := least(0.5, greatest(0.01, (a_eff / greatest(d_eff, 1)) * 0.3));
  else
    a_loss_frac := least(0.85, greatest(0.45, 0.45 + (d_eff / greatest(a_eff, 1)) * 0.25));
    d_loss_frac := least(0.2, greatest(0.01, (a_eff / greatest(d_eff, 1)) * 0.1));
  end if;

  a_state := jsonb_set(coalesce(a.state, '{}'::jsonb), '{troops}', coalesce(a.state->'troops', '{}'::jsonb), true);
  a_state := jsonb_set(a_state, '{res}', coalesce(a.state->'res', '{}'::jsonb), true);

  foreach t in array array['lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'] loop
    cnt := coalesce((a_state->'troops'->>t)::integer, 0);
    dead := least(cnt, round(cnt * a_loss_frac)::integer);
    a_state := jsonb_set(a_state, array['troops', t], to_jsonb(cnt - dead), true);
    losses := losses + dead;
  end loop;

  if has_owner and o.id is not null then
    d_state := jsonb_set(coalesce(o.state, '{}'::jsonb), '{troops}', coalesce(o.state->'troops', '{}'::jsonb), true);
    foreach t in array array['lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'] loop
      cnt := coalesce((d_state->'troops'->>t)::integer, 0);
      dead := least(cnt, round(cnt * d_loss_frac)::integer);
      d_state := jsonb_set(d_state, array['troops', t], to_jsonb(cnt - dead), true);
      d_losses := d_losses + dead;
    end loop;
  end if;

  if won then
    cap := public.state_storage(a.state);
    share := round(c.loot / 4);
    foreach res in array array['oro', 'madera', 'comida', 'piedra'] loop
      cur := coalesce((a_state->'res'->>res)::numeric, 0);
      gain := least(share, greatest(0, cap - cur));
      if gain > 0 then
        a_state := jsonb_set(a_state, array['res', res], to_jsonb(cur + gain), true);
        total_loot := total_loot + gain::integer;
      end if;
    end loop;
  end if;

  battle_text := case
    when won then coalesce(nullif(a.username, ''), 'Un señor') || ' conquistó ' || c.name || ' y fue proclamado rey'
      || ' · botín ' || total_loot || ' · bajas ' || losses || '/' || d_losses
    else coalesce(nullif(a.username, ''), 'Un señor') || ' no pudo tomar ' || c.name
      || ' · bajas ' || losses || '/' || d_losses
  end;

  a_state := jsonb_set(a_state, '{log}',
    jsonb_build_array(jsonb_build_object(
      't', ts,
      'text', case when won
        then 'Conquistaste ' || c.name || ' y te proclamaron rey. Botín: ' || total_loot || ' recursos. Bajas: ' || losses || '.'
        else 'No pudiste tomar ' || c.name || '. Bajas: ' || losses || '.'
      end,
      'kind', case when won then 'good' else 'bad' end
    )) || coalesce(a.state->'log', '[]'::jsonb), true);

  if has_owner and o.id is not null then
    d_state := jsonb_set(d_state, '{log}',
      jsonb_build_array(jsonb_build_object(
        't', ts,
        'text', case when won
          then coalesce(nullif(a.username, ''), 'Un señor') || ' te arrebató ' || c.name || '. Ya no eres rey.'
          else 'Defendiste ' || c.name || ' de ' || coalesce(nullif(a.username, ''), 'un señor') || '. Sigues siendo rey.'
        end,
        'kind', case when won then 'bad' else 'good' end
      )) || coalesce(o.state->'log', '[]'::jsonb), true);

    update public.profiles set state = d_state, updated_at = now() where id = o.id;
  end if;

  update public.profiles set state = a_state, updated_at = now() where id = me;

  if won then
    update public.castles set owner = me, updated_at = now() where id = castle_id;
  end if;

  insert into public.castle_hits (attacker, castle, last_hit)
  values (me, castle_id, now())
  on conflict (attacker, castle) do update set last_hit = excluded.last_hit;

  insert into public.world_events (attacker, target, winner, loot, text)
  values (
    coalesce(nullif(a.username, ''), 'Señor sin nombre'),
    c.name,
    case when won then 'attacker' else 'defender' end,
    total_loot,
    battle_text
  );

  return jsonb_build_object(
    'win', won, 'loot', total_loot, 'attacker_losses', losses, 'defender_losses', d_losses,
    'target', c.name, 'target_power', d_power, 'owner_before', before_name,
    'owner_after', case when won then coalesce(nullif(a.username, ''), 'Señor sin nombre') else before_name end,
    'text', battle_text
  );
end;
$fn$;

revoke all on function public.resolve_castle_battle(uuid, uuid, numeric) from public, anon, authenticated;

create or replace function public.attack_castle(castle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return public.resolve_castle_battle(auth.uid(), castle_id);
end;
$fn$;

grant execute on function public.attack_castle(uuid) to authenticated;

-- ============================================================
-- Marchas entre regiones: portales Mundo, caminos y expediciones
-- ============================================================

create or replace function public.resolve_expeditions()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  e public.expeditions%rowtype;
  res jsonb;
  home_troops jsonb;
  surv jsonb;
  merged jsonb;
  tkey text;
  troops_left bigint;
  changed integer := 0;
begin
  for e in
    select * from public.expeditions
    where status = 'outbound' and arrive_at <= now()
    order by arrive_at
    for update skip locked
  loop
    home_troops := '{}'::jsonb;
    if e.troops is not null then
      select p.state->'troops' into home_troops from public.profiles p where p.id = e.attacker;
      home_troops := coalesce(home_troops, '{}'::jsonb);
      update public.profiles
        set state = jsonb_set(state, '{troops}', e.troops, true)
        where id = e.attacker;
    end if;

    begin
      if e.target_type = 'player' then
        res := public.resolve_rival_battle(
          e.attacker, e.target_id,
          case when e.from_region is distinct from e.to_region then 0.75 else 1 end
        );
      elsif e.target_type = 'npc' then
        res := public.resolve_npc_battle(
          e.attacker, e.target_id,
          case when e.from_region is distinct from e.to_region then 0.75 else 1 end
        );
        if coalesce((res->>'win')::boolean, false) then
          insert into public.world_events (attacker, target, winner, loot, text)
          values (
            (select coalesce(nullif(p.username, ''), 'Señor sin nombre') from public.profiles p where p.id = e.attacker),
            e.target_name,
            'attacker',
            coalesce((res->>'loot')::integer, 0),
            coalesce(res->>'text', 'Incursión completada')
          );
        end if;
      else
        res := public.resolve_castle_battle(
          e.attacker, e.target_id,
          case when e.from_region is distinct from e.to_region then 0.75 else 1 end
        );
      end if;
    exception when others then
      res := jsonb_build_object(
        'win', false,
        'error', true,
        'text', case
          when SQLERRM = 'target shielded' then 'El objetivo activó un escudo y la marcha regresa sin combatir.'
          when SQLERRM = 'region locked' then 'La región fue bloqueada y la marcha regresa sin combatir.'
          when SQLERRM = 'target not found' or SQLERRM = 'npc not found' or SQLERRM = 'castle not found'
            then 'El objetivo ya no existe y la marcha regresa sin combatir.'
          when SQLERRM = 'cooldown' then 'El objetivo aún estaba en tiempo de espera y la marcha regresa.'
          when SQLERRM = 'no troops' then 'No quedaban tropas disponibles al llegar.'
          when SQLERRM = 'already yours' then 'El castillo ya era tuyo al llegar.'
          else 'La marcha no pudo combatir: ' || SQLERRM
        end
      );
    end;

    select p.state->'troops' into surv from public.profiles p where p.id = e.attacker;
    surv := coalesce(surv, '{}'::jsonb);

    troops_left := coalesce((surv->>'lanceros')::bigint, 0)
      + coalesce((surv->>'arqueros')::bigint, 0)
      + coalesce((surv->>'jinetes')::bigint, 0)
      + coalesce((surv->>'espadachines')::bigint, 0)
      + coalesce((surv->>'guardianes')::bigint, 0)
      + coalesce((surv->>'jinetes_arqueros')::bigint, 0)
      + coalesce((surv->>'catapultas')::bigint, 0)
      + coalesce((surv->>'magos')::bigint, 0)
      + coalesce((surv->>'asesinos')::bigint, 0)
      + coalesce((surv->>'ballesteros')::bigint, 0)
      + coalesce((surv->>'piqueros')::bigint, 0)
      + coalesce((surv->>'lobos_guerra')::bigint, 0)
      + coalesce((surv->>'elefantes')::bigint, 0)
      + coalesce((surv->>'nigromantes')::bigint, 0)
      + coalesce((surv->>'dragones')::bigint, 0)
      + coalesce((surv->>'honderos')::bigint, 0)
      + coalesce((surv->>'arquebuseros')::bigint, 0)
      + coalesce((surv->>'camellos')::bigint, 0)
      + coalesce((surv->>'osos_guerra')::bigint, 0)
      + coalesce((surv->>'sacerdotes')::bigint, 0)
      + coalesce((surv->>'titanes')::bigint, 0);

    if e.troops is not null then
      merged := home_troops;
      foreach tkey in array array['lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'] loop
        merged := jsonb_set(
          merged,
          array[tkey],
          to_jsonb(coalesce((home_troops->>tkey)::integer, 0) + coalesce((surv->>tkey)::integer, 0)),
          true
        );
      end loop;
      update public.profiles
        set state = jsonb_set(state, '{troops}', merged, true), updated_at = now()
        where id = e.attacker;
    end if;

    if troops_left > 0 then
      update public.expeditions
        set status = 'returning',
            result = res,
            survivors = surv,
            resolved_at = now(),
            return_at = e.arrive_at + make_interval(secs => e.travel_seconds)
        where id = e.id;
    else
      update public.expeditions
        set status = 'done',
            result = res,
            survivors = surv,
            resolved_at = now(),
            return_at = now()
        where id = e.id;
    end if;
    changed := changed + 1;
  end loop;

  update public.expeditions
    set status = 'done'
    where status = 'returning' and return_at <= now();

  delete from public.expeditions
    where status = 'done' and resolved_at < now() - interval '7 days';

  return changed;
end;
$fn$;

revoke all on function public.resolve_expeditions() from public, anon, authenticated;

drop function if exists public.start_expedition(text, uuid);

create or replace function public.start_expedition(p_target_type text, p_target_id uuid, p_troops jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  a public.profiles%rowtype;
  d public.profiles%rowtype;
  n public.npcs%rowtype;
  c public.castles%rowtype;
  target_region integer;
  target_x numeric;
  target_y numeric;
  target_name text;
  path jsonb;
  dist numeric;
  move_speed numeric := 1;
  secs integer;
  start_at timestamptz := now();
  row_out public.expeditions%rowtype;
  sent jsonb := '{}'::jsonb;
  home jsonb;
  hops integer := 0;
  food_cost integer := 0;
  tkey text;
  want integer;
  have integer;
  total integer := 0;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_target_type not in ('player', 'npc', 'castle') then raise exception 'invalid target'; end if;

  perform public.resolve_expeditions();

  select * into a from public.profiles where id = me for update;
  if not found then raise exception 'attacker profile missing'; end if;
  if a.region_id is null or a.x is null or a.y is null then raise exception 'no village'; end if;

  if exists (
    select 1 from public.expeditions e
    where e.attacker = me and e.status in ('outbound', 'returning')
  ) then
    raise exception 'expedition active';
  end if;

  if p_target_type = 'player' then
    select * into d from public.profiles where id = p_target_id;
    if not found then raise exception 'target not found'; end if;
    if d.id = me then raise exception 'cannot attack yourself'; end if;
    if coalesce(d.is_admin, false) then raise exception 'target not found'; end if;
    if d.shield_until is not null and d.shield_until > now() then raise exception 'target shielded'; end if;
    if exists (
      select 1 from public.pvp_hits h
      where h.attacker = me and h.target = p_target_id and h.last_hit > now() - interval '5 minutes'
    ) then raise exception 'cooldown'; end if;

    target_region := d.region_id;
    target_x := d.x;
    target_y := d.y;
    target_name := coalesce(nullif(d.username, ''), 'Señor sin nombre');
  elsif p_target_type = 'npc' then
    select * into n from public.npcs where id = p_target_id;
    if not found then raise exception 'npc not found'; end if;
    if exists (
      select 1 from public.npc_hits h
      where h.attacker = me and h.npc = p_target_id and h.last_hit > now() - interval '5 minutes'
    ) then raise exception 'cooldown'; end if;

    target_region := n.region_id;
    target_x := n.x;
    target_y := n.y;
    target_name := n.name;
  else
    select * into c from public.castles where id = p_target_id;
    if not found then raise exception 'castle not found'; end if;
    if c.owner = me then raise exception 'already yours'; end if;
    if exists (
      select 1 from public.castle_hits h
      where h.attacker = me and h.castle = p_target_id and h.last_hit > now() - interval '10 minutes'
    ) then raise exception 'cooldown'; end if;

    target_region := c.region_id;
    target_x := c.x;
    target_y := c.y;
    target_name := c.name;
  end if;

  if target_x is null or target_y is null then raise exception 'target not found'; end if;
  if exists (
    select 1 from public.regions r
    where r.id = target_region
      and r.locked
      and r.id is distinct from a.region_id
  ) then raise exception 'region locked'; end if;

  hops := public.region_hops(a.region_id, target_region);
  if hops >= 1 then
    food_cost := 60 * hops;
    if coalesce((a.state->'res'->>'comida')::numeric, 0) < food_cost then
      raise exception 'not enough food';
    end if;
  end if;

  if p_troops is null or jsonb_typeof(p_troops) <> 'object' then
    sent := coalesce(a.state->'troops', '{}'::jsonb);
  else
    foreach tkey in array array['lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'] loop
      want := greatest(0, coalesce((p_troops->>tkey)::integer, 0));
      sent := jsonb_set(sent, array[tkey], to_jsonb(want), true);
    end loop;
  end if;

  home := coalesce(a.state->'troops', '{}'::jsonb);
  foreach tkey in array array['lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'] loop
    want := coalesce((sent->>tkey)::integer, 0);
    have := coalesce((home->>tkey)::integer, 0);
    if want > have then raise exception 'not enough troops'; end if;
    total := total + want;
    home := jsonb_set(home, array[tkey], to_jsonb(have - want), true);
  end loop;
  if total <= 0 then raise exception 'no troops'; end if;

  update public.profiles
    set state = jsonb_set(
        jsonb_set(state, '{troops}', home, true),
        '{res,comida}',
        to_jsonb(coalesce((a.state->'res'->>'comida')::numeric, 0) - food_cost),
        true
      ),
      updated_at = now()
    where id = me;

  select coalesce(least(10, greatest(0.1, s.movement_speed)), 1)
    into move_speed
    from public.world_settings s where s.id = 1;
  move_speed := coalesce(move_speed, 1);

  path := public.expedition_path(
    a.region_id, target_region,
    a.x, a.y,
    target_x, target_y
  );
  dist := public.expedition_distance(path);
  secs := greatest(10, least(240, round(dist / (45 * move_speed))::integer));
  if hops > 0 then
    secs := least(240, greatest(10, round(secs * (1 + 0.5 * hops))::integer));
  end if;

  insert into public.expeditions (
    attacker, target_type, target_id, target_name,
    from_region, to_region, from_x, from_y, to_x, to_y,
    path, status, depart_at, arrive_at, return_at, travel_seconds, speed, troops
  ) values (
    me, p_target_type, p_target_id, target_name,
    a.region_id, target_region, a.x, a.y, target_x, target_y,
    path, 'outbound', start_at,
    start_at + make_interval(secs => secs),
    start_at + make_interval(secs => secs * 2),
    secs, move_speed, sent
  )
  returning * into row_out;

  return jsonb_build_object(
    'ok', true,
    'id', row_out.id,
    'target', target_name,
    'target_type', p_target_type,
    'path', row_out.path,
    'travel_seconds', row_out.travel_seconds,
    'depart_at', row_out.depart_at,
    'arrive_at', row_out.arrive_at,
    'return_at', row_out.return_at,
    'move_speed', move_speed,
    'troops', sent,
    'hops', hops,
    'food_cost', food_cost,
    'fatigue', case when hops > 0 then 0.75 else 1 end,
    'distance', round(dist, 3)
  );
end;
$fn$;

grant execute on function public.start_expedition(text, uuid, jsonb) to authenticated;

-- ============================================================
-- Mercado entre jugadores (trueque de recursos y tropas por KB)
-- ============================================================

create table if not exists public.market_orders (
  id uuid primary key default gen_random_uuid(),
  player uuid not null references public.profiles (id) on delete cascade,
  side text not null check (side = 'sell'),
  asset text not null check (asset in ('oro', 'madera', 'comida', 'piedra', 'lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes')),
  qty bigint not null check (qty > 0),
  remaining bigint not null check (remaining >= 0),
  price bigint not null check (price > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.market_orders drop constraint if exists market_orders_side_check;
alter table public.market_orders add constraint market_orders_side_check check (side = 'sell');
alter table public.market_orders drop constraint if exists market_orders_asset_check;
alter table public.market_orders add constraint market_orders_asset_check
  check (asset in ('oro', 'madera', 'comida', 'piedra', 'lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes'));

create index if not exists market_orders_active_idx on public.market_orders (created_at desc) where remaining > 0;

alter table public.market_orders enable row level security;
drop policy if exists "market_orders_read" on public.market_orders;
create policy "market_orders_read" on public.market_orders for select to authenticated using (true);

create or replace function public.market_take(s jsonb, asset text, qty bigint)
returns jsonb
language plpgsql
as $fn$
declare
  have numeric;
begin
  s := coalesce(s, '{}'::jsonb);
  s := jsonb_set(s, '{res}', coalesce(s->'res', '{}'::jsonb), true);
  s := jsonb_set(s, '{troops}', coalesce(s->'troops', '{}'::jsonb), true);

  if asset in ('oro', 'madera', 'comida', 'piedra') then
    have := coalesce((s->'res'->>asset)::numeric, 0);
    if have < qty then raise exception 'not enough'; end if;
    s := jsonb_set(s, array['res', asset], to_jsonb(have - qty), true);
  elsif asset in ('lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes') then
    have := coalesce((s->'troops'->>asset)::numeric, 0);
    if have < qty then raise exception 'not enough'; end if;
    s := jsonb_set(s, array['troops', asset], to_jsonb(have - qty), true);
  else
    raise exception 'invalid asset';
  end if;
  return s;
end;
$fn$;

create or replace function public.market_give(s jsonb, asset text, qty bigint, cap numeric)
returns jsonb
language plpgsql
as $fn$
declare
  cur numeric;
begin
  s := coalesce(s, '{}'::jsonb);
  s := jsonb_set(s, '{res}', coalesce(s->'res', '{}'::jsonb), true);
  s := jsonb_set(s, '{troops}', coalesce(s->'troops', '{}'::jsonb), true);

  if asset in ('oro', 'madera', 'comida', 'piedra') then
    cur := coalesce((s->'res'->>asset)::numeric, 0);
    if cap is not null and cur + qty > cap then raise exception 'storage full'; end if;
    s := jsonb_set(s, array['res', asset], to_jsonb(cur + qty), true);
  elsif asset in ('lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes') then
    cur := coalesce((s->'troops'->>asset)::numeric, 0);
    s := jsonb_set(s, array['troops', asset], to_jsonb(cur + qty), true);
  else
    raise exception 'invalid asset';
  end if;
  return s;
end;
$fn$;

create or replace function public.market_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id,
      'side', o.side,
      'asset', o.asset,
      'qty', o.qty,
      'remaining', o.remaining,
      'price', o.price,
      'player', o.player,
      'name', coalesce(nullif(p.username, ''), 'Señor sin nombre'),
      'mine', o.player = uid,
      'at', o.created_at
    ) order by o.created_at desc)
    from public.market_orders o
    join public.profiles p on p.id = o.player
    where o.remaining > 0 and o.side = 'sell'
  ), '[]'::jsonb);
end;
$fn$;

grant execute on function public.market_list() to authenticated;

create or replace function public.market_post(p_side text, p_asset text, p_qty bigint, p_price bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  a public.profiles%rowtype;
  new_state jsonb;
  total bigint;
  oid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_side is distinct from 'sell' then raise exception 'only sell offers allowed'; end if;
  if p_asset not in ('oro', 'madera', 'comida', 'piedra', 'lanceros', 'arqueros', 'jinetes', 'espadachines', 'guardianes', 'jinetes_arqueros', 'catapultas', 'magos', 'asesinos', 'ballesteros', 'piqueros', 'lobos_guerra', 'elefantes', 'nigromantes', 'dragones', 'honderos', 'arquebuseros', 'camellos', 'osos_guerra', 'sacerdotes', 'titanes') then
    raise exception 'invalid asset';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000000000 then raise exception 'invalid qty'; end if;
  if p_price is null or p_price <= 0 or p_price > 1000000000 then raise exception 'invalid price'; end if;

  if (select count(*) from public.market_orders where player = me and remaining > 0) >= 20 then
    raise exception 'too many orders';
  end if;

  select * into a from public.profiles where id = me for update;
  if not found then raise exception 'profile missing'; end if;

  new_state := public.market_take(a.state, p_asset, p_qty);
  update public.profiles set state = new_state, updated_at = now() where id = me;

  insert into public.market_orders (player, side, asset, qty, remaining, price)
  values (me, p_side, p_asset, p_qty, p_qty, p_price)
  returning id into oid;

  return jsonb_build_object('ok', true, 'id', oid);
end;
$fn$;

grant execute on function public.market_post(text, text, bigint, bigint) to authenticated;

create or replace function public.market_fill(p_order_id uuid, p_qty bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  o public.market_orders%rowtype;
  buyer public.profiles%rowtype;
  seller public.profiles%rowtype;
  fill bigint;
  cost bigint;
  buyer_state jsonb;
  seller_state jsonb;
  seller_id uuid;
  buyer_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'invalid qty'; end if;

  select * into o from public.market_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.remaining <= 0 then raise exception 'closed'; end if;
  if o.side <> 'sell' then raise exception 'only sell orders'; end if;
  if o.player = me then raise exception 'own order'; end if;

  fill := least(p_qty, o.remaining);
  cost := fill * o.price;

  if o.side = 'sell' then
    buyer_id := me;
    seller_id := o.player;
  else
    buyer_id := o.player;
    seller_id := me;
  end if;

  select * into buyer from public.profiles where id = buyer_id for update;
  select * into seller from public.profiles where id = seller_id for update;
  if buyer.id is null or seller.id is null then raise exception 'profile missing'; end if;

  if o.side = 'sell' then
    if buyer.kb < cost then raise exception 'not enough kb'; end if;
    buyer_state := public.market_give(buyer.state, o.asset, fill, public.state_storage(buyer.state));
    perform set_config('reinos.kb_ok', '1', true);
    update public.profiles set state = buyer_state, kb = kb - cost, updated_at = now() where id = buyer_id;
    update public.profiles set kb = kb + cost, updated_at = now() where id = seller_id;
  else
    seller_state := public.market_take(seller.state, o.asset, fill);
    buyer_state := public.market_give(buyer.state, o.asset, fill, public.state_storage(buyer.state));
    perform set_config('reinos.kb_ok', '1', true);
    update public.profiles set state = seller_state, kb = kb + cost, updated_at = now() where id = seller_id;
    update public.profiles set state = buyer_state, updated_at = now() where id = buyer_id;
  end if;

  update public.market_orders
    set remaining = remaining - fill, updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true, 'qty', fill, 'price', o.price, 'total', cost,
    'asset', o.asset, 'side', o.side,
    'buyer', coalesce(nullif(buyer.username, ''), 'Señor sin nombre'),
    'seller', coalesce(nullif(seller.username, ''), 'Señor sin nombre')
  );
end;
$fn$;

grant execute on function public.market_fill(uuid, bigint) to authenticated;

create or replace function public.market_cancel(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
  o public.market_orders%rowtype;
  a public.profiles%rowtype;
  new_state jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select * into o from public.market_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.player <> me then raise exception 'not yours'; end if;
  if o.remaining <= 0 then return jsonb_build_object('ok', true, 'returned', 0); end if;

  select * into a from public.profiles where id = me for update;

  if o.side = 'sell' then
    new_state := public.market_give(a.state, o.asset, o.remaining, public.state_storage(a.state));
    update public.profiles set state = new_state, updated_at = now() where id = me;
  else
    perform set_config('reinos.kb_ok', '1', true);
    update public.profiles set kb = kb + o.remaining * o.price, updated_at = now() where id = me;
  end if;

  update public.market_orders set remaining = 0, updated_at = now() where id = p_order_id;

  return jsonb_build_object('ok', true, 'returned', o.remaining);
end;
$fn$;

grant execute on function public.market_cancel(uuid) to authenticated;

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
    nx := (pt->>0)::numeric;
    ny := (pt->>1)::numeric;
    minx := least(minx, nx); maxx := greatest(maxx, nx);
    miny := least(miny, ny); maxy := greatest(maxy, ny);
  end loop;

  dx := least(0.995 - maxx, greatest(0.005 - minx, dx));
  dy := least(0.995 - maxy, greatest(0.005 - miny, dy));

  minx := 2; maxx := -1;
  miny := 2; maxy := -1;
  for pt in select value from jsonb_array_elements(pts) loop
    nx := (pt->>0)::numeric + dx;
    ny := (pt->>1)::numeric + dy;
    minx := least(minx, nx); maxx := greatest(maxx, nx);
    miny := least(miny, ny); maxy := greatest(maxy, ny);
    newpts := newpts || jsonb_build_array(jsonb_build_array(nx, ny));
  end loop;

  update public.regions
    set points = newpts,
        bbox = jsonb_build_object('x0', minx, 'y0', miny, 'x1', maxx, 'y1', maxy),
        world_x = least(0.995, greatest(0.005, coalesce(world_x, (minx + maxx) / 2) + dx)),
        world_y = least(0.995, greatest(0.005, coalesce(world_y, (miny + maxy) / 2) + dy)),
        updated_at = now()
    where id = rid;

  update public.profiles
    set x = least(0.995, greatest(0.005, x + dx)),
        y = least(0.995, greatest(0.005, y + dy))
    where region_id = rid;

  update public.npcs
    set x = least(0.995, greatest(0.005, x + dx)),
        y = least(0.995, greatest(0.005, y + dy)),
        updated_at = now()
    where region_id = rid;

  update public.castles
    set x = least(0.995, greatest(0.005, x + dx)),
        y = least(0.995, greatest(0.005, y + dy)),
        updated_at = now()
    where region_id = rid;

  return jsonb_build_object('ok', true, 'points', newpts, 'dx', dx, 'dy', dy);
end;
$fn$;

-- ============================================================
-- Región real bajo un punto (polígono, no solo caja)
-- ============================================================

create or replace function public.point_in_polygon(px numeric, py numeric, pts jsonb)
returns boolean
language plpgsql
immutable
as $fn$
declare
  n integer := jsonb_array_length(pts);
  inside boolean := false;
  i integer;
  x1 numeric;
  y1 numeric;
  x2 numeric;
  y2 numeric;
begin
  if n < 3 then return false; end if;
  for i in 0..n - 1 loop
    x1 := (pts -> i ->> 0)::numeric;
    y1 := (pts -> i ->> 1)::numeric;
    x2 := (pts -> ((i + 1) % n) ->> 0)::numeric;
    y2 := (pts -> ((i + 1) % n) ->> 1)::numeric;
    if ((y1 > py) <> (y2 > py))
       and (px < (x2 - x1) * (py - y1) / nullif(y2 - y1, 0) + x1) then
      inside := not inside;
    end if;
  end loop;
  return inside;
end;
$fn$;

create or replace function public.region_at(px numeric, py numeric)
returns integer
language sql
stable
as $fn$
  select r.id
  from public.regions r
  where public.point_in_polygon(px, py, r.points)
  order by r.id
  limit 1;
$fn$;

grant execute on function public.region_at(numeric, numeric) to authenticated;

create or replace function public.region_for_point(px numeric, py numeric)
returns integer
language sql
stable
as $fn$
  select coalesce(
    public.region_at(px, py),
    (
      select r.id
      from public.regions r
      order by
        power(greatest(
          (r.bbox->>'x0')::numeric - px,
          px - (r.bbox->>'x1')::numeric,
          0
        ), 2) + power(greatest(
          (r.bbox->>'y0')::numeric - py,
          py - (r.bbox->>'y1')::numeric,
          0
        ), 2),
        power(px - (((r.bbox->>'x0')::numeric + (r.bbox->>'x1')::numeric) / 2), 2) +
        power(py - (((r.bbox->>'y0')::numeric + (r.bbox->>'y1')::numeric) / 2), 2),
        r.id
      limit 1
    )
  );
$fn$;

grant execute on function public.region_for_point(numeric, numeric) to authenticated;

create or replace function public.admin_move_village(target_id uuid, nx numeric, ny numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  px numeric := least(0.995, greatest(0.005, nx));
  py numeric := least(0.995, greatest(0.005, ny));
  rid integer := public.region_for_point(
    least(0.995, greatest(0.005, nx)),
    least(0.995, greatest(0.005, ny))
  );
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  update public.profiles
    set x = px,
        y = py,
        region_id = rid
    where id = target_id;
  if not found then raise exception 'village not found'; end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.admin_move_village(uuid, numeric, numeric) to authenticated;

create or replace function public.admin_save_road_bend(
  p_region integer,
  p_key text,
  p_t numeric,
  p_x numeric,
  p_y numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_t numeric := least(0.88, greatest(0.12, coalesce(p_t, 0.5)));
  v_x numeric := least(0.995, greatest(0.005, coalesce(p_x, 0.5)));
  v_y numeric := least(0.995, greatest(0.005, coalesce(p_y, 0.5)));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if p_key is null or length(btrim(p_key)) = 0 or length(p_key) > 400 then
    raise exception 'invalid road';
  end if;
  if not exists (select 1 from public.regions r where r.id = p_region) then
    raise exception 'region not found';
  end if;

  insert into public.road_bends (region_id, road_key, t, x, y)
    values (p_region, p_key, v_t, v_x, v_y)
  on conflict (region_id, road_key) do update
    set t = excluded.t,
        x = excluded.x,
        y = excluded.y,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.admin_save_road_bend(integer, text, numeric, numeric, numeric) to authenticated;

create or replace function public.admin_clear_road_bends(p_region integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  removed integer;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  delete from public.road_bends where region_id = p_region;
  get diagnostics removed = row_count;
  return jsonb_build_object('ok', true, 'removed', removed);
end;
$fn$;

grant execute on function public.admin_clear_road_bends(integer) to authenticated;

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

create or replace function public.admin_set_maintenance(p_active boolean, p_message text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  if coalesce(p_active, false) and (p_password is null or p_password = '') then
    raise exception 'password required';
  end if;

  update public.world_settings
    set maintenance = coalesce(p_active, false),
        maintenance_message = coalesce(p_message, ''),
        maintenance_version = (extract(epoch from clock_timestamp()) * 1000)::bigint,
        updated_at = now()
  where id = 1;

  if p_password is null or p_password = '' then
    update public.world_maintenance set password_hash = null, updated_at = now() where id = 1;
  else
    insert into public.world_maintenance (id, password_hash, updated_at)
    values (1, extensions.crypt(p_password, extensions.gen_salt('bf')), now())
    on conflict (id) do update
      set password_hash = excluded.password_hash,
          updated_at = now();
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.admin_move_castle(target_id uuid, nx numeric, ny numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  px numeric := least(0.995, greatest(0.005, nx));
  py numeric := least(0.995, greatest(0.005, ny));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  update public.castles
    set x = px,
        y = py,
        updated_at = now()
  where id = target_id;
  if not found then raise exception 'castle not found'; end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.admin_move_castle(uuid, numeric, numeric) to authenticated;

create or replace function public.admin_move_npc(target_id uuid, nx numeric, ny numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  px numeric := least(0.995, greatest(0.005, nx));
  py numeric := least(0.995, greatest(0.005, ny));
  rid integer := public.region_for_point(
    least(0.995, greatest(0.005, nx)),
    least(0.995, greatest(0.005, ny))
  );
begin
  if not public.is_admin() then raise exception 'not admin'; end if;

  update public.npcs
    set x = px,
        y = py,
        region_id = rid,
        updated_at = now()
  where id = target_id;
  if not found then raise exception 'npc not found'; end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

grant execute on function public.admin_move_npc(uuid, numeric, numeric) to authenticated;

-- Repara cajas de región y asignaciones antiguas sin mover aldeas.
do $repair$
begin
  update public.regions r
    set bbox = b.bbox,
        updated_at = now()
  from (
    select r2.id,
      jsonb_build_object(
        'x0', min((pt->>0)::numeric),
        'y0', min((pt->>1)::numeric),
        'x1', max((pt->>0)::numeric),
        'y1', max((pt->>1)::numeric)
      ) as bbox
    from public.regions r2
    cross join lateral jsonb_array_elements(r2.points) as pt
    group by r2.id
  ) b
  where r.id = b.id
    and r.bbox is distinct from b.bbox;

  update public.profiles p
    set region_id = public.region_for_point(p.x, p.y)
  where p.x is not null
    and p.y is not null
    and not coalesce(p.is_admin, false)
    and p.region_id is distinct from public.region_for_point(p.x, p.y);

  update public.npcs n
    set region_id = public.region_for_point(n.x, n.y)
  where n.x is not null
    and n.y is not null
    and n.region_id is distinct from public.region_for_point(n.x, n.y);

end;
$repair$;

create or replace function public.admin_grant_kb(target_id uuid, amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  balance bigint;
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  if amount = 0 then raise exception 'amount required'; end if;

  update public.profiles
    set kb = greatest(0, kb + amount), updated_at = now()
  where id = target_id
  returning kb into balance;
  if not found then raise exception 'player not found'; end if;

  return jsonb_build_object('ok', true, 'kb', balance);
end;
$fn$;

grant execute on function public.admin_grant_kb(uuid, bigint) to authenticated;

create or replace function public.admin_set_resource_speed(p_speed numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v numeric := least(10, greatest(0.1, coalesce(p_speed, 1)));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.world_settings set resource_speed = v, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'speed', v);
end;
$fn$;

grant execute on function public.admin_set_resource_speed(numeric) to authenticated;

create or replace function public.admin_set_movement_speed(p_speed numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v numeric := least(10, greatest(0.1, coalesce(p_speed, 1)));
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.world_settings set movement_speed = v, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'speed', v);
end;
$fn$;

grant execute on function public.admin_set_movement_speed(numeric) to authenticated;

create or replace function public.maintenance_enter(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  active boolean := false;
  hash text;
begin
  select coalesce(maintenance, false) into active from public.world_settings where id = 1;
  if not active then return true; end if;

  select password_hash into hash from public.world_maintenance where id = 1;
  if hash is null then return true; end if;

  return extensions.crypt(coalesce(p_password, ''), hash) = hash;
end;
$fn$;

grant execute on function public.admin_set_maintenance(boolean, text, text) to authenticated;
grant execute on function public.maintenance_enter(text) to authenticated;

grant execute on function public.admin_move_region(integer, numeric, numeric) to authenticated;
grant execute on function public.admin_move_village(uuid, numeric, numeric) to authenticated;
grant execute on function public.admin_set_region_locked(integer, boolean) to authenticated;

create or replace function public.admin_set_region_image(rid integer, url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  update public.regions set image_url = nullif(url, ''), updated_at = now() where id = rid;
  if not found then raise exception 'region not found'; end if;
  return jsonb_build_object('ok', true, 'image_url', nullif(url, ''));
end;
$fn$;

grant execute on function public.admin_set_region_image(integer, text) to authenticated;
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

-- ============================================================
-- Confirmación automática de cuentas (sin depender del panel)
-- ============================================================

create or replace function public.auto_confirm_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $fn$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists auth_auto_confirm on auth.users;
create trigger auth_auto_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_signup();

update auth.users
  set email_confirmed_at = now(),
      updated_at = now()
  where email_confirmed_at is null
    and email like '%@reinos.local';

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
