// Today: hero, celebrations, appointments, live timers, quick log, today's stats & timeline.
import { esc, icon, fmtAgo, fmtTime, fmtDate, startOfDay, ageText, ageDays, celebration, DAY, fmtDur, mins, parseDay, ics, shareOrDownload } from '../util.js';
import { store, baby, babies, entries, canEdit, photoUrl, setBaby } from '../store.js';
import { vol, prefs } from '../prefs.js';
import { avatar, registerActions, emptyState } from '../ui.js';
import { TYPES, entryRow, entryView, runningBreast, runningSleep, breastTimerCard, sleepTimerCard, lastBreastSide, otherSide, sideName, isFeed, hasPee, hasPoop } from './log.js';

export function babyAvatarUrl(b) {
  if (!b || !b.avatarId) return null;
  const e = store.entries.get(b.avatarId);
  return e && !e.deleted ? photoUrl(e) : null;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
}

// Daily guide targets for the first weeks (AAP / lactation consensus)
export function targets(b) {
  const d = ageDays(b && b.birth);
  const dayOfLife = d == null ? 6 : d + 1;
  const wet = dayOfLife >= 5 ? 6 : Math.max(1, dayOfLife);
  let dirty = dayOfLife >= 4 ? 3 : Math.max(1, dayOfLife);
  if (d != null && d > 42) dirty = 1;
  const feeds = d != null && d > 60 ? 6 : 8;
  return { wet, dirty, feeds, dayOfLife };
}

export function summarize(list) {
  const s = { feeds: 0, breastSec: 0, bottleMl: 0, formulaMl: 0, wet: 0, dirty: 0, bottles: 0, nursing: 0, sleepMs: 0, pumpMl: 0 };
  list.forEach((e) => {
    const d = e.data || {};
    if (d.running) return;
    if (e.type === 'breast') { s.feeds++; s.nursing++; s.breastSec += (d.left || 0) + (d.right || 0); }
    if (e.type === 'bottle') { s.feeds++; s.bottles++; s.bottleMl += d.ml || 0; if (d.milk !== 'breastmilk') s.formulaMl += d.ml || 0; }
    if (hasPee(e)) s.wet++;
    if (hasPoop(e)) s.dirty++;
    if (e.type === 'sleep' && d.end) s.sleepMs += d.end - e.t;
    if (e.type === 'pump') s.pumpMl += (d.left || 0) + (d.right || 0);
  });
  return s;
}
export const entriesOn = (dayStart) => entries((e) => e.t >= dayStart && e.t < dayStart + DAY && !(e.data && e.data.running));

function ring(value, goal, color) {
  const r = 27, c = 2 * Math.PI * r, pct = Math.min(1, goal ? value / goal : 0);
  return `<div class="ring"><svg viewBox="0 0 64 64">
    <circle class="bg" cx="32" cy="32" r="${r}" fill="none" stroke-width="6"/>
    <circle class="fg" cx="32" cy="32" r="${r}" fill="none" stroke-width="6" stroke="${color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg><div class="num">${value}</div></div>`;
}

function nextAppointment() {
  const now = Date.now() - 2 * 3600e3;
  const list = entries((e) => e.type === 'growth' && e.data.nextAt).map((e) => ({ e, at: new Date(e.data.nextAt).getTime() })).filter((x) => x.at >= now);
  return list.sort((a, b) => a.at - b.at)[0] || null;
}

function actionTile(type, lastTxt) {
  const T = TYPES[type];
  return `<button class="action ${T.cls}" data-act="log" data-type="${type}">
    ${lastTxt ? `<span class="last">${lastTxt}</span>` : ''}
    <span class="ico">${icon(T.icon)}</span>
    <span><span class="it">${T.label}</span><span class="en">${T.sub}</span></span>
  </button>`;
}

export function renderToday() {
  const b = baby();
  const now = Date.now();
  const lastFeed = entries(isFeed)[0];
  const lastDiaper = entries((e) => e.type === 'diaper')[0];
  const last = (pred) => { const e = entries(pred)[0]; return e ? fmtAgo(e.t) : ''; };
  const todayList = entriesOn(startOfDay(now));
  const s = summarize(todayList);
  const tg = targets(b);
  const nextSide = lastBreastSide() ? otherSide(lastBreastSide()) : null;
  const rb = runningBreast(), rs = runningSleep();
  const cel = celebration(b);
  const appt = nextAppointment();
  const list = babies();
  const edit = canEdit();
  const lastSleep = entries((e) => e.type === 'sleep' && e.data.end)[0];

  const feedSub = lastFeed ? (lastFeed.type === 'bottle' ? `${vol(lastFeed.data.ml || 0)} ${lastFeed.data.milk === 'breastmilk' ? 'breast milk' : 'formula'} at ${fmtTime(lastFeed.t)}` : `Nursed at ${fmtTime(lastFeed.t)}`) : 'Nothing logged yet';
  const diaperSub = lastDiaper ? `${entryView(lastDiaper).title} at ${fmtTime(lastDiaper.t)}` : 'Nothing logged yet';

  return `
    <section class="card hero">
      <svg class="hero-tile" aria-hidden="true"><rect width="100%" height="100%"/></svg>
      <div class="hero-top">
        ${avatar({ name: b.name, url: babyAvatarUrl(b), size: 58, cls: 'hero-avatar' })}
        <div class="hero-id">
          <div class="eyebrow">${greeting()}</div>
          <h1>${esc(b.name)}</h1>
          <div class="age">${ageText(b.birth)}</div>
        </div>
      </div>
      ${list.length > 1 ? `<div class="baby-switch">${list.map((x) => `<button class="${x.id === b.id ? 'on' : ''}" data-act="switch-baby" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
      <div class="since-grid">
        <div class="since">
          <div class="lbl">Last feed</div>
          <div class="val" ${lastFeed ? `data-since="${lastFeed.t}"` : ''}>${lastFeed ? fmtAgo(lastFeed.t) : '—'}</div>
          <div class="sub">${esc(feedSub)}</div>
        </div>
        <div class="since">
          <div class="lbl">${rs ? 'Asleep for' : 'Last diaper'}</div>
          ${rs ? `<div class="val" data-since="${rs.t}">${fmtAgo(rs.t)}</div><div class="sub">Since ${fmtTime(rs.t)}</div>`
            : `<div class="val" ${lastDiaper ? `data-since="${lastDiaper.t}"` : ''}>${lastDiaper ? fmtAgo(lastDiaper.t) : '—'}</div><div class="sub">${esc(diaperSub)}</div>`}
        </div>
      </div>
      ${nextSide && !rb ? `<div class="next-side">Next breast: <span class="pill">${icon('i-breast')} ${sideName(nextSide)}</span></div>` : ''}
    </section>

    ${cel ? `<div class="celebrate ${cel.kind}"><span class="big-emoji">${cel.emoji}</span><div><b>${esc(cel.title)}</b><div class="small">${cel.kind === 'birthday' || cel.kind === 'eve' ? 'Capture the day with a photo.' : 'A perfect day for a photo and a growth check-in.'}</div></div>${edit ? '<button class="chip" data-act="log" data-type="photo">Add photo</button>' : ''}</div>` : ''}

    ${appt ? `<div class="appt-card">
      <span class="ico">${icon('i-ruler')}</span>
      <div><div class="small muted">Next checkup</div><b>${fmtDate(appt.at, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(appt.at)}</b>${appt.e.data.doctor ? `<div class="small muted">${esc(appt.e.data.doctor)}</div>` : ''}</div>
      <button class="chip" data-act="appt-ics" data-id="${appt.e.id}">${icon('i-calendar')} Add</button>
    </div>` : ''}

    ${rb ? `<div class="live-wrap">${breastTimerCard(true)}</div>` : ''}
    ${rs ? `<div class="live-wrap">${sleepTimerCard(true)}</div>` : ''}

    ${edit ? `
    <div class="section-title"><h2>Quick log</h2></div>
    <div class="actions">
      ${actionTile('breast', rb ? '● live' : last((e) => e.type === 'breast' && !e.data.running))}
      ${actionTile('bottle', last((e) => e.type === 'bottle'))}
      ${actionTile('pee', last(hasPee))}
      ${actionTile('poop', last(hasPoop))}
      ${actionTile('sleep', rs ? '● asleep' : lastSleep ? fmtAgo(lastSleep.data.end) : '')}
      ${actionTile('pump', last((e) => e.type === 'pump'))}
    </div>
    <div class="more-log">${['photo', 'milestone', 'growth', 'temp', 'med', 'solid', 'vaccine', 'note'].map((t) => `<button class="more-chip ${TYPES[t].cls}" data-act="log" data-type="${t}"><span class="ico">${icon(TYPES[t].icon)}</span>${TYPES[t].label}</button>`).join('')}</div>`
    : '<div class="note-card" style="margin-top:16px"><span class="big-emoji">👀</span><div><b>View-only access</b><div class="small muted">You can follow along — ask a family admin if you’d like to add entries too.</div></div></div>'}

    <div class="section-title"><h2>Today</h2></div>
    <div class="stats">
      <div class="card stat">${ring(s.feeds, tg.feeds, 'var(--pink)')}<div class="k">Feeds</div><div class="g">goal ${tg.feeds}–12</div></div>
      <div class="card stat">${ring(s.wet, tg.wet, 'var(--lemon)')}<div class="k">Wet</div><div class="g">expect ${tg.wet}+</div></div>
      <div class="card stat">${ring(s.dirty, tg.dirty, 'var(--espresso)')}<div class="k">Dirty</div><div class="g">expect ${tg.dirty}+</div></div>
    </div>
    <div class="mini-stats">
      <div class="card mini t-bottle"><span class="ico">${icon('i-bottle')}</span><div><div class="v">${prefs.vol === 'oz' ? (s.bottleMl / 29.5735).toFixed(1) : s.bottleMl}<small> ${prefs.vol}</small></div><div class="l">${s.bottles} bottle${s.bottles === 1 ? '' : 's'}</div></div></div>
      <div class="card mini t-breast"><span class="ico">${icon('i-breast')}</span><div><div class="v">${mins(s.breastSec)}<small> min</small></div><div class="l">${s.nursing} nursing</div></div></div>
      <div class="card mini t-sleep"><span class="ico">${icon('i-moon')}</span><div><div class="v">${s.sleepMs ? fmtDur(s.sleepMs) : '0m'}</div><div class="l">sleep logged</div></div></div>
      <div class="card mini t-pump"><span class="ico">${icon('i-pump')}</span><div><div class="v">${prefs.vol === 'oz' ? (s.pumpMl / 29.5735).toFixed(1) : s.pumpMl}<small> ${prefs.vol}</small></div><div class="l">pumped</div></div></div>
    </div>

    <div class="section-title"><h2>Timeline</h2>${todayList.length ? '<button class="link" data-act="tab" data-tab="history">See history →</button>' : ''}</div>
    ${todayList.length ? `<div class="timeline">${todayList.map((e) => entryRow(e)).join('')}</div>`
      : emptyState('A fresh start', edit ? 'Tap a quick log above to record the first moment of the day.' : 'Nothing logged yet today.')}
    <p class="disclaimer center">Goals are general newborn guidelines (day ${tg.dayOfLife} of life) — your pediatrician knows your baby best.</p>
  `;
}

registerActions({
  'switch-baby': (el) => setBaby(el.dataset.id),
  'appt-ics': async (el) => {
    const e = store.entries.get(el.dataset.id); const b = baby();
    if (!e) return;
    const text = ics({ uid: `appt-${e.id}`, title: `${b.name}'s checkup${e.data.doctor ? ` — ${e.data.doctor}` : ''}`, start: new Date(e.data.nextAt).getTime(), description: 'From My Little Pomodoro' });
    await shareOrDownload(`${b.name}-checkup.ics`, text, 'text/calendar');
  },
  'birthday-ics': async () => {
    const b = baby(); if (!b) return;
    const text = ics({ uid: `bday-${b.id}`, title: `🎂 ${b.name}'s birthday`, start: parseDay(b.birth), allDay: true, yearly: true, description: `Born ${b.birth}` });
    await shareOrDownload(`${b.name}-birthday.ics`, text, 'text/calendar');
  }
});
