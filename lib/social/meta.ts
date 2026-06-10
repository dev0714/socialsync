import {
  fetchJson,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// Meta Graph API — Facebook Pages + linked Instagram Business accounts.
// One OAuth consent yields a Page access token per managed Page, plus the
// Instagram Business account linked to each Page (which publishes via the Page token).

const GRAPH = "https://graph.facebook.com/v21.0";

const SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

export const metaProvider: OAuthProvider = {
  provider: "meta",
  isConfigured() {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  },
  connectUrl(state, redirectUri) {
    const appId = process.env.META_APP_ID;
    if (!appId) throw new Error("META_APP_ID is not configured.");
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: SCOPES,
      response_type: "code",
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const appId = process.env.META_APP_ID!;
    const appSecret = process.env.META_APP_SECRET!;

    // 1. code -> short-lived user token
    const shortLived = await fetchJson(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        }).toString(),
    );

    // 2. short-lived -> long-lived user token (~60 days)
    const longLived = await fetchJson(
      `${GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLived.access_token,
        }).toString(),
    );
    const userToken = longLived.access_token as string;

    // 3. list managed Pages (Page tokens derived from a long-lived user token do not expire)
    const pages = await fetchJson(
      `${GRAPH}/me/accounts?` +
        new URLSearchParams({
          fields: "name,access_token,instagram_business_account{id,username}",
          access_token: userToken,
        }).toString(),
    );

    const discovered: DiscoveredAccount[] = [];
    for (const page of pages.data ?? []) {
      discovered.push({
        platform: "facebook",
        externalId: page.id,
        displayName: page.name,
        accessToken: page.access_token,
        expiresAt: null,
        scopes: SCOPES,
      });
      const ig = page.instagram_business_account;
      if (ig?.id) {
        discovered.push({
          platform: "instagram",
          externalId: ig.id,
          displayName: ig.username ? `@${ig.username}` : "Instagram",
          accessToken: page.access_token, // IG publishes via the Page token
          expiresAt: null,
          scopes: SCOPES,
        });
      }
    }
    return discovered;
  },
};

export const facebookPublisher = {
  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    const pageId = account.externalId;
    if (post.imageUrl) {
      const res = await fetchJson(`${GRAPH}/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: post.imageUrl,
          caption: post.caption,
          access_token: account.accessToken,
        }),
      });
      const id = res.post_id || res.id;
      return { remoteId: id, remoteUrl: id ? `https://www.facebook.com/${id}` : null };
    }
    const res = await fetchJson(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: post.caption, access_token: account.accessToken }),
    });
    return { remoteId: res.id, remoteUrl: res.id ? `https://www.facebook.com/${res.id}` : null };
  },
};

export const instagramPublisher = {
  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    if (!post.imageUrl) {
      throw new Error("Instagram posts require an image.");
    }
    const igId = account.externalId;

    // 1. create media container
    const container = await fetchJson(`${GRAPH}/${igId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: post.imageUrl,
        caption: post.caption,
        access_token: account.accessToken,
      }),
    });

    // 2. publish the container
    const published = await fetchJson(`${GRAPH}/${igId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: account.accessToken }),
    });

    // 3. fetch the permalink
    let permalink: string | null = null;
    try {
      const meta = await fetchJson(
        `${GRAPH}/${published.id}?` +
          new URLSearchParams({ fields: "permalink", access_token: account.accessToken }).toString(),
      );
      permalink = meta.permalink ?? null;
    } catch {
      // permalink is best-effort
    }
    return { remoteId: published.id, remoteUrl: permalink };
  },
};
