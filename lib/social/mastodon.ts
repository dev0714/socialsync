import {
  fetchJson,
  type CredentialProvider,
  type DiscoveredAccount,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// Mastodon — connects with an instance URL + a personal access token created in the
// instance's Preferences → Development. No app registration or OAuth redirect needed.

function normalizeInstance(input?: string): string {
  const s = (input || "").trim().replace(/\/$/, "");
  if (!s) throw new Error("Instance URL is required.");
  return s.startsWith("http") ? s : `https://${s}`;
}

export const mastodonProvider: CredentialProvider = {
  provider: "mastodon",
  isConfigured() {
    return true; // per-account token; no app-level credentials
  },
  fields: [
    { name: "instance", label: "Instance URL", type: "text", placeholder: "https://mastodon.social" },
    { name: "accessToken", label: "Access token", type: "password", placeholder: "from Preferences → Development" },
  ],
  async connect(values) {
    const instance = normalizeInstance(values.instance);
    const accessToken = values.accessToken?.trim();
    if (!accessToken) throw new Error("Access token is required.");

    const me = await fetchJson(`${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const account: DiscoveredAccount = {
      platform: "mastodon",
      externalId: me.id,
      displayName: me.username ? `@${me.username}` : "Mastodon",
      accessToken,
      expiresAt: null,
      scopes: null,
      meta: { instance, url: me.url },
    };
    return [account];
  },
};

export const mastodonPublisher = {
  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    if (post.mediaType === "video") {
      throw new Error("Mastodon video publishing is not yet supported — use an image or text.");
    }
    const instance = (account.meta?.instance as string | undefined);
    if (!instance) throw new Error("Missing Mastodon instance — reconnect the account.");
    const auth = { Authorization: `Bearer ${account.accessToken}` };

    let mediaIds: string[] | undefined;
    if (post.imageUrl) {
      const bytes = await post.imageBytes();
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "image.jpg");
      form.append("description", post.caption.slice(0, 400));
      const media = await fetchJson(`${instance}/api/v2/media`, {
        method: "POST",
        headers: auth,
        body: form,
      });
      if (media?.id) mediaIds = [media.id];
    }

    const status = await fetchJson(`${instance}/api/v1/statuses`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ status: post.caption, media_ids: mediaIds }),
    });
    return { remoteId: status?.id ?? null, remoteUrl: status?.url ?? null };
  },
};
