import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// Pinterest — OAuth 2.0, creates a Pin on the account's first board (stored in meta).
const API = "https://api.pinterest.com/v5";
const SCOPES = "boards:read,pins:read,pins:write,user_accounts:read";

function basicAuth(): string {
  return Buffer.from(`${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`).toString("base64");
}

export const pinterestProvider: OAuthProvider = {
  provider: "pinterest",
  isConfigured() {
    return Boolean(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
  },
  connectUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.PINTEREST_APP_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      state,
    });
    return `https://www.pinterest.com/oauth/?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const token = await fetchJson(`${API}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const auth = { Authorization: `Bearer ${token.access_token}` };
    let username = "Pinterest";
    try {
      const acct = await fetchJson(`${API}/user_account`, { headers: auth });
      username = acct?.username || username;
    } catch {
      // best-effort
    }
    // A Pin needs a board; default to the first available board.
    let boardId: string | null = null;
    try {
      const boards = await fetchJson(`${API}/boards?page_size=1`, { headers: auth });
      boardId = boards?.items?.[0]?.id ?? null;
    } catch {
      // best-effort
    }

    const account: DiscoveredAccount = {
      platform: "pinterest",
      externalId: username,
      displayName: username,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: SCOPES,
      meta: boardId ? { boardId } : null,
    };
    return [account];
  },
};

export const pinterestPublisher = {
  async refresh(account: SocialAccountRecord): Promise<ConnectedTokens | null> {
    if (!account.refreshToken) return null;
    const token = await fetchJson(`${API}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth()}`,
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
    if (!post.imageUrl) {
      throw new Error("Pinterest pins require an image.");
    }
    const boardId = (account.meta?.boardId as string | undefined) ?? null;
    if (!boardId) {
      throw new Error("No Pinterest board found — create a board, then reconnect Pinterest.");
    }

    const res = await fetchJson(`${API}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        board_id: boardId,
        title: post.caption.split("\n")[0]?.slice(0, 100) || "New Pin",
        description: post.caption.slice(0, 800),
        media_source: { source_type: "image_url", url: post.imageUrl },
      }),
    });
    const id = res?.id;
    return { remoteId: id ?? null, remoteUrl: id ? `https://www.pinterest.com/pin/${id}/` : null };
  },
};
