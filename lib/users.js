import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { isPostgresEnabled, query } from "./db.js";
import { sha256 } from "./security.js";
import { validatePasswordStrength } from "./password-policy.js";

const usersFile = path.join(process.cwd(), "content", "users.json");
const resetsFile = path.join(process.cwd(), "content", "password-resets.json");
const verificationsFile = path.join(process.cwd(), "content", "email-verifications.json");
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@mangawave.local";
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme123";
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30);
const VERIFY_TOKEN_TTL_MINUTES = Number(process.env.VERIFY_TOKEN_TTL_MINUTES || 60 * 24);

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    sessionVersion: Number(user.session_version || user.sessionVersion || 1),
    emailVerified: Boolean(user.email_verified ?? user.emailVerified ?? false),
    emailVerifiedAt: user.email_verified_at || user.emailVerifiedAt || null,
    createdAt: user.created_at || user.createdAt,
  };
}

async function ensureJsonFile(filePath, emptyValue) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(emptyValue, null, 2), "utf8");
  }
}

async function ensureUsersFile() {
  await ensureJsonFile(usersFile, { users: [] });
}

async function ensureResetsFile() {
  await ensureJsonFile(resetsFile, { resets: [] });
}

async function ensureVerificationsFile() {
  await ensureJsonFile(verificationsFile, { verifications: [] });
}

async function getJsonStore() {
  await ensureUsersFile();
  return JSON.parse(await fs.readFile(usersFile, "utf8"));
}

async function saveJsonStore(store) {
  await ensureUsersFile();
  await fs.writeFile(usersFile, JSON.stringify(store, null, 2), "utf8");
}

async function getResetStore() {
  await ensureResetsFile();
  return JSON.parse(await fs.readFile(resetsFile, "utf8"));
}

async function saveResetStore(store) {
  await ensureResetsFile();
  await fs.writeFile(resetsFile, JSON.stringify(store, null, 2), "utf8");
}

async function getVerificationStore() {
  await ensureVerificationsFile();
  return JSON.parse(await fs.readFile(verificationsFile, "utf8"));
}

async function saveVerificationStore(store) {
  await ensureVerificationsFile();
  await fs.writeFile(verificationsFile, JSON.stringify(store, null, 2), "utf8");
}

export async function ensureSeedAdmin() {
  if (isPostgresEnabled()) {
    const existing = await query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (existing.rows[0]) return publicUser(existing.rows[0]);
    validatePasswordStrength(DEFAULT_ADMIN_PASSWORD, [DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_USERNAME]);
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    const admin = {
      id: `user_${Date.now()}`,
      email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash,
      role: "admin",
      sessionVersion: 1,
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    await query(
      `INSERT INTO users (id, email, username, password_hash, role, session_version, email_verified, email_verified_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [admin.id, admin.email, admin.username, admin.passwordHash, admin.role, admin.sessionVersion, admin.emailVerified, admin.emailVerifiedAt, admin.createdAt],
    );
    return publicUser(admin);
  }

  const store = await getJsonStore();
  const existing = store.users.find((user) => user.role === "admin");
  if (existing) return publicUser(existing);
  validatePasswordStrength(DEFAULT_ADMIN_PASSWORD, [DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_USERNAME]);
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  const admin = {
    id: `user_${Date.now()}`,
    email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash,
    role: "admin",
    sessionVersion: 1,
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  store.users.push(admin);
  await saveJsonStore(store);
  return publicUser(admin);
}

export async function findUserByEmail(email) {
  const clean = String(email || "").toLowerCase();
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM users WHERE email = $1 LIMIT 1", [clean]);
    return result.rows[0] || null;
  }
  const store = await getJsonStore();
  return store.users.find((user) => user.email === clean) || null;
}

export async function findUserById(id) {
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
    return result.rows[0] ? publicUser(result.rows[0]) : null;
  }
  const store = await getJsonStore();
  const user = store.users.find((item) => item.id === id);
  return user ? publicUser(user) : null;
}

export async function createUser({ email, username, password, role = "reader" }) {
  const cleanEmail = String(email || "").toLowerCase().trim();
  const cleanUsername = String(username || "").trim();
  if (!cleanEmail || !cleanUsername || !password) throw new Error("Email, username, and password are required.");
  validatePasswordStrength(password, [cleanEmail, cleanUsername]);

  const existingByEmail = await findUserByEmail(cleanEmail);
  if (existingByEmail) throw new Error("An account with that email already exists.");

  if (isPostgresEnabled()) {
    const existingByName = await query("SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1", [cleanUsername]);
    if (existingByName.rows[0]) throw new Error("That username is already taken.");
    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: `user_${Date.now()}`,
      email: cleanEmail,
      username: cleanUsername,
      passwordHash,
      role,
      sessionVersion: 1,
      emailVerified: false,
      emailVerifiedAt: null,
      createdAt: new Date().toISOString(),
    };
    await query(
      `INSERT INTO users (id, email, username, password_hash, role, session_version, email_verified, email_verified_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [user.id, user.email, user.username, user.passwordHash, user.role, user.sessionVersion, user.emailVerified, user.emailVerifiedAt, user.createdAt],
    );
    return publicUser(user);
  }

  const store = await getJsonStore();
  if (store.users.some((user) => user.username.toLowerCase() === cleanUsername.toLowerCase())) throw new Error("That username is already taken.");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: `user_${Date.now()}`,
    email: cleanEmail,
    username: cleanUsername,
    passwordHash,
    role,
    sessionVersion: 1,
    emailVerified: false,
    emailVerifiedAt: null,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  await saveJsonStore(store);
  return publicUser(user);
}

export async function verifyUser(email, password) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const passwordHash = user.password_hash || user.passwordHash;
  const valid = await bcrypt.compare(String(password || ""), passwordHash);
  if (!valid) return null;
  return publicUser(user);
}

export async function countUsers() {
  if (isPostgresEnabled()) {
    const result = await query("SELECT COUNT(*)::int AS count FROM users");
    return Number(result.rows[0].count);
  }
  const store = await getJsonStore();
  return store.users.length;
}

export async function bumpSessionVersion(userId) {
  if (isPostgresEnabled()) {
    const result = await query(
      "UPDATE users SET session_version = session_version + 1 WHERE id = $1 RETURNING *",
      [userId],
    );
    if (!result.rows[0]) throw new Error("User not found.");
    await query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
    return publicUser(result.rows[0]);
  }

  const store = await getJsonStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");
  user.sessionVersion = Number(user.sessionVersion || 1) + 1;
  await saveJsonStore(store);
  const resets = await getResetStore();
  resets.resets = resets.resets.filter((item) => item.userId !== userId);
  await saveResetStore(resets);
  return publicUser(user);
}

export async function changePassword(userId, currentPassword, newPassword) {
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
    const user = result.rows[0];
    if (!user) throw new Error("User not found.");
    const valid = await bcrypt.compare(String(currentPassword || ""), user.password_hash);
    if (!valid) throw new Error("Current password is incorrect.");
    validatePasswordStrength(newPassword, [user.email, user.username]);
    const hash = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, hash]);
    return bumpSessionVersion(userId);
  }

  const store = await getJsonStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");
  const valid = await bcrypt.compare(String(currentPassword || ""), user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect.");
  validatePasswordStrength(newPassword, [user.email, user.username]);
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await saveJsonStore(store);
  return bumpSessionVersion(userId);
}

export async function createPasswordReset(email, appOrigin) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  if (isPostgresEnabled()) {
    await query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
    await query(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [`reset_${Date.now()}`, user.id, tokenHash, expiresAt, new Date().toISOString()],
    );
  } else {
    const store = await getResetStore();
    store.resets = store.resets.filter((item) => item.userId !== user.id);
    store.resets.push({
      id: `reset_${Date.now()}`,
      userId: user.id,
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
    });
    await saveResetStore(store);
  }

  const resetUrl = new URL(`/reset-password?token=${rawToken}`, appOrigin).toString();
  return { token: rawToken, expiresAt, user: publicUser(user), resetUrl, expiresMinutes: RESET_TOKEN_TTL_MINUTES };
}

export async function getPasswordResetByToken(token) {
  const tokenHash = sha256(String(token || ""));
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM password_resets WHERE token_hash = $1 LIMIT 1", [tokenHash]);
    return result.rows[0] || null;
  }
  const store = await getResetStore();
  return store.resets.find((item) => item.tokenHash === tokenHash) || null;
}

export async function completePasswordReset(token, newPassword) {
  const reset = await getPasswordResetByToken(token);
  if (!reset) throw new Error("Reset token not found.");
  const expiresAt = new Date(reset.expires_at || reset.expiresAt);
  if (expiresAt.getTime() < Date.now()) throw new Error("Reset token expired.");
  const userId = reset.user_id || reset.userId;

  if (isPostgresEnabled()) {
    const userResult = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
    const user = userResult.rows[0];
    if (!user) throw new Error("User not found.");
    validatePasswordStrength(newPassword, [user.email, user.username]);
    const hash = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, hash]);
    return bumpSessionVersion(userId);
  }

  const users = await getJsonStore();
  const user = users.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");
  validatePasswordStrength(newPassword, [user.email, user.username]);
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await saveJsonStore(users);
  return bumpSessionVersion(userId);
}

export async function createEmailVerification(userId, appOrigin) {
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found.");
  if (user.emailVerified) return null;

  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  if (isPostgresEnabled()) {
    await query("DELETE FROM email_verifications WHERE user_id = $1", [user.id]);
    await query(
      `INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [`verify_${Date.now()}`, user.id, tokenHash, expiresAt, new Date().toISOString()],
    );
  } else {
    const store = await getVerificationStore();
    store.verifications = store.verifications.filter((item) => item.userId !== user.id);
    store.verifications.push({
      id: `verify_${Date.now()}`,
      userId: user.id,
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
    });
    await saveVerificationStore(store);
  }

  const verifyUrl = new URL(`/verify-email?token=${rawToken}`, appOrigin).toString();
  return { token: rawToken, verifyUrl, expiresAt, expiresMinutes: VERIFY_TOKEN_TTL_MINUTES, user };
}

export async function getEmailVerificationByToken(token) {
  const tokenHash = sha256(String(token || ""));
  if (isPostgresEnabled()) {
    const result = await query("SELECT * FROM email_verifications WHERE token_hash = $1 LIMIT 1", [tokenHash]);
    return result.rows[0] || null;
  }
  const store = await getVerificationStore();
  return store.verifications.find((item) => item.tokenHash === tokenHash) || null;
}

export async function completeEmailVerification(token) {
  const verification = await getEmailVerificationByToken(token);
  if (!verification) throw new Error("Verification token not found.");
  const expiresAt = new Date(verification.expires_at || verification.expiresAt);
  if (expiresAt.getTime() < Date.now()) throw new Error("Verification token expired.");
  const userId = verification.user_id || verification.userId;
  const verifiedAt = new Date().toISOString();

  if (isPostgresEnabled()) {
    const result = await query(
      "UPDATE users SET email_verified = TRUE, email_verified_at = $2 WHERE id = $1 RETURNING *",
      [userId, verifiedAt],
    );
    await query("DELETE FROM email_verifications WHERE user_id = $1", [userId]);
    return publicUser(result.rows[0]);
  }

  const store = await getJsonStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");
  user.emailVerified = true;
  user.emailVerifiedAt = verifiedAt;
  await saveJsonStore(store);
  const verifications = await getVerificationStore();
  verifications.verifications = verifications.verifications.filter((item) => item.userId !== userId);
  await saveVerificationStore(verifications);
  return publicUser(user);
}
