-- DEPRECATED PROTOTYPE SCHEMA.
-- Do not run this for the production Next/Supabase app.
-- The schema of record is supabase/rebuild-production-schema.sql.

-- F&S Estimating Suite — Full Database Schema
-- Apply this in Supabase Dashboard → SQL Editor → Run
-- All tables use RLS: authenticated users have full read/write access

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Shop'
    CHECK (status IN ('Shop', 'Ready', 'Installing', 'Installed', 'Held')),
  bid_id uuid,
  address text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- BIDS
-- ============================================================
CREATE TABLE bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'ITB'
    CHECK (stage IN ('ITB', 'Takeoff/Pricing', 'Review', 'Submit', 'Won', 'Lost')),
  due_date date,
  total numeric(12,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON bids
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add FK from jobs to bids after both tables exist
ALTER TABLE jobs ADD CONSTRAINT jobs_bid_id_fkey
  FOREIGN KEY (bid_id) REFERENCES bids(id) ON DELETE SET NULL;

-- ============================================================
-- LINE_ITEMS
-- ============================================================
CREATE TABLE line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id uuid NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  section text,
  description text NOT NULL,
  qty numeric(12,3),
  unit text CHECK (unit IN ('EA','LF','SF','SY','CY','LS','HR','TON')),
  unit_cost numeric(12,2),
  total numeric(12,2) GENERATED ALWAYS AS (COALESCE(qty, 0) * COALESCE(unit_cost, 0)) STORED,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  role text CHECK (role IN ('gc','owner','sub','field')),
  email text,
  phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON contacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- LIBRARY_ITEMS
-- ============================================================
CREATE TABLE library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text,
  description text NOT NULL,
  unit text CHECK (unit IN ('EA','LF','SF','SY','CY','LS','HR','TON')),
  unit_cost numeric(12,2),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON library_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- CHANGE_ORDERS
-- ============================================================
CREATE TABLE change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  number text NOT NULL,
  description text NOT NULL,
  amount numeric(12,2),
  status text DEFAULT 'Pending'
    CHECK (status IN ('Pending','Approved','Rejected')),
  issued_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON change_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  bid_id uuid REFERENCES bids(id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_path text,
  doc_type text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- ACTIVITY_LOG
-- ============================================================
CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON activity_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 MIGRATIONS
-- Run in Supabase Dashboard > SQL Editor after initial schema is applied
-- All statements use IF NOT EXISTS so they are safe to re-run
-- ─────────────────────────────────────────────────────────────────────────────

-- bids: add GC name and project type
ALTER TABLE bids ADD COLUMN IF NOT EXISTS gc_name text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS project_type text;

-- library_items: add code and split material/labor costs
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS material_cost numeric(12,2);
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS labor_cost numeric(12,2);

-- jobs: add scheduling and financial columns
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS install_start date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS install_end date;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gc_name text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contract_value numeric(12,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 V2 ESTIMATOR MIGRATIONS
-- Run in Supabase Dashboard > SQL Editor after PHASE 3 MIGRATIONS block
-- All statements use IF NOT EXISTS so they are safe to re-run
-- ─────────────────────────────────────────────────────────────────────────────

-- Areas: top-level groupings per bid (e.g. "Lab L1", "Admin Wing")
CREATE TABLE IF NOT EXISTS areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id        uuid REFERENCES bids(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL DEFAULT 'New Area',
  qty           integer NOT NULL DEFAULT 1,
  ignore        boolean NOT NULL DEFAULT false,
  no_print      boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'areas' AND policyname = 'auth_areas') THEN
    CREATE POLICY "auth_areas" ON areas FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Sections: named groups within an area (e.g. "Casework", "Counters")
CREATE TABLE IF NOT EXISTS sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id       uuid REFERENCES areas(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL DEFAULT 'New Section',
  ignore        boolean NOT NULL DEFAULT false,
  no_print      boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sections' AND policyname = 'auth_sections') THEN
    CREATE POLICY "auth_sections" ON sections FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Bid alternates (separate from base bid line items)
CREATE TABLE IF NOT EXISTS bid_alternates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id        uuid REFERENCES bids(id) ON DELETE CASCADE NOT NULL,
  description   text NOT NULL DEFAULT '',
  qty           numeric(12,4) DEFAULT 1,
  unit          text DEFAULT 'lump sum',
  price         numeric(12,2) DEFAULT 0,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE bid_alternates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bid_alternates' AND policyname = 'auth_bid_alternates') THEN
    CREATE POLICY "auth_bid_alternates" ON bid_alternates FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Add hierarchy and metadata columns to line_items
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS area_id    uuid REFERENCES areas(id) ON DELETE CASCADE;
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES sections(id) ON DELETE CASCADE;
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS drawing_ref text;
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS ignore     boolean DEFAULT false;
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS no_print   boolean DEFAULT false;

-- Add V2 bid metadata fields (all IF NOT EXISTS so safe to re-run)
ALTER TABLE bids ADD COLUMN IF NOT EXISTS oh_pct        numeric(5,2) DEFAULT 15;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS del_pct       numeric(5,2) DEFAULT 5;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS ins_pct       numeric(5,2) DEFAULT 20;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS pricing_mode  text DEFAULT 'byarea';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS doc_type      text DEFAULT 'Proposal';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS attention     text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS po_number     text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS terms         text DEFAULT 'Net 30';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS delivery_date text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS drawings_dated text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS specs_dated   text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS addendums     text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS bid_docs      text;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS estimator     text DEFAULT 'Evan Ramsey';

-- JSONB columns for per-bid terms (pre-populated from F&S defaults by the app)
ALTER TABLE bids ADD COLUMN IF NOT EXISTS exclusions     jsonb DEFAULT '[]';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS clarifications jsonb DEFAULT '[]';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS general_terms  jsonb DEFAULT '[]';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS warranty       jsonb DEFAULT '[]';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS finish_terms   jsonb DEFAULT '[]';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS hardware_terms jsonb DEFAULT '[]';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS fab_note       jsonb DEFAULT '[]';

-- ─────────────────────────────────────────────────────────────────────────────
-- IFRAME BRIDGE MIGRATION
-- Stores the full V2 estimator state (ST object) as JSONB.
-- The shell app writes this column via postMessage; V2 reads it on bid open.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bids ADD COLUMN IF NOT EXISTS estimate_data jsonb;
-- DEPRECATED: legacy prototype schema kept only for reference.
-- Do not run this file. The canonical reset schema is supabase/rebuild-production-schema.sql.
