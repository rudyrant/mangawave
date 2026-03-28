import express from "express";
import helmet from "helmet";
import multer from "multer";
import path from "path";
import session from "express-session";
import { fileURLToPath } from "url";
import { createSessionStore } from "./lib/session-store.js";
import { logAuditEvent } from "./lib/audit.js";
import { initDatabase, isPostgresEnabled } from "./lib/db.js";
import { getAllSeries, getSeriesBySlug, getChapter, createSeriesEntry, createChapterEntry, deleteChapterEntry, deleteSeriesEntry, slugify, ensureBasePaths } from "./lib/library.js";
import { bumpSessionVersion, changePassword, completeEmailVerification, completePasswordReset, countUsers, createEmailVerification, createPasswordReset, createUser, ensureSeedAdmin, findUserById, getPasswordResetByToken, verifyUser } from "./lib/users.js";
import { addComment, deleteChapterInteractions, deleteComment, deleteSeriesInteractions, getBookmarksForUser, getCommentsForChapter, getProgressForUser, getRecentComments, isSeriesBookmarked, toggleBookmark, upsertProgress } from "./lib/community.js";
import { consumeRateLimit, csrfProtection, enforceUniformTiming, ensureCsrfToken, generateCspNonce, rateLimit, sha256 } from "./lib/security.js";
import { emailDeliveryEnabled, emailVerificationEnabled, sendPasswordResetEmail, sendVerificationEmail } from "./lib/email.js";
import { uploadBuffer, getStorageSummary } from "./lib/storage.js";
import { getLanguage, translate } from "./lib/i18n.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const appOrigin = (process.env.APP_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const recentAuthWindowMs = Number(process.env.RECENT_AUTH_MINUTES || 15) * 60 * 1000;
const upload = multer({ storage: multer.memoryStorage() });
const forgotPasswordMessage = "If that account exists, a reset process has been started.";

const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  const parsed = Number(trustProxy);
  app.set("trust proxy", Number.isNaN(parsed) ? trustProxy : parsed);
}

const authRateLimit = rateLimit({ bucket: "auth", windowMs: 10 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT || 20) });
const forgotIpRateLimit = rateLimit({ bucket: "forgot-ip", windowMs: 10 * 60 * 1000, limit: Number(process.env.FORGOT_IP_RATE_LIMIT || 8) });
const verificationResendRateLimit = rateLimit({ bucket: "verify-resend-ip", windowMs: 10 * 60 * 1000, limit: Number(process.env.VERIFY_RESEND_IP_RATE_LIMIT || 6) });
const commentRateLimit = rateLimit({ bucket: "comment", windowMs: 60 * 1000, limit: Number(process.env.COMMENT_RATE_LIMIT || 8) });
const apiRateLimit = rateLimit({ bucket: "api", windowMs: 60 * 1000, limit: Number(process.env.API_RATE_LIMIT || 60) });
const adminRateLimit = rateLimit({ bucket: "admin", windowMs: 60 * 1000, limit: Number(process.env.ADMIN_RATE_LIMIT || 30) });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use((req, res, next) => {
  res.locals.cspNonce = generateCspNonce();
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      styleSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: appOrigin.startsWith("https://") ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use((req, res, next) => {
  const cookieHeader = String(req.headers.cookie || "");
  const cookieMap = Object.fromEntries(cookieHeader.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    if (index === -1) return [part, ""];
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
  const queryLang = typeof req.query.lang === "string" ? req.query.lang : "";
  const lang = getLanguage(queryLang || cookieMap.mw_lang || "ka");
  if (queryLang && queryLang !== cookieMap.mw_lang) {
    res.setHeader("Set-Cookie", `mw_lang=${encodeURIComponent(lang)}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }
  req.locale = lang;
  req.t = (key, vars) => translate(lang, key, vars);
  res.locals.lang = lang;
  res.locals.t = req.t;
  res.locals.langUrl = (code) => {
    const url = new URL(req.originalUrl || req.url || "/", "http://mangawave.local");
    url.searchParams.set("lang", getLanguage(code));
    return `${url.pathname}${url.search}`;
  };
  next();
});
app.use(express.static(path.join(__dirname, "public")));

const sessionStore = await createSessionStore(session);
const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE || (appOrigin.startsWith("https://") ? "auto" : "false");
app.use(session({
  store: sessionStore,
  name: process.env.SESSION_COOKIE_NAME || "mangawave.sid",
  secret: process.env.SESSION_SECRET || "mangawave-dev-session-secret",
  resave: false,
  saveUninitialized: false,
  rolling: false,
  unset: "destroy",
  proxy: Boolean(trustProxy),
  cookie: {
    httpOnly: true,
    sameSite: process.env.SESSION_COOKIE_SAMESITE || "lax",
    secure: sessionCookieSecure === "auto" ? "auto" : sessionCookieSecure === "true",
    maxAge: 1000 * 60 * 60 * 24 * 14,
    path: "/",
  },
}));

const errorKeyByMessage = new Map([
  ["Passwords do not match.", "errPasswordsDoNotMatch"],
  ["New passwords do not match.", "errNewPasswordsDoNotMatch"],
  ["Could not create account.", "errCouldNotCreateAccount"],
  ["Could not verify email.", "errCouldNotVerifyEmail"],
  ["Could not reset password.", "errCouldNotResetPassword"],
  ["Could not confirm password.", "errCouldNotConfirmPassword"],
  ["Could not update password.", "errCouldNotUpdatePassword"],
  ["Password confirmation failed.", "errPasswordConfirmationFailed"],
  ["Email, username, and password are required.", "errEmailUsernamePasswordRequired"],
  ["An account with that email already exists.", "errAccountEmailExists"],
  ["That username is already taken.", "errUsernameTaken"],
  ["Password must be at least 8 characters.", "errPasswordTooShort"],
  ["Choose a less common password.", "errPasswordTooCommon"],
  ["Choose a less predictable password.", "errPasswordTooPredictable"],
  ["Password should not contain your email or username.", "errPasswordContainsIdentity"],
  ["Reset token not found.", "errResetTokenNotFound"],
  ["Reset token expired.", "errResetTokenExpired"],
  ["Verification token not found.", "errVerificationTokenNotFound"],
  ["Verification token expired.", "errVerificationTokenExpired"],
  ["User not found.", "errUserNotFound"],
  ["Current password is incorrect.", "errCurrentPasswordIncorrect"],
  ["Comment body cannot be empty.", "errCommentBodyEmpty"],
  ["Comment is too long.", "errCommentTooLong"],
  ["Comment not found.", "errCommentNotFound"],
  ["You cannot delete this comment.", "errCommentDeleteForbidden"],
  ["Title, short description, and description are required.", "errSeriesFieldsRequired"],
  ["A series with that title already exists.", "errSeriesTitleExists"],
  ["Series not found.", "errSeriesNotFound"],
  ["Chapter not found.", "errChapterNotFound"],
  ["At least one page image is required.", "errPageImageRequired"],
  ["Chapter number is required.", "errChapterNumberRequired"],
  ["This chapter already exists.", "errChapterExists"],
]);

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function setFlashT(req, type, key, vars = {}) {
  setFlash(req, type, req.t(key, vars));
}

function translateError(req, error, fallbackKey = "errorUnknown") {
  if (!error) return req.t(fallbackKey);
  const mappedKey = errorKeyByMessage.get(error.message);
  return req.t(mappedKey || fallbackKey);
}

function audit(req, event) {
  logAuditEvent(req, event).catch(() => {});
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve) => {
    req.session.destroy(() => resolve());
  });
}

function markRecentAuth(req) {
  req.session.recentAuthAt = Date.now();
}

function hasRecentAuth(req) {
  return Number(req.session.recentAuthAt || 0) >= Date.now() - recentAuthWindowMs;
}

async function signInUser(req, user) {
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.sessionVersion = user.sessionVersion;
  markRecentAuth(req);
  ensureCsrfToken(req);
}

async function maybeSendVerificationEmail(req, user) {
  if (!emailVerificationEnabled()) return { delivered: false, reason: "disabled" };
  const payload = await createEmailVerification(user.id, appOrigin);
  if (!payload) return { delivered: false, reason: "already-verified" };
  const result = await sendVerificationEmail({
    to: user.email,
    verifyUrl: payload.verifyUrl,
    expiresMinutes: payload.expiresMinutes,
  });
  audit(req, {
    category: "delivery",
    action: "verification_email",
    outcome: result.delivered ? "success" : "skipped",
    actorId: user.id,
    details: { provider: result.provider, emailHash: sha256(user.email) },
  });
  return result;
}

app.use(async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.currentUser = null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  if (req.session.userId) {
    const user = await findUserById(req.session.userId);
    if (!user || Number(req.session.sessionVersion || 0) !== Number(user.sessionVersion || 0)) {
      audit(req, { category: "auth", action: "session_invalidated", outcome: "success", actorId: req.session.userId });
      delete req.session.userId;
      delete req.session.sessionVersion;
      delete req.session.recentAuthAt;
    } else {
      res.locals.currentUser = user;
    }
  }

  res.locals.storage = getStorageSummary();
  res.locals.dbMode = isPostgresEnabled() ? "postgresql" : "json";
  res.locals.appOrigin = appOrigin;
  res.locals.emailDeliveryEnabled = emailDeliveryEnabled();
  res.locals.emailVerificationEnabled = emailVerificationEnabled();
  res.locals.recentAuth = hasRecentAuth(req);
  res.locals.csrfToken = ensureCsrfToken(req);
  next();
});

function requireAuth(req, res, next) {
  if (!res.locals.currentUser) {
    setFlashT(req, "error", "flashLoginRequired");
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.currentUser) {
    setFlashT(req, "error", "flashAdminLoginRequired");
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  if (res.locals.currentUser.role !== "admin") {
    audit(req, { category: "admin", action: "admin_access_denied", outcome: "failure", actorId: res.locals.currentUser.id });
    return res.status(403).render("pages/error", { pageTitle: req.t("pageForbidden"), error: { message: req.t("errorAdminAccountRequired") } });
  }
  next();
}

function requireVerifiedEmail(req, res, next) {
  if (!res.locals.currentUser?.emailVerified) {
    setFlashT(req, "error", "flashVerifyEmailRequired");
    return res.redirect("/account");
  }
  next();
}

function requireRecentAuth(req, res, next) {
  if (!hasRecentAuth(req)) {
    setFlashT(req, "error", "flashRecentAuthRequired");
    return res.redirect(`/reauth?next=${encodeURIComponent(req.originalUrl || "/account")}`);
  }
  next();
}

function sortChaptersAsc(chapters) {
  return [...chapters].sort((a, b) => Number(a.number) - Number(b.number));
}

function sortChaptersDesc(chapters) {
  return [...chapters].sort((a, b) => Number(b.number) - Number(a.number));
}

const filenameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortFilesByNaturalName(files = []) {
  return [...files].sort((a, b) => {
    const compared = filenameCollator.compare(String(a?.originalname || ""), String(b?.originalname || ""));
    if (compared !== 0) return compared;
    return String(a?.mimetype || "").localeCompare(String(b?.mimetype || ""));
  });
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absoluteUrl(pathname = "/") {
  return new URL(pathname, `${appOrigin}/`).toString();
}

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(["User-agent: *", "Allow: /", `Sitemap: ${absoluteUrl("/sitemap.xml")}`].join("\n"));
});

app.get("/sitemap.xml", async (req, res, next) => {
  try {
    const series = await getAllSeries();
    const urls = [
      {
        loc: absoluteUrl("/"),
        lastmod: series.reduce((latest, item) => {
          const candidate = item.updatedAt || item.chapters[0]?.publishedAt;
          if (!candidate) return latest;
          if (!latest) return candidate;
          return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest;
        }, null),
      },
      {
        loc: absoluteUrl("/series"),
        lastmod: series.reduce((latest, item) => {
          const candidate = item.updatedAt || item.chapters[0]?.publishedAt;
          if (!candidate) return latest;
          if (!latest) return candidate;
          return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest;
        }, null),
      },
      ...series.map((item) => ({
        loc: absoluteUrl(`/series/${item.slug}`),
        lastmod: item.updatedAt || item.chapters[0]?.publishedAt || null,
      })),
    ];

    const body = urls.map((entry) => {
      const lastmod = entry.lastmod ? `\n    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  </url>`;
    }).join("\n");

    res.type("application/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`);
  } catch (error) {
    next(error);
  }
});

app.get("/", async (req, res, next) => {
  try {
    const series = await getAllSeries();
    const featured = series.filter((item) => item.featured).slice(0, 4);
    const recentlyUpdated = [...series].sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt))).slice(0, 6);
    const popular = [...series].sort((a, b) => {
      const scoreA = (a.featured ? 10 : 0) + a.chapters.length;
      const scoreB = (b.featured ? 10 : 0) + b.chapters.length;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt));
    }).slice(0, 6);
    const fresh = [...series].sort((a, b) => {
      const aDate = a.chapters[0]?.publishedAt || a.updatedAt;
      const bDate = b.chapters[0]?.publishedAt || b.updatedAt;
      return Number(new Date(bDate)) - Number(new Date(aDate));
    }).slice(0, 6);
    const totalChapters = series.reduce((sum, item) => sum + item.chapters.length, 0);
    const userCount = await countUsers();
    res.render("pages/home", { pageTitle: req.t("navMain"), series, featured, popular, fresh, recentlyUpdated, totalChapters, userCount });
  } catch (error) {
    next(error);
  }
});

app.get("/series", async (req, res, next) => {
  try {
    const series = await getAllSeries();
    const genres = [...new Set(series.flatMap((item) => item.genres))].sort();
    const progress = res.locals.currentUser ? await getProgressForUser(res.locals.currentUser.id) : [];
    const progressMap = Object.fromEntries(progress.map((item) => [item.seriesSlug, item.chapterLabel]));
    res.render("pages/library", { pageTitle: req.t("pageLibrary"), series, genres, progressMap });
  } catch (error) {
    next(error);
  }
});

app.get("/series/:slug", async (req, res, next) => {
  try {
    const series = await getSeriesBySlug(req.params.slug);
    if (!series) return res.status(404).render("pages/not-found", { pageTitle: req.t("pageNotFound") });
    const chapters = sortChaptersDesc(series.chapters);
    const latestChapter = chapters[0] || null;
    const bookmarked = res.locals.currentUser ? await isSeriesBookmarked(res.locals.currentUser.id, series.slug) : false;
    const progress = res.locals.currentUser ? await getProgressForUser(res.locals.currentUser.id) : [];
    const continueReading = progress.find((item) => item.seriesSlug === series.slug) || null;
    res.render("pages/series-detail", { pageTitle: `${series.title} • MangaWave`, series, chapters, latestChapter, bookmarked, continueReading });
  } catch (error) {
    next(error);
  }
});

app.get("/read/:seriesSlug/:chapterSlug", async (req, res, next) => {
  try {
    const payload = await getChapter(req.params.seriesSlug, req.params.chapterSlug);
    if (!payload) return res.status(404).render("pages/not-found", { pageTitle: req.t("pageNotFound") });
    const ordered = sortChaptersAsc(payload.series.chapters);
    const currentIndex = ordered.findIndex((item) => item.slug === payload.chapter.slug);
    const previous = currentIndex > 0 ? ordered[currentIndex - 1] : null;
    const nextChapter = currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : null;
    const comments = await getCommentsForChapter(payload.series.slug, payload.chapter.slug);
    res.render("pages/reader", { pageTitle: req.t("pageReader", { series: payload.series.title, number: payload.chapter.number }), series: payload.series, chapter: payload.chapter, previous, nextChapter, comments });
  } catch (error) {
    next(error);
  }
});

app.get("/login", (req, res) => {
  if (res.locals.currentUser) return res.redirect("/account");
  res.render("pages/login", { pageTitle: req.t("pageLogin"), nextUrl: req.query.next || "/account" });
});

app.get("/register", (req, res) => {
  if (res.locals.currentUser) return res.redirect("/account");
  res.render("pages/register", { pageTitle: req.t("pageRegister"), nextUrl: req.query.next || "/account" });
});

app.get("/forgot-password", (req, res) => {
  res.render("pages/forgot-password", { pageTitle: req.t("pageForgotPassword") });
});

app.get("/reset-password", async (req, res, next) => {
  try {
    const token = String(req.query.token || "");
    const reset = token ? await getPasswordResetByToken(token) : null;
    const validToken = Boolean(reset && new Date(reset.expires_at || reset.expiresAt).getTime() >= Date.now());
    res.render("pages/reset-password", { pageTitle: req.t("pageResetPassword"), token, validToken });
  } catch (error) {
    next(error);
  }
});

app.get("/reauth", requireAuth, (req, res) => {
  res.render("pages/reauth", { pageTitle: req.t("pageReauth"), nextUrl: req.query.next || "/account" });
});

app.get("/verify-email", async (req, res) => {
  try {
    const user = await completeEmailVerification(String(req.query.token || ""));
    audit(req, { category: "delivery", action: "email_verify", outcome: "success", actorId: user.id, details: { emailHash: sha256(user.email) } });
    setFlashT(req, "success", "flashEmailVerified");
    res.redirect(req.session.userId ? "/account" : "/login");
  } catch (error) {
    audit(req, { category: "delivery", action: "email_verify", outcome: "failure", details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "errCouldNotVerifyEmail"));
    res.redirect(req.session.userId ? "/account" : "/login");
  }
});

app.post("/login", authRateLimit, csrfProtection, async (req, res, next) => {
  try {
    const email = String(req.body.email || "");
    const user = await verifyUser(email, String(req.body.password || ""));
    if (!user) {
      audit(req, { category: "auth", action: "login", outcome: "failure", details: { emailHash: sha256(email.toLowerCase()) } });
      setFlashT(req, "error", "flashWrongEmailOrPassword");
      return res.redirect(`/login?next=${encodeURIComponent(req.body.next || "/account")}`);
    }

    await signInUser(req, user);
    audit(req, { category: "auth", action: "login", outcome: "success", actorId: user.id });
    setFlashT(req, "success", "flashWelcomeBack", { username: user.username });
    res.redirect(req.body.next || "/account");
  } catch (error) {
    next(error);
  }
});

app.post("/register", authRateLimit, csrfProtection, async (req, res) => {
  try {
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    if (password !== confirmPassword) throw new Error("Passwords do not match.");
    const user = await createUser({ email: String(req.body.email || ""), username: String(req.body.username || ""), password });
    await signInUser(req, user);
    await maybeSendVerificationEmail(req, user);
    audit(req, { category: "auth", action: "register", outcome: "success", actorId: user.id });
    setFlashT(req, "success", emailVerificationEnabled() ? "flashAccountCreatedVerify" : "flashAccountCreated", { username: user.username });
    res.redirect(req.body.next || "/account");
  } catch (error) {
    audit(req, { category: "auth", action: "register", outcome: "failure", details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "errCouldNotCreateAccount"));
    res.redirect(`/register?next=${encodeURIComponent(req.body.next || "/account")}`);
  }
});

app.post("/forgot-password", forgotIpRateLimit, csrfProtection, async (req, res) => {
  const startedAt = Date.now();
  const email = String(req.body.email || "").toLowerCase().trim();
  try {
    const accountLimiter = await consumeRateLimit({
      bucket: "forgot-account",
      key: sha256(email || "missing"),
      windowMs: 10 * 60 * 1000,
      limit: Number(process.env.FORGOT_ACCOUNT_RATE_LIMIT || 3),
    });

    if (accountLimiter.allowed) {
      const payload = await createPasswordReset(email, appOrigin);
      if (payload) {
        const delivery = await sendPasswordResetEmail({
          to: payload.user.email,
          resetUrl: payload.resetUrl,
          expiresMinutes: payload.expiresMinutes,
        });
        audit(req, { category: "delivery", action: "password_reset_email", outcome: delivery.delivered ? "success" : "skipped", targetId: payload.user.id, details: { provider: delivery.provider, emailHash: sha256(payload.user.email) } });
      } else {
        audit(req, { category: "auth", action: "forgot_password", outcome: "success", details: { emailHash: sha256(email), resetIssued: false } });
      }
    } else {
      audit(req, { category: "auth", action: "forgot_password", outcome: "throttled", details: { emailHash: sha256(email) } });
    }
  } catch {
    audit(req, { category: "auth", action: "forgot_password", outcome: "failure", details: { emailHash: sha256(email) } });
  }

  await enforceUniformTiming(startedAt, Number(process.env.FORGOT_PASSWORD_MIN_MS || 700));
  setFlashT(req, "success", "flashForgotPasswordStarted");
  res.redirect("/forgot-password");
});

app.post("/reset-password", authRateLimit, csrfProtection, async (req, res) => {
  try {
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    if (password !== confirmPassword) throw new Error("Passwords do not match.");
    const user = await completePasswordReset(String(req.body.token || ""), password);
    audit(req, { category: "auth", action: "reset_password", outcome: "success", actorId: user.id });
    setFlashT(req, "success", "flashPasswordResetComplete");
    res.redirect("/login");
  } catch (error) {
    audit(req, { category: "auth", action: "reset_password", outcome: "failure", details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "errCouldNotResetPassword"));
    res.redirect(`/reset-password?token=${encodeURIComponent(req.body.token || "")}`);
  }
});

app.post("/reauth", requireAuth, authRateLimit, csrfProtection, async (req, res) => {
  try {
    const user = await verifyUser(res.locals.currentUser.email, String(req.body.password || ""));
    if (!user || user.id !== res.locals.currentUser.id) throw new Error("Password confirmation failed.");
    markRecentAuth(req);
    audit(req, { category: "auth", action: "reauth", outcome: "success", actorId: user.id });
    setFlashT(req, "success", "flashPasswordConfirmed");
    res.redirect(req.body.next || "/account");
  } catch (error) {
    audit(req, { category: "auth", action: "reauth", outcome: "failure", actorId: res.locals.currentUser.id, details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "errCouldNotConfirmPassword"));
    res.redirect(`/reauth?next=${encodeURIComponent(req.body.next || "/account")}`);
  }
});

app.post("/account/password", requireAuth, requireRecentAuth, authRateLimit, csrfProtection, async (req, res) => {
  try {
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    if (newPassword !== confirmPassword) throw new Error("New passwords do not match.");
    const user = await changePassword(res.locals.currentUser.id, String(req.body.currentPassword || ""), newPassword);
    await signInUser(req, user);
    audit(req, { category: "auth", action: "change_password", outcome: "success", actorId: user.id });
    setFlashT(req, "success", "flashPasswordUpdated");
    res.redirect("/account");
  } catch (error) {
    audit(req, { category: "auth", action: "change_password", outcome: "failure", actorId: res.locals.currentUser.id, details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "errCouldNotUpdatePassword"));
    res.redirect("/account");
  }
});

app.post("/account/verify-email/resend", requireAuth, verificationResendRateLimit, csrfProtection, async (req, res) => {
  try {
    if (!emailVerificationEnabled()) {
      setFlashT(req, "error", "flashEmailVerificationUnavailable");
      return res.redirect("/account");
    }
    const delivery = await maybeSendVerificationEmail(req, res.locals.currentUser);
    setFlashT(req, delivery.delivered ? "success" : "error", delivery.delivered ? "flashVerificationEmailSent" : "flashVerificationEmailNotSent");
    res.redirect("/account");
  } catch (error) {
    audit(req, { category: "delivery", action: "verification_email", outcome: "failure", actorId: res.locals.currentUser.id, details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "flashVerificationEmailFailed"));
    res.redirect("/account");
  }
});

app.post("/logout", csrfProtection, async (req, res) => {
  audit(req, { category: "auth", action: "logout", outcome: "success", actorId: req.session.userId || null });
  await destroySession(req);
  res.redirect("/");
});

app.get("/account", requireAuth, async (req, res, next) => {
  try {
    const series = await getAllSeries();
    const stats = {
      seriesCount: series.length,
      chapterCount: series.reduce((sum, item) => sum + item.chapters.length, 0),
      featuredCount: series.filter((item) => item.featured).length,
    };
    const [bookmarks, progress] = await Promise.all([
      getBookmarksForUser(res.locals.currentUser.id),
      getProgressForUser(res.locals.currentUser.id),
    ]);
    const seriesMap = new Map(series.map((item) => [item.slug, item]));
    const bookmarkCards = bookmarks.map((item) => ({ ...item, series: seriesMap.get(item.seriesSlug) || null })).filter((item) => item.series);
    const progressCards = progress.map((item) => ({ ...item, series: seriesMap.get(item.seriesSlug) || null })).filter((item) => item.series);
    res.render("pages/account", { pageTitle: req.t("pageAccount"), stats, bookmarkCards, progressCards });
  } catch (error) {
    next(error);
  }
});

app.post("/bookmark/toggle", requireAuth, csrfProtection, async (req, res, next) => {
  try {
    await toggleBookmark(res.locals.currentUser.id, {
      seriesSlug: String(req.body.seriesSlug || ""),
      chapterSlug: String(req.body.chapterSlug || ""),
      chapterLabel: String(req.body.chapterLabel || ""),
    });
    setFlashT(req, "success", "flashBookmarkUpdated");
    res.redirect(req.body.returnTo || "/account");
  } catch (error) {
    next(error);
  }
});

app.post("/api/progress", requireAuth, apiRateLimit, csrfProtection, async (req, res, next) => {
  try {
    await upsertProgress(res.locals.currentUser.id, {
      seriesSlug: String(req.body.seriesSlug || ""),
      chapterSlug: String(req.body.chapterSlug || ""),
      chapterLabel: String(req.body.chapterLabel || ""),
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/comments", requireAuth, requireVerifiedEmail, commentRateLimit, csrfProtection, async (req, res) => {
  try {
    await addComment(res.locals.currentUser, {
      seriesSlug: String(req.body.seriesSlug || ""),
      chapterSlug: String(req.body.chapterSlug || ""),
      body: String(req.body.body || ""),
    });
    audit(req, { category: "moderation", action: "comment_create", outcome: "success", actorId: res.locals.currentUser.id });
    setFlashT(req, "success", "flashCommentPosted");
    res.redirect(req.body.returnTo || "/account");
  } catch (error) {
    audit(req, { category: "moderation", action: "comment_create", outcome: "failure", actorId: res.locals.currentUser.id, details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "flashCommentPostFailed"));
    res.redirect(req.body.returnTo || "/account");
  }
});

app.post("/comments/:id/delete", requireAuth, csrfProtection, async (req, res) => {
  try {
    await deleteComment(req.params.id, res.locals.currentUser);
    audit(req, { category: "moderation", action: "comment_delete", outcome: "success", actorId: res.locals.currentUser.id, targetId: req.params.id });
    setFlashT(req, "success", "flashCommentDeleted");
    res.redirect(req.body.returnTo || "/account");
  } catch (error) {
    audit(req, { category: "moderation", action: "comment_delete", outcome: "failure", actorId: res.locals.currentUser.id, targetId: req.params.id, details: { reason: error.message } });
    setFlash(req, "error", translateError(req, error, "flashCommentDeleteFailed"));
    res.redirect(req.body.returnTo || "/account");
  }
});

app.get("/admin", requireAdmin, requireVerifiedEmail, async (req, res, next) => {
  try {
    const [series, recentComments] = await Promise.all([getAllSeries(), getRecentComments(12)]);
    res.render("pages/admin", { pageTitle: req.t("pageAdmin"), series, recentComments, feedback: { type: null, message: null } });
  } catch (error) {
    next(error);
  }
});

app.post("/admin/series", requireAdmin, requireVerifiedEmail, adminRateLimit, upload.fields([{ name: "cover", maxCount: 1 }, { name: "banner", maxCount: 1 }]), csrfProtection, async (req, res, next) => {
  try {
    const existingSeries = await getAllSeries();
    const title = String(req.body.title || "").trim();
    const shortDescription = String(req.body.shortDescription || "").trim();
    const description = String(req.body.description || "").trim();
    if (!title || !shortDescription || !description) throw new Error("Title, short description, and description are required.");
    const slug = slugify(title);
    if (existingSeries.some((item) => item.slug === slug)) throw new Error("A series with that title already exists.");
    const coverAsset = req.files?.cover?.[0] ? await uploadBuffer({ buffer: req.files.cover[0].buffer, originalname: req.files.cover[0].originalname, relativeDir: `covers/${slug}`, rootDir: __dirname, kind: "cover" }) : { url: "/generated/default-cover.svg", thumbnailUrl: "/generated/default-cover.svg" };
    const bannerAsset = req.files?.banner?.[0] ? await uploadBuffer({ buffer: req.files.banner[0].buffer, originalname: req.files.banner[0].originalname, relativeDir: `banners/${slug}`, rootDir: __dirname, kind: "banner" }) : { url: "/generated/default-banner.svg", thumbnailUrl: "/generated/default-banner.svg" };
    await createSeriesEntry({
      id: `series_${Date.now()}`,
      slug,
      title,
      shortDescription,
      description,
      coverImage: coverAsset.url,
      coverThumbImage: coverAsset.thumbnailUrl,
      bannerImage: bannerAsset.url,
      bannerThumbImage: bannerAsset.thumbnailUrl,
      author: String(req.body.author || "Unknown").trim() || "Unknown",
      artist: String(req.body.artist || req.body.author || "Unknown").trim() || "Unknown",
      status: req.body.status || "Ongoing",
      type: req.body.type || "Manhwa",
      featured: req.body.featured === "on",
      mature: req.body.mature === "on",
      updatedAt: new Date().toISOString(),
      tags: String(req.body.tags || "").split(",").map((value) => value.trim()).filter(Boolean),
      genres: String(req.body.genres || "").split(",").map((value) => value.trim()).filter(Boolean),
      chapters: [],
    });
    audit(req, { category: "admin", action: "series_create", outcome: "success", actorId: res.locals.currentUser.id, details: { slug } });
    setFlashT(req, "success", "flashSeriesCreated");
    res.redirect("/admin");
  } catch (error) {
    audit(req, { category: "admin", action: "series_create", outcome: "failure", actorId: res.locals.currentUser.id, details: { reason: error.message } });
    next(error);
  }
});

app.post("/admin/chapter", requireAdmin, requireVerifiedEmail, adminRateLimit, upload.array("pages", 200), csrfProtection, async (req, res, next) => {
  try {
    const series = await getSeriesBySlug(String(req.body.seriesSlug || ""));
    if (!series) throw new Error("Series not found.");
    const number = Number(req.body.number);
    if (!req.files?.length) throw new Error("At least one page image is required.");
    if (!number) throw new Error("Chapter number is required.");
    const chapterSlug = `chapter-${String(number).replace(/\.0+$/, "")}`;
    if (series.chapters.some((item) => item.slug === chapterSlug)) throw new Error("This chapter already exists.");
    const files = sortFilesByNaturalName(req.files);
    const pages = [];
    for (const file of files) {
      const asset = await uploadBuffer({ buffer: file.buffer, originalname: file.originalname, relativeDir: `chapters/${series.slug}/${chapterSlug}`, rootDir: __dirname, kind: "page" });
      pages.push(asset.url);
    }
    await createChapterEntry(series.slug, {
      id: `chapter_${Date.now()}`,
      title: String(req.body.title || `Chapter ${number}`).trim(),
      slug: chapterSlug,
      number,
      publishedAt: new Date().toISOString(),
      pages,
      estimatedMinutes: Number(req.body.estimatedMinutes || 0) || undefined,
    });
    audit(req, { category: "admin", action: "chapter_create", outcome: "success", actorId: res.locals.currentUser.id, details: { seriesSlug: series.slug, chapterSlug } });
    setFlashT(req, "success", "flashChapterUploaded");
    res.redirect(`/series/${series.slug}`);
  } catch (error) {
    audit(req, { category: "admin", action: "chapter_create", outcome: "failure", actorId: res.locals.currentUser.id, details: { reason: error.message } });
    next(error);
  }
});

app.post("/admin/series/:slug/delete", requireAdmin, requireVerifiedEmail, adminRateLimit, csrfProtection, async (req, res) => {
  try {
    const slug = String(req.params.slug || "");
    await deleteSeriesEntry(slug);
    await deleteSeriesInteractions(slug);
    audit(req, { category: "admin", action: "series_delete", outcome: "success", actorId: res.locals.currentUser.id, details: { slug } });
    setFlashT(req, "success", "flashSeriesDeleted");
    res.redirect("/admin");
  } catch (error) {
    audit(req, { category: "admin", action: "series_delete", outcome: "failure", actorId: res.locals.currentUser.id, details: { slug: req.params.slug, reason: error.message } });
    setFlash(req, "error", translateError(req, error, "errSeriesNotFound"));
    res.redirect("/admin");
  }
});

app.post("/admin/series/:seriesSlug/chapters/:chapterSlug/delete", requireAdmin, requireVerifiedEmail, adminRateLimit, csrfProtection, async (req, res) => {
  try {
    const seriesSlug = String(req.params.seriesSlug || "");
    const chapterSlug = String(req.params.chapterSlug || "");
    await deleteChapterEntry(seriesSlug, chapterSlug);
    await deleteChapterInteractions(seriesSlug, chapterSlug);
    audit(req, { category: "admin", action: "chapter_delete", outcome: "success", actorId: res.locals.currentUser.id, details: { seriesSlug, chapterSlug } });
    setFlashT(req, "success", "flashChapterDeleted");
    res.redirect("/admin");
  } catch (error) {
    audit(req, { category: "admin", action: "chapter_delete", outcome: "failure", actorId: res.locals.currentUser.id, details: { seriesSlug: req.params.seriesSlug, chapterSlug: req.params.chapterSlug, reason: error.message } });
    setFlash(req, "error", translateError(req, error, "errChapterNotFound"));
    res.redirect("/admin");
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).render("pages/error", { pageTitle: res.locals.t("pageError"), error: { message: translateError(_req, error, "errorUnknown") } });
});

await ensureBasePaths(__dirname);
await initDatabase();
await ensureSeedAdmin();
app.listen(port, () => {
  console.log(`MangaWave running on ${appOrigin}`);
});
