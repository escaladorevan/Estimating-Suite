import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const productionSchemaPath = join(process.cwd(), "supabase", "rebuild-production-schema.sql");
const productionSchema = () => readFileSync(productionSchemaPath, "utf8");

const normalizeSql = (sql: string) => sql.replace(/\s+/g, " ").trim();

function policyBlock(sql: string, policyName: string, tableName: string): string {
  const match = sql.match(
    new RegExp(`create policy ${policyName} on ${tableName}[\\s\\S]*?(?=\\ncreate policy |\\ndrop function |\\ncommit;)`, "i")
  );

  expect(match, `${policyName} policy should exist on ${tableName}`).not.toBeNull();
  return normalizeSql(match![0]);
}

describe("production Supabase reset contract", () => {
  it("keeps private helper functions in app_private and drops legacy public helpers", () => {
    const sql = productionSchema();
    const normalized = normalizeSql(sql);

    expect(normalized).toContain("create schema if not exists app_private");
    expect(normalized).toContain("revoke all on schema app_private from public, anon");
    expect(normalized).toContain("grant usage on schema app_private to authenticated");
    expect(normalized).toContain("revoke all on all functions in schema app_private from public, anon");
    expect(normalized).toContain("grant execute on all functions in schema app_private to authenticated");

    const privateHelpers = [
      "set_updated_at",
      "current_app_role",
      "can_write_estimating",
      "can_write_pm",
      "can_write_shared",
      "can_write_estimate_header",
      "can_write_estimate",
      "can_write_estimate_area",
      "can_write_estimate_section"
    ];

    for (const helper of privateHelpers) {
      expect(sql).toMatch(new RegExp(`create or replace function app_private\\.${helper}\\(`));
      expect(sql).not.toMatch(new RegExp(`create or replace function public\\.${helper}\\(`));
      expect(sql).toMatch(new RegExp(`drop function if exists public\\.${helper}\\(`));
    }
  });

  it("enables RLS for the core production tables", () => {
    const normalized = normalizeSql(productionSchema());
    const coreTables = [
      "companies",
      "contacts",
      "opportunities",
      "opportunity_contacts",
      "estimates",
      "jobs",
      "job_contacts",
      "change_orders",
      "purchase_orders",
      "submittals",
      "files",
      "pm_notes",
      "activity_events",
      "pricing_library_items"
    ];

    for (const table of coreTables) {
      expect(normalized).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps change order writes parenthesized before estimate validation", () => {
    const block = policyBlock(productionSchema(), "change_orders_write", "public.change_orders");

    expect(block).toContain("for all to authenticated");
    expect(block).toContain("using (app_private.can_write_estimating() or app_private.can_write_pm())");
    expect(block).toContain(
      "with check ( (app_private.can_write_estimating() or app_private.can_write_pm()) and (estimate_id is null or app_private.can_write_estimate(estimate_id)) )"
    );
  });

  it("keeps project file storage bucket and storage policies locked to project-files", () => {
    const sql = productionSchema();
    const normalized = normalizeSql(sql);

    expect(normalized).toContain("insert into storage.buckets (id, name, public, file_size_limit)");
    expect(normalized).toContain("values ('project-files', 'project-files', false, 52428800)");

    expect(policyBlock(sql, "storage_project_files_select", "storage.objects")).toContain(
      "using (bucket_id = 'project-files')"
    );
    expect(policyBlock(sql, "storage_project_files_insert", "storage.objects")).toContain(
      "with check (bucket_id = 'project-files' and app_private.can_write_shared())"
    );
    expect(policyBlock(sql, "storage_project_files_update", "storage.objects")).toContain(
      "using (bucket_id = 'project-files' and app_private.can_write_shared()) with check (bucket_id = 'project-files' and app_private.can_write_shared())"
    );
    expect(policyBlock(sql, "storage_project_files_delete", "storage.objects")).toContain(
      "using (bucket_id = 'project-files' and app_private.can_write_shared())"
    );
  });

  it("keeps contact tables shared-read and shared-write through RLS", () => {
    const sql = productionSchema();

    expect(policyBlock(sql, "shared_select_companies", "public.companies")).toContain("for select to authenticated using (true)");
    expect(policyBlock(sql, "shared_write_companies", "public.companies")).toContain(
      "for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared())"
    );
    expect(policyBlock(sql, "shared_select_contacts", "public.contacts")).toContain("for select to authenticated using (true)");
    expect(policyBlock(sql, "shared_write_contacts", "public.contacts")).toContain(
      "for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared())"
    );
    expect(policyBlock(sql, "estimating_write_opportunity_contacts", "public.opportunity_contacts")).toContain(
      "for all to authenticated using (app_private.can_write_estimating()) with check (app_private.can_write_estimating())"
    );
    expect(policyBlock(sql, "job_contacts_write", "public.job_contacts")).toContain(
      "for all to authenticated using (app_private.can_write_shared()) with check (app_private.can_write_shared())"
    );
  });
});

describe("deprecated Supabase schema files", () => {
  it("clearly marks non-production schema resets as deprecated", () => {
    const deprecatedFiles = ["schema.sql", "rebuild-schema.sql"];

    for (const fileName of deprecatedFiles) {
      const contents = readFileSync(join(process.cwd(), "supabase", fileName), "utf8");
      const header = contents.split(/\r?\n/).slice(0, 4).join("\n");

      expect(header).toMatch(/DEPRECATED/i);
      expect(header).toContain("Do not run this for the production Next/Supabase app.");
      expect(header).toContain("The schema of record is supabase/rebuild-production-schema.sql.");
    }
  });
});
