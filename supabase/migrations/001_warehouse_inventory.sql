-- =========================================================================
-- Ekdant Logistics - Sprint 7 Warehouse Inventory & Movement Logs Schema
-- Migration: 001_warehouse_inventory.sql
-- =========================================================================

-- 1. CFS Inventory Ledger Table
CREATE TABLE IF NOT EXISTS public.cfs_inventory_ledger (
    id TEXT PRIMARY KEY,
    custom_invoice_no TEXT,
    consignee_name TEXT,
    status TEXT,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cfs_inventory_ledger_invoice ON public.cfs_inventory_ledger (custom_invoice_no);
CREATE INDEX IF NOT EXISTS idx_cfs_inventory_ledger_consignee ON public.cfs_inventory_ledger (consignee_name);
CREATE INDEX IF NOT EXISTS idx_cfs_inventory_ledger_status ON public.cfs_inventory_ledger (status);
CREATE INDEX IF NOT EXISTS idx_cfs_inventory_ledger_updated ON public.cfs_inventory_ledger (updated_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.cfs_inventory_ledger ENABLE ROW LEVEL SECURITY;

-- Allow anonymous / authenticated operations via Supabase anon key
DROP POLICY IF EXISTS "Allow anon access to cfs_inventory_ledger" ON public.cfs_inventory_ledger;
CREATE POLICY "Allow anon access to cfs_inventory_ledger"
    ON public.cfs_inventory_ledger
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);


-- 2. CFS Movement Logs Table
CREATE TABLE IF NOT EXISTS public.cfs_movement_logs (
    id TEXT PRIMARY KEY,
    ledger_id TEXT,
    direction TEXT,
    customer_name TEXT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cfs_movement_logs_ledger ON public.cfs_movement_logs (ledger_id);
CREATE INDEX IF NOT EXISTS idx_cfs_movement_logs_direction ON public.cfs_movement_logs (direction);
CREATE INDEX IF NOT EXISTS idx_cfs_movement_logs_customer ON public.cfs_movement_logs (customer_name);
CREATE INDEX IF NOT EXISTS idx_cfs_movement_logs_created ON public.cfs_movement_logs (created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.cfs_movement_logs ENABLE ROW LEVEL SECURITY;

-- Allow anonymous / authenticated operations via Supabase anon key
DROP POLICY IF EXISTS "Allow anon access to cfs_movement_logs" ON public.cfs_movement_logs;
CREATE POLICY "Allow anon access to cfs_movement_logs"
    ON public.cfs_movement_logs
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
