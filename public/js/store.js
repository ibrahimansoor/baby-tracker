// Offline-first store + sync engine.
// Every change is written to IndexedDB immediately, queued in the outbox, and pushed to the
// server when online. Other family members' changes are pulled on an interval.
import { idb } from './idb.js';
import * as api from './api.js';

const listeners = new Set();

export const store = {
  me: null,             // { id, name, email, timezone }
  families: [],         // [{ id, name, role, relationship }]
  familyId: null,
  role: 'viewer',
  members: [],
  babies: new Map(),
  entries: new Map(),
  babyId: null,
  online: navigator.onLine,
  pending: 0,
  lastSync: 0,
  syncError: null
};

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let emitQueued = false;
function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => { emitQueued = false; listeners.forEach((fn) => fn()); });
}

export const canEdit = () => store.role === 'owner' || store.role === 'editor';
export const isAdmin = () => store.role === 'owner';
export const family = () => store.families.find((f) => f.id === store.familyId) || null;
export const baby = () => store.babies.get(store.babyId) || null;
export const babies = () => [...store.babies.values()].filter((b) => !b.deleted).sort((a, b) => a.birth.localeCompare(b.birth));
export const memberName = (id) => { const m = store.members.find((x) => x.id === id); return m ? m.name : ''; };
/** Live entries for the current baby, newest first */
export function entries(pred) {
  const out = [];
  for (const e of store.entries.values()) if (!e.deleted && e.babyId === store.babyId && (!pred || pred(e))) out.push(e);
  return out.sort((a, b) => b.t - a.t);
}

const fromServerEntry = (e, familyId) => ({ ...e, t: new Date(e.t).getTime(), familyId, pending: false });
const fromServerBaby = (b, familyId) => ({ ...b, familyId, pending: false });

// ---------- Session ----------
export async function boot() {
  const cached = await idb.get('kv', 'me').catch(() => null);
  try {
    const me = await api.get('/me');
    await setMe(me);
  } catch (e) {
    if (e.status === 401) { store.me = null; return 'signed-out'; }
    if (!cached) return e.offline ? 'offline-new' : 'signed-out';
    store.me = cached.user; store.families = cached.families; store.online = false;
  }
  const saved = await idb.get('kv', 'familyId').catch(() => null);
  const fid = store.families.some((f) => f.id === saved) ? saved : store.families[0] && store.families[0].id;
  if (fid) await setFamily(fid);
  return 'ready';
}

export async function setMe(me) {
  store.me = me.user;
  store.families = me.families;
  await idb.put('kv', me, 'me');
  emit();
}

export async function signOut() {
  await api.post('/auth/logout').catch(() => {});
  await idb.clearAll();
  if (window.caches) await caches.delete('pomodoro-photos-v1').catch(() => {});
  Object.assign(store, { me: null, families: [], familyId: null, members: [], babyId: null, pending: 0 });
  store.babies = new Map(); store.entries = new Map();
  emit();
}

export async function setFamily(fid) {
  store.familyId = fid;
  const f = family();
  store.role = f ? f.role : 'viewer';
  await idb.put('kv', fid, 'familyId');
  store.babies = new Map((await idb.byFamily('babies', fid)).map((b) => [b.id, b]));
  store.entries = new Map((await idb.byFamily('entries', fid)).map((e) => [e.id, e]));
  const meta = await idb.get('kv', `meta:${fid}`);
  if (meta) { store.members = meta.members; store.role = meta.role; }
  await pickBaby();
  await countPending();
  emit();
  sync();
}

async function pickBaby() {
  const saved = await idb.get('kv', `baby:${store.familyId}`).catch(() => null);
  const list = babies();
  store.babyId = list.some((b) => b.id === saved) ? saved : list.length ? list[list.length - 1].id : null;
}
export async function setBaby(id) {
  store.babyId = id;
  await idb.put('kv', id, `baby:${store.familyId}`);
  emit();
}

// ---------- Local writes ----------
let rev = 0;
export async function saveEntry(e) {
  if (!canEdit()) throw new Error('You have view-only access to this family');
  const rec = { ...e, familyId: store.familyId, babyId: e.babyId || store.babyId, pending: true, rev: ++rev, by: store.me.id };
  store.entries.set(rec.id, rec);
  await idb.put('entries', rec);
  await idb.put('outbox', { kind: 'entry', id: rec.id, familyId: rec.familyId });
  await countPending();
  emit();
  flush();
  return rec;
}
export const deleteEntry = (e) => saveEntry({ ...e, deleted: true });

export async function savePhoto(e, full, thumb) {
  if (!canEdit()) throw new Error('You have view-only access to this family');
  const rec = { ...e, type: 'photo', familyId: store.familyId, babyId: e.babyId || store.babyId, pending: true, rev: ++rev, by: store.me.id, localThumb: thumb };
  store.entries.set(rec.id, rec);
  await idb.put('entries', rec);
  await idb.put('outbox', { kind: 'photo', id: rec.id, familyId: rec.familyId, full, thumb });
  await countPending();
  emit();
  flush();
  return rec;
}

export async function importEntries(list) {
  const recs = list.map((e) => ({ ...e, familyId: store.familyId, pending: true, rev: ++rev, by: store.me.id }));
  recs.forEach((r) => store.entries.set(r.id, r));
  await idb.putMany('entries', recs);
  await idb.putMany('outbox', recs.map((r) => ({ kind: 'entry', id: r.id, familyId: r.familyId })));
  await countPending();
  emit();
  return flush();
}

export async function saveBaby(b) {
  if (!canEdit()) throw new Error('You have view-only access to this family');
  const rec = { ...b, familyId: store.familyId, pending: true, rev: ++rev };
  store.babies.set(rec.id, rec);
  await idb.put('babies', rec);
  await idb.put('outbox', { kind: 'baby', id: rec.id, familyId: rec.familyId });
  if (!store.babyId || (b.deleted && store.babyId === b.id)) await pickBaby();
  await countPending();
  emit();
  flush();
  return rec;
}

async function countPending() {
  store.pending = (await idb.all('outbox')).length;
}

// ---------- Push (outbox → server) ----------
let flushing = null;
export function flush() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}
async function doFlush() {
  const all = await idb.all('outbox');
  // Collapse to the latest op per record (photos keep their own op — it carries the image).
  const latest = new Map();
  for (const op of all) {
    const key = `${op.kind === 'baby' ? 'b' : 'e'}:${op.id}`;
    const prev = latest.get(key);
    if (prev && prev.kind === 'photo' && op.kind === 'entry') { op.kind = 'photo'; op.full = prev.full; op.thumb = prev.thumb; }
    latest.set(key, op);
  }
  const keep = new Set([...latest.values()].map((o) => o.seq));
  for (const op of all) if (!keep.has(op.seq)) await idb.del('outbox', op.seq);
  const ops = all.filter((o) => keep.has(o.seq));

  try {
    // Babies first (entries reference them), then photos one by one, then entries in batches.
    for (const op of ops.filter((o) => o.kind === 'baby')) {
      await attempt(op, async () => {
        const local = await idb.get('babies', op.id);
        if (!local) return;
        const out = await api.put(`/families/${op.familyId}/babies/${op.id}`, { name: local.name, birth: local.birth, sex: local.sex || '', avatarId: local.avatarId || null, deleted: !!local.deleted });
        await settle('babies', fromServerBaby(out, op.familyId), local.rev);
      });
    }
    for (const op of ops.filter((o) => o.kind === 'photo')) {
      await attempt(op, async () => {
        const local = await idb.get('entries', op.id);
        if (!local) return;
        const out = await api.put(`/families/${op.familyId}/photos/${op.id}`, { full: op.full, thumb: op.thumb, entry: entryBody(local) });
        await settle('entries', fromServerEntry(out, op.familyId), local.rev);
      });
    }
    const entryOps = ops.filter((o) => o.kind === 'entry');
    for (let i = 0; i < entryOps.length; i += 200) {
      const chunk = entryOps.slice(i, i + 200);
      const byFamily = new Map();
      for (const op of chunk) {
        const local = await idb.get('entries', op.id);
        if (!local) { await idb.del('outbox', op.seq); continue; }
        if (!byFamily.has(op.familyId)) byFamily.set(op.familyId, []);
        byFamily.get(op.familyId).push({ op, local });
      }
      for (const [fid, items] of byFamily) {
        try {
          const res = await api.put(`/families/${fid}/entries`, { entries: items.map(({ op, local }) => ({ id: op.id, ...entryBody(local) })) });
          const revs = new Map(items.map(({ local }) => [local.id, local.rev]));
          for (const e of res.entries) await settle('entries', fromServerEntry(e, fid), revs.get(e.id));
          if (res.rejected.length) { store.syncError = res.rejected[0].error; console.warn('Sync rejected', res.rejected); }
          for (const { op } of items) await idb.del('outbox', op.seq);
          store.online = true;
        } catch (e) { if (!(await handleFailure(e, items.map((x) => x.op)))) throw STOP; }
      }
    }
  } catch (e) { if (e !== STOP) throw e; }
  await countPending();
  emit();
}

const STOP = Symbol('stop');
const entryBody = (local) => ({ babyId: local.babyId, type: local.type, t: new Date(local.t).toISOString(), data: local.data || {}, deleted: !!local.deleted });

async function attempt(op, fn) {
  try {
    await fn();
    await idb.del('outbox', op.seq);
    store.online = true;
  } catch (e) {
    if (!(await handleFailure(e, [op]))) throw STOP;
  }
}
// Returns true to continue with other ops, false to stop and retry later.
async function handleFailure(e, ops) {
  if (e.offline || e.status >= 500 || e.status === 429) { store.online = !e.offline; return false; }
  if (e.status === 401) { store.syncError = 'signed-out'; return false; }
  // Rejected for good (e.g. permission changed): drop so the queue isn't stuck.
  console.warn('Sync rejected', ops, e.message);
  store.syncError = e.message;
  for (const op of ops) await idb.del('outbox', op.seq);
  return true;
}

// Replace the local record with the server's copy unless it was edited again meanwhile.
async function settle(storeName, serverRec, sentRev) {
  const map = storeName === 'babies' ? store.babies : store.entries;
  const current = map.get(serverRec.id);
  if (current && current.rev !== sentRev) return;
  map.set(serverRec.id, serverRec);
  await idb.put(storeName, serverRec);
}

// ---------- Pull (server → phone) ----------
let pulling = null;
export function pull() {
  if (!pulling) pulling = doPull().finally(() => { pulling = null; });
  return pulling;
}
async function doPull() {
  const fid = store.familyId;
  if (!fid) return;
  const pendingIds = new Set((await idb.all('outbox')).map((o) => o.id));
  let cursor = await idb.get('kv', `cursor:${fid}`);
  for (let guard = 0; guard < 50; guard++) {
    const res = await api.get(`/families/${fid}/sync${cursor ? `?since=${encodeURIComponent(cursor)}` : ''}`);
    if (store.familyId !== fid) return; // switched family mid-flight
    const babiesIn = res.babies.filter((b) => !pendingIds.has(b.id)).map((b) => fromServerBaby(b, fid));
    const entriesIn = res.entries.filter((e) => !pendingIds.has(e.id)).map((e) => {
      const prev = store.entries.get(e.id);
      return prev && prev.updatedAt === e.updatedAt ? null : fromServerEntry(e, fid);
    }).filter(Boolean);
    babiesIn.forEach((b) => store.babies.set(b.id, b));
    entriesIn.forEach((e) => store.entries.set(e.id, e));
    await idb.putMany('babies', babiesIn);
    await idb.putMany('entries', entriesIn);
    store.members = res.members;
    store.role = res.role;
    const f = family(); if (f) f.role = res.role;
    await idb.put('kv', { members: res.members, role: res.role }, `meta:${fid}`);
    cursor = res.cursor;
    await idb.put('kv', cursor, `cursor:${fid}`);
    if (!store.babyId || !store.babies.has(store.babyId) || store.babies.get(store.babyId).deleted) await pickBaby();
    if (babiesIn.length || entriesIn.length) emit();
    if (!res.more) break;
  }
  store.online = true;
  store.lastSync = Date.now();
  emit();
}

export async function sync() {
  if (!store.familyId) return;
  try {
    await flush();
    await pull();
  } catch (e) {
    if (e.offline) store.online = false;
    else if (e.status === 401) store.syncError = 'signed-out';
    else if (e.status === 404) { // removed from this family
      await refreshMe();
    }
    emit();
  }
}

export async function refreshMe() {
  const me = await api.get('/me');
  await setMe(me);
  if (!store.families.some((f) => f.id === store.familyId)) {
    const next = store.families[0];
    if (next) await setFamily(next.id);
  } else {
    const f = family(); store.role = f.role;
  }
  emit();
}

// Background sync: every 20s while visible, on focus, and when the connection returns.
let timer;
export function startSync() {
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) sync(); }, 20_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('online', () => { store.online = true; sync(); });
  window.addEventListener('offline', () => { store.online = false; emit(); });
}

export const photoUrl = (e, size = 'thumb') => (e.pending && e.localThumb) ? e.localThumb : `/api/families/${e.familyId}/photos/${e.id}?size=${size}`;
