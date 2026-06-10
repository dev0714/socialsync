import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// Google Business Profile — Google OAuth (reuses GOOGLE_CLIENT_ID/SECRET) with the
// business.manage scope. Publishes a local post to the first location of the account.
// Requires the Business Profile APIs to be enabled + access approved by Google.

const SCOPE = "https://www.googleapis.com/auth/business.manage";

export const gbpProvider: OAuthProvider = {
  provider: "gbp",
  isConfigured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
  connectUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const token = await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const auth = { Authorization: `Bearer ${token.access_token}` };

    const accounts = await fetchJson(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      { headers: auth },
    );
    const account = accounts?.accounts?.[0];
    if (!account?.name) throw new Error("No Business Profile account found for this Google login.");

    const locations = await fetchJson(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?` +
        new URLSearchParams({ readMask: "name,title", pageSize: "1" }).toString(),
      { headers: auth },
    );
    const location = locations?.locations?.[0];
    if (!location?.name) throw new Error("No Business Profile location found.");

    const discovered: DiscoveredAccount = {
      platform: "gbp",
      externalId: location.name, // e.g. "locations/123"
      displayName: location.title || account.accountName || "Business Profile",
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: SCOPE,
      meta: { account: account.name, location: location.name },
    };
    return [discovered];
  },
};

export const gbpPublisher = {
  async refresh(account: SocialAccountRecord): Promise<ConnectedTokens | null> {
    if (!account.refreshToken) return null;
    const token = await fetchJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    return {
      accessToken: token.access_token,
      refreshToken: account.refreshToken,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
    };
  },

  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    if (post.mediaType === "video") {
      throw new Error("Google Business Profile video posts are not supported — use an image or text.");
    }
    const location = (account.meta?.location as string | undefined) || account.externalId;
    const body: Record<string, unknown> = {
      languageCode: "en",
      summary: post.caption.slice(0, 1500),
      topicType: "STANDARD",
    };
    if (post.imageUrl) {
      body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.imageUrl }];
    }

    const res = await fetchJson(`https://mybusiness.googleapis.com/v4/${location}/localPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { remoteId: res?.name ?? null, remoteUrl: res?.searchUrl ?? null };
  },
};
