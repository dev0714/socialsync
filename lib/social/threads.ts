import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// Threads (Meta) — OAuth via threads.net; publishing is the two-step container/publish
// flow on graph.threads.net, like the Instagram Graph API.

const GRAPH = "https://graph.threads.net/v1.0";
const SCOPES = "threads_basic,threads_content_publish";

export const threadsProvider: OAuthProvider = {
  provider: "threads",
  isConfigured() {
    return Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
  },
  connectUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.THREADS_APP_ID!,
      redirect_uri: redirectUri,
      scope: SCOPES,
      response_type: "code",
      state,
    });
    return `https://threads.net/oauth/authorize?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    // 1. code -> short-lived token
    const shortLived = await fetchJson("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.THREADS_APP_ID!,
        client_secret: process.env.THREADS_APP_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    // 2. short-lived -> long-lived (~60 days)
    const longLived = await fetchJson(
      "https://graph.threads.net/access_token?" +
        new URLSearchParams({
          grant_type: "th_exchange_token",
          client_secret: process.env.THREADS_APP_SECRET!,
          access_token: shortLived.access_token,
        }).toString(),
    );
    const token = longLived.access_token as string;

    const me = await fetchJson(
      `${GRAPH}/me?` + new URLSearchParams({ fields: "id,username", access_token: token }).toString(),
    );

    const account: DiscoveredAccount = {
      platform: "threads",
      externalId: me.id ?? shortLived.user_id,
      displayName: me.username ? `@${me.username}` : "Threads",
      accessToken: token,
      expiresAt: longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
        : null,
      scopes: SCOPES,
    };
    return [account];
  },
};

export const threadsPublisher = {
  async refresh(account: SocialAccountRecord): Promise<ConnectedTokens | null> {
    const refreshed = await fetchJson(
      "https://graph.threads.net/refresh_access_token?" +
        new URLSearchParams({ grant_type: "th_refresh_token", access_token: account.accessToken }).toString(),
    );
    return {
      accessToken: refreshed.access_token,
      expiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null,
    };
  },

  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    if (post.mediaType === "video") {
      throw new Error("Threads video publishing is not yet supported — use an image or text.");
    }
    const userId = account.externalId;
    const token = account.accessToken;

    // 1. create a media container
    const createParams = new URLSearchParams({
      media_type: post.imageUrl ? "IMAGE" : "TEXT",
      text: post.caption,
      access_token: token,
    });
    if (post.imageUrl) createParams.set("image_url", post.imageUrl);
    const container = await fetchJson(`${GRAPH}/${userId}/threads?${createParams.toString()}`, {
      method: "POST",
    });

    // 2. publish it
    const published = await fetchJson(
      `${GRAPH}/${userId}/threads_publish?` +
        new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
      { method: "POST" },
    );

    let permalink: string | null = null;
    try {
      const meta = await fetchJson(
        `${GRAPH}/${published.id}?` +
          new URLSearchParams({ fields: "permalink", access_token: token }).toString(),
      );
      permalink = meta.permalink ?? null;
    } catch {
      // best-effort
    }
    return { remoteId: published.id ?? null, remoteUrl: permalink };
  },
};
