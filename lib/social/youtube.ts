import {
  fetchJson,
  type ConnectedTokens,
  type DiscoveredAccount,
  type OAuthProvider,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";
import { imageToVideo } from "./video";

// YouTube (Google OAuth) — uploads via the Data API v3 resumable endpoint.
// YouTube is video-only, so image posts are first rendered to a short MP4 (video.ts).

const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

export const googleProvider: OAuthProvider = {
  provider: "google",
  isConfigured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
  connectUrl(state, redirectUri) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");
    const params = new URLSearchParams({
      client_id: clientId,
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

    let channelId = "me";
    let displayName = "YouTube channel";
    try {
      const channels = await fetchJson(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      const ch = channels?.items?.[0];
      if (ch) {
        channelId = ch.id;
        displayName = ch.snippet?.title || displayName;
      }
    } catch {
      // best-effort
    }

    const account: DiscoveredAccount = {
      platform: "youtube",
      externalId: channelId,
      displayName,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: SCOPE,
    };
    return [account];
  },
};

export const youtubePublisher = {
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
      refreshToken: account.refreshToken, // Google does not return a new refresh token
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
    };
  },

  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    if (!post.imageUrl) {
      throw new Error("YouTube posts require media; no image was generated.");
    }
    // Render the still image to a short MP4 (Shorts-friendly portrait).
    const imageBytes = await post.imageBytes();
    const video = await imageToVideo(imageBytes);

    const privacyStatus = process.env.YOUTUBE_PRIVACY || "private";
    const title = (post.caption.split("\n")[0] || "MeanKat Café").slice(0, 95);

    // 1. start a resumable upload session
    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify({
          snippet: { title, description: post.caption },
          status: { privacyStatus, selfDeclaredMadeForKids: false },
        }),
      },
    );
    if (!initRes.ok) {
      const text = await initRes.text();
      throw new Error(`YouTube upload init failed (${initRes.status}): ${text.slice(0, 300)}`);
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return an upload URL.");

    // 2. upload the video bytes
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
      body: video,
    });
    const json = await uploadRes.json().catch(() => null);
    if (!uploadRes.ok) {
      throw new Error(
        `YouTube upload failed (${uploadRes.status}): ${JSON.stringify(json).slice(0, 300)}`,
      );
    }
    const id = json?.id;
    return { remoteId: id ?? null, remoteUrl: id ? `https://youtube.com/watch?v=${id}` : null };
  },
};
