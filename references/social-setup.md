# Social Studio — Platform Setup Guide

This feature publishes directly to each platform's API. The code is done; what remains is
**registering a developer app per platform and getting publishing permissions approved**.
These are owner tasks (often requiring business verification + app review) and can take days
to weeks. Until a platform is approved, use its **sandbox / test users** to verify the flow.

## Environment variables (set in your host / `.env`)

```
ANTHROPIC_API_KEY=        # captions (Claude)
IMAGE_API_KEY=            # images (OpenAI by default; set IMAGE_PROVIDER to change)
IMAGE_PROVIDER=openai
SOCIAL_TOKEN_SECRET=      # any long random string — encrypts stored OAuth tokens
APP_BASE_URL=https://your-deployed-domain   # MUST match the OAuth redirect URIs below

META_APP_ID= / META_APP_SECRET=
LINKEDIN_CLIENT_ID= / LINKEDIN_CLIENT_SECRET=
TIKTOK_CLIENT_KEY= / TIKTOK_CLIENT_SECRET=
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=
# Optional safety defaults until app review passes:
TIKTOK_PRIVACY=SELF_ONLY        # set PUBLIC_TO_EVERYONE once approved
YOUTUBE_PRIVACY=private          # set public once happy
```

The **OAuth redirect URI** for each provider is:
`${APP_BASE_URL}/api/social/callback/<provider>` where `<provider>` is `meta`, `linkedin`,
`tiktok`, `google`, `x`, `threads`, `pinterest`, `reddit`, or `gbp`. Register exactly these in
each developer console. `bluesky` and `mastodon` use no redirect — they connect in-app with
credentials (see below).

---

## Meta — Instagram + Facebook (`meta`)
1. Create an app at developers.facebook.com → Business type.
2. Add **Facebook Login** and **Instagram Graph API** products.
3. Redirect URI: `${APP_BASE_URL}/api/social/callback/meta`.
4. Instagram must be a **Business/Creator** account **linked to a Facebook Page**.
5. Request permissions (App Review): `pages_show_list`, `pages_manage_posts`,
   `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management`.
6. Before review, add yourself as a **test user / role** to publish to your own Page/IG.

## LinkedIn (`linkedin`)
1. Create an app at linkedin.com/developers, associated with your Company Page.
2. Redirect URI: `${APP_BASE_URL}/api/social/callback/linkedin`.
3. Request the **Sign In with LinkedIn (OpenID)** and **Share on LinkedIn** (`w_member_social`) products.
4. Member posting works once approved. (Posting *as the Company Page* needs the Community
   Management API + partner approval — not enabled by this build's default scopes.)

## TikTok (`tiktok`)
1. Create an app at developers.tiktok.com.
2. Add the **Content Posting API**; enable Direct Post.
3. Redirect URI: `${APP_BASE_URL}/api/social/callback/tiktok`.
4. Scopes: `user.info.basic`, `video.publish`.
5. **Until audited, posts must be `SELF_ONLY`** (kept private). Keep `TIKTOK_PRIVACY=SELF_ONLY`
   until your app passes audit, then switch to `PUBLIC_TO_EVERYONE`.

## YouTube — Google (`google`)
1. Create a project at console.cloud.google.com; enable **YouTube Data API v3**.
2. Configure the OAuth consent screen; add the scope `.../auth/youtube.upload`.
3. Create an **OAuth Client (Web)**; redirect URI: `${APP_BASE_URL}/api/social/callback/google`.
4. While the consent screen is in "testing", add yourself as a **test user**.
5. Quota: each upload costs ~1600 units of the default 10,000/day. Image posts are rendered
   to a short MP4 (ffmpeg) before upload; uploads default to `private`.

## X / Twitter (`x`)
1. Create a project + app at developer.twitter.com with **OAuth 2.0** enabled (User authentication
   settings → type **Web App**, **PKCE** is used automatically).
2. Redirect URI: `${APP_BASE_URL}/api/social/callback/x`. Scopes: `tweet.read tweet.write
   users.read offline.access`.
3. Set `X_CLIENT_ID` / `X_CLIENT_SECRET`. Note: write access to the API is a **paid tier**.
   Image upload uses the v1.1 media endpoint; text-only tweets always work.

## Threads (`threads`)
1. Create a Threads app at developers.facebook.com (separate "Use cases → Threads API" config).
2. Redirect URI: `${APP_BASE_URL}/api/social/callback/threads`. Scopes: `threads_basic`,
   `threads_content_publish`.
3. Set `THREADS_APP_ID` / `THREADS_APP_SECRET`.

## Pinterest (`pinterest`)
1. Create an app at developers.pinterest.com; request standard access (trial works for your own
   account).
2. Redirect URI: `${APP_BASE_URL}/api/social/callback/pinterest`. Scopes:
   `boards:read,pins:read,pins:write,user_accounts:read`.
3. Set `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET`. Pins are created on your **first board**, so
   create at least one board before publishing.

## Reddit (`reddit`)
1. Create a **web app** at reddit.com/prefs/apps.
2. Redirect URI: `${APP_BASE_URL}/api/social/callback/reddit`. Scopes: `identity submit`.
3. Set `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` (Reddit requires a
   descriptive User-Agent). Posts go to your **profile** (`u_<name>`) by default; image posts are
   submitted as link posts.

## Google Business Profile (`gbp`)
1. Reuses the **same Google OAuth client** as YouTube — just also register the redirect URI
   `${APP_BASE_URL}/api/social/callback/gbp` and add the scope `.../auth/business.manage`.
2. Enable the **Business Profile APIs** (Account Management, Business Information, and the v4
   `mybusiness` posts API) in Google Cloud; this access requires Google approval.
3. Posts go to your account's **first location** as a local post.

## Bluesky (`bluesky`) — no app needed
Connect in-app: enter your **handle** + an **app password** (Bluesky → Settings → App Passwords).
The app password is stored encrypted and used to mint a session for each post. Service URL
defaults to `https://bsky.social`.

## Mastodon (`mastodon`) — no app needed
Connect in-app: enter your **instance URL** + a **personal access token** (your instance →
Preferences → Development → New application, with `write:statuses` and `write:media`).

---

## How publishing maps to media
- **Image posts** publish directly to Instagram, Facebook, LinkedIn, X, Threads, Pinterest,
  Reddit, Google Business, Bluesky, and Mastodon.
- **TikTok** uses photo mode (pulls the image URL); video uploads pull the video URL.
- **YouTube** is video-only — an uploaded video is used directly, otherwise the generated image
  is turned into a short MP4 automatically.
- **Video uploads** currently publish to YouTube, TikTok, and Facebook; the other networks
  return a clear "video not yet supported" message (use an image or text).
- **Pinterest** requires an image. **X / Threads / Reddit / Bluesky / Mastodon** also accept
  text-only posts.

## Verifying
1. Set `ANTHROPIC_API_KEY` + `IMAGE_API_KEY` + `SOCIAL_TOKEN_SECRET`, deploy, open `/admin` → Social Studio.
2. Generate a post (works with no platform connected).
3. Connect a platform (use a test user), then publish; the history row links to the live post
   via `social_post_targets.remote_url`.
