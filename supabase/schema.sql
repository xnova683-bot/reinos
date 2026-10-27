-- WoW Imperial - esquema de Supabase
-- Ejecuta todo este archivo en: Dashboard > SQL Editor > New query > Run

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  race text not null check (race in ('horda', 'alianza', 'enanos')),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

-- Ranking público (solo lectura de datos no sensibles)
create or replace view public.ranking as
select
  p.id,
  coalesce(nullif(p.username, ''), 'Señor sin nombre') as username,
  p.race,
  coalesce((p.state ->> 'campsCleared')::int, 0) as incursiones,
  coalesce((p.state -> 'buildings' ->> 'ayuntamiento')::int, 1) as ayuntamiento,
  p.updated_at
from public.profiles p;

grant select on public.ranking to anon, authenticated;
