import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

/**
 * বর্তমান লগইন করা এডমিনের পাসওয়ার্ড যাচাই (Service Role Key ছাড়াই ১০০% নিরাপদভাবে কাজ করবে)
 */
export async function verifyCurrentAdminPassword(userId: string, password: string): Promise<boolean> {
  if (!userId || !password || password.length < 4) return false;

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL;

  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return false;

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return false;

  // বর্তমান লগইন করা ইউজারের ক্লায়েন্ট
  const userClient = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  // ধাপ ১: বর্তমান ইউজারের ভূমিকা 'admin' কিনা যাচাই
  const { data: roleData, error: roleError } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (roleError || roleData?.role !== "admin") {
    return false;
  }

  // ধাপ ২: বর্তমান ইউজারের ইমেইল সংগ্রহ
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  const email = userData?.user?.email;
  if (userError || !email) {
    return false;
  }

  // ধাপ ৩: ক্ষণস্থায়ী নন-পারসিস্টেন্ট ক্লায়েন্ট দিয়ে পাসওয়ার্ড পরীক্ষা
  const ephemeralClient = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  try {
    const res = await ephemeralClient.auth.signInWithPassword({ email, password });
    if (!res.error && res.data?.user?.id === userId) {
      await ephemeralClient.auth.signOut();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function verifyAdminPassword(password: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  return verifyCurrentAdminPassword(userId, password);
}