alter table opportunities
  add column if not exists initial_contract_value numeric(14,2);
