-- =============================================================================
-- Migration 002 — Backfill columns added after initial release
--
-- These columns were not present in the first deployed schema and were
-- previously applied via the "ADD MISSING COLUMNS" section in supabase_schema.sql.
-- They are safe to run on databases that already have migration 001 applied.
-- =============================================================================

-- vendor_profiles: GST number and audit timestamp
alter table vendor_profiles add column if not exists gst_number text;
alter table vendor_profiles add column if not exists updated_at timestamptz not null default now();

-- products: optional HSN code and per-product tax rate
alter table products add column if not exists hsn_code  text;
alter table products add column if not exists tax_rate  numeric;

-- quotations: workflow status ('draft' | 'sent' | 'approved')
alter table quotations add column if not exists status text;

-- invoices: optional payment due date and buyer's GSTIN
alter table invoices add column if not exists due_date    text;
alter table invoices add column if not exists buyer_gstin text;
