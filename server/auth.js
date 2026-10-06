'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('./db');

const SESSION_DAYS = 180;
const COOKIE = 'pomo_sid';
const isProd = process.env.NODE_ENV === 'production';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86400}`
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`);
}

async function createSession(res, userId) {
  const token = randomToken();
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha256(token), userId, String(SESSION_DAYS)]
  );
  setSessionCookie(res, token);
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  clearSessionCookie(res);
}

// Attaches req.user when a valid session cookie is present.
async function loadUser(req, _res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const { rows } = await query(
        `SELECT u.id, u.email, u.name, u.timezone FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha256(token)]
      );
      if (rows[0]) req.user = rows[0];
    }
    next();
  } catch (e) { next(e); }
}

function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in'));
  next();
}

// Mutating API calls must carry a custom header. Browsers won't send it cross-site
// without a CORS preflight (which we never allow), so this blocks CSRF.
function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'pomodoro') return next(new HttpError(403, 'Bad request origin'));
  next();
}

// Small in-memory limiter for auth endpoints (per IP + route).
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, _res, next) => {
    const key = `${req.ip}|${req.path}`;
    const now = Date.now();
    const rec = hits.get(key) || { n: 0, reset: now + windowMs };
    if (now > rec.reset) { rec.n = 0; rec.reset = now + windowMs; }
    rec.n++;
    hits.set(key, rec);
    if (rec.n > max) return next(new HttpError(429, 'Too many attempts — please wait a few minutes'));
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k); }, 60_000).unref();

const hashPassword = (pw) => bcrypt.hash(pw, 11);
const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (pw.length > 200) throw new HttpError(400, 'Password is too long');
}
function normalizeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw new HttpError(400, 'Enter a valid email address');
  return e;
}

module.exports = {
  HttpError, sha256, randomToken, createSession, destroySession, loadUser, requireUser,
  csrfGuard, rateLimit, hashPassword, checkPassword, validatePassword, normalizeEmail
};
