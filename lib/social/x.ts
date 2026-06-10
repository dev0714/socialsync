import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// X (Twitter) — OAuth 2.0 with PKCE (user context). Posts via the v2 API.
// Requires a project on the X developer portal; the usable write tier is paid.

const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"].join(" ");

function basicAuth(): string {
  const id = process.env.X_CLIENT_ID!;
  const secret = process.env.X_CLIENT_SECRET!;
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

export const xProvider: OAuthProvider = {
  provider: "x",
  usesPkce: true,
  isConfigured() {
    return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
  },
  connectUrl(state, redirectUri, codeChallenge) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.X_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge ?? "challenge",
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri, codeVerifier) {
    const token = await fetchJson("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier ?? "",
        client_id: process.env.X_CLIENT_ID!,
      }).toString(),
    });

    const me = await fetchJson("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    const account: DiscoveredAccount = {
      platform: "x",
      externalId: me?.data?.id ?? "me",
      displayName: me?.data?.username ? `@${me.data.username}` : "X account",
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

export const xPublisher = {
  async refresh(account: SocialAccountRecord): Promise<ConnectedTokens | null> {
    if (!account.refreshToken) return null;
    const token = await fetchJson("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
        client_id: process.env.X_CLIENT_ID!,
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
    if (post.mediaType === "video") {
      throw new Error("X video publishing is not yet supported — use an image or text.");
    }

    let mediaIds: string[] | undefined;
    if (post.imageUrl) {
      // v1.1 media upload (simple) — returns a media id usable in a v2 tweet.
      const bytes = await post.imageBytes();
      const upload = await fetchJson("https://upload.twitter.com/1.1/media/upload.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ media_data: bytes.toString("base64") }).toString(),
      });
      const id = upload?.media_id_string;
      if (id) mediaIds = [id];
    }

    const body: Record<string, unknown> = { text: post.caption.slice(0, 280) };
    if (mediaIds) body.media = { media_ids: mediaIds };

    const res = await fetchJson("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const id = res?.data?.id;
    const handle = account.displayName?.replace(/^@/, "") || "i";
    return { remoteId: id ?? null, remoteUrl: id ? `https://twitter.com/${handle}/status/${id}` : null };
  },
};
