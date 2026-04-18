-- Run this in your Supabase SQL editor to set up the schema

-- vendor_profiles
create table if not exists public.vendor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  vendor_name text not null,
  whatsapp_number text not null,
  email text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.vendor_profiles enable row level security;

create policy "Users can manage their own profile"
  on public.vendor_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- products
create table if not exists public.products (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price numeric not null,
  unit text not null,
  hsn_code text,
  tax_rate numeric,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Users can manage their own products"
  on public.products
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- leads
create table if not exists public.leads (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone_number text,
  whatsapp_number text not null,
  whatsapp_same_as_phone boolean default false,
  email text,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

create policy "Users can manage their own leads"
  on public.leads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- quotations
create table if not exists public.quotations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id text not null references public.leads(id) on delete cascade,
  items jsonb not null default '[]',
  notes text,
  quote_number text not null,
  discount jsonb,
  tax jsonb,
  created_at timestamptz not null default now()
);

alter table public.quotations enable row level security;

create policy "Users can manage their own quotations"
  on public.quotations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
