// Log sheets for every entry type + shared entry presentation.
import { $, $$, esc, icon, uuid, fmtTime, fmtDate, toLocalInput, toDateInput, fromLocalInput, fmtClock, fmtDur, mins, ageDays, MIN, parseDay } from '../util.js';
import { store, saveEntry, deleteEntry, savePhoto, entries, baby, canEdit, memberName, photoUrl, saveBaby } from '../store.js';
import { prefs, vol, volBoth, weight, len, temp, toC, fromC, isFever, ML_PER_OZ, KG_PER_LB } from '../prefs.js';
import { openSheet, closeSheet, setSheetBody, setSheetTitle, ctx, registerActions, toast, haptic, confirmBox, optional, segmented, segValue } from '../ui.js';
import { resizeImage } from '../util.js';

// ---------- Types ----------
export const TYPES = {
  breast:    { label: 'Breastfeed', sub: 'Start timer', icon: 'i-breast', cls: 't-breast' },
  bottle:    { label: 'Formula', sub: 'Bottle feed', icon: 'i-bottle', cls: 't-bottle' },
  pee:       { label: 'Pee', sub: 'Wet diaper', icon: 'i-drop', cls: 't-pee' },
  poop:      { label: 'Poop', sub: 'Dirty diaper', icon: 'i-poop', cls: 't-poop' },
  sleep:     { label: 'Sleep', sub: 'Nap or night', icon: 'i-moon', cls: 't-sleep' },
  pump:      { label: 'Pump', sub: 'Milk pumped', icon: 'i-pump', cls: 't-pump' },
  solid:     { label: 'Solids', sub: 'First foods', icon: 'i-spoon', cls: 't-solid' },
  med:       { label: 'Medicine', sub: 'Dose given', icon: 'i-pill', cls: 't-med' },
  temp:      { label: 'Temperature', sub: 'Check fever', icon: 'i-thermo', cls: 't-temp' },
  growth:    { label: 'Checkup', sub: 'Weight & length', icon: 'i-ruler', cls: 't-growth' },
  vaccine:   { label: 'Vaccine', sub: 'Shot given', icon: 'i-syringe', cls: 't-vaccine' },
  milestone: { label: 'Milestone', sub: 'A first!', icon: 'i-star', cls: 't-milestone' },
  photo:     { label: 'Photo', sub: "Today's picture", icon: 'i-camera', cls: 't-photo' },
  note:      { label: 'Note', sub: 'Anything else', icon: 'i-note', cls: 't-note' }
};

export const POOP_COLORS = [
  { id: 'black', name: 'Black', hex: '#2B2522', warnAfterDay: 4 },
  { id: 'green', name: 'Green', hex: '#6E7D35' },
  { id: 'yellow', name: 'Mustard', hex: '#D9A82A' },
  { id: 'tan', name: 'Tan', hex: '#B98B4E' },
  { id: 'brown', name: 'Brown', hex: '#7A4E2D' },
  { id: 'red', name: 'Red', hex: '#B3322A', warn: true },
  { id: 'white', name: 'Pale', hex: '#E8E2D2', warn: true }
];
const TEXTURES = ['Seedy', 'Soft', 'Runny', 'Pasty', 'Hard'];
export const MILESTONES = [
  'First smile', 'First laugh', 'Holds head up', 'Rolls over', 'Sleeps through the night', 'First bath', 'First outing',
  'Reaches for toys', 'Sits without support', 'First solid food', 'First tooth', 'Crawls', 'Waves bye-bye', 'Claps',
  'Pulls to stand', 'First word', 'First steps', 'First haircut'
];
export const VACCINES = ['Hepatitis B', 'RSV antibody', 'DTaP', 'Hib', 'Polio (IPV)', 'Pneumococcal (PCV)', 'Rotavirus', 'Flu', 'COVID-19', 'MMR', 'Varicella', 'Hepatitis A'];
const TEMP_METHODS = ['Rectal', 'Armpit', 'Forehead', 'Ear'];

const running = (type) => entries((e) => e.type === type && e.data && e.data.running)[0] || null;
export const runningBreast = () => running('breast');
export const runningSleep = () => running('sleep');
export const otherSide = (s) => (s === 'L' ? 'R' : 'L');
export const sideName = (s) => (s === 'L' ? 'Left' : 'Right');
export function lastBreastSide() {
  const e = entries((x) => x.type === 'breast' && !(x.data && x.data.running))[0];
  return e ? e.data.lastSide : null;
}
export const isFeed = (e) => (e.type === 'breast' || e.type === 'bottle') && !(e.data && e.data.running);
export const hasPee = (e) => e.type === 'diaper' && e.data.pee;
export const hasPoop = (e) => e.type === 'diaper' && e.data.poop;

// ---------- Presentation ----------
export function entryView(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'breast': {
      if (d.running) return { k: 'breast', title: 'Breastfeeding now', detail: 'Timer running' };
      const parts = [];
      if (d.left) parts.push(`L ${mins(d.left)}m`);
      if (d.right) parts.push(`R ${mins(d.right)}m`);
      return { k: 'breast', title: 'Breastfeed', detail: `${parts.join(' · ') || 'Nursing'} · ${mins((d.left || 0) + (d.right || 0))} min total` };
    }
    case 'bottle': return { k: 'bottle', title: d.milk === 'breastmilk' ? 'Bottle · breast milk' : 'Formula', detail: volBoth(d.ml || 0) };
    case 'diaper': {
      const k = d.poop ? 'poop' : 'pee';
      const title = d.pee && d.poop ? 'Pee + poop' : d.poop ? 'Poop' : 'Pee';
      const bits = [];
      const c = d.poop && POOP_COLORS.find((x) => x.id === d.color);
      if (c) bits.push(`<span class="swatch-dot" style="background:${c.hex}"></span>${c.name}`);
      if (d.poop && d.texture) bits.push(esc(d.texture));
      if (!bits.length) bits.push(d.pee && d.poop ? 'Wet & dirty diaper' : d.poop ? 'Dirty diaper' : 'Wet diaper');
      return { k, title, detail: bits.join(' · '), html: true };
    }
    case 'sleep':
      if (d.running) return { k: 'sleep', title: 'Sleeping now', detail: `Since ${fmtTime(e.t)}` };
      return { k: 'sleep', title: 'Sleep', detail: `${fmtTime(e.t)} – ${fmtTime(d.end)} · ${fmtDur(d.end - e.t)}` };
    case 'pump': return { k: 'pump', title: 'Pumped', detail: `${vol((d.left || 0) + (d.right || 0))}${d.left && d.right ? ` · L ${vol(d.left)} · R ${vol(d.right)}` : ''}` };
    case 'solid': return { k: 'solid', title: d.food || 'Solids', detail: [d.amount, d.reaction].filter(Boolean).join(' · ') || 'Tried a new food' };
    case 'med': return { k: 'med', title: d.name || 'Medicine', detail: d.dose || 'Dose given' };
    case 'temp': return { k: 'temp', title: `${temp(d.c)}${isFever(d.c) ? ' · fever' : ''}`, detail: d.method || 'Temperature' };
    case 'growth': {
      const bits = [];
      if (d.weightKg) bits.push(weight(d.weightKg));
      if (d.lengthCm) bits.push(len(d.lengthCm));
      if (d.headCm) bits.push(`head ${len(d.headCm)}`);
      return { k: 'growth', title: d.doctor ? `Checkup · ${d.doctor}` : 'Checkup', detail: bits.join(' · ') || 'Visit logged' };
    }
    case 'vaccine': return { k: 'vaccine', title: d.name || 'Vaccine', detail: 'Vaccine given' };
    case 'milestone': return { k: 'milestone', title: d.title || 'Milestone', detail: 'Milestone ⭐' };
    case 'photo': return { k: 'photo', title: 'Photo', detail: d.caption || 'A new memory' };
    case 'note': return { k: 'note', title: 'Note', detail: d.text || '' };
    default: return { k: 'note', title: e.type, detail: '' };
  }
}

export function entryRow(e, { showDate = false } = {}) {
  const v = entryView(e);
  const T = TYPES[v.k];
  const note = e.data && e.data.note ? ` · ${esc(e.data.note)}` : '';
  const who = e.by && e.by !== (store.me && store.me.id) ? memberName(e.by) : '';
  const thumb = e.type === 'photo' ? `<img class="row-thumb" src="${esc(photoUrl(e))}" alt="" loading="lazy">` : `<span class="ico">${icon(T.icon)}</span>`;
  return `<button class="entry ${T.cls}${e.pending ? ' is-pending' : ''}" data-act="edit-entry" data-id="${e.id}">
    ${thumb}
    <span class="main">
      <span class="title">${esc(v.title)}</span>
      <span class="detail">${v.html ? v.detail : esc(v.detail)}${note}${who ? ` · <span class="by">${esc(who.split(' ')[0])}</span>` : ''}</span>
    </span>
    <span class="time">${showDate ? fmtDate(e.t, { month: 'short', day: 'numeric' }) : fmtTime(e.t)}</span>
  </button>`;
}

// ---------- Shared form bits ----------
function timeField(t, label = 'When', id = 'fTime') {
  return `<div class="field">
    <label for="${id}">${label}</label>
    <input class="input" type="datetime-local" id="${id}" value="${toLocalInput(t)}">
    <div class="time-chips">${[['0', 'Now'], ['5', '5m ago'], ['15', '15m ago'], ['30', '30m ago'], ['60', '1h ago']].map(([v, l]) => `<button type="button" class="chip" data-ago="${v}" data-for="${id}">${l}</button>`).join('')}</div>
  </div>`;
}
const dateField = (t, label = 'Date', id = 'fDate') => `<div class="field"><label for="${id}">${label}</label><input class="input" type="date" id="${id}" value="${toDateInput(t)}" max="${toDateInput(Date.now() + 366 * 864e5)}"></div>`;
const noteField = (v, label = 'Note') => `<div class="field"><label for="fNote">${label} ${optional}</label><textarea class="input" id="fNote" rows="2" placeholder="Anything worth remembering…">${esc(v || '')}</textarea></div>`;
const actionsRow = (editing) => `<div class="btn-row sticky-actions">${editing ? '<button type="button" class="btn btn-danger" data-act="delete-entry">Delete</button>' : ''}<button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Save'}</button></div>`;
function stepper(id, value, unit, cls = '', step = 1) {
  return `<div class="stepper ${cls}">
    <button type="button" data-step="${id}" data-d="-1" data-s="${step}" aria-label="Less">−</button>
    <div class="val"><input type="number" inputmode="decimal" step="any" id="${id}" value="${value}" min="0"><div class="unit">${unit}</div></div>
    <button type="button" data-step="${id}" data-d="1" data-s="${step}" aria-label="More">+</button>
  </div>`;
}
const chipPick = (name, list, value, multi = false) => `<div class="chips" data-pick="${name}" ${multi ? 'data-multi' : ''}>${list.map((x) => `<button type="button" class="chip ${(multi ? (value || []).includes(x) : value === x) ? 'on' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
const picked = (name) => $$(`[data-pick="${name}"] .chip.on`).map((b) => b.dataset.v);
const num = (id) => { const el = $('#' + id); return el ? parseFloat(el.value) || 0 : 0; };
const val = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };

function guardEdit() {
  if (!canEdit()) { toast('You have view-only access to this family'); return false; }
  if (!baby()) { toast('Add your baby first'); return false; }
  return true;
}

// ---------- Open a sheet ----------
export function openLog(type, existing) {
  if (!guardEdit()) return;
  const editing = !!existing;
  const e = existing || { id: uuid(), t: Date.now(), data: {} };
  const d = e.data || {};
  const T = TYPES[type === 'diaper' ? (d.poop ? 'poop' : 'pee') : type];
  const eyebrow = editing ? `Edit ${T.label.toLowerCase()}` : `New ${T.label.toLowerCase()}`;
  const context = { type, entry: e, editing };

  if (type === 'pee' || type === 'poop' || type === 'diaper') {
    context.type = 'diaper';
    context.pee = editing ? !!d.pee : type === 'pee';
    context.poop = editing ? !!d.poop : type === 'poop';
    context.color = d.color || null; context.texture = d.texture || null;
    openSheet({ eyebrow, title: diaperTitle(context), context, html: diaperForm(context, e) });
    updateColorWarn();
    return;
  }
  if (type === 'breast' && !editing) return openBreastSheet();
  if (type === 'sleep' && !editing) return openSleepSheet();
  const forms = { breast: breastManual, bottle: bottleForm, sleep: sleepManual, pump: pumpForm, solid: solidForm, med: medForm, temp: tempForm, growth: growthForm, vaccine: vaccineForm, milestone: milestoneForm, photo: photoForm, note: noteForm };
  if (type === 'bottle') context.milk = d.milk || (lastOf('bottle') && lastOf('bottle').data.milk) || 'formula';
  openSheet({ eyebrow, title: T.label, context, html: `<form data-form="log">${forms[type](e, editing, context)}${actionsRow(editing)}</form>` });
  if (type === 'temp') updateFeverWarn();
}
const lastOf = (type) => entries((x) => x.type === type && !(x.data && x.data.running))[0];

// Diaper
const diaperTitle = (c) => c.poop && !c.pee ? 'Poop' : c.pee && !c.poop ? 'Pee' : 'Diaper';
function diaperForm(c, e) {
  return `<form data-form="log">
    <div class="field"><div class="label">What's in the diaper?</div>
      <div class="toggles">
        <button type="button" class="toggle t-pee ${c.pee ? 'on' : ''}" data-toggle="pee"><span class="ico">${icon('i-drop')}</span>Pee<span class="chk">✓</span></button>
        <button type="button" class="toggle t-poop ${c.poop ? 'on' : ''}" data-toggle="poop"><span class="ico">${icon('i-poop')}</span>Poop<span class="chk">✓</span></button>
      </div>
    </div>
    <div id="poopDetails" ${c.poop ? '' : 'hidden'}>
      <div class="field"><div class="label">Colour ${optional}</div>
        <div class="swatches">${POOP_COLORS.map((x) => `<button type="button" class="swatch ${c.color === x.id ? 'on' : ''}" data-color="${x.id}"><span class="c" style="background:${x.hex}"></span>${x.name}</button>`).join('')}</div>
        <div id="colorWarn"></div>
      </div>
      <div class="field"><div class="label">Texture ${optional}</div>
        <div class="chips">${TEXTURES.map((x) => `<button type="button" class="chip ${c.texture === x ? 'on' : ''}" data-texture="${x}">${x}</button>`).join('')}</div>
      </div>
    </div>
    ${timeField(e.t)}
    ${noteField(e.data && e.data.note)}
    ${actionsRow(c.editing)}
  </form>`;
}
function updateColorWarn() {
  const box = $('#colorWarn'); const c0 = ctx(); if (!box || !c0) return;
  const c = POOP_COLORS.find((x) => x.id === c0.color);
  const d = ageDays(baby() && baby().birth);
  let msg = '';
  if (c && c.warn) msg = c.id === 'red' ? 'Red can mean blood — please call your pediatrician.' : 'White, chalky or grey poop needs a prompt call to your pediatrician.';
  else if (c && c.warnAfterDay && d != null && d >= c.warnAfterDay) msg = 'Black poop after the first few days should be checked with your pediatrician.';
  box.innerHTML = msg ? `<div class="warn-note">${msg}</div>` : '';
}

// Bottle
function bottleForm(e, editing, c) {
  const last = lastOf('bottle');
  const ml = e.data.ml != null ? e.data.ml : last ? last.data.ml : 60;
  const oz = prefs.vol === 'oz';
  const presets = oz ? [1, 2, 3, 4, 5, 6] : [30, 60, 90, 120, 150, 180];
  return `
    <div class="field">${segmented('milk', [['formula', 'Formula'], ['breastmilk', 'Breast milk']], c.milk)}</div>
    <div class="field"><div class="label">How much?</div>
      ${stepper('fMl', oz ? Math.round(ml / ML_PER_OZ * 2) / 2 : ml, oz ? 'ounces' : 'millilitres', '', oz ? 0.5 : 10)}
      <div class="chips center" style="margin-top:12px">${presets.map((p) => `<button type="button" class="chip" data-preset="${p}" data-for="fMl">${p} ${oz ? 'oz' : 'ml'}</button>`).join('')}</div>
    </div>
    ${timeField(e.t)}
    ${noteField(e.data.note)}`;
}

// Breastfeeding — live timer (synced to the family) + manual entry
function openBreastSheet() {
  openSheet({ eyebrow: 'Nursing', title: 'Breastfeed', context: { type: 'breast', entry: { id: uuid(), t: Date.now(), data: {} }, editing: false }, html: breastSheetHtml() });
}
function breastSheetHtml() {
  return `${breastTimerCard()}<div class="or">or log it manually</div><form data-form="log">${breastManual({ t: Date.now(), data: {} }, false)}${actionsRow(false)}</form>`;
}
export function breastTimerCard(inline = false) {
  const r = runningBreast();
  const suggest = otherSide(lastBreastSide() || 'R');
  const d = r ? r.data : null;
  const btn = (s) => {
    const on = d && d.side === s;
    return `<button type="button" class="side-btn ${on ? 'on' : ''} ${!d && s === suggest ? 'suggest' : ''}" data-act="breast-side" data-side="${s}">
      <div class="s-name">${icon(on ? 'i-pause' : 'i-play')} ${sideName(s)}</div>
      <div class="s-time" data-side-time="${s}">${fmtClock(d ? d.acc[s] : 0)}</div>
      <div class="s-hint">${on ? 'tap to pause' : !d && s === suggest ? 'suggested next' : d ? 'tap to switch' : 'tap to start'}</div>
    </button>`;
  };
  return `<div class="card live t-breast" ${inline ? '' : 'style="margin-top:0"'}>
    <div class="live-head">
      <div class="eyebrow" style="color:var(--pink)">${r ? `<span class="live-dot"></span>${d.side ? 'Nursing now' : 'Paused'}` : 'Nursing timer'}</div>
      ${r ? '<button type="button" class="chip" data-act="breast-discard">Discard</button>' : `<span class="small muted">Suggested: ${sideName(suggest)}</span>`}
    </div>
    <div class="live-total" data-breast-total>${fmtClock(r ? breastTotals(r).total : 0)}</div>
    <div class="sides">${btn('L')}${btn('R')}</div>
    ${r ? '<button type="button" class="btn btn-primary btn-block" style="margin-top:12px" data-act="breast-finish">Finish & save</button>' : ''}
  </div>`;
}
export function breastTotals(r) {
  const d = r.data;
  const live = d.side ? Math.max(0, (Date.now() - d.sideStart) / 1000) : 0;
  const L = d.acc.L + (d.side === 'L' ? live : 0), R = d.acc.R + (d.side === 'R' ? live : 0);
  return { L, R, total: L + R };
}
function breastManual(e, editing) {
  const d = e.data;
  return `
    <div class="row">
      <div class="field"><div class="label center">Left · min</div>${stepper('fLeft', d.left != null ? mins(d.left) : 0, 'minutes', 'sm')}</div>
      <div class="field"><div class="label center">Right · min</div>${stepper('fRight', d.right != null ? mins(d.right) : 0, 'minutes', 'sm')}</div>
    </div>
    <div class="field"><div class="label">Finished on</div>${segmented('lastside', [['L', 'Left'], ['R', 'Right']], d.lastSide === 'L' ? 'L' : 'R')}</div>
    ${timeField(e.t, 'Started')}
    ${noteField(d.note)}`;
}

// Sleep — live timer + manual
function openSleepSheet() {
  openSheet({ eyebrow: 'Sleep', title: 'Sleep', context: { type: 'sleep', entry: { id: uuid(), t: Date.now(), data: {} }, editing: false },
    html: `${sleepTimerCard()}<div class="or">or log a past sleep</div><form data-form="log">${sleepManual({ t: Date.now() - 60 * MIN, data: { end: Date.now() } }, false)}${actionsRow(false)}</form>` });
}
export function sleepTimerCard(inline = false) {
  const r = runningSleep();
  return `<div class="card live t-sleep" ${inline ? '' : 'style="margin-top:0"'}>
    <div class="live-head">
      <div class="eyebrow" style="color:var(--violet)">${r ? '<span class="live-dot" style="background:var(--violet)"></span>Sleeping now' : 'Sleep timer'}</div>
      ${r ? '<button type="button" class="chip" data-act="sleep-discard">Discard</button>' : ''}
    </div>
    <div class="live-total" ${r ? `data-since-clock="${r.t}"` : ''}>${r ? fmtClock((Date.now() - r.t) / 1000) : '0:00'}</div>
    ${r ? `<div class="small muted" style="margin:-8px 0 12px">Fell asleep at ${fmtTime(r.t)}</div>
      <button type="button" class="btn btn-primary btn-block btn-violet" data-act="sleep-stop">Woke up — save</button>`
    : '<button type="button" class="btn btn-primary btn-block btn-violet" data-act="sleep-start">Start sleep timer</button>'}
  </div>`;
}
function sleepManual(e) {
  return `${timeField(e.t, 'Fell asleep', 'fTime')}${timeField(e.data.end || Date.now(), 'Woke up', 'fEnd')}${noteField(e.data.note)}`;
}

// Pump
function pumpForm(e) {
  const d = e.data, oz = prefs.vol === 'oz';
  const show = (ml) => oz ? Math.round((ml || 0) / ML_PER_OZ * 2) / 2 : (ml || 0);
  return `<div class="row">
      <div class="field"><div class="label center">Left</div>${stepper('fPL', show(d.left), oz ? 'oz' : 'ml', 'sm', oz ? 0.5 : 10)}</div>
      <div class="field"><div class="label center">Right</div>${stepper('fPR', show(d.right), oz ? 'oz' : 'ml', 'sm', oz ? 0.5 : 10)}</div>
    </div>${timeField(e.t)}${noteField(d.note)}`;
}

// Solids
function solidForm(e) {
  const d = e.data;
  const recent = [...new Set(entries((x) => x.type === 'solid').map((x) => x.data.food).filter(Boolean))].slice(0, 8);
  return `<div class="field"><label for="fFood">Food</label><input class="input" id="fFood" value="${esc(d.food || '')}" placeholder="e.g. Avocado, banana, oatmeal" required>
      ${recent.length ? `<div class="chips" style="margin-top:8px">${recent.map((f) => `<button type="button" class="chip" data-fill="fFood" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}</div>
    <div class="field"><div class="label">How much?</div>${chipPick('amount', ['A taste', 'A little', 'Some', 'Lots'], d.amount)}</div>
    <div class="field"><div class="label">Reaction</div>${chipPick('reaction', ['Loved it', 'Okay', 'Not a fan', 'Allergic reaction'], d.reaction)}</div>
    ${timeField(e.t)}${noteField(d.note)}`;
}

// Medicine
function medForm(e) {
  const d = e.data;
  const recent = [...new Set(entries((x) => x.type === 'med').map((x) => x.data.name).filter(Boolean))].slice(0, 6);
  const common = [...new Set([...recent, 'Vitamin D', 'Acetaminophen', 'Gas drops', 'Probiotic'])];
  return `<div class="field"><label for="fMed">Medicine</label><input class="input" id="fMed" value="${esc(d.name || '')}" required placeholder="e.g. Vitamin D">
      <div class="chips" style="margin-top:8px">${common.map((f) => `<button type="button" class="chip" data-fill="fMed" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</div></div>
    <div class="field"><label for="fDose">Dose ${optional}</label><input class="input" id="fDose" value="${esc(d.dose || '')}" placeholder="e.g. 1 drop, 2.5 ml"></div>
    ${timeField(e.t)}${noteField(d.note)}
    <p class="small muted">Always follow your pediatrician's dosing. Never give ibuprofen under 6 months or aspirin to children unless told to.</p>`;
}

// Temperature
function tempForm(e) {
  const d = e.data;
  const v = d.c != null ? fromC(d.c) : (prefs.temp === 'f' ? 98.6 : 37);
  return `<div class="field"><div class="label">Reading</div>${stepper('fTemp', v, prefs.temp === 'f' ? '°F' : '°C', '', 0.1)}<div id="feverWarn"></div></div>
    <div class="field"><div class="label">Method</div>${chipPick('method', TEMP_METHODS, d.method || 'Rectal')}</div>
    ${timeField(e.t)}${noteField(d.note)}`;
}
function updateFeverWarn() {
  const box = $('#feverWarn'); if (!box) return;
  const c = toC(num('fTemp'));
  const d = ageDays(baby() && baby().birth);
  let msg = '';
  if (isFever(c) && d != null && d < 90) msg = 'A temperature of 100.4°F (38°C) or higher in a baby under 3 months needs a call to your pediatrician right away.';
  else if (isFever(c)) msg = 'This is a fever. Call your pediatrician if it lasts, your baby seems very unwell, or you are worried.';
  box.innerHTML = msg ? `<div class="warn-note">${msg}</div>` : '';
}

// Checkup (growth)
function growthForm(e, editing) {
  const d = e.data;
  const lb = prefs.weight === 'lb', inch = prefs.length === 'in';
  const wLb = d.weightKg ? Math.floor(d.weightKg / KG_PER_LB) : '';
  const wOz = d.weightKg ? Math.round((d.weightKg / KG_PER_LB - Math.floor(d.weightKg / KG_PER_LB)) * 16 * 10) / 10 : '';
  const L = (cm) => cm ? (inch ? Math.round(cm / 2.54 * 10) / 10 : cm) : '';
  return `${dateField(e.t, 'Visit date')}
    <div class="field"><label>Weight</label>${lb
      ? `<div class="row"><div class="unit-input"><input class="input" id="fWlb" type="number" inputmode="decimal" step="any" value="${wLb}" placeholder="0"><span>lb</span></div><div class="unit-input"><input class="input" id="fWoz" type="number" inputmode="decimal" step="any" value="${wOz}" placeholder="0"><span>oz</span></div></div>`
      : `<div class="unit-input"><input class="input" id="fWkg" type="number" inputmode="decimal" step="any" value="${d.weightKg || ''}" placeholder="e.g. 4.25"><span>kg</span></div>`}</div>
    <div class="row">
      <div class="field"><label>Length</label><div class="unit-input"><input class="input" id="fLen" type="number" inputmode="decimal" step="any" value="${L(d.lengthCm)}"><span>${inch ? 'in' : 'cm'}</span></div></div>
      <div class="field"><label>Head</label><div class="unit-input"><input class="input" id="fHead" type="number" inputmode="decimal" step="any" value="${L(d.headCm)}"><span>${inch ? 'in' : 'cm'}</span></div></div>
    </div>
    <div class="field"><label for="fDoc">Doctor / clinic ${optional}</label><input class="input" id="fDoc" value="${esc(d.doctor || '')}" placeholder="e.g. Dr. Rossi"></div>
    ${editing ? '' : `<div class="field"><div class="label">Vaccines given today ${optional}</div>${chipPick('vax', VACCINES, [], true)}</div>`}
    <div class="field"><label for="fNext">Next appointment ${optional}</label><input class="input" id="fNext" type="datetime-local" value="${esc(d.nextAt || '')}">
      <div class="hint">We'll remind the family the evening before and that morning.</div></div>
    ${noteField(d.note, "Doctor's notes")}`;
}

// Vaccine
function vaccineForm(e) {
  const d = e.data;
  return `<div class="field"><label for="fVax">Vaccine</label><input class="input" id="fVax" value="${esc(d.name || '')}" required placeholder="e.g. DTaP">
    <div class="chips" style="margin-top:8px">${VACCINES.map((v) => `<button type="button" class="chip" data-fill="fVax" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>
    <div class="field"><label for="fDose">Dose ${optional}</label><input class="input" id="fDose" value="${esc(d.dose || '')}" placeholder="e.g. Dose 1 of 3"></div>
    ${dateField(e.t)}${noteField(d.note)}`;
}

// Milestone
function milestoneForm(e) {
  const d = e.data;
  const done = new Set(entries((x) => x.type === 'milestone').map((x) => x.data.title));
  const ideas = MILESTONES.filter((m) => !done.has(m) || m === d.title);
  return `<div class="field"><label for="fMs">Milestone</label><input class="input" id="fMs" value="${esc(d.title || '')}" required placeholder="e.g. First smile">
    <div class="chips" style="margin-top:8px">${ideas.map((v) => `<button type="button" class="chip" data-fill="fMs" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>
    ${dateField(e.t)}${noteField(d.note, 'The story')}`;
}

// Photo
function photoForm(e, editing) {
  return `${editing ? `<img class="photo-preview" src="${esc(photoUrl(e, 'full'))}" alt="">` : `
    <label class="photo-drop" for="fPhoto">
      <input type="file" id="fPhoto" accept="image/*" hidden>
      <span class="ico">${icon('i-camera')}</span>
      <b>Take or choose a photo</b><span class="small muted">One for today — or catch up on any day</span>
      <img id="photoPreview" class="photo-preview" alt="" hidden>
    </label>`}
    <div class="field"><label for="fCap">Caption ${optional}</label><input class="input" id="fCap" value="${esc(e.data.caption || '')}" placeholder="e.g. Sunday with Nonna"></div>
    ${dateField(e.t, 'Day')}
    ${editing ? `<div class="btn-row"><button type="button" class="btn btn-ghost" data-act="photo-avatar">Use as profile photo</button><a class="btn btn-ghost" href="${esc(photoUrl(e, 'full'))}" download="pomodoro-${toDateInput(e.t)}.jpg">Save</a></div>` : ''}`;
}

// Note
const noteForm = (e) => `<div class="field"><label for="fText">Note</label><textarea class="input" id="fText" rows="4" required placeholder="What happened?">${esc(e.data.text || '')}</textarea></div>${timeField(e.t)}`;

// ---------- Save ----------
async function submitLog() {
  const c = ctx(); if (!c) return;
  const e = c.entry;
  // Keep the exact timestamp unless the person changed the time (inputs only hold minutes)
  const readTime = (id, orig) => { const el = $('#' + id); return el.value === toLocalInput(orig) ? orig : fromLocalInput(el.value); };
  const t = $('#fTime') ? readTime('fTime', e.t) : $('#fDate') ? dayWithTime($('#fDate').value, e.t) : Date.now();
  const note = val('fNote');
  let data, type = c.type;
  const oz = prefs.vol === 'oz';
  const toMl = (v) => Math.round(oz ? v * ML_PER_OZ : v);
  switch (type) {
    case 'diaper':
      if (!c.pee && !c.poop) return toast('Choose pee, poop or both');
      data = { pee: c.pee, poop: c.poop, color: c.poop ? c.color : null, texture: c.poop ? c.texture : null };
      break;
    case 'bottle': {
      const ml = toMl(num('fMl'));
      if (ml <= 0) return toast('Enter an amount');
      data = { ml, milk: segValue('milk') || 'formula' };
      break;
    }
    case 'breast': {
      const L = num('fLeft') * 60, R = num('fRight') * 60;
      if (L + R <= 0) return toast('Add minutes for at least one side');
      data = { left: L, right: R, lastSide: segValue('lastside') || 'R' };
      break;
    }
    case 'sleep': {
      const end = readTime('fEnd', (e.data && e.data.end) || Date.now());
      if (end <= t) return toast('Wake-up time must be after falling asleep');
      data = { end };
      break;
    }
    case 'pump': {
      const l = toMl(num('fPL')), r = toMl(num('fPR'));
      if (l + r <= 0) return toast('Enter an amount');
      data = { left: l, right: r };
      break;
    }
    case 'solid':
      if (!val('fFood')) return toast('What did they eat?');
      data = { food: val('fFood'), amount: picked('amount')[0] || '', reaction: picked('reaction')[0] || '' };
      break;
    case 'med':
      if (!val('fMed')) return toast('Which medicine?');
      data = { name: val('fMed'), dose: val('fDose') };
      break;
    case 'temp':
      data = { c: Math.round(toC(num('fTemp')) * 100) / 100, method: picked('method')[0] || '' };
      if (data.c < 30 || data.c > 45) return toast('That reading looks off — check the number');
      break;
    case 'growth': {
      const kg = prefs.weight === 'lb' ? (num('fWlb') + num('fWoz') / 16) * KG_PER_LB : num('fWkg');
      const cm = (id) => { const v = num(id); return v ? Math.round((prefs.length === 'in' ? v * 2.54 : v) * 10) / 10 : null; };
      data = { weightKg: kg ? Math.round(kg * 1000) / 1000 : null, lengthCm: cm('fLen'), headCm: cm('fHead'), doctor: val('fDoc'), nextAt: val('fNext') };
      if (!data.weightKg && !data.lengthCm && !data.headCm && !data.doctor && !note) return toast('Add at least one measurement');
      break;
    }
    case 'vaccine':
      if (!val('fVax')) return toast('Which vaccine?');
      data = { name: val('fVax'), dose: val('fDose') };
      break;
    case 'milestone':
      if (!val('fMs')) return toast('Name the milestone');
      data = { title: val('fMs') };
      break;
    case 'photo':
      data = { caption: val('fCap') };
      break;
    case 'note':
      if (!val('fText')) return toast('Write something first');
      data = { text: val('fText') };
      break;
  }
  if (note) data.note = note;
  const rec = { id: e.id, babyId: e.babyId || store.babyId, type, t, data };

  if (type === 'photo' && !c.editing) {
    if (!c.photo) return toast('Choose a photo first');
    await savePhoto(rec, c.photo.full, c.photo.thumb);
  } else {
    if (type === 'photo') rec.data = { ...e.data, ...data };
    await saveEntry(rec);
  }
  // Vaccines ticked on a checkup become their own entries
  if (type === 'growth' && !c.editing) {
    for (const name of picked('vax')) await saveEntry({ id: uuid(), type: 'vaccine', t, data: { name } });
  }
  haptic();
  closeSheet();
  if (c.editing) toast('Updated');
  else toast(`${entryView(rec).title} saved${type === 'photo' || type === 'milestone' || type === 'growth' || type === 'vaccine' ? '' : ` · ${fmtTime(t)}`}`, async () => { await deleteEntry(rec); });
}
// Keep the original time-of-day when only a date is picked (or noon for new dates)
function dayWithTime(day, prevT) {
  const base = parseDay(day);
  const p = new Date(prevT);
  const sameDay = toDateInput(prevT) === day;
  return sameDay ? prevT : base + (p.getHours() * 60 + p.getMinutes()) * MIN || base + 12 * 60 * MIN;
}

// ---------- Timers (synced entries) ----------
async function tapSide(side) {
  const r = runningBreast();
  const now = Date.now();
  if (!r) {
    await saveEntry({ id: uuid(), type: 'breast', t: now, data: { running: true, side, sideStart: now, acc: { L: 0, R: 0 } } });
  } else {
    const d = { ...r.data, acc: { ...r.data.acc } };
    if (d.side) d.acc[d.side] += (now - d.sideStart) / 1000;
    if (d.side === side) { d.lastSide = side; d.side = null; } else { d.side = side; d.sideStart = now; }
    await saveEntry({ ...r, data: d });
  }
  haptic(8);
}
async function finishBreast() {
  const r = runningBreast(); if (!r) return;
  const tt = breastTotals(r);
  const lastSide = r.data.side || r.data.lastSide || (tt.R > tt.L ? 'R' : 'L');
  if (tt.total < 5) { await deleteEntry(r); toast('Timer discarded — too short'); return; }
  await saveEntry({ ...r, data: { left: Math.round(tt.L), right: Math.round(tt.R), lastSide } });
  haptic();
  toast(`Saved ${mins(tt.total) || '<1'} min nursing · next: ${sideName(otherSide(lastSide))}`);
}

function refreshTimerSheet() {
  const c = ctx();
  if (c && c.type === 'breast' && !c.editing) {
    const form = $('#sheetBody form');
    const keep = form ? form.outerHTML : '';
    setSheetBody(`${breastTimerCard()}<div class="or">or log it manually</div>${keep}`);
  }
  if (c && c.type === 'sleep' && !c.editing) {
    const form = $('#sheetBody form');
    setSheetBody(`${sleepTimerCard()}<div class="or">or log a past sleep</div>${form ? form.outerHTML : ''}`);
  }
}

registerActions({
  log: (el) => openLog(el.dataset.type),
  'edit-entry': (el) => {
    const e = store.entries.get(el.dataset.id);
    if (!e) return;
    if (!canEdit()) return toast('You have view-only access');
    if (e.data && e.data.running) return openLog(e.type);
    openLog(e.type, e);
  },
  'delete-entry': async () => {
    const c = ctx(); if (!c) return;
    const e = store.entries.get(c.entry.id) || c.entry;
    closeSheet();
    await deleteEntry(e);
    toast('Entry deleted', async () => { await saveEntry({ ...e, deleted: false }); });
  },
  'breast-side': async (el) => { if (!guardEdit()) return; await tapSide(el.dataset.side); refreshTimerSheet(); },
  'breast-finish': async () => { await finishBreast(); closeSheet(); },
  'breast-discard': async () => {
    if (!await confirmBox({ title: 'Discard this nursing session?', ok: 'Discard', danger: true })) return;
    const r = runningBreast(); if (r) await deleteEntry(r);
    refreshTimerSheet();
  },
  'sleep-start': async () => {
    if (!guardEdit()) return;
    await saveEntry({ id: uuid(), type: 'sleep', t: Date.now(), data: { running: true } });
    haptic(); closeSheet(); toast('Sweet dreams 🌙');
  },
  'sleep-stop': async () => {
    const r = runningSleep(); if (!r) return;
    const end = Date.now();
    if (end - r.t < 60 * 1000) { await deleteEntry(r); toast('Sleep under a minute — discarded'); closeSheet(); return; }
    await saveEntry({ ...r, data: { end } });
    haptic(); closeSheet(); toast(`Slept ${fmtDur(end - r.t)} ☀️`);
  },
  'sleep-discard': async () => {
    if (!await confirmBox({ title: 'Discard this sleep?', ok: 'Discard', danger: true })) return;
    const r = runningSleep(); if (r) await deleteEntry(r);
    refreshTimerSheet();
  },
  'photo-avatar': async () => {
    const c = ctx(); const b = baby(); if (!c || !b) return;
    await saveBaby({ ...b, avatarId: c.entry.id });
    toast(`Profile photo updated for ${b.name}`);
  }
});

// ---------- Sheet-scoped controls ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('button');
  const sheet = $('#sheet');
  if (!el || sheet.hidden || !sheet.contains(el)) return;
  const c = ctx();
  if (el.dataset.ago != null) {
    $('#' + el.dataset.for).value = toLocalInput(Date.now() - (+el.dataset.ago) * MIN);
    $$(`[data-for="${el.dataset.for}"][data-ago]`).forEach((b) => b.classList.toggle('on', b === el));
  } else if (el.dataset.toggle && c) {
    c[el.dataset.toggle] = !c[el.dataset.toggle];
    el.classList.toggle('on', c[el.dataset.toggle]);
    $('#poopDetails').hidden = !c.poop;
    setSheetTitle(diaperTitle(c));
  } else if (el.dataset.color && c) {
    c.color = c.color === el.dataset.color ? null : el.dataset.color;
    $$('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === c.color));
    updateColorWarn();
  } else if (el.dataset.texture && c) {
    c.texture = c.texture === el.dataset.texture ? null : el.dataset.texture;
    $$('[data-texture]').forEach((b) => b.classList.toggle('on', b.dataset.texture === c.texture));
  } else if (el.dataset.preset) {
    $('#' + el.dataset.for).value = el.dataset.preset;
  } else if (el.dataset.step) {
    const inp = $('#' + el.dataset.step);
    const step = parseFloat(el.dataset.s) || 1;
    const v = Math.max(0, (parseFloat(inp.value) || 0) + step * +el.dataset.d);
    inp.value = Math.round(v * 10) / 10;
    if (el.dataset.step === 'fTemp') updateFeverWarn();
  } else if (el.dataset.fill) {
    $('#' + el.dataset.fill).value = el.dataset.v;
  } else if (el.closest('[data-pick]')) {
    const group = el.closest('[data-pick]');
    if (group.hasAttribute('data-multi')) el.classList.toggle('on');
    else { const was = el.classList.contains('on'); $$('.chip', group).forEach((b) => b.classList.remove('on')); if (!was) el.classList.add('on'); }
  }
});
document.addEventListener('input', (ev) => { if (ev.target.id === 'fTemp') updateFeverWarn(); });
document.addEventListener('change', async (ev) => {
  if (ev.target.id !== 'fPhoto') return;
  const f = ev.target.files[0]; const c = ctx(); if (!f || !c) return;
  try {
    const full = await resizeImage(f, 1600, 0.85);
    const thumb = await resizeImage(f, 480, 0.78);
    c.photo = { full: full.dataUrl, thumb: thumb.dataUrl };
    const img = $('#photoPreview'); img.src = thumb.dataUrl; img.hidden = false;
    $('.photo-drop').classList.add('has-photo');
    // Use the photo's own date when available
    if (f.lastModified && !c.editing && Date.now() - f.lastModified < 400 * 864e5) $('#fDate').value = toDateInput(f.lastModified);
  } catch (e) { toast(e.message); }
});
document.addEventListener('submit', (ev) => {
  if (ev.target.dataset.form === 'log') { ev.preventDefault(); submitLog().catch((e) => toast(e.message)); }
});
