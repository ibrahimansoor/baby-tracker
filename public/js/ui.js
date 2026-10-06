// Shared UI: bottom sheet, toast, confirm dialog, avatars, action registry.
import { $, esc, icon, initials } from './util.js';

// ---------- Action registry (event delegation via data-act) ----------
const actions = {};
export const registerActions = (map) => Object.assign(actions, map);
export function runAction(name, el, ev) {
  const fn = actions[name];
  if (!fn) return false;
  Promise.resolve(fn(el, ev)).catch((e) => toast(e.message || 'Something went wrong'));
  return true;
}

// ---------- Sheet ----------
// Pin the page where it is while a sheet is open (iOS ignores overflow:hidden on body),
// then put it back exactly — so opening Breastfeed etc. never makes the screen jump.
let lockedY = 0;
function lockScroll() {
  lockedY = window.scrollY;
  document.body.style.top = `-${lockedY}px`;
  document.body.classList.add('sheet-open');
}
function unlockScroll() {
  if (!document.body.classList.contains('sheet-open')) return;
  document.body.classList.remove('sheet-open');
  document.body.style.top = '';
  window.scrollTo(0, lockedY);
}
let sheetCtx = null;
let onClose = null;
export const sheetOpen = () => !$('#sheet').hidden;
export const ctx = () => sheetCtx;

export function openSheet({ eyebrow = '', title = '', html = '', context = null, closed = null, wide = false }) {
  sheetCtx = context;
  onClose = closed;
  $('#sheetEyebrow').textContent = eyebrow;
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = html;
  const sheet = $('#sheet');
  sheet.classList.toggle('wide', wide);
  if (sheet.hidden) lockScroll();
  sheet.hidden = false; $('#scrim').hidden = false;
  sheet.scrollTop = 0;
}
export function setSheetBody(html) { $('#sheetBody').innerHTML = html; }
export function setSheetTitle(t) { $('#sheetTitle').textContent = t; }
export function closeSheet() {
  if (!sheetOpen()) return;
  $('#sheet').hidden = true; $('#scrim').hidden = true;
  $('#sheetBody').innerHTML = '';
  unlockScroll();
  sheetCtx = null;
  const cb = onClose; onClose = null;
  if (cb) cb();
}

// ---------- Confirm (sheet-styled) ----------
let confirmResolve = null;
export function confirmBox({ title, message = '', ok = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const box = $('#confirm');
    box.innerHTML = `<div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="cfT">
      <h3 id="cfT">${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}
      <div class="btn-row"><button class="btn btn-ghost" data-cf="0">Cancel</button><button class="btn ${danger ? 'btn-red' : 'btn-primary'}" data-cf="1">${esc(ok)}</button></div>
    </div>`;
    box.hidden = false;
    confirmResolve = resolve;
    $('[data-cf="1"]', box).focus();
  });
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-cf]');
  if (b || ev.target.id === 'confirm') {
    $('#confirm').hidden = true;
    if (confirmResolve) { confirmResolve(b ? b.dataset.cf === '1' : false); confirmResolve = null; }
  }
});

// ---------- Toast ----------
let toastTimer;
export function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) $('button', el).onclick = () => { undo(); el.classList.remove('show'); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2800);
}

export const haptic = (ms = 12) => { if (navigator.vibrate) navigator.vibrate(ms); };

// ---------- Avatars ----------
export function avatar({ name, url, size = 40, cls = '' }) {
  return url
    ? `<span class="avatar ${cls}" style="--sz:${size}px"><img src="${esc(url)}" alt="" loading="lazy"></span>`
    : `<span class="avatar ${cls}" style="--sz:${size}px"><span>${esc(initials(name))}</span></span>`;
}

// ---------- Small form helpers ----------
export const field = (label, inner, hint = '') => `<div class="field"><label>${label}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
export const optional = '<span class="muted" style="font-weight:500">(optional)</span>';
export const emptyState = (title, text, ico = 'i-tomato') => `<div class="empty">${icon(ico)}<p class="it">${esc(title)}</p><p class="small">${text}</p></div>`;

export function segmented(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(value) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
export const segValue = (name, root = document) => { const b = root.querySelector(`[data-seg="${name}"] .on`); return b ? b.dataset.v : null; };
// Segmented controls toggle themselves
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-seg] > button');
  if (!b) return;
  b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  b.parentElement.dispatchEvent(new CustomEvent('segchange', { bubbles: true, detail: b.dataset.v }));
});
