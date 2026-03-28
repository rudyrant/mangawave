import nodemailer from "nodemailer";
import { Resend } from "resend";
import { translate } from "./i18n.js";

const provider = (process.env.EMAIL_PROVIDER || "disabled").toLowerCase();
const fromEmail = process.env.EMAIL_FROM || "";
const fromName = process.env.EMAIL_FROM_NAME || "MangaWave";

function canonicalOrigin() {
  const origin = (process.env.APP_ORIGIN || "").trim().replace(/\/$/, "");
  if (!origin) throw new Error("APP_ORIGIN is required for email delivery.");
  const url = new URL(origin);
  const localhost = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localhost) {
    throw new Error("APP_ORIGIN must be HTTPS for email delivery.");
  }
  return origin;
}

function sender() {
  if (!fromEmail) throw new Error("EMAIL_FROM is required for email delivery.");
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

function smtpTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
}

function bilingualBlock({ kaTitle, kaLead, kaButton, kaFallback, kaIgnore, enTitle, enLead, enButton, enFallback, enIgnore, url, buttonColor }) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>${kaTitle}</h2>
      <p>${kaLead}</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 18px;background:${buttonColor};color:#ffffff;text-decoration:none;border-radius:10px">${kaButton}</a></p>
      <p>${kaFallback}</p>
      <p><a href="${url}">${url}</a></p>
      <p>${kaIgnore}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <h3 style="margin-top:0">${enTitle}</h3>
      <p>${enLead}</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 18px;background:${buttonColor};color:#ffffff;text-decoration:none;border-radius:10px">${enButton}</a></p>
      <p>${enFallback}</p>
      <p><a href="${url}">${url}</a></p>
      <p>${enIgnore}</p>
    </div>
  `;
}

function passwordResetHtml({ resetUrl, expiresMinutes }) {
  return bilingualBlock({
    kaTitle: translate('ka', 'emailResetTitle'),
    kaLead: translate('ka', 'emailResetLead', { minutes: expiresMinutes }),
    kaButton: translate('ka', 'emailResetButton'),
    kaFallback: translate('ka', 'emailResetFallback'),
    kaIgnore: translate('ka', 'emailResetIgnore'),
    enTitle: translate('en', 'emailResetTitle'),
    enLead: translate('en', 'emailResetLead', { minutes: expiresMinutes }),
    enButton: translate('en', 'emailResetButton'),
    enFallback: translate('en', 'emailResetFallback'),
    enIgnore: translate('en', 'emailResetIgnore'),
    url: resetUrl,
    buttonColor: '#7c3aed',
  });
}

function verificationHtml({ verifyUrl, expiresMinutes }) {
  return bilingualBlock({
    kaTitle: translate('ka', 'emailVerifyTitle'),
    kaLead: translate('ka', 'emailVerifyLead', { minutes: expiresMinutes }),
    kaButton: translate('ka', 'emailVerifyButton'),
    kaFallback: translate('ka', 'emailVerifyFallback'),
    kaIgnore: translate('ka', 'emailVerifyIgnore'),
    enTitle: translate('en', 'emailVerifyTitle'),
    enLead: translate('en', 'emailVerifyLead', { minutes: expiresMinutes }),
    enButton: translate('en', 'emailVerifyButton'),
    enFallback: translate('en', 'emailVerifyFallback'),
    enIgnore: translate('en', 'emailVerifyIgnore'),
    url: verifyUrl,
    buttonColor: '#2563eb',
  });
}

async function sendWithSmtp(message) {
  const transport = smtpTransport();
  const result = await transport.sendMail(message);
  return { provider: "smtp", id: result.messageId || null };
}

async function sendWithResend(message) {
  const client = new Resend(process.env.RESEND_API_KEY);
  const result = await client.emails.send({
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  return { provider: "resend", id: result.data?.id || null };
}

export function emailDeliveryEnabled() {
  return ["smtp", "resend"].includes(provider);
}

export function emailVerificationEnabled() {
  return process.env.ENABLE_EMAIL_VERIFICATION === "true" && emailDeliveryEnabled();
}

export function getCanonicalAppOrigin() {
  return canonicalOrigin();
}

export async function sendEmail({ to, subject, html, text }) {
  if (!emailDeliveryEnabled()) {
    return { delivered: false, provider: "disabled", id: null };
  }

  canonicalOrigin();
  const message = {
    from: sender(),
    to,
    subject,
    html,
    text,
  };

  if (provider === "smtp") {
    const result = await sendWithSmtp(message);
    return { delivered: true, ...result };
  }

  if (provider === "resend") {
    const result = await sendWithResend(message);
    return { delivered: true, ...result };
  }

  return { delivered: false, provider: "disabled", id: null };
}

export async function sendPasswordResetEmail({ to, resetUrl, expiresMinutes }) {
  return sendEmail({
    to,
    subject: `${translate('ka', 'emailResetSubject')} / ${translate('en', 'emailResetSubject')}`,
    text: `${translate('ka', 'emailResetLead', { minutes: expiresMinutes })}\n${resetUrl}\n\n${translate('en', 'emailResetLead', { minutes: expiresMinutes })}\n${resetUrl}`,
    html: passwordResetHtml({ resetUrl, expiresMinutes }),
  });
}

export async function sendVerificationEmail({ to, verifyUrl, expiresMinutes }) {
  return sendEmail({
    to,
    subject: `${translate('ka', 'emailVerifySubject')} / ${translate('en', 'emailVerifySubject')}`,
    text: `${translate('ka', 'emailVerifyLead', { minutes: expiresMinutes })}\n${verifyUrl}\n\n${translate('en', 'emailVerifyLead', { minutes: expiresMinutes })}\n${verifyUrl}`,
    html: verificationHtml({ verifyUrl, expiresMinutes }),
  });
}
