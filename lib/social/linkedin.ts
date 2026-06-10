import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// LinkedIn — member posting via the Posts API (w_member_social).
// Image flow: initializeUpload -> PUT bytes -> create post referencing the image URN.

const REST = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202401";
const SCOPES = "openid profile w_member_social";

function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export const linkedinProvider: OAuthProvider = {
  provider: "linkedin",
  isConfigured() {
    return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  },
  connectUrl(state, redirectUri) {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) throw new Error("LINKEDIN_CLIENT_ID is not configured.");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: SCOPES,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  },
  async exchangeCode(code, redirectUri) {
    const token = await fetchJson("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }).toString(),
    });

    const profile = await fetchJson("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    const account: DiscoveredAccount = {
      platform: "linkedin",
      externalId: `urn:li:person:${profile.sub}`,
      displayName: profile.name || "LinkedIn",
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: SCOPES,
    };
    return [account];
  },
};

export const linkedinPublisher = {
  async refresh(account: SocialAccountRecord): Promise<ConnectedTokens | null> {
    if (!account.refreshToken) return null;
    const token = await fetchJson("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
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
    const author = account.externalId!;
    let imageUrn: string | null = null;

    if (post.imageUrl) {
      // 1. register the upload
      const init = await fetchJson(`${REST}/images?action=initializeUpload`, {
        method: "POST",
        headers: restHeaders(account.accessToken),
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      const uploadUrl = init.value.uploadUrl as string;
      imageUrn = init.value.image as string;

      // 2. upload the bytes
      const bytes = await post.imageBytes();
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${account.accessToken}` },
        body: bytes,
      });
      if (!put.ok) throw new Error(`LinkedIn image upload failed (${put.status}).`);
    }

    // 3. create the post
    const body: Record<string, unknown> = {
      author,
      commentary: post.caption,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (imageUrn) {
      body.content = { media: { id: imageUrn } };
    }

    const res = await fetch(`${REST}/posts`, {
      method: "POST",
      headers: restHeaders(account.accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LinkedIn post failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const postUrn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
    return {
      remoteId: postUrn,
      remoteUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : null,
    };
  },
};
