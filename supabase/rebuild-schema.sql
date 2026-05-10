create extension if not exists "pgcrypto";

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  job_id text unique,
  month text,
  client text not null,
  project_name text not null,
  bid_due_date date,
  drawing_stage text,
  bid_type text,
  sent_date date,
  submission_method text,
  status text not null default 'New',
  win_loss text default '',
  job_type text,
  estimated_value numeric(14,2) default 0,
  drawing_link text,
  specs_link text,
  schedule_link text,
  notes text,
  bid_feedback text,
  ntp_received boolean default false,
  initial_contract_value numeric(14,2),
  final_cost numeric(14,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  attention text,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists estimates (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete set null,
  job_id uuid,
  project_name text not null,
  client text not null,
  pricing_mode text not null default 'byarea',
  overhead_pct numeric(6,2) default 0,
  delivery_pct numeric(6,2) default 0,
  install_pct numeric(6,2) default 0,
  terms jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists estimate_areas (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  name text not null,
  qty numeric(12,2) default 1,
  sort_order integer default 0
);

create table if not exists estimate_sections (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references estimate_areas(id) on delete cascade,
  name text not null,
  sort_order integer default 0
);

create table if not exists estimate_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references estimate_sections(id) on delete cascade,
  name text,
  description text,
  drawing_ref text,
  qty numeric(12,2) default 0,
  unit text,
  unit_cost numeric(14,2) default 0,
  ignored boolean default false,
  no_print boolean default false,
  sort_order integer default 0
);

create table if not exists pricing_library_items (
  id uuid primary key default gen_random_uuid(),
  category text,
  name text not null,
  description text,
  unit text,
  unit_cost numeric(14,2) default 0,
  source text default 'manual',
  updated_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete set null,
  job_number text unique not null,
  pm text,
  client text not null,
  project_name text not null,
  base_contract numeric(14,2) default 0,
  bid_ref text,
  fab_status text default 'Not Started',
  install_start date,
  install_end date,
  install_status text default 'Ready',
  invoice_status text default 'Not Billed',
  crew_size integer default 0,
  gc text,
  notes text,
  final_cost numeric(14,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table estimates
  drop constraint if exists estimates_job_id_fkey;

alter table estimates
  add constraint estimates_job_id_fkey foreign key (job_id) references jobs(id) on delete set null;

create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  number text not null,
  description text not null,
  amount numeric(14,2) default 0,
  status text not null default 'submitted',
  date_submitted date,
  approved_date date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id uuid not null,
  slot text not null,
  name text not null,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz default now()
);

create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id uuid not null,
  author text,
  message text not null,
  created_at timestamptz default now()
);

create table if not exists estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references estimates(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  snapshot jsonb not null,
  material_total numeric(14,2) default 0,
  bid_total numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists historical_results (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  client text,
  project_name text,
  bid_value numeric(14,2) default 0,
  contract_value numeric(14,2) default 0,
  final_cost numeric(14,2),
  margin_pct numeric(6,2),
  result text,
  recorded_at timestamptz default now()
);

create index if not exists opportunities_status_idx on opportunities(status);
create index if not exists opportunities_due_idx on opportunities(bid_due_date);
create index if not exists jobs_install_idx on jobs(install_start, install_end);
create index if not exists change_orders_job_status_idx on change_orders(job_id, status);
create index if not exists files_owner_idx on files(owner_type, owner_id);
