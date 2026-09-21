import { createClient } from "@supabase/supabase-js";

/**
 * বর্তমান লগইন করা এডমিনের পাসওয়ার্ড যাচাই।
 * ১. নিশ্চিত করা হয় যে বর্তমান ইউজারটি একজন অনুমোদিত admin (user_roles টেবিল থেকে)।
 * ২. শুধুমাত্র বর্তমান ইউজারের ইমেইল ব্যবহার করে পাসওয়ার্ড পরীক্ষা করা হয়।
 * ৩. অন্য কোনো এডমিনের পাসওয়ার্ড এখানে গ্রহণ করা হয় না।
 * ৪. সক্রিয় সেশন পরিবর্তন না করে একটি ক্ষণস্থায়ী (ephemeral) ক্লায়েন্ট ব্যবহার করা হয়।
 */
export async function verifyCurrentAdminPassword(userId: string, password: string): Promise<boolean> {
  if (!userId || !password || password.length < 4) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // ধাপ ১: বর্তমান ইউজারের ভূমিকা 'admin' কিনা যাচাই
  const { data: roleData, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (roleError || roleData?.role !== "admin") {
    return false;
  }

  // ধাপ ২: বর্তমান ইউজারের ইমেইল সংগ্রহ
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userError || !email) {
    return false;
  }

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return false;

  // ধাপ ৩: ক্ষণস্থায়ী নন-পারসিস্টেন্ট ক্লায়েন্ট তৈরি
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

/**
 * Backward compatibility alias (now requiring userId or defaulting safely).
 */
export async function verifyAdminPassword(password: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  return verifyCurrentAdminPassword(userId, password);
}
