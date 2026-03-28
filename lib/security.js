import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { isPostgresEnabled, query } from "./db.js";

const rateLimitFile = path.join(process.cwd(), "content", "rate-limits.json");

export function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

export function generateCspNonce() {
  return crypto.randomBytes(16).toString("base64");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export async function enforceUniformTiming(startedAt, minimumMs = 700) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minimumMs) {
    await new Promise((resolve) => setTimeout(resolve, minimumMs - elapsed));
  }
}

export function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const expected = req.session.csrfToken;
  const provided = req.body?._csrf || req.get("x-csrf-token");
  if (!expected || !provided || expected !== provided) {
    if (req.path.startsWith("/api/")) {
      return res.status(403).json({ ok: false, error: "Invalid or missing CSRF token." });
    }
    return res.status(403).render("pages/error", {
      pageTitle: "Security check failed • MangaWave",
      error: new Error("Invalid or missing CSRF token."),
    });
  }
  next();
}

async function ensureRateLimitFile() {
  await fs.mkdir(path.dirname(rateLimitFile), { recursive: true });
  try {
    await fs.access(rateLimitFile);
  } catch {
    await fs.writeFile(rateLimitFile, JSON.stringify({ entries: [] }, null, 2), "utf8");
  }
}

async function readRateLimitFile() {
  await ensureRateLimitFile();
  const raw = await fs.readFile(rateLimitFile, "utf8");
  return JSON.parse(raw);
}

async function writeRateLimitFile(store) {
  await ensureRateLimitFile();
  await fs.writeFile(rateLimitFile, JSON.stringify(store, null, 2), "utf8");
}

function windowStartFor(now, windowMs) {
  return Math.floor(now / windowMs) * windowMs;
}

export async function consumeRateLimit({ bucket, key, windowMs, limit }) {
  const now = Date.now();
  const windowStart = windowStartFor(now, windowMs);
  const resetAt = windowStart + windowMs;

  if (isPostgresEnabled()) {
    const result = await query(
      `INSERT INTO rate_limits (bucket, subject_key, window_start, count)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (bucket, subject_key, window_start)
       DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [bucket, key, new Date(windowStart).toISOString(), 1],
    );
    const count = Number(result.rows[0].count);
    await query("DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'");
    return { allowed: count <= limit, count, remaining: Math.max(limit - count, 0), resetAt };
  }

  const store = await readRateLimitFile();
  const cutoff = now - Math.max(windowMs * 3, 60 * 60 * 1000);
  store.entries = (store.entries || []).filter((entry) => Number(new Date(entry.windowStart)) >= cutoff);
  let entry = store.entries.find((item) => item.bucket === bucket && item.key === key && item.windowStart === windowStart);
  if (!entry) {
    entry = { bucket, key, windowStart, count: 0 };
    store.entries.push(entry);
  }
  entry.count += 1;
  await writeRateLimitFile(store);
  return { allowed: entry.count <= limit, count: entry.count, remaining: Math.max(limit - entry.count, 0), resetAt };
}

function requestIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

export function rateLimit({ bucket, windowMs, limit, keyFn } = {}) {
  return async (req, res, next) => {
    const key = keyFn ? await keyFn(req) : requestIp(req);
    const result = await consumeRateLimit({ bucket, key, windowMs, limit });
    if (result.allowed) return next();
    if (req.path.startsWith("/api/")) {
      return res.status(429).json({ ok: false, error: "Too many requests." });
    }
    return res.status(429).render("pages/error", {
      pageTitle: "Rate limit hit • MangaWave",
      error: new Error("Too many requests. Slow down and try again shortly."),
    });
  };
}
