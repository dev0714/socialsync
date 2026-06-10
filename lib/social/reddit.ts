import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// Reddit — OAuth 2.0. Submits to the user's profile (u_<name>) by default, or to a
// target subreddit set in meta.subreddit. Image posts are submitted as link posts.

const UA = process.env.REDDIT_USER_AGENT || "socialsync/1.0";
const SCOPES = "identity submit";

function basicAuth(): string {
  return Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
}

export const redditProvider: OAuthProvider = {
  provider: "reddit",
  isConfigured() {
    return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
  },
  connectUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.REDDIT_CLIENT_ID!,
      response_type: "code",
      state,
      redirect_uri: redirectUri,
      duration: "permanent",
      scope: SCOPES,
    });
    return `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const token = await fetchJson("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
        "User-Agent": UA,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const me = await fetchJson("https://oauth.reddit.com/api/v1/me", {
      headers: { Authorization: `Bearer ${token.access_token}`, "User-Agent": UA },
    });
    const username = me?.name || "reddit";

    const account: DiscoveredAccount = {
      platform: "reddit",
      externalId: username,
      displayName: `u/${username}`,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: SCOPES,
      meta: { subreddit: `u_${username}` },
    };
    return [account];
  },
};

export const redditPublisher = {
  async refresh(account: SocialAccountRecord): Promise<ConnectedTokens | null> {
    if (!account.refreshToken) return null;
    const token = await fetchJson("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
        "User-Agent": UA,
      },
      body: new URLSearchParams({
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
    const subreddit =
      (account.meta?.subreddit as string | undefined) || `u_${account.externalId}`;
    const title = post.caption.split("\n")[0]?.slice(0, 300) || "New post";

    const form = new URLSearchParams({
      sr: subreddit,
      title,
      api_type: "json",
      resubmit: "true",
    });
    if (post.imageUrl && post.mediaType !== "video") {
      form.set("kind", "link");
      form.set("url", post.imageUrl);
    } else {
      form.set("kind", "self");
      form.set("text", post.caption);
    }

    const res = await fetchJson("https://oauth.reddit.com/api/submit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: form.toString(),
    });

    const errors = res?.json?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      throw new Error(errors.map((e: unknown[]) => e[1] ?? e[0]).join("; "));
    }
    const data = res?.json?.data;
    return { remoteId: data?.id ?? null, remoteUrl: data?.url ?? null };
  },
};
