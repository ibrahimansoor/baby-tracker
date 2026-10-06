// Sign in / create account / invites / password reset / first-baby onboarding.
import { $, esc, icon, uuid, toDateInput } from '../util.js';
import * as api from '../api.js';
import { store, setMe, setFamily, saveBaby, importEntries, refreshMe } from '../store.js';
import { registerActions, toast, segmented, segValue } from '../ui.js';

export const authState = { mode: 'signup', invite: null, inviteInfo: null, reset: null, busy: false };

export const RELATIONSHIPS = ['Mom', 'Dad', 'Parent', 'Grandma', 'Grandpa', 'Aunt', 'Uncle', 'Sibling', 'Nanny', 'Friend'];
export const ROLE_LABEL = { owner: 'Admin', editor: 'Can add & edit', viewer: 'View only' };
export const ROLE_HINT = {
  owner: 'Full access, can invite and manage family',
  editor: 'Can log feeds, diapers, photos and more',
  viewer: 'Can see everything, cannot change anything'
};

// Read #invite=… / #reset=… links
export async function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('invite')) {
    authState.invite = h.get('invite');
    try { authState.inviteInfo = await api.get(`/invites/${encodeURIComponent(authState.invite)}`); }
    catch (e) { authState.inviteInfo = { error: e.message }; }
  }
  if (h.get('reset')) { authState.reset = h.get('reset'); authState.mode = 'reset'; }
  if (h.get('invite') || h.get('reset')) history.replaceState(null, '', location.pathname);
}

const relOptions = (sel = '') => `<option value="">Choose…</option>${RELATIONSHIPS.map((r) => `<option ${r === sel ? 'selected' : ''}>${r}</option>`).join('')}`;

function inviteBanner() {
  const i = authState.inviteInfo;
  if (!authState.invite || !i) return '';
  if (i.error) return `<div class="note-card warn">${esc(i.error)}. Ask for a new invite link.</div>`;
  return `<div class="note-card invite">
    <span class="big-emoji">💌</span>
    <div><b>${esc(i.inviter || 'Someone')} invited you to ${esc(i.family)}</b>
    <div class="small muted">You'll join as <b>${ROLE_LABEL[i.role]}</b> — ${ROLE_HINT[i.role].toLowerCase()}.</div></div>
  </div>`;
}

export function renderAuth() {
  const m = authState.mode;
  const head = `<section class="welcome">
      <svg class="big-tomato"><use href="#i-tomato"/></svg>
      <h1>My Little <em>Pomodoro</em></h1>
      <p class="tag">Every feed, nap, diaper, photo and milestone — shared with the people who love your baby.</p>
    </section>`;
  if (m === 'reset') {
    return `${head}<form class="card auth-card" data-form="reset">
      <h2>Choose a new password</h2>
      <div class="field"><label for="aPw">New password</label><input class="input" id="aPw" type="password" minlength="8" autocomplete="new-password" required></div>
      <button class="btn btn-primary btn-block" type="submit">Save & sign in</button>
    </form>`;
  }
  if (m === 'forgot') {
    return `${head}<form class="card auth-card" data-form="forgot">
      <h2>Forgot your password?</h2>
      <p class="small muted">Enter your email and we'll send you a link to reset it.</p>
      <div class="field"><label for="aEmail">Email</label><input class="input" id="aEmail" type="email" autocomplete="email" required></div>
      <button class="btn btn-primary btn-block" type="submit">Send reset link</button>
      <button class="link-btn" type="button" data-act="auth-mode" data-mode="login">Back to sign in</button>
    </form>`;
  }
  const signup = m === 'signup';
  return `${head}${inviteBanner()}
    <form class="card auth-card" data-form="${m}">
      ${segmented('authmode', [['signup', 'Create account'], ['login', 'Sign in']], m)}
      ${signup ? `<div class="field"><label for="aName">Your name</label><input class="input" id="aName" autocomplete="name" required placeholder="e.g. Cristina"></div>` : ''}
      <div class="field"><label for="aEmail">Email</label><input class="input" id="aEmail" type="email" autocomplete="email" required></div>
      <div class="field"><label for="aPw">Password</label><input class="input" id="aPw" type="password" minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}" required>
        ${signup ? '<div class="hint">At least 8 characters.</div>' : ''}</div>
      ${signup ? `<div class="field"><label for="aRel">You are the baby's…</label><select class="input" id="aRel">${relOptions()}</select></div>` : ''}
      <button class="btn btn-primary btn-block" type="submit">${signup ? (authState.invite ? 'Create account & join' : 'Create account') : (authState.invite ? 'Sign in & join' : 'Sign in')}</button>
      ${signup ? '' : '<button class="link-btn" type="button" data-act="auth-mode" data-mode="forgot">Forgot password?</button>'}
      <p class="small muted center" style="margin:14px 0 0">${icon('i-lock')} Private to your family. Synced securely and saved on your phone.</p>
    </form>`;
}

document.addEventListener('segchange', (ev) => {
  if (ev.target.dataset.seg === 'authmode') { authState.mode = ev.detail; window.dispatchEvent(new Event('pomo:render')); }
});

async function afterAuth(me) {
  await setMe(me);
  const joined = authState.invite && authState.inviteInfo && !authState.inviteInfo.error;
  authState.invite = null; authState.inviteInfo = null; authState.reset = null;
  const target = joined ? me.families[me.families.length - 1] : me.families[0];
  if (target) await setFamily(target.id);
  window.dispatchEvent(new Event('pomo:signed-in'));
}

document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form || !['signup', 'login', 'forgot', 'reset', 'baby-onboard'].includes(form.dataset.form)) return;
  ev.preventDefault();
  if (authState.busy) return;
  authState.busy = true;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  const val = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  try {
    const kind = form.dataset.form;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (kind === 'signup') {
      await afterAuth(await api.post('/auth/signup', { name: val('aName'), email: val('aEmail'), password: $('#aPw').value, relationship: val('aRel'), timezone, invite: authState.inviteInfo && !authState.inviteInfo.error ? authState.invite : undefined }));
    } else if (kind === 'login') {
      const me = await api.post('/auth/login', { email: val('aEmail'), password: $('#aPw').value });
      api.patch('/me', { timezone }).catch(() => {});
      if (authState.invite && authState.inviteInfo && !authState.inviteInfo.error) {
        const r = await api.post(`/invites/${encodeURIComponent(authState.invite)}/accept`, {});
        me.families = r.families;
      }
      await afterAuth(me);
    } else if (kind === 'forgot') {
      await api.post('/auth/forgot', { email: val('aEmail') });
      toast('If that email has an account, a reset link is on its way');
      authState.mode = 'login';
      window.dispatchEvent(new Event('pomo:render'));
    } else if (kind === 'reset') {
      await afterAuth(await api.post('/auth/reset', { token: authState.reset, password: $('#aPw').value }));
      toast('Password updated');
    } else if (kind === 'baby-onboard') {
      await saveBaby({ id: uuid(), name: val('bName'), birth: val('bBirth'), sex: segValue('bsex') || '' });
      const rel = val('bRel');
      if (rel) api.patch(`/families/${store.familyId}/members/${store.me.id}`, { relationship: rel }).catch(() => {});
      toast('Welcome to the family 🍅');
    }
  } catch (e) {
    toast(e.message);
  } finally {
    authState.busy = false;
    btn.disabled = false;
  }
});

registerActions({
  'auth-mode': (el) => { authState.mode = el.dataset.mode; window.dispatchEvent(new Event('pomo:render')); },
  'accept-invite': async () => {
    const r = await api.post(`/invites/${encodeURIComponent(authState.invite)}/accept`, {});
    authState.invite = null; authState.inviteInfo = null;
    await refreshMe();
    await setFamily(r.familyId);
    toast('You joined the family 🎉');
  },
  'dismiss-invite': () => { authState.invite = null; authState.inviteInfo = null; window.dispatchEvent(new Event('pomo:render')); },
  'import-legacy': async () => {
    const legacy = readLegacy();
    if (!legacy) return;
    const id = uuid();
    await saveBaby({ id, name: legacy.baby.name, birth: legacy.baby.birth, sex: '' });
    const list = legacy.entries.map((e) => legacyToEntry(e, id)).filter(Boolean);
    await importEntries(list);
    try { localStorage.setItem('pomodoro.v1.imported', '1'); } catch { /* ignore */ }
    toast(`Imported ${list.length} entries for ${legacy.baby.name}`);
  }
});

// ---------- Original single-phone version → account ----------
export function readLegacy() {
  try {
    if (localStorage.getItem('pomodoro.v1.imported')) return null;
    const s = JSON.parse(localStorage.getItem('pomodoro.v1'));
    if (s && s.baby && s.baby.name && Array.isArray(s.entries) && s.entries.length) return s;
  } catch { /* ignore */ }
  return null;
}
function legacyToEntry(e, babyId) {
  const base = { id: uuid(), babyId, type: e.type, t: e.t, data: {} };
  if (e.note) base.data.note = e.note;
  if (e.type === 'breast') Object.assign(base.data, { left: e.left || 0, right: e.right || 0, lastSide: e.lastSide || 'L' });
  else if (e.type === 'bottle') Object.assign(base.data, { ml: e.ml || 0, milk: e.milk || 'formula' });
  else if (e.type === 'diaper') Object.assign(base.data, { pee: !!e.pee, poop: !!e.poop, color: e.color || null, texture: e.texture || null });
  else return null;
  return base;
}

// ---------- First baby ----------
export function renderOnboarding(canEdit) {
  const legacy = readLegacy();
  if (!canEdit) {
    return `<section class="welcome"><svg class="big-tomato"><use href="#i-tomato"/></svg>
      <h1>Almost there</h1><p class="tag">You have view-only access. A family admin needs to add the baby first — it will appear here automatically.</p></section>`;
  }
  return `<section class="welcome">
      <svg class="big-tomato"><use href="#i-tomato"/></svg>
      <div class="eyebrow">Welcome, ${esc(store.me.name.split(' ')[0])}</div>
      <h1>Tell us about your <em>baby</em></h1>
    </section>
    ${legacy ? `<div class="note-card">
      <span class="big-emoji">📲</span>
      <div><b>We found ${esc(legacy.baby.name)}'s log on this phone</b><div class="small muted">${legacy.entries.length} entries from before you had an account.</div>
      <button class="btn btn-primary" style="margin-top:10px" data-act="import-legacy">Import into my account</button></div>
    </div><div class="or">or start fresh</div>` : ''}
    <form class="card" data-form="baby-onboard">
      <div class="field"><label for="bName">Baby's name</label><input class="input" id="bName" required autocomplete="off" placeholder="e.g. Nora"></div>
      <div class="field"><label for="bBirth">Birthday</label><input class="input" id="bBirth" type="date" required max="${toDateInput(Date.now())}"></div>
      <div class="field"><label>Sex <span class="muted" style="font-weight:500">(for WHO growth charts)</span></label>${segmented('bsex', [['girl', 'Girl'], ['boy', 'Boy'], ['', 'Skip']], '')}</div>
      <div class="field"><label for="bRel">You are the baby's…</label><select class="input" id="bRel">${relOptions()}</select></div>
      <button class="btn btn-primary btn-block" type="submit">Let's begin</button>
    </form>`;
}
