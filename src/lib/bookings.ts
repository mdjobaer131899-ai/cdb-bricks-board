import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";

/**
 * ঠিক দামে বুকিং (অগ্রিম ইট বিক্রি): a customer books a number of trucks (গাড়ি) of one
 * or more brick types at a fixed price per piece and pays in full up front (trucks ×
 * usual pieces per truck × rate). Each challan is one truck; the owner picks per challan
 * whether it comes from the booking (2-3 a day, say). A booking truck is priced at the
 * booking rate for its actual pieces; any other truck is a normal sale at the day's price.
 *
 * Stored as a contracts row (contract_type 'yearly_fixed') + contract_items (one row per
 * brick type: trucks, pieces_per_truck, rate) + collections with contract_id (the money).
 * Read all-time: a booking lives until its trucks are delivered, across seasons.
 *
 * অগ্রিম টাকা (money first, the day's price at delivery) is not a booking: it is a plain
 * collection and lives in the customer's normal account.
 */

export type BookingItem = {
  brick_type_id: string;
  brick: string;
  /** trucks booked */
  trucks: number;
  /** usual pieces in one truck (sets the price paid up front) */
  perTruck: number;
  /** price per piece */
  rate: number;
  /** trucks delivered on approved challans, and their pieces */
  delivered: number;
  deliveredPieces: number;
  /** trucks on challans still waiting for approval */
  pending: number;
  /** trucks still to give = trucks − delivered − pending */
  remaining: number;
};

export type Booking = {
  id: string;
  no: string;
  customer_id: string;
  customer: string;
  date: string;
  status: string;
  note: string | null;
  items: BookingItem[];
  /** booked value = Σ quantity × rate */
  value: number;
  /** money taken for it */
  paid: number;
  /** value of bricks delivered at the booking price (approved challans) */
  deliveredValue: number;
  /** bricks still owed, in money: paid − delivered value (> 0 = we must give bricks) */
  owed: number;
};

export async function fetchBookings(opts: { customerId?: string } = {}): Promise<Booking[]> {
  let cq: any = (supabase as any).from("contracts")
    .select("id, contract_no, customer_id, start_date, status, notes, booked_quantity, fixed_rate, customer:customers(name)")
    .eq("contract_type", "yearly_fixed");
  if (opts.customerId) cq = cq.eq("customer_id", opts.customerId);
  const { data: contracts, error } = await cq.order("start_date", { ascending: false });
  if (error) throw error;
  const list = (contracts ?? []) as any[];
  if (!list.length) return [];
  const ids = list.map((c) => c.id as string);

  const [items, sales, cols, bricks] = await Promise.all([
    fetchAllRows<any>(() => (supabase as any).from("contract_items").select("id, contract_id, brick_type_id, trucks, pieces_per_truck, rate").in("contract_id", ids).order("id")),
    fetchAllRows<any>(() => supabase.from("sales_entries").select("id, contract_id, brick_type_id, quantity, total_amount, status").in("contract_id", ids).neq("status", "rejected").order("id")),
    fetchAllRows<any>(() => supabase.from("collections").select("id, contract_id, amount").in("contract_id", ids).order("id")),
    supabase.from("brick_types").select("id, name"),
  ]);
  const brickName = new Map(((bricks as any).data ?? []).map((b: any) => [b.id as string, String(b.name)]));

  return list.map((c) => {
    const mine = sales.filter((s) => s.contract_id === c.id);
    const its: BookingItem[] = items.filter((i) => i.contract_id === c.id).map((i) => {
      // one challan = one truck
      const of = mine.filter((s) => s.brick_type_id === i.brick_type_id);
      const ok = of.filter((s) => s.status === "approved");
      const delivered = ok.length;
      const pending = of.filter((s) => s.status === "pending").length;
      const trucks = Number(i.trucks || 0);
      return {
        brick_type_id: i.brick_type_id, brick: (brickName.get(i.brick_type_id) as string) ?? "ইট",
        trucks, perTruck: Number(i.pieces_per_truck || 0), rate: Number(i.rate || 0),
        delivered, deliveredPieces: ok.reduce((a, s) => a + Number(s.quantity || 0), 0), pending,
        remaining: Math.max(0, trucks - delivered - pending),
      };
    });
    const paid = cols.filter((x) => x.contract_id === c.id).reduce((a, x) => a + Number(x.amount || 0), 0);
    const deliveredValue = mine.filter((s) => s.status === "approved").reduce((a, s) => a + Number(s.total_amount || 0), 0);
    return {
      id: c.id, no: c.contract_no, customer_id: c.customer_id, customer: c.customer?.name ?? "—", date: c.start_date, status: c.status, note: c.notes,
      items: its, value: its.reduce((a, i) => a + i.trucks * i.perTruck * i.rate, 0), paid, deliveredValue, owed: paid - deliveredValue,
    };
  });
}

/** a booking still has bricks to give */
export const isOpen = (b: Booking) => b.status === "active" && b.items.some((i) => i.remaining > 0);

/** the booking line for one brick type, if it still has pieces to give */
export function bookingFor(bookings: Booking[], bookingId: string, brickTypeId: string) {
  const b = bookings.find((x) => x.id === bookingId);
  const item = b?.items.find((i) => i.brick_type_id === brickTypeId);
  return b && item ? { booking: b, item } : null;
}
