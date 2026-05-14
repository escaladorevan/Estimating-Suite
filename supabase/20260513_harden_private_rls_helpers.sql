-- Move RLS helper functions out of the exposed public API schema.
-- Run after rebuild-production-schema.sql until the reset file is folded forward.

begin;

create schema if not exists app_private;

create or replace function app_private.set_updated_at()
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

create or replace function app_private.current_app_role()
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

create or replace function app_private.can_write_estimating()
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select app_private.current_app_role() in ('admin', 'estimator');
$$;

create or replace function app_private.can_write_pm()
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select app_private.current_app_role() in ('admin', 'pm');
$$;

create or replace function app_private.can_write_shared()
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select app_private.current_app_role() in ('admin', 'estimator', 'pm');
$$;

create or replace function app_private.can_write_estimate_header(target_document_type text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select
    app_private.current_app_role() in ('admin', 'estimator')
    or (
      app_private.current_app_role() = 'pm'
      and target_document_type = 'Change Order'
    );
$$;

create or replace function app_private.can_write_estimate(target_estimate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists (
    select 1
    from public.estimates e
    where e.id = target_estimate_id
      and app_private.can_write_estimate_header(e.document_type)
  );
$$;

create or replace function app_private.can_write_estimate_area(target_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists (
    select 1
    from public.estimate_areas a
    where a.id = target_area_id
      and app_private.can_write_estimate(a.estimate_id)
  );
$$;

create or replace function app_private.can_write_estimate_section(target_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select exists (
    select 1
    from public.estimate_sections s
    join public.estimate_areas a on a.id = s.area_id
    where s.id = target_section_id
      and app_private.can_write_estimate(a.estimate_id)
  );
$$;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;
revoke all on all functions in schema app_private from public, anon;
grant execute on all functions in schema app_private to authenticated;

drop trigger if exists app_user_profiles_updated_at on public.app_user_profiles;
drop trigger if exists companies_updated_at on public.companies;
drop trigger if exists contacts_updated_at on public.contacts;
drop trigger if exists opportunities_updated_at on public.opportunities;
drop trigger if exists jobs_updated_at on public.jobs;
drop trigger if exists estimates_updated_at on public.estimates;
drop trigger if exists change_orders_updated_at on public.change_orders;
drop trigger if exists purchase_orders_updated_at on public.purchase_orders;
drop trigger if exists submittals_updated_at on public.submittals;
drop trigger if exists pricing_library_items_updated_at on public.pricing_library_items;

create trigger app_user_profiles_updated_at before update on public.app_user_profiles for each row execute function app_private.set_updated_at();
create trigger companies_updated_at before update on public.companies for each row execute function app_private.set_updated_at();
create trigger contacts_updated_at before update on public.contacts for each row execute function app_private.set_updated_at();
create trigger opportunities_updated_at before update on public.opportunities for each row execute function app_private.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function app_private.set_updated_at();
create trigger estimates_updated_at before update on public.estimates for each row execute function app_private.set_updated_at();
create trigger change_orders_updated_at before update on public.change_orders for each row execute function app_private.set_updated_at();
create trigger purchase_orders_updated_at before update on public.purchase_orders for each row execute function app_private.set_updated_at();
create trigger submittals_updated_at before update on public.submittals for each row execute function app_private.set_updated_at();
create trigger pricing_library_items_updated_at before update on public.pricing_library_items for each row execute function app_private.set_updated_at();

drop policy if exists app_profiles_select on public.app_user_profiles;
drop policy if exists app_profiles_admin_write on public.app_user_profiles;
drop policy if exists shared_write_companies on public.companies;
drop policy if exists shared_write_contacts on public.contacts;
drop policy if exists estimating_write_opportunities on public.opportunities;
drop policy if exists estimating_write_opportunity_contacts on public.opportunity_contacts;
drop policy if exists jobs_write on public.jobs;
drop policy if exists job_contacts_write on public.job_contacts;
drop policy if exists estimates_write on public.estimates;
drop policy if exists estimate_areas_write on public.estimate_areas;
drop policy if exists estimate_sections_write on public.estimate_sections;
drop policy if exists estimate_items_write on public.estimate_items;
drop policy if exists estimate_sub_items_write on public.estimate_subcontractor_items;
drop policy if exists estimate_alternates_write on public.estimate_alternates;
drop policy if exists change_orders_write on public.change_orders;
drop policy if exists purchase_orders_write on public.purchase_orders;
drop policy if exists submittals_write on public.submittals;
drop policy if exists files_write on public.files;
drop policy if exists pm_notes_write on public.pm_notes;
drop policy if exists activity_events_insert on public.activity_events;
drop policy if exists estimate_snapshots_write on public.estimate_snapshots;
drop policy if exists historical_results_write on public.historical_results;
drop policy if exists pricing_library_write on public.pricing_library_items;
drop policy if exists storage_project_files_insert on storage.objects;
drop policy if exists storage_project_files_update on storage.objects;
drop policy if exists storage_project_files_delete on storage.objects;

create policy app_profiles_select on public.app_user_profiles for select to authenticated using (id = auth.uid() or app_private.current_app_role() = 'admin');
create policy app_profiles_admin_write on public.app_user_profiles for all to authenticated using (app_private.current_app_role() = 'admin') with check (app_private.current_app_role() = 'admin');
create policy shared_write_companies on public.companies for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared());
create policy shared_write_contacts on public.contacts for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared());
create policy estimating_write_opportunities on public.opportunities for all to authenticated using (app_private.can_write_estimating()) with check (app_private.can_write_estimating());
create policy estimating_write_opportunity_contacts on public.opportunity_contacts for all to authenticated using (app_private.can_write_estimating()) with check (app_private.can_write_estimating());
create policy jobs_write on public.jobs for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared());
create policy job_contacts_write on public.job_contacts for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared());
create policy estimates_write on public.estimates for all to authenticated using (app_private.can_write_estimate(id)) with check (app_private.can_write_estimate_header(document_type));
create policy estimate_areas_write on public.estimate_areas for all to authenticated using (app_private.can_write_estimate(estimate_id)) with check (app_private.can_write_estimate(estimate_id));
create policy estimate_sections_write on public.estimate_sections for all to authenticated using (app_private.can_write_estimate_area(area_id)) with check (app_private.can_write_estimate_area(area_id));
create policy estimate_items_write on public.estimate_items for all to authenticated using (app_private.can_write_estimate_section(section_id)) with check (app_private.can_write_estimate_section(section_id));
create policy estimate_sub_items_write on public.estimate_subcontractor_items for all to authenticated using (app_private.can_write_estimate(estimate_id)) with check (app_private.can_write_estimate(estimate_id));
create policy estimate_alternates_write on public.estimate_alternates for all to authenticated using (app_private.can_write_estimate(estimate_id)) with check (app_private.can_write_estimate(estimate_id));
create policy change_orders_write on public.change_orders for all to authenticated using (app_private.can_write_estimating() or app_private.can_write_pm()) with check ((app_private.can_write_estimating() or app_private.can_write_pm()) and (estimate_id is null or app_private.can_write_estimate(estimate_id)));
create policy purchase_orders_write on public.purchase_orders for all to authenticated using (app_private.can_write_pm()) with check (app_private.can_write_pm());
create policy submittals_write on public.submittals for all to authenticated using (app_private.can_write_pm()) with check (app_private.can_write_pm());
create policy files_write on public.files for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared());
create policy pm_notes_write on public.pm_notes for all to authenticated using (app_private.can_write_pm()) with check (app_private.can_write_pm());
create policy activity_events_insert on public.activity_events for insert to authenticated with check (app_private.can_write_shared());
create policy estimate_snapshots_write on public.estimate_snapshots for all to authenticated using (app_private.can_write_estimate(estimate_id)) with check (app_private.can_write_estimate(estimate_id));
create policy historical_results_write on public.historical_results for all to authenticated using (app_private.current_app_role() in ('admin', 'estimator')) with check (app_private.current_app_role() in ('admin', 'estimator'));
create policy pricing_library_write on public.pricing_library_items for all to authenticated using (app_private.current_app_role() in ('admin', 'estimator')) with check (app_private.current_app_role() in ('admin', 'estimator'));
create policy storage_project_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'project-files' and app_private.can_write_shared());
create policy storage_project_files_update on storage.objects for update to authenticated using (bucket_id = 'project-files' and app_private.can_write_shared()) with check (bucket_id = 'project-files' and app_private.can_write_shared());
create policy storage_project_files_delete on storage.objects for delete to authenticated using (bucket_id = 'project-files' and app_private.can_write_shared());

drop function if exists public.can_write_estimate(uuid);
drop function if exists public.can_write_estimate_area(uuid);
drop function if exists public.can_write_estimate_header(text);
drop function if exists public.can_write_estimate_section(uuid);
drop function if exists public.can_write_estimating();
drop function if exists public.can_write_pm();
drop function if exists public.can_write_shared();
drop function if exists public.current_app_role();
drop function if exists public.set_updated_at();

commit;
