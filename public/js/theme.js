// Six Italian-inspired themes × light/dark. Colours, fonts & patterns live in style.css under [data-skin].
import { $ } from './util.js';
import { prefs, setPref } from './prefs.js';
import { openSheet, setSheetBody, closeSheet, registerActions } from './ui.js';
import { sceneHtml } from './scenes.js';

export const SKINS = [
  { id: 'pomodoro', name: 'Pomodoro', tag: 'Tomato red & Aperol sunset', font: 'Outfit + Inter', dots: ['#E8412C', '#FF8A1F', '#F4F5F7', '#0F1115'] },
  { id: 'positano', name: 'Positano', tag: 'Cobalt sea & majolica waves', font: 'Plus Jakarta Sans', dots: ['#1238B8', '#22B3D6', '#F2F6FC', '#FFFFFF'] },
  { id: 'limone', name: 'Limone', tag: 'Amalfi lemons & leaf green', font: 'Sora + DM Sans', dots: ['#FFD12E', '#2F7A3E', '#F5F7F2', '#1E2A14'] },
  { id: 'milano', name: 'Milano', tag: 'Black, white & gold — editorial', font: 'Instrument Serif + Onest', dots: ['#0E0E0E', '#D8B871', '#F6F6F6', '#FFFFFF'] },
  { id: 'toscana', name: 'Toscana', tag: 'Terracotta, olive & sage', font: 'Bricolage Grotesque + Figtree', dots: ['#B5432A', '#D0683C', '#8F9B5A', '#F4F5F1'] },
  { id: 'autumn', name: 'Autumn', tag: 'Maple, pumpkin & falling leaves', font: 'Fraunces + Figtree', dots: ['#7F2A17', '#D86F1F', '#E9A43A', '#B23A50'] },
  { id: 'gelato', name: 'Gelato', tag: 'Strawberry & pistachio pastels', font: 'Fredoka + Nunito', dots: ['#FFB8CF', '#C8EFB4', '#E8457A', '#FBF7FA'] }
];
export const skinOf = (id) => SKINS.find((k) => k.id === id) || SKINS[0];

export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  const skin = skinOf(prefs.skin).id;
  root.setAttribute('data-skin', skin);
  if (window.loadSkinFonts) window.loadSkinFonts(skin);
  const meta = $('#themeColor');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#F4F5F7');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('pomo:theme', applyTheme);

export const isDark = () => document.documentElement.dataset.theme === 'dark' ||
  (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

function themeSheetHtml() {
  return `
    <div class="skins">
      ${SKINS.map((k) => `<button type="button" class="skin ${prefs.skin === k.id ? 'on' : ''}" data-skin="${k.id}" data-act="pick-skin" data-id="${k.id}" aria-pressed="${prefs.skin === k.id}">
        <div class="skin-hero">
          <svg aria-hidden="true"><rect width="100%" height="100%"/></svg>
          ${sceneHtml(k.id)}
          ${prefs.skin === k.id ? '<span class="skin-check">✓</span>' : ''}
          <div class="skin-name">${k.name}</div>
        </div>
        <div class="skin-meta">
          <div class="skin-tag">${k.tag}</div>
          <div class="skin-font">${k.font}</div>
          <div class="skin-dots">${k.dots.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
        </div>
      </button>`).join('')}
    </div>
    <div class="field" style="margin:20px 0 6px"><div class="label">Appearance</div>
      <div class="seg">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button type="button" data-act="pick-mode" data-v="${v}" class="${prefs.theme === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <button type="button" class="btn btn-primary btn-block" style="margin-top:12px" data-act="close-sheet">Done</button>`;
}

export function openThemes() {
  SKINS.forEach((k) => window.loadSkinFonts && window.loadSkinFonts(k.id));
  openSheet({ eyebrow: 'Make it yours', title: 'Themes', html: themeSheetHtml(), context: { kind: 'themes' } });
}

// The new theme grows out of the tapped control as a circle (View Transitions), with a quiet fallback.
function reveal(el, apply) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(); return; }
  const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(apply);
  t.ready.then(() => document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
    { duration: 720, easing: 'cubic-bezier(.2, .8, .2, 1)', pseudoElement: '::view-transition-new(root)' }
  )).catch(() => {});
}

registerActions({
  themes: openThemes,
  'close-sheet': closeSheet,
  'pick-skin': (el) => reveal(el, () => { setPref('skin', el.dataset.id); applyTheme(); setSheetBody(themeSheetHtml()); window.dispatchEvent(new Event('pomo:render')); }),
  'pick-mode': (el) => reveal(el, () => { setPref('theme', el.dataset.v); applyTheme(); setSheetBody(themeSheetHtml()); window.dispatchEvent(new Event('pomo:render')); }),
  'toggle-dark': (el) => reveal(el, () => { setPref('theme', isDark() ? 'light' : 'dark'); applyTheme(); window.dispatchEvent(new Event('pomo:render')); })
});
