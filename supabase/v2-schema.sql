-- ─────────────────────────────────────────────────────────────────────────────
-- Estimating Suite V2 — schema of record
--
-- Rebuild around the three source tools (docs/rebuild-plan.md):
--   opportunities        = Estimating Master "2026 Bid Tracker" sheet
--   jobs + change_orders = FS Job Dashboard / "Current Jobs" + "Change Order" sheets
--   estimates            = FS Estimator document (whole state as one JSONB doc)
--
-- Destructive: drops the V1 tables. Test data only at time of adoption.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop V1 objects
drop table if exists public.estimate_alternates cascade;
drop table if exists public.estimate_subcontractor_items cascade;
drop table if exists public.estimate_items cascade;
drop table if exists public.estimate_sections cascade;
drop table if exists public.estimate_areas cascade;
drop table if exists public.estimate_snapshots cascade;
drop table if exists public.estimates cascade;
drop table if exists public.opportunity_contacts cascade;
drop table if exists public.job_contacts cascade;
drop table if exists public.pm_notes cascade;
drop table if exists public.submittals cascade;
drop table if exists public.purchase_orders cascade;
drop table if exists public.change_orders cascade;
drop table if exists public.activity_events cascade;
drop table if exists public.files cascade;
drop table if exists public.jobs cascade;
drop table if exists public.opportunities cascade;
drop table if exists public.companies cascade;
drop table if exists public.contacts cascade;
drop table if exists public.historical_results cascade;
drop table if exists public.pricing_library_items cascade;
drop table if exists public.app_user_profiles cascade;
drop schema if exists app_private cascade;

-- ── Helpers ──────────────────────────────────────────────────────────────────
create schema app_private;

create or replace function app_private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Profiles ─────────────────────────────────────────────────────────────────
create table public.app_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'pm' check (role in ('admin', 'estimator', 'pm')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.app_user_profiles
  for each row execute function app_private.set_updated_at();

create or replace function app_private.member_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.app_user_profiles
  where id = auth.uid() and active
$$;

create or replace function app_private.can_estimate()
returns boolean language sql stable as $$
  select app_private.member_role() in ('admin', 'estimator')
$$;

create or replace function app_private.is_member()
returns boolean language sql stable as $$
  select app_private.member_role() is not null
$$;

-- ── Opportunities (Bid Tracker sheet, 1:1) ───────────────────────────────────
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  opportunity_number text not null unique,          -- "Q-26-119"
  month text not null default '',
  year integer,
  client text not null default '',
  project_name text not null default '',
  bid_due_date date,
  drawing_stage text not null default '',
  bid_type text not null default '',
  sent_date date,
  submission_method text not null default '',
  status text not null default 'New',
  win_loss text not null default '' check (win_loss in ('', 'Won', 'Lost')),
  job_type text not null default '',
  est_value numeric(14,2) not null default 0,
  link_drawings text not null default '',
  link_specs text not null default '',
  link_schedule text not null default '',
  notes text not null default '',
  bid_feedback text not null default '',
  ntp_received boolean not null default false,
  final_cost numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.opportunities
  for each row execute function app_private.set_updated_at();
create index opportunities_status_idx on public.opportunities(status, bid_due_date);

-- ── Estimates (FS Estimator document) ────────────────────────────────────────
-- The whole estimator state (info, areas tree, pricing params, subs,
-- alternates, terms) is one JSONB document — the .fse file, in a column.
-- Save is a single atomic write; header columns are denormalized by the app
-- on save for listing without parsing documents.
create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  name text not null default '',
  client text not null default '',
  doc_type text not null default 'Proposal',
  base_bid numeric(14,2) not null default 0,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.estimates
  for each row execute function app_private.set_updated_at();
create index estimates_opportunity_idx on public.estimates(opportunity_id);

-- ── Jobs (FS Job Dashboard model + Current Jobs sheet) ───────────────────────
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,                  -- "G047"
  pm text not null default '',                      -- Geoff / Pat / Joe (display name)
  client text not null default '',
  project_name text not null default '',
  status text not null default 'ready'
    check (status in ('ready', 'active', 'completed', 'installed', 'void')),
  contract_value numeric(14,2) not null default 0,  -- original; current = + approved COs
  bid_ref text not null default '',                 -- "Q-26-119"
  opportunity_id uuid references public.opportunities(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  install_start date,
  install_end date,
  crew_size integer not null default 1 check (crew_size between 1 and 6),
  gc text not null default '',
  fab_status text not null default '',              -- freeform, from Current Jobs sheet
  invoice_status text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.jobs
  for each row execute function app_private.set_updated_at();
create index jobs_status_install_idx on public.jobs(status, install_start);

-- ── Change orders (Change Order sheet / dashboard CO model) ──────────────────
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null default 0,          -- may be negative
  status text not null default 'submitted' check (status in ('submitted', 'approved')),
  submitted_date date,
  approved_date date,
  created_by text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index change_orders_job_idx on public.change_orders(job_id, status);

-- ── Files (six fixed slots per owner) ────────────────────────────────────────
create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('opportunity', 'job')),
  owner_id uuid not null,
  slot text not null check (slot in ('drawings', 'specs', 'schedule', 'contract', 'proposal', 'other')),
  name text not null,
  storage_bucket text not null default 'project-files',
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now(),
  unique (owner_type, owner_id, slot)               -- one file per slot (dashboard rule)
);
create index files_owner_idx on public.files(owner_type, owner_id);

-- ── Activity log (job feed) ──────────────────────────────────────────────────
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  author text not null default '',
  note text not null,
  created_at timestamptz not null default now()
);
create index activity_events_job_idx on public.activity_events(job_id, created_at desc);

-- ── Pricing library ──────────────────────────────────────────────────────────
create table public.pricing_library_items (
  id uuid primary key default gen_random_uuid(),
  category text not null default '',
  description text not null,
  unit_cost numeric(12,2) not null default 0,
  uom text not null default 'ea.',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index pricing_library_cat_idx on public.pricing_library_items(category);

-- ── Contacts (estimator address book) ────────────────────────────────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  attention text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.contacts
  for each row execute function app_private.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.app_user_profiles enable row level security;
alter table public.opportunities enable row level security;
alter table public.estimates enable row level security;
alter table public.jobs enable row level security;
alter table public.change_orders enable row level security;
alter table public.files enable row level security;
alter table public.activity_events enable row level security;
alter table public.pricing_library_items enable row level security;
alter table public.contacts enable row level security;

-- Everyone with an active profile reads everything.
create policy profiles_select on public.app_user_profiles for select using (app_private.is_member());
create policy opportunities_select on public.opportunities for select using (app_private.is_member());
create policy estimates_select on public.estimates for select using (app_private.is_member());
create policy jobs_select on public.jobs for select using (app_private.is_member());
create policy change_orders_select on public.change_orders for select using (app_private.is_member());
create policy files_select on public.files for select using (app_private.is_member());
create policy activity_select on public.activity_events for select using (app_private.is_member());
create policy library_select on public.pricing_library_items for select using (app_private.is_member());
create policy contacts_select on public.contacts for select using (app_private.is_member());

-- Estimating surfaces (tracker, estimates, library, contacts): admin/estimator write.
create policy opportunities_write on public.opportunities for all
  using (app_private.can_estimate()) with check (app_private.can_estimate());
create policy estimates_write on public.estimates for all
  using (app_private.can_estimate()) with check (app_private.can_estimate());
create policy library_write on public.pricing_library_items for all
  using (app_private.can_estimate()) with check (app_private.can_estimate());
create policy contacts_write on public.contacts for all
  using (app_private.can_estimate()) with check (app_private.can_estimate());

-- Job surfaces: every member writes (PMs update status, COs, files, notes).
create policy jobs_write on public.jobs for all
  using (app_private.is_member()) with check (app_private.is_member());
create policy change_orders_write on public.change_orders for all
  using (app_private.is_member()) with check (app_private.is_member());
create policy files_write on public.files for all
  using (app_private.is_member()) with check (app_private.is_member());
create policy activity_write on public.activity_events for all
  using (app_private.is_member()) with check (app_private.is_member());

-- Profiles: admins manage.
create policy profiles_admin_write on public.app_user_profiles for all
  using (app_private.member_role() = 'admin') with check (app_private.member_role() = 'admin');

-- ── Storage policies (bucket project-files) ──────────────────────────────────
drop policy if exists "project files read" on storage.objects;
drop policy if exists "project files write" on storage.objects;
drop policy if exists "project files update" on storage.objects;
drop policy if exists "project files delete" on storage.objects;
create policy "project files read" on storage.objects for select
  using (bucket_id = 'project-files' and app_private.is_member());
create policy "project files write" on storage.objects for insert
  with check (bucket_id = 'project-files' and app_private.is_member());
create policy "project files update" on storage.objects for update
  using (bucket_id = 'project-files' and app_private.is_member());
create policy "project files delete" on storage.objects for delete
  using (bucket_id = 'project-files' and app_private.is_member());
