-- DEPRECATED PROTOTYPE PATCH.
-- Kept for historical context only.
-- The schema of record is supabase/rebuild-production-schema.sql.

alter table opportunities
  add column if not exists initial_contract_value numeric(14,2);
