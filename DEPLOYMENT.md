# MangaWave deployment notes

## 1. Put it behind a real reverse proxy with TLS
Use Caddy, Nginx, Traefik, or another TLS-terminating reverse proxy.

Your proxy should:
- terminate HTTPS
- redirect HTTP to HTTPS
- pass requests to `127.0.0.1:3000`
- send correct forwarded headers

## 2. Set canonical origin and proxy trust explicitly
At minimum:

```bash
APP_ORIGIN=https://mangawave.example.com
TRUST_PROXY=1
SESSION_SECRET=<long-random-secret>
SESSION_COOKIE_SECURE=auto
```

Do not set `TRUST_PROXY` unless a real trusted proxy sits in front of the app.

## 3. Prefer PostgreSQL in production
Set `DATABASE_URL`, then migrate:

```bash
npm run migrate:postgres
```

This moves the important mutable state off local files.

## 4. Email provider setup
### SMTP
- use a provider with authenticated submission
- configure SPF and DKIM for your sending domain when you own one
- make sure mailbox SMTP AUTH is actually enabled
- Gmail works cleanly with an app password; that was the straightforward proof path used here
- Outlook personal mailbox password SMTP was blocked in practice and should not be the default proof path
- monitor bounces and spam placement

### Resend
- verify your sending domain in Resend
- publish required DNS records
- use a real `EMAIL_FROM` on the verified domain

### Verification and reset safety
- keep `APP_ORIGIN` on the final HTTPS domain
- do not expose raw reset or verification links in browser responses
- prefer real email delivery in production
- review token TTLs for your risk model

## 5. DNS basics
For serious production mail delivery:
- SPF record for your mail provider
- DKIM signing enabled
- DMARC policy configured
- stable reverse proxy / TLS setup for your app domain

## 6. Process manager
Using PM2:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

## 7. Security checklist
- change default admin credentials
- set a strong `SESSION_SECRET`
- set `APP_ORIGIN` to your final HTTPS origin
- enable TLS at the proxy
- set `TRUST_PROXY` only when appropriate
- keep `SESSION_COOKIE_SECURE=auto` or `true` in HTTPS deployments
- configure real email delivery before relying on recovery flows
- review `content/audit.log` or ship audits centrally
- monitor rate-limit and session storage behavior
- decide which actions require verified email; the current baseline gates comments and admin publishing

## 8. Proof-run notes
A Gmail SMTP app-password path successfully delivered verification and reset mail in live testing.
The message links were generated with the configured canonical `APP_ORIGIN`.
If you use a temporary tunnel during validation, treat the tunnel itself as infrastructure risk; prove link host generation separately from provider delivery if the tunnel is flaky.

### Live deployment proof summary
- live domain: `https://mangawave.ink`
- HTTPS: active with Caddy-managed Let's Encrypt certificates for `mangawave.ink` and `www.mangawave.ink`
- process/runtime: app running behind PM2, reverse proxied by Caddy to `127.0.0.1:3000`
- mail: SES SMTP authentication and sandbox-safe delivery proof succeeded
- end-to-end auth proof succeeded on the live site using a real inbox and real email links:
  - registration
  - email verification
  - forgot-password
  - reset completion
  - login
  - recent-auth (`/reauth`)
- verified proof account state showed the email as verified after link completion

## 9. Next hardening step after phase 6
If traffic or risk grows, the next upgrades should be:
- Redis-backed shared session/rate infrastructure
- bounce/webhook handling for email providers
- centralized audit shipping
- stricter account abuse workflows
