# MangaWave

MangaWave is a self-hosted manga/manhwa site built as a mobile-first vertical reader.

## Phase 6 highlights
- real email delivery support for password reset and optional email verification
- SMTP or Resend provider support out of the box
- canonical `APP_ORIGIN` links for reset and verification
- verified-email state in local and PostgreSQL modes
- recent-auth gating for sensitive account changes
- uniform forgot-password responses with hashed single-use expiring reset tokens
- resend and expiry UX for verification/recovery flows
- audit logs for delivery, verification, auth, admin, and moderation events without leaking secrets

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`

## Default admin account
Fresh installs seed one admin user automatically:
- email: `admin@mangawave.local`
- password: `changeme123`

Change this before public use.

## Core environment variables
- `APP_ORIGIN` — canonical external origin, for example `https://mangawave.example.com`
- `SESSION_SECRET` — required for serious deployments
- `TRUST_PROXY` — only set this when running behind a reverse proxy
- `SESSION_COOKIE_NAME` — defaults to `mangawave.sid`
- `SESSION_COOKIE_SECURE` — `auto`, `true`, or `false`
- `SESSION_COOKIE_SAMESITE` — defaults to `lax`
- `RECENT_AUTH_MINUTES` — freshness window for sensitive account changes

## Email delivery
### Supported providers
- `smtp`
- `resend`

### Shared email settings
- `EMAIL_PROVIDER=smtp` or `EMAIL_PROVIDER=resend`
- `EMAIL_FROM=no-reply@example.com`
- `EMAIL_FROM_NAME=MangaWave`
- `ENABLE_EMAIL_VERIFICATION=true` to send verification emails
- `VERIFY_TOKEN_TTL_MINUTES=1440`
- `RESET_TOKEN_TTL_MINUTES=30`

### SMTP settings
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE=true|false`
- `SMTP_USER`
- `SMTP_PASS`

### Resend settings
- `RESEND_API_KEY`

## Rate-limit settings
- `AUTH_RATE_LIMIT`
- `FORGOT_IP_RATE_LIMIT`
- `FORGOT_ACCOUNT_RATE_LIMIT`
- `VERIFY_RESEND_IP_RATE_LIMIT`
- `COMMENT_RATE_LIMIT`
- `API_RATE_LIMIT`
- `ADMIN_RATE_LIMIT`
- `FORGOT_PASSWORD_MIN_MS`

## Persistence modes
### Local mode
Default when `DATABASE_URL` is not set.

Data files:
- `content/library.json`
- `content/users.json`
- `content/interactions.json`
- `content/password-resets.json`
- `content/email-verifications.json`
- `content/rate-limits.json`
- `content/sessions/`
- `content/audit.log`

### PostgreSQL mode
Set:
- `DATABASE_URL=postgres://...`
- optional `PGSSL=require`

Migrate existing JSON data:

```bash
npm run migrate:postgres
```

In PostgreSQL mode, users, verification state, interactions, hashed reset/verification tokens, sessions, and rate limits move off local files.

## Storage modes
### Local storage
Default when `STORAGE_DRIVER` is not set or is `local`.

Uploads go to:
- `public/uploads`

### S3 / R2 storage
Set:
- `STORAGE_DRIVER=s3`
- `S3_BUCKET=...`
- `S3_REGION=auto` for R2 or your AWS region
- `S3_ENDPOINT=...`
- `S3_ACCESS_KEY_ID=...`
- `S3_SECRET_ACCESS_KEY=...`
- `S3_PUBLIC_BASE_URL=...`
- optional `S3_FORCE_PATH_STYLE=true`

## Important files
- `server.js` — app, security middleware, routes
- `lib/email.js` — delivery provider abstraction
- `lib/users.js` — auth, verification state, password recovery
- `lib/password-policy.js` — password rejection rules
- `lib/session-store.js` — durable session store setup
- `lib/security.js` — CSRF, rate limiting, timing helpers
- `lib/audit.js` — audit/security event logging
- `scripts/migrate-to-postgres.js` — JSON to PostgreSQL import
- `DEPLOYMENT.md` — reverse-proxy, TLS, DNS, and provider guidance

## Honest caveat
Phase 6 gives you real delivery and verification plumbing, but public-scale deployments should still consider:
- dedicated email reputation and bounce handling
- DMARC/SPF/DKIM monitoring
- Redis-backed shared limits if you scale beyond one node
- centralized audit shipping
