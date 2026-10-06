'use strict';
const express = require('express');
const { query, tx } = require('./db');
const {
  HttpError, sha256, randomToken, createSession, destroySession, requireUser,
  rateLimit, hashPassword, checkPassword, validatePassword, normalizeEmail
} = require('./auth');
const { sendMail } = require('./mail');
const push = require('./push');

const router = express.Router();
const json = express.json({ limit: '200kb' });
const bigJson = express.json({ limit: '15mb' });

const ROLES = ['owner', 'editor', 'viewer'];
const ENTRY_TYPES = new Set([
  'breast', 'bottle', 'diaper', 'sleep', 'pump', 'solid', 'med', 'temp',
  'growth', 'vaccine', 'milestone', 'photo', 'note'
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
function uuid(v, what = 'id') {
  if (!UUID.test(String(v))) throw new HttpError(400, `Invalid ${what}`);
  return String(v).toLowerCase();
}
function validTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try { Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
// Links in emails must never come from the request's Host header (it can be spoofed).
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.NODE_ENV === 'production') throw new HttpError(500, 'APP_URL is not configured');
  return `${req.protocol}://${req.get('host')}`;
}

// ---------- Membership helpers ----------
async function membership(userId, familyId) {
  const { rows } = await query('SELECT role FROM memberships WHERE user_id = $1 AND family_id = $2', [userId, familyId]);
  return rows[0] ? rows[0].role : null;
}
// Loads req.role for /families/:fid routes and enforces a minimum role.
function familyAccess(min = 'viewer') {
  const rank = { viewer: 1, editor: 2, owner: 3 };
  return wrap(async (req, _res, next) => {
    const fid = uuid(req.params.fid, 'family');
    const role = await membership(req.user.id, fid);
    if (!role) throw new HttpError(404, 'Family not found');
    if (rank[role] < rank[min]) throw new HttpError(403, min === 'owner' ? 'Only family admins can do that' : 'You have view-only access');
    req.fid = fid;
    req.role = role;
    next();
  });
}

async function familiesFor(userId) {
  const { rows } = await query(
    `SELECT f.id, f.name, m.role, m.relationship FROM memberships m JOIN families f ON f.id = m.family_id
     WHERE m.user_id = $1 ORDER BY m.created_at`, [userId]);
  return rows;
}

async function createFamily(client, userId, name, relationship) {
  const { rows } = await client.query('INSERT INTO families (name) VALUES ($1) RETURNING id', [name]);
  await client.query(`INSERT INTO memberships (family_id, user_id, role, relationship) VALUES ($1, $2, 'owner', $3)`,
    [rows[0].id, userId, relationship]);
  return rows[0].id;
}

async function useInvite(client, code, userId, relationship) {
  const { rows } = await client.query(
    `SELECT * FROM invites WHERE code = $1 AND used_by IS NULL AND expires_at > now() FOR UPDATE`, [code]);
  const inv = rows[0];
  if (!inv) throw new HttpError(400, 'This invite link has expired or was already used');
  await client.query(
    `INSERT INTO memberships (family_id, user_id, role, relationship) VALUES ($1, $2, $3, $4)
     ON CONFLICT (family_id, user_id) DO NOTHING`, [inv.family_id, userId, inv.role, relationship]);
  await client.query('UPDATE invites SET used_by = $1, used_at = now() WHERE code = $2', [userId, code]);
  return inv.family_id;
}

// ---------- Auth ----------
router.post('/auth/signup', rateLimit(10, 15 * 60_000), json, wrap(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const name = str(req.body.name, 80);
  if (!name) throw new HttpError(400, 'Please enter your name');
  validatePassword(req.body.password);
  const tz = validTimezone(req.body.timezone) ? req.body.timezone : 'UTC';
  const relationship = str(req.body.relationship, 40);
  const hash = await hashPassword(req.body.password);
  const userId = await tx(async (c) => {
    const exists = await c.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows[0]) throw new HttpError(409, 'An account with this email already exists — try signing in');
    const { rows } = await c.query(
      'INSERT INTO users (email, name, password_hash, timezone) VALUES ($1, $2, $3, $4) RETURNING id', [email, name, hash, tz]);
    const id = rows[0].id;
    if (req.body.invite) await useInvite(c, str(req.body.invite, 80), id, relationship);
    else await createFamily(c, id, `${name.split(' ')[0]}'s family`, relationship);
    return id;
  });
  await createSession(res, userId);
  res.status(201).json(await meBody(userId));
}));

router.post('/auth/login', rateLimit(10, 15 * 60_000), json, wrap(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { rows } = await query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
  const ok = rows[0] && await checkPassword(String(req.body.password || ''), rows[0].password_hash);
  if (!ok) throw new HttpError(401, 'Email or password is incorrect');
  await createSession(res, rows[0].id);
  res.json(await meBody(rows[0].id));
}));

router.post('/auth/logout', wrap(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

router.post('/auth/forgot', rateLimit(5, 15 * 60_000), json, wrap(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { rows } = await query('SELECT id, name FROM users WHERE email = $1', [email]);
  if (rows[0]) {
    const token = randomToken();
    await query(`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
      [sha256(token), rows[0].id]);
    const link = `${appUrl(req)}/#reset=${token}`;
    await sendMail({
      to: email,
      subject: 'Reset your My Little Pomodoro password',
      text: `Hi ${rows[0].name},\n\nTap the link below to choose a new password. It works for one hour.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`
    });
  }
  // Same answer either way, so emails can't be probed.
  res.json({ ok: true });
}));

router.post('/auth/reset', rateLimit(10, 15 * 60_000), json, wrap(async (req, res) => {
  validatePassword(req.body.password);
  const hash = await hashPassword(req.body.password);
  const userId = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT user_id FROM password_resets WHERE token_hash = $1 AND NOT used AND expires_at > now() FOR UPDATE`,
      [sha256(String(req.body.token || ''))]);
    if (!rows[0]) throw new HttpError(400, 'This reset link has expired — request a new one');
    await c.query('UPDATE password_resets SET used = true WHERE token_hash = $1', [sha256(String(req.body.token))]);
    await c.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].user_id]);
    await c.query('DELETE FROM sessions WHERE user_id = $1', [rows[0].user_id]);
    return rows[0].user_id;
  });
  await createSession(res, userId);
  res.json(await meBody(userId));
}));

// ---------- Me ----------
async function meBody(userId) {
  const { rows } = await query('SELECT id, email, name, timezone FROM users WHERE id = $1', [userId]);
  return { user: rows[0], families: await familiesFor(userId) };
}

router.get('/me', requireUser, wrap(async (req, res) => res.json(await meBody(req.user.id))));

router.patch('/me', requireUser, json, wrap(async (req, res) => {
  const b = req.body;
  if (b.name != null) {
    const name = str(b.name, 80);
    if (!name) throw new HttpError(400, 'Name cannot be empty');
    await query('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
  }
  if (b.timezone && validTimezone(b.timezone)) await query('UPDATE users SET timezone = $1 WHERE id = $2', [b.timezone, req.user.id]);
  if (b.email != null) {
    const email = normalizeEmail(b.email);
    const taken = await query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, req.user.id]);
    if (taken.rows[0]) throw new HttpError(409, 'That email is already in use');
    await query('UPDATE users SET email = $1 WHERE id = $2', [email, req.user.id]);
  }
  if (b.newPassword != null) {
    validatePassword(b.newPassword);
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!await checkPassword(String(b.currentPassword || ''), rows[0].password_hash)) throw new HttpError(400, 'Current password is incorrect');
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(b.newPassword), req.user.id]);
  }
  res.json(await meBody(req.user.id));
}));

router.delete('/me', requireUser, json, wrap(async (req, res) => {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!await checkPassword(String(req.body.password || ''), rows[0].password_hash)) throw new HttpError(400, 'Password is incorrect');
  await tx(async (c) => {
    // Families where this user is the last admin pass to the longest-standing member, or are removed if empty.
    const fams = await c.query(`SELECT family_id FROM memberships WHERE user_id = $1 AND role = 'owner'`, [req.user.id]);
    for (const { family_id: fid } of fams.rows) {
      const others = await c.query(`SELECT user_id, role FROM memberships WHERE family_id = $1 AND user_id <> $2 ORDER BY created_at`, [fid, req.user.id]);
      if (!others.rows.length) await c.query('DELETE FROM families WHERE id = $1', [fid]);
      else if (!others.rows.some((o) => o.role === 'owner')) {
        await c.query(`UPDATE memberships SET role = 'owner' WHERE family_id = $1 AND user_id = $2`, [fid, others.rows[0].user_id]);
      }
    }
    await c.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  });
  await destroySession(req, res);
  res.json({ ok: true });
}));

// ---------- Families ----------
router.post('/families', requireUser, json, wrap(async (req, res) => {
  const name = str(req.body.name, 80) || 'Our family';
  const id = await tx((c) => createFamily(c, req.user.id, name, str(req.body.relationship, 40)));
  res.status(201).json({ id, families: await familiesFor(req.user.id) });
}));

router.patch('/families/:fid', requireUser, familyAccess('owner'), json, wrap(async (req, res) => {
  const name = str(req.body.name, 80);
  if (!name) throw new HttpError(400, 'Name cannot be empty');
  await query('UPDATE families SET name = $1 WHERE id = $2', [name, req.fid]);
  res.json({ families: await familiesFor(req.user.id) });
}));

router.get('/families/:fid/members', requireUser, familyAccess(), wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, m.role, m.relationship, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.family_id = $1 ORDER BY m.created_at`, [req.fid]);
  const invites = req.role === 'owner'
    ? (await query(`SELECT code, role, expires_at FROM invites WHERE family_id = $1 AND used_by IS NULL AND expires_at > now() ORDER BY created_at DESC`, [req.fid])).rows
    : [];
  res.json({ members: rows, invites, role: req.role });
}));

// Update your own relationship label, or (admins) someone's role.
router.patch('/families/:fid/members/:uid', requireUser, familyAccess(), json, wrap(async (req, res) => {
  const uid = uuid(req.params.uid, 'member');
  const self = uid === req.user.id;
  if (!self && req.role !== 'owner') throw new HttpError(403, 'Only family admins can do that');
  if (req.body.relationship != null) {
    await query('UPDATE memberships SET relationship = $1 WHERE family_id = $2 AND user_id = $3', [str(req.body.relationship, 40), req.fid, uid]);
  }
  if (req.body.role != null) {
    if (req.role !== 'owner') throw new HttpError(403, 'Only family admins can change roles');
    if (!ROLES.includes(req.body.role)) throw new HttpError(400, 'Unknown role');
    await tx(async (c) => {
      await c.query('UPDATE memberships SET role = $1 WHERE family_id = $2 AND user_id = $3', [req.body.role, req.fid, uid]);
      const owners = await c.query(`SELECT count(*)::int AS n FROM memberships WHERE family_id = $1 AND role = 'owner'`, [req.fid]);
      if (owners.rows[0].n < 1) throw new HttpError(400, 'A family needs at least one admin');
    });
  }
  res.json({ ok: true });
}));

router.delete('/families/:fid/members/:uid', requireUser, familyAccess(), wrap(async (req, res) => {
  const uid = uuid(req.params.uid, 'member');
  if (uid !== req.user.id && req.role !== 'owner') throw new HttpError(403, 'Only family admins can remove members');
  await tx(async (c) => {
    await c.query('DELETE FROM memberships WHERE family_id = $1 AND user_id = $2', [req.fid, uid]);
    const left = await c.query('SELECT role FROM memberships WHERE family_id = $1', [req.fid]);
    if (!left.rows.length) await c.query('DELETE FROM families WHERE id = $1', [req.fid]);
    else if (!left.rows.some((r) => r.role === 'owner')) throw new HttpError(400, 'Make someone else an admin before leaving');
  });
  res.json({ families: await familiesFor(req.user.id) });
}));

// ---------- Invites ----------
router.post('/families/:fid/invites', requireUser, familyAccess('owner'), json, wrap(async (req, res) => {
  const role = ROLES.includes(req.body.role) ? req.body.role : 'editor';
  const code = randomToken(9);
  await query(`INSERT INTO invites (code, family_id, role, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '14 days')`,
    [code, req.fid, role, req.user.id]);
  res.status(201).json({ code, role, url: `${appUrl(req)}/#invite=${code}` });
}));

router.delete('/families/:fid/invites/:code', requireUser, familyAccess('owner'), wrap(async (req, res) => {
  await query('DELETE FROM invites WHERE family_id = $1 AND code = $2', [req.fid, req.params.code]);
  res.json({ ok: true });
}));

// Public preview so the invite screen can say who's inviting you.
router.get('/invites/:code', rateLimit(30, 15 * 60_000), wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT f.name AS family, i.role, u.name AS inviter FROM invites i JOIN families f ON f.id = i.family_id
     LEFT JOIN users u ON u.id = i.created_by WHERE i.code = $1 AND i.used_by IS NULL AND i.expires_at > now()`, [req.params.code]);
  if (!rows[0]) throw new HttpError(404, 'This invite link has expired or was already used');
  res.json(rows[0]);
}));

router.post('/invites/:code/accept', requireUser, json, wrap(async (req, res) => {
  const fid = await tx((c) => useInvite(c, str(req.params.code, 80), req.user.id, str(req.body.relationship, 40)));
  res.json({ familyId: fid, families: await familiesFor(req.user.id) });
}));

// ---------- Sync ----------
const babyOut = (b) => ({
  id: b.id, name: b.name, birth: b.birth, sex: b.sex, avatarId: b.avatar_id, deleted: b.deleted, updatedAt: b.updated_at
});
const entryOut = (e) => ({
  id: e.id, babyId: e.baby_id, type: e.type, t: e.t, data: e.data, deleted: e.deleted,
  by: e.updated_by || e.created_by, updatedAt: e.updated_at
});

// Returns everything changed since `since`. The cursor overlaps by a few seconds
// so writes committing concurrently with this read are never skipped (clients de-dupe by id).
router.get('/families/:fid/sync', requireUser, familyAccess(), wrap(async (req, res) => {
  const since = req.query.since && !isNaN(Date.parse(req.query.since)) ? new Date(req.query.since) : new Date(0);
  const now = await query(`SELECT clock_timestamp() - interval '5 seconds' AS cursor`);
  const babies = await query('SELECT * FROM babies WHERE family_id = $1 AND updated_at >= $2 ORDER BY updated_at', [req.fid, since]);
  const entries = await query('SELECT * FROM entries WHERE family_id = $1 AND updated_at >= $2 ORDER BY updated_at LIMIT 5000', [req.fid, since]);
  const members = await query(
    `SELECT u.id, u.name, m.role, m.relationship FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.family_id = $1`, [req.fid]);
  const more = entries.rows.length === 5000;
  res.json({
    babies: babies.rows.map(babyOut),
    entries: entries.rows.map(entryOut),
    members: members.rows,
    role: req.role,
    cursor: more ? entries.rows[entries.rows.length - 1].updated_at : now.rows[0].cursor,
    more
  });
}));

router.put('/families/:fid/babies/:id', requireUser, familyAccess('editor'), json, wrap(async (req, res) => {
  const id = uuid(req.params.id, 'baby');
  const b = req.body;
  const name = str(b.name, 60);
  if (!name) throw new HttpError(400, 'Baby name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.birth))) throw new HttpError(400, 'Birthday is required');
  const sex = ['boy', 'girl'].includes(b.sex) ? b.sex : '';
  const avatar = b.avatarId ? uuid(b.avatarId, 'photo') : null;
  const { rows } = await query(
    `INSERT INTO babies (id, family_id, name, birth, sex, avatar_id, deleted, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET name = $3, birth = $4, sex = $5, avatar_id = $6, deleted = $7, updated_by = $8, updated_at = clock_timestamp()
     WHERE babies.family_id = $2
     RETURNING *`, [id, req.fid, name, b.birth, sex, avatar, !!b.deleted, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Baby not found');
  res.json(babyOut(rows[0]));
}));

async function upsertEntry(client, req, id, b) {
  const type = String(b.type);
  if (!ENTRY_TYPES.has(type)) throw new HttpError(400, 'Unknown entry type');
  const babyId = uuid(b.babyId, 'baby');
  const t = new Date(b.t);
  if (isNaN(t)) throw new HttpError(400, 'Invalid time');
  const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : {};
  if (JSON.stringify(data).length > 20_000) throw new HttpError(400, 'Entry is too large');
  const baby = await client.query('SELECT 1 FROM babies WHERE id = $1 AND family_id = $2', [babyId, req.fid]);
  if (!baby.rows[0]) throw new HttpError(400, 'Unknown baby');
  const { rows } = await client.query(
    `INSERT INTO entries (id, family_id, baby_id, type, t, data, deleted, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     ON CONFLICT (id) DO UPDATE SET baby_id = $3, type = $4, t = $5, data = $6, deleted = $7, updated_by = $8, updated_at = clock_timestamp()
     WHERE entries.family_id = $2
     RETURNING *`, [id, req.fid, babyId, type, t, data, !!b.deleted, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'Entry not found');
  return rows[0];
}

router.put('/families/:fid/entries/:id', requireUser, familyAccess('editor'), json, wrap(async (req, res) => {
  const row = await tx((c) => upsertEntry(c, req, uuid(req.params.id), req.body));
  res.json(entryOut(row));
}));

// Batch upsert (offline catch-up, importing an old log). Invalid items are skipped, not fatal.
router.put('/families/:fid/entries', requireUser, familyAccess('editor'), express.json({ limit: '2mb' }), wrap(async (req, res) => {
  const list = Array.isArray(req.body.entries) ? req.body.entries : [];
  if (list.length > 500) throw new HttpError(413, 'Send at most 500 entries at a time');
  const out = [], rejected = [];
  await tx(async (c) => {
    for (const item of list) {
      await c.query('SAVEPOINT item');
      try {
        out.push(entryOut(await upsertEntry(c, req, uuid(item.id), item)));
        await c.query('RELEASE SAVEPOINT item');
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT item');
        if (!(e instanceof HttpError)) throw e;
        rejected.push({ id: item && item.id, error: e.message });
      }
    }
  });
  res.json({ entries: out, rejected });
}));

// ---------- Photos ----------
function decodeImage(b64, max) {
  const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(b64 || ''));
  if (!m) throw new HttpError(400, 'Photo must be a JPEG, PNG or WebP image');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > max) throw new HttpError(413, 'Photo is too large');
  return { mime: m[1], buf };
}

router.put('/families/:fid/photos/:id', requireUser, familyAccess('editor'), bigJson, wrap(async (req, res) => {
  const id = uuid(req.params.id, 'photo');
  const full = decodeImage(req.body.full, 8 * 1024 * 1024);
  const thumb = decodeImage(req.body.thumb, 1024 * 1024);
  const row = await tx(async (c) => {
    const e = await upsertEntry(c, req, id, { ...req.body.entry, type: 'photo' });
    await c.query(
      `INSERT INTO photos (entry_id, family_id, mime, full_bytes, thumb_bytes) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (entry_id) DO UPDATE SET mime = $3, full_bytes = $4, thumb_bytes = $5`,
      [id, req.fid, full.mime, full.buf, thumb.buf]);
    return e;
  });
  res.json(entryOut(row));
}));

router.get('/families/:fid/photos/:id', requireUser, familyAccess(), wrap(async (req, res) => {
  const id = uuid(req.params.id, 'photo');
  const col = req.query.size === 'thumb' ? 'thumb_bytes' : 'full_bytes';
  const { rows } = await query(`SELECT mime, ${col} AS bytes FROM photos WHERE entry_id = $1 AND family_id = $2`, [id, req.fid]);
  if (!rows[0]) throw new HttpError(404, 'Photo not found');
  res.set('Content-Type', rows[0].mime);
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(rows[0].bytes);
}));

// ---------- Push ----------
router.get('/push/key', wrap(async (_req, res) => res.json({ key: await push.publicKey() })));

router.post('/push/subscribe', requireUser, json, wrap(async (req, res) => {
  const s = req.body || {};
  if (!s.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) throw new HttpError(400, 'Invalid subscription');
  await query(
    `INSERT INTO push_subscriptions (endpoint, user_id, keys) VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, keys = $3`, [s.endpoint, req.user.id, { p256dh: s.keys.p256dh, auth: s.keys.auth }]);
  res.json({ ok: true });
}));

router.post('/push/unsubscribe', requireUser, json, wrap(async (req, res) => {
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [String(req.body.endpoint || ''), req.user.id]);
  res.json({ ok: true });
}));

router.post('/push/test', requireUser, wrap(async (req, res) => {
  const sent = await push.sendToUser(req.user.id, { title: 'My Little Pomodoro', body: 'Notifications are on 🍅', url: '/' });
  res.json({ sent });
}));

module.exports = { router, ENTRY_TYPES };
