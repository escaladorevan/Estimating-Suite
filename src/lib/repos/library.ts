import { supabase } from "../supabase-client";
import type { Contact, LibraryItem } from "../types";
import { isUuid } from "./opportunities";

export type LibraryRow = {
  id: string;
  category: string;
  description: string;
  unit_cost: number | string;
  uom: string;
  active: boolean;
};

export type ContactRow = {
  id: string;
  company: string;
  attention: string;
  address: string;
  phone: string;
  email: string;
};

export function mapLibraryFromRow(row: LibraryRow): LibraryItem {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    unitCost: Number(row.unit_cost) || 0,
    uom: row.uom,
    active: row.active
  };
}

export function mapContactFromRow(row: ContactRow): Contact {
  return {
    id: row.id,
    company: row.company,
    attention: row.attention,
    address: row.address,
    phone: row.phone,
    email: row.email
  };
}

export async function listLibraryItems(): Promise<LibraryItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pricing_library_items")
    .select("*")
    .eq("active", true)
    .order("category")
    .order("description");
  if (error) throw error;
  return ((data ?? []) as LibraryRow[]).map(mapLibraryFromRow);
}

export async function saveLibraryItem(item: LibraryItem): Promise<LibraryItem> {
  if (!supabase) return item;
  const row = {
    ...(isUuid(item.id) ? { id: item.id } : {}),
    category: item.category,
    description: item.description,
    unit_cost: item.unitCost,
    uom: item.uom,
    active: item.active
  };
  const { data, error } = await supabase.from("pricing_library_items").upsert(row).select("*").single();
  if (error) throw error;
  return mapLibraryFromRow(data as LibraryRow);
}

export async function listContacts(): Promise<Contact[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("contacts").select("*").order("company");
  if (error) throw error;
  return ((data ?? []) as ContactRow[]).map(mapContactFromRow);
}

export async function saveContact(contact: Contact): Promise<Contact> {
  if (!supabase) return contact;
  const row = {
    ...(isUuid(contact.id) ? { id: contact.id } : {}),
    company: contact.company,
    attention: contact.attention,
    address: contact.address,
    phone: contact.phone,
    email: contact.email
  };
  const { data, error } = await supabase.from("contacts").upsert(row).select("*").single();
  if (error) throw error;
  return mapContactFromRow(data as ContactRow);
}
