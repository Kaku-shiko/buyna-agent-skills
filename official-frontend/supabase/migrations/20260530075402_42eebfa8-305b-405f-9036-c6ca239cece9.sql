
-- Roles enum + table (separate from profile to prevent privilege escalation)
create type public.app_role as enum ('admin', 'merchant');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users view own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

-- Security definer role-check
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Merchants profile table
create table public.merchants (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default '',
  area text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.merchants to authenticated;
grant all on public.merchants to service_role;

alter table public.merchants enable row level security;

create policy "Merchants view own profile"
  on public.merchants for select
  to authenticated
  using (id = auth.uid());

create policy "Merchants insert own profile"
  on public.merchants for insert
  to authenticated
  with check (id = auth.uid());

create policy "Merchants update own profile"
  on public.merchants for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create profile + merchant role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.merchants (id, shop_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'shop_name', ''))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'merchant')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger merchants_touch_updated_at
  before update on public.merchants
  for each row execute function public.touch_updated_at();
