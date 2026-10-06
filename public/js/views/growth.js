// Growth: WHO percentile charts, checkups, vaccines.
import { esc, icon, fmtDate, fmtTime, ageDays, parseDay, DAY } from '../util.js';
import { baby, entries, canEdit } from '../store.js';
import { prefs, weight, len, KG_PER_LB } from '../prefs.js';
import { registerActions, emptyState } from '../ui.js';
import { loadWho, whoReady, percentile, curves, fmtPct } from '../growth.js';
import { entryRow } from './log.js';

const state = { metric: 'weight' };
const METRICS = {
  weight: { label: 'Weight', key: 'weightKg', fmt: weight },
  length: { label: 'Length', key: 'lengthCm', fmt: len },
  head: { label: 'Head', key: 'headCm', fmt: len }
};

const disp = (metric, v) => metric === 'weight' ? (prefs.weight === 'lb' ? v / KG_PER_LB : v) : (prefs.length === 'in' ? v / 2.54 : v);
const unit = (metric) => metric === 'weight' ? (prefs.weight === 'lb' ? 'lb' : 'kg') : (prefs.length === 'in' ? 'in' : 'cm');

function measurements(metric) {
  const b = baby();
  const key = METRICS[metric].key;
  return entries((e) => e.type === 'growth' && e.data[key])
    .map((e) => ({ e, day: Math.max(0, (e.t - parseDay(b.birth)) / DAY), v: e.data[key] }))
    .sort((a, b2) => a.day - b2.day);
}

function chart(metric) {
  const b = baby();
  const pts = measurements(metric);
  const age = ageDays(b.birth) || 0;
  const maxDay = Math.min(1826, Math.max(183, Math.ceil((Math.max(age, ...pts.map((p) => p.day)) + 45) / 30.4375) * 30.4375));
  const W = 340, H = 230, L = 34, R = 30, T = 12, B = 26;
  const sex = b.sex;
  const cv = sex && whoReady() ? curves(metric, sex, Math.ceil(maxDay), maxDay > 400 ? 14 : 7) : null;
  let lo = Infinity, hi = -Infinity;
  if (cv) { cv[3].forEach(([, v]) => { lo = Math.min(lo, v); }); cv[97].forEach(([, v]) => { hi = Math.max(hi, v); }); }
  pts.forEach((p) => { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); });
  if (!isFinite(lo)) return '';
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; } // a single point: give the axis some room
  const pad = (hi - lo) * 0.06; lo = Math.max(0, lo - pad); hi += pad;
  const x = (d) => L + (d / maxDay) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (arr) => arr.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join('');
  // grid
  const months = maxDay / 30.4375;
  const mStep = months > 30 ? 6 : months > 12 ? 3 : months > 6 ? 2 : 1;
  let grid = '';
  for (let m = 0; m <= months + 0.01; m += mStep) {
    const gx = x(m * 30.4375);
    grid += `<line x1="${gx}" x2="${gx}" y1="${T}" y2="${H - B}" class="g-grid"/><text x="${gx}" y="${H - 8}" class="g-axis" text-anchor="middle">${m}${m === 0 ? '' : 'm'}</text>`;
  }
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const v = lo + (hi - lo) * i / yTicks;
    grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g-grid"/><text x="${L - 6}" y="${y(v) + 3}" class="g-axis" text-anchor="end">${disp(metric, v).toFixed(metric === 'weight' && prefs.weight === 'kg' ? 1 : 0)}</text>`;
  }
  let bands = '';
  if (cv) {
    const band = (a, c, cls) => `<path d="${path(cv[a])}L${cv[c].slice().reverse().map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join('L')}Z" class="${cls}"/>`;
    bands = band(3, 97, 'g-band-outer') + band(15, 85, 'g-band') +
      [3, 15, 50, 85, 97].map((p) => `<path d="${path(cv[p])}" class="g-line ${p === 50 ? 'g-median' : ''}"/>
        <text x="${W - R + 3}" y="${y(cv[p][cv[p].length - 1][1]) + 3}" class="g-pct">${p}</text>`).join('');
  }
  const babyLine = pts.length > 1 ? `<path d="${path(pts.map((p) => [p.day, p.v]))}" class="g-baby"/>` : '';
  const dots = pts.map((p) => `<circle cx="${x(p.day)}" cy="${y(p.v)}" r="4.5" class="g-dot"/>`).join('');
  const todayLine = `<line x1="${x(age)}" x2="${x(age)}" y1="${T}" y2="${H - B}" class="g-today"/>`;
  return `<svg class="g-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${METRICS[metric].label} chart with WHO percentiles">
    ${grid}${bands}${todayLine}${babyLine}${dots}
    <text x="${L}" y="${T - 2}" class="g-axis">${unit(metric)}</text>
  </svg>`;
}

function latestTile(metric) {
  const b = baby();
  const pts = measurements(metric);
  const p = pts[pts.length - 1];
  if (!p) return `<div class="g-tile ${state.metric === metric ? 'on' : ''}" data-act="g-metric" data-m="${metric}"><div class="k">${METRICS[metric].label}</div><div class="v muted">—</div><div class="p">No data</div></div>`;
  const pct = b.sex && whoReady() ? percentile(metric, b.sex, p.day, p.v) : null;
  return `<button class="g-tile ${state.metric === metric ? 'on' : ''}" data-act="g-metric" data-m="${metric}">
    <div class="k">${METRICS[metric].label}</div>
    <div class="v">${esc(METRICS[metric].fmt(p.v))}</div>
    <div class="p">${pct != null ? `${fmtPct(pct)} percentile` : fmtDate(p.e.t, { month: 'short', day: 'numeric' })}</div>
  </button>`;
}

export function renderGrowth() {
  const b = baby();
  if (b.sex && !whoReady()) loadWho().then(() => window.dispatchEvent(new Event('pomo:render')));
  const checkups = entries((e) => e.type === 'growth');
  const vaccines = entries((e) => e.type === 'vaccine');
  const upcoming = checkups.filter((e) => e.data.nextAt && new Date(e.data.nextAt).getTime() > Date.now() - 2 * 3600e3)
    .sort((a, c) => new Date(a.data.nextAt) - new Date(c.data.nextAt))[0];
  const edit = canEdit();
  const anyData = ['weight', 'length', 'head'].some((m) => measurements(m).length);
  return `
    <div class="page-title"><h1>Growth</h1>${edit ? `<button class="btn btn-primary btn-sm" data-act="log" data-type="growth">${icon('i-plus')} Checkup</button>` : ''}</div>

    ${upcoming ? `<div class="appt-card">
      <span class="ico">${icon('i-calendar')}</span>
      <div><div class="small muted">Next appointment</div><b>${fmtDate(upcoming.data.nextAt, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(new Date(upcoming.data.nextAt))}</b>${upcoming.data.doctor ? `<div class="small muted">${esc(upcoming.data.doctor)}</div>` : ''}</div>
      <button class="chip" data-act="appt-ics" data-id="${upcoming.id}">${icon('i-calendar')} Add</button>
    </div>` : ''}

    <div class="g-tiles">${latestTile('weight')}${latestTile('length')}${latestTile('head')}</div>

    <div class="card g-card">
      <div class="g-head"><h3>${METRICS[state.metric].label}-for-age</h3><span class="small muted">WHO standard</span></div>
      ${b.sex && !whoReady() ? '<div class="g-loading">Loading WHO growth standards…</div>' : anyData || b.sex ? chart(state.metric) : ''}
      ${!b.sex ? `<div class="note-card" style="margin-top:10px"><span class="big-emoji">📈</span><div><b>See WHO percentiles</b><div class="small muted">Add ${esc(b.name)}'s sex in the baby profile — growth standards differ for girls and boys.</div>
        ${edit ? '<button class="chip" style="margin-top:8px" data-act="edit-baby">Edit profile</button>' : ''}</div></div>` : ''}
      ${!anyData ? `<p class="small muted center" style="margin:10px 0 0">Log weight, length and head size after each visit to plot ${esc(b.name)}'s curve.</p>` : ''}
      ${b.sex && anyData ? '<p class="g-legend"><span><i class="g-l-band"></i>15th–85th</span><span><i class="g-l-med"></i>50th (median)</span><span><i class="g-l-baby"></i>' + esc(b.name) + '</span></p>' : ''}
    </div>
    <p class="disclaimer">Percentiles compare ${esc(b.name)} with the WHO Child Growth Standards. Steady growth along a curve matters more than any single number — ask your pediatrician about changes.</p>

    <div class="section-title"><h2>Checkups</h2></div>
    ${checkups.length ? `<div class="timeline">${checkups.map((e) => entryRow(e, { showDate: true })).join('')}</div>` : emptyState('No checkups yet', 'After each pediatrician visit, log weight, length, head size and notes — and the next appointment so the family gets a reminder.', 'i-ruler')}

    <div class="section-title"><h2>Vaccines</h2>${edit ? '<button class="link" data-act="log" data-type="vaccine">+ Add</button>' : ''}</div>
    ${vaccines.length ? `<div class="timeline">${vaccines.map((e) => entryRow(e, { showDate: true })).join('')}</div>` : emptyState('No vaccines logged', 'Keep a record of every shot. Your pediatrician has the official schedule.', 'i-syringe')}
  `;
}

registerActions({
  'g-metric': (el) => { state.metric = el.dataset.m; window.dispatchEvent(new Event('pomo:render')); }
});
