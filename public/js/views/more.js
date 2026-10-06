// More: babies, family & invites, reminders, backup, appearance, account.
import { $, esc, icon, uuid, ageText, toDateInput, fmtAgo, toLocalInput, download, shareOrDownload, ics, parseDay } from '../util.js';
import * as api from '../api.js';
import { store, baby, babies, canEdit, isAdmin, family, saveBaby, setBaby, setFamily, refreshMe, signOut, importEntries, setMe, entries as liveEntries } from '../store.js';
import { prefs, setPref } from '../prefs.js';
import { registerActions, openSheet, closeSheet, toast, confirmBox, avatar, segmented, segValue, emptyState } from '../ui.js';
import { ROLE_LABEL, ROLE_HINT, RELATIONSHIPS } from './auth.js';
import { babyAvatarUrl } from './today.js';

const fam = { members: [], invites: [], loadedFor: null, loading: false };
const rerender = () => window.dispatchEvent(new Event('pomo:render'));

async function loadMembers(force) {
  if (fam.loading || (!force && fam.loadedFor === store.familyId)) return;
  fam.loading = true;
  try {
    const r = await api.get(`/families/${store.familyId}/members`);
    Object.assign(fam, { members: r.members, invites: r.invites, loadedFor: store.familyId });
    rerender();
  } catch { /* offline: fall back to synced member list */ } finally { fam.loading = false; }
}

// ---------- Push notifications ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let pushState = 'unknown';
async function refreshPushState() {
  if (!pushSupported()) { pushState = isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'; return; }
  if (Notification.permission === 'denied') { pushState = 'denied'; return; }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  pushState = sub ? 'on' : 'off';
}
function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications were not allowed'); await refreshPushState(); return; }
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api.get('/push/key');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
  await api.post('/push/subscribe', sub.toJSON());
  await refreshPushState();
  toast('Reminders are on 🔔');
}
async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  await refreshPushState();
  toast('Reminders are off');
}

function pushRow() {
  const states = {
    on: ['Reminders are on', 'Birthdays, monthly milestones & checkups', '<button class="chip" data-act="push-off">Turn off</button>'],
    off: ['Birthday & checkup reminders', 'Get a notification on this phone', '<button class="chip on" data-act="push-on">Turn on</button>'],
    denied: ['Notifications are blocked', 'Allow them for this site in your phone settings', ''],
    'ios-install': ['Reminders on iPhone', 'First tap Share → Add to Home Screen, then open the app from your home screen', ''],
    unsupported: ['Reminders not available', 'This browser can’t receive notifications — use the calendar option below', ''],
    unknown: ['Reminders', 'Checking…', '']
  };
  const [t, d, btn] = states[pushState];
  return `<div class="set-row"><div><div class="t">${icon('i-bell')} ${t}</div><div class="d">${d}</div></div>${btn}</div>`;
}

// ---------- Render ----------
export function renderMore() {
  loadMembers();
  if (pushState === 'unknown') refreshPushState().then(rerender);
  const f = family();
  const admin = isAdmin(), edit = canEdit();
  const members = fam.loadedFor === store.familyId ? fam.members : store.members;
  const synced = store.pending === 0;
  return `
    <div class="page-title"><h1>More</h1></div>

    <div class="sync-card ${synced ? 'ok' : ''} ${store.online ? '' : 'offline'}">
      <span class="ico">${icon(store.online ? 'i-cloud' : 'i-cloud-off')}</span>
      <div><b>${!store.online ? 'Offline — saved on this phone' : synced ? 'Everything is backed up' : `Syncing ${store.pending} change${store.pending === 1 ? '' : 's'}…`}</b>
      <div class="small muted">${store.online ? `Saved to your family’s secure cloud${store.lastSync ? ` · checked ${fmtAgo(store.lastSync)}` : ''}` : `${store.pending} change${store.pending === 1 ? '' : 's'} will upload when you’re back online`}</div></div>
    </div>

    <div class="section-title"><h2>${babies().length > 1 ? 'Babies' : 'Baby'}</h2>${edit ? '<button class="link" data-act="add-baby">+ Add baby</button>' : ''}</div>
    <div class="card list-card">
      ${babies().map((b) => `<button class="list-row" data-act="${edit ? 'edit-baby' : 'switch-baby'}" data-id="${b.id}">
        ${avatar({ name: b.name, url: babyAvatarUrl(b), size: 46 })}
        <div class="lr-main"><b>${esc(b.name)}</b><span class="small muted">${ageText(b.birth)} · born ${new Date(parseDay(b.birth)).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
        ${b.id === store.babyId ? '<span class="tag">Showing</span>' : ''}
        ${edit ? `<span class="chev">${icon('i-chevron')}</span>` : ''}
      </button>`).join('')}
    </div>

    <div class="section-title"><h2>Family</h2>${admin ? '<button class="link" data-act="invite">+ Invite</button>' : ''}</div>
    <div class="card list-card">
      <div class="list-row static">
        <span class="fam-ico">${icon('i-family')}</span>
        <div class="lr-main"><b>${esc(f ? f.name : 'Family')}</b><span class="small muted">You are ${ROLE_LABEL[store.role].toLowerCase()}${store.families.length > 1 ? ` · ${store.families.length} families` : ''}</span></div>
        ${admin ? '<button class="chip" data-act="rename-family">Rename</button>' : ''}
      </div>
      ${members.map((m) => `<button class="list-row" data-act="member" data-id="${m.id}">
        ${avatar({ name: m.name, size: 40 })}
        <div class="lr-main"><b>${esc(m.name)}${m.id === store.me.id ? ' <span class="muted">(you)</span>' : ''}</b><span class="small muted">${esc(m.relationship || '')}${m.relationship ? ' · ' : ''}${ROLE_LABEL[m.role]}</span></div>
        <span class="chev">${icon('i-chevron')}</span>
      </button>`).join('')}
      ${admin && fam.invites.length ? fam.invites.map((i) => `<div class="list-row static">
        <span class="fam-ico pending">${icon('i-mail')}</span>
        <div class="lr-main"><b>Invite link · ${ROLE_LABEL[i.role]}</b><span class="small muted">Waiting to be used</span></div>
        <button class="chip" data-act="revoke-invite" data-code="${esc(i.code)}">Revoke</button>
      </div>`).join('') : ''}
      ${admin ? `<button class="list-row add" data-act="invite"><span class="fam-ico">${icon('i-plus')}</span><div class="lr-main"><b>Invite family member</b><span class="small muted">Grandparents, nanny, partner — you choose what they can do</span></div></button>` : ''}
    </div>
    ${store.families.length > 1 ? `<div class="chips" style="margin-top:10px">${store.families.map((x) => `<button class="chip ${x.id === store.familyId ? 'on' : ''}" data-act="switch-family" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}

    <div class="section-title"><h2>Reminders</h2></div>
    <div class="card set-list">
      ${pushRow()}
      <div class="set-row"><div><div class="t">${icon('i-calendar')} Birthday in my calendar</div><div class="d">Adds a yearly event — syncs with iCloud or Google Calendar</div></div><button class="chip" data-act="birthday-ics">Add</button></div>
      ${pushState === 'on' ? '<div class="set-row"><div><div class="t">Send a test</div><div class="d">Check notifications reach this phone</div></div><button class="chip" data-act="push-test">Test</button></div>' : ''}
    </div>

    <div class="section-title"><h2>Backup & export</h2></div>
    <div class="card set-list">
      <div class="set-row"><div><div class="t">${icon('i-cloud')} Save a copy to Files / iCloud Drive</div><div class="d">Everything except photos, as a backup file</div></div><button class="chip" data-act="backup-share">Save</button></div>
      <div class="set-row"><div><div class="t">Spreadsheet for the pediatrician</div><div class="d">Every entry as CSV</div></div><button class="chip" data-act="export-csv">CSV</button></div>
      ${edit ? `<div class="set-row"><div><div class="t">Restore from a backup</div><div class="d">Merges a backup file into this family</div></div><label class="chip" style="cursor:pointer">Choose<input type="file" id="restoreFile" accept="application/json,.json" hidden></label></div>` : ''}
    </div>

    <div class="section-title"><h2>Appearance & units</h2></div>
    <div class="card set-list">
      <button class="set-row" data-act="themes"><div class="theme-row"><span class="mini-hero"></span><div><div class="t">Theme</div><div class="d">Six Italian-inspired looks</div></div></div><span class="chip">Change</span></button>
      <div class="set-row"><div><div class="t">Mode</div></div>${segmented('p-theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], prefs.theme)}</div>
      <div class="set-row"><div><div class="t">Bottles</div></div>${segmented('p-vol', [['ml', 'ml'], ['oz', 'oz']], prefs.vol)}</div>
      <div class="set-row"><div><div class="t">Weight</div></div>${segmented('p-weight', [['kg', 'kg'], ['lb', 'lb']], prefs.weight)}</div>
      <div class="set-row"><div><div class="t">Length</div></div>${segmented('p-length', [['cm', 'cm'], ['in', 'in']], prefs.length)}</div>
      <div class="set-row"><div><div class="t">Temperature</div></div>${segmented('p-temp', [['f', '°F'], ['c', '°C']], prefs.temp)}</div>
    </div>

    <div class="section-title"><h2>Help</h2></div>
    <div class="card list-card">
      <button class="list-row" data-act="tab" data-tab="guide"><span class="fam-ico">${icon('i-guide')}</span><div class="lr-main"><b>Parent guide</b><span class="small muted">What’s normal, day by day · when to call the doctor</span></div><span class="chev">${icon('i-chevron')}</span></button>
    </div>

    <div class="section-title"><h2>Account</h2></div>
    <div class="card list-card">
      <button class="list-row" data-act="account">${avatar({ name: store.me.name, size: 40 })}<div class="lr-main"><b>${esc(store.me.name)}</b><span class="small muted">${esc(store.me.email)}</span></div><span class="chev">${icon('i-chevron')}</span></button>
      <button class="list-row" data-act="sign-out"><span class="fam-ico">${icon('i-logout')}</span><div class="lr-main"><b>Sign out</b><span class="small muted">Your data stays safe in the cloud</span></div></button>
    </div>

    <p class="small muted center" style="margin-top:16px">Tip: on iPhone tap Share → <b>Add to Home Screen</b> (Android: menu → Install app) to use My Little Pomodoro like a native app.</p>
    <p class="footer-note">Made with love, one feed at a time. 🍅</p>
  `;
}

// Unit/mode preferences
document.addEventListener('segchange', (ev) => {
  const k = ev.target.dataset.seg;
  if (!k || !k.startsWith('p-')) return;
  const key = k.slice(2);
  setPref(key, ev.detail);
  window.dispatchEvent(new Event('pomo:theme'));
  rerender();
});

// ---------- Sheets ----------
function babySheet(b) {
  const isNew = !b;
  b = b || { id: uuid(), name: '', birth: '', sex: '' };
  openSheet({
    eyebrow: isNew ? 'New baby' : 'Baby profile', title: isNew ? 'Add a baby' : b.name,
    context: { baby: b, isNew },
    html: `<form data-form="baby">
      ${!isNew ? `<div class="profile-pic">${avatar({ name: b.name, url: babyAvatarUrl(b), size: 84 })}<button type="button" class="chip" data-act="pick-avatar">Change photo</button></div>` : ''}
      <div class="field"><label for="pbName">Name</label><input class="input" id="pbName" value="${esc(b.name)}" required></div>
      <div class="field"><label for="pbBirth">Birthday</label><input class="input" id="pbBirth" type="date" value="${esc(b.birth)}" required max="${toDateInput(Date.now())}"></div>
      <div class="field"><label>Sex <span class="muted" style="font-weight:500">(for WHO growth charts)</span></label>${segmented('pbsex', [['girl', 'Girl'], ['boy', 'Boy'], ['', 'Not set']], b.sex || '')}</div>
      <div class="btn-row">${!isNew && isAdmin() ? '<button type="button" class="btn btn-danger" data-act="delete-baby">Remove</button>' : ''}<button class="btn btn-primary" type="submit">${isNew ? 'Add baby' : 'Save'}</button></div>
    </form>`
  });
}
function avatarPicker() {
  const photos = liveEntries((e) => e.type === 'photo').slice(0, 60);
  const b = baby();
  openSheet({ eyebrow: b.name, title: 'Profile photo', html: photos.length
    ? `<div class="photo-grid">${photos.map((p) => `<button class="ph" data-act="set-avatar" data-id="${p.id}"><img src="${esc(p.pending && p.localThumb ? p.localThumb : `/api/families/${p.familyId}/photos/${p.id}?size=thumb`)}" alt=""></button>`).join('')}</div>
       <button class="btn btn-ghost btn-block" style="margin-top:14px" data-act="log" data-type="photo">Take a new photo</button>`
    : `${emptyState('No photos yet', 'Add a photo first, then choose it as the profile picture.', 'i-camera')}<button class="btn btn-primary btn-block" style="margin-top:14px" data-act="log" data-type="photo">Add a photo</button>` });
}

function inviteSheet() {
  openSheet({ eyebrow: 'Family', title: 'Invite someone', html: `
    <p class="muted" style="margin-top:0">Create a private link and send it by text or WhatsApp. It works once and expires in 14 days.</p>
    <div class="role-pick">${['editor', 'viewer', 'owner'].map((r, i) => `<label class="role-opt"><input type="radio" name="role" value="${r}" ${i === 0 ? 'checked' : ''}><span><b>${ROLE_LABEL[r]}</b><span class="small muted">${ROLE_HINT[r]}</span></span></label>`).join('')}</div>
    <button class="btn btn-primary btn-block" data-act="create-invite">Create invite link</button>
    <div id="inviteOut"></div>` });
}

function memberSheet(m) {
  const self = m.id === store.me.id;
  const admin = isAdmin();
  openSheet({ eyebrow: self ? 'You' : 'Family member', title: m.name, context: { member: m }, html: `
    <div class="profile-pic">${avatar({ name: m.name, size: 72 })}</div>
    ${m.email ? `<p class="center muted" style="margin-top:-6px">${esc(m.email)}</p>` : ''}
    ${self ? `<div class="field"><label for="mRel">Relationship to the baby</label><select class="input" id="mRel">${['', ...RELATIONSHIPS].map((r) => `<option ${r === m.relationship ? 'selected' : ''} value="${r}">${r || 'Choose…'}</option>`).join('')}</select></div>
      <button class="btn btn-ghost btn-block" data-act="save-rel">Save</button>` : ''}
    ${admin && !self ? `<div class="field" style="margin-top:12px"><div class="label">Access</div>${segmented('mrole', [['owner', 'Admin'], ['editor', 'Add & edit'], ['viewer', 'View only']], m.role)}<div class="hint">${ROLE_HINT[m.role]}</div></div>
      <div class="btn-row"><button class="btn btn-danger" data-act="remove-member">Remove</button><button class="btn btn-primary" data-act="save-role">Save access</button></div>` : ''}
    ${!admin && !self ? `<p class="center muted">${ROLE_LABEL[m.role]}${m.relationship ? ` · ${esc(m.relationship)}` : ''}</p>` : ''}
    ${self ? `<button class="btn btn-danger btn-block" style="margin-top:18px" data-act="leave-family">Leave this family</button>` : ''}` });
}

function accountSheet() {
  openSheet({ eyebrow: 'Account', title: 'Your account', html: `
    <form data-form="account">
      <div class="field"><label for="acName">Name</label><input class="input" id="acName" value="${esc(store.me.name)}" required></div>
      <div class="field"><label for="acEmail">Email</label><input class="input" id="acEmail" type="email" value="${esc(store.me.email)}" required></div>
      <button class="btn btn-primary btn-block" type="submit">Save</button>
    </form>
    <div class="or">change password</div>
    <form data-form="password">
      <div class="field"><label for="acCur">Current password</label><input class="input" id="acCur" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="acNew">New password</label><input class="input" id="acNew" type="password" minlength="8" autocomplete="new-password" required></div>
      <button class="btn btn-ghost btn-block" type="submit">Update password</button>
    </form>
    <div class="or">danger zone</div>
    <button class="btn btn-danger btn-block" data-act="delete-account">Delete my account</button>
    <p class="small muted center">Family data stays with the family. If you're the only admin, admin passes to the next member.</p>` });
}

// ---------- Backup / export ----------
function backupJson() {
  const list = [...store.entries.values()].filter((e) => !e.deleted);
  return JSON.stringify({
    app: 'my-little-pomodoro', version: 2, exportedAt: new Date().toISOString(),
    family: family() && family().name,
    babies: babies().map(({ id, name, birth, sex }) => ({ id, name, birth, sex })),
    entries: list.map(({ id, babyId, type, t, data }) => ({ id, babyId, type, t: new Date(t).toISOString(), data }))
  }, null, 2);
}
function csv() {
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const names = new Map(babies().map((b) => [b.id, b.name]));
  const rows = [['Baby', 'Date', 'Time', 'Type', 'Details', 'Note']];
  [...store.entries.values()].filter((e) => !e.deleted && !(e.data && e.data.running)).sort((a, b) => a.t - b.t).forEach((e) => {
    const d = new Date(e.t); const data = { ...e.data }; const note = data.note || ''; delete data.note;
    rows.push([names.get(e.babyId) || '', d.toLocaleDateString(), d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), e.type,
      Object.entries(data).filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; '), note]);
  });
  return rows.map((r) => r.map(q).join(',')).join('\n');
}

document.addEventListener('change', async (ev) => {
  if (ev.target.id !== 'restoreFile') return;
  const file = ev.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app === 'my-little-pomodoro' && Array.isArray(data.entries)) {
      if (!await confirmBox({ title: `Restore ${data.entries.length} entries?`, message: 'Entries already here are kept; matching ones are updated.', ok: 'Restore' })) return;
      for (const b of data.babies || []) if (!store.babies.has(b.id)) await saveBaby(b);
      await importEntries(data.entries.filter((e) => e.type !== 'photo').map((e) => ({ ...e, t: new Date(e.t).getTime() })));
      toast('Backup restored');
    } else if (data.baby && Array.isArray(data.entries)) {
      localStorage.setItem('pomodoro.v1', JSON.stringify(data));
      localStorage.removeItem('pomodoro.v1.imported');
      const { runAction } = await import('../ui.js');
      runAction('import-legacy');
    } else throw new Error('bad');
  } catch { toast('That file is not a My Little Pomodoro backup'); }
  ev.target.value = '';
});

// ---------- Forms ----------
document.addEventListener('submit', async (ev) => {
  const kind = ev.target.dataset.form;
  if (!['baby', 'account', 'password', 'family-name', 'delete-account'].includes(kind)) return;
  ev.preventDefault();
  try {
    if (kind === 'baby') {
      const { ctx } = await import('../ui.js');
      const c = ctx();
      const rec = { ...c.baby, name: $('#pbName').value.trim(), birth: $('#pbBirth').value, sex: segValue('pbsex') || '' };
      if (!rec.name || !rec.birth) return toast('Name and birthday are required');
      await saveBaby(rec);
      if (c.isNew) await setBaby(rec.id);
      closeSheet(); toast(c.isNew ? `Welcome, ${rec.name} 🍅` : 'Profile saved');
    } else if (kind === 'account') {
      await setMe(await api.patch('/me', { name: $('#acName').value.trim(), email: $('#acEmail').value.trim() }));
      closeSheet(); toast('Account updated');
    } else if (kind === 'family-name') {
      const r = await api.patch(`/families/${store.familyId}`, { name: $('#fnName').value.trim() });
      store.families = r.families; closeSheet(); toast('Family renamed');
    } else if (kind === 'delete-account') {
      await api.del('/me', { password: $('#daPw').value });
      closeSheet(); await signOut(); toast('Your account was deleted');
    } else if (kind === 'password') {
      await api.patch('/me', { currentPassword: $('#acCur').value, newPassword: $('#acNew').value });
      closeSheet(); toast('Password changed');
    }
  } catch (e) { toast(e.message); }
});

registerActions({
  'add-baby': () => babySheet(null),
  'edit-baby': (el) => babySheet(store.babies.get(el.dataset.id || store.babyId)),
  'pick-avatar': () => avatarPicker(),
  'set-avatar': async (el) => { const b = baby(); await saveBaby({ ...b, avatarId: el.dataset.id }); closeSheet(); toast('Profile photo updated'); },
  'delete-baby': async () => {
    const { ctx } = await import('../ui.js');
    const b = ctx().baby;
    if (!await confirmBox({ title: `Remove ${b.name}?`, message: 'Their profile and logs will be hidden for the whole family.', ok: 'Remove', danger: true })) return;
    await saveBaby({ ...b, deleted: true });
    closeSheet(); toast(`${b.name} removed`);
  },
  invite: () => inviteSheet(),
  'create-invite': async () => {
    const role = (document.querySelector('input[name=role]:checked') || {}).value || 'editor';
    const r = await api.post(`/families/${store.familyId}/invites`, { role });
    const text = `Join ${family().name} on My Little Pomodoro to follow ${baby() ? baby().name : 'our baby'} 🍅`;
    $('#inviteOut').innerHTML = `<div class="invite-link"><input class="input" readonly value="${esc(r.url)}" id="invUrl">
      <div class="btn-row"><button class="btn btn-ghost" data-act="copy-invite">Copy</button>${navigator.share ? '<button class="btn btn-primary" data-act="share-invite">Share</button>' : ''}</div></div>`;
    $('#inviteOut').dataset.text = text;
    loadMembers(true);
  },
  'copy-invite': async () => { await navigator.clipboard.writeText($('#invUrl').value).catch(() => $('#invUrl').select()); toast('Link copied'); },
  'share-invite': async () => { await navigator.share({ title: 'My Little Pomodoro', text: $('#inviteOut').dataset.text, url: $('#invUrl').value }).catch(() => {}); },
  'revoke-invite': async (el) => { await api.del(`/families/${store.familyId}/invites/${encodeURIComponent(el.dataset.code)}`); await loadMembers(true); toast('Invite revoked'); },
  'rename-family': () => openSheet({ eyebrow: 'Family', title: 'Rename family', html: `<form data-form="family-name">
      <div class="field"><label for="fnName">Family name</label><input class="input" id="fnName" value="${esc(family().name)}" required maxlength="80"></div>
      <button class="btn btn-primary btn-block" type="submit">Save</button></form>` }),
  member: (el) => {
    const list = fam.loadedFor === store.familyId ? fam.members : store.members;
    const m = list.find((x) => x.id === el.dataset.id); if (m) memberSheet(m);
  },
  'save-rel': async () => {
    await api.patch(`/families/${store.familyId}/members/${store.me.id}`, { relationship: $('#mRel').value });
    closeSheet(); await loadMembers(true); toast('Saved');
  },
  'save-role': async () => {
    const { ctx } = await import('../ui.js');
    const m = ctx().member;
    await api.patch(`/families/${store.familyId}/members/${m.id}`, { role: segValue('mrole') });
    closeSheet(); await loadMembers(true); toast(`${m.name.split(' ')[0]} can now: ${ROLE_LABEL[segValue('mrole') || m.role].toLowerCase()}`);
  },
  'remove-member': async () => {
    const { ctx } = await import('../ui.js');
    const m = ctx().member;
    if (!await confirmBox({ title: `Remove ${m.name}?`, message: 'They will lose access to this family right away.', ok: 'Remove', danger: true })) return;
    await api.del(`/families/${store.familyId}/members/${m.id}`);
    closeSheet(); await loadMembers(true); toast('Removed');
  },
  'leave-family': async () => {
    if (!await confirmBox({ title: `Leave ${family().name}?`, message: 'You’ll need a new invite to come back.', ok: 'Leave', danger: true })) return;
    await api.del(`/families/${store.familyId}/members/${store.me.id}`);
    closeSheet();
    await refreshMe();
    if (!store.families.length) {
      const r = await api.post('/families', { name: `${store.me.name.split(' ')[0]}'s family` });
      store.families = r.families; await setFamily(r.id);
    }
    toast('You left the family');
  },
  'switch-family': (el) => setFamily(el.dataset.id),
  account: () => accountSheet(),
  'delete-account': () => openSheet({ eyebrow: 'Account', title: 'Delete account', html: `<form data-form="delete-account">
      <p class="muted" style="margin-top:0">This permanently deletes your login. Family data stays with the family; if you’re the only admin, admin passes to the next member.</p>
      <div class="field"><label for="daPw">Enter your password to confirm</label><input class="input" id="daPw" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-red btn-block" type="submit">Delete my account</button></form>` }),
  'sign-out': async () => {
    if (store.pending && !await confirmBox({ title: 'Sign out with unsynced changes?', message: `${store.pending} change(s) haven't uploaded yet and will be lost.`, ok: 'Sign out', danger: true })) return;
    await signOut();
  },
  'push-on': () => enablePush().then(rerender),
  'push-off': () => disablePush().then(rerender),
  'push-test': async () => { const r = await api.post('/push/test'); toast(r.sent ? 'Sent — check your notifications' : 'No device subscribed'); },
  'backup-share': async () => {
    const name = `pomodoro-backup-${toLocalInput(Date.now()).slice(0, 10)}.json`;
    const how = await shareOrDownload(name, backupJson(), 'application/json');
    if (how !== 'cancelled') toast(how === 'shared' ? 'Backup ready — choose “Save to Files”' : 'Backup downloaded');
  },
  'export-csv': () => download(`${baby() ? baby().name : 'baby'}-pomodoro-log.csv`, csv(), 'text/csv')
});

export { ics };
