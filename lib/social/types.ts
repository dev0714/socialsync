// Shared types for the Social Studio publishing layer.

export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin";

// OAuth "providers" — one consent flow can yield accounts on multiple platforms
// (Meta's login returns both Facebook Pages and their linked Instagram accounts).
export type SocialProvider = "meta" | "linkedin" | "tiktok" | "google";

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook Page",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

export const PROVIDER_LABELS: Record<SocialProvider, string> = {
  meta: "Instagram + Facebook (Meta)",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  google: "YouTube (Google)",
};

// Which platforms each provider's connect flow can produce.
export const PROVIDER_PLATFORMS: Record<SocialProvider, SocialPlatform[]> = {
  meta: ["facebook", "instagram"],
  linkedin: ["linkedin"],
  tiktok: ["tiktok"],
  google: ["youtube"],
};

export type ConnectedTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null; // ISO timestamp
  scopes?: string | null;
};

// A channel discovered during the OAuth exchange, ready to persist.
export type DiscoveredAccount = ConnectedTokens & {
  platform: SocialPlatform;
  displayName: string;
  externalId: string;
};

// A persisted account with decrypted tokens, used at publish time.
export type SocialAccountRecord = {
  id: string;
  platform: SocialPlatform;
  displayName: string | null;
  externalId: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  scopes: string | null;
};

export type PublishPost = {
  caption: string;
  imageUrl: string | null; // public URL (Supabase storage)
  // Lazily fetches the raw image bytes (used by video platforms).
  imageBytes: () => Promise<Buffer>;
};

export type PublishResult = {
  remoteId: string | null;
  remoteUrl: string | null;
};

export type OAuthProvider = {
  provider: SocialProvider;
  isConfigured(): boolean;
  connectUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<DiscoveredAccount[]>;
};

export type Publisher = {
  // Refreshes an expired token if possible; returns null if refresh isn't supported.
  refresh?(account: SocialAccountRecord): Promise<ConnectedTokens | null>;
  publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult>;
};

// Small helper: fetch JSON and throw a useful error on non-2xx.
export async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.error_description ||
      json?.error ||
      json?.message ||
      text.slice(0, 300) ||
      `Request failed (${res.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return json;
}
