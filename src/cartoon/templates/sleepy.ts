import { CartoonTemplateManifest } from '../types';

/**
 * SLEEPY — Cartoon Reactions Template
 * Chibi character curled up fast asleep in a cosy quilted blanket with pillow, moon, stars, and ZZZ.
 */
export const SLEEPY_BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="slPillowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#D6E4FF"/>
    </linearGradient>
    <linearGradient id="slBlanketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#9381FF"/>
      <stop offset="50%" stop-color="#7251B2"/>
      <stop offset="100%" stop-color="#4D2D91"/>
    </linearGradient>
    <linearGradient id="slMoonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFF3B0"/>
      <stop offset="100%" stop-color="#FFD166"/>
    </linearGradient>
    <linearGradient id="slZzzGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#9BF6FF"/>
      <stop offset="100%" stop-color="#3A86FF"/>
    </linearGradient>
  </defs>

  <!-- 1. CRESCENT MOON, SLEEPY STARS & ZZZ -->
  <g id="sl-sky-elements">
    <!-- Crescent Moon (Top Left) -->
    <path d="M 210,130 C 170,140 140,175 140,220 C 140,285 195,335 260,335 C 290,335 320,320 335,300 C 275,300 225,250 225,190 C 225,165 235,145 250,130 C 235,128 222,128 210,130 Z"
          fill="url(#slMoonGrad)" stroke="#1E1E24" stroke-width="8" stroke-linejoin="round"/>

    <!-- Cute Nightcap Stars -->
    <path d="M 285,160 Q 295,160 295,150 Q 295,160 305,160 Q 295,160 295,170 Q 295,160 285,160 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
    <path d="M 170,290 Q 180,290 180,280 Q 180,290 190,290 Q 180,290 180,300 Q 180,290 170,290 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>
    <path d="M 870,330 Q 880,330 880,320 Q 880,330 890,330 Q 880,330 880,340 Q 880,330 870,330 Z" fill="#FFE600" stroke="#1E1E24" stroke-width="3"/>

    <!-- Ascending "Z Z Z" Floating Letters (Top Right) -->
    <!-- Small 'z' -->
    <path d="M 680,260 L 720,260 L 685,305 L 725,305" fill="none" stroke="url(#slZzzGrad)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 680,260 L 720,260 L 685,305 L 725,305" fill="none" stroke="#1E1E24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Medium 'Z' -->
    <path d="M 740,190 L 795,190 L 745,250 L 800,250" fill="none" stroke="url(#slZzzGrad)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 740,190 L 795,190 L 745,250 L 800,250" fill="none" stroke="#1E1E24" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Large 'Z' -->
    <path d="M 810,105 L 880,105 L 815,180 L 885,180" fill="none" stroke="url(#slZzzGrad)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 810,105 L 880,105 L 815,180 L 885,180" fill="none" stroke="#1E1E24" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- 2. "SLEEPY" HEADER BANNER -->
  <g id="sl-caption">
    <rect x="360" y="70" width="300" height="75" rx="37" fill="#4A4E69" stroke="#1E1E24" stroke-width="9"/>
    <rect x="365" y="75" width="290" height="65" rx="32" fill="#22223B"/>
    <text x="510" y="122"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="48"
          text-anchor="middle"
          letter-spacing="5"
          fill="#CAE9FF"
          stroke="#1E1E24"
          stroke-width="8"
          stroke-linejoin="round"
          paint-order="stroke fill">SLEEPY</text>
    <text x="510" y="122"
          font-family="system-ui, -apple-system, sans-serif, 'Impact', 'Arial Black'"
          font-weight="900"
          font-size="48"
          text-anchor="middle"
          letter-spacing="5"
          fill="#FFFFFF">SLEEPY</text>
  </g>

  <!-- 3. FLUFFY GIANT PILLOW (Behind Head) -->
  <g id="sl-pillow">
    <!-- Ground Shadow -->
    <ellipse cx="512" cy="940" rx="320" ry="30" fill="#000000" opacity="0.18"/>

    <!-- Puffy Pillow Body -->
    <path d="M 260,340 C 280,240 700,240 730,340 C 760,440 740,580 710,640 C 670,700 290,700 270,620 C 240,540 240,420 260,340 Z"
          fill="url(#slPillowGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Pillow tuft creases and shadows -->
    <path d="M 285,370 C 330,420 360,430 400,430" fill="none" stroke="#BAC7E5" stroke-width="7" stroke-linecap="round"/>
    <path d="M 695,370 C 655,420 625,430 590,430" fill="none" stroke="#BAC7E5" stroke-width="7" stroke-linecap="round"/>
    <path d="M 280,580 C 330,560 370,555 420,560" fill="none" stroke="#BAC7E5" stroke-width="7" stroke-linecap="round"/>
    <path d="M 690,580 C 640,560 610,555 570,560" fill="none" stroke="#BAC7E5" stroke-width="7" stroke-linecap="round"/>

    <!-- Pillow Head Dent (Dark well where head rests) -->
    <ellipse cx="490" cy="460" rx="140" ry="85" fill="#BAC7E5" opacity="0.6"/>
  </g>

  <!-- 4. LOWER CURLED BODY UNDER COSY BLANKET (Back Silhouette) -->
  <g id="sl-curled-body-back">
    <!-- Curled legs / feet bump in blanket -->
    <path d="M 250,620 C 210,670 210,780 260,840 C 320,910 650,920 740,860 C 810,810 820,730 770,650 C 730,590 620,560 512,560 C 400,560 300,580 250,620 Z"
          fill="url(#slBlanketGrad)" stroke="#1E1E24" stroke-width="12" stroke-linejoin="round"/>
  </g>
</svg>`;

/**
 * Layer 3 — Front SVG
 * Quilted blanket fold with warm fluffy lining tucked snugly under character's chin.
 */
export const SLEEPY_FRONT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="slFoldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
    <linearGradient id="slQuiltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B8A5FE"/>
      <stop offset="100%" stop-color="#7251B2"/>
    </linearGradient>
  </defs>

  <g id="sl-front-quilt-and-hand">
    <!-- Fluffy white fleece blanket top rim (tucks tightly under chin Y=520-560) -->
    <path d="M 330,525 C 380,510 440,545 490,545 C 550,545 610,510 670,530 C 690,560 670,600 640,615 C 570,625 420,625 350,605 C 320,590 310,550 330,525 Z"
          fill="url(#slFoldGrad)" stroke="#1E1E24" stroke-width="10" stroke-linejoin="round"/>

    <!-- Fleece stitches along the rim -->
    <path d="M 360,570 C 430,585 550,585 630,565" fill="none" stroke="#A0AEC0" stroke-width="4" stroke-dasharray="10 8" stroke-linecap="round"/>

    <!-- Main Front Quilted Blanket Body -->
    <path d="M 280,585 C 350,620 620,620 720,585 C 780,630 810,720 780,820 C 740,900 350,910 260,830 C 220,770 230,650 280,585 Z"
          fill="url(#slQuiltGrad)" stroke="#1E1E24" stroke-width="11" stroke-linejoin="round"/>

    <!-- Quilted Cross-Stitch Geometry Pattern -->
    <path d="M 340,630 L 660,870" fill="none" stroke="#5B3E96" stroke-width="6" stroke-linecap="round"/>
    <path d="M 440,615 L 740,815" fill="none" stroke="#5B3E96" stroke-width="6" stroke-linecap="round"/>
    <path d="M 280,690 L 530,890" fill="none" stroke="#5B3E96" stroke-width="6" stroke-linecap="round"/>

    <path d="M 640,615 L 340,855" fill="none" stroke="#5B3E96" stroke-width="6" stroke-linecap="round"/>
    <path d="M 720,670 L 460,890" fill="none" stroke="#5B3E96" stroke-width="6" stroke-linecap="round"/>
    <path d="M 520,615 L 260,800" fill="none" stroke="#5B3E96" stroke-width="6" stroke-linecap="round"/>

    <!-- Little Sleeping Hand Peeking Over Blanket -->
    <!-- Chubby sleepy fist curled at chin -->
    <ellipse cx="610" cy="545" rx="26" ry="22" fill="#FFFFFF" stroke="#1E1E24" stroke-width="9"/>
    <path d="M 598,540 C 606,552 616,555 625,550" fill="none" stroke="#1E1E24" stroke-width="5" stroke-linecap="round"/>
    <!-- Pajama cuff -->
    <rect x="620" y="535" width="22" height="20" rx="8" fill="#9BF6FF" stroke="#1E1E24" stroke-width="6"/>
  </g>
</svg>`;

export const SLEEPY_TEMPLATE: CartoonTemplateManifest = {
  id: 'sleepy-06',
  name: 'SLEEPY',
  description: 'Chibi character curled up fast asleep in a cosy quilted blanket with pillow, stars and ZZZ',
  canvas: {
    width: 1024,
    height: 1024
  },
  layers: {
    backSvg: SLEEPY_BACK_SVG,
    frontSvg: SLEEPY_FRONT_SVG
  },
  headSlot: {
    centerX: 0.48, // 490px
    centerY: 0.42, // 430px (head tilted into pillow)
    targetWidth: 0.42, // 430px
    targetEyeAngleDegrees: -8, // Natural gentle sleeping tilt
    targetEyeY: 0.42,
    targetEyeDistance: 0.10,
    targetChinY: 0.52, // 532px rests on quilted fleece rim
    targetFaceH: 0.25,
    neckAnchorX: 0.49,
    neckAnchorY: 0.55,
    collarOverlapY: 0.05,
    hairExtentRatio: 0.70,
    hairLayering: 'behind',
    defaultScale: 1.0,
    defaultRotation: -8
  },
  category: 'Status',
  tags: ['sleepy', 'tired', 'bedtime', 'night', 'pillow', 'blanket', 'zzz', 'nap']
};
