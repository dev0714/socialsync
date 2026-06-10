# SocialSync

AI-assisted social media publishing. Describe a post in plain language → Claude writes the
caption and an image is generated → review, edit, and publish to **Instagram, Facebook,
LinkedIn, TikTok and YouTube** from one place.

Standalone Next.js 16 app, backed by Supabase (the `socialsync` schema + a storage bucket).

## Features
- **AI compose** — Claude (`claude-opus-4-8`) captions + AI image generation.
- **Direct platform APIs** — no third-party aggregator. OAuth per platform, tokens stored
  AES-256-GCM-encrypted.
- **Multi-platform publish** — fan-out with per-channel results and live links.
- Image-only posts are auto-rendered to a short MP4 for YouTube (ffmpeg).
- Single-operator password login.

## Quick start
```bash
npm install
cp .env.example .env        # fill in the values
npm run dev
```

## Setup
1. **Supabase** — run the SQL in `references/supabase-schema.md`, expose the `socialsync`
   schema, and create a public `socialsync` storage bucket.
2. **Env** — set `SUPABASE_*`, `SOCIALSYNC_PASSWORD`, `SOCIALSYNC_SESSION_SECRET`,
   `ANTHROPIC_API_KEY`, `IMAGE_API_KEY`, `SOCIAL_TOKEN_SECRET`, and `APP_BASE_URL`.
3. **Platforms** — register a developer app per platform and set its OAuth credentials.
   Full per-platform steps, scopes, and redirect URIs are in `references/social-setup.md`.

The compose loop works as soon as the AI keys are set; publishing lights up per platform as
each developer app is approved.

## Stack
Next.js 16 · React 19 · TypeScript · Supabase · Anthropic SDK · ffmpeg-static
