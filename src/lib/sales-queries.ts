import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SaleStatus = Database["public"]["Enums"]["sale_status"];
export type SaleType = Database["public"]["Enums"]["sale_type"];

export interface SaleRow {
  id: string;
  challan_no: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  sale_type: SaleType;
  status: SaleStatus;
  sale_date: string;
  created_at: string;
  created_by: string;
  approved_by: string | null;
  customer: { id: string; name: string } | null;
  brick_type: { id: string; name: string } | null;
  manager_name: string;
}

const BASE_SELECT = `
  id, challan_no, quantity, unit_price, total_amount, sale_type, status,
  sale_date, created_at, created_by, approved_by,
  customer:customers(id, name),
  brick_type:brick_types(id, name)
`;

async function attachManagers<T extends { created_by: string }>(rows: T[]) {
  const ids = Array.from(new Set(rows.map((r) => r.created_by)));
  if (ids.length === 0) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.full_name || ""]));
}

export async function fetchSales(params: { from?: string; to?: string; createdBy?: string; limit?: number }): Promise<SaleRow[]> {
  let q = supabase.from("sales_entries").select(BASE_SELECT).order("sale_date", { ascending: false }).order("created_at", { ascending: false });
  if (params.from) q = q.gte("sale_date", params.from);
  if (params.to) q = q.lte("sale_date", params.to);
  if (params.createdBy) q = q.eq("created_by", params.createdBy);
  if (params.limit) q = q.limit(params.limit);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Omit<SaleRow, "manager_name">>;
  const map = await attachManagers(rows);
  return rows.map((r) => ({ ...r, manager_name: map.get(r.created_by) || "—" }));
}

export async function fetchAllCustomers() {
  const { data, error } = await supabase.from("customers").select("id, name, phone, address, created_at").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchActiveBrickTypes() {
  const { data, error } = await supabase
    .from("brick_types")
    .select("id, name, default_unit_price")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function fetchCollections(params: { from?: string; to?: string }): Promise<{ id: string; customer_id: string; amount: number; payment_date: string }[]> {
  let q = supabase.from("collections").select("id, customer_id, amount, payment_date").order("payment_date", { ascending: false });
  if (params.from) q = q.gte("payment_date", params.from);
  if (params.to) q = q.lte("payment_date", params.to);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
