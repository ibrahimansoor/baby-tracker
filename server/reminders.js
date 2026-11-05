'use strict';
// Sends push reminders: birthdays (and the day before), monthly & early weekly
// "baby-versaries", and upcoming checkups. Each reminder is sent once per user.
const { query } = require('./db');
const push = require('./push');

function localParts(tz, date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, y: +parts.year, m: +parts.month, d: +parts.day, hour: +parts.hour };
}

const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayNum = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
const addDays = (s, n) => new Date((dayNum(s) + n) * 86400000).toISOString().slice(0, 10);

// Which celebration (if any) falls on `today` for a baby born on `birth` (both YYYY-MM-DD).
function celebration(name, birth, today) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const age = dayNum(today) - dayNum(birth);
  if (age <= 0) return null;
  const effectiveBirthDay = Math.min(bd, daysInMonth(ty, tm));
  if (tm === bm && td === effectiveBirthDay) {
    const years = ty - by;
    return { kind: 'birthday', title: `🎂 Happy ${ordinal(years)} birthday, ${name}!`, body: `${name} turns ${years} today. 🎉` };
  }
  const tomorrow = addDays(today, 1);
  const [, nm, nd] = tomorrow.split('-').map(Number);
  if (nm === bm && nd === Math.min(bd, daysInMonth(+tomorrow.slice(0, 4), nm))) {
    return { kind: 'birthday-eve', title: `🎈 ${name}'s birthday is tomorrow`, body: `Get the candles ready — ${name} turns ${+tomorrow.slice(0, 4) - by} tomorrow.` };
  }
  // Completed months (born the 22nd → a new month only once the 22nd arrives)
  const months = (ty - by) * 12 + (tm - bm) - (td < effectiveBirthDay ? 1 : 0);
  if (td === effectiveBirthDay && months >= 1 && months < 24) {
    return { kind: 'month', title: `🍅 ${name} is ${months} month${months === 1 ? '' : 's'} old today!`, body: 'A perfect day for a photo and a growth check-in.' };
  }
  if (age % 7 === 0 && age / 7 <= 8 && months < 1) {
    const w = age / 7;
    return { kind: 'week', title: `🍼 ${name} is ${w} week${w === 1 ? '' : 's'} old today!`, body: 'Snap today’s photo to remember this week.' };
  }
  return null;
}

async function claim(key) {
  const { rowCount } = await query('INSERT INTO reminders_sent (key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
  return rowCount === 1;
}

async function run(now = new Date()) {
  const { rows: users } = await query(
    `SELECT DISTINCT u.id, u.timezone FROM users u JOIN push_subscriptions p ON p.user_id = u.id`);
  let sent = 0;
  for (const u of users) {
    const local = localParts(u.timezone || 'UTC', now);
    const { rows: babies } = await query(
      `SELECT b.id, b.name, b.birth, b.family_id FROM babies b JOIN memberships m ON m.family_id = b.family_id
       WHERE m.user_id = $1 AND NOT b.deleted`, [u.id]);
    for (const b of babies) {
      // Celebrations at 9am local
      if (local.hour >= 9) {
        const c = celebration(b.name, b.birth, local.date);
        if (c && await claim(`cel:${u.id}:${b.id}:${local.date}`)) {
          sent += await push.sendToUser(u.id, { title: c.title, body: c.body, url: '/#today', tag: `cel-${b.id}` });
        }
      }
      // Upcoming checkups saved on growth entries as data.nextAt (local 'YYYY-MM-DDTHH:mm' or date)
      const { rows: appts } = await query(
        `SELECT id, data->>'nextAt' AS next_at, data->>'doctor' AS doctor FROM entries
         WHERE baby_id = $1 AND type = 'growth' AND NOT deleted AND data ? 'nextAt' AND data->>'nextAt' <> ''`, [b.id]);
      for (const a of appts) {
        const day = String(a.next_at).slice(0, 10);
        const time = String(a.next_at).slice(11, 16);
        const at = time ? ` at ${time}` : '';
        const who = a.doctor ? ` with ${a.doctor}` : '';
        if (day === addDays(local.date, 1) && local.hour >= 18 && await claim(`appt-eve:${u.id}:${a.id}:${day}`)) {
          sent += await push.sendToUser(u.id, { title: `🩺 ${b.name}'s checkup is tomorrow${at}`, body: `Appointment${who}. Bring your questions!`, url: '/#growth' });
        }
        if (day === local.date && local.hour >= 7 && await claim(`appt-day:${u.id}:${a.id}:${day}`)) {
          sent += await push.sendToUser(u.id, { title: `🩺 Checkup today${at}`, body: `${b.name}'s appointment${who}. Log weight & length after!`, url: '/#growth' });
        }
      }
    }
  }
  return sent;
}

// ---------- Care timers (feed / diaper / pump / medicine / nap / one-time) ----------
// Logic lives in public/js/timer-core.js so the app's countdown and the push always agree.
let corePromise;
const core = () => (corePromise = corePromise || import('../public/js/timer-core.js'));
const FOLLOW_UP_MS = 30 * 60_000;
const STALE_MS = 6 * 3600_000; // don't nag about timers that went off hours ago

// Who hears a family's timers: members with a phone subscribed, unless they turned reminders off.
// Viewers (e.g. grandparents) are opted out unless they turn it on.
async function recipients(familyId) {
  const { rows } = await query(
    `SELECT DISTINCT m.user_id, m.role, m.prefs FROM memberships m JOIN push_subscriptions p ON p.user_id = m.user_id WHERE m.family_id = $1`, [familyId]);
  return rows.filter((r) => (r.prefs && 'reminders' in r.prefs) ? r.prefs.reminders : r.role !== 'viewer').map((r) => r.user_id);
}

async function runTimers(now = Date.now()) {
  const { computeDue, reminderText } = await core();
  const { rows: timers } = await query(
    `SELECT e.id, e.family_id, e.baby_id, e.t, e.data, b.name AS baby_name FROM entries e JOIN babies b ON b.id = e.baby_id
     WHERE e.type = 'timer' AND NOT e.deleted AND NOT b.deleted AND COALESCE((e.data->>'enabled')::boolean, true)`);
  const logsByBaby = new Map();
  let sent = 0;
  for (const tm of timers) {
    if (!logsByBaby.has(tm.baby_id)) {
      const { rows } = await query(
        `SELECT type, t, data FROM entries WHERE baby_id = $1 AND NOT deleted AND type <> 'timer' AND t > now() - interval '14 days'`, [tm.baby_id]);
      logsByBaby.set(tm.baby_id, rows);
    }
    const logs = logsByBaby.get(tm.baby_id);
    const info = computeDue(tm, logs, now);
    if (info.state !== 'due' || now - info.due > STALE_MS) continue;
    const lastBreast = logs.filter((e) => e.type === 'breast' && !(e.data && e.data.running)).sort((a, b) => new Date(b.t) - new Date(a.t))[0];
    const lastSide = lastBreast && lastBreast.data ? lastBreast.data.lastSide : null;
    // One alert when due, one follow-up 30 min later if still not logged — never more.
    const firstIsNew = await claim(`timer:${tm.id}:${info.due}`);
    let followUp = null;
    if (now - info.due >= FOLLOW_UP_MS && tm.data.kind !== 'once') {
      if (await claim(`timer-f:${tm.id}:${info.due}`)) followUp = true;
    } else if (firstIsNew) followUp = false;
    if (followUp === null) continue;
    const msg = reminderText(tm, tm.baby_name, info, { followUp, lastSide, now });
    for (const uid of await recipients(tm.family_id)) {
      sent += await push.sendToUser(uid, { ...msg, url: '/#today', tag: `timer-${tm.id}` });
    }
  }
  return sent;
}

function start() {
  const tick = () => run().catch((e) => console.error('[reminders]', e.message));
  setTimeout(tick, 15_000).unref();
  setInterval(tick, 10 * 60_000).unref();
  const timerTick = () => runTimers().catch((e) => console.error('[timers]', e.message));
  setTimeout(timerTick, 5_000).unref();
  setInterval(timerTick, 60_000).unref();
}

module.exports = { start, run, runTimers, recipients, celebration, localParts };
