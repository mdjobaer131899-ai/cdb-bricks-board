import { createClient } from "@supabase/supabase-js";

/**
 * মূল এডমিনের পাসওয়ার্ড যাচাই।
 * user_roles থেকে admin ইউজারদের ইমেইল নিয়ে সেই পাসওয়ার্ড দিয়ে লগইন চেষ্টা করা হয়।
 * কোনো একটি admin অ্যাকাউন্টের পাসওয়ার্ড মিললে true।
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || password.length < 4) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(10);
  if (error || !roles?.length) return false;

  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const anon = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  for (const r of roles) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
    const email = u?.user?.email;
    if (!email) continue;
    const res = await anon.auth.signInWithPassword({ email, password });
    if (!res.error && res.data?.user) {
      await anon.auth.signOut();
      return true;
    }
  }
  return false;
}
