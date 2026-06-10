import { getSupabaseAdminClient } from "@/lib/supabase";
import { decryptToken, encryptToken } from "./crypto";
import { metaProvider, facebookPublisher, instagramPublisher } from "./meta";
import { linkedinProvider, linkedinPublisher } from "./linkedin";
import { tiktokProvider, tiktokPublisher } from "./tiktok";
import { googleProvider, youtubePublisher } from "./youtube";
import type {
  OAuthProvider,
  Publisher,
  SocialAccountRecord,
  SocialPlatform,
  SocialProvider,
} from "./types";

export const PROVIDERS: Record<SocialProvider, OAuthProvider> = {
  meta: metaProvider,
  linkedin: linkedinProvider,
  tiktok: tiktokProvider,
  google: googleProvider,
};

export const PUBLISHERS: Record<SocialPlatform, Publisher> = {
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  linkedin: linkedinPublisher,
  tiktok: tiktokPublisher,
  youtube: youtubePublisher,
};

export function isProvider(value: string): value is SocialProvider {
  return value in PROVIDERS;
}

// Where each provider's OAuth callback lands.
export function getRedirectUri(provider: SocialProvider): string {
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/social/callback/${provider}`;
}

type AccountRow = {
  id: string;
  platform: SocialPlatform;
  display_name: string | null;
  external_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string | null;
};

function toRecord(row: AccountRow): SocialAccountRecord {
  return {
    id: row.id,
    platform: row.platform,
    displayName: row.display_name,
    externalId: row.external_id,
    accessToken: row.access_token ? decryptToken(row.access_token) : "",
    refreshToken: row.refresh_token ? decryptToken(row.refresh_token) : null,
    tokenExpiresAt: row.token_expires_at,
    scopes: row.scopes,
  };
}

export async function loadAccountsByIds(ids: string[]): Promise<SocialAccountRecord[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .schema("socialsync")
    .from("social_accounts")
    .select("id, platform, display_name, external_id, access_token, refresh_token, token_expires_at, scopes")
    .in("id", ids);
  return (data ?? []).map((r) => toRecord(r as AccountRow));
}

// Refreshes the account's token if it's expired (or about to) and a refresh path exists.
// Persists the new (encrypted) token and returns an updated record.
export async function ensureFreshToken(account: SocialAccountRecord): Promise<SocialAccountRecord> {
  const publisher = PUBLISHERS[account.platform];
  if (!publisher.refresh || !account.tokenExpiresAt) return account;

  const expiresAt = new Date(account.tokenExpiresAt).getTime();
  if (Number.isNaN(expiresAt) || expiresAt > Date.now() + 60_000) return account;

  const fresh = await publisher.refresh(account);
  if (!fresh) return account;

  const supabase = getSupabaseAdminClient();
  await supabase
    .schema("socialsync")
    .from("social_accounts")
    .update({
      access_token: encryptToken(fresh.accessToken),
      refresh_token: fresh.refreshToken ? encryptToken(fresh.refreshToken) : null,
      token_expires_at: fresh.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return {
    ...account,
    accessToken: fresh.accessToken,
    refreshToken: fresh.refreshToken ?? account.refreshToken,
    tokenExpiresAt: fresh.expiresAt ?? account.tokenExpiresAt,
  };
}
