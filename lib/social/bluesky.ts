import {
  fetchJson,
  type CredentialProvider,
  type DiscoveredAccount,
  type PublishPost,
  type PublishResult,
  type SocialAccountRecord,
} from "./types";

// Bluesky (AT Protocol) — connects with a handle + app password (no OAuth redirect).
// The app password is stored (encrypted) so a fresh session can be created on demand.

function normalizeService(input?: string): string {
  const s = (input || "https://bsky.social").trim().replace(/\/$/, "");
  return s.startsWith("http") ? s : `https://${s}`;
}

async function createSession(service: string, identifier: string, password: string) {
  return fetchJson(`${service}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
}

export const blueskyProvider: CredentialProvider = {
  provider: "bluesky",
  isConfigured() {
    return true; // no app-level credentials required
  },
  fields: [
    { name: "service", label: "Service URL", type: "text", placeholder: "https://bsky.social" },
    { name: "identifier", label: "Handle or email", type: "text", placeholder: "you.bsky.social" },
    { name: "appPassword", label: "App password", type: "password", placeholder: "xxxx-xxxx-xxxx-xxxx" },
  ],
  async connect(values) {
    const service = normalizeService(values.service);
    const identifier = values.identifier?.trim();
    const appPassword = values.appPassword?.trim();
    if (!identifier || !appPassword) throw new Error("Handle and app password are required.");

    const session = await createSession(service, identifier, appPassword);
    const account: DiscoveredAccount = {
      platform: "bluesky",
      externalId: session.did,
      displayName: session.handle ? `@${session.handle}` : identifier,
      accessToken: session.accessJwt,
      refreshToken: appPassword, // durable credential — used to re-create sessions
      expiresAt: null,
      scopes: null,
      meta: { service, identifier },
    };
    return [account];
  },
};

export const blueskyPublisher = {
  async publish(post: PublishPost, account: SocialAccountRecord): Promise<PublishResult> {
    if (post.mediaType === "video") {
      throw new Error("Bluesky video publishing is not yet supported — use an image or text.");
    }
    const service = (account.meta?.service as string | undefined) || "https://bsky.social";
    const identifier = (account.meta?.identifier as string | undefined) || account.externalId || "";
    // App-password JWTs are short-lived; mint a fresh session for each publish.
    const session = await createSession(service, identifier, account.refreshToken || "");
    const jwt = session.accessJwt as string;
    const did = session.did as string;
    const handle = session.handle as string;

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: post.caption.slice(0, 300),
      createdAt: new Date().toISOString(),
    };

    if (post.imageUrl) {
      const bytes = await post.imageBytes();
      const blobRes = await fetch(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "image/jpeg" },
        body: bytes,
      });
      const blobJson = await blobRes.json().catch(() => null);
      if (!blobRes.ok) throw new Error(`Bluesky blob upload failed (${blobRes.status}).`);
      record.embed = {
        $type: "app.bsky.embed.images",
        images: [{ alt: post.caption.slice(0, 280), image: blobJson.blob }],
      };
    }

    const res = await fetchJson(`${service}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record }),
    });
    const rkey = typeof res?.uri === "string" ? res.uri.split("/").pop() : null;
    return {
      remoteId: res?.uri ?? null,
      remoteUrl: rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : null,
    };
  },
};
