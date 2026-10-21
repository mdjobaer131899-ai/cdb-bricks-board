import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";

/**
 * ঠিক দামে বুকিং (অগ্রিম ইট বিক্রি): a customer books bricks of one or more types at a
 * fixed price per piece and pays in full up front. Challans against the booking keep
 * that price; pieces beyond it are a normal sale at the day's price.
 *
 * Stored as a contracts row (contract_type 'yearly_fixed') + contract_items (one row per
 * brick type with quantity and rate) + collections with contract_id (the money). Read
 * all-time: a booking lives until its bricks are delivered, across seasons.
 *
 * অগ্রিম টাকা (money first, the day's price at delivery) is not a booking: it is a plain
 * collection and lives in the customer's normal account.
 */

export type BookingItem = {
  brick_type_id: string;
  brick: string;
  quantity: number;
  rate: number;
  /** delivered on approved challans */
  delivered: number;
  /** on challans still waiting for approval */
  pending: number;
  /** still to give = quantity − delivered − pending */
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
    fetchAllRows<any>(() => (supabase as any).from("contract_items").select("id, contract_id, brick_type_id, quantity, rate").in("contract_id", ids).order("id")),
    fetchAllRows<any>(() => supabase.from("sales_entries").select("id, contract_id, brick_type_id, quantity, total_amount, status").in("contract_id", ids).neq("status", "rejected").order("id")),
    fetchAllRows<any>(() => supabase.from("collections").select("id, contract_id, amount").in("contract_id", ids).order("id")),
    supabase.from("brick_types").select("id, name"),
  ]);
  const brickName = new Map(((bricks as any).data ?? []).map((b: any) => [b.id as string, String(b.name)]));

  return list.map((c) => {
    const mine = sales.filter((s) => s.contract_id === c.id);
    const its: BookingItem[] = items.filter((i) => i.contract_id === c.id).map((i) => {
      const of = mine.filter((s) => s.brick_type_id === i.brick_type_id);
      const delivered = of.filter((s) => s.status === "approved").reduce((a, s) => a + Number(s.quantity || 0), 0);
      const pending = of.filter((s) => s.status === "pending").reduce((a, s) => a + Number(s.quantity || 0), 0);
      const quantity = Number(i.quantity || 0);
      return {
        brick_type_id: i.brick_type_id, brick: (brickName.get(i.brick_type_id) as string) ?? "ইট", quantity, rate: Number(i.rate || 0),
        delivered, pending, remaining: Math.max(0, quantity - delivered - pending),
      };
    });
    const paid = cols.filter((x) => x.contract_id === c.id).reduce((a, x) => a + Number(x.amount || 0), 0);
    const deliveredValue = mine.filter((s) => s.status === "approved").reduce((a, s) => a + Number(s.total_amount || 0), 0);
    return {
      id: c.id, no: c.contract_no, customer_id: c.customer_id, customer: c.customer?.name ?? "—", date: c.start_date, status: c.status, note: c.notes,
      items: its, value: its.reduce((a, i) => a + i.quantity * i.rate, 0), paid, deliveredValue, owed: paid - deliveredValue,
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

/**
 * How a challan of `qty` pieces splits against a booking line: up to what is left at the
 * booking price, the rest as a normal sale (the day's price).
 */
export function splitAgainstBooking(qty: number, remaining: number) {
  const fromBooking = Math.max(0, Math.min(qty, remaining));
  return { fromBooking, extra: Math.max(0, qty - fromBooking) };
}
