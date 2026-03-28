# Mangawave session handoff

## Project status
Mangawave is live and should be continued from current state only.

### Live infrastructure
- Domain: `https://mangawave.ink`
- Reverse proxy: Caddy
- Process manager: PM2
- App port behind proxy: `127.0.0.1:3000`
- SES SMTP is configured and working
- Auth, verification email, forgot-password, reset, login, and `/reauth` were proven live end to end

### Hard constraints
Do not redo or disturb:
- deployment
- PM2 / Caddy
- SES / email transport setup
- auth flows
- current routes unless there is a very strong reason
- current stack (Node + Express + EJS)

## Product direction
Mangawave is for Georgian readers first.

Main goals:
1. easy publishing/upload workflow
2. excellent mobile reading UX
3. clean premium feel
4. preserve working live systems
5. prefer small, staged improvements over rewrites

Content policy direction:
- own manga and authorized Georgian translations only
- do not steer the product toward scraping/aggregation/piracy assumptions

## What has already been implemented

### Admin / publishing
1. Chapter upload ordering improvement
- admin chapter page uploads are now sorted by natural filename order server-side
- admin UI previews the upload order before submit
- this was chosen to reduce accidental wrong page ordering during publishing

### Reader UX
2. Reader progress + chapter-end navigation
- sticky reader header now shows reading progress percentage and progress bar
- end-of-chapter card added at the bottom
- bottom card includes previous chapter / series page / next chapter actions

3. Continue-reading improvements
- series page now surfaces continue-reading CTA when progress exists
- library cards now surface continue-reading state
- account hero now surfaces latest reading session + continue CTA
- signed-in readers use server-synced progress
- guests use device-local history fallback where implemented

### Georgian-first / main-page first pass
4. Main page restructuring
- `/` is now treated as the real main page
- it is grouped into sections instead of feeling like a flat browse surface
- current sections:
  - Continue Reading
  - Popular
  - New
  - Recently Updated
  - Featured
- implementation uses small heuristics on the existing data model

5. Shared language layer
- small language system added in `lib/i18n.js`
- Georgian default, English optional
- language is selected via `?lang=ka` / `?lang=en`
- selection persists in `mw_lang` cookie
- no broad i18n framework was added

6. Georgian-first shared UI pass
Applied to key shared/user-facing surfaces:
- header/nav
- footer
- main page
- library/catalog page
- selected account/admin/reader/series-detail surfaces
- core auth pages (login/register/forgot/reset/reauth)

7. Transactional emails
- verification and reset emails updated to Georgian-first bilingual content
- SES transport behavior was not changed

## Files added/changed recently
- `lib/i18n.js`
- `lib/email.js`
- `server.js`
- `public/app.js`
- `public/styles.css`
- `views/partials/head.ejs`
- `views/partials/header.ejs`
- `views/partials/footer.ejs`
- `views/pages/home.ejs`
- `views/pages/library.ejs`
- `views/pages/series-detail.ejs`
- `views/pages/account.ejs`
- `views/pages/admin.ejs`
- `views/pages/reader.ejs`
- `views/pages/login.ejs`
- `views/pages/register.ejs`
- `views/pages/forgot-password.ejs`
- `views/pages/reset-password.ejs`
- `views/pages/reauth.ejs`

## Current implementation notes
- The Georgian-first rollout is a first pass, not full app-wide localization
- The language system is intentionally small and maintainable
- Some deeper copy surfaces and flash messages are still English
- Main-page categories are heuristic and should stay small-scope unless there is a clear reason to deepen them

## Best next steps
Pick one small high-value improvement only.

Most likely next candidates:
1. finish Georgian-first translation on remaining flash messages and account/admin/security copy
2. polish the catalog/main page cards and section labels for better Georgian tone
3. improve continue-reading consistency on any remaining surfaces without widening storage logic
4. small admin workflow polish for publishing metadata if a clear repeated friction point is found

## Recommended next-session prompt
Read `~/mangawave/SESSION_HANDOFF.md` and continue from the current Mangawave state.
Do not redo deployment, auth, SES, or previous reader/admin improvements.
Inspect the code first, then implement the next smallest high-value improvement.
