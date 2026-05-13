-- Estimating Suite production reset schema.
-- Review before running. This script intentionally drops prototype/sample tables.

begin;

create extension if not exists "pgcrypto";

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'storage_project_files_%'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_name);
  end loop;
end;
$$;

drop policy if exists storage_project_files_select on storage.objects;
drop policy if exists storage_project_files_insert on storage.objects;
drop policy if exists storage_project_files_update on storage.objects;
drop policy if exists storage_project_files_delete on storage.objects;

drop table if exists public.bid_alternates cascade;
drop table if exists public.line_items cascade;
drop table if exists public.sections cascade;
drop table if exists public.areas cascade;
drop table if exists public.documents cascade;
drop table if exists public.activity_log cascade;
drop table if exists public.library_items cascade;
drop table if exists public.bids cascade;
drop table if exists public.change_orders cascade;
drop table if exists public.files cascade;
drop table if exists public.activity_events cascade;
drop table if exists public.estimate_snapshots cascade;
drop table if exists public.historical_results cascade;
drop table if exists public.estimate_items cascade;
drop table if exists public.estimate_sections cascade;
drop table if exists public.estimate_areas cascade;
drop table if exists public.estimate_alternates cascade;
drop table if exists public.estimate_subcontractor_items cascade;
drop table if exists public.estimates cascade;
drop table if exists public.pricing_library_items cascade;
drop table if exists public.purchase_orders cascade;
drop table if exists public.submittals cascade;
drop table if exists public.pm_notes cascade;
drop table if exists public.job_contacts cascade;
drop table if exists public.opportunity_contacts cascade;
drop table if exists public.contacts cascade;
drop table if exists public.companies cascade;
drop table if exists public.jobs cascade;
drop table if exists public.opportunities cascade;
drop table if exists public.app_user_profiles cascade;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create table public.app_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer'
    check (role in ('admin', 'estimator', 'pm', 'viewer', 'accounting')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_type text not null default 'GC'
    check (company_type in ('GC', 'Architect', 'Owner', 'Supplier', 'Subcontractor', 'Vendor', 'Consultant', 'Other')),
  main_address text,
  billing_address text,
  website text,
  phone text,
  notes text,
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  title text,
  email text,
  phone text,
  mobile text,
  notes text,
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  opportunity_number text not null unique,
  work_type text not null default 'Bid / ITB'
    check (work_type in ('Bid / ITB', 'Negotiated', 'Service')),
  month text,
  year integer,
  client text not null,
  company_id uuid references public.companies(id) on delete set null,
  project_name text not null,
  project_location text,
  bid_due_date date,
  drawing_stage text,
  bid_type text,
  sent_date date,
  submission_method text,
  status text not null default 'New'
    check (status in ('Lead / ITB', 'Pricing', 'Review / Send', 'New', 'Estimating', 'Submitted', 'Follow Up', 'Cold', 'Won', 'Lost', 'Archived')),
  win_loss text not null default ''
    check (win_loss in ('', 'Won', 'Lost')),
  job_type text,
  estimated_value numeric(14,2) not null default 0,
  initial_contract_value numeric(14,2),
  final_cost numeric(14,2),
  ntp_received boolean not null default false,
  ntp_date date,
  drawing_link text,
  specs_link text,
  schedule_link text,
  notes text,
  bid_feedback text,
  follow_up_date date,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.opportunity_contacts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique (opportunity_id, contact_id, role)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  job_number text not null unique,
  work_type text not null default 'Bid / ITB'
    check (work_type in ('Bid / ITB', 'Negotiated', 'Service')),
  pm text,
  pm_user_id uuid references auth.users(id) on delete set null,
  client text not null,
  company_id uuid references public.companies(id) on delete set null,
  project_name text not null,
  project_location text,
  base_contract numeric(14,2) not null default 0,
  bid_ref text,
  award_date date,
  ntp_date date,
  backlog_status text not null default 'Awarded / Waiting'
    check (backlog_status in ('Awarded / Waiting', 'Submittals', 'Release Pending', 'In Fabrication', 'Ready to Install', 'Installing', 'Installed', 'Closeout', 'Complete', 'Void')),
  forecast_start date,
  forecast_end date,
  forecast_quarter text,
  expected_fab_start date,
  expected_completion date,
  fab_status text not null default 'Not Started'
    check (fab_status in ('Not Started', 'In Fabrication', 'Ready', 'Complete')),
  install_start date,
  install_end date,
  install_status text not null default 'Ready'
    check (install_status in ('Ready', 'Active', 'Completed', 'Installed', 'Void')),
  invoice_status text not null default 'Not Billed'
    check (invoice_status in ('Not Billed', 'Partial', 'Billed', 'Paid')),
  crew_size integer not null default 0,
  gc text,
  service_scope text,
  requested_date date,
  scheduled_date date,
  assigned_to text,
  notes text,
  final_cost numeric(14,2),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique (job_id, contact_id, role)
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  document_type text not null default 'Proposal'
    check (document_type in ('Proposal', 'Quote', 'Budget', 'Change Order', 'Service Quote', 'Revision')),
  proposal_number text,
  revision text,
  project_name text not null,
  project_location text,
  client text not null,
  client_address text,
  client_contact text,
  architect text,
  estimator text,
  bid_date date,
  due_date date,
  delivery_date text,
  ship_via text,
  po_number text,
  project_identifier text,
  bid_documents text,
  drawings_dated text,
  addenda text,
  scope_summary text,
  valid_days integer default 30,
  payment_terms text,
  lead_time text,
  pricing_mode text not null default 'byarea'
    check (pricing_mode in ('lumpsum', 'byarea', 'itemized')),
  overhead_pct numeric(6,2) not null default 0,
  delivery_pct numeric(6,2) not null default 0,
  install_pct numeric(6,2) not null default 0,
  exclusions jsonb not null default '[]'::jsonb,
  clarifications jsonb not null default '[]'::jsonb,
  terms jsonb not null default '{}'::jsonb,
  change_order_context jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.estimate_areas (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  name text not null,
  qty numeric(12,2) not null default 1,
  ignored boolean not null default false,
  no_print boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.estimate_sections (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.estimate_areas(id) on delete cascade,
  name text not null,
  ignored boolean not null default false,
  no_print boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.estimate_sections(id) on delete cascade,
  name text,
  description text,
  drawing_ref text,
  category text,
  material_type text,
  source text not null default 'manual'
    check (source in ('manual', 'library', 'import')),
  qty numeric(12,2) not null default 0,
  unit text,
  unit_cost numeric(14,2) not null default 0,
  ignored boolean not null default false,
  no_print boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.estimate_subcontractor_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  description text,
  cost numeric(14,2) not null default 0,
  markup_pct numeric(6,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.estimate_alternates (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  number text not null,
  description text not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'submitted'
    check (status in ('draft', 'priced', 'sent', 'submitted', 'pending', 'approved', 'rejected', 'void')),
  date_submitted date,
  approved_date date,
  gc_reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (job_id, number)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  po_number text not null,
  vendor_company_id uuid references public.companies(id) on delete set null,
  vendor text not null,
  scope text not null
    check (scope in ('Stone / Quartz', 'Cambria', 'Solid Surface', 'Glass', 'Metal', 'Install Labor', 'Other')),
  description text,
  status text not null default 'Draft'
    check (status in ('Draft', 'Issued', 'Acknowledged', 'In Progress', 'Complete', 'Closed', 'Void')),
  committed_amount numeric(14,2) not null default 0,
  approved_change_amount numeric(14,2) not null default 0,
  invoiced_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  issue_date date,
  needed_by date,
  promised_date date,
  received_date date,
  owner text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (job_id, po_number)
);

create table public.submittals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  type text not null default 'Shop Drawings'
    check (type in ('Shop Drawings', 'Finish Samples', 'Hardware', 'Engineering', 'Other')),
  status text not null default 'Not Started'
    check (status in ('Not Started', 'In Progress', 'Submitted', 'Approved', 'Approved as Noted', 'Rejected / Revise and Resubmit', 'Resubmitted', 'Void / Not Required')),
  revision integer not null default 0,
  due_date date,
  submitted_date date,
  returned_date date,
  owner text,
  release_blocker boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null
    check (owner_type in ('opportunity', 'estimate', 'job', 'change_order', 'submittal', 'purchase_order')),
  owner_id uuid not null,
  slot text not null,
  name text not null,
  storage_bucket text not null default 'project-files',
  storage_path text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create table public.pm_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  status text not null default 'Open'
    check (status in ('Open', 'Waiting', 'Done')),
  priority text not null default 'Normal'
    check (priority in ('Normal', 'Pinned')),
  job_id uuid references public.jobs(id) on delete set null,
  due_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null
    check (owner_type in ('opportunity', 'estimate', 'job', 'change_order', 'submittal', 'purchase_order')),
  owner_id uuid not null,
  author text,
  author_id uuid references auth.users(id) on delete set null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  snapshot jsonb not null,
  material_total numeric(14,2) not null default 0,
  bid_total numeric(14,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.historical_results (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  client text,
  project_name text,
  work_type text,
  job_type text,
  gc text,
  pm text,
  bid_value numeric(14,2) not null default 0,
  contract_value numeric(14,2) not null default 0,
  approved_co_value numeric(14,2) not null default 0,
  final_cost numeric(14,2),
  margin_pct numeric(6,2),
  result text,
  recorded_at timestamptz not null default now()
);

create table public.pricing_library_items (
  id uuid primary key default gen_random_uuid(),
  code text,
  category text,
  material_type text,
  name text not null,
  description text,
  unit text,
  unit_cost numeric(14,2) not null default 0,
  material_cost numeric(14,2),
  labor_cost numeric(14,2),
  source text not null default 'manual'
    check (source in ('manual', 'import')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.app_user_profiles where id = auth.uid() and active = true),
    'viewer'
  );
$$;

create or replace function public.can_write_estimating()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'estimator');
$$;

create or replace function public.can_write_pm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'pm');
$$;

create or replace function public.can_write_shared()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'estimator', 'pm');
$$;

create or replace function public.can_write_estimate_header(target_document_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_app_role() in ('admin', 'estimator')
    or (
      public.current_app_role() = 'pm'
      and target_document_type = 'Change Order'
    );
$$;

create or replace function public.can_write_estimate(target_estimate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.estimates e
    where e.id = target_estimate_id
      and public.can_write_estimate_header(e.document_type)
  );
$$;

create or replace function public.can_write_estimate_area(target_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.estimate_areas a
    where a.id = target_area_id
      and public.can_write_estimate(a.estimate_id)
  );
$$;

create or replace function public.can_write_estimate_section(target_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.estimate_sections s
    join public.estimate_areas a on a.id = s.area_id
    where s.id = target_section_id
      and public.can_write_estimate(a.estimate_id)
  );
$$;

create index opportunities_status_due_idx on public.opportunities(status, bid_due_date);
create index opportunities_year_month_idx on public.opportunities(year, month);
create index opportunities_company_idx on public.opportunities(company_id);
create index estimates_opportunity_idx on public.estimates(opportunity_id);
create index estimates_job_idx on public.estimates(job_id);
create index estimate_areas_estimate_idx on public.estimate_areas(estimate_id, sort_order);
create index estimate_sections_area_idx on public.estimate_sections(area_id, sort_order);
create index estimate_items_section_idx on public.estimate_items(section_id, sort_order);
create index estimate_items_takeoff_idx on public.estimate_items(category, material_type, unit);
create index jobs_status_install_idx on public.jobs(backlog_status, install_start, install_end);
create index jobs_pm_idx on public.jobs(pm_user_id);
create index change_orders_job_status_idx on public.change_orders(job_id, status);
create index purchase_orders_job_status_idx on public.purchase_orders(job_id, status);
create index submittals_job_status_idx on public.submittals(job_id, status);
create index files_owner_idx on public.files(owner_type, owner_id);
create index pm_notes_status_due_idx on public.pm_notes(status, due_date);
create index activity_events_owner_idx on public.activity_events(owner_type, owner_id, created_at desc);
create index historical_results_recorded_idx on public.historical_results(recorded_at);

create trigger app_user_profiles_updated_at before update on public.app_user_profiles
  for each row execute function public.set_updated_at();
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger opportunities_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger estimates_updated_at before update on public.estimates
  for each row execute function public.set_updated_at();
create trigger change_orders_updated_at before update on public.change_orders
  for each row execute function public.set_updated_at();
create trigger purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();
create trigger submittals_updated_at before update on public.submittals
  for each row execute function public.set_updated_at();
create trigger pricing_library_items_updated_at before update on public.pricing_library_items
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

insert into public.app_user_profiles (id, full_name, role, active)
select id, coalesce(raw_user_meta_data->>'full_name', email, 'Evan Ramsey'), 'admin', true
from auth.users
where lower(email) = 'escalador.evan@gmail.com'
on conflict (id) do update
set full_name = excluded.full_name,
    role = 'admin',
    active = true,
    updated_at = now();

alter table public.app_user_profiles enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_contacts enable row level security;
alter table public.jobs enable row level security;
alter table public.job_contacts enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_areas enable row level security;
alter table public.estimate_sections enable row level security;
alter table public.estimate_items enable row level security;
alter table public.estimate_subcontractor_items enable row level security;
alter table public.estimate_alternates enable row level security;
alter table public.change_orders enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.submittals enable row level security;
alter table public.files enable row level security;
alter table public.pm_notes enable row level security;
alter table public.activity_events enable row level security;
alter table public.estimate_snapshots enable row level security;
alter table public.historical_results enable row level security;
alter table public.pricing_library_items enable row level security;

create policy app_profiles_select on public.app_user_profiles
  for select to authenticated using (id = auth.uid() or public.current_app_role() = 'admin');
create policy app_profiles_admin_write on public.app_user_profiles
  for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create policy shared_select_companies on public.companies
  for select to authenticated using (true);
create policy shared_write_companies on public.companies
  for all to authenticated using (public.can_write_shared()) with check (public.can_write_shared());

create policy shared_select_contacts on public.contacts
  for select to authenticated using (true);
create policy shared_write_contacts on public.contacts
  for all to authenticated using (public.can_write_shared()) with check (public.can_write_shared());

create policy estimating_select_opportunities on public.opportunities
  for select to authenticated using (true);
create policy estimating_write_opportunities on public.opportunities
  for all to authenticated using (public.can_write_estimating()) with check (public.can_write_estimating());

create policy estimating_select_opportunity_contacts on public.opportunity_contacts
  for select to authenticated using (true);
create policy estimating_write_opportunity_contacts on public.opportunity_contacts
  for all to authenticated using (public.can_write_estimating()) with check (public.can_write_estimating());

create policy jobs_select on public.jobs
  for select to authenticated using (true);
create policy jobs_write on public.jobs
  for all to authenticated using (public.can_write_shared()) with check (public.can_write_shared());

create policy job_contacts_select on public.job_contacts
  for select to authenticated using (true);
create policy job_contacts_write on public.job_contacts
  for all to authenticated using (public.can_write_shared()) with check (public.can_write_shared());

create policy estimates_select on public.estimates
  for select to authenticated using (true);
create policy estimates_write on public.estimates
  for all to authenticated
  using (public.can_write_estimate(id))
  with check (public.can_write_estimate_header(document_type));

create policy estimate_areas_select on public.estimate_areas
  for select to authenticated using (true);
create policy estimate_areas_write on public.estimate_areas
  for all to authenticated
  using (public.can_write_estimate(estimate_id))
  with check (public.can_write_estimate(estimate_id));

create policy estimate_sections_select on public.estimate_sections
  for select to authenticated using (true);
create policy estimate_sections_write on public.estimate_sections
  for all to authenticated
  using (public.can_write_estimate_area(area_id))
  with check (public.can_write_estimate_area(area_id));

create policy estimate_items_select on public.estimate_items
  for select to authenticated using (true);
create policy estimate_items_write on public.estimate_items
  for all to authenticated
  using (public.can_write_estimate_section(section_id))
  with check (public.can_write_estimate_section(section_id));

create policy estimate_sub_items_select on public.estimate_subcontractor_items
  for select to authenticated using (true);
create policy estimate_sub_items_write on public.estimate_subcontractor_items
  for all to authenticated
  using (public.can_write_estimate(estimate_id))
  with check (public.can_write_estimate(estimate_id));

create policy estimate_alternates_select on public.estimate_alternates
  for select to authenticated using (true);
create policy estimate_alternates_write on public.estimate_alternates
  for all to authenticated
  using (public.can_write_estimate(estimate_id))
  with check (public.can_write_estimate(estimate_id));

create policy change_orders_select on public.change_orders
  for select to authenticated using (true);
create policy change_orders_write on public.change_orders
  for all to authenticated
  using (public.can_write_estimating() or public.can_write_pm())
  with check (
    public.can_write_estimating()
    or public.can_write_pm()
    and (estimate_id is null or public.can_write_estimate(estimate_id))
  );

create policy purchase_orders_select on public.purchase_orders
  for select to authenticated using (true);
create policy purchase_orders_write on public.purchase_orders
  for all to authenticated using (public.can_write_pm()) with check (public.can_write_pm());

create policy submittals_select on public.submittals
  for select to authenticated using (true);
create policy submittals_write on public.submittals
  for all to authenticated using (public.can_write_pm()) with check (public.can_write_pm());

create policy files_select on public.files
  for select to authenticated using (true);
create policy files_write on public.files
  for all to authenticated using (public.can_write_shared()) with check (public.can_write_shared());

create policy pm_notes_select on public.pm_notes
  for select to authenticated using (true);
create policy pm_notes_write on public.pm_notes
  for all to authenticated using (public.can_write_pm()) with check (public.can_write_pm());

create policy activity_events_select on public.activity_events
  for select to authenticated using (true);
create policy activity_events_insert on public.activity_events
  for insert to authenticated with check (public.can_write_shared());

create policy estimate_snapshots_select on public.estimate_snapshots
  for select to authenticated using (true);
create policy estimate_snapshots_write on public.estimate_snapshots
  for all to authenticated
  using (public.can_write_estimate(estimate_id))
  with check (public.can_write_estimate(estimate_id));

create policy historical_results_select on public.historical_results
  for select to authenticated using (true);
create policy historical_results_write on public.historical_results
  for all to authenticated using (public.current_app_role() in ('admin', 'estimator')) with check (public.current_app_role() in ('admin', 'estimator'));

create policy pricing_library_select on public.pricing_library_items
  for select to authenticated using (true);
create policy pricing_library_write on public.pricing_library_items
  for all to authenticated using (public.current_app_role() in ('admin', 'estimator')) with check (public.current_app_role() in ('admin', 'estimator'));

create policy storage_project_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'project-files');

create policy storage_project_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-files' and public.can_write_shared());

create policy storage_project_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'project-files' and public.can_write_shared())
  with check (bucket_id = 'project-files' and public.can_write_shared());

create policy storage_project_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'project-files' and public.can_write_shared());

commit;
