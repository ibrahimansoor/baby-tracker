// Care timers: countdown cards, setup sheet, and in-app alerts when something is due.
import { $, $$, esc, icon, uuid, fmtTime, toLocalInput, fromLocalInput, MIN } from '../util.js';
import { store, baby, entries, timers, canEdit, saveEntry, deleteEntry, myPrefs } from '../store.js';
import * as api from '../api.js';
import { openSheet, closeSheet, ctx, registerActions, toast, haptic, confirmBox, segmented, segValue, optional } from '../ui.js';
import { TIMER_KINDS, computeDue, reminderText, fmtSpan, fmtInterval } from '../timer-core.js';
import { openLog, lastBreastSide } from './log.js';
import { getPushState, refreshPushState } from './more.js';

const rerender = () => window.dispatchEvent(new Event('pomo:render'));
const REPEAT_KINDS = ['breast', 'bottle', 'feed', 'diaper', 'pump', 'nap', 'med'];
const PRESETS = [90, 120, 150, 180, 240];
const ONCE_PRESETS = [15, 30, 45, 60, 120];

export const timerTitle = (tm) => {
  const d = tm.data || {};
  return { feed: 'Next feed', breast: 'Next breastfeed', bottle: 'Next bottle', diaper: 'Diaper check', pump: 'Next pump', nap: 'Next nap',
    med: d.label || 'Medicine', once: d.label || 'Timer' }[d.kind] || 'Timer';
};
const info = (tm, now = Date.now()) => computeDue(tm, entries(), now);

// "in 1h 12m" / "Due now" / "12m overdue"
function dueText(due, now) {
  const diff = due - now;
  if (diff > 30 * 1000) return `in ${fmtSpan(Math.ceil((diff - 1000) / MIN) * MIN)}`; // a full 15:00 reads "15m", 14:01 reads "15m"
  if (diff > -60 * 1000) return 'Due now';
  return `${fmtSpan(-diff)} overdue`;
}

// ---------- Today: countdown cards ----------
export function renderTimerSection() {
  const list = timers();
  const edit = canEdit();
  if (!list.length) {
    if (!edit) return '';
    return `<div class="timer-promo">
      <span class="tp-ico">${icon('i-bell')}</span>
      <div class="tp-copy"><b>Feeding & diaper reminders</b><span class="small muted">Set a timer and we'll remind you — and your family — when it's time.</span>
        <div class="btn-row"><button class="btn btn-primary btn-sm" data-act="timer-starter">Feed + diaper every 3h</button><button class="btn btn-ghost btn-sm" data-act="timer-new">Custom</button></div>
      </div>
    </div>`;
  }
  const now = Date.now();
  return `<div class="section-title"><h2>Timers</h2>${edit ? '<button class="link" data-act="timer-new">+ Add</button>' : ''}</div>
    <div class="timer-list">${list.map((tm) => timerCard(tm, now)).join('')}</div>`;
}

function timerCard(tm, now) {
  const d = tm.data || {};
  const K = TIMER_KINDS[d.kind] || TIMER_KINDS.once;
  const r = info(tm, now);
  const every = d.kind === 'once' ? `at ${fmtTime(r.due || d.dueAt)}` : `every ${fmtInterval(d.intervalMin)}${r.fromLog ? ` · from ${fmtTime(r.anchor)}` : ''}`;
  let right, sub = every, state = r.state;
  if (r.state === 'off') right = '<span class="tc-time off">Off</span>';
  else if (r.state === 'active') { right = `<span class="tc-time">${d.kind === 'nap' ? 'Sleeping' : 'Feeding now'}</span>`; sub = 'Paused while in progress'; }
  else right = `<span class="tc-time" data-due="${r.due}">${dueText(r.due, now)}</span>`;
  const pct = r.due && r.anchor ? Math.min(100, Math.max(0, ((now - r.anchor) / (r.due - r.anchor)) * 100)) : 0;
  return `<button class="timer-card ${K.cls} is-${state}" data-act="timer-open" data-id="${tm.id}">
    <span class="ico">${icon(K.icon)}</span>
    <span class="tc-main"><b>${esc(timerTitle(tm))}</b><span class="tc-sub">${esc(sub)}</span>
      ${r.due && r.state !== 'off' ? `<span class="tc-bar"><i data-due-bar data-anchor="${r.anchor}" data-due="${r.due}" style="width:${pct}%"></i></span>` : ''}</span>
    ${right}
  </button>`;
}

// Called every second by the app shell
export function tickTimers(now = Date.now()) {
  $$('.tc-time[data-due]').forEach((el) => {
    const due = +el.dataset.due;
    el.textContent = dueText(due, now);
    const card = el.closest('.timer-card');
    if (card && now >= due && card.classList.contains('is-waiting')) { card.classList.remove('is-waiting'); card.classList.add('is-due'); }
  });
  $$('[data-due-bar]').forEach((el) => {
    const a = +el.dataset.anchor, due = +el.dataset.due;
    el.style.width = `${Math.min(100, Math.max(0, ((now - a) / (due - a)) * 100))}%`;
  });
  checkAlerts(now);
}

// ---------- In-app alerts (and a local notification if the app is in the background) ----------
const ALERT_KEY = 'pomodoro.timerAlerts';
const alerted = (() => { try { return JSON.parse(localStorage.getItem(ALERT_KEY)) || {}; } catch { return {}; } })();
function markAlerted(key) {
  alerted[key] = Date.now();
  const cutoff = Date.now() - 3 * 864e5;
  for (const k of Object.keys(alerted)) if (alerted[k] < cutoff) delete alerted[k];
  try { localStorage.setItem(ALERT_KEY, JSON.stringify(alerted)); } catch { /* private mode */ }
}
let lastCheck = 0;
function checkAlerts(now) {
  if (!store.me || now - lastCheck < 5000) return;
  lastCheck = now;
  const p = myPrefs();
  if (!('reminders' in p ? p.reminders : store.role !== 'viewer')) return;
  const b = baby(); if (!b) return;
  for (const tm of timers()) {
    const r = info(tm, now);
    if (r.state !== 'due' || now - r.due > 6 * 3600e3) continue;
    const key = `${tm.id}:${r.due}`;
    if (alerted[key]) continue;
    markAlerted(key);
    showAlert(tm, r, b);
    break; // one at a time
  }
}

function showAlert(tm, r, b) {
  const msg = reminderText(tm, b.name, r, { lastSide: lastBreastSide() });
  haptic([120, 80, 120]);
  if (document.hidden) {
    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(msg.title, { body: msg.body, tag: `timer-${tm.id}`, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: '/#today' } })).catch(() => {});
    }
    return;
  }
  chime();
  let el = $('#timerAlert');
  if (!el) { el = document.createElement('div'); el.id = 'timerAlert'; el.className = 'timer-alert'; el.setAttribute('role', 'alertdialog'); document.body.appendChild(el); }
  const K = TIMER_KINDS[tm.data.kind] || TIMER_KINDS.once;
  el.innerHTML = `<div class="ta-card ${K.cls}">
    <span class="ico">${icon(K.icon)}</span>
    <div class="ta-copy"><b>${esc(msg.title)}</b>${msg.body ? `<span>${esc(msg.body)}</span>` : ''}</div>
    <div class="ta-actions">
      ${canEdit() && tm.data.kind !== 'once' ? `<button class="btn btn-primary btn-sm" data-act="timer-log" data-id="${tm.id}">Log now</button>` : ''}
      ${canEdit() ? `<button class="btn btn-ghost btn-sm" data-act="timer-snooze" data-id="${tm.id}" data-min="15">Snooze 15m</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-act="timer-alert-close">${tm.data.kind === 'once' ? 'Done' : 'OK'}</button>
    </div>
  </div>`;
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
const closeAlert = () => { const el = $('#timerAlert'); if (el) { el.classList.remove('show'); el.hidden = true; } };

// A soft two-note chime (Web Audio, no files). Silent if the browser blocks audio.
let audioCtx;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    [[880, 0], [1318.5, 0.18]].forEach(([f, dt]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.6);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.65);
    });
  } catch { /* no audio */ }
}

// ---------- Setup / edit sheet ----------
function sheetHtml(tm) {
  const d = tm.data;
  const isOnce = d.kind === 'once';
  const hours = Math.floor((d.intervalMin || 180) / 60), minutes = (d.intervalMin || 180) % 60;
  const r = tm.saved ? info(tm) : null;
  const recentMeds = [...new Set(entries((e) => e.type === 'med').map((e) => e.data.name).filter(Boolean))].slice(0, 6);
  const push = getPushState();
  return `<form data-form="timer">
    ${r && r.state === 'due' && canEdit() ? `<div class="timer-due-actions">
      <b>${esc(timerTitle(tm))} is ${dueText(r.due, Date.now()).toLowerCase()}</b>
      <div class="btn-row">${!isOnce ? `<button type="button" class="btn btn-primary" data-act="timer-log" data-id="${tm.id}">Log now</button>` : ''}<button type="button" class="btn btn-ghost" data-act="timer-snooze" data-id="${tm.id}" data-min="15">Snooze 15m</button></div>
    </div>` : ''}
    <div class="field"><div class="label">What for?</div>
      <div class="kind-grid">${[...REPEAT_KINDS, 'once'].map((k) => `<button type="button" class="kind ${TIMER_KINDS[k].cls} ${d.kind === k ? 'on' : ''}" data-tkind="${k}"><span class="ico">${icon(TIMER_KINDS[k].icon)}</span>${TIMER_KINDS[k].label}</button>`).join('')}</div>
    </div>

    <div id="tRepeat" ${isOnce ? 'hidden' : ''}>
      <div class="field"><div class="label">Remind me every</div>
        <div class="dur-inputs">
          <div class="unit-input"><input class="input" id="tH" type="number" inputmode="numeric" min="0" max="48" value="${hours}"><span>hr</span></div>
          <div class="unit-input"><input class="input" id="tM" type="number" inputmode="numeric" min="0" max="59" step="5" value="${minutes}"><span>min</span></div>
        </div>
        <div class="chips" style="margin-top:10px">${PRESETS.map((m) => `<button type="button" class="chip ${d.intervalMin === m ? 'on' : ''}" data-tpreset="${m}">${fmtInterval(m)}</button>`).join('')}</div>
        <div class="hint" id="tFromHint">Counts from the ${esc((TIMER_KINDS[d.kind] || TIMER_KINDS.feed).from)} — logging one restarts the countdown.</div>
      </div>
      <div class="field" id="tMedWrap" ${d.kind === 'med' ? '' : 'hidden'}><label for="tMed">Which medicine? ${optional}</label>
        <input class="input" id="tMed" value="${esc(d.kind === 'med' ? d.label || '' : '')}" placeholder="e.g. Vitamin D">
        ${recentMeds.length ? `<div class="chips" style="margin-top:8px">${recentMeds.map((m) => `<button type="button" class="chip" data-tfill="tMed" data-v="${esc(m)}">${esc(m)}</button>`).join('')}</div>` : ''}
      </div>
    </div>

    <div id="tOnce" ${isOnce ? '' : 'hidden'}>
      <div class="field"><label for="tLabel">Remind me to… ${optional}</label><input class="input" id="tLabel" value="${esc(isOnce ? d.label || '' : '')}" placeholder="e.g. Warm a bottle, give Vitamin D"></div>
      <div class="field"><div class="label">In</div>
        <div class="chips">${ONCE_PRESETS.map((m) => `<button type="button" class="chip" data-tin="${m}">${fmtInterval(m)}</button>`).join('')}</div>
      </div>
      <div class="field"><label for="tAt">At</label><input class="input" id="tAt" type="datetime-local" value="${toLocalInput(d.dueAt || Date.now() + 60 * MIN)}"></div>
    </div>

    ${tm.saved ? `<div class="field"><div class="label">Timer</div>${segmented('tenabled', [['on', 'On'], ['off', 'Off']], d.enabled === false ? 'off' : 'on')}</div>` : ''}

    ${push === 'on' ? '<p class="hint">🔔 Everyone in the family with notifications on will get an alert — even with the app closed.</p>'
      : `<div class="note-card" style="margin:4px 0 14px"><span class="big-emoji">🔔</span><div><b>Get alerts when your phone is locked</b>
        <div class="small muted">${push === 'ios-install' ? 'On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then turn on notifications in More.' : 'Alerts show in the app while it’s open. Turn on notifications to get them anytime.'}</div>
        ${push === 'off' ? '<button type="button" class="chip" style="margin-top:8px" data-act="push-on">Turn on notifications</button>' : ''}</div></div>`}

    <div class="btn-row sticky-actions">${tm.saved ? '<button type="button" class="btn btn-danger" data-act="timer-delete">Delete</button>' : ''}<button type="submit" class="btn btn-primary">${tm.saved ? 'Save timer' : 'Start timer'}</button></div>
  </form>`;
}

function openTimerSheet(tm) {
  if (!tm && !canEdit()) return toast('You have view-only access');
  if (getPushState() === 'unknown') refreshPushState().catch(() => {});
  const isNew = !tm;
  const rec = tm ? { ...tm, data: { ...tm.data }, saved: true } : { id: uuid(), type: 'timer', t: Date.now(), data: { kind: 'feed', intervalMin: 180, enabled: true }, saved: false };
  openSheet({ eyebrow: isNew ? 'New timer' : 'Timer', title: isNew ? 'Set a timer' : timerTitle(rec), context: { timer: rec }, html: sheetHtml(rec) });
  if (!canEdit()) $$('#sheetBody input, #sheetBody button[type=submit], #sheetBody [data-act=timer-delete]').forEach((el) => { el.disabled = true; });
}

// Kind / preset controls inside the sheet
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('button');
  if (!el || !$('#sheet').contains(el) || !ctx() || !ctx().timer) return;
  const tm = ctx().timer;
  if (el.dataset.tkind) {
    tm.data.kind = el.dataset.tkind;
    $$('[data-tkind]').forEach((b) => b.classList.toggle('on', b === el));
    const once = tm.data.kind === 'once';
    $('#tRepeat').hidden = once; $('#tOnce').hidden = !once;
    $('#tMedWrap').hidden = tm.data.kind !== 'med';
    if (!once) $('#tFromHint').textContent = `Counts from the ${TIMER_KINDS[tm.data.kind].from} — logging one restarts the countdown.`;
    if (!tm.saved && !once) { const m = TIMER_KINDS[tm.data.kind].defaultMin; $('#tH').value = Math.floor(m / 60); $('#tM').value = m % 60; }
  } else if (el.dataset.tpreset) {
    const m = +el.dataset.tpreset;
    $('#tH').value = Math.floor(m / 60); $('#tM').value = m % 60;
    $$('[data-tpreset]').forEach((b) => b.classList.toggle('on', b === el));
  } else if (el.dataset.tin) {
    $('#tAt').value = toLocalInput(Date.now() + +el.dataset.tin * MIN);
    $$('[data-tin]').forEach((b) => b.classList.toggle('on', b === el));
  } else if (el.dataset.tfill) {
    $('#' + el.dataset.tfill).value = el.dataset.v;
  }
});

// Preset chips light up only when they match what's typed
document.addEventListener('input', (ev) => {
  if (ev.target.id !== 'tH' && ev.target.id !== 'tM') return;
  const min = (parseInt($('#tH').value, 10) || 0) * 60 + (parseInt($('#tM').value, 10) || 0);
  $$('[data-tpreset]').forEach((b) => b.classList.toggle('on', +b.dataset.tpreset === min));
});

document.addEventListener('submit', async (ev) => {
  if (ev.target.dataset.form !== 'timer') return;
  ev.preventDefault();
  const c = ctx(); if (!c || !c.timer) return;
  const tm = c.timer;
  const d = { ...tm.data };
  if (d.kind === 'once') {
    d.dueAt = fromLocalInput($('#tAt').value);
    if (d.dueAt <= Date.now()) return toast('Pick a time in the future');
    d.label = $('#tLabel').value.trim();
    delete d.intervalMin;
  } else {
    const min = (parseInt($('#tH').value, 10) || 0) * 60 + (parseInt($('#tM').value, 10) || 0);
    if (min < 5) return toast('Set at least 5 minutes');
    if (min > 48 * 60) return toast('Keep it under 48 hours');
    d.intervalMin = min;
    d.label = d.kind === 'med' ? $('#tMed').value.trim() : '';
    delete d.dueAt;
  }
  d.enabled = tm.saved ? segValue('tenabled') !== 'off' : true;
  delete d.snoozeFor; delete d.snoozeUntil;
  try {
    const saved = await saveEntry({ id: tm.id, type: 'timer', t: tm.t, babyId: tm.babyId || store.babyId, data: d });
    haptic(); closeSheet();
    const r = info(saved);
    toast(r.state === 'waiting' ? `${timerTitle(saved)} ${dueText(r.due, Date.now())} · ${fmtTime(r.due)}` : tm.saved ? 'Timer saved' : 'Timer started');
  } catch (e) { toast(e.message); }
});

async function snooze(tm, minutes) {
  const r = info(tm);
  if (!r.due) return;
  await saveEntry({ ...tm, data: { ...tm.data, snoozeFor: tm.data.snoozeFor && r.due === Number(tm.data.snoozeUntil) ? tm.data.snoozeFor : r.due, snoozeUntil: Date.now() + minutes * MIN } });
}

// Log the thing the timer is about (opens the normal log sheet)
function logFor(tm) {
  const kind = tm.data.kind;
  if (kind === 'feed') {
    const last = entries((e) => (e.type === 'breast' || e.type === 'bottle') && !(e.data && e.data.running))[0];
    return openLog(last && last.type === 'bottle' ? 'bottle' : 'breast');
  }
  const map = { breast: 'breast', bottle: 'bottle', diaper: 'pee', pump: 'pump', nap: 'sleep', med: 'med' };
  openLog(map[kind] || 'note');
  if (kind === 'med' && tm.data.label) { const inp = $('#fMed'); if (inp) inp.value = tm.data.label; }
}

registerActions({
  'timer-new': () => openTimerSheet(null),
  'timer-open': (el) => { const tm = store.entries.get(el.dataset.id); if (tm) openTimerSheet(tm); },
  'timer-starter': async () => {
    if (!canEdit()) return;
    const t = Date.now();
    await saveEntry({ id: uuid(), type: 'timer', t, data: { kind: 'feed', intervalMin: 180, enabled: true } });
    await saveEntry({ id: uuid(), type: 'timer', t: t + 1, data: { kind: 'diaper', intervalMin: 180, enabled: true } });
    haptic();
    toast('Feed & diaper timers set — every 3 hours');
  },
  'timer-delete': async () => {
    const c = ctx(); if (!c || !c.timer) return;
    if (!await confirmBox({ title: `Delete “${timerTitle(c.timer)}”?`, message: 'Nobody in the family will be reminded by it anymore.', ok: 'Delete', danger: true })) return;
    const tm = store.entries.get(c.timer.id) || c.timer;
    closeSheet();
    await deleteEntry(tm);
    toast('Timer deleted', async () => { await saveEntry({ ...tm, deleted: false }); });
  },
  'timer-snooze': async (el) => {
    const tm = store.entries.get(el.dataset.id); if (!tm) return;
    await snooze(tm, +el.dataset.min || 15);
    closeAlert(); closeSheet();
    toast(`Snoozed ${el.dataset.min || 15} minutes`);
  },
  'timer-log': (el) => {
    const tm = store.entries.get(el.dataset.id); if (!tm) return;
    closeAlert(); closeSheet();
    setTimeout(() => logFor(tm), 0);
  },
  'timer-alert-close': async () => {
    closeAlert();
  },
  'reminders-me': async (el) => {
    const on = el.dataset.on === '1';
    await api.patch(`/families/${store.familyId}/members/${store.me.id}`, { prefs: { reminders: on } });
    const m = store.members.find((x) => x.id === store.me.id);
    if (m) m.prefs = { ...(m.prefs || {}), reminders: on };
    rerender();
    toast(on ? 'Timer alerts are on for you' : 'Timer alerts are off for you');
  }
});

// More → Reminders: per-person switch
export function remindersMeRow() {
  const p = myPrefs();
  const on = 'reminders' in p ? p.reminders : store.role !== 'viewer';
  return `<div class="set-row"><div><div class="t">${icon('i-bell')} Timer alerts for me</div><div class="d">${on ? 'You get feed, diaper & other timer alerts' : 'Others still get them; you won’t'}</div></div>
    <button class="chip ${on ? '' : 'on'}" data-act="reminders-me" data-on="${on ? '0' : '1'}">${on ? 'Turn off' : 'Turn on'}</button></div>`;
}
