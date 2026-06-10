import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// TikTok — Content Posting API, photo mode (DIRECT_POST) pulling the image from a public URL.
// Note: until your app passes TikTok's audit, posts must be SELF_ONLY (private). Set
// TIKTOK_PRIVACY=PUBLIC_TO_EVERYONE once approved.

const SCOPES = "user.info.basic,video.publish";

export const tiktokProvider: OAuthProvider = {
  provider: "tiktok",
  isConfigured() {
    return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
  },
  connectUrl(state, redirectUri) {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY is not configured.");
    const params = new URLSearchParams({
      client_key: clientKey,
      scope: SCOPES,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const token = await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    let displayName = "TikTok";
    try {
      const info = await fetchJson(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      displayName = info?.data?.user?.display_name || displayName;
    } catch {
      // best-effort
    }

    const account: DiscoveredAccount = {
      platform: "tiktok",
      externalId: token.open_id,
      displayName,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: token.scope ?? SCOPES,
    };
    return [account];
  },
};

export const tiktokPublisher = {
  async refresh(account: SocialAccountRecord): Promise<ConnectedTokens | null> {
    if (!account.refreshToken) return null;
    const token = await fetchJson("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
      }).toString(),
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? account.refreshToken,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
    };
  },

  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    if (!post.imageUrl) {
      throw new Error("TikTok posts require an image (photo mode).");
    }
    const privacy = process.env.TIKTOK_PRIVACY || "SELF_ONLY";
    const res = await fetchJson("https://open.tiktokapis.com/v2/post/publish/content/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: post.caption.slice(0, 90),
          description: post.caption,
          privacy_level: privacy,
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_cover_index: 0,
          photo_images: [post.imageUrl],
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      }),
    });
    return { remoteId: res?.data?.publish_id ?? null, remoteUrl: null };
  },
};
