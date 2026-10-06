// Memories: a photo for every day, plus milestones.
import { esc, icon, startOfDay, fmtDate, ageDays, parseDay, DAY } from '../util.js';
import { baby, entries, canEdit, photoUrl } from '../store.js';
import { registerActions, emptyState } from '../ui.js';
import { MILESTONES } from './log.js';

const state = { limit: 90 };

export function renderMemories() {
  const b = baby();
  const edit = canEdit();
  const photos = entries((e) => e.type === 'photo');
  const milestones = entries((e) => e.type === 'milestone');
  const today = startOfDay(Date.now());
  const todays = photos.find((p) => startOfDay(p.t) === today);
  const days = new Set(photos.map((p) => startOfDay(p.t))).size;
  const dayOfLife = (ageDays(b.birth) || 0) + 1;

  // Group shown photos by month
  const shown = photos.slice(0, state.limit);
  const months = [];
  shown.forEach((p) => {
    const key = fmtDate(p.t, { month: 'long', year: 'numeric' });
    let g = months[months.length - 1];
    if (!g || g.key !== key) { g = { key, items: [] }; months.push(g); }
    g.items.push(p);
  });
  const doneTitles = new Set(milestones.map((m) => m.data.title));
  const nextIdeas = MILESTONES.filter((m) => !doneTitles.has(m)).slice(0, 4);

  return `
    <div class="page-title"><h1>Memories</h1>${edit ? `<button class="btn btn-primary btn-sm" data-act="log" data-type="photo">${icon('i-camera')} Photo</button>` : ''}</div>

    <div class="today-photo ${todays ? 'has' : ''}">
      ${todays
        ? `<button class="tp-img" data-act="edit-entry" data-id="${todays.id}"><img src="${esc(photoUrl(todays, 'full'))}" alt=""><span class="tp-tag">Today · Day ${dayOfLife}</span></button>`
        : `<button class="tp-empty" ${edit ? 'data-act="log" data-type="photo"' : 'disabled'}>
            <span class="ico">${icon('i-camera')}</span>
            <b>Day ${dayOfLife} — add today's photo</b>
            <span class="small muted">One a day makes a beautiful story of ${esc(b.name)} growing up.</span>
          </button>`}
      <div class="tp-stats"><span><b>${days}</b> day${days === 1 ? '' : 's'} captured</span><span><b>${milestones.length}</b> milestone${milestones.length === 1 ? '' : 's'}</span></div>
    </div>

    <div class="section-title"><h2>Milestones</h2>${edit ? '<button class="link" data-act="log" data-type="milestone">+ Add</button>' : ''}</div>
    ${milestones.length ? `<div class="ms-list">${milestones.map((m) => `<button class="ms" data-act="edit-entry" data-id="${m.id}">
        <span class="ms-star">${icon('i-star')}</span>
        <span><b>${esc(m.data.title)}</b><span class="small muted">${fmtDate(m.t)} · ${msAge(b, m.t)}</span>${m.data.note ? `<span class="small">${esc(m.data.note)}</span>` : ''}</span>
      </button>`).join('')}</div>`
      : emptyState('Firsts to come', `Smiles, rolls, first words — record each one with the date ${esc(b.name)} did it.`, 'i-star')}
    ${edit && nextIdeas.length ? `<div class="chips" style="margin-top:10px">${nextIdeas.map((t) => `<button class="chip" data-act="ms-quick" data-title="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>` : ''}

    <div class="section-title"><h2>Photos</h2></div>
    ${months.length ? months.map((g) => `<div class="month-head">${esc(g.key)}</div>
      <div class="photo-grid">${g.items.map((p) => `<button class="ph" data-act="edit-entry" data-id="${p.id}" aria-label="${esc(p.data.caption || 'Photo')}">
        <img src="${esc(photoUrl(p))}" alt="" loading="lazy"><span class="ph-day">${new Date(p.t).getDate()}</span>${p.pending ? '<span class="ph-sync" title="Waiting to sync"></span>' : ''}
      </button>`).join('')}</div>`).join('')
      : emptyState('No photos yet', 'Add a photo for any day — it’s saved to your family’s private album and synced to everyone’s phone.', 'i-camera')}
    ${photos.length > state.limit ? '<button class="btn btn-ghost btn-block" style="margin-top:14px" data-act="mem-more">Show older photos</button>' : ''}
  `;
}

function msAge(b, t) {
  const d = Math.round((startOfDay(t) - parseDay(b.birth)) / DAY);
  if (d < 0) return 'before birth';
  if (d < 14) return `${d} days old`;
  if (d < 91) return `${Math.floor(d / 7)} weeks old`;
  return `${Math.floor(d / 30.4375)} months old`;
}

registerActions({
  'mem-more': () => { state.limit += 90; window.dispatchEvent(new Event('pomo:render')); },
  'ms-quick': async (el) => {
    const { openLog } = await import('./log.js');
    openLog('milestone');
    const inp = document.getElementById('fMs');
    if (inp) inp.value = el.dataset.title;
  }
});
