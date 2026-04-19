-- =============================================================================
-- Migration 001 — Initial schema
-- Tables: vendor_profiles, products, leads, quotations, invoices
-- Indexes + Row Level Security for all tables
-- =============================================================================

-- Enable UUID helper (needed for gen_random_uuid on vendor_profiles)
create extension if not exists "pgcrypto";


-- =============================================================================
-- 1. VENDOR PROFILES
--    One row per authenticated user.  Stores business info shown on PDFs.
-- =============================================================================
create table if not exists vendor_profiles (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  business_name   text        not null,
  vendor_name     text        not null,
  whatsapp_number text        not null,
  email           text,
  address         text,
  created_at      timestamptz not null default now(),

  constraint vendor_profiles_user_id_unique unique (user_id)
);


-- =============================================================================
-- 2. PRODUCTS  (Catalogue)
--    Each vendor's product list.  id is app-generated (timestamp + random).
-- =============================================================================
create table if not exists products (
  id         text        primary key,           -- app-generated string id
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  price      numeric(12, 2) not null,
  unit       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =============================================================================
-- 3. LEADS
--    Customer / buyer records.  Status tracks the quotation lifecycle.
-- =============================================================================
create table if not exists leads (
  id                    text        primary key,
  user_id               uuid        not null references auth.users(id) on delete cascade,
  name                  text        not null,
  phone_number          text,
  whatsapp_number       text        not null,
  whatsapp_same_as_phone boolean   not null default false,
  email                 text,
  status                text        not null default 'Pending',
                                    -- values: 'Pending' | 'Quote Created' | 'PDF Shared'
  created_at            timestamptz not null default now(),

  constraint leads_status_check check (
    status in ('Pending', 'Quote Created', 'PDF Shared')
  )
);


-- =============================================================================
-- 4. QUOTATIONS
--    One quotation per lead (upserted on save).
--    items  → JSONB array of QuotationItem objects
--    discount / tax → JSONB objects (nullable)
-- =============================================================================
create table if not exists quotations (
  id           text        primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  lead_id      text        not null references leads(id) on delete cascade,
  quote_number text        not null,
  items        jsonb       not null default '[]',
  --  items row shape:
  --  { id, name, quantity, unit, rate, hsnCode? }
  notes        text,
  discount     jsonb,
  --  discount shape: { enabled, type: 'percent'|'flat', value }
  tax          jsonb,
  --  tax shape:     { enabled, label, rate }
  created_at   timestamptz not null default now()
);


-- =============================================================================
-- 5. INVOICES
--    One invoice per lead (upserted on save).
--    items     → JSONB array of QuotationItem objects
--    discount / tax / tax_split → JSONB objects
-- =============================================================================
create table if not exists invoices (
  id                text        primary key,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  lead_id           text        not null references leads(id) on delete cascade,
  invoice_number    text        not null,
  invoice_date      text        not null,
  items             jsonb       not null default '[]',
  --  items row shape:
  --  { id, name, quantity, unit, rate, hsnCode?, taxRate? }
  notes             text,
  discount          jsonb,
  --  discount shape: { enabled, type: 'percent'|'flat', value }
  tax               jsonb,
  --  tax shape:     { enabled, label, rate }
  place_of_supply   text        not null,
  tax_split         jsonb       not null,
  --  tax_split shape: { type: 'cgst_sgst'|'igst', rate, cgstAmt?, sgstAmt?, igstAmt? }
  status            text        not null default 'draft',
  --  status values: 'draft' | 'sent' | 'paid'
  created_at        timestamptz not null default now(),

  constraint invoices_status_check check (
    status in ('draft', 'sent', 'paid')
  )
);


-- =============================================================================
-- 6. INDEXES  (for faster per-user queries)
-- =============================================================================
create index if not exists products_user_id_idx     on products(user_id);
create index if not exists leads_user_id_idx        on leads(user_id);
create index if not exists quotations_user_id_idx   on quotations(user_id);
create index if not exists quotations_lead_id_idx   on quotations(lead_id);
create index if not exists invoices_user_id_idx     on invoices(user_id);
create index if not exists invoices_lead_id_idx     on invoices(lead_id);


-- =============================================================================
-- 7. ROW LEVEL SECURITY
--    Every table is locked down so each user only sees their own data.
-- =============================================================================

-- vendor_profiles
alter table vendor_profiles enable row level security;

drop policy if exists "Users manage their own profile" on vendor_profiles;
create policy "Users manage their own profile"
  on vendor_profiles for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- products
alter table products enable row level security;

drop policy if exists "Users manage their own products" on products;
create policy "Users manage their own products"
  on products for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- leads
alter table leads enable row level security;

drop policy if exists "Users manage their own leads" on leads;
create policy "Users manage their own leads"
  on leads for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- quotations
alter table quotations enable row level security;

drop policy if exists "Users manage their own quotations" on quotations;
create policy "Users manage their own quotations"
  on quotations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- invoices
alter table invoices enable row level security;

drop policy if exists "Users manage their own invoices" on invoices;
create policy "Users manage their own invoices"
  on invoices for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
