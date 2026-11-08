// Animated hero scenes — one hand-built SVG world per theme.
// Motion is CSS-only (transform / opacity), loops seamlessly, pauses when the app is hidden,
// and stands still for people who prefer reduced motion. Styles live in style.css under .scene-*.
import { leavesHtml } from './ui.js';

const svg = (inner, cls = '') => `<svg class="scene-svg ${cls}" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;

// A seamless wave: drawn twice as wide as the view and slid by half its width
const wave = (y, amp, len) => {
  let d = `M0 ${y}`;
  for (let x = 0; x < 800; x += len) d += ` q ${len / 4} ${-amp} ${len / 2} 0 t ${len / 2} 0`;
  return `${d} V 260 H 0 Z`;
};
// Rolling hills, also seamless at 800 wide
const hills = (y, amp, len) => {
  let d = `M0 ${y}`;
  for (let x = 0; x < 800; x += len) d += ` c ${len * 0.25} ${-amp} ${len * 0.75} ${-amp} ${len} 0`;
  return `${d} V 260 H 0 Z`;
};
const MAPLE = 'M12 1.8l1.5 3.4 2.4-1.1-.5 3.1 3.1-.6-1.2 2.4 3.3 1.3-3 1.6.8 2.3-3.4-.7-.4 2.4-2.1-1.6V22h-1v-6.7l-2.1 1.6-.4-2.4-3.4.7.8-2.3-3-1.6 3.3-1.3-1.2-2.4 3.1.6-.5-3.1 2.4 1.1z';
const LEAF = 'M0 0c6-6 16-6 22 0-6 6-16 6-22 0z';

const SCENES = {
  // Sunlit Italian garden: breathing sun, drifting light motes, a ripe tomato vine swaying
  pomodoro: () => svg(`
    <defs>
      <radialGradient id="pg-sun"><stop offset="0" stop-color="#FFE7B0" stop-opacity=".95"/><stop offset=".35" stop-color="#FFC27A" stop-opacity=".45"/><stop offset="1" stop-color="#FFB060" stop-opacity="0"/></radialGradient>
      <radialGradient id="pg-tom" cx=".35" cy=".35"><stop offset="0" stop-color="#FF7A5C"/><stop offset=".6" stop-color="#E23A22"/><stop offset="1" stop-color="#B8261A"/></radialGradient>
    </defs>
    <circle class="sc-breathe" cx="345" cy="40" r="120" fill="url(#pg-sun)"/>
    <g class="sc-motes" fill="#FFF6E0">
      ${[[40, 230, 2.4, 0], [90, 250, 1.6, 3], [150, 240, 2, 6], [210, 255, 1.4, 1.5], [260, 235, 2.2, 4.5], [320, 250, 1.8, 7.5], [120, 220, 1.2, 9], [380, 230, 1.5, 2]]
        .map(([x, y, r, d]) => `<circle class="sc-mote" cx="${x}" cy="${y}" r="${r}" style="animation-delay:-${d}s"/>`).join('')}
    </g>
    <g class="sc-vine">
      <path d="M402 -4 C 372 40, 386 86, 352 124 S 330 190, 344 236" fill="none" stroke="#2F7A3A" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
      <g fill="#3E9A4A" opacity=".95">
        <path d="${LEAF}" transform="translate(378 42) rotate(150) scale(1.1)"/>
        <path d="${LEAF}" transform="translate(356 104) rotate(20)"/>
        <path d="${LEAF}" transform="translate(340 168) rotate(160) scale(.9)"/>
      </g>
      <g class="sc-swing" style="animation-delay:-1.5s"><line x1="356" y1="122" x2="356" y2="140" stroke="#2F7A3A" stroke-width="2"/><circle cx="356" cy="152" r="14" fill="url(#pg-tom)"/><path d="M349 139l7 4 7-4-3 6h-8z" fill="#2F7A3A"/><ellipse cx="351" cy="147" rx="3.4" ry="2" fill="#fff" opacity=".55"/></g>
      <g class="sc-swing" style="animation-delay:-3.2s"><line x1="342" y1="196" x2="342" y2="210" stroke="#2F7A3A" stroke-width="2"/><circle cx="342" cy="221" r="11" fill="url(#pg-tom)"/><path d="M336 210l6 3 6-3-2 5h-8z" fill="#2F7A3A"/><ellipse cx="338" cy="217" rx="2.6" ry="1.6" fill="#fff" opacity=".55"/></g>
    </g>`, 'scene-pomodoro'),

  // Amalfi coast: parallax sea, bobbing sailboat, glints and gliding gulls
  positano: () => svg(`
    <defs><radialGradient id="ps-sun"><stop offset="0" stop-color="#FFF4C9"/><stop offset=".25" stop-color="#FFE38A" stop-opacity=".8"/><stop offset="1" stop-color="#FFE38A" stop-opacity="0"/></radialGradient></defs>
    <circle class="sc-breathe" cx="330" cy="58" r="70" fill="url(#ps-sun)" opacity=".85"/>
    <circle cx="330" cy="58" r="15" fill="#FFF7DA" opacity=".95"/>
    <g class="sc-gull" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85">
      <path d="M0 0q5-5 10 0q5-5 10 0" transform="translate(0 40)"/>
      <path d="M0 0q4-4 8 0q4-4 8 0" transform="translate(26 54)"/>
    </g>
    <g class="sc-wave sc-w3"><path d="${wave(196, 6, 100)}" fill="#fff" opacity=".16"/></g>
    <g class="sc-boat"><path d="M300 192h34l-5 7h-24z" fill="#fff"/><path d="M316 190V160l16 26z" fill="#fff" opacity=".95"/><path d="M314 190V168l-11 20z" fill="#FFE2A8" opacity=".95"/></g>
    <g class="sc-wave sc-w2"><path d="${wave(212, 7, 400 / 3)}" fill="#fff" opacity=".22"/></g>
    <g class="sc-wave sc-w1"><path d="${wave(230, 8, 200)}" fill="#fff" opacity=".32"/></g>
    <g fill="#fff">${[[60, 222], [140, 236], [205, 214], [255, 240], [372, 226], [110, 248]].map(([x, y], i) => `<path class="sc-glint" d="M${x} ${y - 3}l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" style="animation-delay:-${i * 0.7}s"/>`).join('')}</g>`, 'scene-positano'),

  // Lemon grove: dappled sunlight drifting, a lemon branch swaying on the breeze
  limone: () => svg(`
    <defs>
      <radialGradient id="lm-dap"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="lm-fruit" cx=".35" cy=".3"><stop offset="0" stop-color="#FFF6A8"/><stop offset=".55" stop-color="#FFD83A"/><stop offset="1" stop-color="#E9AE00"/></radialGradient>
    </defs>
    <g class="sc-rays" opacity=".22">${Array.from({ length: 12 }, (_, i) => `<path d="M0 0L-9 -260L9 -260Z" fill="#fff" transform="rotate(${i * 30})"/>`).join('')}</g>
    <circle class="sc-dapple" cx="70" cy="200" r="70" fill="url(#lm-dap)"/>
    <circle class="sc-dapple" cx="230" cy="230" r="90" fill="url(#lm-dap)" style="animation-delay:-6s"/>
    <circle class="sc-dapple" cx="150" cy="60" r="55" fill="url(#lm-dap)" style="animation-delay:-11s"/>
    <g class="sc-branch">
      <path d="M410 -6 C 380 22, 352 30, 312 48 S 262 70, 246 92" fill="none" stroke="#6B4B21" stroke-width="3.4" stroke-linecap="round"/>
      <g fill="#2F7A3E">
        <path d="${LEAF}" transform="translate(386 18) rotate(160) scale(1.25)"/><path d="${LEAF}" transform="translate(350 36) rotate(40) scale(1.2)"/>
        <path d="${LEAF}" transform="translate(316 50) rotate(150) scale(1.15)"/><path d="${LEAF}" transform="translate(280 66) rotate(30) scale(1.1)"/>
        <path d="${LEAF}" transform="translate(252 88) rotate(170)"/>
      </g>
      <g fill="#3F9A50" opacity=".9"><path d="${LEAF}" transform="translate(366 30) rotate(100) scale(.9)"/><path d="${LEAF}" transform="translate(300 60) rotate(80) scale(.9)"/></g>
      <g class="sc-swing" style="animation-delay:-.8s"><ellipse cx="334" cy="66" rx="13" ry="17" fill="url(#lm-fruit)"/><ellipse cx="330" cy="60" rx="3" ry="4.5" fill="#fff" opacity=".55"/></g>
      <g class="sc-swing" style="animation-delay:-2.4s"><ellipse cx="292" cy="84" rx="11" ry="14.5" fill="url(#lm-fruit)"/><ellipse cx="289" cy="79" rx="2.5" ry="3.8" fill="#fff" opacity=".55"/></g>
      <g class="sc-swing" style="animation-delay:-3.6s"><ellipse cx="258" cy="108" rx="10" ry="13" fill="url(#lm-fruit)"/><ellipse cx="255" cy="103" rx="2.2" ry="3.4" fill="#fff" opacity=".55"/></g>
    </g>`, 'scene-limone'),

  // Milanese editorial: a gold frame that draws itself, foil shimmer, drifting pinstripes
  milano: () => svg(`
    <defs>
      <linearGradient id="ml-sheen" x1="0" x2="1"><stop offset="0" stop-color="#D8B871" stop-opacity="0"/><stop offset=".5" stop-color="#F5E3B3" stop-opacity=".55"/><stop offset="1" stop-color="#D8B871" stop-opacity="0"/></linearGradient>
      <pattern id="ml-pin" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#D8B871" stroke-width=".7"/></pattern>
    </defs>
    <g class="sc-drift"><rect x="-200" y="-40" width="800" height="340" fill="url(#ml-pin)" opacity=".16"/></g>
    <g class="sc-sheen"><rect x="-140" y="-40" width="120" height="340" fill="url(#ml-sheen)" transform="skewX(-20)"/></g>
    <g fill="none" stroke="#D8B871" stroke-width=".9">
      <rect class="sc-draw" x="12" y="12" width="376" height="236" rx="4" pathLength="1"/>
      <path class="sc-draw sc-d2" pathLength="1" d="M22 40V22h18M360 22h18v18M378 220v18h-18M40 238H22v-18"/>
    </g>
    <g fill="#D8B871"><circle cx="200" cy="12" r="2.2"/><path d="M200 5l2.5 7-2.5 7-2.5-7z" opacity=".8"/></g>`, 'scene-milano'),

  // Tuscan hills at golden hour: low sun, drifting hills, swaying cypresses, birds
  toscana: () => svg(`
    <defs><radialGradient id="ts-sun"><stop offset="0" stop-color="#FFE2B0"/><stop offset=".3" stop-color="#FFC27A" stop-opacity=".55"/><stop offset="1" stop-color="#FFB060" stop-opacity="0"/></radialGradient></defs>
    <circle class="sc-breathe" cx="300" cy="150" r="110" fill="url(#ts-sun)"/>
    <circle cx="300" cy="150" r="24" fill="#FFE6BC" opacity=".9"/>
    <g class="sc-gull" stroke="#5A2A18" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".55">
      <path d="M0 0q4-4 8 0q4-4 8 0" transform="translate(0 70)"/><path d="M0 0q3-3 6 0q3-3 6 0" transform="translate(20 80)"/><path d="M0 0q3-3 6 0q3-3 6 0" transform="translate(-14 84)"/>
    </g>
    <g class="sc-wave sc-h3"><path d="${hills(186, 34, 200)}" fill="#E7B48A" opacity=".55"/></g>
    <g class="sc-wave sc-h2"><path d="${hills(206, 30, 400 / 3)}" fill="#C98B5C" opacity=".5"/></g>
    <g fill="#3F4A26">${[[70, 196, 1], [88, 200, .8], [104, 197, .9], [246, 206, 1.05], [262, 209, .8], [340, 200, .95]].map(([x, y, s], i) => `<g class="sc-cypress" style="animation-delay:-${i * 0.9}s"><path d="M${x} ${y}c-6-12-6-34 0-${48 * s}c6 ${48 * s - 34} 6 36 0 ${48 * s}z"/></g>`).join('')}</g>
    <g class="sc-wave sc-h1"><path d="${hills(226, 22, 400)}" fill="#8E9B5A" opacity=".62"/></g>`, 'scene-toscana'),

  // Autumn: warm bokeh, a swaying branch, and wind-blown leaves with depth
  autumn: () => svg(`
    <defs><radialGradient id="au-bok"><stop offset="0" stop-color="#FFD9A0" stop-opacity=".6"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient></defs>
    ${[[60, 70, 34], [180, 40, 22], [300, 110, 40], [120, 200, 26], [370, 210, 30]].map(([x, y, r], i) => `<circle class="sc-bokeh" cx="${x}" cy="${y}" r="${r}" fill="url(#au-bok)" style="animation-delay:-${i * 1.7}s"/>`).join('')}
    <g class="sc-branch-l">
      <path d="M-8 18 C 30 26, 64 22, 96 40 S 140 62, 160 58" fill="none" stroke="#4A2410" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <g opacity=".95">
        <path d="${MAPLE}" fill="#F2A33A" transform="translate(40 18) rotate(160) scale(1.05)"/>
        <path d="${MAPLE}" fill="#E06A24" transform="translate(84 36) rotate(-160) scale(.9)"/>
        <path d="${MAPLE}" fill="#B8341C" transform="translate(126 52) rotate(170) scale(.85)"/>
      </g>
    </g>
    <g class="sc-far" opacity=".45">${[[30, 0], [110, -4], [200, -8], [290, -2], [360, -6]].map(([x, d]) => `<g class="sc-farleaf" style="animation-delay:${d}s"><path d="${MAPLE}" fill="#FFE2B8" transform="translate(${x} -20) scale(.45)"/></g>`).join('')}</g>`, 'scene-autumn') + leavesHtml(),

  // Gelateria: soft pastel blobs morphing, sprinkles floating up, little sparkles
  gelato: () => `<div class="sc-blobs" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>` + svg(`
    <g>${[['#E8457A', 40, 0], ['#6CC070', 95, -3], ['#FFB020', 150, -6], ['#5AA7F5', 205, -1.5], ['#FFFFFF', 260, -4.5], ['#E8457A', 315, -7.5], ['#6CC070', 370, -2.5], ['#FFB020', 70, -9], ['#5AA7F5', 340, -10.5]]
      .map(([c, x, d]) => `<rect class="sc-sprinkle" x="${x}" y="270" width="10" height="3.4" rx="1.7" fill="${c}" style="animation-delay:${d}s"/>`).join('')}</g>
    <g fill="#fff">${[[60, 50], [300, 40], [360, 120], [120, 140]].map(([x, y], i) => `<path class="sc-glint" d="M${x} ${y - 5}l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z" style="animation-delay:-${i * 0.9}s"/>`).join('')}</g>`, 'scene-gelato')
};

export function sceneHtml(skin) {
  const make = SCENES[skin] || SCENES.pomodoro;
  return `<div class="scene" data-scene="${skin}">${make()}</div>`;
}
