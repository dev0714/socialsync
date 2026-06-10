import { getSupabaseAdminClient } from "@/lib/supabase";
import { decryptToken, encryptToken } from "./social/crypto";

// In-app configuration. Every runtime-tunable value lives here and can be edited from the
// Settings page; secrets are stored AES-256-GCM encrypted. The true bootstrap secrets
// (SUPABASE_*, SOCIALSYNC_PASSWORD, SOCIALSYNC_SESSION_SECRET, SOCIAL_TOKEN_SECRET) stay in
// the environment because the app needs them before it can read or decrypt this table.

export type SettingSpec = {
  key: string;
  label: string;
  group: string;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

export const SETTINGS: SettingSpec[] = [
  // Core
  { key: "APP_BASE_URL", label: "App base URL", group: "Core", placeholder: "https://your-domain.com", help: "Must match the OAuth redirect URIs registered with each platform." },
  { key: "CRON_SECRET", label: "Cron secret", group: "Core", secret: true, help: "Bearer token Vercel Cron sends to the scheduler/poller routes." },

  // AI
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API key", group: "AI", secret: true, help: "Generates captions (Claude)." },
  { key: "IMAGE_PROVIDER", label: "Image provider", group: "AI", placeholder: "openai" },
  { key: "IMAGE_API_KEY", label: "Image API key", group: "AI", secret: true },
  { key: "IMAGE_MODEL", label: "Image model", group: "AI", placeholder: "gpt-image-1" },

  // Meta
  { key: "META_APP_ID", label: "Meta App ID", group: "Meta (Instagram + Facebook)" },
  { key: "META_APP_SECRET", label: "Meta App Secret", group: "Meta (Instagram + Facebook)", secret: true },

  // LinkedIn
  { key: "LINKEDIN_CLIENT_ID", label: "LinkedIn Client ID", group: "LinkedIn" },
  { key: "LINKEDIN_CLIENT_SECRET", label: "LinkedIn Client Secret", group: "LinkedIn", secret: true },

  // TikTok
  { key: "TIKTOK_CLIENT_KEY", label: "TikTok Client Key", group: "TikTok" },
  { key: "TIKTOK_CLIENT_SECRET", label: "TikTok Client Secret", group: "TikTok", secret: true },
  { key: "TIKTOK_PRIVACY", label: "TikTok privacy", group: "TikTok", placeholder: "SELF_ONLY", help: "SELF_ONLY until your app passes audit, then PUBLIC_TO_EVERYONE." },

  // Google
  { key: "GOOGLE_CLIENT_ID", label: "Google Client ID", group: "Google (YouTube + Business)", help: "Used by both YouTube and Google Business Profile." },
  { key: "GOOGLE_CLIENT_SECRET", label: "Google Client Secret", group: "Google (YouTube + Business)", secret: true },
  { key: "YOUTUBE_PRIVACY", label: "YouTube privacy", group: "Google (YouTube + Business)", placeholder: "private" },

  // X (Twitter)
  { key: "X_CLIENT_ID", label: "X Client ID", group: "X (Twitter)" },
  { key: "X_CLIENT_SECRET", label: "X Client Secret", group: "X (Twitter)", secret: true },

  // Threads
  { key: "THREADS_APP_ID", label: "Threads App ID", group: "Threads" },
  { key: "THREADS_APP_SECRET", label: "Threads App Secret", group: "Threads", secret: true },

  // Pinterest
  { key: "PINTEREST_APP_ID", label: "Pinterest App ID", group: "Pinterest" },
  { key: "PINTEREST_APP_SECRET", label: "Pinterest App Secret", group: "Pinterest", secret: true },

  // Reddit
  { key: "REDDIT_CLIENT_ID", label: "Reddit Client ID", group: "Reddit" },
  { key: "REDDIT_CLIENT_SECRET", label: "Reddit Client Secret", group: "Reddit", secret: true },
  { key: "REDDIT_USER_AGENT", label: "Reddit User-Agent", group: "Reddit", placeholder: "socialsync/1.0 by u/you" },
];

const SPEC_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));
export const SETTING_KEYS = SETTINGS.map((s) => s.key);

type Cache = { at: number; data: Map<string, string> };
let cache: Cache | null = null;
const TTL_MS = 30_000;

// Loads all stored settings (decrypting secrets) as a key -> plaintext map.
export async function loadSettings(force = false): Promise<Map<string, string>> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const map = new Map<string, string>();
  try {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase.schema("socialsync").from("app_settings").select("key, value, is_secret");
    for (const row of data ?? []) {
      if (row.value == null || row.value === "") continue;
      try {
        map.set(row.key, row.is_secret ? decryptToken(row.value) : row.value);
      } catch {
        // a secret that can't be decrypted (e.g. SOCIAL_TOKEN_SECRET changed) is skipped
      }
    }
  } catch {
    // table missing / DB unreachable — fall back to env only
  }
  cache = { at: Date.now(), data: map };
  return map;
}

export function invalidateSettingsCache() {
  cache = null;
}

// Copies stored settings into process.env so the existing env-reading adapters pick them up.
// Stored values take precedence; only non-empty values are applied (never unset).
export async function hydrateEnv(): Promise<void> {
  const settings = await loadSettings();
  for (const [key, value] of settings) {
    if (value) process.env[key] = value;
  }
}

// Public view of settings for the UI: never returns secret plaintext, only whether it's set.
export async function getSettingsView() {
  const stored = await loadSettings(true);
  return SETTINGS.map((spec) => ({
    key: spec.key,
    label: spec.label,
    group: spec.group,
    secret: Boolean(spec.secret),
    placeholder: spec.placeholder ?? "",
    help: spec.help ?? "",
    // Secrets: expose only configured-state. Non-secrets: expose the value (may be env-sourced).
    value: spec.secret ? "" : stored.get(spec.key) ?? process.env[spec.key] ?? "",
    configured: spec.secret ? stored.has(spec.key) || Boolean(process.env[spec.key]) : undefined,
    // True when the live value comes from the environment rather than stored settings.
    fromEnv: !stored.has(spec.key) && Boolean(process.env[spec.key]),
  }));
}

// Persists a partial map of key -> value. Secrets are encrypted; for secrets, an empty/omitted
// value leaves the stored value unchanged (so the UI can show blank inputs without clearing).
export async function saveSettings(values: Record<string, string>): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const rows: Array<{ key: string; value: string | null; is_secret: boolean; updated_at: string }> = [];

  for (const [key, raw] of Object.entries(values)) {
    const spec = SPEC_BY_KEY.get(key);
    if (!spec) continue; // ignore unknown keys
    const value = (raw ?? "").trim();
    if (spec.secret && value === "") continue; // keep existing secret
    rows.push({
      key,
      value: value === "" ? null : spec.secret ? encryptToken(value) : value,
      is_secret: Boolean(spec.secret),
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    await supabase.schema("socialsync").from("app_settings").upsert(rows, { onConflict: "key" });
  }
  invalidateSettingsCache();
}
