import type { Company, CompanyType, Contact, ProjectContact } from "@/types";
import { supabase } from "./supabase-client";

export type CompanyRow = {
  id: string;
  name: string;
  company_type: CompanyType | string;
  main_address: string | null;
  billing_address: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[] | null;
  active: boolean | null;
};

export type ContactRow = {
  id: string;
  company_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
  tags: string[] | null;
  active: boolean | null;
};

export type JobContactRow = {
  id: string;
  job_id: string;
  contact_id: string;
  role: string;
};

export type OpportunityContactRow = {
  id: string;
  opportunity_id: string;
  contact_id: string;
  role: string;
};

export type CompanyUpsert = {
  id?: string;
  name: string;
  company_type: CompanyType;
  main_address: string | null;
  billing_address: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  active: boolean;
};

export type ContactUpsert = {
  id?: string;
  company_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
  tags: string[];
  active: boolean;
};

type SupabaseContactClient = {
  from: (table: "companies" | "contacts" | "job_contacts" | "opportunity_contacts") => any;
};

const COMPANY_TYPES: CompanyType[] = ["GC", "Architect", "Owner", "Supplier", "Subcontractor", "Vendor", "Consultant", "Other"];

export function mapCompanyFromRow(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    companyType: normalizeCompanyType(row.company_type),
    mainAddress: row.main_address ?? undefined,
    billingAddress: row.billing_address ?? undefined,
    website: row.website ?? undefined,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    tags: row.tags ?? [],
    active: row.active ?? true
  };
}

export function mapContactFromRow(row: ContactRow, company?: Company): Contact {
  return {
    id: row.id,
    companyId: row.company_id ?? undefined,
    company,
    name: row.name,
    title: row.title ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    mobile: row.mobile ?? undefined,
    notes: row.notes ?? undefined,
    tags: row.tags ?? [],
    active: row.active ?? true
  };
}

export function mapJobContactFromRow(row: JobContactRow, contact?: Contact): ProjectContact {
  return {
    id: row.id,
    contactId: row.contact_id,
    contact,
    role: row.role
  };
}

export function mapOpportunityContactFromRow(row: OpportunityContactRow, contact?: Contact): ProjectContact {
  return {
    id: row.id,
    contactId: row.contact_id,
    contact,
    role: row.role
  };
}

export function mapCompanyToUpsert(company: Company): CompanyUpsert {
  return {
    id: isUuid(company.id) ? company.id : undefined,
    name: company.name,
    company_type: company.companyType,
    main_address: company.mainAddress ?? null,
    billing_address: company.billingAddress ?? null,
    website: company.website ?? null,
    phone: company.phone ?? null,
    notes: company.notes ?? null,
    tags: company.tags,
    active: company.active
  };
}

export function mapContactToUpsert(contact: Contact): ContactUpsert {
  return {
    id: isUuid(contact.id) ? contact.id : undefined,
    company_id: contact.companyId && isUuid(contact.companyId) ? contact.companyId : null,
    name: contact.name,
    title: contact.title ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    mobile: contact.mobile ?? null,
    notes: contact.notes ?? null,
    tags: contact.tags,
    active: contact.active
  };
}

export async function listCompanies(client: SupabaseContactClient | null = supabase): Promise<Company[]> {
  if (!client) return [];
  const { data, error } = await client.from("companies").select("*").eq("active", true).order("name");
  if (error) throw error;
  return (data ?? []).map((row: CompanyRow) => mapCompanyFromRow(row));
}

export async function listContacts(client: SupabaseContactClient | null = supabase): Promise<Contact[]> {
  if (!client) return [];
  const { data, error } = await client.from("contacts").select("*").eq("active", true).order("name");
  if (error) throw error;
  return (data ?? []).map((row: ContactRow) => mapContactFromRow(row));
}

export async function saveCompany(company: Company, client: SupabaseContactClient | null = supabase): Promise<Company> {
  if (!client) return company;
  const { data, error } = await client.from("companies").upsert(mapCompanyToUpsert(company)).select("*").single();
  if (error) throw error;
  return data ? mapCompanyFromRow(data) : company;
}

export async function saveContact(contact: Contact, client: SupabaseContactClient | null = supabase): Promise<Contact> {
  if (!client) return contact;
  const { data, error } = await client.from("contacts").upsert(mapContactToUpsert(contact)).select("*").single();
  if (error) throw error;
  return data ? mapContactFromRow(data) : contact;
}

export async function addJobContact(
  jobId: string,
  contactId: string,
  role: string,
  client: SupabaseContactClient | null = supabase
): Promise<ProjectContact> {
  if (!client) throw new Error("No Supabase client");
  const { data, error } = await client
    .from("job_contacts")
    .upsert({ job_id: jobId, contact_id: contactId, role }, { onConflict: "job_id,contact_id,role" })
    .select("*")
    .single();
  if (error) throw error;
  return mapJobContactFromRow(data as JobContactRow);
}

export async function removeJobContact(joinId: string, client: SupabaseContactClient | null = supabase): Promise<void> {
  if (!client) return;
  const { error } = await client.from("job_contacts").delete().eq("id", joinId);
  if (error) throw error;
}

export async function addOpportunityContact(
  opportunityId: string,
  contactId: string,
  role: string,
  client: SupabaseContactClient | null = supabase
): Promise<ProjectContact> {
  if (!client) throw new Error("No Supabase client");
  const { data, error } = await client
    .from("opportunity_contacts")
    .upsert({ opportunity_id: opportunityId, contact_id: contactId, role }, { onConflict: "opportunity_id,contact_id,role" })
    .select("*")
    .single();
  if (error) throw error;
  return mapOpportunityContactFromRow(data as OpportunityContactRow);
}

export async function removeOpportunityContact(joinId: string, client: SupabaseContactClient | null = supabase): Promise<void> {
  if (!client) return;
  const { error } = await client.from("opportunity_contacts").delete().eq("id", joinId);
  if (error) throw error;
}

export async function loadContactsForJobs(
  jobIds: string[],
  contactsRoster: Contact[],
  client: SupabaseContactClient | null = supabase
): Promise<Map<string, ProjectContact[]>> {
  const result = new Map<string, ProjectContact[]>(jobIds.map((id) => [id, []]));
  if (!client || !jobIds.length) return result;

  const { data, error } = await client.from("job_contacts").select("*").in("job_id", jobIds).order("role");
  if (error) throw error;

  const contactById = new Map(contactsRoster.map((contact) => [contact.id, contact]));
  for (const row of (data ?? []) as JobContactRow[]) {
    result.get(row.job_id)?.push(mapJobContactFromRow(row, contactById.get(row.contact_id)));
  }
  return result;
}

export async function loadContactsForOpportunities(
  opportunityIds: string[],
  contactsRoster: Contact[],
  client: SupabaseContactClient | null = supabase
): Promise<Map<string, ProjectContact[]>> {
  const result = new Map<string, ProjectContact[]>(opportunityIds.map((id) => [id, []]));
  if (!client || !opportunityIds.length) return result;

  const { data, error } = await client.from("opportunity_contacts").select("*").in("opportunity_id", opportunityIds).order("role");
  if (error) throw error;

  const contactById = new Map(contactsRoster.map((contact) => [contact.id, contact]));
  for (const row of (data ?? []) as OpportunityContactRow[]) {
    result.get(row.opportunity_id)?.push(mapOpportunityContactFromRow(row, contactById.get(row.contact_id)));
  }
  return result;
}

function normalizeCompanyType(value: CompanyType | string | null): CompanyType {
  return COMPANY_TYPES.includes(value as CompanyType) ? (value as CompanyType) : "Other";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
