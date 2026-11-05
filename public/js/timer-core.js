// Timer logic shared by the app and the server (the server loads this file with import()),
// so the countdown on the phone and the push notification always agree.
//
// A timer is an entry { type: 'timer', t, data } where data =
//   { kind, intervalMin, label, enabled, dueAt }
//   kind: 'feed' | 'breast' | 'bottle' | 'diaper' | 'pump' | 'med' | 'nap' → repeats every intervalMin after the last matching log
//         'once' → fires once at dueAt

export const TIMER_KINDS = {
  feed:   { label: 'Any feed',    noun: 'feed',        emoji: '🍼', from: 'last feed',          icon: 'i-bottle', cls: 't-bottle',  defaultMin: 180 },
  breast: { label: 'Breastfeed',  noun: 'breastfeed',  emoji: '🤱', from: 'last breastfeed',    icon: 'i-breast', cls: 't-breast',  defaultMin: 180 },
  bottle: { label: 'Formula',     noun: 'bottle',      emoji: '🍼', from: 'last bottle',        icon: 'i-bottle', cls: 't-bottle',  defaultMin: 180 },
  diaper: { label: 'Diaper',      noun: 'diaper check', emoji: '🧷', from: 'last diaper change', icon: 'i-drop',   cls: 't-pee',     defaultMin: 180 },
  pump:   { label: 'Pump',        noun: 'pump',        emoji: '🫙', from: 'last pump',          icon: 'i-pump',   cls: 't-pump',    defaultMin: 180 },
  med:    { label: 'Medicine',    noun: 'medicine',    emoji: '💊', from: 'last dose',          icon: 'i-pill',   cls: 't-med',     defaultMin: 24 * 60 },
  nap:    { label: 'Nap',         noun: 'nap',         emoji: '😴', from: 'last wake-up',       icon: 'i-moon',   cls: 't-sleep',   defaultMin: 90 },
  once:   { label: 'One-time',    noun: 'timer',       emoji: '⏰', from: '',                   icon: 'i-bell',   cls: 't-note',    defaultMin: 60 }
};

const MIN = 60 * 1000;
const isRunning = (e) => !!(e.data && e.data.running);
const ms = (t) => (typeof t === 'number' ? t : new Date(t).getTime());

// The log a repeating timer counts from (newest wins), as a timestamp, or null.
export function lastAnchor(kind, label, list) {
  let best = null;
  for (const e of list) {
    if (e.deleted || e.type === 'timer') continue;
    const d = e.data || {};
    let at = null;
    if (kind === 'feed' && (e.type === 'breast' || e.type === 'bottle') && !isRunning(e)) at = ms(e.t);
    else if (kind === 'breast' && e.type === 'breast' && !isRunning(e)) at = ms(e.t);
    else if (kind === 'bottle' && e.type === 'bottle') at = ms(e.t);
    else if (kind === 'diaper' && e.type === 'diaper') at = ms(e.t);
    else if (kind === 'pump' && e.type === 'pump') at = ms(e.t);
    else if (kind === 'med' && e.type === 'med' && (!label || String(d.name || '').trim().toLowerCase() === String(label).trim().toLowerCase())) at = ms(e.t);
    else if (kind === 'nap' && e.type === 'sleep' && d.end && !isRunning(e)) at = ms(d.end);
    if (at != null && (best == null || at > best)) best = at;
  }
  return best;
}

// Something is happening right now that pauses the timer (feeding or sleeping in progress).
export function inProgress(kind, list) {
  if (kind === 'feed' || kind === 'breast') return list.some((e) => !e.deleted && e.type === 'breast' && isRunning(e));
  if (kind === 'nap') return list.some((e) => !e.deleted && e.type === 'sleep' && isRunning(e));
  return false;
}

/**
 * When is this timer due?
 * @returns {{ state: 'off'|'active'|'waiting'|'due', due?: number, anchor?: number, fromLog?: boolean }}
 *   'active' = feeding/sleeping right now, so not counting down
 */
export function computeDue(timer, list, now = Date.now()) {
  const d = (timer && timer.data) || {};
  if (d.enabled === false || timer.deleted) return { state: 'off' };
  if (d.kind === 'once') {
    let due = ms(d.dueAt);
    if (!due) return { state: 'off' };
    if (d.snoozeFor && Number(d.snoozeFor) === due && Number(d.snoozeUntil) > due) due = Number(d.snoozeUntil);
    return { state: now >= due ? 'due' : 'waiting', due, anchor: ms(timer.t), fromLog: false };
  }
  const interval = Math.max(5, Number(d.intervalMin) || 0) * MIN;
  if (inProgress(d.kind, list)) return { state: 'active' };
  const last = lastAnchor(d.kind, d.label, list);
  const anchor = last != null ? Math.max(last, 0) : ms(timer.t);
  let due = anchor + interval;
  // Snooze applies only to the alert it was pressed on; a new log starts a fresh countdown.
  if (d.snoozeFor && Number(d.snoozeFor) === due && Number(d.snoozeUntil) > due) due = Number(d.snoozeUntil);
  return { state: now >= due ? 'due' : 'waiting', due, anchor, fromLog: last != null };
}

export function fmtSpan(msSpan) {
  const m = Math.max(0, Math.round(msSpan / MIN));
  const h = Math.floor(m / 60);
  if (h >= 48) return `${Math.floor(h / 24)}d${h % 24 ? ` ${h % 24}h` : ''}`;
  return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`;
}
export const fmtInterval = (min) => fmtSpan(min * MIN);

// Notification text. lastSide (optional) suggests which breast to start on.
export function reminderText(timer, babyName, info, { followUp = false, lastSide = null, now = Date.now() } = {}) {
  const d = timer.data || {};
  const name = babyName || 'baby';
  const ago = info.anchor ? fmtSpan(now - info.anchor) : '';
  let title, body;
  switch (d.kind) {
    case 'breast': title = `🤱 Time to breastfeed ${name}`; body = `${ago ? `Last feed was ${ago} ago.` : ''}${lastSide ? ` Start on the ${lastSide === 'L' ? 'right' : 'left'} side.` : ''}`; break;
    case 'bottle': title = `🍼 Time for ${name}'s bottle`; body = ago ? `Last bottle was ${ago} ago.` : ''; break;
    case 'feed': title = `🍼 Time to feed ${name}`; body = ago ? `Last feed was ${ago} ago.` : ''; break;
    case 'diaper': title = `🧷 Diaper check for ${name}`; body = ago ? `Last change was ${ago} ago.` : ''; break;
    case 'pump': title = '🫙 Time to pump'; body = ago ? `Last pumped ${ago} ago.` : ''; break;
    case 'med': title = `💊 Time for ${name}'s ${d.label || 'medicine'}`; body = ago && info.fromLog ? `Last dose was ${ago} ago.` : ''; break;
    case 'nap': title = `😴 Nap time soon for ${name}`; body = ago ? `Awake for ${ago}.` : ''; break;
    default: title = `⏰ ${d.label || 'Timer'}`; body = `Your timer for ${name} is up.`;
  }
  if (followUp) {
    title = `Reminder: ${title.replace(/^\S+\s/, '')}`;
    body = `Still not logged — ${fmtSpan(now - info.due)} past due.`;
  }
  return { title, body: body.trim() };
}
