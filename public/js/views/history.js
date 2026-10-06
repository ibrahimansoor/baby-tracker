// History: 7-day chart, filters, entries grouped by day (paged for long histories).
import { esc, startOfDay, dayLabel, DAY, mins, fmtDur } from '../util.js';
import { entries } from '../store.js';
import { vol } from '../prefs.js';
import { registerActions, emptyState } from '../ui.js';
import { entryRow, isFeed, hasPoop } from './log.js';
import { summarize, entriesOn } from './today.js';

const state = { filter: 'all', days: 14 };

const FILTERS = [
  ['all', 'All', () => true],
  ['feeds', 'Feeds', (e) => isFeed(e) || e.type === 'solid' || e.type === 'pump'],
  ['diapers', 'Diapers', (e) => e.type === 'diaper'],
  ['poop', 'Poop', hasPoop],
  ['sleep', 'Sleep', (e) => e.type === 'sleep'],
  ['health', 'Health', (e) => ['med', 'temp', 'vaccine', 'growth'].includes(e.type)],
  ['moments', 'Moments', (e) => ['photo', 'milestone', 'note'].includes(e.type)]
];

function renderWeek() {
  const today = startOfDay(Date.now());
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = today - i * DAY; days.push({ d, s: summarize(entriesOn(d)) }); }
  const max = Math.max(8, ...days.map((x) => x.s.feeds + x.s.wet + x.s.dirty));
  const h = (n) => `${(n / max) * 100}%`;
  // Average over days that have any logs (so a new family doesn't see zeros)
  const logged = days.filter((x) => x.s.feeds + x.s.wet + x.s.dirty + x.s.sleepMs > 0);
  const n = Math.max(1, logged.length);
  const avg = (k) => logged.length ? Math.round(logged.reduce((a, x) => a + x.s[k], 0) / n * 10) / 10 : '—';
  const avgSleep = logged.length ? fmtDur(logged.reduce((a, x) => a + x.s.sleepMs, 0) / n) : '—';
  return `<div class="card week">
    <div class="week-head"><h3>This week</h3>
      <div class="legend"><span><i style="background:var(--pink)"></i>Feeds</span><span><i style="background:var(--lemon)"></i>Wet</span><span><i style="background:var(--espresso)"></i>Dirty</span></div>
    </div>
    <div class="bars">${days.map(({ d, s }) => `<div class="bar-col">
        <div class="n">${s.feeds || ''}</div>
        <div class="bar-stack">
          <div style="height:${h(s.feeds)};background:var(--pink)"></div>
          <div style="height:${h(s.wet)};background:var(--lemon)"></div>
          <div style="height:${h(s.dirty)};background:var(--espresso)"></div>
        </div>
        <div class="d ${d === today ? 'today' : ''}">${new Date(d).toLocaleDateString([], { weekday: 'narrow' })}</div>
      </div>`).join('')}</div>
    <div class="week-avg"><span><b>${avg('feeds')}</b> feeds/day</span><span><b>${avg('wet')}</b> wet</span><span><b>${avg('dirty')}</b> dirty</span><span><b>${avgSleep}</b> sleep</span></div>
  </div>`;
}

export function renderHistory() {
  const pred = (FILTERS.find((f) => f[0] === state.filter) || FILTERS[0])[2];
  const cutoff = startOfDay(Date.now()) - (state.days - 1) * DAY;
  const all = entries((e) => !(e.data && e.data.running) && pred(e));
  const list = all.filter((e) => e.t >= cutoff);
  const groups = [];
  list.forEach((e) => {
    const d = startOfDay(e.t);
    let g = groups[groups.length - 1];
    if (!g || g.d !== d) { g = { d, items: [] }; groups.push(g); }
    g.items.push(e);
  });
  return `
    <div class="page-title"><h1>History</h1></div>
    ${renderWeek()}
    <div class="chips scroll-x" style="margin-top:18px">
      ${FILTERS.map(([k, l]) => `<button class="chip ${state.filter === k ? 'on' : ''}" data-act="hist-filter" data-f="${k}">${l}</button>`).join('')}
    </div>
    ${groups.length ? groups.map((g) => {
      const lbl = dayLabel(g.d);
      const s = summarize(entriesOn(g.d));
      return `<div class="day-head"><h3>${esc(lbl.a)}${lbl.b ? ` <em>${esc(lbl.b)}</em>` : ''}</h3>
        <div class="sum">${s.feeds} feeds · ${vol(s.bottleMl)} · ${mins(s.breastSec)}m nursing<br>${s.wet} wet · ${s.dirty} dirty${s.sleepMs ? ` · ${fmtDur(s.sleepMs)} sleep` : ''}</div></div>
        <div class="timeline">${g.items.map((e) => entryRow(e)).join('')}</div>`;
    }).join('') : `<div style="margin-top:18px">${emptyState('Nothing here yet', 'Entries you and your family log will appear here, grouped by day.')}</div>`}
    ${all.length > list.length ? `<button class="btn btn-ghost btn-block" style="margin-top:16px" data-act="hist-more">Show earlier days</button>` : ''}
  `;
}

registerActions({
  'hist-filter': (el) => { state.filter = el.dataset.f; window.dispatchEvent(new Event('pomo:render')); },
  'hist-more': () => { state.days += 14; window.dispatchEvent(new Event('pomo:render')); }
});
