// My Little Pomodoro — app shell: boot, routing, header, tab bar, live ticking.
import { $, $$, esc, icon, fmtAgo, fmtClock } from './util.js';
import { store, onChange, boot, baby, canEdit, startSync, sync } from './store.js';
import { runAction, registerActions, sheetOpen, closeSheet, toast } from './ui.js';
import { applyTheme } from './theme.js';
import { authState, readHash, renderAuth, renderOnboarding, ROLE_LABEL } from './views/auth.js';
import { renderToday } from './views/today.js';
import { renderHistory } from './views/history.js';
import { renderGrowth } from './views/growth.js';
import { renderMemories } from './views/memories.js';
import { renderMore } from './views/more.js';
import { renderGuide } from './views/guide.js';
import { runningBreast, breastTotals } from './views/log.js';

const TABS = ['today', 'history', 'growth', 'memories', 'more'];
const VIEWS = { today: renderToday, history: renderHistory, growth: renderGrowth, memories: renderMemories, more: renderMore, guide: renderGuide };
let tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
let phase = 'loading';
const view = $('#view');

function header() {
  const b = store.me && baby();
  $('#brandSub').textContent = b ? `${b.name}'s daily log` : 'Newborn tracker';
  const s = $('#syncDot');
  if (!store.me) { s.hidden = true; return; }
  s.hidden = store.online && store.pending === 0;
  s.className = `sync-pill ${store.online ? 'busy' : 'off'}`;
  s.innerHTML = store.online ? `${icon('i-cloud')} ${store.pending}` : `${icon('i-cloud-off')}${store.pending ? ` ${store.pending}` : ''}`;
  s.title = store.online ? `Syncing ${store.pending} change(s)` : `Offline — ${store.pending} change(s) saved on this phone`;
}

function inviteAcceptScreen() {
  const i = authState.inviteInfo;
  return `<section class="welcome"><svg class="big-tomato"><use href="#i-tomato"/></svg>
    <h1>You're invited 💌</h1>
    ${i.error ? `<p class="tag">${esc(i.error)}</p><button class="btn btn-ghost" data-act="dismiss-invite">Continue</button>`
      : `<p class="tag"><b>${esc(i.inviter || 'Someone')}</b> invited you to join <b>${esc(i.family)}</b> as <b>${ROLE_LABEL[i.role]}</b>.</p>
      <div class="btn-row" style="max-width:360px;margin:0 auto"><button class="btn btn-ghost" data-act="dismiss-invite">Not now</button><button class="btn btn-primary" data-act="accept-invite">Join family</button></div>`}
  </section>`;
}

let renderQueued = false;
export function render() {
  // Don't yank the page out from under someone typing in a main-view form
  const a = document.activeElement;
  if (a && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) {
    if (!renderQueued) { renderQueued = true; a.addEventListener('blur', () => { renderQueued = false; setTimeout(render, 0); }, { once: true }); }
    return;
  }
  applyTheme();
  header();
  const tabbar = $('#tabbar');
  let html;
  if (phase === 'loading') { html = '<div class="splash"><svg class="big-tomato"><use href="#i-tomato"/></svg></div>'; tabbar.hidden = true; }
  else if (!store.me) { html = renderAuth(); tabbar.hidden = true; }
  else if (authState.invite && authState.inviteInfo) { html = inviteAcceptScreen(); tabbar.hidden = true; }
  else if (!baby()) { html = renderOnboarding(canEdit()); tabbar.hidden = true; }
  else {
    tabbar.hidden = false;
    $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab || (tab === 'guide' && b.dataset.tab === 'more')));
    html = VIEWS[tab]();
  }
  const key = `${phase}|${!!store.me}|${tab}`;
  if (view.dataset.key !== key) { view.dataset.key = key; view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
  view.innerHTML = html;
  tick();
}

function go(t) {
  tab = t;
  history.replaceState(null, '', t === 'today' ? location.pathname : `#${t}`);
  render();
  window.scrollTo({ top: 0 });
}

function tick() {
  const now = Date.now();
  $$('[data-since]').forEach((el) => { el.textContent = fmtAgo(+el.dataset.since, now); });
  $$('[data-since-clock]').forEach((el) => { el.textContent = fmtClock((now - +el.dataset.sinceClock) / 1000); });
  const r = store.me && runningBreast();
  if (r) {
    const t = breastTotals(r);
    $$('[data-breast-total]').forEach((el) => { el.textContent = fmtClock(t.total); });
    $$('[data-side-time]').forEach((el) => { el.textContent = fmtClock(t[el.dataset.sideTime]); });
  }
}
setInterval(tick, 1000);
// Keep relative times/greetings fresh
setInterval(() => { if (!sheetOpen() && store.me) render(); }, 60_000);

// ---------- Global events ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'A' && el.getAttribute('href')) return;
  runAction(el.dataset.act, el, ev);
});
registerActions({
  tab: (el) => { closeSheet(); go(el.dataset.tab); }
});
$('#sheetClose').addEventListener('click', closeSheet);
$('#scrim').addEventListener('click', closeSheet);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && sheetOpen()) closeSheet(); });
window.addEventListener('pomo:render', () => render());
window.addEventListener('pomo:signed-in', () => { phase = 'ready'; go('today'); startSync(); });

let lastErr = null;
onChange(() => {
  if (store.syncError === 'signed-out') { store.syncError = null; toast('Please sign in again'); }
  else if (store.syncError && store.syncError !== lastErr) { lastErr = store.syncError; toast(`Couldn’t sync: ${store.syncError}`); store.syncError = null; }
  if (sheetOpen()) { header(); tick(); return; } // don't re-render under an open sheet
  render();
});

// Re-render once a sheet closes (data may have changed meanwhile)
new MutationObserver(() => { if (!sheetOpen() && store.me) render(); }).observe($('#sheet'), { attributes: true, attributeFilter: ['hidden'] });

// ---------- Boot ----------
(async () => {
  applyTheme();
  render();
  await readHash();
  const result = await boot();
  phase = 'ready';
  if (result === 'offline-new') toast('You’re offline — connect to sign in the first time');
  if (store.me) startSync();
  render();
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'navigate' && TABS.includes(ev.data.tab)) go(ev.data.tab);
  });
}
window.addEventListener('focus', () => { if (store.me) sync(); });
// Invite / reset links opened while the app is already running
window.addEventListener('hashchange', async () => {
  if (!/invite=|reset=/.test(location.hash)) return;
  await readHash();
  render();
});
