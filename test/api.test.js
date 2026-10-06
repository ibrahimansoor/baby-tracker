'use strict';
// Integration tests against a real Postgres. Uses TEST_DATABASE_URL (a throwaway database —
// its public schema is dropped and recreated).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://pomo:pomo@localhost:5432/pomodoro_test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { pool, migrate } = require('../server/db');
const { createApp } = require('../server/index');
const { celebration } = require('../server/reminders');

let server, base;

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { server.close(); await pool.end(); });

// Minimal cookie-keeping client
function client() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'pomodoro', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return {
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b || {}), put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b), del: (p, b) => call('DELETE', p, b)
  };
}

const PNG = 'data:image/png;base64,' + Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex').toString('base64');

let mom, dad, nana, fid, babyId;

test('signup creates a user, a family and a session', async () => {
  mom = client();
  const r = await mom.post('/auth/signup', { name: 'Cristina', email: 'Cris@Example.com', password: 'supersecret', timezone: 'America/New_York', relationship: 'Mom' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.email, 'cris@example.com');
  assert.equal(r.data.families.length, 1);
  assert.equal(r.data.families[0].role, 'owner');
  fid = r.data.families[0].id;
  const me = await mom.get('/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.timezone, 'America/New_York');
});

test('duplicate email, weak password and bad login are rejected', async () => {
  const c = client();
  assert.equal((await c.post('/auth/signup', { name: 'X', email: 'cris@example.com', password: 'supersecret' })).status, 409);
  assert.equal((await c.post('/auth/signup', { name: 'X', email: 'x@example.com', password: 'short' })).status, 400);
  assert.equal((await c.post('/auth/login', { email: 'cris@example.com', password: 'wrongwrong' })).status, 401);
  assert.equal((await c.get('/me')).status, 401);
});

test('mutations without the CSRF header are refused', async () => {
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('owner adds a baby and entries; birthday is a plain date', async () => {
  babyId = crypto.randomUUID();
  const b = await mom.put(`/families/${fid}/babies/${babyId}`, { name: 'Nora', birth: '2026-09-27', sex: 'girl' });
  assert.equal(b.status, 200);
  assert.equal(b.data.birth, '2026-09-27');
  const e = await mom.put(`/families/${fid}/entries/${crypto.randomUUID()}`, { babyId, type: 'bottle', t: new Date().toISOString(), data: { ml: 90, milk: 'formula' } });
  assert.equal(e.status, 200);
  assert.equal(e.data.data.ml, 90);
  assert.equal((await mom.put(`/families/${fid}/entries/${crypto.randomUUID()}`, { babyId, type: 'hack', t: new Date().toISOString() })).status, 400);
});

test('invite link lets dad join as editor; nana joins view-only', async () => {
  const inv = await mom.post(`/families/${fid}/invites`, { role: 'editor' });
  assert.equal(inv.status, 201);
  assert.match(inv.data.url, /#invite=/);
  const preview = await client().get(`/invites/${inv.data.code}`);
  assert.equal(preview.data.inviter, 'Cristina');
  dad = client();
  const s = await dad.post('/auth/signup', { name: 'Ibrahim', email: 'ib@example.com', password: 'supersecret', invite: inv.data.code, relationship: 'Dad' });
  assert.equal(s.status, 201);
  assert.equal(s.data.families[0].id, fid);
  assert.equal(s.data.families[0].role, 'editor');
  // used invite cannot be reused
  assert.equal((await client().post('/auth/signup', { name: 'Z', email: 'z@example.com', password: 'supersecret', invite: inv.data.code })).status, 400);

  const vinv = await mom.post(`/families/${fid}/invites`, { role: 'viewer' });
  nana = client();
  await nana.post('/auth/signup', { name: 'Nana', email: 'nana@example.com', password: 'supersecret' });
  const acc = await nana.post(`/invites/${vinv.data.code}/accept`, { relationship: 'Grandma' });
  assert.equal(acc.status, 200);
  assert.equal(acc.data.families.length, 2); // her own + ours
});

test('sync returns shared data to every member, with deltas', async () => {
  const first = await dad.get(`/families/${fid}/sync`);
  assert.equal(first.status, 200);
  assert.equal(first.data.babies[0].name, 'Nora');
  assert.equal(first.data.entries.length, 1);
  assert.equal(first.data.members.length, 3);
  const id = crypto.randomUUID();
  await dad.put(`/families/${fid}/entries/${id}`, { babyId, type: 'diaper', t: new Date().toISOString(), data: { pee: true, poop: true } });
  const delta = await mom.get(`/families/${fid}/sync?since=${encodeURIComponent(first.data.cursor)}`);
  assert.ok(delta.data.entries.some((e) => e.id === id && e.data.poop === true));
  // soft delete propagates
  await mom.put(`/families/${fid}/entries/${id}`, { babyId, type: 'diaper', t: new Date().toISOString(), data: {}, deleted: true });
  const d2 = await dad.get(`/families/${fid}/sync?since=${encodeURIComponent(first.data.cursor)}`);
  assert.ok(d2.data.entries.find((e) => e.id === id).deleted);
});

test('view-only members can read but not write', async () => {
  assert.equal((await nana.get(`/families/${fid}/sync`)).status, 200);
  const w = await nana.put(`/families/${fid}/entries/${crypto.randomUUID()}`, { babyId, type: 'note', t: new Date().toISOString(), data: { text: 'hi' } });
  assert.equal(w.status, 403);
  assert.equal((await nana.post(`/families/${fid}/invites`, { role: 'owner' })).status, 403);
});

test('outsiders cannot see or touch a family', async () => {
  const stranger = client();
  await stranger.post('/auth/signup', { name: 'Stranger', email: 's@example.com', password: 'supersecret' });
  assert.equal((await stranger.get(`/families/${fid}/sync`)).status, 404);
  assert.equal((await stranger.put(`/families/${fid}/babies/${babyId}`, { name: 'X', birth: '2020-01-01' })).status, 404);
  // can't hijack an entry id from another family through their own family either
  const sf = (await stranger.get('/me')).data.families[0].id;
  const sb = crypto.randomUUID();
  await stranger.put(`/families/${sf}/babies/${sb}`, { name: 'S', birth: '2024-01-01' });
  const firstEntry = (await mom.get(`/families/${fid}/sync`)).data.entries[0];
  const hij = await stranger.put(`/families/${sf}/entries/${firstEntry.id}`, { babyId: sb, type: 'note', t: new Date().toISOString(), data: {} });
  assert.equal(hij.status, 404);
  assert.equal((await stranger.put(`/families/${sf}/babies/${babyId}`, { name: 'Mine', birth: '2024-01-01' })).status, 404);
});

test('bulk upsert saves valid entries and skips bad ones', async () => {
  const good = Array.from({ length: 3 }, (_, i) => ({ id: crypto.randomUUID(), babyId, type: 'diaper', t: new Date(Date.now() - i * 3600e3).toISOString(), data: { pee: true } }));
  const bad = { id: crypto.randomUUID(), babyId, type: 'nope', t: new Date().toISOString() };
  const r = await mom.put(`/families/${fid}/entries`, { entries: [...good, bad] });
  assert.equal(r.status, 200);
  assert.equal(r.data.entries.length, 3);
  assert.equal(r.data.rejected.length, 1);
  assert.equal((await nana.put(`/families/${fid}/entries`, { entries: good })).status, 403);
});

test('photos upload, download and are family-private', async () => {
  const id = crypto.randomUUID();
  const up = await mom.put(`/families/${fid}/photos/${id}`, { full: PNG, thumb: PNG, entry: { babyId, t: new Date().toISOString(), data: { caption: 'First smile' } } });
  assert.equal(up.status, 200);
  assert.equal(up.data.type, 'photo');
  const res = await fetch(`${base}/families/${fid}/photos/${id}?size=thumb`, { headers: { Cookie: '' } });
  assert.equal(res.status, 401);
  const sync = await nana.get(`/families/${fid}/sync`);
  assert.ok(sync.data.entries.some((e) => e.id === id && e.data.caption === 'First smile'));
  assert.equal((await nana.put(`/families/${fid}/photos/${crypto.randomUUID()}`, { full: PNG, thumb: PNG, entry: { babyId, t: new Date().toISOString() } })).status, 403);
  assert.equal((await mom.put(`/families/${fid}/photos/${crypto.randomUUID()}`, { full: 'data:text/html;base64,PGI+', thumb: PNG, entry: { babyId, t: new Date().toISOString() } })).status, 400);
});

test('roles: owner promotes, cannot remove the last admin', async () => {
  const dadId = (await dad.get('/me')).data.user.id;
  const momId = (await mom.get('/me')).data.user.id;
  assert.equal((await dad.patch(`/families/${fid}/members/${momId}`, { role: 'viewer' })).status, 403);
  assert.equal((await mom.patch(`/families/${fid}/members/${momId}`, { role: 'viewer' })).status, 400);
  assert.equal((await mom.patch(`/families/${fid}/members/${dadId}`, { role: 'owner' })).status, 200);
  const m = await dad.get(`/families/${fid}/members`);
  assert.equal(m.data.role, 'owner');
  assert.ok(Array.isArray(m.data.invites));
});

test('password reset flow and password change', async () => {
  const logs = [];
  const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  try { assert.equal((await client().post('/auth/forgot', { email: 'ib@example.com' })).status, 200); }
  finally { console.log = orig; }
  const token = /#reset=([\w-]+)/.exec(logs.join('\n'))[1];
  const c = client();
  assert.equal((await c.post('/auth/reset', { token, password: 'brandnewpass' })).status, 200);
  assert.equal((await c.post('/auth/reset', { token, password: 'anotherpass1' })).status, 400); // single use
  assert.equal((await client().post('/auth/login', { email: 'ib@example.com', password: 'brandnewpass' })).status, 200);
  assert.equal((await dad.get('/me')).status, 401); // old sessions revoked
  assert.equal((await c.patch('/me', { currentPassword: 'nope', newPassword: 'whatever123' })).status, 400);
  assert.equal((await c.patch('/me', { currentPassword: 'brandnewpass', newPassword: 'whatever123', name: 'Ibrahim M' })).data.user.name, 'Ibrahim M');
});

test('reminder celebrations', () => {
  assert.equal(celebration('Nora', '2025-10-06', '2026-10-06').kind, 'birthday');
  assert.match(celebration('Nora', '2025-10-06', '2026-10-06').title, /1st birthday/);
  assert.equal(celebration('Nora', '2025-10-07', '2026-10-06').kind, 'birthday-eve');
  assert.equal(celebration('Nora', '2026-07-06', '2026-10-06').kind, 'month');
  assert.match(celebration('Nora', '2026-07-06', '2026-10-06').title, /3 months/);
  assert.equal(celebration('Nora', '2026-09-22', '2026-10-06').kind, 'week');
  assert.equal(celebration('Nora', '2026-09-23', '2026-10-06'), null);
  // born on the 31st → celebrated on the last day of shorter months
  assert.equal(celebration('Nora', '2026-08-31', '2026-09-30').kind, 'month');
});

test('deleting an account hands admin to the next member', async () => {
  const momId = (await mom.get('/me')).data.user.id;
  assert.equal((await mom.del('/me', { password: 'supersecret' })).status, 200);
  const { rows } = await pool.query('SELECT 1 FROM users WHERE id = $1', [momId]);
  assert.equal(rows.length, 0);
  const fam = await nana.get(`/families/${fid}/sync`);
  assert.equal(fam.status, 200);
  assert.equal(fam.data.members.length, 2);
});
