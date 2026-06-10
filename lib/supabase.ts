import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    db: { schema: "socialsync" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "socialsync";
}
