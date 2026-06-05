export type Role = "admin" | "manager";

export interface SaleEntry {
  id: string;
  challanNo: string;
  customer: string;
  bricks: number;
  amount: number;
  type: "advance" | "regular";
  status: "pending" | "approved";
  managerName: string;
  date: string; // ISO
}

const customers = [
  "মেসার্স রহিম ট্রেডার্স",
  "করিম কনস্ট্রাকশন",
  "জনতা বিল্ডার্স",
  "সুমন এন্টারপ্রাইজ",
  "আলম ব্রাদার্স",
  "নিউ ঢাকা ট্রেডার্স",
  "শাহীন কনস্ট্রাকশন",
  "মেঘনা বিল্ডার্স",
];
const managers = ["আব্দুল হাসান", "রফিকুল ইসলাম", "সাইফুল আলম"];

function rand(n: number) {
  return Math.floor(Math.random() * n);
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function generateMockSales(count = 60): SaleEntry[] {
  const r = seededRandom(42);
  const entries: SaleEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const daysBack = Math.floor(r() * 30);
    const date = new Date(now - daysBack * 86400000 - Math.floor(r() * 86400000));
    const bricks = 500 + Math.floor(r() * 9500);
    entries.push({
      id: `s-${i}`,
      challanNo: `CDB-${2400 + i}`,
      customer: customers[Math.floor(r() * customers.length)],
      bricks,
      amount: bricks * (11 + Math.floor(r() * 4)),
      type: r() > 0.7 ? "advance" : "regular",
      status: r() > 0.35 ? "approved" : "pending",
      managerName: managers[Math.floor(r() * managers.length)],
      date: date.toISOString(),
    });
  }
  return entries.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export const MOCK_SALES = generateMockSales();
export const TOTAL_CUSTOMERS = customers.length * 18;
export const LIFETIME_BRICKS = 18_45_000;

void rand;
